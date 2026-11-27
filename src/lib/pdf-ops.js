/**
 * PDF processing with pdf-lib. Runs in a Web Worker in the app
 * (src/workers/pdf-ops.worker.js) and directly in Node for tests.
 *
 * Every output document is built with PDFDocument.create(), so document
 * level metadata (title, author, bookmarks, form data, JavaScript) from the
 * source files is never carried over.
 */
import { PDFDocument, PDFName, PDFDict, PDFArray, PDFRef, PDFStream, degrees } from 'pdf-lib';

export class PdfError extends Error {
  constructor(message, code) {
    super(message);
    this.code = code;
  }
}

/** Load a PDF with friendly errors. */
export async function loadPdf(bytes, label = 'This PDF') {
  try {
    return await PDFDocument.load(bytes, { updateMetadata: false });
  } catch (err) {
    if (err?.name === 'EncryptedPDFError' || /encrypt/i.test(err?.message ?? '')) {
      throw new PdfError(`${label} is password-protected. Remove the password in your PDF reader, then try again.`, 'encrypted');
    }
    throw new PdfError(`${label} could not be read. It may be damaged or not a PDF.`, 'invalid');
  }
}

async function newDoc() {
  // updateMetadata: false stops pdf-lib from stamping its own Producer on save.
  const out = await PDFDocument.create({ updateMetadata: false });
  const now = new Date();
  out.setCreationDate(now);
  out.setModificationDate(now);
  out.setProducer('Fileward');
  out.setCreator('Fileward (https://lance6x5.github.io/private-file-toolkit/)');
  return out;
}

const noop = () => {};

/** Page count and sizes (in points) of a PDF. */
export async function pdfInfo(bytes) {
  const doc = await loadPdf(bytes);
  return {
    pageCount: doc.getPageCount(),
    sizes: doc.getPages().map((p) => {
      const { width, height } = p.getSize();
      return { width, height, rotation: p.getRotation().angle };
    })
  };
}

/**
 * Merge PDFs in order.
 * @param {{name:string, bytes:Uint8Array}[]} files
 */
export async function mergePdfs(files, { onProgress = noop } = {}) {
  if (!files?.length) throw new PdfError('Add at least one PDF.', 'empty');
  const out = await newDoc();
  for (let i = 0; i < files.length; i++) {
    const src = await loadPdf(files[i].bytes, files[i].name || `File ${i + 1}`);
    const pages = await out.copyPages(src, src.getPageIndices());
    for (const p of pages) out.addPage(p);
    onProgress((i + 1) / (files.length + 1));
  }
  const bytes = await out.save();
  onProgress(1);
  return bytes;
}

/** Build one PDF from the given 0-based page indices (in that order). */
export async function extractPages(bytes, indices, { onProgress = noop } = {}) {
  const [out] = await splitGroups(bytes, [indices], { onProgress });
  return out;
}

/** Build one PDF per group of 0-based page indices. */
export async function splitGroups(bytes, groups, { onProgress = noop } = {}) {
  const src = await loadPdf(bytes);
  const count = src.getPageCount();
  const results = [];
  for (let g = 0; g < groups.length; g++) {
    const idx = groups[g];
    if (!idx.length) throw new PdfError('A group has no pages.', 'range');
    for (const i of idx) {
      if (!Number.isInteger(i) || i < 0 || i >= count) throw new PdfError(`Page ${i + 1} does not exist.`, 'range');
    }
    const out = await newDoc();
    const pages = await out.copyPages(src, idx);
    for (const p of pages) out.addPage(p);
    results.push(await out.save());
    onProgress((g + 1) / groups.length);
  }
  return results;
}

/**
 * Reorder / rotate / delete pages.
 * @param {Uint8Array} bytes
 * @param {{index:number, rotate?:number}[]} items new page order; omitted pages are deleted.
 *        rotate is extra clockwise rotation in degrees (multiple of 90).
 */
export async function organizePages(bytes, items, { onProgress = noop } = {}) {
  if (!items?.length) throw new PdfError('Keep at least one page.', 'empty');
  const src = await loadPdf(bytes);
  const count = src.getPageCount();
  for (const { index, rotate = 0 } of items) {
    if (!Number.isInteger(index) || index < 0 || index >= count) throw new PdfError(`Page ${index + 1} does not exist.`, 'range');
    if (rotate % 90 !== 0) throw new PdfError('Rotation must be a multiple of 90 degrees.', 'rotate');
  }
  const out = await newDoc();
  const pages = await out.copyPages(src, items.map((it) => it.index));
  pages.forEach((p, k) => {
    const extra = items[k].rotate || 0;
    if (extra) p.setRotation(degrees((((p.getRotation().angle + extra) % 360) + 360) % 360));
    out.addPage(p);
  });
  onProgress(0.9);
  const result = await out.save();
  onProgress(1);
  return result;
}

/* ------------------------------------------------------------------ */
/* Redaction                                                           */
/* ------------------------------------------------------------------ */

const N = (s) => PDFName.of(s);

/**
 * Collect the indirect objects that hold drawable content for a page:
 * its content streams and every Form/Image XObject and tiling pattern
 * reachable through its (possibly inherited) resources. Fonts are not
 * included; they hold glyph shapes, not the page's text.
 * @returns {Set<string>} ref keys like "12 0 R"
 */
export function contentRefs(doc, page) {
  const ctx = doc.context;
  const refs = new Set();
  const visit = (obj) => {
    if (obj instanceof PDFRef) {
      const key = obj.toString();
      if (refs.has(key)) return;
      refs.add(key);
      const target = ctx.lookup(obj);
      if (target instanceof PDFStream) walkResources(target.dict.lookup(N('Resources')));
      else if (target instanceof PDFArray) target.asArray().forEach(visit);
    } else if (obj instanceof PDFArray) {
      obj.asArray().forEach(visit);
    }
  };
  const walkResources = (res) => {
    if (!(res instanceof PDFDict)) return;
    for (const key of ['XObject', 'Pattern']) {
      const dict = res.lookup(N(key));
      if (dict instanceof PDFDict) for (const [, v] of dict.entries()) visit(v);
    }
  };
  visit(page.node.get(N('Contents')));
  walkResources(page.node.Resources());
  return refs;
}

/**
 * Decide which pages must be rasterized: every redacted page, plus any
 * other page that shares content objects (content streams, XObjects,
 * patterns) with a redacted page. Copying such a page unchanged would also
 * copy the redacted page's hidden content into the output file.
 * @param {PDFDocument} doc
 * @param {number[]} redacted 0-based page indices with redaction boxes
 */
export function planRedaction(doc, redacted) {
  const pages = doc.getPages();
  const red = new Set(redacted);
  for (const i of red) {
    if (!Number.isInteger(i) || i < 0 || i >= pages.length) throw new PdfError(`Page ${i + 1} does not exist.`, 'range');
  }
  const sensitive = new Set();
  for (const i of red) for (const r of contentRefs(doc, pages[i])) sensitive.add(r);
  const shared = [];
  pages.forEach((p, i) => {
    if (red.has(i)) return;
    for (const r of contentRefs(doc, p)) {
      if (sensitive.has(r)) {
        shared.push(i);
        return;
      }
    }
  });
  const rasterize = [...new Set([...red, ...shared])].sort((a, b) => a - b);
  return { pageCount: pages.length, rasterize, shared };
}

/** Worker-friendly wrapper: plan from bytes. */
export async function redactionPlan(bytes, redacted) {
  return planRedaction(await loadPdf(bytes), redacted);
}

/** Page-level keys that can reference other pages or hold hidden data. */
const UNSAFE_PAGE_KEYS = ['Annots', 'B', 'Thumb', 'PieceInfo', 'Metadata', 'AA', 'StructParents', 'Trans'];

/**
 * Build the redacted PDF.
 *
 * Pages in `images` are replaced by brand-new pages that contain nothing but
 * the supplied image (the page rendered with the redaction boxes burned in),
 * so no text, fonts or vector content from the original page survive.
 * All other pages are copied, minus annotations/thumbnails/metadata.
 *
 * Safety check: throws if any page that planRedaction() says must be
 * rasterized has no image, so a caller bug cannot leak hidden content.
 *
 * @param {Uint8Array} bytes original PDF
 * @param {{index:number, bytes:Uint8Array, mime:'image/jpeg'|'image/png', width:number, height:number}[]} images
 *        width/height are the output page size in PDF points
 * @param {{redacted:number[], onProgress?:Function}} opts
 */
export async function assembleRedacted(bytes, images, { redacted, onProgress = noop } = {}) {
  const src = await loadPdf(bytes);
  const plan = planRedaction(src, redacted ?? images.map((im) => im.index));
  const byIndex = new Map(images.map((im) => [im.index, im]));
  const missing = plan.rasterize.filter((i) => !byIndex.has(i));
  if (missing.length) {
    throw new PdfError(`Internal safety check failed: page ${missing[0] + 1} must be flattened before saving.`, 'unsafe');
  }
  const pages = src.getPages();
  const keep = [];
  pages.forEach((p, i) => {
    if (byIndex.has(i)) return;
    for (const k of UNSAFE_PAGE_KEYS) p.node.delete(N(k));
    keep.push(i);
  });

  const out = await newDoc();
  const copied = new Map();
  if (keep.length) {
    const cp = await out.copyPages(src, keep);
    keep.forEach((i, k) => copied.set(i, cp[k]));
  }
  for (let i = 0; i < pages.length; i++) {
    const im = byIndex.get(i);
    if (im) {
      if (!(im.width > 0 && im.height > 0)) throw new PdfError('Invalid page size.', 'size');
      const img = im.mime === 'image/png' ? await out.embedPng(im.bytes) : await out.embedJpg(im.bytes);
      const page = out.addPage([im.width, im.height]);
      page.drawImage(img, { x: 0, y: 0, width: im.width, height: im.height });
    } else {
      out.addPage(copied.get(i));
    }
    onProgress((i + 1) / (pages.length + 1));
  }
  const result = await out.save();
  onProgress(1);
  return { bytes: result, flattened: plan.rasterize, shared: plan.shared };
}
