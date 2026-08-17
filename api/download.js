/**
 * api/download.js - Gated download endpoint
 *
 * GET /api/download?email=<email>&slug=<agent-slug>&file=<file>[&exp=&sig=]
 *
 * Order of checks:
 *   1. If DOWNLOAD_TOKEN_SECRET is set, a valid signed token is required.
 *      If it is NOT set (test setup), the signature step is skipped.
 *   2. The email must have an entitlement for this slug (KV).
 * Then the file is served:
 *   - If R2 is configured (production): redirect to a signed, time-limited R2 URL.
 *   - Otherwise (test setup): stream a small placeholder PDF straight from the function,
 *     so the whole flow works without any object storage.
 */

import { isEntitled } from '../lib/db.js';
import { verifyDownload } from '../lib/downloadToken.js';

const TTL = Number(process.env.SIGNED_URL_TTL_SECONDS ?? 900);
const ALLOWED_FILES = ['dossier.pdf', 'connect-package.zip'];

function valueOf(input) {
  return Array.isArray(input) ? input[0] : input;
}

function r2Configured() {
  return Boolean(
    process.env.R2_ACCESS_KEY_ID &&
    process.env.R2_SECRET_ACCESS_KEY &&
    process.env.R2_PUBLIC_ENDPOINT &&
    process.env.R2_BUCKET_NAME
  );
}

async function signedR2Url(slug, file) {
  const { AwsClient } = await import('aws4fetch');
  const client = new AwsClient({
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    region: 'auto',
    service: 's3',
  });
  const url = new URL(`${process.env.R2_PUBLIC_ENDPOINT}/${process.env.R2_BUCKET_NAME}/agents/${slug}/${file}`);
  url.searchParams.set('X-Amz-Expires', String(TTL));
  const signed = await client.sign(new Request(url.toString(), { method: 'GET' }), { aws: { signQuery: true } });
  return signed.url;
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

  const email = valueOf(req.query.email);
  const slug = valueOf(req.query.slug);
  const file = valueOf(req.query.file) || 'dossier.pdf';
  const exp = valueOf(req.query.exp);
  const sig = valueOf(req.query.sig);

  if (!email || !slug) {
    return res.status(400).json({ error: 'email and slug are required' });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Invalid email format' });
  }
  if (!ALLOWED_FILES.includes(file)) {
    return res.status(400).json({ error: 'Invalid file requested' });
  }

  // Signed token is enforced only when a secret is configured.
  if (process.env.DOWNLOAD_TOKEN_SECRET) {
    if (!exp || !sig) {
      return res.status(403).json({ error: 'Invalid download token', reason: 'missing-token' });
    }
    let token;
    try {
      token = verifyDownload({ email, slug, file, exp, sig });
    } catch (err) {
      console.error('[download] Token verification failed:', err);
      return res.status(403).json({ error: 'Invalid download token', reason: 'token-verification-failed' });
    }
    if (!token.ok) {
      return res.status(403).json({ error: 'Invalid download token', reason: token.reason });
    }
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

  // Production: redirect to a signed R2 URL. Test: stream a placeholder from the function.
  if (r2Configured()) {
    try {
      const url = await signedR2Url(slug, file);
      res.setHeader('Cache-Control', 'no-store');
      return res.redirect(302, url);
    } catch (err) {
      console.error('[download] Signed URL generation failed:', err);
      return res.status(500).json({ error: 'Could not generate download link' });
    }
  }

  const pdf = placeholderPdf(slug);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="colleagueai-${slug}-test.pdf"`);
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).send(pdf);
}
