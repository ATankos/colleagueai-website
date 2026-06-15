/**
 * api/download.js - Gated download endpoint
 *
 * GET /api/download?email=<email>&slug=<agent-slug>&exp=<unix>&sig=<signature>
 *
 * Checks a signed download token first.
 * Then checks the entitlement record for the email.
 * If entitled: returns a signed, time-limited URL to the artifact in R2/S3.
 * If not entitled: returns 403.
 */

import { AwsClient } from 'aws4fetch';
import { isEntitled } from '../lib/db.js';
import { verifyDownload } from '../lib/downloadToken.js';

const TTL = Number(process.env.SIGNED_URL_TTL_SECONDS ?? 900);

function valueOf(input) {
  return Array.isArray(input) ? input[0] : input;
}

function makeR2Client() {
  return new AwsClient({
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    region: 'auto',
    service: 's3',
  });
}

async function signedUrl(slug, file = 'dossier.pdf') {
  const client = makeR2Client();
  const endpoint = process.env.R2_PUBLIC_ENDPOINT;
  const bucket = process.env.R2_BUCKET_NAME;
  const key = `agents/${slug}/${file}`;
  const url = new URL(`${endpoint}/${bucket}/${key}`);

  url.searchParams.set('X-Amz-Expires', String(TTL));

  const signed = await client.sign(new Request(url.toString(), { method: 'GET' }), {
    aws: { signQuery: true },
  });

  return signed.url;
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

  const allowedFiles = ['dossier.pdf', 'connect-package.zip'];

  if (!allowedFiles.includes(file)) {
    return res.status(400).json({ error: 'Invalid file requested' });
  }

  if (!exp || !sig) {
    return res.status(403).json({
      error: 'Invalid download token',
      reason: 'missing-token',
    });
  }

  let token;

  try {
    token = verifyDownload({ email, slug, file, exp, sig });
  } catch (err) {
    console.error('[download] Token verification failed:', err);
    return res.status(403).json({
      error: 'Invalid download token',
      reason: 'token-verification-failed',
    });
  }

  if (!token.ok) {
    return res.status(403).json({
      error: 'Invalid download token',
      reason: token.reason,
    });
  }

  let entitled;

  try {
    entitled = await isEntitled(email, slug);
  } catch (err) {
    console.error('[download] Entitlement check failed:', err);
    return res.status(500).json({ error: 'Could not verify entitlement' });
  }

  if (!entitled) {
    return res.status(403).json({
      error: 'Not entitled',
      message: 'Purchase required - visit /agents to get access.',
    });
  }

  let url;

  try {
    url = await signedUrl(slug, file);
  } catch (err) {
    console.error('[download] Signed URL generation failed:', err);
    return res.status(500).json({ error: 'Could not generate download link' });
  }

  res.setHeader('Cache-Control', 'no-store');
  return res.redirect(302, url);
}
