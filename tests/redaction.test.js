/**
 * REAL redaction tests. The redacted words must be unrecoverable: not
 * extractable as text (pdf.js), and not present anywhere in the file's
 * decoded streams or objects (pdf-lib), in literal or hex form.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PDFDocument, PDFName, PDFDict, PDFRawStream, StandardFonts, decodePDFRawStream } from 'pdf-lib';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { assembleRedacted, planRedaction, redactionPlan } from '../src/lib/pdf-ops.js';
import { matchBoxes, termsStillPresent } from '../src/lib/redact-geom.js';
import { rasterizePage } from '../src/lib/rasterize.js';
import { encodePng } from './helpers/png.js';
import { SECRET, ACCOUNT } from './helpers/pdf-writer.js';

const sample = () => new Uint8Array(readFileSync(new URL('../test-fixtures/sample.pdf', import.meta.url)));
const STD_FONTS = fileURLToPath(new URL('../node_modules/pdfjs-dist/standard_fonts/', import.meta.url));

const open = (bytes) =>
  getDocument({ data: new Uint8Array(bytes), isEvalSupported: false, standardFontDataUrl: STD_FONTS }).promise;

async function pageTexts(bytes) {
  const doc = await open(bytes);
  const out = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const tc = await (await doc.getPage(i)).getTextContent();
    out.push(tc.items.map((it) => it.str ?? '').join(' '));
  }
  await doc.destroy();
  return out;
}

/** Everything in the file: raw bytes, every object, every decodable stream. */
async function everything(bytes) {
  const parts = [Buffer.from(bytes).toString('latin1')];
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  for (const [, obj] of doc.context.enumerateIndirectObjects()) {
    if (obj instanceof PDFRawStream) {
      parts.push(obj.dict.toString());
      try {
        parts.push(Buffer.from(decodePDFRawStream(obj).decode()).toString('latin1'));
      } catch {
        /* image codecs (DCT) are not text */
      }
    } else {
      parts.push(obj.toString());
    }
  }
  return parts.join('\n');
}

/** Does `text` appear in the file in any common encoding? */
async function leaks(bytes, text) {
  const all = await everything(bytes);
  const hex = Buffer.from(text, 'latin1').toString('hex');
  return all.includes(text) || all.toLowerCase().includes(hex) || all.includes(text.split('').join('\0'));
}

const whitePng = () => new Uint8Array(encodePng(8, 8, () => [255, 255, 255, 255]));

describe('redaction safety (assembly)', () => {
  it('the leak detector itself works: the original contains the secret', async () => {
    expect(await leaks(sample(), SECRET)).toBe(true);
    expect((await pageTexts(sample()))[1]).toContain(SECRET);
  });

  it('a redacted page keeps no text, fonts or metadata; other pages are untouched', async () => {
    const res = await assembleRedacted(sample(), [{ index: 1, bytes: whitePng(), mime: 'image/png', width: 612, height: 792 }], { redacted: [1] });
    expect(res.flattened).toEqual([1]);
    const texts = await pageTexts(res.bytes);
    expect(texts).toHaveLength(3);
    expect(texts[1].trim()).toBe('');
    expect(texts[0]).toContain('PUBLIC-BRAVO');
    expect(texts[2]).toContain('Closing remarks are public.');
    expect(termsStillPresent(texts, [SECRET, ACCOUNT])).toEqual([]);
    expect(await leaks(res.bytes, SECRET)).toBe(false);
    expect(await leaks(res.bytes, ACCOUNT)).toBe(false);
    expect(await leaks(res.bytes, 'CONFIDENTIAL')).toBe(false);
    // Document info from the original is not copied.
    expect(await leaks(res.bytes, 'Fixture Author')).toBe(false);
    const doc = await PDFDocument.load(res.bytes);
    expect(doc.getPage(1).getSize()).toEqual({ width: 612, height: 792 });
    expect(doc.getPage(1).node.Resources().lookup(PDFName.of('Font'))).toBeUndefined();
  });
});

/** Two pages sharing one /Resources dict that holds BOTH pages' Form XObjects. */
async function sharedResourcesPdf() {
  const parts = await PDFDocument.create();
  const f = await parts.embedFont(StandardFonts.Helvetica);
  parts.addPage([300, 300]).drawText('HIDDEN-SHARED-SECRET', { x: 20, y: 150, size: 14, font: f });
  parts.addPage([300, 300]).drawText('VISIBLE-ON-PAGE-TWO', { x: 20, y: 150, size: 14, font: f });
  const doc = await PDFDocument.create();
  const [e1, e2] = await doc.embedPdf(await parts.save(), [0, 1]);
  const a = doc.addPage([300, 300]);
  a.drawPage(e1);
  const b = doc.addPage([300, 300]);
  b.drawPage(e2);
  const resA = a.node.Resources();
  const xoA = resA.lookup(PDFName.of('XObject'), PDFDict);
  const xoB = b.node.Resources().lookup(PDFName.of('XObject'), PDFDict);
  for (const [k, v] of xoB.entries()) xoA.set(k, v);
  const ref = doc.context.register(resA);
  a.node.set(PDFName.of('Resources'), ref);
  b.node.set(PDFName.of('Resources'), ref);
  return new Uint8Array(await doc.save());
}

describe('redaction safety (shared hidden content)', () => {
  it('naive copying of an unredacted page WOULD leak the secret (control)', async () => {
    const src = await PDFDocument.load(await sharedResourcesPdf());
    const out = await PDFDocument.create();
    const [p] = await out.copyPages(src, [1]);
    out.addPage(p);
    expect(await leaks(await out.save(), 'HIDDEN-SHARED-SECRET')).toBe(true);
  });

  it('detects pages that share content with a redacted page', async () => {
    const plan = await redactionPlan(await sharedResourcesPdf(), [0]);
    expect(plan.shared).toEqual([1]);
    expect(plan.rasterize).toEqual([0, 1]);
    const simple = planRedaction(await PDFDocument.load(sample()), [1]);
    expect(simple.shared).toEqual([]);
  });

  it('refuses to save if a sharing page was not flattened, and is clean when it is', async () => {
    const bytes = await sharedResourcesPdf();
    const img = (index) => ({ index, bytes: whitePng(), mime: 'image/png', width: 300, height: 300 });
    await expect(assembleRedacted(bytes, [img(0)], { redacted: [0] })).rejects.toThrow(/safety check/);
    const res = await assembleRedacted(bytes, [img(0), img(1)], { redacted: [0] });
    expect(res.shared).toEqual([1]);
    expect(await leaks(res.bytes, 'HIDDEN-SHARED-SECRET')).toBe(false);
  });
});

let canvasLib = null;
try {
  canvasLib = await import('@napi-rs/canvas');
} catch {
  canvasLib = null;
}

describe('redaction end to end (pdf.js render -> burn boxes -> rebuild -> extract)', () => {
  it.skipIf(!canvasLib)('redacted words are gone from the output and the boxes are black pixels', async () => {
    const src = await open(sample());
    const page = await src.getPage(2);
    const vp = page.getViewport({ scale: 1 });
    const tc = await page.getTextContent();
    const toVp = (x, y) => vp.convertToViewportPoint(x, y);
    const boxes = [...matchBoxes(tc.items, SECRET, toVp, vp.width, vp.height), ...matchBoxes(tc.items, ACCOUNT, toVp, vp.width, vp.height)];
    expect(boxes).toHaveLength(2);

    let centre = null;
    const img = await rasterizePage(page, boxes, {
      scale: 150 / 72,
      createCanvas: (w, h) => canvasLib.createCanvas(w, h),
      onCanvas: (canvas, ctx) => {
        const b = boxes[0];
        const px = ctx.getImageData(Math.round((b.x + b.w / 2) * canvas.width), Math.round((b.y + b.h / 2) * canvas.height), 1, 1).data;
        centre = [...px];
      },
      encode: async (canvas) => ({ bytes: new Uint8Array(canvas.toBuffer('image/png')), mime: 'image/png' })
    });
    await src.destroy();
    expect(centre.slice(0, 3)).toEqual([0, 0, 0]);
    expect(img.width).toBeCloseTo(612, 0);
    expect(img.height).toBeCloseTo(792, 0);

    const res = await assembleRedacted(sample(), [{ index: 1, ...img }], { redacted: [1] });
    const texts = await pageTexts(res.bytes);
    expect(termsStillPresent(texts, [SECRET, ACCOUNT])).toEqual([]);
    expect(texts[1].trim()).toBe('');
    expect(texts[0]).toContain('PUBLIC-BRAVO');
    expect(await leaks(res.bytes, SECRET)).toBe(false);
    expect(await leaks(res.bytes, ACCOUNT)).toBe(false);
  });
});
