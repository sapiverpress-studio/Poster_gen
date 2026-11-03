# Streak — adult sarcasm / rough black-marker print collection

**Status (2026-11-03): STAGED / HOLD FOR PRINT PROOF AND SELLER CONFIGURATION.** This specification lives on a non-production branch. No software deployment, Etsy section creation, listing publication, PrintShrimp purchase, or existing-product change is authorised by this document.

## Brand / customer brief
- `Streak` is the **collection/style name**, NEVER a heading, signature or decorative text printed on the artwork itself.
- Audience: adults buying irreverent, dry British-humour prints for home offices, living rooms and other adult spaces; no infantilised hedgehogs.
- Visual: monochrome black on plain white, hand-drawn **very thick, rough, aggressive marker-pen scribbles**, informal but legible with confident shapes and enough clean whitespace. Avoid polished clip-art/vector-outline aesthetics, neat uniform stroke weights, shading gradients or cute nursery styling.
- Structural artwork requirement: **a genuinely continuous illustration stroke**, verifiable as one unbroken path (caption typesetting can be separate). Pixel art and multiple brush marks can LOOK continuous without meeting this requirement; do not certify continuity from appearance.
- Character: recognisable, youthful/unaged hedgehog, world-weary expression; artwork and joke should reinforce each other.
- Copy: British, observational but genuinely biting sarcasm; short punchline preferred; text edited for spelling and visual legibility. No brand name, style name or promotional phrases printed on art.
- Output: physical paper print **only**, intended to have **unframed Print Only** variation, with sizes **A5 and A4 only**. No A3, frames or digital files.

## Run structure: six designs, two thematic sets of three

| # | Short name | Image caption | Set |
| - | - | - | - |
| 01 | The Blame | Good news. They've found someone else to blame. | News & Blame |
| 02 | Democracy | Well, that's democracy sorted. | News & Blame |
| 03 | The Experts | Oh look. The experts are surprised again. | News & Blame |
| 04 | Another Meeting | I'm sure another meeting will fix it. | The Usual Nonsense |
| 05 | Comment Section | Brilliant. We're being led by the comments section. | The Usual Nonsense |
| 06 | Historic Disaster | Another historic disaster. How original. | The Usual Nonsense |

Note: a first six-image rough-marker **concept** exists in the current conversation as three- and six-image ZIPs. Its six hedgehog compositions are extremely similar, and none has been independently verified as a single continuous line. **Do not approve those concept outputs for Etsy solely because the metadata ZIP passes validation.** Redraw to provide six distinct situations/poses before using the run as a commercial launch, unless the owner expressly accepts repeated composition.

## Existing uploader contract (read from current application branch)

`public/bulk-zip.mjs` accepts a 2–6-image folder ZIP; every poster needs `poster.png` plus `details.md`. A top-level collection folder is optional. For a **six-poster run intended to generate eight listings**, supply two independent manifests `bundle-1.md` and `bundle-2.md` beside the six poster folders:
- Each `details.md`: `Title`, `Listing title`, `Section: Streak`, `Sizes: A5, A4`, `Tags` (13 unique, <=20 characters), a separate `Description:` heading and body. Required title must identify print/poster/wall art. No arbitrary `Finishes` field: current importer rejects it.
- Each `bundle-N.md`: `Title`, `Listing title`, `Section: Streak`, `Size: A4`, `Members` (exactly three poster folder names), `Tags` (13 distinct), separate `Description:` and 100+ character copy including explicit AI assistance, exactly three unframed paper prints and A4.
- A six-poster ZIP with both manifests is a request for **six individual product listings plus two fixed-size trio-bundle listings**. The uploader asks for distinct supplier bundle SKU/title/discount during review.
- Alternatively upload two separate three-folder ZIPs, producing three singles from each (no bundle product from a standalone trio ZIP).
- **NEVER upload both the combined ZIP and two standalone ZIPs**; that risks duplicate listings and unnecessary fees.

## Technical and release blockers

1. **Shop section:** The code-level section registry on this development branch now includes `Streak`; this does NOT create the section in the actual Etsy shop. Verify an active actual Etsy section before preparing or publishing. Seller API section mapping must read it back.
2. **Finish constraint:** Existing physical-product templates use A5/A4 combined with all four finish types (Print Only, Black, White and Oak Frame). They do **not** yet enforce this project's required unframed-only option for individual physical listings. Before publication, implement and test a per-product print-finishes selection end-to-end through review, Etsy variants, supplier mapping and readback. Do not publish framed Streak variants accidentally.
3. **Bundles:** The current trio implementation offers one fixed size per bundle (`Size: A4` in the supplied concept). A5 trio variants are NOT automatically offered. Extending to A4+A5 bundle variants needs a separate engineering review.
4. **Source resolution:** Six initial generated images were 1055×1491 raster and exported to 2480×3508 with 300 DPI metadata. These were **resampled**, not native 300 PPI illustrations. Passing a dimension check is not evidence of detail; demand a physical proof at A4 and legibility/trim verification at A5.
5. **Artwork QA:** Current six drawings repeat near-identical composition and the unbroken-stroke property is unverified. Set a launch HOLD until creative QA.
6. **Etsy & supplier:** Original source artwork, consumer-facing images, authentic product photography if required by current Etsy rules, SKUs, processing, prices, postage, PrintShrimp unframed availability and approval-by-product are independent live checks. No seller writes or orders as part of staging this category.

## Operational deliverables and future handover

In conversation on 2026-11-03, three generated artifact names were:
- `Streak_Set_1_News_3_Posters.zip` (three posters, three metadata files).
- `Streak_Set_2_The_Usual_3_Posters.zip` (three posters, three metadata files).
- `Streak_Full_Run_6_Posters_2_Trios.zip` (six posters, six details, two trio manifests).

These sandbox ZIPs are conversation files, **not binary assets committed to Git**. Preserve downloaded copies externally and do not infer their presence in the repository. XML/PNG media is not changed by this source-only branch.

## QA before sale
- Each poster concept is distinct and recognisable; sarcasm and typography proofread.
- One actual continuous drawing path (if advertising as one-line), ink contrast and margins checked.
- A4/A5 print proofs sharp enough at normal viewing distance, with verified A-series aspect.
- Streak is a real Etsy shop section; exact size/finish variants are the only intended options.
- 13 Etsy tags, unique titles, accurate AI disclosure, physical-not-digital wording, truthful unframed claim, one approval per actual product.
- Archive import test on exact reviewed app version before any Etsy write. Monthly listing cap and costs checked.
