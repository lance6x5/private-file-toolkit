/**
 * Runs on every page: styles, version label, feedback links, and the
 * "outside requests" monitor that backs the privacy promise.
 */
import '../styles.css';
import { buildIssueUrl } from './feedback.js';

export const APP_VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '';
export const PAGE_ID = document.body.dataset.page || 'home';

const versionEl = document.getElementById('app-version');
if (versionEl && APP_VERSION) versionEl.textContent = `v${APP_VERSION}`;

// Only the app version, the tool's name and the browser go into the URL.
const info = { version: APP_VERSION, userAgent: navigator.userAgent, tool: PAGE_ID };
const bug = document.getElementById('fb-bug');
const feature = document.getElementById('fb-feature');
if (bug) bug.href = buildIssueUrl('bug', info);
if (feature) feature.href = buildIssueUrl('feature', info);

document.addEventListener('keydown', (e) => {
  const fb = document.getElementById('feedback');
  if (e.key === 'Escape' && fb?.open) {
    fb.open = false;
    fb.querySelector('summary').focus();
  }
});
document.addEventListener('click', (e) => {
  const fb = document.getElementById('feedback');
  if (fb?.open && !fb.contains(e.target)) fb.open = false;
});

/* ------------------------------------------------------------------ */
/* Network monitor. Lists every resource this page has requested from   */
/* another origin (expected: none) and any request the CSP blocked.     */
/* ------------------------------------------------------------------ */
const blocked = [];
document.addEventListener('securitypolicyviolation', (e) => {
  blocked.push({ directive: e.effectiveDirective || e.violatedDirective, uri: e.blockedURI || '(inline)' });
  window.dispatchEvent(new CustomEvent('fileward:netchange'));
});

export function networkReport() {
  const entries = performance.getEntriesByType('resource');
  const outside = entries
    .map((e) => e.name)
    .filter((u) => {
      try {
        const url = new URL(u);
        return /^https?:$/.test(url.protocol) && url.origin !== location.origin;
      } catch {
        return false;
      }
    });
  return { total: entries.length, outside, blocked: blocked.slice() };
}

/** Is the page being served without a network connection right now? */
export const isOffline = () => typeof navigator.onLine === 'boolean' && !navigator.onLine;
