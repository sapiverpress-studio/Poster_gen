# Sapiver Poster Gen

One private product review and publication system for Sapiver Prints physical posters and digital ZIP downloads.

**Start here:** read [AGENTS.md](AGENTS.md), then the current snapshot and latest history in [docs/PROJECT_STATUS.md](docs/PROJECT_STATUS.md). [docs/UNIFIED_PRODUCTS.md](docs/UNIFIED_PRODUCTS.md) describes the current implementation, limits, tests, release state and outstanding live checks. Historical guides remain for earlier decisions.

## Current workflow — studio live; seller-kit extension staged

Upload the finished checked PNG or digital ZIP once, review the prepared product, correct its details if needed, and press **Deploy** as final per-product publication approval. Uploading alone never publishes. The product dashboard filters type, subject and status and retains Etsy IDs/URLs, download files, errors and applicable PrintShrimp mapping.

- Physical: A5/A4/A3 × Print Only/Black/White/Oak, exactly **twelve** framed/unframed combinations. Existing template/settings and one unchanged master are reused; no automatic orders. Metadata updates retain merchant IDs. Artwork replacement on existing physical products is blocked pending verified supplier update support.
- Digital: staged seller-kit import separates buyer ZIPs, listing photographs and seller notes; optional embedded licence/instructions. Invalid SVG dimensions stop validation. Existing validated private ZIP, original customer-file preservation, independent lossless ZIP splitting within Etsy's five-file/20 MB limits where possible, labelled artwork previews, actual licence/instructions and no physical delivery. Updates replace files on the same listing ID with verification before reactivation.
- Existing Canva source `DAHXUnmHofY` is preserved. A3 working copy `DAHXb1PdJlM` and prior private export are not recreated.

## Code and checks

- `lib/product-*.mjs`: product metadata, private records, review/dashboard UI.
- `lib/digital-archive.mjs`, `lib/digital-product.mjs`: ZIP validation, preservation and digital Etsy publication.
- `lib/uploaded-poster.mjs`, `lib/poster-template.mjs`: existing physical route, now twelve framed/unframed variants.
- `lib/github-*.mjs`, `scripts/github-publication.mjs`: scoped GitHub OIDC worker, queue and private transport.
- `netlify/functions`: existing Canva/OAuth and product endpoints; `public/poster-upload.mjs`: owner upload/review script.
- Node **24** (`.nvmrc`); `npm ci --ignore-scripts`, then `npm test`. 125 automated tests passed for the 12-option production release; the staged Poster type UI and numbered-PNG fixes passed 130 automated tests. Merchant fixtures are not live verification.

## Deployment and credentials

Verified live studio release is **b9a43c7f8badbba63a15d6cf286ccd497845e4ce**, Ready deploy **6acdd45c0139075548cf8ac9** (2026-10-13). Poster type UI changes are staged on `fix/poster-type-ui-20261013` and are NOT deployed. Studio home/login/upload/dashboard routes respond; real owner/device acceptance and Etsy worker/bootstrap/seller consent remain unverified. Main has the scoped publication worker installed. Seller-kit importer is staged on `feature/digital-seller-kit` and requires a separate approved release.

Existing GitHub secrets are used by the staged merchant worker: Etsy application pair and PrintShrimp key stay server-side. Normal Etsy seller consent, updated scopes, verified reference/frame configuration and real integration tests remain required. See [docs/GITHUB_PUBLICATION.md](docs/GITHUB_PUBLICATION.md). Do not copy credentials into repository, browser or logs.

A separate owner-approved controlled release was completed on 2026-10-13. Subsequent work remains **off-production without new deployment approval**. Do not push the Netlify-linked production branch, install/activate the main worker, enable publication, create live merchant records or spend deployment credits without the appropriate owner release/test authorisation. Batch one reviewed release; preserve existing products and artwork. Deploy on the website is per-product approval, not software-release approval. No automatic PrintShrimp orders.

## Staged Poster type upload improvement (2026-10-13)

On the **non-production** branch `fix/poster-type-ui-20261013`, physical products default to **Printed artwork**, followed by **Educational poster** and **Dinosaur poster**, while digital downloads retain their existing product-group selection. The form displays **Poster type** for physical designs. Travel and botanical prints no longer inherit educational-poster defaults. A numbered Canva download such as `47271.png` can be uploaded when the owner enters a descriptive Name; the stored original filename and derived stable SKU are kept separately. All four print/frame mockups can be viewed during private review. New GitHub CI suite: **130/130 passing** (run 38360653699). No Etsy publishing or PrintShrimp ordering is enabled by these changes. A separately approved production release and authenticated mobile verification are still needed.
