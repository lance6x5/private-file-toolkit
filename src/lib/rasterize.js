/**
 * Rasterize one PDF page with its redaction boxes burned into the pixels.
 * Environment-agnostic: the browser passes <canvas> helpers, tests pass
 * @napi-rs/canvas, so the exact same code path is tested in Node.
 */
import { toPixelRect } from './redact-geom.js';

/** Paint normalized boxes solid black onto a 2D context. */
export function burnBoxes(ctx, boxes, width, height, pad = 1) {
  ctx.save();
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = '#000000';
  for (const b of boxes ?? []) {
    const r = toPixelRect(b, width, height, pad);
    ctx.fillRect(r.x, r.y, r.w, r.h);
  }
  ctx.restore();
}

/**
 * @param {*} page pdf.js page proxy
 * @param {{x:number,y:number,w:number,h:number}[]} boxes normalized to the displayed page
 * @param {{scale:number,
 *          createCanvas:(w:number,h:number)=>any,
 *          encode:(canvas:any)=>Promise<{bytes:Uint8Array, mime:string}>,
 *          onCanvas?:(canvas:any, ctx:any)=>void}} opts
 * @returns {Promise<{bytes:Uint8Array, mime:string, width:number, height:number}>}
 *          width/height are the new page size in PDF points
 */
export async function rasterizePage(page, boxes, { scale, createCanvas, encode, onCanvas }) {
  const viewport = page.getViewport({ scale });
  const w = Math.ceil(viewport.width);
  const h = Math.ceil(viewport.height);
  const canvas = createCanvas(w, h);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  // annotationMode 1 (ENABLE): annotation and form-field appearances are
  // painted into the pixels too, since they will not exist as objects.
  await page.render({ canvasContext: ctx, canvas, viewport, annotationMode: 1 }).promise;
  burnBoxes(ctx, boxes, w, h, Math.max(1, Math.ceil(scale)));
  onCanvas?.(canvas, ctx);
  const { bytes, mime } = await encode(canvas);
  return { bytes, mime, width: viewport.width / scale, height: viewport.height / scale };
}
