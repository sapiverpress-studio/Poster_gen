# Sapiver Poster Gen — living status, decisions and handover

> **MANDATORY:** Read root [AGENTS.md](../AGENTS.md) before modifying this project. Every change or significant development must update this file. The snapshot below is authoritative for the **current stage**; later sections contain dated **historical** entries that may describe earlier incomplete stages.

## CURRENT PROJECT SNAPSHOT — 2026-10-09 11:42 UTC

| Area | Current evidence-based state |
| --- | --- |
| Direction | **Owner-authorised release:** Jim approved one bundled release of candidate 45240c8 and installation of the main GitHub worker on 2026-10-09 at 12:06 BST. Product publication stays disabled; no orders authorised. Deploy remains per-product approval. |
| Live production | **VERIFIED LIVE:** Ready deploy `6ac8d2cde89cc000087e87c9`, corrective commit `e6e70b0753100008df3cb5a70aedd4fc2e903f8b`, production branch `feature/canva-oauth-callback`; published 2026-10-09 11:41:20 UTC. Zero scanner matches. |
| Live routes | Fresh unauthenticated checks: owner workflow, uploader and dashboard return HTTP 200 (login pages; not authenticated acceptance). Etsy start returns 503 awaiting worker bootstrap. Canva routes preserved. |
| Development | Local `feature/unified-products`; code/tests/docs saved as `45240c8b6ceb6f34442074e68e304d87cc735210` on established off-production `docs/handover-and-change-policy-20261008`. Supersedes unreleased GitHub-worker candidate `5413ef62acd9552650336a6fed4ffa43dcdc142d`. |
| Digital | **IMPLEMENTED / FIXTURE-TESTED:** secure ZIP validation/private storage, original-file preservation, Etsy-limit splitting, accurate metadata/previews, digital listing/file attachment/sections and same-ID updates. No PrintShrimp or physical profiles. |
| Physical | **IMPLEMENTED / FIXTURE-TESTED:** exactly A5/A4/A3 × Black/White/Oak = **nine** framed variants, approved £49.99/£54.99/£64.99 prices, preserved template/settings, one master/shared SKU/supplier mapping. No automatic orders. Older twelve-option notes are superseded for new listings, not a live migration. |
| Approval / reliability | Hash-bound Deploy, queue/revision/SKU claims, stored IDs and safe stop after partial/uncertain API operations; no automatic repeat creation. Physical previews now hash-bound too. |
| Dashboard / edits | Type/subject/status filters, files, previews, Etsy URL, supplier ID and attention errors. Digital files and physical metadata update existing IDs. Physical artwork replacement blocked until supplier update schema verified. |
| Tests | **115 local tests pass** after public-origin fix, including tracked-file scanner regression. Prior candidate remote CI 114/114 passed. Real Netlify Function/Edge packaging now passed; live merchant writes and device acceptance unverified. |
| GitHub worker | Staged worker reuses existing GitHub provider secrets. Publication YAML installed on main in c36dd37c8a69b1153493aec16405e28dcef06b76. Schedule is configured; actual execution/OIDC acceptance and seller consent remain unverified. |
| Etsy access | Existing key pair and supplier key previously returned HTTP 200 in read-only preflight. Seller OAuth NOT established by those keys; updated `shops_w` consent required for section creation. No live sections/listings changed. |
| Canva | Original `DAHXUnmHofY` preserved. Working A3 `DAHXb1PdJlM`; existing owner report confirmed 3508 × 4961 PNG, 37.4 MiB, A3 300/A4 424/A5 600 PPI. No new export or artwork change. Visual print/sample and framed fulfilment remain unverified. |
| Release / credits | Owner approved bundled release and worker installation. First attempt failed public-origin scan; corrective release is Ready. Publication flag not changed; no merchant writes/orders. No more release needed for this scanner fix. |
| Next stage | Release authorisation received; corrective candidate e6e70b0 passes 115 local tests. Verify successful Netlify build, real worker/OAuth/routes/categories/files/supplier frame delivery and owner browser interface before enabling per-product publication. |

### Current implementation and explicit limits

Read [UNIFIED_PRODUCTS.md](UNIFIED_PRODUCTS.md) for stage-by-stage changes, Etsy limits and section design, exact tests, update semantics, storage/security, failures and remaining integration checks. Marketplace taxonomy, flat Etsy shop sections and internal types/subjects remain separate. Five initial sections are recommended, with Printed Artwork created only when needed. Bundles require an actual compatible category choice rather than automatic guessing.

Current code is development-complete for the documented scope; production operation is **BLOCKED / NOT VERIFIED**. No known-working Canva functionality is replaced. Historical statements below about twelve variants, a separate post-upload approval, earlier SHAs or completed deployment do not describe this staged unified release.

### Commands and routes

- Node 24: `npm ci --ignore-scripts`; `npm test`.
- Owner login `/poster/workflow`; product upload/review `/poster/upload`; dashboard `/poster/products`.
- Existing Canva report/download remain session-protected; do not expose stored artwork or signed URLs.
- Publication defaults disabled. No automatic supplier orders.

## Documentation and change-recording rule

See [AGENTS.md](../AGENTS.md). **Before completing any development or project change, update this snapshot if the current state changed and append an accurately dated record below** with affected files/Canva IDs, branch, evidence, test results (including failed ones), credit/deploy impact, remaining issues and next authorised step. Keep secrets out of Markdown.

---

## Development history (chronological records; older status statements are historical)

## 2026-10-08: Canva OAuth callback scaffold

Repository initialised with a minimal README on main. Working branch: feature/canva-oauth-callback.

Implemented:
- HTTPS-pinned callback address and password-protected start form.
- OAuth 2.0 Authorization Code + SHA-256 PKCE with a separate CSRF state.
- 10-minute encrypted Secure/HttpOnly/SameSite=Lax browser session cookie.
- Server-only code exchange and encrypted token record in private site-wide Netlify Blobs.
- Default-deny if configuration missing; no tokens returned to the browser.
- Local tests for OAuth helper logic.
- No writes to Sapiver Press sites.

NOT implemented: design exports, refresh-token rotation, Etsy publishing, PrintShrimp fulfilment, print-file storage and automatic product synchronisation.

Required before authorisation: create/connect a dedicated Netlify project, set its four environment variables with Functions scope, deploy branch, register exact callback URL in Canva, then perform real interactive OAuth testing.

Security notes: client-secret rotation requires Canva re-authorisation; GitHub Actions secrets are NOT implicitly available to a Netlify runtime. This public repository must not contain API secrets, customer data or high-resolution master artwork.

Next: verify tests; deploy isolated Netlify callback; authorise once; then build a single-writer refresh mechanism and audited Canva exporter before listing/fulfilment work.

## Netlify project reserved (2026-10-08)

- Project name: sapiver-poster-gen-auth.
- Netlify project ID: d1753fca-2098-4b96-a684-75921df7c3da.
- Target origin: the value of the Netlify environment variable CANVA_SITE_ORIGIN (not copied into the public repo).
- Required Canva redirect: append /canva/callback to CANVA_SITE_ORIGIN.
- **The project is newly created and NOT deployed or connected to GitHub yet.** The target redirect is NOT live until a successful deploy.
- Tests checked using a local Node 22 copy with Git blob hashes verified against GitHub: all 4 OAuth helper tests passed. Server function passes node --check with matching Git blob hash. **Real Netlify build and Canva OAuth exchange remain untested.**
- Manual steps remaining: Netlify UI link repository and select feature branch; add CANVA_CLIENT_ID, CANVA_CLIENT_SECRET, CANVA_SETUP_PASSWORD (8+ unique characters) and CANVA_SITE_ORIGIN in Netlify environment with Functions scope; deploy; add redirect in Canva; authorise once.

## 2026-10-08 — Deploy diagnostic

The first deployment after saving environment variables failed. Investigation identified that CANVA_SITE_ORIGIN was marked as a secret and its exact value had been copied into this public status document. Netlify scans repositories and build output for configured secret values and can fail the deploy on a match. Removed this unnecessary literal while preserving the formula for finding the redirect. Confirm the next deploy logs to verify whether secret scanning was the actual failure mechanism; do not disable scanning or expose credential values.

## 2026-10-08 — Shorter setup password

User declined 20-character minimum, which was custom application policy, not required by Canva. Lowered the minimum to 8 characters while adding function-level Netlify per-IP rate limiting (6 requests per 180 seconds across the onboarding and callback routes). Tests added for length boundaries. This is a one-time onboarding credential, not the Canva account password; it must be unique and not reused from the previously exposed screenshot. Verify the deployed rate-limit rule in Netlify post-processing logs. Publishing and manufacturing remain disabled.

## 2026-10-08 — Form submission browser compatibility

On mobile browser the setup form displayed "Invalid request origin" even though the server had all four environment variables. The previous code required the HTTP Origin header to equal the configured origin for every form POST; browsers/webviews can omit or null the header.

Updated the form GET to set a Secure/HttpOnly/SameSite=Lax 10-minute encrypted CSRF cookie, with a separate random hidden challenge field. POST requires the field to match the encrypted cookie and not be expired; cross-site fetch metadata or an explicit different Origin is still rejected. Cookies are invalidated on successful submission. Existing PKCE and OAuth state validation remain unchanged. Added unit tests for expired/tampered cookies, absent Origin and cross-origin requests. No password, credential or Canva permission changes were made.

The deployed test must confirm the user can submit the password and reach the Canva authorization page. The Canva redirect URL also needs to be registered in the developer app. Live Canva token exchange and persistence remain untested. No Etsy or PrintShrimp integration is enabled.

## 2026-10-08 — Android clipboard support for setup form

Added same-origin module public/canva-clipboard.mjs and enabled same-origin external scripts in the function page CSP. The setup password remains masked as type=password. The form now has a user-triggered 'Paste from clipboard' button using navigator.clipboard.readText, with error handling when embedded/mobile browsers block clipboard API access. 'Use saved keyboard clipboard' reveals a separate temporary ordinary text input for Android/Gboard clipboard history; both native paste and input events transfer the contents into the password field and clear the temporary input immediately. Password contents are not sent to logs/status text or stored by the module. Existing encrypted CSRF proof, setup password checks, PKCE and rate limiting remain intact. Added unit tests for pasted text, clipboard API denial, saved keyboard input, masking and CSP. Verify physical Android keyboard history behavior with a live user test; this cannot be guaranteed from Node tests. The browser cannot programmatically enumerate saved clipboard history.

No Etsy publishing or PrintShrimp ordering enabled.

## 2026-10-08 — Netlify secret scanner build fix

User supplied the full Netlify deployment log. The scanner explicitly identified the value of CANVA_SITE_ORIGIN at line 53 of test/oauth.test.mjs; since the origin URL had been unnecessarily classified as a protected value in Netlify, it blocked the deploy even though the URL itself is public. Replaced the hardcoded live origin in that fixture with the reserved example hostname https://oauth.example.test. Did NOT disable or weaken secret scanning, rotate any Canva credentials, or touch manufacturing/publishing.

Verified:
- GitHub Actions OAuth test suite for commit c7720b47c7200eb4a7c5f737b2e5486643e7ec76 completed successfully.
- Netlify production deploy 6ac793bdafe64e0007a6ef33 is Ready and built exactly that commit.
- Netlify reports zero ordinary and enhanced secret-scanner matches, and the Canva function remains registered at /canva/start and /canva/callback.

Still required: user to open a fresh /canva/start, test pasted/saved Android clipboard workflow and private login, ensure Canva redirect URL is registered, authorise Canva, and verify token storage. No products or orders are being published.

## 2026-10-08 — Canva form submission redirects blocked in Chrome

User's mobile screenshot showed the Connect Canva form, entered masked password, and browser navigation starting then failing. This does not show a final Canva error, so cause was diagnosed as a likely CSP/browser interaction rather than proven from a browser console.

Root cause candidate: Netlify function sent Content-Security-Policy form-action 'self' while a successful setup POST issues HTTP 303 to Canva's OAuth page. Chrome enforces form-action against redirect chains, so the browser can block this navigation. Updated CSP allowlist to add ONLY the exact Canva OAuth host as an allowed form navigation destination; same-origin forms, inline/script restrictions and PKCE/CSRF enforcement are preserved. Added a regression test asserting only that host and self are allowed.

Verified GitHub Actions tests succeeded for commit bfa22afd15ae2577c31893a003d45948210519ee. Netlify production deploy published the same commit in Ready state, with zero secret scanner matches and the canva-oauth function present. Next: user should launch the setup form fresh, submit password once and report the exact next page. If Canva responds with its own auth error, verify actual registered Redirect URL/scopes; do not regenerate credentials speculatively. Publishing/fulfilment remain disabled.

## 2026-10-08 — First Canva design identified and export test deployed

User-supplied Canva shortlink resolved using the connected Canva app to design ID `DAHXUnmHofY`, title **Dinosaurs across time** (one page, 1024 × 1536 pixels; 2:3 portrait). This is NOT the earlier Dinosaurs of the World map print. Text read from Canva identifies Triassic / Jurassic / Early and Late Cretaceous timeline.

**Quality finding:** the source is 2:3 (height/width 1.5), not A-series 1:√2 ≈ 1.4142. It cannot be printed as an unmodified A-series five-size master without adapting the layout or adding letterboxing/cropping. Exported pixels must be measured independently from any design canvas setting or DPI metadata.

New files:
- `lib/print-check.mjs`: PNG signature/IHDR verification, SHA-256, aspect ratio checks, 300-PPI thresholds for A5–A1, safe Canva download hostname validation.
- `netlify/functions/canva-print-check.mjs`: locked-down, password and encrypted CSRF-protected single-design Canva lossless PNG export, polls Canva export job, verifies downloaded dimensions against Canva page metadata, stores the original PNG and audit report privately in Netlify Blobs, provides 15-minute session-gated download. No Etsy or PrintShrimp calls. Uses stored encrypted Canva access token, with guarded token refresh using a conditional-write lock and conditional token record update when needed. **Real refresh and full export have not yet been exercised**.
- `test/print-check.test.mjs`: validates PNG header, print ratios/PPI, safe download hosts, non-print-ready status, and no Etsy/PrintShrimp calls.

CI first failed a rounding boundary for exactly 300 PPI at A1; the print check now consistently rounds measured effective PPI to the nearest integer for the 300-PPI pass threshold, and CI passed.

**Verified:** commit `85c345015f42932738cc0ea4db6b1bdd2bd65764` passed GitHub Actions tests; Netlify production deployed the same commit in Ready state with zero secret matches. Netlify reports function `canva-print-check` registered for `/canva/print-check` and `/canva/print-file` alongside `canva-oauth`.

**Next step:** the account owner must open `/canva/print-check`, enter their private setup password (do not share in chat), and run the first export. Read the result page and download proof only privately. If the 1024 × 1536 export is confirmed, do NOT list for A5–A1. Investigate vector-preserving PDF Print or adapting the source Canva composition to A-series, then test a proof before Etsy/PrintShrimp automation. Mark export/refresh as tested only after live success.

## 2026-10-08 — Corrected Canva higher-resolution export capability

User pointed out that Canva manual PNG Download has a size/scale control that can increase output pixels beyond the 1024 × 1536 design page size. Confirmed against official Canva Connect API create-export-job docs: PNG format accepts explicit width/height up to 25,000 px, with aspect ratio preserved when only width is given. Canva Free fixed-size upscaling is limited to 1.125×; other plans and availability depend on Canva entitlements. Thus the page's 1024 × 1536 size is NOT a general maximum PNG export dimension.

Updated the print check to offer selected 1×, 2×, 3×, 3.125× and 4× output widths, default 3×. Canva receives width explicitly. Removed the erroneous assertion that an export must exactly equal the original canvas dimensions. The downloaded PNG's actual IHDR dimensions and aspect ratio are validated and reported alongside requested pixels and effective PPI; returned dimensions are measured independently of requested values. Raised the capped download to 80MB for higher resolution PNGs. No content editing, Etsy publishing or PrintShrimp orders.

Important: enlarging raster output does not guarantee extra detail in low-resolution embedded artwork; text and vector elements may render sharper. The 2:3 artwork remains non-A-series regardless of pixel count, so five-size paper trim/crop needs a deliberate approach. A 3.125× request for this source targets 3200 × 4800 px, but actual Canva entitlement and API output must be live tested.

Verified: GitHub Actions tests passed for commit d276f4154f630089f2406bd734cf75f8ffe23222; Netlify production deploy Ready at the identical commit, both Canva functions registered, zero secret-scan matches. High-resolution Canva export and token refresh are still UNTESTED live.

## 2026-10-08 — Fixed print-check form falsely expiring (user screenshot ~14:29)

The real root cause was confirmed by reading the code: `canva-print-check.mjs` encrypted the form CSRF proof with purpose `"print-form"`, while the common `verifiedFormProof()` always attempted decryption with `"setup-form"`. This meant every otherwise-valid print-check POST failed with "Form expired".

Fix:
- `lib/oauth.mjs`: allow an explicit purpose parameter for verification while retaining `setup-form` as default for existing Canva OAuth setup.
- `netlify/functions/canva-print-check.mjs`: supply `"print-form"` to match how the proof is encrypted.
- `test/print-check.test.mjs`: positive end-to-end helper regression for the matched purpose, plus wrong purpose, altered ciphertext, invalid text, and expiry rejections. Do not append arbitrary Base64URL chars for tampering tests because non-canonical input may decode unchanged.

Verified: GitHub Action run 37785305718 passed for commit `90a3727926568cbd4644488445c94607555f922d`. Confirm the latest Netlify deploy after this documentation commit. The actual Canva PNG export, token refresh and download are still not live-tested; do not claim success yet. Neither Etsy nor PrintShrimp is enabled.

## 2026-10-08 — Persist Canva export jobs and status checks

The live user test displayed 'Canva export is still processing; retry later' after the previous ~12-second wait. The old implementation discarded the Canva job identifier, meaning retrying could start another export.

Fixed on branch feature/canva-oauth-callback:
- New /canva/print-status route, using stored Canva export job ID in site-wide private Netlify Blobs and encrypted one-hour browser session.
- First authenticated submission sends one Canva POST export request. Repeated submissions of the same form are idempotent using a hash of the random form token and an onlyIfNew private store write.
- Status checks use Canva GET on the same job; pending jobs are kept. Completed jobs download their PNG, measure actual dimensions, and store the private file for a session-gated /canva/print-file link.
- The earlier export attempt cannot be resumed because its ID was not persisted by old code. Run one new export and thereafter use Check existing export status.
- One-hour session protects access. Expired private Blob files still require an explicit cleanup mechanism before production-scale commercial operation.
- No Etsy listing, PrintShrimp order, or original Canva design was modified.

Verified: GitHub Actions run 37787208461 passed for c707324c4f989fb6b1f121b8404928daf95f948c. Netlify deployed that exact commit in Ready state with zero secret-scanner matches and print-status path registered. Real export completion, actual PNG download, and token refresh remain untested.

Deployment preference: GitHub-linked Netlify does not require continuous deployment. Netlify Stopped builds disables automatic builds AND UI Trigger deploy; manual Git-backed release requires temporarily enabling builds, triggering the build, then stopping again. Stop auto publishing alone does NOT stop build consumption. No build-setting change was made in this chat.

## 2026-10-08 — A3/A4/A5 product master implementation

User clarified sell sizes: **A3, A4 and A5 only** (no A2/A1). They explicitly requested completing production using their existing Canva link.

Canva source design DAHXUnmHofY (Dinosaurs across time) was retained unchanged. Canva resize_design created a **separate A3 working copy** design **DAHXb1PdJlM**, 3508 × 4961 px, Canva edit link https://www.canva.com/d/x6_QPM4gnK8kZkR ; view https://www.canva.com/d/STkqZTBlJZ6sk0O. Rich-text inspection confirms original dinosaur label text remains in the A3 copy; visual margin/crop approval remains PENDING.

Poster_gen print checker now targets DAHXb1PdJlM, defaults to **1× = 3508 × 4961 px** (A3 at approximately 300 PPI); other available scales include 1.125× and 2×. The source original design reference remains in SOURCE_DESIGN to correctly label older pending jobs. A3 proportion matches all three A-series sizes.

PrintShrimp official 2026 artwork guide (https://printshrimp.com/blogs/news/artwork-specifications): PNG or JPEG, sRGB preferred, aim 300 PPI, A3 approximately 3500 × 5000 px, no bleed/crop marks, maintain 2–3 mm trim safety, **50 MB maximum upload**. The print checker reports whether output <=50 MiB and meets A-series geometry/300 PPI at A3/A4/A5; a clear separate manual approval gate remains for image detail, trimming, colour and a print proof.

GitHub Actions run 37798949308 passed at commit 65c0ced0437da7ba9cfd532316b1186d40c029d4. Netlify production deployed the exact commit Ready with zero secret-scan matches. New A3 export has NOT yet been started with owner password. Do not mark as final product before: (1) owner checks Canva A3 working copy visually (no clipping and readable names) (2) owner uses CANVA_SITE_ORIGIN/canva/print-check to export A3 1× (3) status report confirms image dimensions/under-50MB (4) printer proof or detailed PDF review.

No Etsy listing or PrintShrimp order was created. Production deploy settings left unchanged. Existing original poster untouched.


### 2026-10-08 17:09 BST — A3 export verified, draft background correction pending, credit controls

- **Stage:** A3 / A4 / A5 master validated numerically but **not print-approved**.
- **Observed:** Owner's Canva print-check report screenshots show A3 working copy export at 3508 × 4961 px, 35,014 KB, ratio 1.4142; A3 300 PPI, A4 424 PPI, A5 600 PPI; measured PrintShrimp upload checks passed.
- **Design draft:** A3 copy `DAHXb1PdJlM` has a scenic background layer. Canva editing transaction `7420198734226177565` repositioned and proportionally expanded only the scenery background in an **UNSAVED** draft; Canva preview shown to owner. No approval or saved design alteration yet. May need to redo after draft expiry.
- **Artwork risk:** full-resolution PNG details, physical print suitability, all dinosaurs/labels/margins and actual printer acceptance are unverified. The original Canva source `DAHXUnmHofY` remains the authoritative untouched source.
- **Cost evidence:** Netlify team billing screenshot reports 182 production deployments (2,730 credits), 2,873.9 credits total in current billing period. Scope team-wide; causality and purchase-hour balance unknown. Avoid any unnecessary build/deployment.
- **Documentation action:** Created off-deploy branch `docs/handover-and-change-policy-20261008`, added root `AGENTS.md` and rewrote the top of this status record as a current snapshot while retaining previous chronological notes. README refreshed separately on this branch. **Documentation branch is not merged/deployed**; no production release approved.
- **Next authorised action:** owner reviews and approves or rejects the A3 background adjustment. Then verify detailed full-resolution print master and printer proof, before writing Etsy/fulfilment integrations.

### 2026-10-08 19:33 BST — Owner approval applied directly through Canva

- **Stage / purpose:** complete previously approved background-only change without requiring user to manually save/download/reupload the Canva artwork. User rightly challenged the manual handoff.
- **Owner approval:** user explicitly stated "I approve the image" after the A3 background-adjustment preview. This approval was for the separate working copy, not the original.
- **Canva design:** `DAHXb1PdJlM`; original remains `DAHXUnmHofY`.
- **First commit attempt:** earlier transaction `7420198734226177565` returned transaction-not-found because the draft expired. **Not saved** by that attempt.
- **Actual change:** opened new editing transaction `4634722376481478741` and repeated the exact approved adjustment on background layer `PBgT94CnWTqP1kvr-LB0bQp1w5Y5bqn75`: width 3508 preserving aspect ratio; position left 0, top -150; resulting background 3508 × 5262.
- **Verified:** Canva returned committed status for transaction `4634722376481478741`. A new read-only transaction `2524785952840439391` confirmed persisted background position and dimensions; it was cancelled with no changes. The design retained 38 text elements and 52 image layers.
- **Cost / deployment impact:** no GitHub code changes and no Netlify production deployment for the Canva save. This documentation entry lives only on the isolated documentation branch until owner-approved merge.
- **Unverified:** final post-adjustment PNG export, actual image sharpness, edge clipping, pronunciation legibility, colour correctness, PrintShrimp upload and physical proof. Prior A3 export predates the saved adjustment.
- **Next development direction:** stop asking owner to manually save, download and reupload. Canva remains editable master; connected workflow should select design, export server-side, validate and store privately, then request approval only for decisions. Etsy publishing and PrintShrimp ordering require separate explicit authorisation. Keep all changes off live deploy branch until one approved, batched release.

### 2026-10-08 19:45 BST — Automated approved-master export developed off production (PENDING LIVE TEST)

- **Purpose:** eliminate repeated manual password + Canva export submissions after approval while preserving consent, original artwork and Netlify credits.
- **Branch:** `docs/handover-and-change-policy-20261008` (not production deploy branch). Files: `lib/approved-export.mjs`, `netlify/functions/canva-auto-approved.mjs`, `test/approved-export.test.mjs`, and a named export only in `canva-print-check.mjs` to reuse its token refresh code.
- **Current approved Canva revision:** A3 working copy `DAHXb1PdJlM`, `updated_at=1791484484`, 3508 × 4961. Original `DAHXUnmHofY` is untouched. The approval is pinned to the exact Canva revision; later edits block automatic export until separately approved.
- **Workflow implemented (pending GitHub tests/live deploy):** Netlify *scheduled* worker checks pinned revision, starts a single Canva PNG export, saves the job ID to private site-wide Netlify Blobs, revisits pending jobs without duplicate exports, validates A5/A4/A3 print dimensions + 50 MiB cap, and stores private PNG + report. The result is marked `ready_for_review`, never sale-approved; no Etsy or PrintShrimp actions.
- **Cost controls:** scheduled only on production if owner later approves deploying it; proposed six lightweight invocations/day, with no Canva API requests after successful completion. **No build settings or live deployment changed in this development task.** Function execution itself consumes some Netlify compute credits once deployed.
- **Known limitations:** owner review of final full-resolution file, colour/trim/print proof, and large-file delivery remain unsolved. Netlify function responses cannot reliably serve a ~35 MB PNG, so the file must be retrieved using an appropriate private storage download route, potentially through Netlify Blobs UI. Existing `/canva/print-file` route has not been proven for oversized responses. Automated sync must not be called 'live' before an authorised single release and successful run.
- **Next:** run GitHub tests, verify isolated branch did not deploy, decide secure retrieval method, then request ONE explicitly approved release when validated.

### 2026-10-08 19:50 BST — Protected export report staged; automatic worker tests verified

- **Added:** `netlify/functions/canva-approved-report.mjs` displays the stored scheduled-export state and A5/A4/A3 measured PPI behind the existing setup password and a 7-day Secure/HttpOnly/SameSite=Strict owner cookie. A single login can be reused to view subsequent reports; report route does not start an export. It does NOT expose private PNG bytes or download signatures. Added `test/approved-report.test.mjs`.
- **CI before this addition:** GitHub Actions run `37826621019` completed 38 tests passing and zero failures. Original first run `37826529605` failed due a new test regex syntax error; fixed and reran successfully. New report tests require CI rerun.
- **Current stage:** Fully automated approved-revision export and read-only dashboard are staged OFF production. No Netlify build settings changed and no new production deployment occurred. The latest post-background-adjustment A3 file still has not been exported in production.
- **Remaining:** one explicitly authorised production release, then observe the scheduled run and real private report, inspect image and obtain PrintShrimp proof. Netlify's scheduled workers have a 30-second execution limit; if real export processing exceeds it, consider a background function split rather than increasing deployment frequency. The 35 MiB PNG cannot reliably be delivered by a normal Netlify Function (20 MB streaming or smaller buffered payload cap), so direct customer download from a Function has not been enabled. Plan a secure transfer to fulfilment instead.

### 2026-10-08 19:49 BST — Staged automation verified and held from production

- **Verified:** GitHub Actions run `37826943950` succeeded: 39 tests passed, zero failures. Last revised Canva A3 working copy metadata checked again and still reports ID `DAHXb1PdJlM`, `updated_at=1791484484`, matching the pinned owner approval.
- **Additional check:** Updated isolated-branch CI workflow to explicitly run `node --check` on the automatic export worker, its pure state machine, and the read-only owner report function. Run the full suite again on this commit.
- **Deployment:** Netlify project's production deploy ID remains `6ac7b317c5c28a00089bf6df` and **Ready**, unchanged from the previous release. This automation is currently **STAGED, NOT LIVE**. No Netlify production build has been triggered by this work.
- **Remaining decision:** because the user reported significant Netlify deployment-credit consumption, enable the new scheduled worker only via one explicitly approved, bundled production release. Once enabled, Netlify will run six lightweight checks daily (at 00:00, 04:00, etc. UTC) until the approved master completes, then skip Canva API work on subsequent checks. The production export remains UNTESTED.

### 2026-10-08 19:55 BST — Production-release preflight: paused to avoid wasted credits

- **Owner authorisation:** owner explicitly approved one controlled production deployment of the tested Canva worker, but not Etsy publishing nor PrintShrimp orders.
- **CI:** staged branch head `129640b4f43b16cc7d62947e4e1a794631246cff` passed GitHub Actions `37827067762` (39/39 tests, function syntax checks).
- **Production:** Netlify project still publishes deploy `6ac7b317c5c28a00089bf6df`, built at commit `65c0ced0437da7ba9cfd532316b1186d40c029d4` on `feature/canva-oauth-callback`. That branch HEAD is one later commit `d7034cfb3e2c007ec467515f05b1811ddd6bcb77`, **docs/PROJECT_STATUS.md only**, with no runtime drift.
- **Release blocker / Canva:** approved master is pinned to design `DAHXb1PdJlM` updated_at `1791484484`. Fresh Canva metadata reports **`1791485393`**, which is newer. Read-only edit inspection confirmed A3 canvas 3508 × 4961, background element unchanged at (0, -150), width 3508, height 5262, with 38 rich-text entries and 52 images. This DOES NOT prove other page content did not change. A stale approval would be correctly rejected by the scheduled worker. Do NOT spend Netlify credits on this release until user confirms newer Canva revision is approved or reviews current design. Do not silently repin it. Read-only inspection session was cancelled.
- **Control:** no production branch ref was advanced; no Netlify deployment was triggered. A new release commit may be prepared off-production only after obtaining current revision approval. Once authorised, fast-forward the production branch **once**, inspect Netlify published commit, then test actual scheduled Canva export. If Netlify builds are stopped, do not claim deployment: ask to activate builds/trigger once because available Netlify connector has no deploy creation action.
- **Next:** ask the user to confirm current design revision is approved; preserve their single-deploy budget.

### 2026-10-08 20:00 BST — Owner explicitly approves current Canva A3 revision and ONE release

- **Approval received:** owner replied `Yes confirmed` to an explicit request to approve the latest Canva A3 design, after being warned that its timestamp changed.
- **Verified metadata:** design `DAHXb1PdJlM`, `updated_at=1791485393`, one page, 3508 × 4961. Previous pin `1791484484` was stale.
- **Changed in release preparation:** repinned `lib/approved-export.mjs` and its regression assertions to `1791485393`. This prevents unapproved *future* Canva edits from flowing to a print master.
- **Release scope:** `AGENTS.md`, handover documentation, read-only export report, scheduled approved-master worker, tests and a named export of existing token helper. **No Etsy integration, PrintShrimp orders, automatic listing, manufacturing or payment actions**.
- **Control:** One production deployment authorised (not repeat deployments); on isolated branch run syntax and unit tests before publishing to `feature/canva-oauth-callback`. Production Netlify site `sapiver-poster-gen-auth`, site ID `d1753fca-2098-4b96-a684-75921df7c3da`. The scheduled worker's first actual run cannot be claimed as passed without a real deployed execution and stored report.
- **Next:** after green isolated-branch tests, one production branch fast-forward and verify Netlify deploy commit/state and owner report route. Then poll for the scheduled run; report actual results or explain any manual Netlify build trigger if Git-backed auto deploy is stopped.

### 2026-10-08 20:00 BST — First repin CI failure; test assertion updated

- Initial CI run `37828003038` for repinned release candidate `8fe696c636cd0ba42790a6ec6ab7c9c20fff4264` failed **one stale test assertion** in `test/approved-report.test.mjs` which still expected old timestamp `1791484484`; other 38 tests passed and function syntax checks passed.
- Corrected the owner-report test to expect newly approved Canva revision `1791485393`. No release or deployment was attempted. A fresh full CI run is required before production release.

### 2026-10-08 20:00 BST — One authorised production-branch update; Netlify publication pending

- **User approval:** confirmed current Canva A3 revision `DAHXb1PdJlM` (`updated_at=1791485393`) and approved ONE controlled Netlify production deployment, with no Etsy publishing or PrintShrimp orders.
- **Candidate:** staged branch `docs/handover-and-change-policy-20261008` commit `692ed14252b467c9630f42deb93c1710cad7af73`. After initial CI run `37828003038` failed because a dashboard test expected prior timestamp, test was fixed; full run `37828117908` completed SUCCESS. Latest preflight confirmed Canva timestamp and production branch HEAD `d7034cfb3e2c007ec467515f05b1811ddd6bcb77`, which differed from published commit by one documentation-only change.
- **One GitHub release push executed:** fast-forwarded Netlify-linked branch `feature/canva-oauth-callback` to `692ed14252b467c9630f42deb93c1710cad7af73` via a single ref update (non-force, expected SHA check). Production-branch GitHub CI `37828197197` completed SUCCESS.
- **Netlify:** repeated connected-site checks still report published deploy `6ac7b317c5c28a00089bf6df` (Ready), built from `65c0ced0437da7ba9cfd532316b1186d40c029d4`. **Do not claim production release completed.** The connected Netlify app does not expose stopped/active build state, pending-deploy listing, build triggering or changing build settings. Possible stopped builds or inactive autopublish remain unverified. Netlify docs confirm activating stopped builds alone does not trigger a build.
- **Required owner UI if still unchanged:** open `https://app.netlify.com/projects/sapiver-poster-gen-auth/deploys`; inspect whether a new deploy is already building. If builds are stopped, use Activate builds; after activation and only if no deploy is already running, Trigger deploy ONCE with latest production branch HEAD. Do not trigger multiple builds or make new pushes. Wait until published commit is `692ed14252b467c9630f42deb93c1710cad7af73`.
- **Live test still pending:** once the exact commit is published, ensure protected `/canva/approved-report` route is live, then verify the scheduled worker runs (schedule `0 */4 * * *` UTC), creates one approved Canva export, measures actual 3508 × 4961 PNG, and writes private report. There is no authorised live Etsy or PrintShrimp action.
- **Documentation cost control:** this record updated only on `docs/handover-and-change-policy-20261008` off-production branch; avoid pushing documentation updates to production merely to sync logs and incur credits.

### 2026-10-08 20:04 BST — Netlify secret scan blocked release; root cause corrected

- **Evidence:** Owner screenshot and Netlify deploy metadata confirm attempted production deploy `6ac7e903a6cc07aea81edf3b`, commit `692ed14252b467c9630f42deb93c1710cad7af73`, ended in **error**. Netlify's scanner reported four matches of the configured `CANVA_SITE_ORIGIN` **value** in this document at pre-fix lines 45–47 and 196.
- **Cause:** The site origin is marked as a secret in Netlify. Static documentation copied its full literal HTTPS value; the scanner rejects the build even though the hostname is normally public.
- **Correction:** Replaced every absolute reference to the configured site origin with `CANVA_SITE_ORIGIN` and relative route paths; removed the bare hostname from snapshot. A regression test ensures project status never contains a literal *.netlify.app origin URL. Secret scanning was NOT disabled or weakened.
- **Scope:** Documentation and test-only correction. Canva code, OAuth, credentials, Etsy, PrintShrimp, product assets and Netlify build settings were not changed. All other tracked text files were reviewed for the exact original site origin and did not contain it.
- **Next:** stage the correction and run full GitHub CI; on success, fast-forward the Netlify-linked branch ONCE. Observe the resulting automatic production deploy, its secret-scanner results and scheduled worker. Do not trigger a second manual deploy unless the automatic build is conclusively absent.

### 2026-10-08 20:10 BST — Corrected Netlify release LIVE; first scheduled Canva export pending

- **Deployment result:** production Netlify deploy `6ac7ea449b8dde00092c0cf4` is Ready, published `2026-10-08T19:09:06.643Z`, built exactly GitHub commit `fe2c12860bca005070be54ed115b86e19010549f` from branch `feature/canva-oauth-callback`.
- **Secret scanner:** Netlify deploy metadata reports 0 ordinary and 0 enhanced secret matches. Original failing deploy `6ac7e903a6cc07aea81edf3b` remains a historical failed attempt; secret scanning remains enabled.
- **Functions deployed:** `canva-approved-report` at `/canva/approved-report` (authenticated), `canva-auto-approved` (private scheduled worker), `canva-oauth` and `canva-print-check`.
- **Scheduled export:** Netlify metadata confirms schedule `0 */4 * * *` UTC for `canva-auto-approved` (00, 04, 08, 12, 16 and 20 UTC). Next post-release run expected **20:00 UTC / 21:00 BST on October 8**, subject to Netlify scheduling. Note schedule registration does **NOT** verify that Canva export ran or private Blobs were populated.
- **CI:** production GitHub Actions run `37829741866` completed successfully for exactly `fe2c128`; previous staging run `37829617651` passed all **40 tests**.
- **Live-route limitations:** Netlify deploy metadata confirms registration of the status route, but the unauthenticated HTTP response and password-protected report were not independently fetched; tools in this environment could not resolve the Netlify host for a direct HTTP check. Never claim PNG export was actually tested on production until owner or an accessible Netlify function log/private status confirms it.
- **Cost:** one corrected production build succeeded after an earlier secret-scan failure; no more production deploys were triggered. Continue batching all future modifications; do not push this documentation-only checkpoint to production just to update the status.
- **Next:** after first scheduled run, owner can view `CANVA_SITE_ORIGIN/canva/approved-report` in their authenticated browser and report its state; check for `pending`, `ready_for_review` or blocked state, then independently inspect file detail and PrintShrimp requirements. Etsy and PrintShrimp live actions remain disabled.

### 2026-10-09 05:33 BST — FIRST LIVE SCHEDULED CANVA EXPORT VERIFIED BY OWNER SCREENSHOT

- **Stage / outcome:** the automatically scheduled workflow completed an export unattended overnight. The protected owner report displayed: "Print master exported and measured. Visual and physical proof pending." This corresponds to stored state `ready_for_review`, not an approved product or physical proof.
- **Approved source:** A3 working Canva copy `DAHXb1PdJlM`, approved `updated_at=1791485393`. Original Canva source `DAHXUnmHofY` remains separate and unchanged.
- **Live report evidence:** `exported_at=2026-10-09T00:01:11.623Z`, width **3508**, height **4961**, file size **37.4 MiB**, stored privately in Netlify Blobs. Three offered paper sizes: **A5 / A4 / A3**, effective PPI **600 / 424 / 300** respectively. This is within the configured PrintShrimp 50 MiB file-size guard. The screenshot confirms browser rendering of the private report and indicates scheduled worker persisted a completed file and audit record.
- **Verification limits:** screenshot and app report are not equivalent to independently downloading/decoding all PNG bytes. Actual print clarity, image quality, dinosaurs' heads/tails, spelling/pronunciation and 2–3 mm trim safety still need visual review; final supplier compatibility and physical printed proof remain PENDING.
- **Next:** design an owner-friendly authenticated **small print-preview** or appropriately secure large-file transfer pathway without exposing the private master or demanding manual Canva save/reupload. Existing normal Netlify Function response limits cannot be assumed to support transferring ~37.4 MiB. Inspect whether printer can receive private file directly after later approval. Do not move to sale before visual and sample checks.
- **Cost / deployment impact:** this is an **off-production documentation update only** on `docs/handover-and-change-policy-20261008`. No runtime code changed, no additional production deployment, no Etsy listing, no PrintShrimp order. The scheduled function executes under normal Netlify function billing.

### 2026-10-09 05:33 BST — Canva structural trim-margin audit (read-only)

- **Purpose:** assess gross element clipping / trim proximity directly from the editable approved A3 Canva copy, without manipulating or republishing the image.
- **Observed:** one A3 page 3508 × 4961 pixels, 38 editable rich-text elements and 52 image fills. Using the 3 mm @ 300 PPI boundary (~35.43 px), metadata indicates **0 of 38 text element bounding rectangles** enter this boundary; **6 image elements** touch / extend inside it, including intentional full-bleed background layer at left=0, top=-150, width=3508, height=5262, and other top/bottom decorative elements.
- **Limits:** positional metadata is not a substitute for inspecting full-resolution rendered pixels. Text bounds might differ slightly from visible ink, and visual sharpness, individual dinosaur cropping, background joins, fine print and all supplier requirements remain **unverified**.
- **Safety:** Canva editing transaction opened read-only and cancelled; no artwork was changed. No Netlify or GitHub production deployment was triggered. This handover is updated only on isolated documentation branch.
- **Next:** use a secure owner-side image-preview or private file-transfer flow to inspect the actual auto-exported master, preferably without requiring a Canva download or upload. Only after visual approval proceed to PrintShrimp test proof; no Etsy publication or manufacturing order is authorised.

### 2026-10-09 — Single master / shared SKU handoff staged

- Owner reiterated ONE file for PrintShrimp; no multiple masters or different files per size.
- Official PrintShrimp SKU guide confirmed one shared product SKU for all Etsy size variations, with print size read from the Etsy order.
- Added pure validator and handoff mapping in lib/printshrimp-product.mjs, unit tests in test/printshrimp-product.test.mjs, and exact integration instructions in docs/PRINTSHRIMP_HANDOFF.md.
- Suggested SKU SP-DINOSAURS-ACROSS-TIME, upload name SP-DINOSAURS-ACROSS-TIME.png. This has not been registered in PrintShrimp/Etsy and must be checked against existing shop SKU conventions before a live action.
- Handoff uses the already-stored private Canva-approved A3 Blob, checks revision, hash, dimensions, upload limit and PPI; three Etsy size variations share the one SKU. It never calls provider APIs.
- Full PrintShrimp upload API spec is accessible after account sign-in and is not available via current connected tools. No Etsy seller write connection is available; Etsy marketplace lookup is not a seller management connection.
- PENDING: real private PNG transfer API, actual file visual review, supplier proof, prices, postage profile and paper finish. No Etsy listing or order, no Netlify deploy.

### 2026-10-09 — One-master PrintShrimp handoff CI passed; supplier access still required

- GitHub Actions run 37885613924 at commit fe59ff590f8fd212dc98c64caf05851983932341 passed **43/43** tests (zero failures), including 3 new tests for the single A3 master, one shared SKU, A5/A4/A3 variation constraints, and failing closed on wrong artwork or unverified measurements.
- Connected PrintShrimp merchant tool not available. The authenticated portal is https://app.printshrimp.com/; public docs link redirects there. Supplier FAQ states API docs available only after sign-in, so no real upload endpoint or credentials have been observed. Do not invent one.
- The A3 PNG remains privately stored under the approved Netlify Blob pointer, not copied into GitHub. SKU in mapping is PROPOSED, not confirmed in PrintShrimp/Etsy account.
- Netlify current production deploy remains 6ac7ea449b8dde00092c0cf4 Ready, untouched. This verification updates only the off-production handover branch. No Etsy publishing, PrintShrimp upload, order, or additional file created.
- Next real unblock: obtain authenticated PrintShrimp upload/API details from the account, then implement and test direct secure transfer of that ONE existing Blob to one SKU. Full-resolution QA and actual supplier print proof still pending.

### 2026-10-09 — Owner corrected Etsy/PrintShrimp order; definitive Etsy-first handover

- **User clarification:** "I thought we needed them listed on Etsy first with a SKU that we then hand to shrimp." This workflow decision overrides previous documentation that positioned PrintShrimp supplier upload before creating the Etsy listing.
- **Confirmed supplier semantics:** PrintShrimp matches Etsy order SKU to the artwork file SKU/filename, while extracting print size from the order variation. Use **one SKU per product, not one per size**. Their current guidance also supports *lazy SKU mapping* so a live Etsy listing does not necessarily need its artwork pre-uploaded; for THIS project prefer a safe Etsy **draft** first and do not publish until supplier matching and print QA have been validated.
- **Definitive order:** ① Existing Canva PNG and QA (no repeat export) → ② one Etsy **draft** with A5/A4/A3 and common product SKU → ③ connect PrintShrimp and transfer **one** private A3 master under matching SKU → ④ verify match and proof (paid order only after approval) → ⑤ publish after separate approval. This is a business workflow decision, not a claim that Etsy mandates publishing before PrintShrimp upload.
- **Verified actual code detail (correction to any contrary assessment):** `lib/print-check.mjs` function `inspectPNG` computes a SHA-256 hash of real PNG bytes, and `lib/approved-export.mjs` stores this `image` object in the private report; `lib/printshrimp-product.mjs` requires the same checksum. The checksum is therefore **implemented**. A live supplier handoff using actual Blob/report data is still **untested**.
- **Current state:** no Etsy draft, shop SKU registration, PrintShrimp artwork upload, payment, sample or sale has been performed. The proposed shared SKU `SP-DINOSAURS-ACROSS-TIME` must be checked against the seller's existing SKUs before adoption. PrintShrimp portal upload/API specs and seller-write Etsy access remain outstanding.
- **Documentation change:** updated current snapshot, next actions, PrintShrimp handoff guide and README on isolated `docs/handover-and-change-policy-20261008` branch only. **No runtime files, PrintShrimp/Etsy accounts, build settings or production deploy affected.**
- **Supplier references:** https://printshrimp.com/blogs/news/printshrimp-etsy-integration ; https://printshrimp.com/pages/bulk-edit-skus ; https://printshrimp.com/blogs/news/switch-print-on-demand-supplier-etsy .

### 2026-10-09 06:16 BST — Existing GitHub secrets confirmed; API preflight wired
- Owner screenshot confirms repository Actions secrets `ETSY_PRINTS_KEYSTRING`, `ETSY_PRINTS_SHARED_SECRET`, `SHRIMP_APIKEY`, `CANVA_CLIENT_ID`, `CANVA_CLIENT_SECRET`. Earlier code searches did NOT check secret settings and must not be interpreted as missing keys.
- Added scripts/check-provider-access.mjs, test/provider-access.test.mjs and .github/workflows/provider-access.yml on the existing isolated handover branch. Workflow consumes the three existing provider secret names inside GitHub, never retrieves their values into chat or local files.
- One read-only GET to Etsy's documented application/openapi-ping endpoint uses keystring:shared_secret. Output restricted to presence flags, numeric HTTP status and fixed status labels; provider bodies and exception messages omitted. Redirects refused and timeout bounded. No PrintShrimp requests made without actual API specification.
- Local verification: full 45-test suite passed (zero failures). Real secret-backed workflow result PENDING at preparation. Etsy app access is distinct from seller OAuth with listings_w; screenshot contains no seller token and seller access is NOT CONFIGURED in this code.
- PrintShrimp key presence can be checked, but validity/upload method remains UNTESTED. Official API documentation link leads to signed-in merchant portal; do not invent routes or assume API key creates a browser session.
- Deploy/credit impact: no production branch update, Netlify release, Canva re-export, listing, upload or order. This adds one GitHub Actions read-only check on the established off-production handover branch.
- Next: inspect workflow output, implement Etsy seller OAuth only after app access succeeds and registered redirect is verified; obtain actual PrintShrimp API specification for single-master transfer. Publication and orders disabled.

### 2026-10-09 06:18 BST — Real secret-backed Etsy preflight PASSED
- Commit afd7c35feb27ad6414bcb7d98221148ce6d7f86c, workflow run 37887927649, job 113682007272 completed SUCCESS. All 45 tests passed on GitHub as well as locally.
- GitHub injected ETSY_PRINTS_KEYSTRING, ETSY_PRINTS_SHARED_SECRET and SHRIMP_APIKEY; presence flags all true. Official Etsy application ping returned HTTP 200, appAccess VERIFIED. No credentials or provider bodies exposed.
- Correction: saved Etsy credentials are VALID for app authentication; earlier lack of seller tools was not evidence of missing or invalid API keys. Seller OAuth remains NOT CONFIGURED in the project, and draft creation requires listings_w authorisation.
- PrintShrimp credential existence verified; no undocumented endpoint probed, no upload or order. Authenticated upload API specification remains required.
- Netlify connected-site recheck: existing production deploy 6ac7ea449b8dde00092c0cf4 remains Ready; no production ref update or release requested/performed. Changes remain on isolated handover branch.
- Next: implement seller OAuth using verified app pair and verified registered callback, then draft only; obtain supplier upload specification for single existing master. No seller listing, publication, PrintShrimp order, payment or Canva re-export performed.

### 2026-10-09 06:30 BST — Etsy seller connection built and tested off production
- Changed lib/etsy-oauth.mjs, netlify/functions/etsy-oauth.mjs, test/etsy-oauth.test.mjs and CI syntax checks. Routes /etsy/start and /etsy/callback use the EXISTING ETSY_PRINTS_KEYSTRING and ETSY_PRINTS_SHARED_SECRET names.
- Owner-facing connection works in a normal browser. Reuses existing setup password, clipboard module and private encryption root. PKCE S256, CSRF proof, ten-minute encrypted HttpOnly cookies; OAuth state consumed atomically before token exchange to prevent replay/concurrent duplicate exchanges.
- After exchange, verifies exact SapiverPrints shop and matching token user before encrypted primary token storage. Requests shops_r, listings_r, listings_w; no transaction scopes and no publication/order endpoint.
- Verified locally: all 50 tests passed, including successful mocked exchange/storage, wrong shop, expired/mismatched state, parallel callback replay, missing permissions, origin rejection, wrong password, missing runtime keys and safe provider failures. Both new modules pass node --check. Real Etsy seller flow remains UNTESTED and NOT LIVE.
- Release prerequisites: existing key pair also available to Netlify Functions under the same names; GitHub Actions secrets are NOT injected into Functions automatically. Etsy app redirect registration must exactly match CANVA_SITE_ORIGIN + /etsy/callback. Existing Canva variables remain unchanged. Then one explicitly approved bundled production release; no repeat deploys for docs.
- Owner provided PrintShrimp developer screenshot: endpoints /api-get-pricing, /api-create-product, /api-update-product, /api-delete-product, /api-get-product, /api-bulk-list, /api-get-templates, /api-create-order and /api-get-order visible. Getting Started/authentication and request/response schemas collapsed, so base URL, auth header and upload fields NOT VERIFIED. No supplier calls made, no credentials read from screenshot.
- No Etsy draft, publication, PrintShrimp upload/order, Canva edit/export or Netlify release performed. Current deployed Canva worker retained.
- Next: obtain expanded supplier Getting Started/create-product/get-product schemas; configure normal-browser Etsy authorisation and complete one draft with verified shop settings. Build secure ONE-master supplier transfer, then request one reviewed bundled release. Sale/proof approvals remain separate.

### 2026-10-09 — Etsy Connect GitHub CI passed
- Commit fb60ce09ef1500cddae450e428d8596cdfd5723e saved on isolated handover branch. GitHub Actions run 37889087019, job 113685689585 completed SUCCESS, including new Etsy syntax checks and full 50-test suite.
- Etsy connection is staged, NOT LIVE. Real seller consent, runtime key configuration, redirect registration, token refresh, Etsy draft creation and supplier upload remain pending. No deployment or merchant side effect performed.

### 2026-10-09 06:36 BST — Supplier specification supplied; one-master transfer implemented
- Owner screenshots 47017/47018/47019 establish base https://api.printshrimp.com/functions/v1, x-api-key header, POST /api-create-product JSON name/sku/variants (size + image_url), GET /api-get-product?sku=... response {success,product:{product_id,sku,variants}}. Supplier accepts direct HTTPS JPEG/PNG up to 50 MB, with aspect-ratio tolerance 2%; A5/A4/A3 all A-series. Same existing A3 bytes and same URL used for all three variant definitions; no separate master exports.
- Added lib/printshrimp-api.mjs, lib/master-stream.mjs and narrowly scoped netlify/edge-functions/print-master.js. API adapter verifies prior unpublished Etsy draft mapping and visual approval, hashes the actual existing Blob bytes, applies stricter 50,000,000-byte guard, checks SKU collision, atomically reserves one upload, POSTs once and reads back three supplier-hosted copies before revoking access. Provider error/timeout blocks automatic retry.
- Temporary random 256-bit capability expires after 15 minutes and is revoked on success/failure. Edge stream serves only the pinned private master; invalid/expired/revoked tickets rejected, caching forbidden, no public permanent PNG or credential output. Using Edge streaming avoids routing 37.4 MiB through ordinary Function buffered/20 MB streamed response limits. Actual deployed Edge throughput, SDK compatibility and supplier fetch remain UNTESTED; local stream tests prove auth/routing logic only.
- Local tests: all 55 passed, including same URL in three variations, missing/wrong Etsy draft and corrupt master denied before supplier requests, duplicate/ambiguous POST protection, supplier read-back and ticket revocation. Full transport integration and real print QA remain pending.
- Updated existing GitHub read-only provider preflight to GET documented /api-get-pricing with SHRIMP_APIKEY; result pending at commit preparation. Prints only fixed status/HTTP code and presence flags; never pricing bodies, keys or exception messages.
- No new live Etsy draft or supplier product created. API transfer is an implemented server-side orchestrator with injected real draft verifier/master reader, not yet wired to an authenticated owner dispatch or background runtime. Do NOT call this end-to-end integration complete.
- Remaining: runtime Etsy key pair and SHRIMP_APIKEY in Netlify Functions, exact registered Etsy callback, seller consent, draft creation with actual shop settings, owner transfer dispatch, full-master visual QA, one reviewed authorised release and actual stream/provider verification. No orders, publication, Canva re-export, manufacturing or payment.

### 2026-10-09 06:40 BST — Supplier preflight HTTP 400; not proof of bad key
- Commit bf8c450b705b5b2dc18b9d320691bff0f9bf0e7c: GitHub code CI 37889648117 passed syntax checks and all 55 tests. Read-only provider run 37889648119 failed because supplier pricing GET returned HTTP 400 while Etsy ping remained HTTP 200. All three secrets were present.
- Correction: initial preflight labeled any non-2xx supplier response REJECTED; HTTP 400 cannot distinguish missing pricing query parameters from authentication problems. Do not ask owner to replace keys on this evidence.
- Changed supplier preflight to fully documented GET /api-get-product?sku=SP-DINOSAURS-ACROSS-TIME (query shown in supplied screenshot). Returns fixed response classes and allowlisted diagnostic categories, never raw response bodies or keys. Real result pending. No supplier POST or listing publication occurred.

### 2026-10-09 06:41 BST — Supplier SKU lookup reached product API
- Read-only run 37889760027 at e9308a8 returned HTTP 404 with allowlisted PRODUCT_NOT_FOUND diagnostic for SP-DINOSAURS-ACROSS-TIME; Etsy remained HTTP 200. This is not a rejected-key diagnosis and does not alone prove key validity. No product created.
- Next focused check uses documented GET /api-get-product without sku (paginated merchant product list), to distinguish an empty/nonexistent proposed SKU from credential access. Response content discarded; only HTTP status logged. No additional endpoint guessing or supplier writes.
- Existing production Netlify deploy remains 6ac7ea449b8dde00092c0cf4 Ready. All 55 tests also passed in this real preflight job.

### 2026-10-09 06:42 BST — Both existing provider credentials verified live
- Read-only provider workflow 37889856696, job 113688089916, commit 524879abc808990ee76dcfd5f96affb3fd237a8b completed SUCCESS. Saved Etsy key pair returned HTTP 200 / appAccess VERIFIED; saved SHRIMP_APIKEY returned HTTP 200 / access VERIFIED using documented merchant-product-list GET. Response bodies and secret values were discarded, not recorded.
- All 55 tests passed in the successful preflight job. This resolves supplier credential validity; earlier HTTP 400/404 results do not require replacement credentials.
- Changed only this status record on off-production docs/handover-and-change-policy-20261008. No production branch push, Netlify release, Canva re-export, Etsy draft/publication, supplier upload/order or payment occurred.
- Remaining live blockers: Netlify runtime availability of the same three provider keys, exact Etsy callback registration and seller consent; draft creation and authenticated transfer dispatch remain unimplemented. Edge delivery and real supplier persistence need a controlled live test after review. Visual approval remains required.
- Next authorised action: complete runtime orchestration and seller setup without third-party browser automation; request one concrete bundled release only when implementation is reviewable. Do not claim the full pipeline is finished.

### 2026-10-09 07:04 BST — Draft-first owner workflow and background runtime completed locally
- Branch: docs/handover-and-change-policy-20261008; production remains feature/canva-oauth-callback at fe2c128, deploy 6ac7ea449b8dde00092c0cf4 Ready. No release/build-setting changes or merchant writes.
- Added lib/etsy-session.mjs: encrypted seller token access, atomic single-writer refresh claims, provider token identity/scope validation, conditional ETag storage preventing overwrite of a new owner connection. Ambiguous refresh stops automatic retry.
- Added lib/etsy-draft.mjs: verified active physical GBP reference listing in SapiverPrints; reads real A5/A4/A3 prices, quantities, Size property IDs, delivery/return/processing profiles. Requires one existing PrintShrimp production partner, audits proposed SKU across every shop listing state, then reserves one new draft, sets three inventory variations with one SKU, and verifies draft-only state. No publish endpoint.
- Added lib/poster-workflow.mjs and netlify/functions/poster-workflow.mjs + poster-runner.mjs: /poster/workflow owner password/CSRF session, reference selection, title/description review, private job status; signed ten-minute /poster/run background dispatch, atomic replay protection and safe fixed failure messages. Transfer reads existing private report and actual master bytes, re-verifies Etsy draft first, posts supplier once, verifies supplier copies and revokes the temporary master capability. User must explicitly confirm actual-master visual review. No new Canva export or print order.
- Added three test modules: token concurrency/identity/expiry/ambiguous refresh, draft settings/SKU collisions/uncertain writes, owner CSRF/forged dispatch/retry suppression and a full simulated draft-first-to-supplier workflow. 71 local tests passed, zero failures. Runtime entrypoints import successfully with installed SDK. Mock PNG fixtures test control flow, not visual quality or real 37.4 MiB transport.
- Added npm lockfile and CI npm ci/runtime import checks for reproducible SDK installation. Docs/POSTER_WORKFLOW.md records setup, usage and failure recovery. GitHub CI result pending at preparation.
- Connected Netlify API returned an empty shared-team-variable list. This does NOT prove site variables are missing: available connector cannot inspect or modify site-level environment variables. No API secret was retrieved or logged. Etsy app key pair and SHRIMP_APIKEY remain live-verified via GitHub Actions.
- PENDING: exact registered Etsy callback and runtime provider-key availability; one controlled release with owner approval; real seller consent, complete reference configuration, live draft and full-size supplier delivery/read-back. Draft description is deliberately reviewable before submission, not final sales copy. Supplier proof and separate publication/order approvals remain outstanding.
- Next: verify GitHub CI on saved release candidate, then obtain one concrete deployment approval under AGENTS.md; owner completes Etsy consent through normal browser. Do not claim end-to-end production success before actual read-back.

### 2026-10-09 07:07 BST — Release candidate passed clean GitHub CI
- Candidate commit 3a96d49bcb47755b3536a7d4c209d818260215af on isolated docs/handover-and-change-policy-20261008. Verify Poster_gen run 37891740396, job 113693967448 completed SUCCESS: npm ci, every syntax check, runtime entrypoint imports and full test suite. Same suite passed 71/71 locally.
- Netlify recheck after candidate push: existing deploy 6ac7ea449b8dde00092c0cf4 still Ready. No production ref update, release or merchant write occurred.
- Candidate is ready for a controlled owner-approved release and live integration test, not proven production success. Private runtime provider-key availability, Etsy callback registration/seller consent, reference profile compatibility and actual 37.4 MiB supplier fetch/read-back remain to be verified.
- Documentation-only checkpoint; no Netlify deploy. Next approval covers one release of this tested runtime candidate; publishing and orders remain disabled.

### 2026-10-09 07:33 BST — Owner-upload fixed-template workflow implemented
- User authorised replacing future-product Canva retrieval with manual checked PNG upload and Approve & Publish as total per-product publication approval. Supplied SAPIVER_POSTER_TEMPLATE.md is canonical. Nine framed combinations plus three Print Only = 12; owner asked about this count, clarified without removing Print Only.
- Changed lib/poster-template.mjs, uploaded-poster.mjs, poster-mockups.mjs, poster-upload-web.mjs, poster-upload-runner.mjs; new upload Function/background runner, separate capability-gated uploaded-master Edge route and browser upload module. Existing pinned Canva master route retains default pinned-key validation; existing owner login redirects to new upload page.
- Fixed prices/tags/footer/disclosure, real reference IDs/profile validation, filename-derived identity. Private chunked upload assembles one unchanged master, validates PNG/pixels/ratio, generates three labelled illustrative JPEGs, binds final approval to SHA-256 plus whole listing plan. Explicit gate POSTER_PUBLICATION_ENABLED defaults disabled. Draft first, twelve variations, three images, supplier POST/read-back, revoke master ticket, then one Etsy activation and read-back. No order/payment endpoint.
- Local verification: 86 unique tests pass, runtime imports pass; synthetic mockup rendered/viewed for edge preservation and layout. Initial chunk retry test failed because Node hash.update rejects ArrayBuffer; corrected conversion and reran successfully. Duplicate test registration from importing a test module was removed by moving reusable fixtures into test/fixtures.
- Live provider keys previously verified HTTP 200; existing Netlify deploy 6ac7ea449b8dde00092c0cf4 rechecked Ready/unchanged. No production ref push, deployment, Canva export, Etsy listing, supplier upload, publication or order performed. Changes on docs/handover-and-change-policy-20261008 only.
- Remaining: GitHub CI, one controlled release, runtime provider key availability and seller consent, real reference taxonomy/profile/optional-field compatibility, actual 37.4 MiB Edge streaming, explicit supplier Frame variation consumption and physical quality. Generated mockups are illustrative product previews, not claimed replicas of PrintShrimp's undisclosed original scenes.
- Next authorised action: save revised candidate/check CI and prepare reviewed release. Do not activate live publication or place orders on the basis of mocked success alone. Owner final upload button is approval for that exact product; software deployment still follows AGENTS.md release approval.

### 2026-10-09 07:36 BST — Upload candidate CI passed; native-image bundling scoped
- Candidate 7431d86c91cd87ee7946deb60e33a3431ae2d056: GitHub Verify Poster_gen run 37894293754/job 113701980158 SUCCESS. Clean npm ci, new and existing runtime imports/syntax checks and full 86-test suite passed.
- Native Sharp packaging reviewed against first-party Netlify Function bundling documentation. Added a poster-upload* scoped esbuild/external Sharp rule plus explicit sharp/@img binary files in netlify.toml, avoiding bundler inlining of native dependencies. Runtime packaging on actual Netlify remains a live release check; importing on Linux locally/GitHub passed.
- Source template replica, upload approval code and tests are saved off production. No release, merchant product, publication or order. New native bundling rule needs saved candidate CI before requesting a concrete release.

### 2026-10-09 07:38 BST — Revised upload release candidate verified in GitHub
- Final runtime candidate 7d1979660f9d830f950189d16ccb78b886dc3d40 includes native-image packaging. Verify Poster_gen run 37894462554 completed SUCCESS after clean installation, runtime imports/syntax checks and the same 86-test suite.
- No live deployment or Etsy/PrintShrimp product/publication/order performed. Netlify production remains the existing Canva release. Candidate is staged for one controlled release approval; runtime credentials, seller consent, real frame matching and actual full-size transport remain live prerequisites. Publication gate remains default-disabled.
- This is a documentation-only verification checkpoint on the established off-production handover branch; no production ref or deployment settings changed.

### 2026-10-09 06:43 UTC — Approved upload runtime released; live setup blocker verified
- Owner approved one controlled deployment of candidate 7d1979660f9d830f950189d16ccb78b886dc3d40. Fast-forwarded production feature/canva-oauth-callback from fe2c128 to that exact candidate; no forced push or build-setting changes.
- GitHub production CI run 37894956709/job 113704111473 SUCCESS. Netlify deploy 6ac88cdf08cadc0008385789 Ready, published 2026-10-09T06:42:59.727Z with matching commit; secret scan 3,120 files ZERO matches. Nine Functions/two Edge Functions registered; native Sharp included in both upload bundles.
- Live HTTP probes: /poster/workflow 503 Poster setup incomplete; /poster/upload 503; /etsy/start 503 Etsy setup incomplete; /poster-upload.mjs 200; unauthorised /poster/artwork.png 403; existing /canva/approved-report 200 with no-store. Thus release is live but upload workflow is NOT operational. No Etsy/supplier merchant writes or orders occurred.
- Setup validation checks both Etsy variables and existing Canva encryption/password/origin settings. Existing Canva report works, but these observations alone do not identify every missing/invalid variable. Previously verified GitHub Etsy secrets do not automatically populate Netlify Functions. Required provider names: ETSY_PRINTS_KEYSTRING, ETSY_PRINTS_SHARED_SECRET, SHRIMP_APIKEY. Available connector cannot read/write site-level environment values; no secret values retrieved.
- Next: privately configure/verify those existing provider keys on this Netlify site with Functions scope, register CANVA_SITE_ORIGIN + /etsy/callback and complete normal-browser seller consent. Preserve publication gate until real reference/supplier frame mapping verified. Additional release, if required after environment changes, needs controlled owner authorisation. This documentation change remains off production and causes no second production deployment.

### 2026-10-09 08:12 BST — GitHub publication CI passed; dependency environment hardened
- Candidate b6834d14afc8b7295828768da3bc3fdbc2f2ef44 saved on off-production handover branch. GitHub Verify Poster_gen run 37897411587 completed SUCCESS with clean install, Function imports and 92 passing tests. No production release/main workflow installation occurred.
- Final hardening: on-demand npm install disables lifecycle scripts and receives only PATH/HOME/TMPDIR, never provider secrets or GitHub identity request credentials. Syntax check passed; follow-up candidate CI pending. Root encryption/provider values remain in memory only and are not logged.
- Next authorised action: verify final hardening CI, present one concrete controlled release/main worker installation approval. Real GitHub OIDC/Netlify bootstrap and seller consent remain untested until that release; publication gate remains disabled.

### 2026-10-09 — Final GitHub publication candidate CI verified
- Final runtime candidate 5413ef62acd9552650336a6fed4ffa43dcdc142d: GitHub Verify Poster_gen run 37897537803 completed SUCCESS. Full suite 92/92 plus clean installation, syntax and Function import checks passed. Earlier hardening checkpoint was timestamped 08:12 BST prematurely; observed clock at that stage was 08:10 BST.
- Default main was inspected: e9bee56be49ccf416c3a1edaa7b8cee6ef84e228, only README.md. It is NOT the Netlify production branch. Candidate contains the reviewed worker workflow; install only that file on main after the controlled release is authorised. Do not merge unrelated content or start the schedule before the bridge release.
- Concrete release proposal: fast-forward production feature/canva-oauth-callback once to tested 5413ef62; verify Ready, then install main workflow and verify real signed bootstrap/login/queue. Publication stays disabled pending real seller/template/frame checks. No keys need recovery and no personal access token is required by the implemented architecture. This record is off production; no additional Netlify deploy or merchant operation.

### 2026-10-09 10:00 UTC — Unified digital and physical development stages 1–5

- Stage / purpose: inspect rather than rebuild existing Canva/Netlify/GitHub/Etsy/PrintShrimp workflow, then extend it for validated digital ZIP products and nine framed physical options under one Deploy approval. Owner explicitly withheld production release authorisation.
- Audit: read AGENTS/README/latest handover and actual source/config/tests; inspected current Netlify deploy, live routes, main worker absence and provider integration status. App keys are verified independently of seller OAuth; no claim that setup is live or a merchant roundtrip has succeeded. Reused existing queue, private storage, authentication, bridge and physical pipeline.
- Changed: new `lib/product-metadata.mjs`, `product-records.mjs`, `product-web.mjs`, `digital-archive.mjs`, `digital-product.mjs`; extended `poster-upload-web`, `uploaded-poster`, template/mockups, GitHub publication/bridge/remote store and worker script; added dashboard Function path; corrected Etsy DELETE 204 and added shops_w. Added pinned package-lock dependencies for ZIP/XML/PDF parsing, Node 24 requirement/.nvmrc, dependency-folder ignore and CI import check. Added digital/browser tests and physical/bridge/worker regressions. Updated AGENTS, README, current snapshot, old-guide supersession notes and UNIFIED_PRODUCTS guide. No Canva code/design change.
- Stage 1: actual-content ZIP checks, bounded private upload/storage, payload preservation and exact Etsy-size splitting; customer artwork untouched. Stage 2: digital drafts/files/previews/sections/taxonomy. Stage 3: existing authenticated Deploy queues hash-bound final approval; permanent product/revision IDs, dashboard and metadata/file edits. Stage 4: real file parsing plus fixture E2E success/failure/retry/duplicate checks for both routes. Stage 5: this handover records implemented versus live-unverified behavior.
- Tests / corrections: initial legacy twelve-option/description assertions failed against the owner-approved nine-option change; corrected expected behavior and reran. Preview source reuse fixed and regression-tested; physical preview hash binding added and mutation-tested. Latest full local suite **114/114 passed**. Split ZIP payload hashes, malformed/encrypted/linked/expansion/CRC files, active compressed PDF/SVG, changed approvals/archives/previews, partial APIs, stale/superseded revisions, no duplicate creation, same-ID updates, no digital supplier calls, nine physical options and 51 MB bridge roundtrip exercised.
- Browser limitation: Playwright executable missing; attempted download returned invalid/truncated archive and failed. Browser-script interaction tests pass but full mobile/desktop visual testing remains pending. No claim of live Etsy file delivery, taxonomy resolution, section creation, GitHub identity/bootstrap or framed supplier compatibility.
- Decisions / limits: five initial flat sections plus optional Printed Artwork; Etsy twenty-section/24-character limits and five-file/20 MB download caps verified against primary docs/OpenAPI. Bundles require matching explicit verified category. Original ZIP retained; split parts lossless, impossible oversized package blocked. Only-if-new claims stop ambiguous replay; records are not a multi-record transaction. Failed update may leave listing inactive; retained files/IDs permit controlled investigation. No automatic merchant-write recovery UI. Physical artwork replacement blocked until verified supplier PUT contract.
- Safety / credit impact: code saved only off production; production branch, Netlify release/settings, main schedule, Canva source/master, existing merchant listings and supplier orders untouched. No live Blobs test writes, credentials in files/logs, new merchant consent, product publication or manufacturing purchase. Off-production GitHub verification only.
- Next authorised action: review saved candidate and CI, then seek a single concrete production release/worker-install approval before changing live software. Actual seller consent and controlled live integration/device checks still needed; keep publication gate off until essential checks pass. The eventual website Deploy remains sole per-product final approval.

### 2026-10-09 10:05 UTC — Saved unified candidate and independent GitHub verification

- Code candidate: `45240c8b6ceb6f34442074e68e304d87cc735210`, saved by fast-forward on the established off-production handover branch; 34 changed/new files, excluding dependencies/artwork/secrets. Production branch was not advanced.
- VERIFIED: GitHub Verify Poster_gen run `37915156120`, job `113769417142`, completed SUCCESS. Logs show **114 tests, 114 pass, 0 fail** after clean Node 24 install; all syntax checks, existing Function/Edge imports and new digital module imports succeeded. URL: https://github.com/sapiverpress-studio/Poster_gen/actions/runs/37915156120
- VERIFIED again after save: Netlify current Ready deploy remains `6ac88cdf08cadc0008385789`. No software release, default-main worker installation, merchant writes, publication or orders performed.
- This follow-up changes only handover/test evidence. Runtime candidate remains 45240c8; retain it as the reviewed code reference. Owner production authorisation, seller consent, real OIDC/queue/file/frame checks and browser visual acceptance remain outstanding.

### 2026-10-09 12:10 BST — Takeover verification and owner-approved release initiated
- Owner approval: Jim approved candidate 45240c8 software release and main worker installation, with publication disabled and no orders.
- Verified: fresh clean npm ci and 114/114 local tests passed; five release modules imported. Before release, current Netlify deploy remained 6ac88cdf08cadc0008385789 at 7d19796. Live unauthenticated routes returned workflow 503, upload 502, products 404, Etsy start 503 and Canva report 200.
- Release: production feature/canva-oauth-callback fast-forwarded exactly once from 7d19796 to 45240c8b6ceb6f34442074e68e304d87cc735210 using expected-SHA protection. Netlify new Ready deployment not yet observed. No repeat deploy triggered.
- Worker: installed only .github/workflows/poster-publication.yml on main, preserving README/other existing main content, commit c36dd37c8a69b1153493aec16405e28dcef06b76. Schedule/manual worker uses production branch; real signed bootstrap remains pending.
- PrintShrimp: physical route only; digital bypasses supplier. Existing credential preflight HTTP 200 is historical verified evidence. Actual master transfer, nine framed Etsy variants/supplier compatibility and physical proof remain unverified. No supplier product/order or listing publication performed in takeover.
- Next: observe one Ready release; verify owner routes and real worker bootstrap, then normal Etsy seller consent and controlled merchant integration checks. Publication flag not enabled.

### 2026-10-09 12:40 BST — Failed unified release: public-origin scanner false positive
- Owner deploy-log screenshot shows Function/Edge packaging completed; secret scanner rejected the CANVA_SITE_ORIGIN value in worker YAML line 27 and worker script line 5. Previous published site remains live.
- Cause: public HTTPS origin is classified as secret; the earlier regression covered only the status Markdown, missing these worker references. This was a release-preflight omission. No actual private key/token leak is shown.
- Fix: retain exact pinned-origin validation and the same generated worker origin while removing copied literal full-origin values from worker YAML/script. Secret scanning remains enabled without omissions. Extend regression over all tracked release files, including YAML and scripts.
- Release: corrective candidate must pass all tests before one corrective production-branch update; update main YAML with skip-netlify marker. Publication stays disabled; no orders or merchant test writes.
- Verification pending: full suite and real Netlify successful build; no claim that the release is live.

- Test correction: initial broad scanner regression also matched an intentionally invalid URL fixture in test/oauth.test.mjs. Narrowed it to the actual public deployment origin; no production change was attempted after the failed local check.

- VERIFIED after correction: 115/115 local tests pass, zero failures; worker script syntax check passes. Real Netlify correction release pending.

### 2026-10-09 12:45 BST — Corrective release saved and production branch advanced
- Corrective candidate e6e70b0753100008df3cb5a70aedd4fc2e903f8b saved on handover and production branches with expected-SHA checks. Main YAML corrected separately in 943265da6e9f14e74b21f1513fdfca19043e1e3b using skip-netlify commit marker.
- Local verification 115 tests passed, zero failures. Exact worker origin and pinned validation retained; scanner enabled unchanged. Regression scans all tracked files for the problematic literal.
- Latest Netlify connector check still reports previous published deploy 6ac88cdf08cadc0008385789. Successful corrective deployment has not yet been observed. Connector cannot list pending/failed builds or trigger a build. Owner may need one manual latest-branch build if none is queued/running; do not trigger duplicates.
- No merchant writes, orders, supplier uploads, new Canva export or publication-gate activation. Next: verify corrective Ready commit, scanner results and worker bootstrap.

### 2026-10-09 12:42 BST — Corrective release VERIFIED LIVE
- Netlify Ready deploy 6ac8d2cde89cc000087e87c9 published 2026-10-09T11:41:20.351Z, exactly corrective commit e6e70b0753100008df3cb5a70aedd4fc2e903f8b. Both ordinary and enhanced scanner match lists empty; ten Functions and existing Edge bundle packaged successfully.
- Fresh GET checks: /poster/workflow, /poster/upload and /poster/products return 200; these unauthenticated responses demonstrate login-route availability, not full owner/mobile acceptance. /etsy/start returns 503; cached GitHub bootstrap still unverified. No second manual trigger required.
- Correction: preceding 12:45 checkpoint used an approximate timestamp; corrective deployment actually completed at 12:41:20 BST and this verification is 12:42 BST.
- Next: verify first scheduled worker succeeds and unlocks normal Etsy consent; then controlled real merchant tests and frame/size matching. No new approval needed for read-only worker verification. Product publication and orders remain outside this software release.

### 2026-10-09 13:57 BST — Owner interface redesign staged off production
- Owner request: improve the unstyled upload website; professional mobile appearance is part of product readiness.
- Branch: feature/polished-owner-ui, based on latest handover 4beac46. Added lib/owner-page.mjs shared presentation; changed poster-upload-web/product-web/poster-workflow and public/index.html. Forest/cream visual system, compact navigation, readable cards and fields, larger touch controls, responsive dashboard filters, login and home page. Existing input names/IDs, CSRF/session logic, upload endpoints and final approval gates retained.
- VERIFIED: full existing local suite 115/115 pass, zero failures. New shared presentation and both handlers import successfully; script syntax valid.
- Visual limitation: no Chromium executable available in runtime or installed system. Full browser screenshot/mobile appearance check is pending; no assertion of visual acceptance.
- Digital seller-kit importer remains unimplemented; supplied sapiver-testy-etsy-kit.zip is not accepted by current nested-ZIP validator. This styling task does not fix archive compatibility.
- Release/credit impact: isolated branch only; save with skip-netlify marker. No production deployment, new seller writes, supplier upload, publication flag change or order. Single cosmetic release requires owner authorisation after review.
- Next: review redesigned UI and perform actual browser visual acceptance, then one approved bundled release; separately finish seller-kit import and real worker/merchant verification.
