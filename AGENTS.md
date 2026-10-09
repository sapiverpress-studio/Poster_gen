# Mandatory project instructions — Sapiver Poster Gen

These instructions apply to anyone, including an AI coding assistant, working in this repository. **The authoritative living project record is `docs/PROJECT_STATUS.md`.**

## Before doing ANY project work

1. Read this `AGENTS.md` in full, then `README.md`, and then `docs/PROJECT_STATUS.md`, especially its **CURRENT PROJECT SNAPSHOT** at the top and the most recent dated entries.
2. Inspect the actual relevant source, configuration, tests, current branch, and deployment status. Never infer that a feature is implemented simply because it was discussed in chat or appears in a historical note.
3. Identify the next smallest reversible task, expected tests, affected services, and any deployment/credit cost.
4. Check whether the work could trigger an automatic Netlify production build. **Never push changes to a production-deployed branch, merge, trigger a deploy, alter build settings, or spend more Netlify credits without explicit owner approval.** Use a verified non-production branch for development; its Netlify deploy settings must also be checked before pushing code.
5. Never rely on an earlier chat having read or preserved this file. Reopen the files at the start of every independent work session.

## Mandatory documentation on EVERY change or development

**Every significant decision, investigation, code/documentation change, test result, Canva design change, API integration change, bug, deployment, or new limitation MUST be reflected in `docs/PROJECT_STATUS.md` in the same working branch, as part of the same work item and before the work is described as complete.**

- Update **CURRENT PROJECT SNAPSHOT** when the project's actual state, blockers, live branch, constraints or next actions change.
- Append a dated entry in **Development history** covering: what changed; why; exact branch and files/design IDs; safety/credit impact; tests executed and observed results; verified/unverified outcomes; outstanding risks; next step.
- Distinguish **VERIFIED**, **IMPLEMENTED BUT UNTESTED**, **PENDING**, **BLOCKED**, and **NOT IMPLEMENTED**. Do not turn an assumed or screenshot-only fact into a verified full-file or live-service claim.
- Document failed tests and unsuccessful deployments too; document the subsequent fix and successful verification separately.
- Preserve historical entries; correct inaccuracies by adding an explicit correction rather than silently rewriting history. Never leave outdated claims as the unqualified current snapshot.
- Never write credentials, API tokens, passwords, private customer information, signed download URLs or secret environment-variable values into Markdown, Git history, chat, screenshots or logs.
- If a task is read-only and discovers new facts, record material project findings at the next explicitly approved documentation update; do not incur a production deploy solely to update a note.
- If documentation cannot safely be committed (e.g. builds would be billed), state exactly what remains undocumented and where it should be recorded on the next authorised commit.

## Release and business guardrails

- **Avoid paid deployment churn:** batch related, tested changes; prefer local tests or GitHub checks, then a single owner-approved Netlify release. Documentation-only commits must not cause billable production deployments.
- **Canva original:** keep source design `DAHXUnmHofY` unchanged; use separate working copies. Never save an unapproved Canva editing transaction.
- **Current product:** `Dinosaurs Across Time`, not the separate Dinosaurs of the World map poster; A5, A4 and A3 ONLY. Aim for one validated A3 master, not extra A2/A1 variants.
- **Print quality:** measured pixel count / PPI is necessary but does not prove source illustration sharpness, factual accuracy, trim margins, colours, or PrintShrimp acceptance. Require visual review and appropriate print proof before sale.
- **Etsy and PrintShrimp:** no live listing publication, production order, fulfilment purchase, or automatic synchronisation without explicit owner approval and safe dry runs.
- **Status of Canva:** account authorisation and high-resolution exports were demonstrated; repeat tests only to address a concrete remaining failure.
- Never change another repository, production site, workflow, automatic deploy setting, or billing preference on the basis of these instructions alone.

## Standard handover format

Append to `docs/PROJECT_STATUS.md`:

```md
### YYYY-MM-DD HH:MM [time zone] — Descriptive checkpoint
- Stage / purpose:
- Changed: [files, branches, Canva IDs]
- Verified: [how tested, evidence, result]
- Not yet verified / blocked:
- Deploy / credit impact: [explicit, or "none"]
- Risks / decisions:
- Next authorised action:
```

## Finding this file in future chats

Give the next coding assistant a link to this repository and instruct it to read `AGENTS.md` and `docs/PROJECT_STATUS.md` **from the branch containing the current handover before writing code**. These are repository instructions, **not a guarantee that every new ChatGPT conversation automatically reads them**.

If multiple branches have a copy, use the most recently owner-approved active project branch, and reconcile differing snapshots before writing code.

## Owner-upload approval update — 2026-10-09

Jim authorised implementing the uploaded-file workflow in docs/UPLOAD_WORKFLOW.md. For future products the filename supplies the subject/SKU and docs/SAPIVER_POSTER_TEMPLATE.md fixes three sizes and four finish options (12 combinations). A final authenticated Approve & Publish press approves that exact checked upload plus displayed listing plan for publication; it is not approval for orders or a software deployment. The existing pinned Canva master/export is retained. Release approval, fail-closed live checks and documented supplier frame matching remain required before enabling the new publication gate.
