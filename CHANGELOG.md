# Changelog

All notable changes to Fileward (repo: `private-file-toolkit`) are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.1.0] - 2026-11-27

### Added
- "Install app" button in the header. It appears only when the browser can install the app and it isn't installed yet (Chrome, Edge, Android), shows "Share > Add to Home Screen" steps on iPhone/iPad, and disappears once installed.

## [1.0.1] - 2026-11-27

### Changed
- Footer studio credit now uses the Silverlight DevTech company mark (the "47 Ag" periodic-table tile), replacing the interim crescent mark.

## [1.0.0] - 2026-11-27

### Added
- Fileward, "Your files stay yours.": eight private file tools that run entirely in the browser, each on its own static page: Merge PDF, Split PDF, Reorder/Rotate/Delete PDF pages, Redact PDF, Compress image, Resize/Convert image (JPG, PNG, WebP, AVIF where supported), HEIC to JPG, and Remove photo metadata.
- Real PDF redaction: redacted pages are rasterized with the boxes burned in and rebuilt from the image only; pages sharing hidden content with a redacted page are flattened too; the output is re-opened and verified (no text layer on flattened pages, no searched term extractable) before download. "Find and redact" boxes every text match.
- Lossless metadata removal for JPG, PNG and WebP (EXIF, GPS, XMP, IPTC, comments, trailing data), keeping only the rotation flag, with a prominent "This photo contains your location" warning and re-read verification.
- "How do I know?" page with a live count of requests to other websites, the page's Content-Security-Policy, offline status, and Export / Import / Reset for settings.
- Privacy enforcement: strict production CSP (`connect-src 'self' blob: data:`) on every page, CSP-inheriting blob-started Web Workers, self-hosted libraries and pdf.js assets, no analytics, no visit counter, no cookies.
- Offline PWA: pages and app shell precached; heavy libraries (pdf.js, libheif WASM) cached on first use so the Merge page never downloads the HEIC decoder.
- SEO: unique titles, descriptions and H1s, help text and FAQ with FAQPage JSON-LD, Open Graph/Twitter preview image per tool, canonical URLs, generated `sitemap.xml` and `robots.txt`, and a `404.html` that links to every tool.
- Shared UX: drag-and-drop plus file picker, multi-file, clipboard paste for images, progress bars, Web Workers, device-memory-based size limits, ZIP downloads for batches, related tools.
- Branding: Fileward logo (document with a shield) and raspberry palette in light and dark mode, favicon and PWA icons.
- Version shown in every page footer; in-app Feedback menu (bug report / feature request GitHub issue forms pre-filled with version, tool and browser only); `CONTRIBUTING.md`.
- Studio credit in every page footer: Silverlight DevTech mark, "© 2026 Silverlight DevTech", "Noncommercial license" link and "More apps" link to https://lance6x5.github.io/; `author` and `copyright` meta tags.
- `LICENSE.md`: PolyForm Noncommercial License 1.0.0 with the `Required Notice: Copyright 2026 Silverlight DevTech` line; README License and Trademarks sections.
- Tests (Vitest) for page ranges, limits, image geometry, settings, feedback URLs, site layout on every page, PDF operations, real redaction (text extraction and full-file scan of redacted output), metadata stripping and HEIC decoding; post-build checks in `scripts/check-dist.mjs`.
- GitHub Pages deployment via GitHub Actions.

[Unreleased]: https://github.com/lance6x5/private-file-toolkit/compare/v1.1.0...HEAD
[1.1.0]: https://github.com/lance6x5/private-file-toolkit/compare/v1.0.1...v1.1.0
[1.0.1]: https://github.com/lance6x5/private-file-toolkit/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/lance6x5/private-file-toolkit/releases/tag/v1.0.0
