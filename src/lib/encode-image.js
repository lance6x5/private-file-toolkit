/**
 * Browser image re-encoding (resize / convert / compress) with canvas.
 * Works in a Web Worker (OffscreenCanvas) or on the main thread.
 * Output is built from pixels only, so no metadata is carried over.
 */
import { targetSize, downscaleSteps } from './image-size.js';

export function hasOffscreen2d() {
  try {
    return typeof OffscreenCanvas !== 'undefined' && !!new OffscreenCanvas(1, 1).getContext('2d');
  } catch {
    return false;
  }
}

export function makeCanvas(w, h) {
  if (hasOffscreen2d()) return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

export function canvasToBlob(canvas, type, quality) {
  if (typeof canvas.convertToBlob === 'function') return canvas.convertToBlob({ type, quality });
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('The browser could not encode this image.'))), type, quality)
  );
}

/**
 * @param {Blob|ImageBitmap|ImageData} source
 * @param {{mime:string, quality?:number, resize?:object, maxPixels?:number}} opts
 */
export async function encodeImage(source, { mime, quality, resize = {}, maxPixels } = {}) {
  let bmp;
  if (source instanceof Blob) {
    try {
      bmp = await createImageBitmap(source, { imageOrientation: 'from-image' });
    } catch {
      throw new Error('This image could not be decoded by your browser.');
    }
  } else if (typeof ImageData !== 'undefined' && source instanceof ImageData) {
    bmp = await createImageBitmap(source);
  } else {
    bmp = source;
  }
  const srcWidth = bmp.width;
  const srcHeight = bmp.height;
  const { width, height, capped } = targetSize(srcWidth, srcHeight, { ...resize, maxPixels });
  const opaque = mime === 'image/jpeg';
  let current = bmp;
  const steps = downscaleSteps(srcWidth, srcHeight, width, height);
  for (let k = 0; k < steps.length; k++) {
    const { width: w, height: h } = steps[k];
    const c = makeCanvas(w, h);
    const ctx = c.getContext('2d');
    if (!ctx) throw new Error('Your browser ran out of memory for this image. Try a smaller size.');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    if (opaque && k === steps.length - 1) {
      ctx.fillStyle = '#ffffff'; // JPG has no transparency
      ctx.fillRect(0, 0, w, h);
    }
    ctx.drawImage(current, 0, 0, w, h);
    if (current !== bmp && current.width) {
      current.width = 0; // release intermediate canvases early
    }
    current = c;
  }
  bmp.close?.();
  const blob = await canvasToBlob(current, mime, quality);
  return { blob, type: blob.type, width, height, srcWidth, srcHeight, capped };
}

/** Can this browser encode the given MIME type? (Unsupported types fall back to PNG.) */
export async function canEncode(mime) {
  try {
    const c = makeCanvas(2, 2);
    c.getContext('2d').fillRect(0, 0, 1, 1);
    const b = await canvasToBlob(c, mime, 0.8);
    return b?.type === mime;
  } catch {
    return false;
  }
}
