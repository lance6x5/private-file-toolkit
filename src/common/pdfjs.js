/**
 * Lazy pdf.js loader (thumbnails, page rendering and text extraction).
 * Only the pages that need it (Reorder pages, Redact PDF) import this file,
 * so other tools never download pdf.js. All pdf.js support files are
 * self-hosted under /pdfjs/ (see vite.config.js); nothing comes from a CDN.
 */
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { createGuardedWorker } from './worker-client.js';

const BASE = import.meta.env.BASE_URL;
let libPromise;

export function loadPdfjs() {
  libPromise ??= import('pdfjs-dist').then((lib) => {
    // Our guarded (CSP-inheriting) worker instead of letting pdf.js create one.
    lib.GlobalWorkerOptions.workerPort = createGuardedWorker(workerUrl, 'pdfjs');
    return lib;
  });
  return libPromise;
}

/**
 * Open a PDF for rendering. A copy of the bytes is passed because pdf.js
 * transfers (detaches) the buffer it is given.
 */
export async function openPdf(bytes) {
  const lib = await loadPdfjs();
  const task = lib.getDocument({
    data: bytes.slice(),
    isEvalSupported: false,
    enableXfa: false,
    cMapUrl: `${BASE}pdfjs/cmaps/`,
    cMapPacked: true,
    standardFontDataUrl: `${BASE}pdfjs/standard_fonts/`,
    wasmUrl: `${BASE}pdfjs/wasm/`
  });
  try {
    return await task.promise;
  } catch (err) {
    if (err?.name === 'PasswordException') {
      throw new Error('This PDF is password-protected. Remove the password in your PDF reader, then try again.');
    }
    throw new Error('This PDF could not be read. It may be damaged or not a PDF.');
  }
}

/**
 * Render a page into a new <canvas>.
 * @param {*} page pdf.js page proxy
 * @param {number} scale CSS px per PDF point (times devicePixelRatio for crispness)
 */
export async function renderToCanvas(page, scale, canvas = document.createElement('canvas')) {
  const viewport = page.getViewport({ scale });
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const ctx = canvas.getContext('2d', { alpha: false });
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  // annotationMode 1 = ENABLE: draw annotation and form-field appearances into
  // the canvas too, so flattened (redacted) pages look like the original.
  await page.render({ canvasContext: ctx, canvas, viewport, annotationMode: 1 }).promise;
  return { canvas, viewport };
}

/** Extract the plain text of every page (used to verify redactions). */
export async function extractAllText(doc) {
  const texts = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const tc = await page.getTextContent();
    texts.push(tc.items.map((it) => it.str ?? '').join(' '));
    page.cleanup();
  }
  return texts;
}
