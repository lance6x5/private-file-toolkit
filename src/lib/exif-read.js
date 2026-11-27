/**
 * Read photo metadata with exifr and turn it into display rows.
 * Works in the browser and in Node (tests).
 */
import { sniffFormat, webpChunks } from './strip-metadata.js';

export const EXIFR_OPTIONS = {
  tiff: true,
  exif: true,
  gps: true,
  xmp: true,
  iptc: true,
  interop: false,
  ifd1: false,
  makerNote: false,
  userComment: true,
  // Not personal metadata (colour profile, JFIF header, PNG image header):
  icc: false,
  jfif: false,
  ihdr: false,
  mergeOutput: true,
  translateKeys: true,
  translateValues: true,
  reviveValues: true,
  sanitize: true
};

let exifrPromise;
async function getExifr() {
  exifrPromise ??= import('exifr').then((m) => m.default ?? m);
  return exifrPromise;
}

const ascii = (u, s, n) => String.fromCharCode(...u.subarray(s, s + n));

/**
 * Parse metadata from image bytes. Returns null when there is none.
 * exifr does not read WebP, so for WebP we hand it the raw EXIF chunk.
 */
export async function readMetadata(bytes) {
  const exifr = await getExifr();
  const u = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (sniffFormat(u) === 'webp') {
    const chunks = webpChunks(u);
    let out = null;
    const exif = chunks.find((c) => c.type === 'EXIF');
    if (exif) {
      const tiff = ascii(exif.data, 0, 6) === 'Exif\0\0' ? exif.data.subarray(6) : exif.data;
      out = (await exifr.parse(tiff.slice(), EXIFR_OPTIONS).catch(() => null)) ?? {};
    }
    if (chunks.some((c) => c.type === 'XMP ')) out = { ...(out ?? {}), XMP: 'present' };
    return out && Object.keys(out).length ? out : null;
  }
  const out = await exifr.parse(u.slice(), EXIFR_OPTIONS);
  return out && Object.keys(out).length ? out : null;
}

/** 48.8584 -> "48.85840° N". */
export function formatCoord(v, axis) {
  const n = Number(v);
  if (!Number.isFinite(n)) return '–';
  const dir = axis === 'lat' ? (n >= 0 ? 'N' : 'S') : n >= 0 ? 'E' : 'W';
  return `${Math.abs(n).toFixed(5)}° ${dir}`;
}

export function formatValue(v) {
  if (v == null) return '';
  if (v instanceof Date) {
    // EXIF dates have no time zone; exifr reads them as local time, so show local time.
    if (Number.isNaN(v.getTime())) return '';
    const p = (n) => String(n).padStart(2, '0');
    return `${v.getFullYear()}-${p(v.getMonth() + 1)}-${p(v.getDate())} ${p(v.getHours())}:${p(v.getMinutes())}:${p(v.getSeconds())}`;
  }
  if (ArrayBuffer.isView(v)) return `(${v.byteLength} bytes of binary data)`;
  if (Array.isArray(v)) return v.map(formatValue).join(', ');
  if (typeof v === 'object') {
    const s = JSON.stringify(v);
    return s.length > 200 ? `${s.slice(0, 199)}…` : s;
  }
  const s = String(v);
  return s.length > 200 ? `${s.slice(0, 199)}…` : s;
}

const PICK = [
  ['Camera make', ['Make']],
  ['Camera model', ['Model']],
  ['Lens', ['LensModel', 'LensMake']],
  ['Taken', ['DateTimeOriginal', 'CreateDate', 'DateTimeDigitized']],
  ['Modified', ['ModifyDate']],
  ['Software', ['Software', 'CreatorTool']],
  ['Owner / artist', ['Artist', 'OwnerName', 'CameraOwnerName', 'Creator', 'creator', 'By-line']],
  ['Copyright', ['Copyright', 'rights']],
  ['Serial number', ['BodySerialNumber', 'SerialNumber', 'LensSerialNumber']],
  ['Description', ['ImageDescription', 'description', 'Caption-Abstract', 'UserComment']]
];

/**
 * @returns {{gps: null|{latitude:number, longitude:number, altitude:number|null},
 *            rows: [string,string][], all: [string,string][]}}
 */
export function summarize(meta) {
  if (!meta) return { gps: null, rows: [], all: [] };
  const lat = Number(meta.latitude);
  const lon = Number(meta.longitude);
  const gps =
    Number.isFinite(lat) && Number.isFinite(lon)
      ? { latitude: lat, longitude: lon, altitude: Number.isFinite(Number(meta.GPSAltitude)) ? Number(meta.GPSAltitude) : null }
      : null;
  const rows = [];
  for (const [label, keys] of PICK) {
    const key = keys.find((k) => meta[k] != null && formatValue(meta[k]) !== '');
    if (key) rows.push([label, formatValue(meta[key])]);
  }
  if (gps) rows.unshift(['Location', `${formatCoord(gps.latitude, 'lat')}, ${formatCoord(gps.longitude, 'lon')}`]);
  const all = Object.entries(meta)
    .filter(([, v]) => v != null && formatValue(v) !== '')
    .map(([k, v]) => [k, formatValue(v)]);
  return { gps, rows, all };
}
