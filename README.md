<p align="center"><img src="public/logo.svg" alt="Fileward" width="420" /></p>

# Fileward

**Your files stay yours.** Everyday PDF and image tools that run 100% in your browser. Files never leave your device, and every tool keeps working offline.

A **Silverlight DevTech** project · © 2026 Silverlight DevTech. Source-available under the [PolyForm Noncommercial License 1.0.0](LICENSE.md).

More apps: https://lance6x5.github.io/

_Repository: `private-file-toolkit`_

**Live app:** https://lance6x5.github.io/private-file-toolkit/

## Tools

Each tool is its own static page (good for search), built as a Vite multi-page app:

| Tool | Page | Library |
| --- | --- | --- |
| Merge PDF | [`/merge-pdf/`](https://lance6x5.github.io/private-file-toolkit/merge-pdf/) | pdf-lib |
| Split PDF (ranges, every page, every N pages; ZIP download) | [`/split-pdf/`](https://lance6x5.github.io/private-file-toolkit/split-pdf/) | pdf-lib, JSZip |
| Reorder / rotate / delete pages (thumbnail grid) | [`/organize-pdf/`](https://lance6x5.github.io/private-file-toolkit/organize-pdf/) | pdf.js, pdf-lib |
| Redact PDF (real redaction, verified) | [`/redact-pdf/`](https://lance6x5.github.io/private-file-toolkit/redact-pdf/) | pdf.js, pdf-lib |
| Compress image (JPG/PNG/WebP, quality, max size, before/after) | [`/compress-image/`](https://lance6x5.github.io/private-file-toolkit/compress-image/) | Canvas / OffscreenCanvas |
| Resize / convert image (JPG, PNG, WebP, AVIF where supported) | [`/resize-image/`](https://lance6x5.github.io/private-file-toolkit/resize-image/) | Canvas / OffscreenCanvas |
| HEIC to JPG (batches) | [`/heic-to-jpg/`](https://lance6x5.github.io/private-file-toolkit/heic-to-jpg/) | libheif-js (WASM, this page only) |
| Remove photo metadata (EXIF, GPS, XMP, IPTC) | [`/remove-photo-metadata/`](https://lance6x5.github.io/private-file-toolkit/remove-photo-metadata/) | exifr + lossless stripper |

Plus a **How do I know?** page ([`/how-do-i-know/`](https://lance6x5.github.io/private-file-toolkit/how-do-i-know/)) that explains client-side processing, shows a live count of requests to other websites (expected: 0), prints the page's Content-Security-Policy, and holds Export / Import / Reset for the app's settings.

Shared on every tool: big drag-and-drop zone plus file picker, multiple files, paste from clipboard for images, progress bars, Web Workers for the heavy lifting, device-memory-based file size limits with friendly messages, per-file downloads or a ZIP for batches, a header linking every tool, a privacy badge, a help section with FAQ, and related tools.

## Privacy: how the guarantee is enforced

- **No uploads, no backend.** Files are read with the File API, processed in this tab (JavaScript, WebAssembly, Web Workers) and saved through local `blob:` download links.
- **No analytics, no visit counter, no cookies, no third-party code.** Fileward makes no network requests after the page and its WASM load. All libraries, WASM and pdf.js support files (CMaps, standard fonts, image decoders) are bundled and self-hosted; nothing is loaded from a CDN.
- **Content-Security-Policy on every page** (production builds, `src/site/csp.js`): `default-src 'self'`, `script-src 'self'` (plus `'wasm-unsafe-eval'` only on the HEIC, Reorder and Redact pages), **`connect-src 'self' blob: data:`**, `worker-src 'self' blob:`, `object-src 'none'`, `frame-src 'none'`, `form-action 'none'`. The browser itself blocks any attempt to send data to another origin.
- **Workers inherit the CSP.** Workers loaded from a URL would get their CSP from HTTP headers (GitHub Pages sends none), so every worker is started from a tiny `blob:` module that imports the real script (`src/common/worker-client.js`). Blob workers inherit the page's policy, so `connect-src 'self'` applies inside them too.
- **Lazy loading.** Each page only loads what it needs: Merge PDF never downloads pdf.js or the HEIC decoder. The service worker precaches the pages and small scripts; heavy libraries (pdf.js, libheif) are cached the first time a tool uses them, after which that tool works fully offline.
- **Build checks.** `npm run build` runs `scripts/check-dist.mjs`, which fails the build if any page lacks the CSP, footer credit, Feedback menu or version, has an inline script, or loads a script or stylesheet from another origin, or if heavy libraries are precached.
- **Verify it yourself:** open DevTools → Network and use a tool, or load a tool and switch off Wi-Fi. See the How do I know? page.

## Redaction is real (and tested)

Redact PDF never just draws a black rectangle over live text. Each page with a box is rendered to an image with pdf.js, the boxes are painted into the pixels, and the page is replaced by a brand-new page containing only that image (`src/lib/rasterize.js`, `assembleRedacted` in `src/lib/pdf-ops.js`). The UI warns that redacted pages become images and are no longer text-searchable.

Extra safeguards:

- Unredacted pages that **share hidden content** (content streams, Form/Image XObjects, patterns) with a redacted page are flattened too, because copying them would also copy the redacted page's content into the file. `assembleRedacted` refuses to save if such a page was not flattened.
- Annotations, thumbnails, page metadata and document properties (title, author, bookmarks) are not carried over.
- After saving, the app re-opens the output, checks that flattened pages have no text layer and that none of the searched terms can be extracted, and only then offers the download.

**Tested:** `tests/redaction.test.js` redacts `test-fixtures/sample.pdf`, **extracts the text of the redacted output with pdf.js and verifies the redacted words are gone**, and also scans every object and decoded stream in the output file (literal and hex encodings) to confirm the words do not appear anywhere. One test renders the page with pdf.js on a Node canvas, burns in boxes found by text search, rebuilds the PDF and repeats both checks; a control test proves the leak detector catches the shared-content leak that the safeguard prevents.

## Local development

```bash
npm install
npm run dev      # start the dev server (no CSP in dev; it needs inline HMR scripts)
npm test         # unit tests (vitest, non-watch)
npm run build    # production build into dist/ + post-build checks
npm run preview  # serve the production build locally
```

Regenerate fixtures with `npm run fixtures` (plain Node, no dependencies) and the PNG icons and Open Graph images with `powershell -File scripts/make-images.ps1` (Windows, System.Drawing).

## Tests

- `tests/pure.test.js`: page ranges, naming, device limits, image geometry, settings import/export, redaction geometry, feedback URLs.
- `tests/site.test.js`: every page gets the badge, Feedback menu, version, studio credit, unique title/description/H1, canonical, OG/Twitter tags and FAQ JSON-LD; sitemap and CSP rules.
- `tests/pdf.test.js`: merge, split, extract, reorder/rotate/delete, ZIP.
- `tests/redaction.test.js`: real redaction (see above).
- `tests/metadata.test.js`: reads the fake GPS/camera data in `test-fixtures/gps-photo.jpg`, strips JPEG/PNG/WebP losslessly (image data byte-identical), keeps only Orientation, drops data after end-of-image, and re-reads the output to confirm nothing is left.
- `tests/heic.test.js`: decodes a HEIC fixture with libheif (the fixture is generated with `heif-enc`).

Test fixtures (`test-fixtures/`): `sample.pdf` (3 pages, page 2 holds fake secrets), `plain.jpg`, `gps-photo.jpg` (FAKE EXIF: camera "FakeCam", GPS at the Eiffel Tower), `sample.heic`.

## Deploy (GitHub Pages)

1. Push this repo to GitHub on the `main` branch.
2. One-time setup: **Repo Settings → Pages → Source: "GitHub Actions"**.
3. Every push to `main` (or a manual run of the "Deploy to GitHub Pages" workflow) runs tests, builds and deploys via `.github/workflows/deploy.yml`.

`base` in `vite.config.js` (from `src/site/pages.js`) must match the repo name. `sitemap.xml` and `robots.txt` are generated at build time; because this is a project site, submit the sitemap URL in Google Search Console (crawlers only read `robots.txt` at the domain root).

## Project structure

```
index.html, 404.html, <tool>/index.html   One real page per tool (markers expanded at build time)
src/site/pages.js     Titles, descriptions, H1s, help text, FAQ, related tools
src/site/render.js    Shared head/header/badge/help/footer, sitemap, robots
src/site/csp.js       Production Content-Security-Policy
src/common/           Boot (version, feedback, network monitor), UI helpers, workers, pdf.js loader
src/lib/              Processing: pdf-ops, rasterize, redact-geom, strip-metadata, exif-read,
                      encode-image, heic-decode, zip, limits, page-range, format, prefs
src/workers/          pdf-ops, image and heic workers (+ tiny RPC)
src/pages/            One script per page
scripts/              check-dist (post-build), make-fixtures, make-images.ps1
public/               Logo, favicon, PWA icons, Open Graph images, studio mark
```

## Feedback & issues

Found a bug or have an idea? Use the **Feedback** menu in the header of any page, or go to the
[Issues page](https://github.com/lance6x5/private-file-toolkit/issues) and pick a
[bug report](https://github.com/lance6x5/private-file-toolkit/issues/new?template=bug_report.yml) or
[feature request](https://github.com/lance6x5/private-file-toolkit/issues/new?template=feature_request.yml).
The in-app links only pre-fill the app version, the tool's name and your browser (never your files); a free GitHub account is required. See [CONTRIBUTING.md](CONTRIBUTING.md) for the triage flow.

## Versioning

Fileward follows [Semantic Versioning](https://semver.org/): **MAJOR** for breaking data/schema changes
(e.g. the settings export format or page URLs), **MINOR** for new features or tools, **PATCH** for fixes.
The current version is shown in the footer of every page. See [CHANGELOG.md](CHANGELOG.md) for release notes.

## Privacy & analytics

Fileward has **no analytics** and **no visit counter**. It sets no cookies and has no accounts. The only thing it stores is your last-used settings (in `localStorage`) and an offline copy of the app (browser cache); both can be deleted with **Reset all data** on the How do I know? page. Your files are never stored or sent anywhere.

## License

Fileward is **source-available**, not open source in the OSI sense. It is licensed under the [PolyForm Noncommercial License 1.0.0](LICENSE.md) (SPDX: `PolyForm-Noncommercial-1.0.0`).

- **Free for noncommercial use:** personal, educational, research, nonprofit and other noncommercial use is allowed under the license terms.
- **Commercial use needs a separate license:** this includes selling it, hosting it as a paid service, or using it inside a business product. Commercial licenses are available from Silverlight DevTech; to ask, open a [GitHub issue on this repo](https://github.com/lance6x5/private-file-toolkit/issues).
- **Redistribution:** anyone who shares a copy must keep [LICENSE.md](LICENSE.md) and its `Required Notice:` line.

Third-party dependencies keep their own licenses (pdf-lib MIT, pdf.js Apache-2.0, JSZip MIT/GPLv3 dual, exifr MIT, libheif-js LGPL-3.0).

## Trademarks

Fileward and its logo are trademarks of Silverlight DevTech. The license covers the code only, not the names or logos, so forks must use a different name and logo.
