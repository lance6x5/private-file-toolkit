import '../common/boot.js';
import { $, limits } from '../common/ui.js';
import { createBatchTool } from '../common/image-batch.js';
import { encode, imageWorker } from './image-encoder.js';
import { FORMATS, formatOf, qualityFromPercent } from '../lib/image-size.js';
import { canEncode } from '../lib/encode-image.js';
import { renameExt } from '../lib/format.js';
import { loadPrefs, savePrefs } from '../lib/prefs.js';

const prefs = loadPrefs();
const format = $('#format');
const quality = $('#quality');
const qualityOut = $('#quality-out');
const percent = $('#percent');
const width = $('#width');
const height = $('#height');
const lock = $('#lock');
const modeInputs = [...document.querySelectorAll('input[name=mode]')];
const mode = () => modeInputs.find((m) => m.checked)?.value ?? 'none';

format.value = prefs.resizeFormat;
quality.value = prefs.resizeQuality;

const sync = () => {
  qualityOut.textContent = `${quality.value}%`;
  const lossy = !!FORMATS[format.value]?.lossy;
  quality.disabled = !lossy;
  $('#quality-hint').hidden = lossy;
  const m = mode();
  $('#percent-fields').hidden = m !== 'percent';
  $('#pixel-fields').hidden = m !== 'pixels';
};

// AVIF is offered only when this browser can actually encode it.
canEncode('image/avif').then((ok) => {
  const opt = format.querySelector('option[value=avif]');
  opt.disabled = !ok;
  opt.textContent = ok ? 'AVIF' : 'AVIF (not supported by this browser)';
  if (!ok && format.value === 'avif') format.value = 'webp';
  sync();
});

sync();
[format, quality, ...modeInputs].forEach((el) => el.addEventListener('input', sync));
[format, ...modeInputs].forEach((el) => el.addEventListener('change', sync));
const persist = () => savePrefs({ resizeFormat: format.value, resizeQuality: Number(quality.value) });
[format, quality].forEach((el) => el.addEventListener('change', persist));

function resizeOpts() {
  const m = mode();
  if (m === 'percent') {
    const p = Number(percent.value);
    if (!(p > 0 && p <= 1000)) throw new Error('Enter a percentage between 1 and 1000.');
    return { mode: 'percent', percent: p };
  }
  if (m === 'pixels') {
    const w = Number(width.value) || 0;
    const hgt = Number(height.value) || 0;
    if (!w && !hgt) throw new Error('Enter a width, a height, or both.');
    if (w > 20000 || hgt > 20000) throw new Error('The maximum size is 20,000 pixels.');
    return { mode: 'pixels', width: w, height: hgt, keepAspect: lock.checked };
  }
  return { mode: 'none' };
}

createBatchTool({
  accept: (f) => !!formatOf(f.type || f.name),
  paste: true,
  runLabel: 'Convert',
  zipName: 'converted-images.zip',
  zipper: imageWorker,
  async process(file) {
    const fmt = FORMATS[format.value];
    const resize = resizeOpts();
    const res = await encode(file, {
      mime: fmt.mime,
      quality: qualityFromPercent(quality.value),
      resize,
      maxPixels: limits.maxMegapixels * 1e6
    });
    if (res.type !== fmt.mime) throw new Error(`Your browser cannot save ${fmt.label} images.`);
    const sameFormat = formatOf(file.type || file.name) === format.value;
    const suffix = resize.mode !== 'none' ? '-resized' : sameFormat ? '-converted' : '';
    return {
      blob: res.blob,
      name: renameExt(file.name, fmt.ext, suffix),
      width: res.width,
      height: res.height,
      note: res.capped ? 'reduced to fit this device’s memory' : ''
    };
  }
});
