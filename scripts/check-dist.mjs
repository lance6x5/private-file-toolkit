/**
 * Post-build checks (run by `npm run build`). Fails the build if any page
 * is missing the shared footer/feedback/version, the CSP, or loads code
 * from another origin, or if heavy libraries leak onto pages that do not
 * need them.
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { TOOLS } from '../src/site/pages.js';

const dist = fileURLToPath(new URL('../dist/', import.meta.url));
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const errors = [];
const fail = (m) => errors.push(m);

const pages = ['index.html', '404.html', 'how-do-i-know/index.html', ...TOOLS.map((t) => `${t.slug}/index.html`)];

for (const p of pages) {
  const file = join(dist, p);
  if (!existsSync(file)) {
    fail(`${p}: missing from the build`);
    continue;
  }
  const html = readFileSync(file, 'utf8');
  const need = {
    'CSP meta tag': /<meta http-equiv="Content-Security-Policy" content="[^"]*connect-src 'self' blob: data:/,
    'studio credit': /class="studio-credit"[\s\S]*A Silverlight DevTech project[\s\S]*Noncommercial license[\s\S]*More apps/,
    'feedback menu': /id="fb-bug"[\s\S]*id="fb-feature"/,
    version: new RegExp(`Fileward <span id="app-version">v${pkg.version.replace(/\./g, '\\.')}</span>`),
    'web manifest': /<link rel="manifest"/,
    'service worker registration': /registerSW\.js/,
    'page script': /<script type="module"[^>]+src="\/private-file-toolkit\/assets\//
  };
  for (const [label, re] of Object.entries(need)) if (!re.test(html)) fail(`${p}: missing ${label}`);
  if ((html.match(/<h1[\s>]/g) || []).length !== 1) fail(`${p}: must have exactly one <h1>`);
  if (/<script[^>]+src="(https?:)?\/\//.test(html)) fail(`${p}: loads a script from another origin`);
  if (/<link[^>]+rel="(stylesheet|modulepreload|preload|icon|manifest)"[^>]+href="(https?:)?\/\//.test(html)) {
    fail(`${p}: loads a resource from another origin`);
  }
  if (/<script(?![^>]*type="application\/ld\+json")(?![^>]*src=)[^>]*>/.test(html)) fail(`${p}: has an inline script (blocked by CSP)`);
  const slug = p.split('/')[0];
  if (TOOLS.some((t) => t.slug === slug) && !html.includes('Processed on your device. Your files are never uploaded.')) {
    fail(`${p}: missing privacy badge`);
  }
  // Lazy loading: only the pages that render PDFs may preload pdf.js.
  if (!['organize-pdf', 'redact-pdf'].includes(slug) && /vendor-pdfjs/.test(html)) fail(`${p}: preloads pdf.js`);
  if (/worker-heic/.test(html)) fail(`${p}: references the HEIC decoder in HTML`);
}

for (const f of ['sitemap.xml', 'robots.txt', 'sw.js', 'manifest.webmanifest', 'pdfjs/standard_fonts', 'pdfjs/cmaps']) {
  if (!existsSync(join(dist, f))) fail(`missing ${f}`);
}

// No CDN loading anywhere in the bundles.
const assets = join(dist, 'assets');
for (const f of readdirSync(assets)) {
  if (!/\.(m?js)$/.test(f)) continue;
  const js = readFileSync(join(assets, f), 'utf8');
  for (const cdn of ['unpkg.com', 'cdn.jsdelivr.net', 'cdnjs.cloudflare.com', 'esm.sh', 'cdn.skypack.dev']) {
    if (js.includes(cdn)) fail(`assets/${f}: references ${cdn}`);
  }
}

// Heavy per-tool libraries are runtime-cached, not precached on every visit.
const sw = readFileSync(join(dist, 'sw.js'), 'utf8');
for (const heavy of ['worker-heic', 'wasm-bundle', 'vendor-pdfjs', 'pdf.worker']) {
  if (sw.includes(heavy)) fail(`sw.js precaches ${heavy} (should be cached on first use)`);
}
if (!sw.includes('merge-pdf/index.html')) fail('sw.js does not precache the tool pages');

if (errors.length) {
  console.error(`check-dist: ${errors.length} problem(s):\n - ${errors.join('\n - ')}`);
  process.exit(1);
}
console.log(`check-dist: ${pages.length} pages OK (CSP, footer credit, feedback, v${pkg.version}, no third-party code).`);
