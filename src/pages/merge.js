import '../common/boot.js';
import { $, h, dropzone, progress, toast, readBytes, acceptPdf, moveItem, sortable } from '../common/ui.js';
import { renderResults } from '../common/results.js';
import { pdfWorker, warmPdfWorker } from './pdf-worker.js';
import { formatBytes } from '../lib/format.js';

warmPdfWorker();

const list = $('#file-list');
const runBtn = $('#run-btn');
const clearBtn = $('#clear-btn');
const results = $('#results');
const prog = progress($('#progress'));

/** @type {{file: File, pages: number|null, error?: string}[]} */
let items = [];
let busy = false;

function render() {
  list.replaceChildren(
    ...items.map((it, i) =>
      h(
        'li',
        { class: 'file-item sortable-item', draggable: 'true', 'data-index': i },
        h('span', { class: 'drag-handle', 'aria-hidden': 'true' }, '☰'),
        h('span', { class: 'order' }, `${i + 1}.`),
        h('span', { class: 'file-name' }, it.file.name),
        h(
          'span',
          { class: it.error ? 'error-text' : 'muted' },
          it.error ?? `${formatBytes(it.file.size)}${it.pages != null ? ` · ${it.pages} page${it.pages === 1 ? '' : 's'}` : ''}`
        ),
        h(
          'span',
          { class: 'item-buttons' },
          h('button', { class: 'btn btn-icon btn-ghost', type: 'button', 'aria-label': `Move ${it.file.name} up`, disabled: i === 0, onclick: () => move(i, i - 1) }, '↑'),
          h('button', { class: 'btn btn-icon btn-ghost', type: 'button', 'aria-label': `Move ${it.file.name} down`, disabled: i === items.length - 1, onclick: () => move(i, i + 1) }, '↓'),
          h('button', { class: 'btn btn-icon btn-ghost', type: 'button', 'aria-label': `Remove ${it.file.name}`, onclick: () => remove(i) }, '×')
        )
      )
    )
  );
  list.hidden = !items.length;
  const valid = items.filter((it) => !it.error);
  runBtn.disabled = busy || valid.length < 2;
  runBtn.textContent = valid.length > 1 ? `Merge ${valid.length} PDFs` : 'Merge PDFs';
  clearBtn.hidden = !items.length;
  $('#hint').hidden = items.length !== 1;
}

function move(from, to) {
  items = moveItem(items, from, to);
  render();
  list.querySelectorAll('.file-item')[to]?.querySelector(`button[aria-label^="Move"]:not([disabled])`)?.focus();
}

function remove(i) {
  items.splice(i, 1);
  render();
}

sortable(list, (from, to) => {
  items = moveItem(items, from, to);
  render();
});

dropzone($('#dz'), {
  accept: acceptPdf,
  queuedBytes: () => items.reduce((n, it) => n + it.file.size, 0),
  onFiles: async (files) => {
    const added = files.map((file) => ({ file, pages: null }));
    items.push(...added);
    render();
    for (const it of added) {
      try {
        it.pages = (await pdfWorker.call('info', [await readBytes(it.file)])).pageCount;
      } catch (err) {
        it.error = err.message;
      }
      render();
    }
  }
});

clearBtn.addEventListener('click', () => {
  items = [];
  renderResults(results, []);
  prog.hide();
  render();
});

runBtn.addEventListener('click', async () => {
  const valid = items.filter((it) => !it.error);
  if (busy || !valid.length) return;
  busy = true;
  render();
  prog.start('Reading files…');
  try {
    const files = [];
    for (const it of valid) files.push({ name: it.file.name, bytes: await readBytes(it.file) });
    const out = await pdfWorker.call('merge', [files], { onProgress: (p) => prog.set(p, `Merging… ${Math.round(p * 100)}%`) });
    const blob = new Blob([out], { type: 'application/pdf' });
    const pages = valid.reduce((n, it) => n + (it.pages || 0), 0);
    prog.done(`Merged ${valid.length} files.`);
    renderResults(results, [{ name: 'merged.pdf', blob, meta: `${formatBytes(blob.size)} · ${pages} pages` }], { heading: 'Your merged PDF' });
  } catch (err) {
    prog.hide();
    toast(err.message, { error: true });
  } finally {
    busy = false;
    render();
  }
});

render();
