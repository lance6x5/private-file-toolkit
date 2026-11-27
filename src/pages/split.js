import '../common/boot.js';
import { $, dropzone, progress, toast, readBytes, acceptPdf } from '../common/ui.js';
import { renderResults } from '../common/results.js';
import { pdfWorker, warmPdfWorker } from './pdf-worker.js';
import { formatBytes, splitExt, safeName } from '../lib/format.js';
import { parsePageRanges, chunkPages, groupLabel } from '../lib/page-range.js';

warmPdfWorker();

const panel = $('#options');
const info = $('#file-info');
const runBtn = $('#run-btn');
const clearBtn = $('#clear-btn');
const results = $('#results');
const rangeInput = $('#range');
const chunkInput = $('#chunk');
const rangeError = $('#range-error');
const prog = progress($('#progress'));
const modeInputs = [...document.querySelectorAll('input[name=mode]')];
const mode = () => modeInputs.find((m) => m.checked)?.value ?? 'extract';

let file = null;
let pageCount = 0;
let busy = false;

function sync() {
  $('#extract-fields').hidden = mode() !== 'extract';
  $('#chunk-fields').hidden = mode() !== 'chunk';
  runBtn.disabled = busy || !file;
}
modeInputs.forEach((m) => m.addEventListener('change', sync));

dropzone($('#dz'), {
  accept: acceptPdf,
  onFiles: async ([f]) => {
    renderResults(results, []);
    prog.hide();
    try {
      const { pageCount: n } = await pdfWorker.call('info', [await readBytes(f)]);
      file = f;
      pageCount = n;
      info.textContent = `${f.name} · ${formatBytes(f.size)} · ${n} page${n === 1 ? '' : 's'}`;
      rangeInput.placeholder = n > 1 ? `e.g. 1-${Math.min(3, n)}, ${n}` : '1';
      panel.hidden = false;
      clearBtn.hidden = false;
    } catch (err) {
      toast(err.message, { error: true });
    }
    sync();
  }
});

clearBtn.addEventListener('click', () => {
  file = null;
  panel.hidden = true;
  clearBtn.hidden = true;
  renderResults(results, []);
  prog.hide();
  sync();
});

function groups() {
  const m = mode();
  if (m === 'every') return chunkPages(pageCount, 1);
  if (m === 'chunk') return chunkPages(pageCount, chunkInput.value);
  return [parsePageRanges(rangeInput.value, pageCount)];
}

runBtn.addEventListener('click', async () => {
  if (busy || !file) return;
  let g;
  try {
    g = groups();
    rangeError.textContent = '';
    rangeInput.removeAttribute('aria-invalid');
  } catch (err) {
    rangeError.textContent = err.message;
    rangeInput.setAttribute('aria-invalid', 'true');
    rangeInput.focus();
    return;
  }
  busy = true;
  sync();
  prog.start('Splitting…');
  try {
    const outs = await pdfWorker.call('split', [await readBytes(file), g], {
      onProgress: (p) => prog.set(p, `Splitting… ${Math.round(p * 100)}%`)
    });
    const [stem] = splitExt(safeName(file.name));
    const outputs = outs.map((bytes, i) => {
      const label = groupLabel(g[i]);
      const blob = new Blob([bytes], { type: 'application/pdf' });
      return {
        name: `${stem}-${label === 'selection' ? 'selection' : `page${g[i].length > 1 ? 's' : ''}-${label}`}.pdf`,
        blob,
        meta: `${formatBytes(blob.size)} · ${g[i].length} page${g[i].length === 1 ? '' : 's'}`
      };
    });
    prog.done(`Created ${outputs.length} file${outputs.length === 1 ? '' : 's'}.`);
    renderResults(results, outputs, { zipper: pdfWorker, zipName: `${stem}-split.zip` });
  } catch (err) {
    prog.hide();
    toast(err.message, { error: true });
  } finally {
    busy = false;
    sync();
  }
});

sync();
