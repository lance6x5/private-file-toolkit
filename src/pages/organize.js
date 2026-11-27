import '../common/boot.js';
import { $, h, dropzone, progress, toast, readBytes, acceptPdf, moveItem, sortable } from '../common/ui.js';
import { renderResults } from '../common/results.js';
import { pdfWorker, warmPdfWorker } from './pdf-worker.js';
import { loadPdfjs, openPdf, renderToCanvas } from '../common/pdfjs.js';
import { formatBytes, splitExt, safeName } from '../lib/format.js';

warmPdfWorker();
loadPdfjs().catch(() => {}); // cache pdf.js now so the tool works offline later

const grid = $('#page-grid');
const panel = $('#editor');
const info = $('#file-info');
const saveBtn = $('#run-btn');
const resetBtn = $('#reset-btn');
const clearBtn = $('#clear-btn');
const results = $('#results');
const prog = progress($('#progress'));

let file = null;
let bytes = null;
let doc = null;
/** @type {{index:number, rotate:number, deleted:boolean}[]} */
let items = [];
const thumbs = new Map(); // original page index -> canvas
let observer = null;
let busy = false;

const THUMB_W = 150;

async function renderThumb(index) {
  if (thumbs.has(index) || !doc) return thumbs.get(index);
  const placeholder = h('canvas', { width: 1, height: 1 });
  thumbs.set(index, placeholder);
  try {
    const page = await doc.getPage(index + 1);
    const base = page.getViewport({ scale: 1 });
    const scale = (THUMB_W * Math.min(2, window.devicePixelRatio || 1)) / base.width;
    await renderToCanvas(page, scale, placeholder);
    page.cleanup();
  } catch {
    /* keep the blank placeholder */
  }
  return placeholder;
}

function render() {
  observer?.disconnect();
  observer = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        const idx = Number(e.target.dataset.page);
        renderThumb(idx).then((c) => {
          const frame = e.target.querySelector('.thumb-frame');
          if (c && frame && !frame.contains(c)) frame.replaceChildren(c);
        });
        observer.unobserve(e.target);
      }
    },
    { rootMargin: '400px' }
  );
  const kept = items.filter((it) => !it.deleted).length;
  grid.replaceChildren(
    ...items.map((it, i) => {
      const n = it.index + 1;
      const card = h(
        'li',
        {
          class: `page-card sortable-item${it.deleted ? ' deleted' : ''}`,
          draggable: 'true',
          'data-index': i,
          'data-page': it.index
        },
        h(
          'div',
          { class: 'thumb-frame', style: `transform: rotate(${it.rotate}deg)` },
          thumbs.get(it.index) ?? h('span', { class: 'muted' }, 'Loading…')
        ),
        h('p', { class: 'page-label' }, `Page ${n}${it.rotate ? ` · ${it.rotate}°` : ''}${it.deleted ? ' · deleted' : ''}`),
        h(
          'div',
          { class: 'page-buttons' },
          h('button', { class: 'btn btn-icon btn-ghost', type: 'button', 'aria-label': `Move page ${n} earlier`, disabled: i === 0, onclick: () => move(i, i - 1) }, '←'),
          h('button', { class: 'btn btn-icon btn-ghost', type: 'button', 'aria-label': `Rotate page ${n} left`, onclick: () => rotate(i, -90) }, '⟲'),
          h('button', { class: 'btn btn-icon btn-ghost', type: 'button', 'aria-label': `Rotate page ${n} right`, onclick: () => rotate(i, 90) }, '⟳'),
          h(
            'button',
            { class: 'btn btn-icon btn-ghost', type: 'button', 'aria-label': `${it.deleted ? 'Restore' : 'Delete'} page ${n}`, 'aria-pressed': String(it.deleted), onclick: () => toggleDelete(i) },
            it.deleted ? '↺' : '✕'
          ),
          h('button', { class: 'btn btn-icon btn-ghost', type: 'button', 'aria-label': `Move page ${n} later`, disabled: i === items.length - 1, onclick: () => move(i, i + 1) }, '→')
        )
      );
      if (!thumbs.has(it.index) || thumbs.get(it.index).width <= 1) observer.observe(card);
      return card;
    })
  );
  $('#summary').textContent = `${kept} of ${items.length} pages will be saved.`;
  saveBtn.disabled = busy || !kept;
}

function focusButton(i, label) {
  grid.children[i]?.querySelector(`button[aria-label^="${label}"]`)?.focus();
}
function move(from, to) {
  items = moveItem(items, from, to);
  render();
  focusButton(to, to < from ? 'Move page' : 'Move page');
}
function rotate(i, deg) {
  items[i].rotate = (((items[i].rotate + deg) % 360) + 360) % 360;
  render();
  focusButton(i, deg < 0 ? 'Rotate page' : 'Rotate page');
}
function toggleDelete(i) {
  items[i].deleted = !items[i].deleted;
  render();
  focusButton(i, items[i].deleted ? 'Restore' : 'Delete');
}

sortable(grid, (from, to) => {
  items = moveItem(items, from, to);
  render();
});

function reset() {
  if (!doc) return;
  items = Array.from({ length: doc.numPages }, (_, i) => ({ index: i, rotate: 0, deleted: false }));
  render();
}

async function close() {
  observer?.disconnect();
  thumbs.clear();
  await doc?.destroy();
  doc = null;
  file = null;
  bytes = null;
  items = [];
  grid.replaceChildren();
  panel.hidden = true;
  clearBtn.hidden = true;
  renderResults(results, []);
  prog.hide();
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
      info.textContent = `${f.name} · ${formatBytes(f.size)} · ${doc.numPages} pages`;
      panel.hidden = false;
      clearBtn.hidden = false;
      prog.hide();
      reset();
    } catch (err) {
      prog.hide();
      toast(err.message, { error: true });
    }
  }
});

resetBtn.addEventListener('click', reset);
clearBtn.addEventListener('click', close);

saveBtn.addEventListener('click', async () => {
  if (busy || !bytes) return;
  const keep = items.filter((it) => !it.deleted).map(({ index, rotate }) => ({ index, rotate }));
  if (!keep.length) return toast('Keep at least one page.', { error: true });
  busy = true;
  render();
  prog.start('Saving…');
  try {
    const out = await pdfWorker.call('organize', [bytes.slice(), keep], { onProgress: (p) => prog.set(p) });
    const blob = new Blob([out], { type: 'application/pdf' });
    const [stem] = splitExt(safeName(file.name));
    prog.done('Saved.');
    renderResults(results, [{ name: `${stem}-reordered.pdf`, blob, meta: `${formatBytes(blob.size)} · ${keep.length} pages` }], { heading: 'Your PDF' });
  } catch (err) {
    prog.hide();
    toast(err.message, { error: true });
  } finally {
    busy = false;
    render();
  }
});
