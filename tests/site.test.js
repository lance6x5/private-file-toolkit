/**
 * Every page gets the shared layout: privacy badge, Feedback menu, version,
 * studio credit, unique SEO tags and FAQ JSON-LD. Renders the real HTML
 * entry files exactly as the build does.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { renderPage, sitemapXml, robotsTxt, pageIdOf, MARKERS } from '../src/site/render.js';
import { TOOLS, BADGE_TEXT, toolBySlug, SITE_URL } from '../src/site/pages.js';
import { cspFor, WASM_PAGES } from '../src/site/csp.js';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const ENTRIES = ['index.html', '404.html', 'how-do-i-know/index.html', ...TOOLS.map((t) => `${t.slug}/index.html`)];
const html = Object.fromEntries(
  ENTRIES.map((f) => [f, renderPage(readFileSync(new URL(`../${f}`, import.meta.url), 'utf8'), pkg.version)])
);
const count = (s, re) => (s.match(re) || []).length;

describe('shared layout on every page', () => {
  for (const f of ENTRIES) {
    it(`${f}: footer credit, feedback menu, version, single h1`, () => {
      const page = html[f];
      for (const m of MARKERS) expect(page).not.toContain(`<!-- fw:${m} -->`);
      expect(page).toContain('class="studio-credit"');
      expect(page).toContain('A Silverlight DevTech project');
      expect(page).toContain('© 2026 Silverlight DevTech');
      expect(page).toContain('https://github.com/lance6x5/private-file-toolkit/blob/main/LICENSE.md');
      expect(page).toContain('href="https://lance6x5.github.io/">More apps</a>');
      expect(page).toContain('silverlight-mark.svg');
      expect(page).toContain('id="fb-bug"');
      expect(page).toContain('id="fb-feature"');
      expect(page).toContain(`<span id="app-version">v${pkg.version}</span>`);
      expect(page).toContain('<meta name="author" content="Silverlight DevTech" />');
      expect(page).toContain('<meta name="copyright" content="© 2026 Silverlight DevTech" />');
      expect(page).toContain('/private-file-toolkit/logo.svg');
      expect(count(page, /<h1[\s>]/g)).toBe(1);
      expect(page).not.toMatch(/<script[^>]+src="https?:/);
      expect(page).not.toMatch(/<link[^>]+rel="stylesheet"[^>]+href="https?:/);
      expect(page).toContain('no analytics');
    });
  }
});

describe('tool pages', () => {
  it('have unique titles, descriptions and H1s', () => {
    const titles = new Set(TOOLS.map((t) => t.title));
    const descs = new Set(TOOLS.map((t) => t.description));
    const h1s = new Set(TOOLS.map((t) => t.h1));
    expect(titles.size).toBe(TOOLS.length);
    expect(descs.size).toBe(TOOLS.length);
    expect(h1s.size).toBe(TOOLS.length);
    for (const t of TOOLS) {
      expect(t.title.length).toBeLessThanOrEqual(75);
      expect(t.description.length).toBeGreaterThan(70);
      expect(t.description.length).toBeLessThanOrEqual(170);
      expect(t.help.length).toBeGreaterThanOrEqual(3);
      expect(t.help.length).toBeLessThanOrEqual(5);
      expect(t.faq.length).toBeGreaterThanOrEqual(3);
      for (const r of t.related) expect(toolBySlug(r), `${t.slug} -> ${r}`).toBeTruthy();
    }
  });

  for (const t of TOOLS) {
    it(`${t.slug}: badge, canonical, OG/Twitter, FAQ JSON-LD, related tools`, () => {
      const page = html[`${t.slug}/index.html`];
      expect(pageIdOf(page)).toBe(t.slug);
      expect(page).toContain(BADGE_TEXT);
      expect(page).toContain(`<link rel="canonical" href="${SITE_URL}${t.slug}/" />`);
      expect(page).toContain(`<meta property="og:image" content="${SITE_URL}og/${t.slug}.png" />`);
      expect(page).toContain('<meta name="twitter:card" content="summary_large_image" />');
      const ld = /<script type="application\/ld\+json">(.+?)<\/script>/s.exec(page);
      const data = JSON.parse(ld[1]);
      expect(data['@type']).toBe('FAQPage');
      expect(data.mainEntity).toHaveLength(t.faq.length);
      expect(page).toContain('Related tools');
      for (const r of t.related) expect(page).toContain(`href="/private-file-toolkit/${r}/"`);
      expect(page).toContain('aria-current="page"');
      expect(readFileSync(new URL(`../public/og/${t.slug}.png`, import.meta.url)).length).toBeGreaterThan(1000);
    });
  }

  it('404 page is noindex and links to every tool', () => {
    const page = html['404.html'];
    expect(page).toContain('<meta name="robots" content="noindex" />');
    for (const t of TOOLS) expect(page).toContain(`href="/private-file-toolkit/${t.slug}/"`);
  });
});

describe('sitemap, robots and CSP', () => {
  it('sitemap lists every indexable page', () => {
    const xml = sitemapXml('2026-11-27');
    for (const t of TOOLS) expect(xml).toContain(`<loc>${SITE_URL}${t.slug}/</loc>`);
    expect(xml).toContain(`<loc>${SITE_URL}how-do-i-know/</loc>`);
    expect(xml).not.toContain('404');
    expect(robotsTxt()).toContain(`Sitemap: ${SITE_URL}sitemap.xml`);
  });

  it('CSP blocks connections to other origins on every page', () => {
    for (const id of ['home', '404', 'how-do-i-know', ...TOOLS.map((t) => t.slug)]) {
      const csp = cspFor(id);
      expect(csp).toContain("connect-src 'self' blob: data:");
      expect(csp).toContain("default-src 'self'");
      expect(csp).toContain("object-src 'none'");
      expect(csp).not.toMatch(/https?:/);
      expect(csp).not.toContain("'unsafe-eval'");
      expect(csp.includes("'wasm-unsafe-eval'")).toBe(WASM_PAGES.has(id));
    }
    expect(cspFor('merge-pdf')).not.toContain('wasm');
  });
});
