/**
 * api/certificate.js - public verification of a Colleague AI certificate.
 *
 * GET /api/certificate?id=CAI-L4-1A2B3C4D            -> HTML verification page
 * GET /api/certificate?id=CAI-L4-1A2B3C4D&format=json -> JSON
 *
 * The point of a certificate is that a third party (the holder's auditor, their
 * client, their board) can check it. So this endpoint is deliberately public and
 * unauthenticated - and therefore deliberately returns NO personal data: no
 * email, no customer name, nothing that identifies the holder. Possession of the
 * id is what proves the claim; the holder chooses who to give it to.
 *
 * It also carries the scope statement, because a verification page that says
 * "Certified" without saying what that does and does not mean is exactly the
 * overclaim the release-gate audits kept finding.
 */

import { getCertification, publicCertificate, isCertificationCurrent } from '../lib/db.js';

const ID_RE = /^CAI-L[1-5]-[0-9A-F]{8}$/;

function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function titleFromSlug(slug) {
  return String(slug).replace(/-/g, ' ').replace(/\band\b/g, '&').replace(/\b\w/g, (c) => c.toUpperCase());
}

const SCOPE_NOTE =
  'The Colleague AI Certified standard is Colleague AI’s own programme. It is not ' +
  'accreditation, attestation or certification by any third party, notified body or ' +
  'regulator, and it is not legal, regulatory or compliance advice. It applies to the ' +
  'agent package as supplied and configured within its documented parameters; it does ' +
  'not certify how the holder uses it, what data they put through it, or whether their ' +
  'own use complies with any law that applies to them.';

function page(title, bodyHtml) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>` +
    `<meta name="robots" content="noindex">` +
    `<style>body{font-family:ui-sans-serif,system-ui,Segoe UI,Arial,sans-serif;background:#F5F0E8;color:#1D1B1A;margin:0;padding:48px 20px;display:flex;justify-content:center;line-height:1.6}` +
    `.card{max-width:560px;width:100%;background:#fff;border:1px solid #E7E0D5;border-radius:16px;padding:32px}` +
    `h1{font-size:21px;margin:0 0 6px}.st{display:inline-block;font-weight:700;font-size:13px;padding:6px 14px;border-radius:100px;margin:10px 0 18px}` +
    `.ok{background:#E8F3EC;color:#1E6B3E}.no{background:#F6E9E4;color:#9A3412}` +
    `dl{display:grid;grid-template-columns:auto 1fr;gap:8px 18px;margin:0 0 20px;font-size:14.5px}` +
    `dt{color:#8A8478}dd{margin:0}code{font-family:ui-monospace,Consolas,monospace}` +
    `.scope{font-size:12.5px;color:#5c574f;border-top:1px solid #E7E0D5;padding-top:16px}` +
    `a{color:#C65D3A}</style></head><body><div class="card">${bodyHtml}` +
    `<p class="scope">${esc(SCOPE_NOTE)}</p>` +
    `<p class="scope" style="border:0;padding-top:6px"><a href="/certified">About Continuous Certification</a> &nbsp;·&nbsp; <a href="/agents">Agent catalogue</a></p>` +
    `</div></body></html>`;
}

export default async function handler(req, res) {
  const wantsJson = String(Array.isArray(req.query?.format) ? req.query.format[0] : req.query?.format || '') === 'json';
  const raw = Array.isArray(req.query?.id) ? req.query.id[0] : req.query?.id;
  const id = String(raw || '').trim().toUpperCase();

  const fail = (status, code, message) => {
    if (wantsJson) {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      return res.status(status).json({ valid: false, error: code, message });
    }
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(status).send(page('Certificate not found',
      `<h1>Certificate not found</h1><span class="st no">No match</span>` +
      `<p>${esc(message)}</p>`));
  };

  if (!id) return fail(400, 'missing-id', 'Add ?id=CAI-… to check a certificate.');
  if (!ID_RE.test(id)) return fail(400, 'malformed-id', 'That is not a Colleague AI certificate id. They look like CAI-L4-1A2B3C4D.');

  let cert;
  try {
    cert = await getCertification(id);
  } catch (err) {
    console.error('[certificate] lookup failed:', err?.message ?? err);
    return fail(503, 'unavailable', 'Certificate verification is temporarily unavailable. Please try again shortly.');
  }

  if (!cert) return fail(404, 'not-found', 'No certificate with that id has been issued.');

  const current = isCertificationCurrent(cert);
  const publicView = { ...publicCertificate(cert), current };

  if (wantsJson) {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ valid: true, ...publicView, scope: SCOPE_NOTE });
  }

  const statusLabel = current
    ? 'Colleague AI Certified — Active'
    : cert.status === 'past_due' ? 'Payment overdue — not currently active' : 'Lapsed — not currently certified';

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).send(page(`Certificate ${id}`,
    `<h1>${esc(titleFromSlug(cert.agentSlug))}</h1>` +
    `<span class="st ${current ? 'ok' : 'no'}">${esc(statusLabel)}</span>` +
    `<dl>` +
    `<dt>Certificate ID</dt><dd><code>${esc(cert.certificateId)}</code></dd>` +
    `<dt>CAI tier</dt><dd>${esc(cert.tier ?? '—')}</dd>` +
    `<dt>Certified release</dt><dd>${esc(cert.certifiedVersion ?? '—')}</dd>` +
    `<dt>Issued</dt><dd>${esc((cert.issuedAt || '').slice(0, 10) || '—')}</dd>` +
    `<dt>Valid until</dt><dd>${esc((cert.validUntil || '').slice(0, 10) || 'end of current period')}</dd>` +
    `</dl>` +
    (current ? '' : '<p><b>This certificate is not currently active.</b> The holder’s licence to the agent package is unaffected, but the version is no longer listed as a current Colleague AI Certified Release.</p>')));
}
