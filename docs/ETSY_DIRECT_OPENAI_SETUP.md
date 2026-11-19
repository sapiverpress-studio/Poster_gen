# Etsy SEO: separate OpenAI API billing (production)

The Sapiver poster uploader's Etsy image analyser and current-listing SEO analyser do **not** use Netlify AI Gateway. Both require the site-specific environment variables below. Keep keys out of GitHub, chat, code and the browser.

## Netlify configuration

Project: `sapiver-poster-gen-auth`.

Under **Project configuration → Environment variables**, set in the **Production** context with **Functions** scope:

| Name | Required value | Sensitivity |
| --- | --- | --- |
| `SAPIVER_OPENAI_API_KEY` | Your own OpenAI Platform API secret key, with provider billing enabled | Secret: yes |
| `SAPIVER_SEO_AI_MONTHLY_CALL_LIMIT` | A whole number 1–200; start with `10` | Secret: not necessary |

The legacy/injected `OPENAI_API_KEY` and `OPENAI_BASE_URL` variables are **not** accepted by the Etsy SEO code. There is no Netlify AI Gateway fallback. Missing direct credentials or budget disables only optional AI analysis; manual Etsy data preparation remains usable.

After changing Netlify environment variables, perform one new production deployment to load the settings. No paid AI request is required to deploy. Restrict the API key to Production + Functions where the dashboard allows it; no need for Build or Runtime access.

## Spend controls

A model request, including each corrective retry, atomically reserves one monthly slot in the private Netlify Blob store **before** calling OpenAI. Once the request-attempt cap is exhausted, the analyser blocks new calls. Failed requests still consume slots. Successful validated suggestions are cached using SHA-256 of the relevant artwork and listing metadata; repeated identical analysis uses the cache without a further model call. Current-listing images are fetched again to verify the content even on a cache hit; normal Netlify function and Blob use may still consume platform credits.

**This is a request-count cap, not a dollar/pound spending limit.** Set project budgets and spending alerts separately in the OpenAI Platform and monitor actual usage. The ChatGPT subscription does not include third-party website API requests.

## Owner-only acceptance test

After one production deploy, try a single small artwork with the owner session. Confirm one OpenAI API request succeeds, re-run identical data and confirm cache hit with no new OpenAI request. Then try a second listing type. Do not automatically rewrite current Etsy listings. Keep the verified seller approval/read-back path intact. Production has not yet been end-to-end tested with the owner's private API key.
