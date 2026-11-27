# Contributing to Fileward

Thanks for helping improve Fileward!

## Reporting bugs and requesting features

Use the **Feedback** menu in the header of any page, or open an issue directly with the
[bug report](https://github.com/lance6x5/private-file-toolkit/issues/new?template=bug_report.yml) or
[feature request](https://github.com/lance6x5/private-file-toolkit/issues/new?template=feature_request.yml)
form. **Never attach private files.** If a particular file triggers a bug, describe it (type, size, page
count, which app created it) or share a file you are happy to make public.

## Triage flow

1. New issues are automatically labelled `triage` (plus `bug` or `enhancement`).
2. The maintainer reviews them, removes `triage` and relabels / prioritises (or closes with a reason).
3. Work happens on a branch, then a pull request whose description references `Fixes #N` so the issue
   closes automatically on merge.
4. Changes are recorded under `## [Unreleased]` in [CHANGELOG.md](CHANGELOG.md) and moved into a
   versioned section when released (see the Versioning section in the README).

## Ground rules for changes

- **Privacy is the product.** No analytics, no third-party scripts, no CDNs, no network requests after
  the page and its WASM load. Do not loosen `connect-src` in `src/site/csp.js`.
- Start workers with `WorkerClient` / `createGuardedWorker` so they inherit the page's CSP.
- Redaction must stay real: never draw boxes over live text. Keep `tests/redaction.test.js` green.
- Keep heavy libraries lazy-loaded on the pages that need them.

## Licensing of contributions

Fileward is licensed under the [PolyForm Noncommercial License 1.0.0](LICENSE.md). By submitting a pull request, you agree that your contribution is licensed to Silverlight DevTech under the same terms, and that Silverlight DevTech may also offer it under its commercial licenses.

## Development

```bash
npm ci
npm test
npm run dev
```
