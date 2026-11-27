/**
 * Page-range parsing for Split PDF.
 * Input is 1-based and human friendly ("1-3, 5, 8-"); output is 0-based.
 */

export class PageRangeError extends Error {}

/**
 * Parse a page list such as "1-3, 5, 9-12, 20-" into 0-based page indices,
 * in the order written. Reversed ranges ("5-3") count down.
 * @param {string} text
 * @param {number} pageCount
 * @returns {number[]}
 */
export function parsePageRanges(text, pageCount) {
  if (!Number.isInteger(pageCount) || pageCount < 1) throw new PageRangeError('The PDF has no pages.');
  const src = String(text ?? '').trim();
  if (!src) throw new PageRangeError('Enter the pages to extract, for example 1-3, 5.');
  const out = [];
  for (const raw of src.split(/[,;]+/)) {
    const part = raw.trim().replace(/[–—]/g, '-');
    if (!part) continue;
    const m = /^(\d+)?\s*(-)?\s*(\d+)?$/.exec(part);
    // Valid shapes: "5", "1-3", "8-" and "-4" (= 1-4).
    if (!m || (!m[1] && !m[3]) || (m[1] && m[3] && !m[2])) {
      throw new PageRangeError(`"${raw.trim()}" is not a page number or range.`);
    }
    const start = m[1] ? Number(m[1]) : 1;
    const end = m[2] ? (m[3] ? Number(m[3]) : pageCount) : start;
    for (const n of [start, end]) {
      if (n < 1 || n > pageCount) {
        throw new PageRangeError(`Page ${n} does not exist; this PDF has ${pageCount} page${pageCount === 1 ? '' : 's'}.`);
      }
    }
    const step = end >= start ? 1 : -1;
    for (let n = start; n !== end + step; n += step) out.push(n - 1);
  }
  if (!out.length) throw new PageRangeError('Enter the pages to extract, for example 1-3, 5.');
  return out;
}

/** Split [0..pageCount) into consecutive groups of `size` pages. */
export function chunkPages(pageCount, size) {
  const n = Math.floor(Number(size));
  if (!Number.isFinite(n) || n < 1) throw new PageRangeError('Pages per file must be at least 1.');
  const groups = [];
  for (let i = 0; i < pageCount; i += n) {
    groups.push(Array.from({ length: Math.min(n, pageCount - i) }, (_, k) => i + k));
  }
  return groups;
}

/** Human label for a group of 0-based indices, e.g. [0,1,2] -> "1-3". */
export function groupLabel(indices) {
  if (!indices.length) return '';
  const first = indices[0] + 1;
  const last = indices[indices.length - 1] + 1;
  const contiguous = indices.every((v, i) => i === 0 || v === indices[i - 1] + 1);
  if (contiguous) return first === last ? `${first}` : `${first}-${last}`;
  return 'selection';
}
