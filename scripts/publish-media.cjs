/* publish-media.cjs: put into dist/media/ ONLY the files of videos this build may show.
 *
 * Source files live in media/ and are never served directly. A Production build copies the video, posters and caption
 * files of APPROVED videos only (approval bound to the file's sha256 and a reached publication date; see
 * scripts/lib/videos.cjs). A Preview build with CAI_VIDEO_PREVIEW=1 also copies pending videos whose file matches the
 * delivered master. Anything else under dist/media/ is removed first, so no unapproved video, poster or caption is
 * reachable by URL.
 *
 * Fails the build when a recorded approval no longer matches the file in media/ (a master replaced without review):
 * the approval lapses and the mismatch must be reviewed, not deployed silently.
 * Runs in postbuild before inject-videos.cjs.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const V = require('./lib/videos.cjs');

const DIST_MEDIA = path.join(path.resolve(__dirname, '..'), 'dist', 'media');

const mismatched = V.approvalMismatches();
if (mismatched.length) {
  console.error(`[publish-media] approval does not match the file for: ${mismatched.join(', ')}. A master was replaced after approval; review it and record a new approval (approvedSha256).`);
  process.exit(1);
}

fs.rmSync(DIST_MEDIA, { recursive: true, force: true });
const files = V.filesToPublish();
for (const url of files) {
  const name = url.slice('/media/'.length);
  fs.mkdirSync(DIST_MEDIA, { recursive: true });
  fs.copyFileSync(path.join(V.MEDIA_DIR, name), path.join(DIST_MEDIA, name));
}
/* The copied video bytes are the bytes that were checked. */
for (const id of Object.keys(V.REG)) {
  const v = V.REG[id];
  if (!files.includes(v.src)) continue;
  const sha = crypto.createHash('sha256').update(fs.readFileSync(path.join(DIST_MEDIA, v.src.slice('/media/'.length)))).digest('hex');
  if (sha !== v.master.sha256) { console.error(`[publish-media] ${id}: copied file does not match its checksum`); process.exit(1); }
}
console.log(`[publish-media] ${V.previewMode() ? 'PREVIEW ' : ''}${files.length} media file(s) published${files.length ? '' : ' (no approved video)'}`);
