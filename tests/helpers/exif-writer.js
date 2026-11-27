/**
 * Minimal EXIF (TIFF) writer used to build test fixtures with FAKE camera
 * and GPS data. No dependencies, so scripts/make-fixtures.mjs can run in
 * plain Node.
 */

const TYPES = { BYTE: 1, ASCII: 2, SHORT: 3, LONG: 4, RATIONAL: 5 };
const SIZES = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8 };

function encode(type, value) {
  const t = TYPES[type];
  let count;
  let bytes;
  if (type === 'ASCII') {
    const s = Buffer.from(`${value}\0`, 'latin1');
    count = s.length;
    bytes = s;
  } else {
    const vals = Array.isArray(value) ? value : [value];
    count = vals.length;
    bytes = Buffer.alloc(count * SIZES[t]);
    vals.forEach((v, i) => {
      if (type === 'BYTE') bytes.writeUInt8(v, i);
      else if (type === 'SHORT') bytes.writeUInt16LE(v, i * 2);
      else if (type === 'LONG') bytes.writeUInt32LE(v, i * 4);
      else if (type === 'RATIONAL') {
        bytes.writeUInt32LE(v[0], i * 8);
        bytes.writeUInt32LE(v[1], i * 8 + 4);
      }
    });
  }
  return { t, count, bytes };
}

/** Size of an IFD including its out-of-line data (padded to even). */
function ifdSize(entries) {
  let data = 0;
  for (const e of entries) {
    const { bytes } = encode(e.type, e.value);
    if (bytes.length > 4) data += bytes.length + (bytes.length & 1);
  }
  return 2 + entries.length * 12 + 4 + data;
}

function writeIfd(buf, offset, entries) {
  const sorted = entries.slice().sort((a, b) => a.tag - b.tag);
  buf.writeUInt16LE(sorted.length, offset);
  let dataOff = offset + 2 + sorted.length * 12 + 4;
  sorted.forEach((e, i) => {
    const p = offset + 2 + i * 12;
    const { t, count, bytes } = encode(e.type, e.value);
    buf.writeUInt16LE(e.tag, p);
    buf.writeUInt16LE(t, p + 2);
    buf.writeUInt32LE(count, p + 4);
    if (bytes.length <= 4) {
      bytes.copy(buf, p + 8);
    } else {
      buf.writeUInt32LE(dataOff, p + 8);
      bytes.copy(buf, dataOff);
      dataOff += bytes.length + (bytes.length & 1);
    }
  });
  buf.writeUInt32LE(0, offset + 2 + sorted.length * 12); // no next IFD
}

/**
 * @param {{ifd0: object[], exif?: object[], gps?: object[]}} spec entries: {tag, type, value}
 * @returns {Buffer} little-endian TIFF block
 */
export function buildTiff({ ifd0, exif = [], gps = [] }) {
  const main = ifd0.slice();
  if (exif.length) main.push({ tag: 0x8769, type: 'LONG', value: 0 });
  if (gps.length) main.push({ tag: 0x8825, type: 'LONG', value: 0 });
  const off0 = 8;
  const offExif = off0 + ifdSize(main);
  const offGps = offExif + (exif.length ? ifdSize(exif) : 0);
  for (const e of main) {
    if (e.tag === 0x8769) e.value = offExif;
    if (e.tag === 0x8825) e.value = offGps;
  }
  const total = offGps + (gps.length ? ifdSize(gps) : 0);
  const buf = Buffer.alloc(total);
  buf.write('II', 0, 'latin1');
  buf.writeUInt16LE(42, 2);
  buf.writeUInt32LE(off0, 4);
  writeIfd(buf, off0, main);
  if (exif.length) writeIfd(buf, offExif, exif);
  if (gps.length) writeIfd(buf, offGps, gps);
  return buf;
}

/** Degrees -> EXIF [deg, min, sec] rationals. */
export function dms(decimal) {
  const a = Math.abs(decimal);
  const d = Math.floor(a);
  const mFloat = (a - d) * 60;
  const m = Math.floor(mFloat);
  const s = Math.round((mFloat - m) * 60 * 10000);
  return [
    [d, 1],
    [m, 1],
    [s, 10000]
  ];
}

/** The FAKE metadata used by test-fixtures/gps-photo.jpg. */
export function fakeTiff({ orientation = 1, lat = 48.8584, lon = 2.2945 } = {}) {
  return buildTiff({
    ifd0: [
      { tag: 0x010f, type: 'ASCII', value: 'FakeCam' },
      { tag: 0x0110, type: 'ASCII', value: 'Test Model 1' },
      { tag: 0x0112, type: 'SHORT', value: orientation },
      { tag: 0x0131, type: 'ASCII', value: 'Fixture Writer 1.0' },
      { tag: 0x0132, type: 'ASCII', value: '2026:01:02 03:04:05' },
      { tag: 0x013b, type: 'ASCII', value: 'Test Person' }
    ],
    exif: [{ tag: 0x9003, type: 'ASCII', value: '2026:01:02 03:04:05' }],
    gps: [
      { tag: 0x0000, type: 'BYTE', value: [2, 3, 0, 0] },
      { tag: 0x0001, type: 'ASCII', value: lat >= 0 ? 'N' : 'S' },
      { tag: 0x0002, type: 'RATIONAL', value: dms(lat) },
      { tag: 0x0003, type: 'ASCII', value: lon >= 0 ? 'E' : 'W' },
      { tag: 0x0004, type: 'RATIONAL', value: dms(lon) },
      { tag: 0x0005, type: 'BYTE', value: 0 },
      { tag: 0x0006, type: 'RATIONAL', value: [[35, 1]] }
    ]
  });
}

function segment(marker, payload) {
  const len = payload.length + 2;
  return Buffer.concat([Buffer.from([0xff, marker, len >> 8, len & 0xff]), payload]);
}

export const FAKE_XMP = `<?xpacket begin="" id="W5M0MpCehiHzreSzNTczkc9d"?><x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description rdf:about="" xmlns:xmp="http://ns.adobe.com/xap/1.0/" xmp:CreatorTool="FakeCam Editor"/></rdf:RDF></x:xmpmeta><?xpacket end="w"?>`;

/**
 * Insert fake EXIF (with GPS), XMP and a comment into a plain JPEG, right
 * after its JFIF APP0 segment. Optionally append trailing bytes after EOI.
 */
export function addFakeMetadata(jpeg, { orientation = 1, trailing = null } = {}) {
  const src = Buffer.from(jpeg);
  let insertAt = 2;
  if (src[2] === 0xff && src[3] === 0xe0) insertAt = 4 + ((src[4] << 8) | src[5]);
  const exif = segment(0xe1, Buffer.concat([Buffer.from('Exif\0\0', 'latin1'), fakeTiff({ orientation })]));
  const xmp = segment(0xe1, Buffer.concat([Buffer.from('http://ns.adobe.com/xap/1.0/\0', 'latin1'), Buffer.from(FAKE_XMP, 'utf8')]));
  const com = segment(0xfe, Buffer.from('Secret comment: home address', 'latin1'));
  const parts = [src.subarray(0, insertAt), exif, xmp, com, src.subarray(insertAt)];
  if (trailing) parts.push(Buffer.from(trailing));
  return Buffer.concat(parts);
}
