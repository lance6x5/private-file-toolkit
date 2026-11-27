/**
 * Production Content-Security-Policy, injected as a <meta> tag into every
 * built page by vite.config.js (dev builds skip it because the dev server
 * needs inline scripts and websockets for HMR).
 *
 * connect-src 'self' blob: data: means the page cannot send data to any
 * other origin: fetch, XHR, WebSocket, EventSource and sendBeacon to another
 * site are all blocked by the browser. Our Web Workers are started from
 * blob: URLs, so they inherit this policy too (src/common/worker-client.js).
 *
 * 'wasm-unsafe-eval' (compile WebAssembly; it does NOT allow JS eval) is
 * only granted to pages that run WASM: the HEIC decoder and pdf.js.
 */
export const WASM_PAGES = new Set(['heic-to-jpg', 'organize-pdf', 'redact-pdf']);

export function cspFor(pageId) {
  const script = WASM_PAGES.has(pageId) ? "'self' 'wasm-unsafe-eval'" : "'self'";
  return [
    "default-src 'self'",
    `script-src ${script}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self' blob: data:",
    "worker-src 'self' blob:",
    "media-src 'self' blob:",
    "manifest-src 'self'",
    "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'none'"
  ].join('; ');
}
