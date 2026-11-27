import '../common/boot.js';
import { $, h, dropzone, progress, toast, readBytes } from '../common/ui.js';
import { renderResults } from '../common/results.js';
import { imageWorker } from './image-encoder.js';
import { readMetadata, summarize, formatCoord } from '../lib/exif-read.js';
import { formatBytes, renameExt, splitExt } from '../lib/format.js';
import { sniffFormat } from '../lib/strip-metadata.js';

imageWorker.ensure();
import('exifr').catch(() => {}); // cache the EXIF reader now for offline use

const listEl = $('#photos');
const runBtn = $('#run-btn');
const clearBtn = $('#clear-btn');
const results = $('#results');
const prog = progress($('#progress'));

/** @type {{file: File, bytes: Uint8Array, format: string|null, meta: object|null, url: string|null}[]} */
let photos = [];
let busy = false;

const accept = (f) => /^image\//.test(f.type) || /\.(jpe?g|png|webp|heic|heif|tiff?)$/i.test(f.name);

function card(p, i) {
  const s = summarize(p.meta);
  const gps = s.gps;
  const cleanable = ['jpeg', 'png', 'webp'].includes(p.format);
  return h(
    'li',
    { class: `photo-card card${gps ? ' has-gps' : ''}` },
    h(
      'div',
      { class: 'photo-head' },
      p.url ? h('img', { class: 'photo-thumb', src: p.url, alt: '' }) : h('div', { class: 'photo-thumb placeholder', 'aria-hidden': 'true' }, (p.format || '?').toUpperCase()),
      h('div', {}, h('h3', { class: 'file-name' }, p.file.name), h('p', { class: 'muted' }, `${formatBytes(p.file.size)}${p.format ? ` · ${p.format.toUpperCase()}` : ''}`)),
      h('button', { type: 'button', class: 'btn btn-icon btn-ghost', 'aria-label': `Remove ${p.file.name}`, disabled: busy, onclick: () => remove(i) }, '×')
    ),
    gps
      ? h(
          'div',
          { class: 'gps-alert', role: 'alert' },
          h('strong', {}, 'This photo contains your location'),
          h('p', {}, `GPS: ${formatCoord(gps.latitude, 'lat')}, ${formatCoord(gps.longitude, 'lon')}${gps.altitude != null ? ` · altitude ${Math.round(gps.altitude)} m` : ''}`),
          h('p', { class: 'small' }, 'Anyone you send the original file to can see exactly where it was taken.')
        )
      : p.meta
        ? h('p', { class: 'ok-note' }, 'No GPS location found in this photo.')
        : null,
    s.rows.length
      ? h('dl', { class: 'meta-grid' }, s.rows.flatMap(([k, v]) => [h('dt', {}, k), h('dd', {}, v)]))
      : h('p', { class: 'muted' }, p.meta ? 'No camera details found.' : 'No metadata found in this file.'),
    s.all.length
      ? h(
          'details',
          { class: 'all-meta' },
          h('summary', {}, `All metadata (${s.all.length} fields)`),
          h('table', {}, h('tbody', {}, s.all.map(([k, v]) => h('tr', {}, h('th', { scope: 'row' }, k), h('td', {}, v)))))
        )
      : null,
    cleanable ? null : h('p', { class: 'warn-note' }, p.format === 'heic' ? 'HEIC photos cannot be cleaned in place. Use HEIC to JPG: converted JPGs never include metadata.' : 'Only JPG, PNG and WebP files can be cleaned.')
  );
}

function render() {
  listEl.replaceChildren(...photos.map(card));
  listEl.hidden = !photos.length;
  const n = photos.filter((p) => ['jpeg', 'png', 'webp'].includes(p.format)).length;
  runBtn.disabled = busy || !n;
  runBtn.textContent = n > 1 ? `Remove metadata from ${n} photos` : 'Remove metadata';
  clearBtn.hidden = !photos.length;
}

function remove(i) {
  const [p] = photos.splice(i, 1);
  if (p?.url) URL.revokeObjectURL(p.url);
  render();
}

dropzone($('#dz'), {
  accept,
  paste: true,
  queuedBytes: () => photos.reduce((n, p) => n + p.file.size, 0),
  onFiles: async (files) => {
    prog.start('Reading metadata…');
    for (const file of files) {
      const bytes = await readBytes(file);
      const format = sniffFormat(bytes);
      let meta = null;
      try {
        meta = await readMetadata(bytes);
      } catch {
        meta = null;
      }
      const url = ['jpeg', 'png', 'webp', 'avif', 'gif'].includes(format) ? URL.createObjectURL(file) : null;
      photos.push({ file, bytes, format, meta, url });
    }
    prog.hide();
    renderResults(results, []);
    render();
  }
});

clearBtn.addEventListener('click', () => {
  photos.forEach((p) => p.url && URL.revokeObjectURL(p.url));
  photos = [];
  renderResults(results, []);
  prog.hide();
  render();
});

runBtn.addEventListener('click', async () => {
  const todo = photos.filter((p) => ['jpeg', 'png', 'webp'].includes(p.format));
  if (busy || !todo.length) return;
  busy = true;
  render();
  const outputs = [];
  const problems = [];
  for (let i = 0; i < todo.length; i++) {
    const p = todo[i];
    prog.set(i / todo.length, `Cleaning ${i + 1} of ${todo.length}: ${p.file.name}`);
    try {
      const res = await imageWorker.call('strip', [p.bytes.slice()]);
      // Verify: re-read the clean copy. Only an Orientation tag may remain.
      const after = summarize(await readMetadata(res.bytes).catch(() => null));
      const leftover = after.all.filter(([k]) => k !== 'Orientation');
      if (leftover.length || after.gps) throw new Error('Verification failed: metadata is still present.');
      const [, ext] = splitExt(p.file.name);
      const blob = new Blob([res.bytes], { type: p.file.type || `image/${p.format}` });
      outputs.push({
        name: renameExt(p.file.name, ext || p.format, '-clean'),
        blob,
        preview: p.url,
        meta: `${formatBytes(p.file.size)} → ${formatBytes(blob.size)} · verified clean${res.removed.length ? ` · removed: ${res.removed.join(', ')}` : ' · nothing to remove'}${res.orientation !== 1 ? ' · rotation kept' : ''}`
      });
    } catch (err) {
      problems.push(`${p.file.name}: ${err.message}`);
    }
  }
  busy = false;
  render();
  prog.done(`Cleaned ${outputs.length} photo${outputs.length === 1 ? '' : 's'}.`);
  renderResults(results, outputs, { zipper: imageWorker, zipName: 'clean-photos.zip', heading: 'Clean copies' });
  if (problems.length) {
    toast(problems[0], { error: true });
    results.prepend(h('ul', { class: 'dz-errors', role: 'alert' }, problems.map((m) => h('li', {}, m))));
    results.hidden = false;
  }
});

render();
