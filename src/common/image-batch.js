/**
 * Shared batch workflow for the image tools (compress, resize/convert,
 * HEIC to JPG): queue files, process them one at a time in a worker,
 * show before/after sizes and previews, download individually or as ZIP.
 */
import { $, h, dropzone, progress, toast, saveBlob } from './ui.js';
import { formatBytes, formatChange } from '../lib/format.js';
import { renderResults } from './results.js';

/**
 * @param {{
 *   accept: (f: File) => boolean,
 *   paste?: boolean,
 *   process: (file: File, onProgress: (v:number)=>void) => Promise<{blob:Blob, name:string, width?:number, height?:number, note?:string, keptOriginal?:boolean}>,
 *   zipper: {call: Function},
 *   zipName: string,
 *   runLabel: string,
 *   previews?: boolean
 * }} cfg
 */
export function createBatchTool(cfg) {
  const zone = $('#dz');
  const queueEl = $('#queue');
  const runBtn = $('#run-btn');
  const clearBtn = $('#clear-btn');
  const results = $('#results');
  const prog = progress($('#progress'));
  let queue = [];
  let urls = [];
  let busy = false;

  const revoke = () => {
    urls.forEach((u) => URL.revokeObjectURL(u));
    urls = [];
  };
  const url = (blob) => {
    const u = URL.createObjectURL(blob);
    urls.push(u);
    return u;
  };

  function renderQueue() {
    queueEl.replaceChildren(
      ...queue.map((f, i) =>
        h(
          'li',
          { class: 'file-item' },
          h('span', { class: 'file-name' }, f.name),
          h('span', { class: 'muted' }, formatBytes(f.size)),
          h(
            'button',
            {
              class: 'btn btn-icon btn-ghost',
              type: 'button',
              'aria-label': `Remove ${f.name}`,
              disabled: busy,
              onclick: () => {
                queue.splice(i, 1);
                renderQueue();
              }
            },
            '×'
          )
        )
      )
    );
    queueEl.hidden = !queue.length;
    runBtn.disabled = busy || !queue.length;
    clearBtn.hidden = !queue.length && results.hidden;
    runBtn.textContent = queue.length > 1 ? `${cfg.runLabel} ${queue.length} files` : cfg.runLabel;
  }

  dropzone(zone, {
    accept: cfg.accept,
    paste: cfg.paste,
    queuedBytes: () => queue.reduce((n, f) => n + f.size, 0),
    onFiles: (files) => {
      queue.push(...files);
      renderQueue();
    }
  });

  clearBtn.addEventListener('click', () => {
    if (busy) return;
    queue = [];
    revoke();
    renderResults(results, []);
    prog.hide();
    renderQueue();
  });

  runBtn.addEventListener('click', async () => {
    if (busy || !queue.length) return;
    busy = true;
    renderQueue();
    revoke();
    const outputs = [];
    const failures = [];
    const files = queue.slice();
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      const label = `Processing ${i + 1} of ${files.length}: ${f.name}`;
      prog.set(i / files.length, label);
      try {
        const out = await cfg.process(f, (p) => prog.set((i + Math.min(1, p)) / files.length, label));
        const dims = out.width ? ` · ${out.width}×${out.height}` : '';
        const change = out.keptOriginal ? ' (original kept: it was already smaller)' : ` (${formatChange(f.size, out.blob.size)})`;
        outputs.push({
          name: out.name,
          blob: out.blob,
          preview: cfg.previews === false ? null : url(out.blob),
          meta: `${formatBytes(f.size)} → ${formatBytes(out.blob.size)}${change}${dims}${out.note ? ` · ${out.note}` : ''}`
        });
      } catch (err) {
        failures.push(`${f.name}: ${err.message}`);
      }
    }
    busy = false;
    queue = [];
    renderQueue();
    prog.done(`Done: ${outputs.length} converted${failures.length ? `, ${failures.length} failed` : ''}.`);
    renderResults(results, outputs, { zipper: cfg.zipper, zipName: cfg.zipName });
    if (failures.length) {
      results.prepend(h('ul', { class: 'dz-errors', role: 'alert' }, failures.map((m) => h('li', {}, m))));
      results.hidden = false;
    }
    clearBtn.hidden = false;
    if (outputs.length === 1 && files.length === 1) toast('Ready. Press Download to save your file.');
  });

  renderQueue();
  return { saveBlob };
}
