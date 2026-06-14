# Localization Readiness Checklist

## Current supported languages

- [ ] EN - English
- [ ] CS - Čeština
- [ ] DE - Deutsch
- [ ] FR - Français
- [ ] ES - Español
- [ ] IT - Italiano
- [ ] PL - Polski
- [ ] PT - Português

## Not in current scope

- [ ] SK - Slovenčina

## Required checks per language

- [ ] Language selector works
- [ ] Hero text changes
- [ ] Navigation text changes
- [ ] Pricing/contact text changes
- [ ] No UTF-8 mojibake
- [ ] Diacritics render correctly where applicable
- [ ] Heading font loads
- [ ] Body font loads
- [ ] Mobile layout works
- [ ] SEO metadata localized or backlog item created
- [ ] Hreflang strategy confirmed
- [ ] Sitemap strategy confirmed

## Production note

A GitHub branch push does not automatically update the production website unless Vercel is configured to deploy that branch as production.

Normally:

1. Push branch to GitHub.
2. Open pull request.
3. Review tests.
4. Merge to main.
5. Vercel deploys main to production.
6. Verify live site.
