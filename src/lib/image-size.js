/** Pure geometry and format helpers for image tools. */

export const FORMATS = {
  jpeg: { mime: 'image/jpeg', ext: 'jpg', label: 'JPG', lossy: true, alpha: false },
  png: { mime: 'image/png', ext: 'png', label: 'PNG', lossy: false, alpha: true },
  webp: { mime: 'image/webp', ext: 'webp', label: 'WebP', lossy: true, alpha: true },
  avif: { mime: 'image/avif', ext: 'avif', label: 'AVIF', lossy: true, alpha: true }
};

/** Map a MIME type or file name to a FORMATS key, or null. */
export function formatOf(mimeOrName) {
  const s = String(mimeOrName ?? '').toLowerCase();
  if (/(\.jpe?g|\.jfif|image\/jpeg)$/.test(s)) return 'jpeg';
  if (/(\.png|image\/png)$/.test(s)) return 'png';
  if (/(\.webp|image\/webp)$/.test(s)) return 'webp';
  if (/(\.avif|image\/avif)$/.test(s)) return 'avif';
  return null;
}

/** Is this file (by type or extension) HEIC/HEIF? */
export function isHeic(file) {
  return /image\/hei[cf]/i.test(file?.type ?? '') || /\.(heic|heif)$/i.test(file?.name ?? '');
}

/**
 * Compute output dimensions.
 * @param {number} w source width
 * @param {number} h source height
 * @param {{mode?: 'none'|'max'|'percent'|'pixels', maxDim?: number, percent?: number,
 *          width?: number, height?: number, keepAspect?: boolean, maxPixels?: number}} opts
 * @returns {{width:number, height:number, capped:boolean}}
 */
export function targetSize(w, h, opts = {}) {
  if (!(w > 0 && h > 0)) throw new Error('Image has no size.');
  const { mode = 'none', maxDim, percent, width, height, keepAspect = true, maxPixels } = opts;
  let tw = w;
  let th = h;
  if (mode === 'max' && maxDim > 0) {
    const s = Math.min(1, maxDim / Math.max(w, h));
    tw = w * s;
    th = h * s;
  } else if (mode === 'percent' && percent > 0) {
    tw = (w * percent) / 100;
    th = (h * percent) / 100;
  } else if (mode === 'pixels') {
    const W = Number(width) > 0 ? Number(width) : 0;
    const H = Number(height) > 0 ? Number(height) : 0;
    if (W && H && !keepAspect) {
      tw = W;
      th = H;
    } else if (W && H) {
      const s = Math.min(W / w, H / h); // fit inside the box
      tw = w * s;
      th = h * s;
    } else if (W) {
      tw = W;
      th = keepAspect ? (h * W) / w : h;
    } else if (H) {
      th = H;
      tw = keepAspect ? (w * H) / h : w;
    }
  }
  let capped = false;
  if (maxPixels > 0 && tw * th > maxPixels) {
    const s = Math.sqrt(maxPixels / (tw * th));
    tw *= s;
    th *= s;
    capped = true;
  }
  return { width: Math.max(1, Math.round(tw)), height: Math.max(1, Math.round(th)), capped };
}

/**
 * Plan a high-quality downscale as a series of halving steps (each step at
 * most 2x smaller), which avoids the aliasing of a single big drawImage.
 * @returns {{width:number,height:number}[]} sizes to draw, ending at the target
 */
export function downscaleSteps(w, h, tw, th) {
  const steps = [];
  let cw = w;
  let ch = h;
  while (cw / 2 > tw && ch / 2 > th) {
    cw = Math.round(cw / 2);
    ch = Math.round(ch / 2);
    steps.push({ width: cw, height: ch });
  }
  steps.push({ width: tw, height: th });
  return steps;
}

/** Clamp a 1-100 slider value to a 0.01-1 encoder quality. */
export function qualityFromPercent(p) {
  const n = Number(p);
  if (!Number.isFinite(n)) return 0.8;
  return Math.min(1, Math.max(0.01, n / 100));
}
