import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { PDFDocument } from 'pdf-lib';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { pdfInfo, mergePdfs, extractPages, splitGroups, organizePages, loadPdf } from '../src/lib/pdf-ops.js';
import { zipFiles } from '../src/lib/zip.js';
import { fileURLToPath } from 'node:url';
import { SAMPLE_PAGES } from './helpers/pdf-writer.js';

const STD_FONTS = fileURLToPath(new URL('../node_modules/pdfjs-dist/standard_fonts/', import.meta.url));

const sample = () => new Uint8Array(readFileSync(new URL('../test-fixtures/sample.pdf', import.meta.url)));

export async function pageTexts(bytes) {
  const doc = await getDocument({ data: new Uint8Array(bytes), isEvalSupported: false, standardFontDataUrl: STD_FONTS }).promise;
  const out = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const tc = await (await doc.getPage(i)).getTextContent();
    out.push(tc.items.map((it) => it.str ?? '').join(' '));
  }
  await doc.destroy();
  return out;
}

describe('PDF tools (pdf-lib)', () => {
  it('reads the fixture', async () => {
    const info = await pdfInfo(sample());
    expect(info.pageCount).toBe(3);
    expect(info.sizes[0]).toMatchObject({ width: 612, height: 792, rotation: 0 });
    const texts = await pageTexts(sample());
    expect(texts[1]).toContain('SECRET-ALPHA-7731');
  });

  it('merges PDFs in order and drops source document metadata', async () => {
    const progress = [];
    const out = await mergePdfs(
      [
        { name: 'a.pdf', bytes: sample() },
        { name: 'b.pdf', bytes: await extractPages(sample(), [2]) }
      ],
      { onProgress: (p) => progress.push(p) }
    );
    const doc = await PDFDocument.load(out, { updateMetadata: false });
    expect(doc.getPageCount()).toBe(4);
    expect(doc.getTitle()).toBeUndefined();
    expect(doc.getAuthor()).toBeUndefined();
    expect(doc.getProducer()).toBe('Fileward');
    expect(progress.at(-1)).toBe(1);
    const texts = await pageTexts(out);
    expect(texts[0]).toContain(SAMPLE_PAGES[0][0]);
    expect(texts[3]).toContain(SAMPLE_PAGES[2][0]);
  });

  it('extracts ranges and splits into groups', async () => {
    const one = await extractPages(sample(), [2, 0]);
    const texts = await pageTexts(one);
    expect(texts).toHaveLength(2);
    expect(texts[0]).toContain('page 3');
    expect(texts[1]).toContain('page 1');
    const parts = await splitGroups(sample(), [[0], [1], [2]]);
    expect(parts).toHaveLength(3);
    for (const p of parts) expect((await PDFDocument.load(p)).getPageCount()).toBe(1);
    await expect(extractPages(sample(), [5])).rejects.toThrow(/does not exist/);
  });

  it('reorders, rotates and deletes pages losslessly', async () => {
    const out = await organizePages(sample(), [
      { index: 2, rotate: 90 },
      { index: 0, rotate: -90 }
    ]);
    const doc = await PDFDocument.load(out);
    expect(doc.getPageCount()).toBe(2);
    expect(doc.getPage(0).getRotation().angle).toBe(90);
    expect(doc.getPage(1).getRotation().angle).toBe(270);
    const texts = await pageTexts(out);
    expect(texts[0]).toContain('page 3'); // text is still selectable: nothing was rasterized
    await expect(organizePages(sample(), [])).rejects.toThrow(/at least one page/);
    await expect(organizePages(sample(), [{ index: 0, rotate: 45 }])).rejects.toThrow(/multiple of 90/);
  });

  it('gives a friendly error for files that are not PDFs', async () => {
    await expect(loadPdf(new Uint8Array([1, 2, 3]))).rejects.toThrow(/could not be read/);
  });

  it('zips outputs with unique names', async () => {
    const JSZip = (await import('jszip')).default;
    const zip = await zipFiles([
      { name: 'a.pdf', data: new Uint8Array([1]) },
      { name: 'a.pdf', data: new Uint8Array([2]) }
    ]);
    const back = await JSZip.loadAsync(zip);
    expect(Object.keys(back.files).sort()).toEqual(['a (2).pdf', 'a.pdf']);
    expect((await back.file('a (2).pdf').async('uint8array'))[0]).toBe(2);
  });
});
