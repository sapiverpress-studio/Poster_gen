# Poster_gen — coordinated agent team and acceptance gates

**Date:** 2026-10-13  
**Owner objective:** One reliable, safe workflow from original Coast to Coast PNG → private Poster_gen preparation → Etsy 12 physical options → verified PrintShrimp mapping. Do not publish or place an order during integration testing.

## Current evidence

- Live Netlify site is `sapiver-poster-gen-auth.netlify.app`, linked to `feature/canva-oauth-callback`; last verified live commit `58a3b3bd95f96ddaa2b851cb3cc43454cb78e79f`.
- Existing app credentials and PrintShrimp API secret **names** are present in GitHub Actions; secret values are not accessible and must never be copied to files/logs.
- The owner returned from Etsy and saw `Etsy authorisation code secured; GitHub is checking the SapiverPrints seller account` at 12:43 BST. That verifies immediate code exchange and safe queueing, **not** verified seller access.
- The scheduled main-branch `Approved poster publication` worker has recorded long delays. It checks out the production-linked code and processes queued `oauth`, `catalog`, `prepare`, `publish` tasks; a blind rerun can cause unrelated queued tasks to run. Do not use that as an OAuth-only trigger.
- The physical seller reference selector was previously empty and blocked Coast to Coast. A valid 12-option Etsy reference and PrintShrimp frame capability are not yet verified.
- Etsy Developer Mode is not a merchant API sandbox. Do not rely on it to make publishes or supplier orders harmless.

## Actual agent status

Five **custom GitHub Copilot agent profiles** have been defined in `.github/agents/` on an off-production branch. Profiles and issue tickets are **configuration, not evidence of a running agent**. They can be used by an eligible GitHub Copilot cloud agent once the configuration is available to its runtime, or as role instructions in a supervised ChatGPT Work task. GitHub Copilot entitlement, availability and automatic assignment have **not** been verified; do not claim jobs are running. A draft PR is for review and is not approval to merge.

## Team responsibilities and GitHub tracking

| Lane | Agent profile | Issue | Produces |
| --- | --- | --- | --- |
| Coordination | `coordinator.agent.md` | [#2](https://github.com/sapiverpress-studio/Poster_gen/issues/2) | Dependency matrix, conflict review, owner release decision |
| Etsy auth | `oauth-worker.agent.md` | [#3](https://github.com/sapiverpress-studio/Poster_gen/issues/3) | Safe deterministic/on-demand OAuth-only verification, hardened tokens, tests |
| Etsy catalogue | `etsy-catalogue.agent.md` | [#4](https://github.com/sapiverpress-studio/Poster_gen/issues/4) | Read-only real shop/template evidence, exact 12 variations or blocker |
| PrintShrimp | `printshrimp-variants.agent.md` | [#5](https://github.com/sapiverpress-studio/Poster_gen/issues/5) | 12 supplier options, SKUs, cost/ship evidence, dry-run tests |
| QA / release | `release-auditor.agent.md` | [#6](https://github.com/sapiverpress-studio/Poster_gen/issues/6) | Independent security/functional signoff, rollback plan, red/amber/green |

## Parallel work and dependencies

1. **Immediate:** OAuth agent examines trigger and worker boundary. Catalogue and supplier agents investigate existing contracts and write isolated fixture tests in parallel. Auditor prepares independent tests and risk checklist.
2. **Hard gate:** Only after the identity check proves correct `SapiverPrints` shop can catalogue agent claim real seller API data. A successful Netlify deploy, OAuth callback, or GitHub job by itself does not prove seller access.
3. **Second gate:** Catalogue identifies a real seller reference with exact size/frame Etsy property-value IDs, SKU and delivery profile. Supplier agent independently verifies the PrintShrimp product/finish mapping and costs. Missing features or invalid frames stop the process.
4. **Private acceptance:** Owner uses existing original Coast to Coast art (no edit) to prepare a *private* product with A5/A4/A3 × Print Only/Black/White/Oak; no publication, payment or automatic supplier order. Android/mobile result and safe preview photos must be inspected.
5. **Independent QA signoff:** Auditor reviews code, operational guardrails and real evidence, then coordinator proposes a **single batched production software release** only with owner approval. Per-product publication requires a **separate explicit approval**.

## Handoff contract (every agent)

- Read `AGENTS.md`, `README.md`, `docs/PROJECT_STATUS.md`, and this plan on the actual working branch, then inspect current code and live commit.
- Own a separate nonproduction branch/PR; describe precise files touched; do not overwrite a peer's branch or merge directly.
- Attach reproducible tests, evidence links, what was fixture-tested vs verified live, known blockers and security/credit impact.
- Update `docs/PROJECT_STATUS.md` on the same branch with a dated checkpoint.
- Coordinator reviews all PRs as a release package. No claim of successful Etsy or PrintShrimp integration from mocks alone.

## Stop conditions and approval boundaries

**No:** new Etsy application/API key, manual per-product recreation, exposure of secret values; GitHub Actions worker reruns that can drain the mixed publish queue; external store writes, listing activation, supplier product/orders/purchases; silent retries of ambiguous merchant writes; Netlify production deployment, merge, workflow/billing changes or third-party paid agent runs without further owner approval.

**Allowed now:** role definitions and issue/PR creation, reading repository/public docs, branches and local/offproduction tests, read-only mock fixture investigation, documentation.

## Required finish line

| Gate | Required proof | Initially |
| --- | --- | --- |
| G1 Verified OAuth | Real seller identity, stable refresh, on-demand isolated worker or explicit independent trigger | BLOCKED |
| G2 Etsy product template | Real, accessible SapiverPrints listing/reference with 12 exact size/frame variants and SKUs | BLOCKED |
| G3 PrintShrimp | All 12 fulfiller options supported or explicitly limited, safe no-order dry run | BLOCKED |
| G4 Artwork review | Correct A-series fit, no cut-off text, private Coast to Coast product preview on owner phone | NOT STARTED |
| G5 Independent test gate | Automated tests, source and security review, zero unexpected writes | NOT STARTED |
| G6 Release | One separately owner-approved Netlify deploy and then distinct per-product approval | NOT AUTHORISED |

**Do not interpret a configured agent profile or an open issue as a running agent or an executed solution.**
