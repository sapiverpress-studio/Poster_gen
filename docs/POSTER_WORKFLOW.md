# Draft-first poster workflow — release candidate

Staged on `docs/handover-and-change-policy-20261008`; not live. Follow AGENTS.md and PROJECT_STATUS.md. This release candidate adds seller consent, automatic token refresh, draft preparation and one-master supplier transfer. It cannot publish listings or create orders.

## One bundled release

Before an owner-approved production release, ensure the existing `ETSY_PRINTS_KEYSTRING`, `ETSY_PRINTS_SHARED_SECRET` and `SHRIMP_APIKEY` are available with Netlify Functions scope. GitHub Actions secrets do not automatically reach Netlify. Use private provider settings, never chat, public files or logs. Existing Canva configuration remains required.

Register exactly `CANVA_SITE_ORIGIN` plus `/etsy/callback` in the Etsy developer app. No trailing slash. App authentication has passed; seller consent is separate. Deploy only the reviewed candidate once, after explicit approval, preserving existing private Blobs.

## Owner steps

1. Open `/etsy/start` in your normal browser and authorise SapiverPrints. This connects seller access and stores encrypted tokens.
2. Open `/poster/workflow` using the existing setup password. Select an existing physical GBP poster with the intended A5/A4/A3 prices, stock, Size variations, postage, returns and processing settings. The reference must have exactly one usable offering per requested size and a common processing profile. An existing production partner named PrintShrimp is required. Other sizes on the reference are ignored.
3. Review the new title and description. Create the unpublished draft. The background task checks the proposed SKU is unused across all listing states, reserves the product, creates once, sets inventory and reads back the draft. Refresh status to obtain its listing ID.
4. Review the actual stored artwork for text, sharpness and trim. Confirm that review, then transfer the existing master with the verified draft ID. There is one source PNG and one temporary URL shared across the supplier's three size variants; no Canva re-export.
5. Check the completed status and supplier product. Actual full-size transport and supplier persistence must be verified on the live release. Sale and paid sample/order approvals are separate.

## Failure recovery

A provider timeout may have created a draft/product. The product reservation and background job claim prevent automatic duplicates. A needs-investigation state is a stop: inspect private job state plus Etsy/PrintShrimp before any repair. Never delete a reservation to make a failed button work. Draft listing IDs are retained where known. Inspect the existing draft rather than creating another.

Refresh token claims also stop retries after ambiguous exchanges. Reconnect the verified seller or investigate; never print tokens. Conditional Blob ETags protect a newer connection from a concurrent refresh.

The supplier master ticket is revoked after success or ambiguity and expires after fifteen minutes. Only the pinned approved master can stream through `/print/master.png`; no permanent public artwork link exists. Node tests cover control flow, not the real master image or Edge performance.

## Validation

71 local tests passed, including owner CSRF, signed runner replay protection, actual-byte checksum guards, SKU collision audit, unpublished inventory, token refresh concurrency and simulated draft-to-supplier transfer. Runtime entrypoints import successfully. GitHub CI performs clean dependency installation and runtime imports. Real consent, profile compatibility, provider acceptance, full-size streaming and print proof remain unverified until live testing.

API contract checked against Etsy's current first-party schema at `https://www.etsy.com/openapi/generated/oas/3.0.0.json` and authentication/listing guides on developers.etsy.com. Supplier contract comes from owner-supplied merchant documentation screenshots. No order endpoint or listing-state activation is used.
