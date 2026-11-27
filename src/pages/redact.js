/**
 * Redact PDF.
 *
 * REAL redaction: every page with a box is rendered to an image at the
 * chosen resolution, the boxes are painted solid black into the pixels, and
 * the page is replaced by a new page containing only that image
 * (src/lib/pdf-ops.js assembleRedacted). The original text, fonts and
 * vector content of that page are not copied. Afterwards the output is
 * re-opened and checked: flattened pages must have no text layer, and no
 * searched term may still be extractable anywhere in the document.
 */
import '../common/boot.js';
import { $, h, dropzone, progress, toast, readBytes, acceptPdf, limits } from '../common/ui.js';
import { renderResults } from '../common/results.js';
import { pdfWorker, warmPdfWorker } from './pdf-worker.js';
import { loadPdfjs, openPdf, renderToCanvas, extractAllText } from '../common/pdfjs.js';
import { canvasToBlob } from '../lib/encode-image.js';
import { boxFromPoints, isUsableBox, matchBoxes, termsStillPresent } from '../lib/redact-geom.js';
import { rasterizePage } from '../lib/rasterize.js';
import { formatBytes, splitExt, safeName } from '../lib/format.js';
import { loadPrefs, savePrefs } from '../lib/prefs.js';

warmPdfWorker();
loadPdfjs().catch(() => {}); // cache pdf.js now so the tool works offline later

const editor = $('#editor');
const pagesEl = $('#pages');
const info = $('#file-info');
const drawToggle = $('#draw-toggle');
const findForm = $('#find-form');
const findInput = $('#find-input');
const findStatus = $('#find-status');
const termsEl = $('#terms');
const dpiSel = $('#dpi');
const boxCount = $('#box-count');
const runBtn = $('#run-btn');
const clearBtn = $('#clear-btn');
const clearBoxesBtn = $('#clear-boxes-btn');
const verifyEl = $('#verify');
const results = $('#results');
const prog = progress($('#progress'));

let file = null;
let bytes = null;
let doc = null;
/** page index -> normalized boxes */
const boxes = new Map();
/** search terms that must not survive */
const terms = new Set();
const views = new Map();
let observer = null;
let busy = false;

const prefs = loadPrefs();
dpiSel.value = String(prefs.redactDpi);
dpiSel.addEventListener('change', () => savePrefs({ redactDpi: Number(dpiSel.value) }));

/* ---------------- draw mode ---------------- */
let drawing = !matchMedia('(pointer: coarse)').matches;
function syncDraw() {
  drawToggle.setAttribute('aria-pressed', String(drawing));
  drawToggle.textContent = drawing ? 'Drawing boxes: on' : 'Drawing boxes: off (scroll mode)';
  pagesEl.classList.toggle('drawing', drawing);
}
drawToggle.addEventListener('click', () => {
  drawing = !drawing;
  syncDraw();
});
syncDraw();

/* ---------------- boxes ---------------- */
function totalBoxes() {
  let n = 0;
  for (const b of boxes.values()) n += b.length;
  return n;
}

function syncCount() {
  const n = totalBoxes();
  const pages = [...boxes.values()].filter((b) => b.length).length;
  boxCount.textContent = n ? `${n} box${n === 1 ? '' : 'es'} on ${pages} page${pages === 1 ? '' : 's'}.` : 'No boxes yet.';
  runBtn.disabled = busy || !n;
  clearBoxesBtn.hidden = !n;
}

function renderBoxes(i) {
  const v = views.get(i);
  if (!v) return;
  const list = boxes.get(i) ?? [];
  v.overlay.replaceChildren(
    ...list.map((b, k) =>
      h(
        'div',
        {
          class: 'redact-box',
          style: `left:${b.x * 100}%;top:${b.y * 100}%;width:${b.w * 100}%;height:${b.h * 100}%`
        },
        h(
          'button',
          {
            type: 'button',
            class: 'box-remove',
            'aria-label': `Remove box ${k + 1} on page ${i + 1}`,
            onclick: (e) => {
              e.stopPropagation();
              list.splice(k, 1);
              renderBoxes(i);
              syncCount();
            }
          },
          '×'
        )
      )
    )
  );
  v.status.textContent = list.length ? `${list.length} box${list.length === 1 ? '' : 'es'}` : '';
  syncCount();
}

function addBox(i, b) {
  if (!boxes.has(i)) boxes.set(i, []);
  boxes.get(i).push(b);
}

function wireDrawing(i, overlay) {
  let start = null;
  let temp = null;
  const point = (e) => {
    const r = overlay.getBoundingClientRect();
    return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height];
  };
  overlay.addEventListener('pointerdown', (e) => {
    if (!drawing || busy || e.button > 0 || e.target.closest('.box-remove')) return;
    e.preventDefault();
    overlay.setPointerCapture(e.pointerId);
    start = point(e);
    temp = h('div', { class: 'redact-box temp' });
    overlay.append(temp);
  });
  overlay.addEventListener('pointermove', (e) => {
    if (!start) return;
    const b = boxFromPoints(...start, ...point(e));
    temp.style.cssText = `left:${b.x * 100}%;top:${b.y * 100}%;width:${b.w * 100}%;height:${b.h * 100}%`;
  });
  const finish = (e, cancel) => {
    if (!start) return;
    const b = boxFromPoints(...start, ...point(e));
    start = null;
    temp?.remove();
    temp = null;
    if (!cancel && isUsableBox(b)) {
      addBox(i, b);
      renderBoxes(i);
    }
  };
  overlay.addEventListener('pointerup', (e) => finish(e, false));
  overlay.addEventListener('pointercancel', (e) => finish(e, true));
}

/* ---------------- page views ---------------- */
async function renderView(i) {
  const v = views.get(i);
  if (!v || v.rendered || !doc) return;
  v.rendered = true;
  try {
    const page = await doc.getPage(i + 1);
    const base = page.getViewport({ scale: 1 });
    const cssW = v.frame.clientWidth || 600;
    const scale = (cssW * Math.min(2, window.devicePixelRatio || 1)) / base.width;
    await renderToCanvas(page, scale, v.canvas);
    page.cleanup();
  } catch {
    v.status.textContent = 'Could not draw this page.';
  }
}

async function buildViews() {
  observer?.disconnect();
  views.clear();
  pagesEl.replaceChildren();
  observer = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (e.isIntersecting) {
          renderView(Number(e.target.dataset.page));
          observer.unobserve(e.target);
        }
      }
    },
    { rootMargin: '600px' }
  );
  for (let i = 0; i < doc.numPages; i++) {
    const page = await doc.getPage(i + 1);
    const vp = page.getViewport({ scale: 1 });
    const canvas = h('canvas', { class: 'page-canvas', 'aria-hidden': 'true' });
    const overlay = h('div', { class: 'redact-overlay', role: 'presentation' });
    const frame = h('div', { class: 'page-frame', style: `aspect-ratio:${vp.width} / ${vp.height}` }, canvas, overlay);
    const status = h('span', { class: 'muted page-status', 'aria-live': 'polite' });
    const wrap = h(
      'section',
      { class: 'redact-page', 'data-page': i, 'aria-label': `Page ${i + 1}` },
      h(
        'div',
        { class: 'page-toolbar' },
        h('strong', {}, `Page ${i + 1}`),
        status,
        h('button', { type: 'button', class: 'btn btn-small btn-ghost', onclick: () => { addBox(i, { x: 0, y: 0, w: 1, h: 1 }); renderBoxes(i); } }, 'Redact whole page'),
        h('button', { type: 'button', class: 'btn btn-small btn-ghost', onclick: () => { boxes.delete(i); renderBoxes(i); } }, 'Clear page')
      ),
      frame
    );
    views.set(i, { wrap, frame, canvas, overlay, status, rendered: false });
    wireDrawing(i, overlay);
    pagesEl.append(wrap);
    observer.observe(wrap);
    page.cleanup();
  }
}

/* ---------------- find & redact ---------------- */
function renderTerms() {
  termsEl.replaceChildren(
    ...[...terms].map((t) =>
      h(
        'li',
        { class: 'chip' },
        h('span', {}, t),
        h('button', { type: 'button', class: 'chip-remove', 'aria-label': `Stop checking for “${t}”`, onclick: () => { terms.delete(t); renderTerms(); } }, '×')
      )
    )
  );
  termsEl.hidden = !terms.size;
}

findForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const q = findInput.value.trim();
  if (!q || !doc) return;
  findStatus.textContent = 'Searching…';
  let found = 0;
  const pagesHit = new Set();
  for (let i = 0; i < doc.numPages; i++) {
    const page = await doc.getPage(i + 1);
    const vp = page.getViewport({ scale: 1 });
    const tc = await page.getTextContent();
    const hits = matchBoxes(tc.items, q, (x, y) => vp.convertToViewportPoint(x, y), vp.width, vp.height);
    for (const b of hits) addBox(i, b);
    if (hits.length) {
      pagesHit.add(i);
      renderBoxes(i);
    }
    found += hits.length;
    page.cleanup();
  }
  if (found) {
    terms.add(q);
    renderTerms();
    findStatus.textContent = `Boxed ${found} match${found === 1 ? '' : 'es'} for “${q}” on ${pagesHit.size} page${pagesHit.size === 1 ? '' : 's'}. Check them, and draw extra boxes if a match was split across lines.`;
    findInput.value = '';
    const first = Math.min(...pagesHit);
    views.get(first)?.wrap.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } else {
    findStatus.textContent = `No text matching “${q}” was found. Scanned pages have no text, so draw boxes by hand.`;
  }
});

/* ---------------- open / close ---------------- */
async function close() {
  observer?.disconnect();
  await doc?.destroy();
  doc = null;
  bytes = null;
  file = null;
  boxes.clear();
  terms.clear();
  views.clear();
  renderTerms();
  pagesEl.replaceChildren();
  editor.hidden = true;
  clearBtn.hidden = true;
  verifyEl.hidden = true;
  renderResults(results, []);
  prog.hide();
  syncCount();
}

dropzone($('#dz'), {
  accept: acceptPdf,
  onFiles: async ([f]) => {
    await close();
    prog.start('Opening PDF…');
    try {
      bytes = await readBytes(f);
      doc = await openPdf(bytes);
      file = f;
      info.textContent = `${f.name} · ${formatBytes(f.size)} · ${doc.numPages} page${doc.numPages === 1 ? '' : 's'}`;
      editor.hidden = false;
      clearBtn.hidden = false;
      await buildViews();
      prog.hide();
      syncCount();
    } catch (err) {
      prog.hide();
      toast(err.message, { error: true });
    }
  }
});

clearBtn.addEventListener('click', close);
clearBoxesBtn.addEventListener('click', () => {
  boxes.clear();
  for (const i of views.keys()) renderBoxes(i);
  syncCount();
});

/* ---------------- redact ---------------- */
async function rasterize(index) {
  const page = await doc.getPage(index + 1);
  const base = page.getViewport({ scale: 1 });
  let scale = Number(dpiSel.value) / 72;
  // Stay inside this device's canvas/memory limits for very large pages.
  const maxPx = Math.min(limits.maxMegapixels, 16.7) * 1e6;
  if (base.width * base.height * scale * scale > maxPx) scale = Math.sqrt(maxPx / (base.width * base.height));
  const img = await rasterizePage(page, boxes.get(index) ?? [], {
    scale,
    createCanvas: (w, hgt) => h('canvas', { width: w, height: hgt }),
    encode: async (canvas) => {
      const blob = await canvasToBlob(canvas, 'image/jpeg', 0.92);
      canvas.width = 0; // free the pixels right away
      canvas.height = 0;
      return { bytes: new Uint8Array(await blob.arrayBuffer()), mime: 'image/jpeg' };
    }
  });
  page.cleanup();
  return { index, ...img };
}

async function verify(outBytes, flattened, checkTerms) {
  const out = await openPdf(outBytes);
  try {
    const texts = await extractAllText(out);
    const textLeft = flattened.filter((i) => (texts[i] ?? '').trim().length > 0);
    const still = termsStillPresent(texts, checkTerms);
    return { ok: !textLeft.length && !still.length && out.numPages === doc.numPages, textLeft, still, pages: out.numPages };
  } finally {
    await out.destroy();
  }
}

function showVerification(v, plan) {
  const list = (n) => n.map((i) => i + 1).join(', ');
  const items = [];
  if (!v.textLeft.length) {
    items.push(['ok', `${plan.flattened.length} page${plan.flattened.length === 1 ? '' : 's'} flattened to images (page ${list(plan.flattened)}). No text layer remains on ${plan.flattened.length === 1 ? 'it' : 'them'}.`]);
  } else {
    items.push(['fail', `Text was still found on page ${list(v.textLeft)}.`]);
  }
  for (const t of terms) {
    items.push(v.still.includes(t) ? ['fail', `“${t}” can still be found in the document.`] : ['ok', `“${t}” cannot be found anywhere in the new PDF.`]);
  }
  if (plan.shared.length) {
    items.push(['info', `Page ${list(plan.shared)} ${plan.shared.length === 1 ? 'was' : 'were'} also flattened because ${plan.shared.length === 1 ? 'it shares' : 'they share'} hidden content with a redacted page.`]);
  }
  items.push(['ok', 'Document properties (title, author, bookmarks) were not copied. Links and comments on the other pages were removed.']);
  verifyEl.replaceChildren(
    h('h2', {}, v.ok ? 'Redaction verified' : 'Verification failed'),
    h('ul', { class: 'checklist' }, items.map(([kind, text]) => h('li', { class: `check-${kind}` }, text)))
  );
  verifyEl.className = `verify card ${v.ok ? 'verify-ok' : 'verify-fail'}`;
  verifyEl.hidden = false;
}

runBtn.addEventListener('click', async () => {
  const redacted = [...boxes].filter(([, b]) => b.length).map(([i]) => i).sort((a, b) => a - b);
  if (busy || !redacted.length || !bytes) return;
  busy = true;
  syncCount();
  verifyEl.hidden = true;
  renderResults(results, []);
  prog.start('Checking which pages need flattening…');
  try {
    const plan = await pdfWorker.call('redactionPlan', [bytes.slice(), redacted]);
    const images = [];
    for (let k = 0; k < plan.rasterize.length; k++) {
      const idx = plan.rasterize[k];
      prog.set((k / plan.rasterize.length) * 0.75, `Flattening page ${idx + 1} (${k + 1} of ${plan.rasterize.length})…`);
      images.push(await rasterize(idx));
    }
    const res = await pdfWorker.call('assembleRedacted', [bytes.slice(), images, { redacted }], {
      onProgress: (p) => prog.set(0.75 + p * 0.15, 'Building the redacted PDF…')
    });
    prog.set(0.93, 'Verifying the redaction…');
    const v = await verify(res.bytes, res.flattened, [...terms]);
    showVerification(v, res);
    if (!v.ok) {
      prog.done('Verification failed. The file was not saved.');
      toast('Verification failed, so the redacted file was not offered for download.', { error: true });
      return;
    }
    const blob = new Blob([res.bytes], { type: 'application/pdf' });
    const [stem] = splitExt(safeName(file.name));
    prog.done('Redacted and verified.');
    renderResults(results, [{ name: `${stem}-redacted.pdf`, blob, meta: `${formatBytes(blob.size)} · ${v.pages} pages` }], { heading: 'Your redacted PDF' });
  } catch (err) {
    prog.hide();
    toast(err.message, { error: true });
  } finally {
    busy = false;
    syncCount();
  }
});

syncCount();
