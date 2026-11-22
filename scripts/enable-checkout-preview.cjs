/* enable-checkout-preview.cjs — flip the storefront's checkout switch in the BUILT
 * output only, gated on an environment variable.
 *
 * Production keeps STORE.checkoutEnabled:false in source until the paid journey has
 * passed a real end-to-end test. To run that test on a Vercel PREVIEW deployment
 * without touching production or the masters, set
 *
 *     CAI_ENABLE_CHECKOUT=1        (Vercel → Settings → Environment Variables,
 *                                   scope: Preview ONLY — never Production)
 *
 * and this postbuild step rewrites `checkoutEnabled:false` to `true` across the
 * built agents pages and their externalized scripts in dist/. Without the flag it
 * is a no-op, so production builds are byte-identical to before.
 *
 * The API side is separately controlled: /api/checkout answers 503 until
 * STRIPE_SECRET_KEY is set, and CHECKOUT_ENABLED=false is its own kill switch.
 */
const fs = require("fs");
const path = require("path");

if (process.env.CAI_ENABLE_CHECKOUT !== "1") {
  console.log("[enable-checkout-preview] CAI_ENABLE_CHECKOUT not set — leaving checkout disabled (no-op)");
  process.exit(0);
}

const dist = path.resolve("dist");
if (!fs.existsSync(dist)) {
  console.error("[enable-checkout-preview] dist/ not found — run after the build");
  process.exit(1);
}

// The master flag, and the Preview-only opening of controlled-test products (on Production the buy path opens
// only for a product whose status is "released", i.e. after its GO PR).
const SWAPS = [["checkoutEnabled:false", "checkoutEnabled:true"], ["/*CAI_PREVIEW_SALE*/false", "/*CAI_PREVIEW_SALE*/true"]];
let patched = 0;

const walk = (dir) => {
  // withFileTypes gives isDirectory() from the readdir call itself, so there is
  // no separate statSync check-then-use race (CodeQL: file-system-race).
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const name = entry.name;
    const p = path.join(dir, name);
    if (entry.isDirectory()) { walk(p); continue; }
    if (!/\.(html|js)$/.test(name)) continue;
    let src;
    try { src = fs.readFileSync(p, "utf8"); } catch { continue; }
    if (!SWAPS.some(([a]) => src.includes(a))) continue;
    for (const [a, b] of SWAPS) src = src.split(a).join(b);
    fs.writeFileSync(p, src, "utf8");
    patched += 1;
  }
};
walk(dist);

console.log(`[enable-checkout-preview] PREVIEW CHECKOUT ENABLED — patched ${patched} built file(s). ` +
  "This must never appear in a production build log.");
