# Sapiver Poster Gen — living status, decisions and handover

> **MANDATORY:** Read root [AGENTS.md](../AGENTS.md) before modifying this project. Every change or significant development must update this file. The snapshot below is authoritative for the **current stage**; later sections contain dated **historical** entries that may describe earlier incomplete stages.

## CURRENT PROJECT SNAPSHOT — 2026-10-08 (UK time)

| Area | Current evidence-based state |
| --- | --- |
| Project | Sapiver Prints Canva → private print-master validation → eventually Etsy drafts and PrintShrimp fulfilment |
| Repo | `sapiverpress-studio/Poster_gen` |
| Live Netlify application | `sapiver-poster-gen-auth.netlify.app`; production code last confirmed on `feature/canva-oauth-callback`, SHA `d7034cfb3e2c007ec467515f05b1811ddd6bcb77`. Latest build-setting status is **not confirmed**; do not change or release without asking. |
| Development branch | `docs/handover-and-change-policy-20261008` contains the living handover and staged automatic export worker + protected status report. **Not merged or deployed to production.** |
| Product | **Hen & Bea: Dinosaurs Across Time** poster, **A5 / A4 / A3 only** (not A2/A1). Different from the user's approved `Dinosaurs of the World` map poster. |
| Original Canva source | `DAHXUnmHofY` — 1024 × 1536, 2:3. **Do not overwrite or restyle.** Original share link: https://canva.link/jyolzhklfl2tpph |
| A3 Canva working copy | `DAHXb1PdJlM` — 3508 × 4961, A-series ratio. Edit link: https://www.canva.com/d/x6_QPM4gnK8kZkR |
| Canva authorisation | **VERIFIED:** OAuth connected via Netlify; successful connection shown to owner. Encrypted token storage reported by app. Live automatic token refresh/expiry cycle **not independently tested**. |
| A3 export | **VERIFIED by owner-provided live report screenshots:** requested and actual **3508 × 4961 PNG**, file **35,014 KB** as reported, A-series ratio **1.4142**, PrintShrimp 50 MB check **passed**. File itself not independently downloaded and inspected in this handover. |
| Print resolutions | **VERIFIED by owner's validator screenshot:** A5 **600 PPI**, A4 **424 PPI**, A3 **300 PPI**. PPI alone does not approve actual image detail or printing. |
| Print layout | **OWNER-APPROVED AND SAVED:** Background-only correction on A3 Canva copy `DAHXb1PdJlM` was committed after the original editing session expired. Verified by reopening Canva and reading the persisted scenic element at left 0, top -150, size 3508 × 5262 (38 text elements and 52 image layers still present). **Remaining:** visual print proof for heads/tails, text, edges and 2–3 mm safe areas; saving is NOT a full print approval. |
| Print approval | **NOT APPROVED:** inspect the actual master at print size for legibility/soft assets, correct dinosaurs/labels, colour and 2–3 mm safety, and obtain PrintShrimp compatibility/proof before selling. |
| Etsy + PrintShrimp | **NOT IMPLEMENTED / NOT AUTHORISED FOR LIVE ACTIONS:** no listing publication, manufacturing order or automatic product sync. Existing secrets alone do not prove API integration is working. PrintShrimp SKU-to-size mapping/one-file suitability must be verified with its real workflow, not assumed. |
| Credit safeguard | Netlify team usage screenshot (Oct 8): **182 production deploys / 2,730 credits** and **2,873.9 total credits in the billing period**. This is team-wide; do not claim Poster_gen caused all 182. GitHub showed 48 Poster_gen commits in a single afternoon. **No production deploy merely for documentation; batch changes, require owner release approval.** |
| Immediate stage | **ONE production deployment authorised 2026-10-08, but RELEASE PAUSED:** Canva A3 design `DAHXb1PdJlM` now reports `updated_at=1791485393` rather than pinned approved timestamp `1791484484`. Release would be blocked by design-change protection, so obtain explicit approval of this newer revision before repinning and making the single controlled release. Export and physical proof remain pending. |

### What is done and verified

1. Secure Canva OAuth start/callback flow and browser authorisation; owner saw `Canva connected`.
2. Private Canva PNG export and asynchronous, session-gated status/download workflow; actual earlier 3× 3072 × 4608 PNG and A3 working-copy 1× 3508 × 4961 PNG completed according to owner screenshots.
3. PNG dimension and aspect-ratio analysis, effective PPI for paper sizes, limited file-size validation, Netlify Blobs private storage, and automated GitHub tests.
4. Created independent Canva A3 working copy; its original text and illustrations were present in element inspection. Original design unchanged.
5. GitHub tests and Netlify deploy were confirmed passing/Ready at prior checkpoint. This **does not** verify PrintShrimp production use or a physical proof.

### What needs doing — in order

1. **Approved Canva draft completed:** background-only adjustment approved, committed and reopened to verify persistence. No owner-side Canva save or download is required for this step.
2. **Print-quality audit:** download/inspect full-size 3508 × 4961 PNG; check every dinosaur and title, pronunciation labels, edge safety, background joins, raster sharpness, sRGB / printer requirements. Mark any failures precisely.
3. **Production print proof:** confirm PrintShrimp accepts one A3 file for A3/A4/A5, with SKU/variation mapping and pricing, then order/inspect a sample only with owner's explicit permission.
4. **Exporter generalisation:** after master proves good, accept arbitrary Canva designs rather than a hardcoded design ID, and retain the pass/fail gate and private original-safe workflow.
5. **Etsy draft integration:** create **drafts only** behind explicit approval; map the three variations, photographs, titles and descriptions; no automatic live publishing.
6. **Controlled release:** one combined, tested release after approval, not a new Netlify production build per small commit. Verify billing/build policy before any GitHub push to the deployed branch.

### Key commands and endpoints

- Tests: `npm test` (Node 20+).
- App start: `https://sapiver-poster-gen-auth.netlify.app/canva/start`.
- Print check: `https://sapiver-poster-gen-auth.netlify.app/canva/print-check`.
- Existing export status: `https://sapiver-poster-gen-auth.netlify.app/canva/print-status`.
- Private PNG download: `/canva/print-file` (**requires the owner's browser session; never publish or commit the URL, cookie or content**).
- Canva master working copy: `DAHXb1PdJlM`.
- Verify source branch and deployment before any changes; don't assume branch deploys are free or disabled.

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

GitHub Actions run 37798949308 passed at commit 65c0ced0437da7ba9cfd532316b1186d40c029d4. Netlify production deployed the exact commit Ready with zero secret-scan matches. New A3 export has NOT yet been started with owner password. Do not mark as final product before: (1) owner checks Canva A3 working copy visually (no clipping and readable names) (2) owner uses https://sapiver-poster-gen-auth.netlify.app/canva/print-check to export A3 1× (3) status report confirms image dimensions/under-50MB (4) printer proof or detailed PDF review.

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
