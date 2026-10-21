# Eight-listing collection — release and integration verification

Status: feature-only; **NOT approved for production**. PR #56, `feature/eight-listing-six-poster-20261021`.

## User-facing contract

- Six independent physical posters are prepared from an owner-reviewed ZIP, each with its own approved master and Etsy/PrintShrimp product reference.
- `bundle-1.md` and `bundle-2.md` must specify three different, non-overlapping member poster folders. Both trios must have distinct title, description, 13 tags, fixed size and supplier bundle SKU.
- The total count is eight Etsy listings: six individual artworks and two trio bundles. Do not copy the first trio's tags, member assignments or description onto the second.
- Maintain the existing single-poster upload independently and 2–5 individual-only bulk ZIPs.

## Security and provider safeguards

1. Member posters must already be **published and approved** for the trio's fixed print size; current original Etsy listing state and unframed size/price must be checked.
2. Compare each original Etsy SKU and stored PrintShrimp `product_id` with a live PrintShrimp product GET, including supported size and artwork URL. Comparing SKU text alone is insufficient.
3. Read any existing PrintShrimp bundle and verify **exactly** three `sku + size + quantity 1 + product_id` members. Reuse an exact match; a mismatch must block publication.
4. Calculate bundle customer price against current verified individual unframed prices and supplier GB quote. Reject a contribution under the configured minimum. The Etsy fee allowance and supplier discount are estimates; real fees/discounts must be confirmed with the provider.
5. Treat any ambiguous merchant write, timeout, or lost response as **needs investigation**, not a reason to send a second POST. Keep the Etsy listing ID and PrintShrimp bundle identity for operator reconciliation.
6. Verify the Etsy draft after creation: shop, physical listing type, state=draft, exact title, description, tags, SKU, price, quantity, and four images. Never infer that an Etsy SKU alone proves supplier order routing.
7. The **default** completed stage is an unlisted, verified Etsy draft (`phase=draft_verified`). `POSTER_BUNDLE_ACTIVATION_ENABLED` must be explicitly true to permit activation on a new, owner-approved bundle run. Do not enable it for the first integration test. An existing verified draft cannot be activated through the same spent approval claim; it requires a separately approved manual review/recovery workflow.

## Remaining external verification

These steps require the owner's live merchant setup and are not established by mocks or GitHub CI.

- **Read-only checks:** actual PrintShrimp GET product/bundle/pricing responses; actual Etsy authenticated seller listing and inventory responses; exact seller shop and product source IDs. Do not print API tokens or buyer information in logs.
- **Controlled draft test:** with a genuinely approved six-poster collection, create both supplier bundles under their reserved SKU and both unlisted Etsy drafts; verify each distinct trio's component artwork, shipping profile, production partner, price, description and images.
- **Fulfilment confirmation:** confirm PrintShrimp's connected Etsy store, order auto-import, automatic payment/credit arrangement and the provider's mapping of an Etsy set SKU to three physical component prints. Verify a controlled test order / provider import before public sale; inspect its actual items and total supplier charge, and do not place a paid order without the owner's explicit approval.
- **Release:** only after tests, release conflict review with other pending branches, and owner authorisation should this feature be merged to the Netlify-linked production branch. Preserve the existing live uploader. Never enable automated fulfilment solely on assumptions.

## Testing evidence

- Source identity, member overlap, ZIP and tag validation: GitHub unit tests on feature branch.
- Supplier create/read-back and Etsy draft path: mocked integration tests; not real merchant transactions.
- GitHub Actions green is required but not sufficient for production.
