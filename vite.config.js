import { readFileSync, readdirSync, existsSync, statSync, createReadStream } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, join } from 'node:path';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { renderPage, pageIdOf, sitemapXml, robotsTxt } from './src/site/render.js';
import { TOOLS, PRIVACY, SITE } from './src/site/pages.js';
import { cspFor } from './src/site/csp.js';

const root = fileURLToPath(new URL('.', import.meta.url));
const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
const BASE = SITE.base; // '/private-file-toolkit/' - must match the GitHub repo name

/* ------------------------------------------------------------------ */
/* Multi-page inputs: one real HTML page per tool (no hash routing).   */
/* ------------------------------------------------------------------ */
const input = {
  home: resolve(root, 'index.html'),
  notfound: resolve(root, '404.html'),
  [PRIVACY.slug]: resolve(root, PRIVACY.slug, 'index.html')
};
for (const t of TOOLS) input[t.slug] = resolve(root, t.slug, 'index.html');

/** Shared header/footer/SEO tags + sitemap/robots. */
const layoutPlugin = {
  name: 'fileward-layout',
  transformIndexHtml(html) {
    return renderPage(html, pkg.version);
  },
  generateBundle() {
    if (this.meta?.watchMode) return;
    const today = new Date().toISOString().slice(0, 10);
    this.emitFile({ type: 'asset', fileName: 'sitemap.xml', source: sitemapXml(today) });
    this.emitFile({ type: 'asset', fileName: 'robots.txt', source: robotsTxt() });
  }
};

const cspPlugin = {
  name: 'fileward-csp',
  apply: 'build',
  // Inserted right after <meta charset> (a meta CSP only covers what comes
  // after it), with literal quotes so the policy is easy to read in the source.
  transformIndexHtml(html) {
    const marker = '<meta charset="UTF-8" />';
    if (!html.includes(marker)) throw new Error('Page is missing <meta charset="UTF-8" />');
    const tag = `<meta http-equiv="Content-Security-Policy" content="${cspFor(pageIdOf(html))}" />`;
    return html.replace(marker, `${marker}\n    ${tag}`);
  }
};

/**
 * Self-host pdf.js support files (CMaps for CJK text, standard fonts and
 * WASM image decoders) under /pdfjs/ so nothing is fetched from a CDN.
 */
const PDFJS_DIRS = ['cmaps', 'standard_fonts', 'wasm'];
const pdfjsDir = resolve(root, 'node_modules/pdfjs-dist');
const pdfjsAssetsPlugin = {
  name: 'fileward-pdfjs-assets',
  generateBundle() {
    for (const dir of PDFJS_DIRS) {
      const abs = join(pdfjsDir, dir);
      if (!existsSync(abs)) continue;
      for (const f of readdirSync(abs)) {
        const p = join(abs, f);
        if (!statSync(p).isFile()) continue;
        this.emitFile({ type: 'asset', fileName: `pdfjs/${dir}/${f}`, source: readFileSync(p) });
      }
    }
  },
  configureServer(server) {
    server.middlewares.use(`${BASE}pdfjs/`, (req, res, next) => {
      const rel = decodeURIComponent((req.url || '').split('?')[0]).replace(/^\/+/, '');
      const [dir] = rel.split('/');
      const p = join(pdfjsDir, rel);
      if (!PDFJS_DIRS.includes(dir) || rel.includes('..') || !existsSync(p)) return next();
      createReadStream(p).pipe(res);
    });
  }
};

export default defineConfig({
  base: BASE,
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version)
  },
  build: {
    target: 'es2022',
    rollupOptions: {
      input,
      output: {
        // Name heavy libraries so the service worker can runtime-cache them
        // instead of precaching them (each page only downloads what it uses).
        manualChunks(id) {
          if (id.includes('node_modules/pdfjs-dist')) return 'vendor-pdfjs';
          if (id.includes('node_modules/exifr')) return 'vendor-exifr';
          return undefined;
        }
      }
    }
  },
  worker: {
    format: 'es',
    rollupOptions: {
      output: {
        entryFileNames: 'assets/worker-[name]-[hash].js',
        chunkFileNames: 'assets/worker-chunk-[name]-[hash].js'
      }
    }
  },
  plugins: [
    layoutPlugin,
    cspPlugin,
    pdfjsAssetsPlugin,
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'script',
      includeAssets: ['favicon.svg', 'logo.svg', 'logo-mark.svg', 'silverlight-mark.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Fileward – Private File Toolkit',
        short_name: 'Fileward',
        description: 'Everyday PDF and image tools that run 100% in your browser. Your files are never uploaded.',
        start_url: BASE,
        scope: BASE,
        display: 'standalone',
        background_color: SITE.themeDark,
        theme_color: SITE.themeLight,
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: 'favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }
        ],
        shortcuts: TOOLS.slice(0, 4).map((t) => ({ name: t.nav, url: `${BASE}${t.slug}/` }))
      },
      workbox: {
        // App shell: every page, styles, small scripts and our own workers.
        globPatterns: ['**/*.{html,js,css,svg,png,webmanifest}'],
        // Heavy per-tool libraries are cached on first use instead (below),
        // so visiting Merge PDF never downloads the HEIC decoder.
        globIgnores: ['og/**', 'assets/vendor-pdfjs*', 'assets/worker-heic*', 'assets/worker-chunk-wasm-bundle*', 'pdfjs/**', '**/*.mjs'],
        maximumFileSizeToCacheInBytes: 12 * 1024 * 1024,
        navigateFallback: null,
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            urlPattern: ({ url, sameOrigin }) => sameOrigin && /\/(assets|pdfjs)\//.test(url.pathname),
            handler: 'CacheFirst',
            options: { cacheName: 'fileward-tools', expiration: { maxEntries: 400 } }
          }
        ]
      }
    })
  ],
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js'],
    testTimeout: 60000
  }
});
