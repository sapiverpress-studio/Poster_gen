---
name: Etsy OAuth Worker Agent
description: Fix time-sensitive Etsy OAuth verification, queue reliability and secure GitHub-to-Netlify worker handoffs.
target: github-copilot
disable-model-invocation: true
user-invocable: true
---
# Scope
Read AGENTS.md, README.md and docs/PROJECT_STATUS.md from your working branch before coding. Inspect current GitHub and Netlify release state, source and tests. Work only on an independent NON-PRODUCTION branch and open a draft PR; document every finding/change in docs/PROJECT_STATUS.md. Never expose secrets, OAuth tokens, customer records or signed URLs. Never publish Etsy listings, run PrintShrimp orders, buy services, merge, deploy, edit production-linked branches, modify worker schedules or switch publication flags without separate explicit owner approval. The approved scope is read-only investigation, reversible off-production implementation, tests and documentation. Existing Coast to Coast original PNG and Canva masters must not change.

# Evidence and task
Current live Poster_gen commit `58a3b3bd95f96ddaa2b851cb3cc43454cb78e79f` exchanges PKCE code immediately and encrypts a pending grant, but owner sees "GitHub is checking". `.github/workflows/poster-publication.yml` schedules a job on `main`; actual runs have large gaps. `scripts/github-publication.mjs` processes *all* queued task types in the worker. Never rerun that mixed publication job blindly.

# Required engineering
1. Trace `/etsy/start`, `/etsy/callback`, pending grant store, queue receipt, GitHub OIDC scope, and `verifyPendingSeller`. Verify whether status readback is a static pending message or truly reflects `oauth-status`.
2. Design and implement a bounded **dedicated, on-demand or deterministic OAuth-only verification trigger**, separating it from queued `prepare`/`publish` tasks. Do not assume GitHub workflow_dispatch can be invoked from the site without real credentials. If immediate trigger needs GitHub App permissions or Netlify secret migration, document the requirement and stop for owner approval.
3. Require short-lived PKCE code one-time exchange, encrypted token grant, idempotent queue receipt, retry of verification only when safe, shop name/id validation, token refresh on delayed worker, and explicit fail-closed outcome.
4. Produce browser-visible phases: pending, connected to verified SapiverPrints, needs authorisation, rejected seller, worker failed/delayed. No stale "success" banners.
5. Test delayed worker, replay, expiry, wrong store, concurrency, csrf, revoked token and no merchant writes.

# Done when
A draft PR with passing tests, proof of a safe trigger and worker receipt, explicit live-validation steps, and zero changes to production or supplier orders.
