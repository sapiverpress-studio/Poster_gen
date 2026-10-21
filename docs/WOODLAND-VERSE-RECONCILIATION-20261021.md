# Woodland Verses — live Etsy / PrintShrimp reconciliation (21 October 2026)

**Status:** COMPLETED through authenticated GitHub Actions REST API worker. No Netlify build and no order creation.

## Etsy: 8 active listings

Existing singles retained with their original listings and full supplier product SKU:
- Fox — Etsy `4595277551` → PrintShrimp `SP-FOX-PRINT-WI-05689631`
- Robin — Etsy `4595921846` → `SP-THE-ROBIN`
- Hedgehog — Etsy `4595944801` → `SP-THE-HEDGEHOG`
- Badger — Etsy `4599437738` → `SP-BADGER-73C91495`
- Red Squirrel — Etsy `4599399281` → `SP-RED-SQUIRREL-649E8590`
- Roe Deer — Etsy `4599438228` → `SP-ROE-DEER-08061999`

All six single descriptions were corrected in place: obsolete A3 wording removed, collection name changed from eight subjects to six posters, and disclosure of AI assistance included where missing. Original SKUs, listing IDs, active status, offerings, frame options and prices were preserved.

## Live A4 bundles: 2 active listings

| Offer | Etsy listing | PrintShrimp bundle SKU | Supplier components |
|---|---|---|---|
| Forest Friends | `4600180569` | `SP-TRIO-D1B581C8843C136EF3744B3D` | Fox, Robin, Hedgehog |
| Hidden Paths | `4600182933` | `SP-TRIO-7AD9AD4192AB53D36FCE3CC6` | Badger, Red Squirrel, Roe Deer |

Each trio sells for £40.77, one unframed A4 print of each animal, three separate paper posters. Both Etsy draft IDs were **activated in place** after description changes, preserving the original Etsy inventory SKU. The descriptions no longer offer frames or A3/A5 for bundles.

Hidden Paths' old mixed-source bundle was deleted and created again **with the same SKU** under supplier bundle ID `9be5364c-7b72-43de-82db-ce20cb7a2b91` and the three ORIGINAL supplier product SKUs, each explicitly size A4. Its private studio record was updated with the replacement bundle ID. Forest Friends retained its supplier bundle.

## Removed from PrintShrimp after exact-reference preflight

- Obsolete duplicated first trio `SP-WOODLAND-VERSE-TRIO`
- Unused `SP-WOOD-BADGER-3EBC29B76F`
- Unused `SP-WOOD-RED-SQUIRREL-0F27360216`
- Unused `SP-WOOD-ROE-DEER-17790EA57D`

Preflight confirmed no seller Etsy listing referenced these SKUs, no active supplier bundle used the redundant products, and zero paid PrintShrimp orders. Deletions were read back; both current bundles and Etsy listings were rechecked after cleanup.

## Financial and QA

- Current A4 individual print-only price: £15.99 each, £47.97 for three.
- Bundle offer 15% discount: £40.77.
- Live GB pricing combined with conservative Etsy fee allowance gave **estimated** £18.33 contribution each, not a net-profit guarantee (excludes Offsite Ads/overheads).
- Supplier original A4 assets had valid HTTPS variants; prior read-only audit checked originals' remote artwork was returned HTTP 200. Physical print proof, actual paid-order integration and automatic fulfilment were **not** tested. Do not claim fulfilment proven by an unplaced order.
- No extra Etsy singles, no print orders, no PrintShrimp product creation, no new master artwork exports, and no Netlify deploys in this reconciliation.

**API job:** [GitHub Actions run 39606841309](https://github.com/sapiverpress-studio/Poster_gen/actions/runs/39606841309) attempts 5 read-only preflight, 6 merchant correction, 7 cleanup.

One-off GitHub worker attempt triggers were retired after successful execution. The regular six-plus-two uploader remains unchanged.
