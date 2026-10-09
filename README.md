# Sapiver Poster Gen

One private product review and publication system for Sapiver Prints physical posters and digital ZIP downloads.

**Start here:** read [AGENTS.md](AGENTS.md), then the current snapshot and latest history in [docs/PROJECT_STATUS.md](docs/PROJECT_STATUS.md). [docs/UNIFIED_PRODUCTS.md](docs/UNIFIED_PRODUCTS.md) describes the current implementation, limits, tests, release state and outstanding live checks. Historical guides remain for earlier decisions.

## Current workflow — studio live; seller-kit extension staged

Upload the finished checked PNG or digital ZIP once, review the prepared product, correct its details if needed, and press **Deploy** as final per-product publication approval. Uploading alone never publishes. The product dashboard filters type, subject and status and retains Etsy IDs/URLs, download files, errors and applicable PrintShrimp mapping.

- Physical: A5/A4/A3 × Black/White/Oak, exactly **nine** framed combinations. Existing template/settings and one unchanged master are reused; no automatic orders. Metadata updates retain merchant IDs. Artwork replacement on existing physical products is blocked pending verified supplier update support.
- Digital: staged seller-kit import separates buyer ZIPs, listing photographs and seller notes; optional embedded licence/instructions. Invalid SVG dimensions stop validation. Existing validated private ZIP, original customer-file preservation, independent lossless ZIP splitting within Etsy's five-file/20 MB limits where possible, labelled artwork previews, actual licence/instructions and no physical delivery. Updates replace files on the same listing ID with verification before reactivation.
- Existing Canva source `DAHXUnmHofY` is preserved. A3 working copy `DAHXb1PdJlM` and prior private export are not recreated.

## Code and checks

- `lib/product-*.mjs`: product metadata, private records, review/dashboard UI.
- `lib/digital-archive.mjs`, `lib/digital-product.mjs`: ZIP validation, preservation and digital Etsy publication.
- `lib/uploaded-poster.mjs`, `lib/poster-template.mjs`: existing physical route, now nine framed variants.
- `lib/github-*.mjs`, `scripts/github-publication.mjs`: scoped GitHub OIDC worker, queue and private transport.
- `netlify/functions`: existing Canva/OAuth and product endpoints; `public/poster-upload.mjs`: owner upload/review script.
- Node **24** (`.nvmrc`); `npm ci --ignore-scripts`, then `npm test`. 120 local tests pass; merchant fixtures are not live verification.

## Deployment and credentials

Live studio release is **fdefb3837207d748c7686da2e3d31cdea5ea37ab**, Ready deploy **6ac8e5d54698390008de1f60**. Studio home/login/upload/dashboard routes respond; real owner/device acceptance and Etsy worker/bootstrap/seller consent remain unverified. Main has the scoped publication worker installed. Seller-kit importer is staged on `feature/digital-seller-kit` and requires a separate approved release.

Existing GitHub secrets are used by the staged merchant worker: Etsy application pair and PrintShrimp key stay server-side. Normal Etsy seller consent, updated scopes, verified reference/frame configuration and real integration tests remain required. See [docs/GITHUB_PUBLICATION.md](docs/GITHUB_PUBLICATION.md). Do not copy credentials into repository, browser or logs.

Jim authorised development, **not production deployment**. Do not push the Netlify-linked production branch, install/activate the main worker, enable publication, create live merchant records or spend deployment credits without the appropriate owner release/test authorisation. Batch one reviewed release; preserve existing products and artwork. Deploy on the website is per-product approval, not software-release approval. No automatic PrintShrimp orders.
