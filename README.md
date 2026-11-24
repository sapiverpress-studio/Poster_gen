# Sapiver Poster Gen

One private product review and publication system for Sapiver Prints physical posters and digital ZIP downloads.

**Start here:** read [AGENTS.md](AGENTS.md), then the current snapshot and latest history in [docs/PROJECT_STATUS.md](docs/PROJECT_STATUS.md). [docs/UNIFIED_PRODUCTS.md](docs/UNIFIED_PRODUCTS.md) describes the current implementation, limits, tests, release state and outstanding live checks. Historical guides remain for earlier decisions.

## Five phone wallpapers — staged 24 November 2026

The bulk uploader now has a staged **5 phone wallpapers** choice for one digital bundle. It accepts arbitrary safe image filenames, validates five portrait JPG/PNG files at least 1440 × 3200 pixels, imports prepared listing metadata and preserves customer bytes. The existing review/Deploy gate remains. Local Node 24 verification: **671/671 tests passed**; production release and Android acceptance are pending. Package format: [docs/PHONE_WALLPAPERS.md](docs/PHONE_WALLPAPERS.md).

## Current workflow — studio live; seller-kit extension staged

Upload the finished checked PNG or digital ZIP once, review the prepared product, correct its details if needed, and press **Deploy** as final per-product publication approval. Uploading alone never publishes. The product dashboard filters type, subject and status and retains Etsy IDs/URLs, download files, errors and applicable PrintShrimp mapping.

- Physical: new uploads use **A4 and A5** × Print Only/Black/White/Oak, with eight choices per individual poster. An A-series portrait PNG at 2480 × 3508 pixels or larger can be used directly. A square PNG at least 2480 × 2480 pixels is fitted proportionally to a separate A4 print page for review. Existing listings retain their saved options and merchant IDs. Artwork replacement on existing physical products is blocked pending verified supplier update support.
- Digital: staged seller-kit import separates buyer ZIPs, listing photographs and seller notes; optional embedded licence/instructions. Invalid SVG dimensions stop validation. Existing validated private ZIP, original customer-file preservation, independent lossless ZIP splitting within Etsy's five-file/20 MB limits where possible, labelled artwork previews, actual licence/instructions and no physical delivery. Updates replace files on the same listing ID with verification before reactivation.
- Existing Canva source `DAHXUnmHofY` is preserved. A3 working copy `DAHXb1PdJlM` and prior private export are not recreated.

## Code and checks

- `lib/product-*.mjs`: product metadata, private records, review/dashboard UI.
- `lib/digital-archive.mjs`, `lib/digital-product.mjs`: ZIP validation, preservation and digital Etsy publication.
- `lib/uploaded-poster.mjs`, `lib/poster-template.mjs`: existing physical route with eight framed and unframed variants for new uploads.
- `lib/github-*.mjs`, `scripts/github-publication.mjs`: scoped GitHub OIDC worker, queue and private transport.
- `netlify/functions`: existing Canva/OAuth and product endpoints; `public/poster-upload.mjs`: owner upload/review script.
- Node **24** (`.nvmrc`); `npm ci --ignore-scripts`, then `npm test`. 125 automated tests passed for the 12-option production release; the staged Poster type UI and numbered-PNG fixes passed 130 automated tests. Merchant fixtures are not live verification.

## Deployment and credentials

Last independently verified live studio release is **5fc9e9349b48442c21deae93576d48230d088ac8**, Netlify Ready deploy **6acdf835e30338e9047cbd01** (2026-10-13). Twelve physical options, Poster type UI and Etsy catalogue diagnostics are live, but Etsy seller OAuth is **NOT connected**. Immediate-code-exchange correction is isolated on `fix/etsy-immediate-code-exchange-20261013`; this is NOT deployed. Studio home/login/upload/dashboard routes respond; real owner/device acceptance and Etsy worker/bootstrap/seller consent remain unverified. Main has the scoped publication worker installed. Seller-kit importer is staged on `feature/digital-seller-kit` and requires a separate approved release.

Existing GitHub secrets are used by the staged merchant worker: Etsy application pair and PrintShrimp key stay server-side. Normal Etsy seller consent, updated scopes, verified reference/frame configuration and real integration tests remain required. See [docs/GITHUB_PUBLICATION.md](docs/GITHUB_PUBLICATION.md). Do not copy credentials into repository, browser or logs.

A separate owner-approved controlled release was completed on 2026-10-13. Subsequent work remains **off-production without new deployment approval**. Do not push the Netlify-linked production branch, install/activate the main worker, enable publication, create live merchant records or spend deployment credits without the appropriate owner release/test authorisation. Batch one reviewed release; preserve existing products and artwork. Deploy on the website is per-product approval, not software-release approval. No automatic PrintShrimp orders.

## Staged Poster type upload improvement (2026-10-13)

On the **non-production** branch `fix/poster-type-ui-20261013`, physical products default to **Printed artwork**, followed by **Educational poster** and **Dinosaur poster**, while digital downloads retain their existing product-group selection. The form displays **Poster type** for physical designs. Travel and botanical prints no longer inherit educational-poster defaults. A numbered Canva download such as `47271.png` can be uploaded when the owner enters a descriptive Name; the stored original filename and derived stable SKU are kept separately. All four print/frame mockups can be viewed during private review. New GitHub CI suite: **130/130 passing** (run 38360653699). No Etsy publishing or PrintShrimp ordering is enabled by these changes. A separately approved production release and authenticated mobile verification are still needed.

## Read-only Etsy API catalogue diagnosis — staged 2026-10-13

The GitHub repo already holds the Etsy app and PrintShrimp API secret names; GitHub Actions worker successfully bootstraps, but application keys do **not** establish seller OAuth. An empty reference dropdown is a missing `template/catalog` result, not a PNG problem. The staged `fix/etsy-api-catalog-diagnostics-20261013` branch adds a CSRF-protected owner button to queue a **read-only** seller catalogue refresh on the existing OIDC-authenticated GitHub worker. The worker saves only safe status codes (`seller_consent_required`, `seller_consent_invalid`, `seller_refresh_error`, `etsy_api_unavailable`, `empty`, `available`), not provider errors or credentials. Uploader displays these and returns a helpful 409 before any file upload when no reference was selected; an active Etsy listing still must pass 12-variant/profile validation during preparation and is not pre-verified just because it appeared in the catalogue. The private status endpoint does not enable Etsy publication or PrintShrimp ordering. GitHub CI run 38365953268 passed 134/134 tests. A separately approved controlled production deployment and actual owner/API verification are outstanding.

## Etsy OAuth — immediate exchange fix in progress (2026-10-13)

Owner Etsy authorisation redirected successfully but the connection was queued for the GitHub worker and failed. Queueing a short-lived browser code until GitHub's unpredictable scheduled run replays the callback is a design error. The off-production `fix/etsy-immediate-code-exchange-20261013` branch exchanges the Etsy PKCE code immediately inside `/etsy/callback` using only the existing public app keystring, seals the grant in private Netlify storage, and queues the GitHub worker to verify SapiverPrints identity using the existing GitHub-only API shared secret. It retains the original 10-minute consent exchange window, secures a read-only callback status beyond that window, supports access-token refresh if the worker is delayed, and never queues a browser cookie, Etsy code or OAuth token. It does **not** create listings, publish products, make PrintShrimp orders or automatically deploy to production. First test run 38389347670 had 143/144 pass; a token-validation regex correction has been staged for the rerun. See `docs/PROJECT_STATUS.md` for the final test status and release gate.
