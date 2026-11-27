/**
 * Lossless metadata removal for JPEG, PNG and WebP.
 *
 * The image data itself is copied byte-for-byte; only metadata containers
 * are cut out, so there is no re-compression and no quality loss.
 *
 * JPEG: drops APP1 (EXIF incl. GPS, XMP), APP13 (IPTC/Photoshop), COM
 *       comments, APP0 JFXX thumbnails, APP2 except ICC colour profiles,
 *       other APPn except Adobe APP14 (needed to decode CMYK colours), and
 *       anything after the end-of-image marker (e.g. iPhone multi-picture
 *       data, which can carry its own EXIF). If the photo was rotated via
 *       the EXIF Orientation tag, a minimal EXIF block containing ONLY that
 *       tag is written back so the photo still displays upright.
 * PNG:  drops tEXt, zTXt, iTXt, eXIf and tIME chunks.
 * WebP: drops EXIF and XMP chunks and clears their VP8X flags.
 */

export class UnsupportedFormatError extends Error {}

const ascii = (u, start, len) => String.fromCharCode(...u.subarray(start, start + len));
const startsWith = (u, s) => u.length >= s.length && ascii(u, 0, s.length) === s;

function toU8(input) {
  if (input instanceof Uint8Array) return input;
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  if (ArrayBuffer.isView(input)) return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
  throw new TypeError('Expected bytes');
}

function concat(parts) {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

/** Identify an image by its magic bytes. */
export function sniffFormat(input) {
  const u = toU8(input);
  if (u.length >= 3 && u[0] === 0xff && u[1] === 0xd8 && u[2] === 0xff) return 'jpeg';
  if (u.length >= 8 && u[0] === 0x89 && ascii(u, 1, 3) === 'PNG') return 'png';
  if (u.length >= 12 && ascii(u, 0, 4) === 'RIFF' && ascii(u, 8, 4) === 'WEBP') return 'webp';
  if (u.length >= 12 && ascii(u, 4, 4) === 'ftyp') {
    const brand = ascii(u, 8, 4);
    if (/^(heic|heix|hevc|hevx|heim|heis|mif1|msf1)$/.test(brand)) return 'heic';
    if (/^avi[fs]$/.test(brand)) return 'avif';
  }
  if (u.length >= 4 && ascii(u, 0, 3) === 'GIF') return 'gif';
  if (u.length >= 4 && (ascii(u, 0, 4) === 'II*\0' || ascii(u, 0, 4) === 'MM\0*')) return 'tiff';
  return null;
}

/* ----------------------------- JPEG ----------------------------- */

/** Read the Orientation tag (0x0112) from a TIFF block; returns 1-8 or null. */
export function readTiffOrientation(tiff) {
  if (tiff.length < 8) return null;
  const order = ascii(tiff, 0, 2);
  if (order !== 'II' && order !== 'MM') return null;
  const le = order === 'II';
  const dv = new DataView(tiff.buffer, tiff.byteOffset, tiff.byteLength);
  const u16 = (o) => dv.getUint16(o, le);
  const u32 = (o) => dv.getUint32(o, le);
  if (u16(2) !== 42) return null;
  const ifd = u32(4);
  if (ifd + 2 > tiff.length) return null;
  const count = u16(ifd);
  for (let k = 0; k < count; k++) {
    const e = ifd + 2 + k * 12;
    if (e + 12 > tiff.length) return null;
    if (u16(e) === 0x0112) {
      const v = u16(e + 8);
      return v >= 1 && v <= 8 ? v : null;
    }
  }
  return null;
}

/** A minimal APP1 EXIF segment containing only the Orientation tag. */
export function orientationSegment(orientation) {
  const payload = [
    ...[0x45, 0x78, 0x69, 0x66, 0, 0], // "Exif\0\0"
    ...[0x4d, 0x4d, 0x00, 0x2a, 0, 0, 0, 8], // big-endian TIFF header, IFD0 at 8
    0, 1, // one entry
    0x01, 0x12, 0, 3, 0, 0, 0, 1, 0, orientation, 0, 0, // Orientation SHORT = n
    0, 0, 0, 0 // no next IFD
  ];
  const len = payload.length + 2;
  return new Uint8Array([0xff, 0xe1, len >> 8, len & 0xff, ...payload]);
}

function labelForApp(marker, payload) {
  if (marker === 0xe1) {
    if (startsWith(payload, 'Exif\0')) return 'EXIF (camera, date, GPS)';
    if (startsWith(payload, 'http://ns.adobe.com/xap/')) return 'XMP';
    return 'APP1 metadata';
  }
  if (marker === 0xe0) return 'JFIF extension / thumbnail';
  if (marker === 0xe2) return startsWith(payload, 'MPF\0') ? 'Multi-picture data' : 'APP2 metadata';
  if (marker === 0xed) return 'IPTC / Photoshop';
  return `APP${marker - 0xe0} metadata`;
}

export function stripJpeg(input) {
  const u = toU8(input);
  if (!(u[0] === 0xff && u[1] === 0xd8)) throw new Error('Not a JPEG file.');
  const kept = [];
  const removed = new Set();
  let orientation = 1;
  let i = 2;
  let ended = false;
  while (i < u.length - 1) {
    if (u[i] !== 0xff) throw new Error('This JPEG looks damaged and cannot be cleaned safely.');
    while (u[i + 1] === 0xff && i < u.length - 2) i += 1; // fill bytes
    const marker = u[i + 1];
    if (marker === 0xd9) {
      kept.push(u.subarray(i, i + 2));
      i += 2;
      ended = true;
      break;
    }
    if ((marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      kept.push(u.subarray(i, i + 2));
      i += 2;
      continue;
    }
    if (i + 4 > u.length) throw new Error('This JPEG is truncated.');
    const len = (u[i + 2] << 8) | u[i + 3];
    if (len < 2 || i + 2 + len > u.length) throw new Error('This JPEG is truncated.');
    const seg = u.subarray(i, i + 2 + len);
    const payload = u.subarray(i + 4, i + 2 + len);
    let keep = true;
    if (marker >= 0xe0 && marker <= 0xef) {
      if (marker === 0xe0) keep = startsWith(payload, 'JFIF\0');
      else if (marker === 0xe2) keep = startsWith(payload, 'ICC_PROFILE\0');
      else if (marker === 0xee) keep = startsWith(payload, 'Adobe');
      else keep = false;
      if (marker === 0xe1 && startsWith(payload, 'Exif\0')) {
        orientation = readTiffOrientation(payload.subarray(6)) ?? orientation;
      }
      if (!keep) removed.add(labelForApp(marker, payload));
    } else if (marker === 0xfe) {
      keep = false;
      removed.add('Comment');
    }
    if (keep) kept.push({ marker, seg });
    i += 2 + len;
    if (marker === 0xda) {
      // Entropy-coded scan data runs until the next real marker.
      let j = i;
      while (j < u.length) {
        if (u[j] === 0xff) {
          const n = u[j + 1];
          if (n === 0x00 || (n >= 0xd0 && n <= 0xd7)) {
            j += 2;
            continue;
          }
          break;
        }
        j += 1;
      }
      kept.push(u.subarray(i, j));
      i = j;
    }
  }
  if (ended && i < u.length) removed.add('Data after end of image');

  // Re-assemble: SOI, JFIF APP0 (if any), orientation-only EXIF, the rest.
  const parts = [u.subarray(0, 2)];
  let k = 0;
  if (kept[0]?.marker === 0xe0) {
    parts.push(kept[0].seg);
    k = 1;
  }
  if (orientation !== 1) parts.push(orientationSegment(orientation));
  for (; k < kept.length; k++) parts.push(kept[k].seg ?? kept[k]);
  return { format: 'jpeg', bytes: concat(parts), removed: [...removed], orientation };
}

/* ------------------------------ PNG ----------------------------- */

const PNG_METADATA = new Set(['tEXt', 'zTXt', 'iTXt', 'eXIf', 'tIME']);
const PNG_LABEL = { tEXt: 'Text', zTXt: 'Text', iTXt: 'Text / XMP', eXIf: 'EXIF', tIME: 'Modification time' };

export function stripPng(input) {
  const u = toU8(input);
  if (sniffFormat(u) !== 'png') throw new Error('Not a PNG file.');
  const dv = new DataView(u.buffer, u.byteOffset, u.byteLength);
  const parts = [u.subarray(0, 8)];
  const removed = new Set();
  let i = 8;
  while (i + 12 <= u.length) {
    const len = dv.getUint32(i);
    const type = ascii(u, i + 4, 4);
    const end = i + 12 + len;
    if (end > u.length) throw new Error('This PNG is truncated.');
    if (PNG_METADATA.has(type)) removed.add(PNG_LABEL[type]);
    else parts.push(u.subarray(i, end));
    i = end;
    if (type === 'IEND') break;
  }
  if (i < u.length) removed.add('Data after end of image');
  return { format: 'png', bytes: concat(parts), removed: [...removed], orientation: 1 };
}

/* ----------------------------- WebP ----------------------------- */

/** List the RIFF chunks of a WebP file: [{type, data}]. */
export function webpChunks(input) {
  const u = toU8(input);
  if (sniffFormat(u) !== 'webp') return [];
  const dv = new DataView(u.buffer, u.byteOffset, u.byteLength);
  const riffEnd = Math.min(u.length, 8 + dv.getUint32(4, true));
  const out = [];
  let i = 12;
  while (i + 8 <= riffEnd) {
    const size = dv.getUint32(i + 4, true);
    out.push({ type: ascii(u, i, 4), data: u.subarray(i + 8, Math.min(riffEnd, i + 8 + size)) });
    i += 8 + size + (size & 1);
  }
  return out;
}

export function stripWebp(input) {
  const u = toU8(input);
  if (sniffFormat(u) !== 'webp') throw new Error('Not a WebP file.');
  const dv = new DataView(u.buffer, u.byteOffset, u.byteLength);
  const riffEnd = Math.min(u.length, 8 + dv.getUint32(4, true));
  const parts = [];
  const removed = new Set();
  let i = 12;
  while (i + 8 <= riffEnd) {
    const type = ascii(u, i, 4);
    const size = dv.getUint32(i + 4, true);
    const end = i + 8 + size + (size & 1);
    if (i + 8 + size > riffEnd) throw new Error('This WebP is truncated.');
    if (type === 'EXIF' || type === 'XMP ') {
      removed.add(type === 'EXIF' ? 'EXIF (camera, date, GPS)' : 'XMP');
    } else if (type === 'VP8X') {
      const chunk = u.slice(i, Math.min(end, riffEnd));
      chunk[8] &= ~(0x08 | 0x04); // clear EXIF and XMP flags
      parts.push(chunk);
    } else {
      parts.push(u.subarray(i, Math.min(end, riffEnd)));
    }
    i = end;
  }
  const body = concat(parts);
  const header = new Uint8Array(12);
  header.set([0x52, 0x49, 0x46, 0x46]); // RIFF
  new DataView(header.buffer).setUint32(4, body.length + 4, true);
  header.set([0x57, 0x45, 0x42, 0x50], 8); // WEBP
  return { format: 'webp', bytes: concat([header, body]), removed: [...removed], orientation: 1 };
}

/**
 * Strip metadata from a supported image.
 * @returns {{format:string, bytes:Uint8Array, removed:string[], orientation:number}}
 */
export function stripMetadata(input) {
  const u = toU8(input);
  const fmt = sniffFormat(u);
  if (fmt === 'jpeg') return stripJpeg(u);
  if (fmt === 'png') return stripPng(u);
  if (fmt === 'webp') return stripWebp(u);
  if (fmt === 'heic') {
    throw new UnsupportedFormatError('HEIC photos cannot be cleaned in place. Convert them with HEIC to JPG, which never copies metadata.');
  }
  throw new UnsupportedFormatError('Only JPG, PNG and WebP images can be cleaned.');
}
