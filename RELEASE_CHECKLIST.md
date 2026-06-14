# Release Checklist

## Before merge

- [ ] Branch is up to date with main
- [ ] Unit tests pass
- [ ] E2E tests pass
- [ ] Accessibility tests pass
- [ ] Lighthouse report reviewed
- [ ] No secrets committed
- [ ] Legal pages checked
- [ ] Sitemap checked
- [ ] Trust Center checked
- [ ] Checkout tested in Stripe test mode
- [ ] Webhook tested
- [ ] Entitlement tested
- [ ] Download tested

## After deployment

- [ ] Production homepage loads
- [ ] /agents loads
- [ ] /demo loads
- [ ] /trust loads
- [ ] /partners loads
- [ ] /terms loads
- [ ] /privacy loads
- [ ] /license loads
- [ ] /sitemap.xml loads
- [ ] /robots.txt loads
- [ ] /llms.txt loads
- [ ] Invalid URL returns 404
- [ ] Stripe webhook receives production events
- [ ] Vercel logs checked
- [ ] Google Search Console checked
- [ ] Bing Webmaster Tools checked
