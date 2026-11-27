import '../common/boot.js';
import { $, limits } from '../common/ui.js';
import { createBatchTool } from '../common/image-batch.js';
import { encode, imageWorker } from './image-encoder.js';
import { FORMATS, formatOf, qualityFromPercent } from '../lib/image-size.js';
import { renameExt } from '../lib/format.js';
import { loadPrefs, savePrefs } from '../lib/prefs.js';

const prefs = loadPrefs();
const quality = $('#quality');
const qualityOut = $('#quality-out');
const maxDim = $('#max-dim');
const format = $('#format');
const keepSmaller = $('#keep-smaller');

quality.value = prefs.compressQuality;
maxDim.value = String(prefs.compressMaxDim);
if (![...maxDim.options].some((o) => o.value === maxDim.value)) maxDim.value = '0';
format.value = prefs.compressFormat;
const showQ = () => (qualityOut.textContent = `${quality.value}%`);
showQ();
quality.addEventListener('input', showQ);
const persist = () =>
  savePrefs({ compressQuality: Number(quality.value), compressMaxDim: Number(maxDim.value), compressFormat: format.value });
[quality, maxDim, format].forEach((el) => el.addEventListener('change', persist));

const srcFormat = (f) => formatOf(f.type || f.name);

createBatchTool({
  accept: (f) => ['jpeg', 'png', 'webp'].includes(srcFormat(f)),
  paste: true,
  runLabel: 'Compress',
  zipName: 'compressed-images.zip',
  zipper: imageWorker,
  async process(file) {
    const src = srcFormat(file);
    const key = format.value === 'same' ? src : format.value;
    const fmt = FORMATS[key];
    const dim = Number(maxDim.value);
    const res = await encode(file, {
      mime: fmt.mime,
      quality: qualityFromPercent(quality.value),
      resize: dim ? { mode: 'max', maxDim: dim } : {},
      maxPixels: limits.maxMegapixels * 1e6
    });
    if (res.type !== fmt.mime) throw new Error(`Your browser cannot save ${fmt.label} images.`);
    if (keepSmaller.checked && key === src && !dim && !res.capped && res.blob.size >= file.size) {
      return { blob: file, name: file.name, keptOriginal: true, width: res.srcWidth, height: res.srcHeight, note: 'metadata unchanged' };
    }
    return {
      blob: res.blob,
      name: renameExt(file.name, fmt.ext, '-compressed'),
      width: res.width,
      height: res.height,
      note: res.capped ? 'reduced to fit this device’s memory' : ''
    };
  }
});
