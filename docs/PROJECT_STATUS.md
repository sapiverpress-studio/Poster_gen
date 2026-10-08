# Sapiver Poster Gen — current handover

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
