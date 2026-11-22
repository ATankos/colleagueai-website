// Checkout kill switch, fail closed.
//
// - CHECKOUT_ENABLED=false takes checkout offline everywhere, at once.
// - Real money (a live Stripe key) or the Production deployment needs CHECKOUT_ENABLED to be exactly
//   'true'. Unset, empty, a typo ('ture', 'yes', '1', 'TRUE ') all keep checkout closed.
// - A test-mode key outside Production (Preview, local) stays open unless switched off, so the Stripe
//   TEST journey keeps working without extra configuration.
import { isLiveKey } from './products.js';

export function checkoutEnabled(env = process.env) {
  const flag = env.CHECKOUT_ENABLED;
  if (flag === 'false') return false;
  if (isLiveKey(env.STRIPE_SECRET_KEY) || env.VERCEL_ENV === 'production') return flag === 'true';
  return true;
}
