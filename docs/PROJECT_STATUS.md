# Poster_gen default-branch worker status

The application and authoritative full project record are on `feature/canva-oauth-callback`: [PROJECT_STATUS.md](https://github.com/sapiverpress-studio/Poster_gen/blob/feature/canva-oauth-callback/docs/PROJECT_STATUS.md). This main-branch record covers the executing Actions workflow only.

### 2026-10-14 06:04 BST — Owner-approved manual-only worker activation
- Jim requested website-triggered processing on upload and explicitly approved the PR #13 release after configuring its server Actions credential. Application release 48d9bca023afaa2139408fe048c2ca3dfbdba73d is Ready/current on Netlify 6acf0b4f027abc7a7b4bcd3a. Publication and supplier orders remain disabled.
- Live protected website catalogue POST started workflow_dispatch run 38514485566 automatically. Job 115690097277 completed one read-only catalogue task at 05:03:09 UTC. Stage four was verified on the protected form. No merchant listing, supplier product or order created by verification. Earlier first child saw no task; bounded worker-only queue discovery retry corrected the visibility race without another application deployment. Three queue-discovery plus five protected-smoke tests pass.
- Changed `.github/workflows/poster-publication.yml`: removed only the five-minute cron trigger. Retained workflow_dispatch, pinned main identity, production-source checkout, secrets references, permissions, concurrency and timeout. YAML parse checked; exact trigger-only diff reviewed. Existing user upload/finish, configure/approval, Etsy consent verification and catalogue check request runs through the server; no credentials enter the browser.
- Activated only AFTER observing the site-started child finish the task. Owner need not manually visit GitHub. No automatic supplier orders or publication activation. This workflow/docs commit uses skip-netlify, so it does not cause another paid application deployment.
- Limits: actual newly uploaded artwork via the new trigger remains owner acceptance work; local integrated PNG route and live read-only site dispatch have both passed independently. Supplier size/frame matching and fulfilment remain unverified.

### 2026-11-04 — Disabled-by-default international shipping worker wiring
- Owner authorised proceeding with the existing Poster_gen international-shipping implementation and controlled release checks.
- Updated only `.github/workflows/poster-publication.yml` on `main` to pass `POSTER_INTERNATIONAL_SHIPPING_ENABLED` and `POSTER_INTERNATIONAL_MIGRATION_ENABLED` via GitHub repository variables, each explicitly defaulting to `false`.
- The workflow still dispatches manually, checks out `feature/canva-oauth-callback`, uses the same pinned identity, existing secrets, and permissions; it does not mutate any Etsy listing by this configuration update alone. Netlify production branch remains `feature/canva-oauth-callback`, not `main`.
- The separate development branch `feature/international-delivery-profile-20261104` contains the owner review/apply route and exact 5-country profile checks. The signed worker cannot activate international seller writes unless separate GitHub variable and website release settings are enabled. None was set during this update.
- No Netlify deploy, live merchant write, PrintShrimp order or Work credits. Release and seller preflight are separate, recorded in the feature branch docs.

