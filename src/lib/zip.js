/** Build a ZIP of output files with JSZip (loaded only when needed). */
import { uniqueNames } from './format.js';

/**
 * @param {{name:string, data:Uint8Array|Blob}[]} files
 * @returns {Promise<Uint8Array>}
 */
export async function zipFiles(files, { onProgress = () => {} } = {}) {
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  const names = uniqueNames(files.map((f) => f.name));
  files.forEach((f, i) => zip.file(names[i], f.data, { binary: true }));
  return zip.generateAsync(
    // Most outputs (PDF, JPG, PNG, WebP) are already compressed.
    { type: 'uint8array', compression: 'STORE' },
    (meta) => onProgress(meta.percent / 100)
  );
}
