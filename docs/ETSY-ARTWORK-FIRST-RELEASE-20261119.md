# Artwork-first Etsy photo release — 19 November 2026

Production-linked source branch: `feature/canva-oauth-callback`
Implementation merged via PR #102 (squash commit `5a5ca50c677ce2e605b855828febc7994b554f2e`).

## Future listings
- Physical prints: first photo is a clean, unframed front view generated directly from the approved original master; subsequent photos retain Black, White and Oak framed previews.
- Digital patterns: when verified full-size PNG/JPEG buyer artwork is present in the delivered source ZIP, that becomes the first image; seller-kit contextual previews follow.
- Trio bundles: the existing clean arrangement of three source masters remains the first cover.
- No alterations to existing customer delivery files, PrintShrimp products, price, SKU, variations or shipping configuration.

## Existing active listings
The private owner page `/poster/lead-images` permits:
1. **Check all Etsy listing images** — signed GitHub worker reads ALL active SapiverPrints listing IDs, image orders and private source artwork. No merchant writes.
2. Review per-listing *current image* alongside the proposed clean close-up. Products without an unambiguous verified source are **skipped**.
3. Explicitly approve a source-hashed batch. The seller API inserts new image at rank 1 with `overwrite=false`; old image IDs remain, and each updated listing is read back.
4. Fail-closed, single-claim execution. Uncertain or rate-limited writes require review rather than blind retry.

The batch must **not** be triggered automatically upon release. The 70-listing count was from the public Etsy catalogue, not proof that 70 matching original master images are privately stored. The read-only audit supplies the actual eligible and skipped counts. A new customer-facing release must be checked on Netlify before owner initiates any write.

## Verification
The full repository GitHub Actions test run 44494502675 completed SUCCESS. The GitHub test workflow was restored and verified again in 44494746501 SUCCESS.
