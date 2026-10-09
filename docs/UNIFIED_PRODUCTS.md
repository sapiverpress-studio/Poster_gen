# Unified Sapiver Prints products — implementation and release handover

Status: **implemented and tested off production; not released**. This is the current workflow direction, superseding the older twelve-option upload description. Production remains the approved 7d1979660f9d830f950189d16ccb78b886dc3d40 release. Existing Canva export routes, stored artwork and original design remain intact.

## Owner workflow

Sign in using the existing website owner session. `/poster/upload` offers Physical Print or Digital Download and displays relevant fields. Upload the checked original once; preparation creates a private review. Review name, subject, group, price, taxonomy, shop section, previews, description, tags and customer files. Correct details without another upload. **Deploy** is explicit final approval of that revision. Uploading, preparing, correcting metadata and viewing the dashboard never publish. Publication can remain queued while the GitHub worker collects it. No additional approval follows Deploy. Validation or integration failures stop processing and expose retained IDs and an attention status.

`/poster/products` filters by type, subject and publication status. Records retain published and pending revisions separately, original customer-file metadata, Etsy ID/URL, supplier mapping, preview and errors. Update an existing record rather than upload a new product merely to change its name or description. Digital and physical versions of one design remain separate product records/listings.

## Stage 1: upload, ZIP validation and private storage

- Physical: unchanged PNG master; existing A-series/300 PPI at A3 checks, 50,000,000-byte limit and actual Sharp decoding. No new Canva exports.
- Digital: ZIP up to 100,000,000 bytes in existing private 2 MB transport chunks. Up to 100 entries, 50 MB per expanded file, 200 MB expanded total, compression ratio at most 100:1. Conservative limits are intentional.
- Verify ZIP local/central headers, data ranges, path traversal, case/Unicode-normalised duplicate names, checksums, encryption, compression method, links/special files, expansion limits and file content. No nested archives or executable formats. PNG/JPG/JPEG, PDF, genuine SVG, TXT/MD and JSON are supported. Unknown formats are rejected.
- Raster images are actually decoded. SVG is parsed with entities, scripts and external references denied. PDF is parsed, encrypted/invalid PDFs and known active/embedded action objects rejected, including compressed objects. This is format validation and active-content screening, **not an antivirus guarantee**.
- Original ZIP and each contained customer-file payload remain unchanged. If the original ZIP fits Etsy it is delivered intact, with a separate seller-written licence/instruction TXT. Otherwise independently extractable ZIP parts preserve every original file byte; no artwork is rescaled or degraded. An individual file that cannot fit or a package needing more than five parts is blocked. This is not a multipart ZIP requiring special software.
- Current Etsy maximum is five files, 20 MB each; implementation uses a conservative 20,000,000-byte cap and exact generated archive sizes. ZIP is supported.
- Actual PNG/JPEG/SVG artwork produces up to three labelled digital listing previews. PDF-only packages require a separate PNG/JPG preview supplied with the same website submission. Optional preview conversion affects the listing illustration only; it does not modify the original package. Repeat/seamless correctness remains the owner's explicit check.
- Product name derives from the original filename and can be corrected. Digital prices, actual licence and download/use instructions are required. Supplied formats/pixels/pages are measured; no universal print size, DPI, commercial licence or benefits are invented.

## Stage 2: Etsy types, taxonomy and sections

The existing seller session and API client are reused. OAuth scopes now include `shops_r shops_w listings_r listings_w`; `shops_w` is needed to create shop sections. Older sessions lacking it must reconnect normally. Keys in GitHub do not replace seller consent.

Digital drafts use `type=download`, `who_made=i_did`, the currently supported `when_made=2020_2026`, approved GBP price, accurate description, at most 13 tags, verified taxonomy and shop section. Customer files are attached through `/shops/{shop}/listings/{listing}/files` with multipart file/name/rank, then their IDs, names and byte sizes are read back. Preview images are attached and checked. No shipping/readiness profile, production partner, physical inventory or PrintShrimp operation is sent on this route. The description explicitly says no physical item will be shipped.

Marketplace taxonomy IDs come from the live seller taxonomy, not hard-coded guesses. Printable posters resolve an actual leaf named Digital Prints; seamless patterns resolve Clip Art & Image Files. Ambiguous/missing categories stop preparation. Bundles require an owner choice between compatible verified leaves based on their actual contents. This deliberately avoids miscategorising a bundle from its filename. Physical artwork uses the verified template/owner-selected compatible physical category.

Etsy custom shop sections are flat: at most twenty, titles at most 24 characters, each listing in one section. Empty sections are not customer-visible. Suggested initial structure:

| Internal group | Shop section | Product type |
| --- | --- | --- |
| Seamless pattern | Seamless Patterns | Digital |
| Printable poster | Printable Posters | Digital |
| Digital design bundle | Digital Design Bundles | Digital |
| Educational poster | Educational Posters | Physical |
| Dinosaur poster | Dinosaur Posters | Physical |
| Other printed artwork (create when needed) | Printed Artwork | Physical |

Digital Downloads and Printed Posters are internal type groupings, not invented parent Etsy sections. Subject remains a separate internal classification. The worker reuses an exact normalised title or creates a section once after Deploy, verifies it and binds its ID. Duplicate names, twenty existing sections and uncertain section creation stop safely. No live sections were created during development.

## Stage 3: Deploy, updates and failure handling

Retain the existing owner HttpOnly session, CSRF and strictly verified GitHub OIDC queue/bridge. Provider keys remain in GitHub secrets; neither browser nor repository receives their values. Private site-wide Blobs store originals, deliverables, previews, approval records and product revisions. A trusted GitHub worker reads only allowed stores/key families through bounded transport with ETag checks; ZIP originals can now exceed the physical-master 50 MB cap. See GITHUB_PUBLICATION.md for trust boundaries. No live Blobs test writes were used: site-wide stores are shared between deploy contexts.

Approve hashes bind customer archive, deliverables, listing plan and preview hashes. Superseded reviews cannot deploy. Atomic only-if-new queue, revision, filename/SKU and creation claims prevent repeat merchant writes. An uncertain provider operation retains its claim and known IDs: **the system stops for investigation, rather than automatically retrying a potentially successful creation**. These records are fail-closed projections/claims in the existing store, not a multi-record transactional database. A killed worker can leave an in-progress record; inspect it before any administrative recovery.

Digital update: snapshot existing seller-owned listing/files during review, check it has not changed before writing, deactivate, replace files and visible preview set on the same Etsy ID, read everything back, then activate. Failure can leave the listing inactive or files partly replaced; original packages/revisions are retained for controlled recovery. It does not silently announce success or create a replacement listing.

Physical configuration is exactly A5/A4/A3 × Black/White/Oak: nine framed variants, priced £49.99/£54.99/£64.99 respectively. Existing physical template footer, profiles and verified production partner are reused. Supplied older twelve-option references can provide the matching nine approved combinations; new listings omit Print Only. Existing live listings are not rewritten by this software change. One master maps to three PrintShrimp print sizes and the existing shared SKU. **No order endpoint or automatic print order is introduced.** Frame recognition and physical print quality still need actual supplier verification.

Physical name/description/tag/category updates keep Etsy and PrintShrimp IDs, verify inventory/profiles and require the unchanged master checksum. **Replacing artwork on an existing physical product is intentionally blocked** pending a verified PrintShrimp update schema; making up a supplier PUT payload would risk incorrect fulfilment.

## Stage 4: validation evidence and remaining checks

114 automated tests pass locally and independently in GitHub Actions on Node 24. Code candidate `45240c8b6ceb6f34442074e68e304d87cc735210`; Verify Poster_gen run [37915156120](https://github.com/sapiverpress-studio/Poster_gen/actions/runs/37915156120) completed SUCCESS, including clean install and module imports. These include existing Canva/export/auth regressions and new real PNG/JPEG/SVG/PDF/ZIP decoding, payload preservation, exact split sizes, malformed/encrypted/link/nested/expansion/CRC rejection, compressed PDF actions, active SVG, approval/file/preview changes, digital create/update, files and sections, partial failures, stale approval, duplicate claims, 51 MB ZIP bridge roundtrip, digital worker isolation, nine physical variants, supplier failure, same-ID physical metadata updates and rejected artwork replacement. Interface script tests exercise relevant fields, original ZIP chunk upload, CSRF, validation messages and preparation without publication. Merchant API calls use controlled fixtures, not live listing writes.

Initial legacy assertions expected twelve variants and the old description; they failed after the approved configuration change, were updated to nine/explicit physical wording, and the full suite then passed. Preview reuse and physical-preview hash binding were corrected and covered by regression tests.

Playwright screenshot testing was attempted, but no browser was installed and its browser download failed with an invalid/truncated ZIP. No full-browser visual or real Android claim is made. Listing-preview generation is exercised with real images; UI/device acceptance remains a release check.

**Live audit:** current Netlify deploy remains 6ac88cdf08cadc0008385789 Ready at production 7d19796. Uploader, owner workflow and Etsy start currently return setup-incomplete 503; Canva approved-report route responds. Default main still lacks the GitHub publication workflow. Existing GitHub provider secrets previously passed read-only HTTP 200 preflight; that does not establish Etsy seller consent, framed fulfilment or publication.

## Stage 5: next authorised release work

This code replaces the older unreleased GitHub-worker candidate and is saved with the current handover on the established off-production branch. It does not advance the Netlify-linked production branch, install the main worker, enable publication or alter existing merchant records.

Before one owner-approved production software release: verify the reviewed candidate, Netlify branch/build controls, Node 24 Function compatibility and function bundle imports; preserve Canva source/token/export state. Install the narrowly scoped publication YAML on default main only with release authorisation, then verify real OIDC/bootstrap/queue processing. Connect the owner to Etsy with the updated scopes and exact registered callback. Test seller taxonomy/sections, reference settings, actual file upload/readback and Edge-to-supplier download under a controlled merchant test plan. Verify frame recognition and print proof. Test the owner interface on an actual mobile/desktop browser. Keep `POSTER_PUBLICATION_ENABLED` off until essential live checks pass; thereafter each owner's Deploy is final product publication approval. Never enable orders.

Outstanding: no live digital publication or real supplier frame test; no recovery UI for ambiguous merchant writes; physical artwork replacement blocked; browser visual acceptance pending; no comprehensive malware scanner; GitHub schedules can be delayed beyond the OAuth code window and require fresh consent.

## Primary references (checked 2026-10-09)

- Etsy digital file limits: https://help.etsy.com/hc/en-gb/articles/115015628347-How-to-Manage-Your-Digital-Listings
- Etsy sections: https://help.etsy.com/hc/en-us/articles/360000345048-How-to-Create-and-Manage-Shop-Sections
- Etsy listing/file tutorial: https://developers.etsy.com/documentation/tutorials/listings/
- Etsy shop/section tutorial: https://developers.etsy.com/documentation/tutorials/shop_management/
- Etsy official OpenAPI (request schemas, shops_w, multipart file rank and DELETE 204): https://www.etsy.com/openapi/generated/oas/3.0.0.json
- ZIP libraries: https://github.com/thejoshwolfe/yauzl and https://github.com/thejoshwolfe/yazl

## Seller-kit input extension (2026-10-09; staged, not yet live)
A Pattern Forge seller kit may contain buyer ZIPs under UPLOAD-TO-ETSY, up to three PNG/JPG listing photographs under LISTING-IMAGES and the optional root seller checklist/quality report. A tightly scoped envelope parser permits only this one archive level; all inner buyer archives remain strictly validated. Their exact bytes become customer downloads, images become gallery previews and outer seller notes remain private. The upload form can read LICENSE.txt/LICENCE.txt and README.txt/INSTRUCTIONS.txt instead of requiring retyping. Price, category/group and repeat confirmation remain owner decisions. Licence/instruction edits that disagree with a kit's included documents stop review. Invalid SVG dimensions, unexpected kit contents, oversized packages and unsafe archives stop before any listing write.

The supplied test kit reveals an exporter defect: SVG width/height are undefinedin. It is recognised structurally but deliberately blocked until corrected. Original kit bytes are never silently rewritten. Boundary continuity of its raster tiles is verified but does not establish SVG validity or sale readiness.
