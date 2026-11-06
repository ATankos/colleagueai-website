/**
 * api/download.js - Gated download endpoint
 *
 * GET /api/download?t=<token>
 *
 * The token (lib/downloadToken.js) seals the buyer's email, slug, file and expiry, so the URL
 * carries no personal data. Order of checks:
 *   1. DOWNLOAD_TOKEN_SECRET must be set. This fails closed: nothing is served without it.
 *   2. The token must open, untampered and unexpired.
 *   3. The email must have an entitlement for this slug (KV).
 * Then the file is served (lib/storage.js):
 *   - Release package: redirect to a signed, time-limited URL in private storage
 *     (Vercel Private Blob, or Cloudflare R2). No storage configured -> 503, never a stand-in.
 *   - Dossier: with storage configured, redirect to the public dossier under /docs/agents/;
 *     without it (test setup), stream a small placeholder PDF so the flow works end to end.
 */

import { isEntitled } from '../lib/db.js';
import { openDownload } from '../lib/downloadToken.js';
import { allowedFilesFor, packageFile, packageDeliverable, canonicalSlug, productFor } from '../lib/products.js';
import { storageDriver, signedDownloadUrl } from '../lib/storage.js';

function valueOf(input) {
  return Array.isArray(input) ? input[0] : input;
}

// Minimal, valid single-page PDF with correct xref offsets (no dependencies).
function placeholderPdf(slug) {
  const safe = String(slug).replace(/[()\\]/g, ' ');
  const text =
    'BT /F1 20 Tf 60 250 Td (ColleagueAI - test package) Tj ' +
    '/F1 12 Tf 0 -34 Td (Agent: ' + safe + ') Tj ' +
    '0 -20 Td (This is a placeholder deliverable for the checkout test.) Tj ' +
    '0 -20 Td (Real files are served from R2 once configured.) Tj ET';
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 340] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    '<< /Length ' + text.length + ' >>\nstream\n' + text + '\nendstream',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [];
  objs.forEach((body, i) => {
    offsets.push(pdf.length);
    pdf += (i + 1) + ' 0 obj\n' + body + '\nendobj\n';
  });
  const xrefStart = pdf.length;
  pdf += 'xref\n0 ' + (objs.length + 1) + '\n0000000000 65535 f \n';
  offsets.forEach((off) => { pdf += String(off).padStart(10, '0') + ' 00000 n \n'; });
  pdf += 'trailer\n<< /Size ' + (objs.length + 1) + ' /Root 1 0 R >>\nstartxref\n' + xrefStart + '\n%%EOF';
  return Buffer.from(pdf, 'latin1');
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).end('Method not allowed');
  }

  // Fail closed: without the signing secret nothing can be opened, so nothing is served.
  if (!process.env.DOWNLOAD_TOKEN_SECRET) {
    console.error('[download] DOWNLOAD_TOKEN_SECRET not set - refusing to serve downloads');
    return res.status(503).json({ error: 'Downloads are not configured' });
  }
  // Email, slug and file come from inside the sealed token, never from the URL.
  const claims = openDownload(valueOf(req.query.t));
  if (!claims.ok) {
    return res.status(403).json({ error: 'Invalid download token', reason: claims.reason });
  }
  const { email, slug, file } = claims;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(403).json({ error: 'Invalid download token', reason: 'bad-token' });
  }
  // The token is issued for the slug as it was sold; everything else uses the current slug, so
  // links issued before a product rename keep working (isEntitled accepts the retired slug too).
  const canon = canonicalSlug(slug);
  if (!allowedFilesFor(canon).includes(file)) {
    return res.status(400).json({ error: 'Invalid file requested' });
  }

  let entitled;
  try {
    entitled = await isEntitled(email, slug);
  } catch (err) {
    console.error('[download] Entitlement check failed:', err);
    return res.status(500).json({ error: 'Could not verify entitlement' });
  }
  if (!entitled) {
    return res.status(403).json({ error: 'Not entitled', message: 'Purchase required - visit /agents to get access.' });
  }

  // A release that is not approved for sale is never handed out, however the entitlement was
  // created (test-card purchase, Payment Link, webhook), unless this deployment explicitly opts
  // in to test delivery. That covers the release package and the connect package of a product
  // that has a release record. The dossier, and products with no release record, are unaffected.
  const releaseFile = file === packageFile(canon) ||
    (file === 'connect-package.zip' && Boolean(productFor(canon)?.release));
  if (releaseFile && !packageDeliverable(canon)) {
    console.warn('[download] release package withheld: not approved for sale and test delivery is off', slug);
    return res.status(403).json({ error: 'This release is not yet available for download', code: 'release_not_approved' });
  }

  const driver = storageDriver();

  // The dossier is published on the site anyway; with real storage configured, send the buyer
  // to it rather than to an object that would also have to be uploaded per agent.
  if (driver && file === 'dossier.pdf') {
    res.setHeader('Cache-Control', 'no-store');
    return res.redirect(302, `/docs/agents/${canon}.pdf`);
  }

  // Files in private storage: redirect to a short-lived signed URL for agents/<slug>/<file>.
  if (driver) {
    try {
      const url = await signedDownloadUrl(canon, file);
      res.setHeader('Cache-Control', 'no-store');
      return res.redirect(302, url);
    } catch (err) {
      console.error('[download] Signed URL generation failed:', err);
      return res.status(500).json({ error: 'Could not generate download link' });
    }
  }

  // Without storage only the dossier has a stand-in. A package request must fail loudly here:
  // a placeholder PDF served under a .zip name would let a test purchase "pass" without
  // ever delivering an installable product.
  if (file !== 'dossier.pdf') {
    console.error('[download] package requested but no storage is configured:', slug, file);
    return res.status(503).json({ error: 'Package storage is not configured', code: 'package_storage_not_configured' });
  }

  const pdf = placeholderPdf(slug);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="colleagueai-${slug}-test.pdf"`);
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).send(pdf);
}
