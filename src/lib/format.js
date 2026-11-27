/** Small formatting and naming helpers shared by all tools. */

/** 1536 -> "1.5 KB". Uses 1024-based units, like most file managers. */
export function formatBytes(bytes) {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n < 0) return '–';
  if (n < 1024) return `${n} B`;
  const units = ['KB', 'MB', 'GB'];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v >= 100 ? Math.round(v) : v.toFixed(1).replace(/\.0$/, '')} ${units[i]}`;
}

/** Percent change from before to after, e.g. (1000, 250) -> -75. */
export function percentChange(before, after) {
  if (!before) return 0;
  return Math.round(((after - before) / before) * 100);
}

/** "-75%" / "+12%" / "0%". */
export function formatChange(before, after) {
  const p = percentChange(before, after);
  return p > 0 ? `+${p}%` : `${p}%`;
}

/** Strip characters that are unsafe in file names on common platforms. */
export function safeName(name, fallback = 'file') {
  const cleaned = String(name ?? '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x1f<>:"/\\|?*]+/g, '_')
    .replace(/^[.\s]+|[.\s]+$/g, '')
    .slice(0, 180);
  return cleaned || fallback;
}

/** Split "photo.final.JPG" into ["photo.final", ".JPG"]. */
export function splitExt(name) {
  const s = String(name ?? '');
  const i = s.lastIndexOf('.');
  return i > 0 ? [s.slice(0, i), s.slice(i)] : [s, ''];
}

/** Replace the extension and optionally add a suffix: ("a.heic", "jpg") -> "a.jpg". */
export function renameExt(name, ext, suffix = '') {
  const [stem] = splitExt(safeName(name));
  return `${stem}${suffix}.${String(ext).replace(/^\./, '')}`;
}

/**
 * Make names unique for a ZIP: ["a.jpg", "a.jpg"] -> ["a.jpg", "a (2).jpg"].
 * Comparison is case-insensitive because Windows/macOS file systems are.
 */
export function uniqueNames(names) {
  const seen = new Set();
  return names.map((n) => {
    const name = safeName(n);
    let candidate = name;
    let k = 1;
    while (seen.has(candidate.toLowerCase())) {
      k += 1;
      const [stem, ext] = splitExt(name);
      candidate = `${stem} (${k})${ext}`;
    }
    seen.add(candidate.toLowerCase());
    return candidate;
  });
}
