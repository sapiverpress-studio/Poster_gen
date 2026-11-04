# Worldwide Etsy delivery — staged API integration and release gates

Date: 2026-11-04. Source: `feature/canva-oauth-callback`.
Branch: `feature/international-delivery-profile-20261104`.
Status: STAGED OFF PRODUCTION; NOT DEPLOYED; NOT ACTIVATED; NO ETSY WRITES.

## Objective
Preserve existing physical poster/PrintShrimp identity and enable one approved
international Etsy shipping profile by default for new approved singles and trios.
A separate controlled migration covers eligible *existing* active listings.
No changes to artwork, SKU, inventory, paper, frame variants or supplier products.

## Exact profile to reuse
- Existing Etsy profile title: `PrintShrimp — International Test` (owner's
  screenshot shows it saved with zero active listings).
- Its ID is obtained by authenticated Etsy API GET; **never invent or hardcode**.
- Expected only GB, US, CA, AU, NZ. GB/US/CA/AU customer shipping free;
  NZ customer primary charge >= £8.49 and <= £100, secondary charge £0.
  Owner's provisional NZ charge was £14.99; framed delivery cost remains
  **UNVERIFIED** and the code cannot certify international profitability.
- UK origin configured at RM6 6AX. **CRITICAL LEGAL/PLATFORM HOLD**: PrintShrimp
  dispatches locally from multiple countries. Etsy documents one dispatch
  origin per listing and requires an accurate statement of where an item ships
  from. A UK origin on a locally printed overseas order may be inaccurate.
  Do not enable the new profile on live listings without a compliant
  regional-origin strategy agreed and validated.
- Verify owner-visible service estimates; the selected FedEx/DPD entries are
  transit-time proxies, **not proof** of an actual courier.

## Implementation
- `lib/international-delivery.mjs`: exact profile identity, destinations,
  GBP delivery costs, carrier/ETA data, original processing/returns validation.
- `lib/physical-shop-setup.mjs`: parameterized domestic/international
  discovery, preserving original UK route unchanged.
- `lib/physical-first-product.mjs`: carries chosen delivery mode in plans.
- `lib/uploaded-poster.mjs`: when the authenticated server-side env function
  returns `POSTER_INTERNATIONAL_SHIPPING_ENABLED=true`, use the verified
  international profile for new drafts even if an existing domestic reference
  listing supplies the SKU/variant template. Freeze mode in the approval hash.
  Re-read the profile immediately before Etsy merchant writes.
- `lib/poster-upload-runner.mjs`: forwards environment function to preparation.
- `lib/collection-bundle-publication.mjs`: same gated profile selection for
  newly prepared trio drafts, retaining original component SKUs and prints.
- `.github/workflows/poster-publication.yml`: exposes the GitHub repository
  Actions variable `POSTER_INTERNATIONAL_SHIPPING_ENABLED` to the existing
  worker (off by default). Netlify's server environment must use the same value
  when activated; do not flip only one environment.
- `lib/international-shipping-migration.mjs`: GET-only preview of all active
  listings associated with `PrintShrimp — Posters`; one-field Etsy PATCH
  `shipping_profile_id` with exact shop/SKU/source-ID checks, an
  owner-approved preview hash, persisted one-time ledger claim, fresh
  listing+inventory readback and stop-on-ambiguity. It is now connected to the
  owner-only site and the signed seller worker; both release switches default off.
- `test/international-delivery.test.mjs` and
  `test/international-migration.test.mjs`: deterministic seller fixtures,
  no real Etsy/PrintShrimp orders.

## Release checklist
1. Verify expected branch and diff against currently deployed website branch;
   reconcile any simultaneous bulk/Trio development and prevent lost fixes.
2. Run full Node24 check and tests; validate live Etsy profile ID/details and
   carrier/time fields against the current authenticated seller account.
3. Obtain a compliant dispatch-origin strategy and verify NZ *framed* supplier
   pricing, international A5/A4/A3 contribution, returns, duties and GPSR/EPR
   constraints as applicable. Do not treat source validation as legal signoff.
4. Review and explicitly approve one production release, then separately
   set the international feature variable at Netlify and GitHub Actions. Check
   expected branch and deployment before the first new listing.
5. Prepare a private poster and trio; confirm exact source files, original SKU,
   international profile and customer variations in Etsy GET response. Publish
   only with normal per-product approval.
6. Open the authenticated **Review international Etsy delivery** link from
   the bulk uploader. Run the read-only preview, review the exact seller profile
   and eligible listing IDs, and confirm the count before any writes.
7. With both website and worker migration release switches enabled, the owner
   explicitly approves the first listing. After its PATCH and full inventory
   readback succeed, refresh the preview and independently approve the rest.
   Every update is individually checked and any uncertainty stops the batch.
8. Verify a paid PrintShrimp international test order with exact artwork,
   size/frame, production cost, tracking and seller obligations before enabling
   auto-payment; wallet was £0 in owner's screenshot.
9. Compare Etsy search impressions and orders over 14–30 days. Availability
   expansion is a test, not evidence of a search-ranking gain.

## Confirmed upstream API
Etsy: `PATCH /v3/application/shops/{shop_id}/listings/{listing_id}`
with `shipping_profile_id` as form-encoded field and `listings_w` OAuth scope:
https://developer.etsy.com/documentation/reference/

Etsy: one shipping origin per listing:
https://help.etsy.com/hc/en-gb/articles/115014115187-How-to-Set-Up-Delivery-Information

PrintShrimp: order matching depends on saved product artwork and Etsy SKU;
integration does not by itself validate an untested order:
https://printshrimp.com/pages/etsy-integration

**Never confuse this code being present with the account having been
migrated or orders having been fulfilled successfully.**

## Continued engineering checkpoint — 2026-11-04
- Integrated read-only `shipping_preview` and owner-approved `shipping_apply` into the established GitHub OIDC worker and queue, with a separate `POSTER_INTERNATIONAL_MIGRATION_ENABLED` release switch (default OFF).
- Added authenticated `/poster/catalogue/international` form and a restrained link within the existing bulk uploader. It previews eligible Etsy listing IDs, excludes unrelated delivery profiles, requires the exact approval hash and a CSRF-protected owner confirmation, applies one listing first, then permits a separate remaining-batch approval.
- New code reads omitted Etsy profile destination entries using the authoritative shipping-destinations API. Every intended listing preserves its SKU and existing full inventory; uncertain writes retain a lock and stop without retry. No PrintShrimp order, product or bundle write occurs during shipping migration.
- GitHub Node 24 tests are mock-backed; a successful CI run is not proof of a production deployment or real seller-account changes.
- **Single global listing distinction:** Printify documents single-listing regional POD fulfilment, whereas Etsy still states one origin per listing. This remains an Etsy disclosure/accuracy consideration; no automatic duplication of the original 47 listings is planned.
- Release blocked on accurate dispatch-origin representation, supplier pricing/variant economics (especially NZ framed), and an explicitly approved single production release. No live listings have been changed.


## 2026-11-04 owner-approved activation

The shop owner explicitly instructed the assistant to enable selling in GB, US,
CA, AU and NZ through the existing uploader and selected Etsy delivery profile.
The authenticated seller read-only audit completed successfully, finding
47 active physical listings with the original UK-only profile, and two other
listings excluded because they already have international/other delivery.

- Netlify site `sapiver-poster-gen-auth`: production-scoped function/runtime
  environment variables `POSTER_INTERNATIONAL_SHIPPING_ENABLED` and
  `POSTER_INTERNATIONAL_MIGRATION_ENABLED` set to `true`.
- GitHub main-branch `poster-publication.yml`: corresponding worker environment
  flags set to `true` under explicit owner approval. The worker retains pinned
  `main` OIDC identity and checks out `feature/canva-oauth-callback`.
- This document revision intentionally triggers a production rebuild so that
  Netlify function runtime can read the new feature settings. Confirm the exact
  deployed commit and route before requesting the owner to apply changes.
- The authenticated application still requires a current, valid, exact-hash,
  CSRF-protected owner form approval to change Etsy shipping profiles. No code
  commit or environment update alone applies the new shipping profile to listings.
- Migration flow: owner selects one existing listing; worker checks its SKU,
  metadata and inventory before/after changing only `shipping_profile_id`;
  after confirmed readback, a fresh preview and separate owner approval
  selects the remaining eligible listings. Shop-specific API checks prevent
  accidental writes to other Etsy shops.
- PrintShrimp Etsy import/tracking switches are ON in owner's screenshots;
  automatic wallet payment is OFF and balance was £0. This activation does not
  enable PrintShrimp automatic payment or claim a live international order test.
- A single Etsy shipping origin remains a policy risk for regionally printed
  POD even when the sales workflow is technically supported. Owner was informed;
  do not fabricate courier identity or dispatch location.
- The existing NZ shipping charge is £14.99 (first item) and £0 additional;
  confirm after first listing is updated. International supplier costs,
  especially framed bundles, must still be monitored.


## 2026-11-04 one-click completion

A final owner-authorised simplification was integrated after the worldwide
activation switches were enabled.

- Owner's verified read-only Etsy preview showed 47 eligible existing physical
  listings and two unrelated-profile listings excluded from changes.
- PR #70 code has been integrated into production-source
  `feature/canva-oauth-callback`. Its staged full Node24 CI run
  `41814073103` passed; the latest Netlify preview was Ready.
- The owner-only page now offers one `Enable 5-country delivery for N existing
  listings` button, with fresh review hash and CSRF session binding. It
  automatically selects one reviewed listing first. After Etsy verifies that
  listing's delivery-profile change and the original SKU, metadata and
  inventory, the worker re-reads the full seller catalogue and checks that
  the exact remaining listing snapshot is unchanged before migrating the rest.
- An unsuccessful test or unexpected inventory/profile response stops all
  further merchant updates; existing records retain their investigation
  locks, and no automatic retry is attempted. No new Etsy listings,
  PrintShrimp products, orders or wallet payment settings are created.
- Importantly: this release only exposes the protected final action.
  It does not pretend to press the button, access the user's owner cookie,
  or claim that the 47 listings have already migrated.
- This documentation commit intentionally triggers one production build to
  synchronize Netlify's published site with the source branch and newly
  configured production-scoped environment variables.
