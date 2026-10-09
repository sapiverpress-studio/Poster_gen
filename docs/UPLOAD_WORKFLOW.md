# Owner-upload poster workflow — staged, not live

Jim's latest instruction replaces automated Canva fetching for future products: he downloads and checks a high-resolution PNG, uploads it once, reviews the listing preview and presses **Approve & Publish**. That press authorises the displayed artwork and listing for publication. It does not authorise production orders or a Netlify software deployment.

The owner-provided source of truth is SAPIVER_POSTER_TEMPLATE.md. It describes prior shop configuration; those historical live-account/plan claims are owner-supplied and not independently reverified in this work.

## Fixed template

- A5/A4/A3, each with Print Only, Black Frame, White Frame and Oak Frame: nine framed plus three unframed combinations, 12 total.
- Exact supplied prices, 13 tags, Sapiver Press footer and AI disclosure.
- Deterministic filename-based title and short subject opening. No invented educational claims or copied colours. AI instructions from the old PrintShrimp template are retained in the canonical document; this implementation does not consume AI listing credits to generate text.
- Existing correct Wall Decor reference listing supplies real taxonomy/variation IDs, stock and profile IDs. All prices and processing settings must match the supplied table. Do not guess IDs.
- Strict profile checks: PrintShrimp — Posters, dispatch GB/RM6 6AX, one GB destination, zero primary/secondary postage, no upgrades; Royal Mail 2nd Class with 2–3 days; made-to-order 1–2 days; returns/exchanges; one named PrintShrimp partner in Romford.
- Three generated JPEG product illustrations use the actual artwork without cropping. They are labelled illustrative mockups; they are not replicas of undisclosed supplier room photographs or frame specifications. Review them before approving.

## Owner experience

Sign in at `/poster/workflow`, which redirects to `/poster/upload`. Connect Etsy first via `/etsy/start`. On first use, select an existing correct template listing. A successful preparation saves that reference; future uploads reuse it.

Upload e.g. `SP-EL-006-DINOSAURS-ACROSS-TIME.png`. Name becomes Dinosaurs Across Time; one shared SKU is the structured filename stem. Plain readable names are also supported, with a sanitised SP- prefix. Invalid/overlong names and automatic `(1)` download suffixes are rejected instead of silently creating ambiguous names.

PNG only, maximum 50,000,000 bytes, minimum 3508 × 4961, portrait A-series tolerance 2%, bounded to 100 million pixels, one decoded page. Browser uploads one selected file in private 2 MB transport chunks to stay under ordinary Function payload limits; these are not separate print masters or Canva exports. Repeat identical chunks are idempotent; different content is rejected. Temporary chunks are cleaned up after one validated private master is stored. Browser session stores only the upload receipt/name/size for recovery, never keys or image bytes.

Background preparation verifies bytes, decodes the PNG, checks the real template, creates three previews and stores an immutable plan/hash. The final button binds approval to the exact master checksum plus complete plan/version. It cannot approve a different file or modified preview.

The publish worker reserves the filename SKU, creates Etsy draft first, writes all 12 inventory combinations and three images, verifies listing/price/SKU/personalisation read-back, then transfers the same master URL into three supplier print-size variants. Temporary access expires and is revoked. Only verified supplier-hosted copies permit the final Etsy state=active transition. Active listing read-back must also match the approved template. No order endpoint exists.

## Release and live checks

Still STAGED. Existing production Canva deployment remains unchanged. This candidate supersedes 3a96d49 as the requested future-product workflow.

One-time setup still requires runtime provider keys, exact Etsy callback and seller consent. `POSTER_PUBLICATION_ENABLED` defaults off; only configure `true` under an authorised release plan after verifying existing merchant setup, frame variation recognition, Etsy images/fields and full-size supplier delivery. The final button remains the per-product publication approval even when that gate is enabled. Never enable orders.

The supplier schema supplied by Jim documents size/image_url but no explicit frame field. Etsy Frame variations are recreated using the existing template's real IDs and values; actual PrintShrimp consumption of those frame choices remains a live verification requirement. Do not claim that creating three print-size assets proves correct frame fulfilment.

Requests with uncertain outcomes stay claimed, retain known listing/product IDs and stop automatic creation/publication retries. Inspect the existing merchant product before any repair; never clear a reservation merely to make a button work. Provider error bodies and secret values are not logged or displayed.

## Validation

86 unique local tests pass, including real PNG decoding/JPEG generation, all 12 fixed-price mappings, profile drift, CSRF, chunk conflicts, forged/replayed dispatch, checksum/approval drift, full simulated draft→supplier→publish order, and supplier failure preventing activation. An ArrayBuffer hash handling failure found by chunk retry testing was fixed and the full suite rerun successfully. Existing Canva/export tests remain passing.

Runtime imports pass with Sharp and Netlify Blobs. Illustrative mockup layout was rendered and visually checked with a synthetic edge-marker test design; Jim's actual upload has not been examined. Node/API mocks do not establish real seller consent, all optional Etsy read-back fields, full-size Edge throughput, supplier frame matching or physical print quality. GitHub CI is checked after saving.
