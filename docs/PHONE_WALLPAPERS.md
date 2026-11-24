# Five phone wallpapers — uploader contract

Status: released to production on 24 November 2026 as `524be6f232a878dd886edb5f765929d202bd5ad7` (PR #134). Netlify deploy `6b0564f21b295e899049b2aa` is READY at the exact release commit. Actual Android import remains unverified.

The bulk page offers **5 phone wallpapers** alongside the physical Individual, Singular trio and Six-pack choices. It opens `/poster/upload?type=digital&kind=wallpaper`, using the existing protected digital upload, review and owner Deploy flow. Exactly one product is prepared for the five-image bundle. No PrintShrimp, physical variation or order action is added.

## Owner preparation

Jim supplies five images together in a ZIP. Recommended Canva canvas: **1440 × 3200 pixels, portrait**. JPG or PNG are accepted. Existing Canva filenames, spaces and numbers are welcome; there is no numbered-filename requirement. The ordinary archive security rules still apply to paths, duplicate names and unsupported files. Export the images upright; an EXIF tag that would turn a portrait into a landscape is rejected.

The packager handles naming only if necessary, listing copy, previews, customer instructions and licence. The uploader does not silently resize or re-encode buyer images. It checks five different image payloads, each at least 1440 pixels wide and 3200 pixels high, with portrait proportions. Exact 9:20 proportions and a DPI tag are not required. Larger portrait exports are permitted.

## Ready-to-upload seller kit

Use the existing one-level seller envelope:

```text
LISTING-METADATA.json
UPLOAD-TO-ETSY/<any-safe-buyer-zip-name>.zip
LISTING-IMAGES/<any-safe-preview-name>.jpg
```

The buyer ZIP(s) contain the five image files and customer documents, including `LICENSE.txt` (or `LICENCE.txt`) and `README.txt` (or `INSTRUCTIONS.txt`). These document names are the packager's responsibility. Seller metadata and preview images stay outside customer downloads. Existing limits remain: seller envelope at most 100 MB, at most five customer ZIPs, each at most 20,000,000 bytes. The existing independent lossless split path remains available for plain buyer ZIPs. A single image that cannot fit an Etsy attachment is rejected without reducing it.

`LISTING-METADATA.json` must be STORED (uncompressed) in the outer ZIP for the bounded mobile manifest reader. Example:

```json
{
  "format": "sapiver-wallpaper-seller-kit",
  "version": 1,
  "reviewRequired": true,
  "product": {
    "type": "digital",
    "kind": "wallpaper",
    "wallpaperCount": 5,
    "name": "Winter Windows",
    "subject": "Winter Windows",
    "etsyTitle": "Winter Windows Phone Wallpapers, Five Christmas Backgrounds",
    "description": "Five winter scenes, created with the aid of AI.",
    "price": 2.99,
    "sectionTitle": "Digital Downloads",
    "tags": ["phone wallpaper", "winter wallpaper"],
    "useEmbeddedText": true,
    "aiAssisted": true
  }
}
```

The example price and tags are illustrative, not verified demand research or an instruction to publish at that price. The packager should supply reviewed product-specific wording and relevant tags. Set `aiAssisted` truthfully; if true the description must disclose AI assistance. Hand-drawn artwork can set false without an invented disclosure.

Optional `product.imageAltTextByFilename` maps every actual preview basename to its 35–250 character description. It accepts one to ten preview filenames, matched exactly to the supplied photos; no pattern/cushion photo names are required. The real display order is the archive's sorted preview order, independently checked on the server. Normal review corrections and Etsy saved-alt readback remain in place.

The browser imports name, subject, Etsy title, description, price and tags automatically. It selects `wallpaper` and removes the pattern repeat confirmation. The server checks the actual buyer images independently of the manifest's count claim. An owner-selected product group that conflicts with the manifest is rejected before category lookup.

## Plain ZIP support and listing review

A plain buyer ZIP can also be uploaded in wallpaper mode. Supply its missing product details in the existing form, or use its embedded customer documents. The server generates six 2000 × 2000 listing photos: all five designs together and one full-image phone preview per design. Phone frames are illustrative; buyer pixels are preserved. Ready-made seller kits retain their supplied listing photos.

The digital listing text describes phone settings and possible device cropping, without printable-poster instructions or universal device-fit claims. Its category is selected from the live Etsy taxonomy's compatible Digital Prints leaves, with the usual manual selection if ambiguous. The shop section is Digital Downloads. Preparation does not publish. The existing owner Deploy approval is still required to create or update a live listing.

## Verification and limits

- Baseline: 657/657 local Node 24 tests passed.
- Final: 671/671 passed, including arbitrary names and unchanged buyer hashes, real JPEG/PNG dimension and orientation checks, four/six/duplicate rejection, actual seller ZIP and mobile manifest imports, exact preview alts, six rendered previews, mode selection, and existing physical/digital publication regressions.
- Rendered cover and individual preview inspected locally with synthetic images.
- A Playwright mobile harness could not start: its default Chromium was absent and the installed Chromium was blocked by environment socket permissions. No browser or physical Android acceptance is claimed.
- One owner-approved production release is verified READY; the three live uploader modules match the tested source. No real wallpaper listing, merchant file upload, supplier call or order was performed. The first actual Android import and any separately approved listing publication remain unverified.
