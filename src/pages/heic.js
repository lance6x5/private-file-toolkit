import '../common/boot.js';
import heicWorkerUrl from '../workers/heic.worker.js?worker&url';
import { $, readBytes, toast } from '../common/ui.js';
import { WorkerClient } from '../common/worker-client.js';
import { createBatchTool } from '../common/image-batch.js';
import { isHeic, qualityFromPercent } from '../lib/image-size.js';
import { canvasToBlob, makeCanvas } from '../lib/encode-image.js';
import { renameExt } from '../lib/format.js';
import { loadPrefs, savePrefs } from '../lib/prefs.js';

const heic = new WorkerClient(heicWorkerUrl, 'heic');
const status = $('#decoder-status');

// Load the WebAssembly decoder as soon as the page opens, so the tool keeps
// working if you go offline afterwards.
status.textContent = 'Loading the HEIC decoder…';
heic
  .call('warm')
  .then(() => (status.textContent = 'HEIC decoder ready. It runs on your device.'))
  .catch(() => {
    status.textContent = 'The HEIC decoder could not be loaded. Reload the page to try again.';
    toast('The HEIC decoder could not be loaded.', { error: true });
  });

const prefs = loadPrefs();
const quality = $('#quality');
const qualityOut = $('#quality-out');
quality.value = prefs.heicQuality;
const showQ = () => (qualityOut.textContent = `${quality.value}%`);
showQ();
quality.addEventListener('input', showQ);
quality.addEventListener('change', () => savePrefs({ heicQuality: Number(quality.value) }));

createBatchTool({
  accept: isHeic,
  runLabel: 'Convert',
  zipName: 'heic-to-jpg.zip',
  zipper: heic,
  async process(file, onProgress) {
    const q = qualityFromPercent(quality.value);
    const res = await heic.call('convert', [await readBytes(file), { quality: q }], { onProgress });
    let blob = res.blob;
    if (!blob) {
      // No OffscreenCanvas in the worker: encode the decoded pixels here.
      const canvas = makeCanvas(res.width, res.height);
      canvas.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(res.pixels), res.width, res.height), 0, 0);
      blob = await canvasToBlob(canvas, 'image/jpeg', q);
    }
    return { blob, name: renameExt(file.name, 'jpg'), width: res.width, height: res.height, note: 'no metadata' };
  }
});
