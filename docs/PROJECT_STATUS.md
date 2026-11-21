### 2026-11-21 17:49 GMT — Etsy tags-only API backfill COMPLETED and VERIFIED (no Netlify deploy)
- Owner instructed safe existing-listing SEO updates without changing SKUs, fulfilment, photos, prices, shipping, inventories, digital files, or triggering Netlify builds.
- 78 active SapiverPrints listings inspected, all 78 immutable before-state copies saved to private sapiver-poster-uploads (full listing, ordered gallery with alt text, inventory or buyer download files). Read-only audit GitHub run 44931210335 SUCCESS, saved 78, blocked 0.
- SEO plan targeted 23 listings and retained 55 existing tag sets to avoid speculative mass replacement. Each target had 13 distinct <=20-char buyer-oriented tags.
- Three-item guarded pilot GitHub workflow 44931917145 SUCCESS: three listing PATCH tags-only changes, post-write listing and full inventory/files and gallery readback matched protected snapshots. No supplier calls.
- Remaining full API batch GitHub workflow 44931984026 / job 136930398316 SUCCESS: 23 attempted, 20 updated, three previously applied already matched. All 20 post-write readbacks verified protected listing fields, exact photos/image IDs/order/alt, and exact inventory/variation SKU or digital file data. Tags read back as intended 13 unique values. Total 23 listings updated.
- No listing title, descriptions, shipping, processing, SKU, inventory, price, digital file or image was submitted to Etsy for alteration; the only Etsy mutation was PATCH tags. Guarded updater rejects changes before writes and stops after an unexpected readback.
- Netlify project sapiver-poster-gen-auth still Ready at deployment id 6affd3a25f6337282fecebd4 (unchanged before/after); no Netlify build or Work credits from this work. Files modified only on GitHub main worker branch; live production source feature/canva-oauth-callback unchanged.
- Existing-photo alt text backfill NOT PERFORMED: Etsy does not provide a straightforward in-place existing-photo alt-edit endpoint; its upload/reassociation API can issue new IDs/change gallery ranks. 74/78 listings have at least one missing alt and four have none. Reordering/refreshing images violates current owner preservation guardrail, so alt text deferred for a separately verified method; new-listing alt text code already live on website.
- Next: Remove temporary push-triggered SEO launcher, preserve guarded code/immutable backups and optionally measure search impressions and orders before any further SEO changes. No automatic continuation.
---

### 2026-11-21 17:40 GMT — Existing Etsy SEO safe backup and tags-only pilot staged (no Netlify release)
- Owner authorised safe, direct API updates for existing SapiverPrints SEO without Netlify deployment, strictly preserving SKUs, fulfilment, image order, pricing, shipping and digital files.
- Existing production source is feature/canva-oauth-callback; only main GitHub Actions worker and isolated seo-ops files updated, each commit [skip netlify]. No production software deployment.
- VERIFIED: read-only Etsy audit workflow 44931210335 succeeded, 78 active listings enumerated; 78 immutable seller-side snapshots with full listing metadata, ordered images and full inventory/digital files persisted in private sapiver-poster-uploads under preapproved seo-current/backup/<hash> keys. No seller writes.
- Audit: 76/78 listings already had 13 tags, two fewer; 74/78 had missing photo alt text, four with none. Most existing tags already relevant; only 23 targeted candidate replacements staged in seo-ops/etsy-seo-plan.json. These tags are candidate SEO improvements rather than verified search-volume claims.
- New seo-ops/etsy-seo-apply.mjs prepares a three-listing pilot and later 23-listing tags-only batch, with exact immutable backup, protected metadata, photo rank/alt text, inventory/SKU and file readbacks. The ONLY permitted Etsy seller write is PATCH tags for an existing listing, never inventory, files, imagery or supplier.
- Current state: IMPLEMENTED BUT UNTESTED against live PATCH. No live listing change claimed until success logs and post-update API readback. Existing-photo alt-text update NOT implemented due image replacement/rank risk; retain existing images unchanged.
- GitHub worker workflow gated by seo_mode: none, audit, pilot, apply. An isolated opt-in dispatcher is used for executions. Main ordinary worker excluded from SEO jobs.
- Risks: Etsy may report changed inventory due concurrent sales; fail-closed stops at first drift. OAuth token status only verified indirectly by successful authenticated catalogue read. No credentials committed. No Work credits or Netlify build.
- Next authorised step: 3-listing pilot with readback; if fully verified, execute remaining candidate tags only and record completion. Preserve unchanged 55 listings.
---

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

