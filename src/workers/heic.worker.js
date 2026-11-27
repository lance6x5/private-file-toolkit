/**
 * HEIC/HEIF decoding with libheif (WebAssembly). This worker, and the
 * decoder inside it, is only ever loaded by the HEIC to JPG page.
 */
import { serve } from './rpc.js';
import { decodeHeic, getLib } from '../lib/heic-decode.js';
import { canvasToBlob, hasOffscreen2d } from '../lib/encode-image.js';
import { zipFiles } from '../lib/zip.js';

serve({
  warm: async () => {
    await getLib();
    return true;
  },
  /** Decode and (if OffscreenCanvas exists) encode to JPG here; else return pixels. */
  convert: async (bytes, { quality = 0.9 } = {}, { onProgress } = {}) => {
    const img = await decodeHeic(bytes);
    onProgress?.(0.7);
    if (!hasOffscreen2d()) return { pixels: img.data, width: img.width, height: img.height };
    const canvas = new OffscreenCanvas(img.width, img.height);
    const ctx = canvas.getContext('2d');
    ctx.putImageData(new ImageData(img.data, img.width, img.height), 0, 0);
    const blob = await canvasToBlob(canvas, 'image/jpeg', quality);
    return { blob, width: img.width, height: img.height };
  },
  zip: (files, opts) => zipFiles(files, opts)
});
