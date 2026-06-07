/**
 * api/download.js — Gated download endpoint
 *
 * GET /api/download?email=<email>&slug=<agent-slug>
 *
 * Checks the entitlement record for the email.
 * If entitled: returns a signed, time-limited URL to the artifact in R2/S3.
 * If not entitled: returns 403.
 *
 * Required env vars (set in Vercel project settings, never in code):
 *   R2_ACCOUNT_ID       — Cloudflare account ID
 *   R2_ACCESS_KEY_ID    — R2 API token access key
 *   R2_SECRET_ACCESS_KEY — R2 API token secret
 *   R2_BUCKET_NAME      — e.g. "colleague-ai-artifacts"
 *   R2_PUBLIC_ENDPOINT  — e.g. "https://<account>.r2.cloudflarestorage.com"
 *
 * Alternatively use AWS S3 — swap the AwsClient calls for the AWS SDK.
 * Signed URLs expire after 15 minutes (configurable via SIGNED_URL_TTL_SECONDS).
 *
 * Artifact path convention in R2/S3:
 *   agents/<slug>/dossier.pdf
 *   agents/<slug>/connect-package.zip
 */

import { AwsClient } from 'aws4fetch';  // install: npm i aws4fetch
import { isEntitled } from '../lib/db.js';

const TTL = Number(process.env.SIGNED_URL_TTL_SECONDS ?? 900); // 15 min default

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
  if (req.method !== 'GET') return res.status(405).end('Method not allowed');

  const { email, slug, file = 'dossier.pdf' } = req.query;

  if (!email || !slug) {
    return res.status(400).json({ error: 'email and slug are required' });
  }

  // Basic email format guard
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Invalid email format' });
  }

  // Validate file param — only allow known file types
  const allowedFiles = ['dossier.pdf', 'connect-package.zip'];
  if (!allowedFiles.includes(file)) {
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
    return res.status(403).json({
      error: 'Not entitled',
      message: 'Purchase required — visit /agents to get access.',
    });
  }

  let url;
  try {
    url = await signedUrl(slug, file);
  } catch (err) {
    console.error('[download] Signed URL generation failed:', err);
    return res.status(500).json({ error: 'Could not generate download link' });
  }

  // Redirect to the signed URL (browser follows the redirect and downloads the file)
  res.setHeader('Cache-Control', 'no-store');
  res.redirect(302, url);
}
