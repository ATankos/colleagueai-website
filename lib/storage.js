/**
 * lib/storage.js - where paid files live, and how a buyer gets a short-lived link to one.
 *
 * Object key for every driver: agents/<slug>/<file>
 *
 * Drivers, first configured wins:
 *   1. Vercel Private Blob - a private store connected to this project. On Vercel, functions
 *      authenticate with the project's auto-rotating OIDC token plus BLOB_STORE_ID, so no static
 *      key sits in the environment (BLOB_READ_WRITE_TOKEN also works). Links are presigned GET
 *      URLs scoped to one pathname.
 *   2. Cloudflare R2 - the original driver (R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY,
 *      R2_PUBLIC_ENDPOINT, R2_BUCKET_NAME).
 * Neither configured -> null; api/download.js then serves only the dossier placeholder.
 */

const TTL_SECONDS = () => Number(process.env.SIGNED_URL_TTL_SECONDS ?? 900);

export function objectKey(slug, file) {
  return `agents/${slug}/${file}`;
}

export function blobConfigured() {
  return Boolean(process.env.BLOB_STORE_ID || process.env.BLOB_READ_WRITE_TOKEN);
}

export function r2Configured() {
  return Boolean(
    process.env.R2_ACCESS_KEY_ID &&
    process.env.R2_SECRET_ACCESS_KEY &&
    process.env.R2_PUBLIC_ENDPOINT &&
    process.env.R2_BUCKET_NAME
  );
}

/** Which driver will serve files ('blob' | 'r2' | null). */
export function storageDriver() {
  if (blobConfigured()) return 'blob';
  if (r2Configured()) return 'r2';
  return null;
}

// The Blob SDK is loaded lazily (and is swappable in tests) so the R2 path and the
// no-storage path never load it.
let blobSdk = null;
export function __setBlobSdkForTests(sdk) { blobSdk = sdk; }
async function sdk() {
  if (!blobSdk) blobSdk = await import('@vercel/blob');
  return blobSdk;
}

async function signedBlobUrl(key) {
  const { issueSignedToken, presignUrl } = await sdk();
  const validUntil = Date.now() + TTL_SECONDS() * 1000;
  // One token per request, scoped to exactly this object and to GET only.
  const token = await issueSignedToken({ pathname: key, operations: ['get'], validUntil });
  const { presignedUrl } = await presignUrl(token, { operation: 'get', pathname: key, access: 'private', validUntil });
  return presignedUrl;
}

async function signedR2Url(key) {
  const { AwsClient } = await import('aws4fetch');
  const client = new AwsClient({
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    region: 'auto',
    service: 's3',
  });
  const url = new URL(`${process.env.R2_PUBLIC_ENDPOINT}/${process.env.R2_BUCKET_NAME}/${key}`);
  url.searchParams.set('X-Amz-Expires', String(TTL_SECONDS()));
  const signed = await client.sign(new Request(url.toString(), { method: 'GET' }), { aws: { signQuery: true } });
  return signed.url;
}

/** A short-lived URL for agents/<slug>/<file>, or null when no storage is configured. */
export async function signedDownloadUrl(slug, file) {
  const key = objectKey(slug, file);
  const driver = storageDriver();
  if (driver === 'blob') return signedBlobUrl(key);
  if (driver === 'r2') return signedR2Url(key);
  return null;
}
