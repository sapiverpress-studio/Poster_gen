# Bulk collection workflows — 2026-11-04 staged engineering

## Owner intent

Simplify the main /poster/bulk page and preserve infrequently needed Streak and Woodland recovery under a collapsed **Previous collection recovery** area, retaining original endpoints and historical audit evidence.

General new modes:

| Mode | Source PNG + details.md folders | Trio manifests | New Etsy listings |
|---|---:|---:|---:|
| Individual posters only | 2–5 | 0 | 2–5 |
| Six individuals + two trios | 6 | 2 | 8 |
| Trio only | 3 | 1 | 1 |
| Two trios only | 6 | 2 | 2 |

The new choice should appear **before uploading**; quota checks must count NEW Etsy listings, not PNG files. Uploading a supplier-only component must not incur an Etsy listing fee or consume an Etsy listing slot.

A 3-piece customer gift or coordinated set (e.g. one purchased for Jeff) remains **one** Etsy listing containing three separate printed artworks, not three listings and not one composited print.

## Bundled frames

The user authorises Print Only, Black Frame, White Frame and Oak Frame as four options for the whole trio. All three designs share the chosen finish and fixed A4 size. Never imply frames are excluded from a listing which offers frames.

PrintShrimp's public October 2026 documentation:
- https://printshrimp.com/en-us/blogs/ai-agents/bundles
- https://printshrimp.com/blogs/ai-agents/api-reference
- https://printshrimp.com/en-ie/blogs/ai-agents/sell-on-etsy

A saved supplier bundle SKU expands to three component product SKUs. An Etsy order with that same SKU and a buyer's frame option should map the type/colour to all three. The supplier gives the 20% quantity discount to *prints*, not to frames. UK shipping appears once per order. Every source SKU must have verified artwork for the offered size.

**Current live behaviour** (production base branch):
- The six+two importer exists; some Streak/woodland one-off buttons clutter the page.
- Bundle publisher creates one SKU and one Print Only priced inventory product, four preview images, and a verified Etsy **draft**, then normally stops. Etsy activation requires the separately controlled `POSTER_BUNDLE_ACTIVATION_ENABLED` gate.
- Existing PrintShrimp bundle records have been observed by the owner; their presence is not a production order test. Never automatically create replacements, delete them or clear an ambiguous Etsy draft/SKU claim.

**Staged in this draft PR:**
- One-off controls are grouped in a collapsed previous-collection section while retaining working code routes.
- Explicit four-finish framed metadata and shop inventory options, derived from three actual existing live individual offers and a live PrintShrimp UK pricing response. A failed quote or contribution check stops publication before any merchant write.
- Framed description states three separately printed artworks and optional matching frames; old unframed plans remain accepted without restyling their approved copy.
- Pure ZIP parser and validation for three-artwork/one-bundle and six-artwork/two-bundle **trio-only** archives, separated from default eight-listing mode.

**Not yet complete / DO NOT RELEASE:**
- Generic trio-only component onboarding: new artwork masters must be saved privately, then verified and registered as PrintShrimp products **without** creating six Etsy singles. Existing Woodland supplier-only code is hard-coded to special artwork and must not be blindly reused.
- Server-side idempotent trio-only bundle reservation for one or two listings with supplier-only component references; authoritative stored state, no session-only dependency, quota count 1 or 2.
- Trio-only UI mode is deliberately not shown in production until that server workflow exists.
- Full end-to-end Etsy variation and existing supplier bundle SKU read-back; at least one controlled frame-choice order imported to PrintShrimp's unpaid/Attention or Ready stage, with correct 3 images, A4 size, selected frame and price, without auto-pay. Requires owner's decision before a real paid order.
- Seller first-photo compliance and live listing photo suitability remain separate verification.
- No real Etsy/PrintShrimp/production writes, merges or deployments are authorised by this draft PR alone.

## Engineering release gates

1. All original Node tests and added frame/ZIP tests pass.
2. Dry-run demonstrates 8/1/2 modes produce exactly 8/1/2 listing slots and no unintended individual Etsy writes.
3. Supplier readback shows each exact source SKU/image-size and one unique trio SKU; uncertain POST responses stay locked, never blindly retried.
4. Etsy draft shows all four shared-SKU frame options and audited gross GBP prices; descriptions accurately explain physical 3-print sets and finishes.
5. Seller-approved single live rollout only after tests and data integrity are verified. Keep existing drafts/active listings untouched.
