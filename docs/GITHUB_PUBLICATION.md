# GitHub-backed approved publication

> **Current direction (2026-10-09):** see [UNIFIED_PRODUCTS.md](UNIFIED_PRODUCTS.md). The new staged owner interface uses Deploy as final product approval, digital ZIP products, and **nine framed physical combinations** (A5/A4/A3 × Black/White/Oak). Earlier twelve-option and Approve & Publish descriptions below are historical; no live listing migration is authorised.


Jim selected this architecture on 2026-10-09 because the verified provider secrets already exist in GitHub. No new personal access token and no copying/recovering the PrintShrimp key are required.

## Responsibilities

- Netlify: password/CSRF-protected upload, private artwork/preview/approval state, one-time OAuth browser state, signed GitHub identity verification and scoped private storage bridge.
- GitHub Actions: existing ETSY_PRINTS_KEYSTRING, ETSY_PRINTS_SHARED_SECRET and SHRIMP_APIKEY; Etsy OAuth exchange, seller/template verification, image processing, draft creation, supplier verification and file-approved Etsy publication.
- Existing Canva exports and pinned private master remain unchanged. No orders/payments endpoint.

The browser uploads once. Finish queues preview preparation; Approve & Publish queues that exact approved plan. GitHub collects tasks on a five-minute schedule. GitHub may delay schedules; this is asynchronous, not an immediate deployment. Installation of image dependencies happens only for artwork tasks. Idle polls still consume GitHub runtime/Netlify Function and storage requests; this is not a promise of zero cost.

## Authentication and storage

No GitHub token is installed in Netlify. The worker requests a GitHub OIDC identity with the site bridge URL as audience. The bridge verifies RS256 signatures against GitHub's fixed JWKS endpoint, issuer/audience, immutable repository ID 1410142097, exact repository and workflow path on main, main branch, permitted schedule/manual events and short expiry. Pull-request identities, other workflows, repositories, branches and expired tokens are rejected. No wildcard trust.

Only three named private stores and explicit key families are reachable. Transport is bounded to 2 MB raw chunks; master read checks unchanged ETags across every chunk. Writes assemble private staging chunks. Artwork, OAuth codes, credentials and capabilities never become GitHub artifacts or log output.

The existing site encryption root is released only to that authenticated trusted job, in memory, to reuse encrypted seller sessions. This extends trust in that root to the specific GitHub workflow. The supplier key and Etsy shared secret stay in GitHub. The Etsy app keystring is cached privately for the consent URL, which necessarily includes client_id. Repository administrators able to modify the trusted main workflow/production code are trusted principals; protect those branches appropriately.

Tasks are atomically claimed once before execution. Persisted owner approval must match the upload state and queue approval hash; existing worker rechecks plan/artwork hashes and merchant profiles before writes. An uncertain result keeps its claim and known listing ID, becomes needs_investigation and is never automatically replayed. A runner killed after claim may leave running status and needs manual investigation, not resubmission. No retry of an ambiguous seller write.

## Etsy connection

The worker first caches the existing app keystring. /etsy/start uses the existing site setup password and Etsy PKCE consent. /etsy/callback validates encrypted browser state and queues a private code-exchange task; refresh that page to see completion. Worker performs token exchange and exact SapiverPrints shop verification, retaining encrypted tokens privately. The code/browser flow must still be valid when collected (10-minute window); a delayed GitHub schedule may require fresh consent. Register the exact existing site origin + /etsy/callback in the Etsy developer app; owner browser consent cannot be replaced by the application key.

## Controlled release

1. Stage/test on off-production handover branch; do not start schedule before release.
2. Owner approves one bundled Netlify production release and installation of .github/workflows/poster-publication.yml on default main. Main is separate from the Netlify production branch. Install only the workflow there, preserving other main content. It checks out the production branch; never run secrets from pull-request code.
3. Verify Ready commit and owner-login route, then start the workflow and verify real signed identity/bootstrap/queue access. These are unverified before deployment.
4. Connect Etsy in normal browser, select the actual reference listing and prepare a real checked PNG preview. Validate live profile fields, Edge supplier delivery and frame fulfilment. POSTER_PUBLICATION_ENABLED remains disabled until these checks support publication. Each final button is per-product approval; software release is a separate approval.

Local tests cover real RSA JWT acceptance/rejection, bridge scope rejection, 37.4 MB byte-exact transport and version drift, queued OAuth replay, exact persisted owner approval, concurrent worker pickup and ambiguous failure. Existing full simulated draft/supplier/publication tests also remain. They do not prove live GitHub/Netlify identity acceptance or supplier transport.

References: https://docs.github.com/en/actions/reference/security/oidc and https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule
