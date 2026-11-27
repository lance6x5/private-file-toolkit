/**
 * Pure geometry for the redaction tool.
 *
 * Boxes are stored normalized to the displayed page (0..1 in both axes,
 * origin top-left, page rotation already applied), so the same box can be
 * drawn on the on-screen preview and on the high-resolution render.
 */

const clamp01 = (v) => Math.min(1, Math.max(0, v));

/** Box from two corner points (any order), clamped to the page. */
export function boxFromPoints(x0, y0, x1, y1) {
  const ax = clamp01(Math.min(x0, x1));
  const ay = clamp01(Math.min(y0, y1));
  const bx = clamp01(Math.max(x0, x1));
  const by = clamp01(Math.max(y0, y1));
  return { x: ax, y: ay, w: bx - ax, h: by - ay };
}

/** Ignore accidental clicks: boxes smaller than ~0.4% of the page. */
export function isUsableBox(b, min = 0.004) {
  return b.w >= min && b.h >= min;
}

/**
 * Convert a normalized box to whole device pixels, rounding OUTWARD and
 * adding padding, so a box never covers less than the user selected.
 */
export function toPixelRect(b, width, height, pad = 1) {
  const x0 = Math.max(0, Math.floor(b.x * width) - pad);
  const y0 = Math.max(0, Math.floor(b.y * height) - pad);
  const x1 = Math.min(width, Math.ceil((b.x + b.w) * width) + pad);
  const y1 = Math.min(height, Math.ceil((b.y + b.h) * height) + pad);
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

const norm = (s) => String(s ?? '').replace(/\s+/g, ' ').toLowerCase();

/**
 * Find a search term inside pdf.js text items and return normalized boxes.
 * Matching is case-insensitive and within one text item (usually a line or
 * word run). Character positions are estimated proportionally, so boxes are
 * padded generously: over-redacting a little is safer than missing a letter.
 *
 * @param {{str:string, transform:number[], width:number, height:number}[]} items
 * @param {string} query
 * @param {(x:number, y:number) => [number, number]} toViewport PDF point -> viewport px
 * @param {number} vw viewport width (px)
 * @param {number} vh viewport height (px)
 * @returns {{x:number,y:number,w:number,h:number}[]}
 */
export function matchBoxes(items, query, toViewport, vw, vh) {
  const q = norm(query).trim();
  if (!q) return [];
  const boxes = [];
  for (const it of items) {
    const text = norm(it.str);
    if (!text || !it.transform) continue;
    const [a, b, c, d, e, f] = it.transform;
    const fontH = Math.hypot(c, d) || it.height || 10;
    const ulen = Math.hypot(a, b) || 1;
    const ux = a / ulen;
    const uy = b / ulen;
    // "up" is perpendicular to the baseline
    const vx = -uy;
    const vy = ux;
    const total = it.width || ulen * text.length * 0.5;
    let from = text.indexOf(q);
    while (from !== -1) {
      const s0 = (from / text.length) * total - fontH * 0.15;
      const s1 = ((from + q.length) / text.length) * total + fontH * 0.15;
      const t0 = -fontH * 0.3;
      const t1 = fontH * 1.05;
      const pts = [
        [s0, t0],
        [s1, t0],
        [s0, t1],
        [s1, t1]
      ].map(([s, t]) => toViewport(e + ux * s + vx * t, f + uy * s + vy * t));
      const xs = pts.map((p) => p[0]);
      const ys = pts.map((p) => p[1]);
      boxes.push(boxFromPoints(Math.min(...xs) / vw, Math.min(...ys) / vh, Math.max(...xs) / vw, Math.max(...ys) / vh));
      from = text.indexOf(q, from + q.length);
    }
  }
  return boxes;
}

/** Which of the search terms still appear in a page's extracted text? */
export function termsStillPresent(pageTexts, terms) {
  const joined = pageTexts.map((t) => norm(t)).join('\n');
  const compact = joined.replace(/\s+/g, '');
  return terms.filter((term) => {
    const q = norm(term).trim();
    return q && (joined.includes(q) || compact.includes(q.replace(/\s+/g, '')));
  });
}
