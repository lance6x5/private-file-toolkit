/**
 * Build-time page layout. vite.config.js runs every HTML entry through
 * renderPage(), which replaces the <!-- fw:... --> markers with the shared
 * head tags, header (tool nav + Feedback menu), privacy badge, help/FAQ,
 * related tools and footer (version + studio credit).
 *
 * Doing this at build time (rather than in JS) means search engines and
 * no-JS visitors see complete pages, and every page is guaranteed to have
 * the same header and footer. renderPage() throws if a marker is missing.
 */
import {
  SITE, SITE_URL, REPO_URL, BADGE_TEXT, TOOLS, HOME, PRIVACY, NOT_FOUND,
  toolBySlug, pagePath, pageUrl
} from './pages.js';
import { buildIssueUrl } from '../common/feedback.js';

export const MARKERS = ['head', 'header', 'intro', 'help', 'footer'];

/** Escape text for HTML element content and attribute values. */
export function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Serialize JSON-LD safely for embedding in a <script> element. */
export function jsonLd(obj) {
  return JSON.stringify(obj).replace(/</g, '\\u003c');
}

/** Look up the content record for a page id ('home', tool slug, 'how-do-i-know', '404'). */
export function pageInfo(id) {
  if (id === 'home') return { ...HOME, kind: 'home' };
  if (id === PRIVACY.slug) return { ...PRIVACY, kind: 'privacy' };
  if (id === NOT_FOUND.slug) return { ...NOT_FOUND, kind: '404' };
  const tool = toolBySlug(id);
  if (!tool) throw new Error(`Unknown page id "${id}"`);
  return { ...tool, kind: 'tool' };
}

const B = SITE.base;

const SHIELD_ICON =
  '<svg class="badge-icon" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">' +
  '<path d="M12 2 4 5v6c0 5 3.4 9.4 8 11 4.6-1.6 8-6 8-11V5l-8-3z" fill="currentColor"/>' +
  '<path d="m8.5 12.2 2.4 2.4 4.8-5" fill="none" stroke="var(--badge-bg)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

function headTags(page, version) {
  const ogSlug = page.kind === 'home' ? 'home' : page.kind === '404' ? 'home' : page.slug;
  const url = page.kind === 'home' ? SITE_URL : page.kind === '404' ? SITE_URL : pageUrl(page.slug);
  const ogImage = `${SITE_URL}og/${ogSlug}.png`;
  const tags = [
    `<title>${esc(page.title)}</title>`,
    `<meta name="description" content="${esc(page.description)}" />`,
    page.kind === '404'
      ? '<meta name="robots" content="noindex" />'
      : `<link rel="canonical" href="${esc(url)}" />`,
    '<meta name="author" content="Silverlight DevTech" />',
    '<meta name="copyright" content="© 2026 Silverlight DevTech" />',
    `<meta name="generator" content="Fileward ${esc(version)}" />`,
    `<meta name="theme-color" media="(prefers-color-scheme: light)" content="${SITE.themeLight}" />`,
    `<meta name="theme-color" media="(prefers-color-scheme: dark)" content="${SITE.themeDark}" />`,
    `<link rel="icon" type="image/svg+xml" href="${B}favicon.svg" />`,
    `<link rel="icon" type="image/png" sizes="192x192" href="${B}icon-192.png" />`,
    `<link rel="apple-touch-icon" href="${B}apple-touch-icon.png" />`,
    '<meta property="og:type" content="website" />',
    '<meta property="og:site_name" content="Fileward" />',
    `<meta property="og:title" content="${esc(page.title)}" />`,
    `<meta property="og:description" content="${esc(page.description)}" />`,
    `<meta property="og:url" content="${esc(url)}" />`,
    `<meta property="og:image" content="${esc(ogImage)}" />`,
    '<meta property="og:image:width" content="1200" />',
    '<meta property="og:image:height" content="630" />',
    `<meta property="og:image:alt" content="${esc(page.h1)} – Fileward" />`,
    '<meta name="twitter:card" content="summary_large_image" />',
    `<meta name="twitter:title" content="${esc(page.title)}" />`,
    `<meta name="twitter:description" content="${esc(page.description)}" />`,
    `<meta name="twitter:image" content="${esc(ogImage)}" />`
  ];
  if (page.kind === 'tool') {
    tags.push(
      `<script type="application/ld+json">${jsonLd({
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: page.faq.map(([q, a]) => ({
          '@type': 'Question',
          name: q,
          acceptedAnswer: { '@type': 'Answer', text: a }
        }))
      })}</script>`
    );
  }
  if (page.kind === 'home') {
    tags.push(
      `<script type="application/ld+json">${jsonLd({
        '@context': 'https://schema.org',
        '@type': 'WebApplication',
        name: 'Fileward',
        url: SITE_URL,
        applicationCategory: 'UtilitiesApplication',
        operatingSystem: 'Any (runs in a web browser)',
        description: HOME.description,
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
        publisher: { '@type': 'Organization', name: SITE.studio }
      })}</script>`
    );
  }
  return tags.join('\n    ');
}

function header(page, version) {
  const current = page.kind === 'tool' ? page.slug : page.kind === 'privacy' ? PRIVACY.slug : '';
  const link = (slug, label) =>
    `<li><a href="${pagePath(slug)}"${slug === current ? ' aria-current="page"' : ''}>${esc(label)}</a></li>`;
  const info = { version };
  return `<a class="skip-link" href="#main">Skip to content</a>
    <header class="site-header">
      <div class="header-bar">
        <a class="brand" href="${B}"${page.kind === 'home' ? ' aria-current="page"' : ''}>
          <img src="${B}logo.svg" alt="Fileward" width="168" height="40" />
          <span class="visually-hidden"> home</span>
        </a>
        <details class="feedback" id="feedback">
          <summary class="btn btn-ghost btn-small">Feedback</summary>
          <div class="feedback-panel" role="group" aria-label="Send feedback">
            <a id="fb-bug" class="btn btn-small" href="${esc(buildIssueUrl('bug', info))}" target="_blank" rel="noopener">Report a bug</a>
            <a id="fb-feature" class="btn btn-small" href="${esc(buildIssueUrl('feature', info))}" target="_blank" rel="noopener">Request a feature</a>
            <p class="muted feedback-note">Opens GitHub (a free account is required). Only the app version, tool name and browser are pre-filled; never your files. Please don’t include personal data.</p>
          </div>
        </details>
      </div>
      <nav class="tool-nav" aria-label="All tools">
        <ul>
          ${TOOLS.map((t) => link(t.slug, t.nav)).join('\n          ')}
          ${link(PRIVACY.slug, PRIVACY.nav)}
        </ul>
      </nav>
    </header>`;
}

/** The privacy badge, shown on every tool and the home page. */
export function badge() {
  return `<p class="privacy-badge">${SHIELD_ICON}<span><strong>${esc(BADGE_TEXT)}</strong> <a href="${pagePath(PRIVACY.slug)}">How do I know?</a></span></p>`;
}

function intro(page) {
  const lead = page.lead ? `\n        <p class="lead">${esc(page.lead)}</p>` : '';
  const showBadge = page.kind === 'tool' || page.kind === 'home';
  return `<div class="intro">
        <h1>${esc(page.h1)}</h1>${lead}${showBadge ? `\n        ${badge()}` : ''}
      </div>`;
}

/** Card list of tools, used for "Related tools", the home grid and the 404 page. */
export function toolCards(slugs, headingLevel = 3) {
  const h = `h${headingLevel}`;
  return `<ul class="card-grid">
          ${slugs
            .map((s) => toolBySlug(s))
            .map(
              (t) =>
                `<li class="tool-card" data-group="${esc(t.group)}"><a href="${pagePath(t.slug)}"><${h}>${esc(t.nav)}</${h}><span>${esc(t.card)}</span></a></li>`
            )
            .join('\n          ')}
        </ul>`;
}

function help(page) {
  if (page.kind === 'tool') {
    return `<section class="help" aria-labelledby="help-heading">
        <h2 id="help-heading">How to use ${esc(page.nav)}</h2>
        ${page.help.map((p) => `<p>${esc(p)}</p>`).join('\n        ')}
        <h2 id="faq-heading">Frequently asked questions</h2>
        <div class="faq">
          ${page.faq.map(([q, a]) => `<h3>${esc(q)}</h3>\n          <p>${esc(a)}</p>`).join('\n          ')}
        </div>
      </section>
      <nav class="related" aria-labelledby="related-heading">
        <h2 id="related-heading">Related tools</h2>
        ${toolCards(page.related)}
      </nav>`;
  }
  if (page.kind === 'home') {
    return `<section aria-labelledby="pdf-tools"><h2 id="pdf-tools">PDF tools</h2>
        ${toolCards(TOOLS.filter((t) => t.group === 'PDF').map((t) => t.slug))}
      </section>
      <section aria-labelledby="image-tools"><h2 id="image-tools">Image tools</h2>
        ${toolCards(TOOLS.filter((t) => t.group === 'Image').map((t) => t.slug))}
      </section>`;
  }
  if (page.kind === '404') {
    return `<nav class="related" aria-labelledby="all-tools-heading">
        <h2 id="all-tools-heading">All tools</h2>
        ${toolCards(TOOLS.map((t) => t.slug))}
      </nav>`;
  }
  return '';
}

function footer(version) {
  return `<footer class="site-footer">
      <p>Fileward runs entirely in your browser: no uploads, no analytics, no cookies.</p>
      <p>Fileward <span id="app-version">v${esc(version)}</span> · <a href="${REPO_URL}/blob/main/CHANGELOG.md" target="_blank" rel="noopener">Changelog</a> · <a href="${REPO_URL}/issues" target="_blank" rel="noopener">Issues</a> · <a href="${pagePath(PRIVACY.slug)}">How do I know?</a></p>
      <p class="studio-credit">
        <img src="${B}silverlight-mark.svg" alt="" width="16" height="16" />
        <span>A Silverlight DevTech project</span>
        <span aria-hidden="true">·</span>
        <span>© 2026 Silverlight DevTech</span>
        <span aria-hidden="true">·</span>
        <a href="${REPO_URL}/blob/main/LICENSE.md">Noncommercial license</a>
        <span aria-hidden="true">·</span>
        <a href="${SITE.homepage}">More apps</a>
      </p>
    </footer>
    <div id="toast" class="toast" role="status" aria-live="polite"></div>`;
}

/** Read the page id from <body data-page="...">. */
export function pageIdOf(html) {
  const m = /<body[^>]*\sdata-page="([^"]+)"/.exec(html);
  if (!m) throw new Error('HTML entry is missing <body data-page="...">');
  return m[1];
}

/**
 * Expand all layout markers in an HTML entry.
 * @param {string} html source HTML
 * @param {string} version app version from package.json
 */
export function renderPage(html, version) {
  const page = pageInfo(pageIdOf(html));
  const parts = {
    head: headTags(page, version),
    header: header(page, version),
    intro: intro(page),
    help: help(page),
    footer: footer(version)
  };
  let out = html;
  for (const key of MARKERS) {
    const marker = `<!-- fw:${key} -->`;
    if (!out.includes(marker)) throw new Error(`Page "${page.slug || 'home'}" is missing ${marker}`);
    out = out.replace(marker, () => parts[key]);
  }
  return out;
}

/** sitemap.xml for all indexable pages. */
export function sitemapXml(lastmod) {
  const urls = [SITE_URL, ...TOOLS.map((t) => pageUrl(t.slug)), pageUrl(PRIVACY.slug)];
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${u}</loc><lastmod>${lastmod}</lastmod></url>`).join('\n')}
</urlset>
`;
}

export function robotsTxt() {
  return `User-agent: *
Allow: /

Sitemap: ${SITE_URL}sitemap.xml
`;
}
