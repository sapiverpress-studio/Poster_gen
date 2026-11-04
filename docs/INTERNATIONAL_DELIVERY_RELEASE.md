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
  listing+inventory readback, stop-on-ambiguity. This module **is not wired**
  to an owner UI or automatic worker. It cannot change anything merely by
  existing in a deployed bundle.
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
6. Add an owner-authenticated read-only **Preview international migration**
   action to the uploader. Do not create a public unauthenticated mutation API.
   Review exactly which existing listing IDs will change.
7. After explicit owner approval, perform **one** guarded PATCH on a verified
   listing; read it and its full inventory back, then repeat a separately
   approved batch for the remaining eligible active listings. Check completion
   individually; never retry an uncertain PATCH automatically.
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
