/**
 * User preferences (last-used settings), stored in localStorage.
 * This is the only user data Fileward keeps: files are never stored.
 */
export const PREFS_KEY = 'fileward:prefs';
export const EXPORT_KIND = 'fileward-settings';

export const DEFAULT_PREFS = Object.freeze({
  compressQuality: 75,
  compressMaxDim: 0,
  compressFormat: 'same',
  resizeFormat: 'webp',
  resizeQuality: 85,
  heicQuality: 90,
  redactDpi: 150
});

const int = (lo, hi) => (v) => Number.isInteger(v) && v >= lo && v <= hi;
const RULES = {
  compressQuality: int(1, 100),
  compressMaxDim: int(0, 20000),
  compressFormat: (v) => ['same', 'jpeg', 'webp', 'png'].includes(v),
  resizeFormat: (v) => ['jpeg', 'png', 'webp', 'avif'].includes(v),
  resizeQuality: int(1, 100),
  heicQuality: int(1, 100),
  redactDpi: (v) => [100, 150, 200, 300].includes(v)
};

/** Keep only known keys with valid values; fill the rest from defaults. */
export function sanitizePrefs(input) {
  const out = { ...DEFAULT_PREFS };
  if (input && typeof input === 'object') {
    for (const [k, ok] of Object.entries(RULES)) {
      if (Object.prototype.hasOwnProperty.call(input, k) && ok(input[k])) out[k] = input[k];
    }
  }
  return out;
}

export function loadPrefs(storage = globalThis.localStorage) {
  try {
    return sanitizePrefs(JSON.parse(storage?.getItem(PREFS_KEY) ?? 'null'));
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export function savePrefs(patch, storage = globalThis.localStorage) {
  const next = sanitizePrefs({ ...loadPrefs(storage), ...patch });
  try {
    storage?.setItem(PREFS_KEY, JSON.stringify(next));
  } catch {
    /* storage full or disabled: settings just won't persist */
  }
  return next;
}

export function clearPrefs(storage = globalThis.localStorage) {
  try {
    storage?.removeItem(PREFS_KEY);
  } catch {
    /* ignore */
  }
}

/** JSON export envelope. */
export function exportPrefs(prefs, version) {
  return JSON.stringify(
    { kind: EXPORT_KIND, version, exportedAt: new Date().toISOString(), prefs: sanitizePrefs(prefs) },
    null,
    2
  );
}

/** Parse an exported settings file. Throws a friendly error if it isn't one. */
export function parseImport(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('That file is not valid JSON.');
  }
  if (!data || data.kind !== EXPORT_KIND || !data.prefs || typeof data.prefs !== 'object') {
    throw new Error('That file is not a Fileward settings export.');
  }
  return sanitizePrefs(data.prefs);
}
