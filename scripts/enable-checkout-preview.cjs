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

const NEEDLE = "checkoutEnabled:false";
const REPLACEMENT = "checkoutEnabled:true";
let patched = 0;

const walk = (dir) => {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) { walk(p); continue; }
    if (!/\.(html|js)$/.test(name)) continue;
    const src = fs.readFileSync(p, "utf8");
    if (!src.includes(NEEDLE)) continue;
    fs.writeFileSync(p, src.split(NEEDLE).join(REPLACEMENT), "utf8");
    patched += 1;
  }
};
walk(dist);

console.log(`[enable-checkout-preview] PREVIEW CHECKOUT ENABLED — patched ${patched} built file(s). ` +
  "This must never appear in a production build log.");
