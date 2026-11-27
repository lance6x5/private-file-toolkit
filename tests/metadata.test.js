import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { stripMetadata, stripJpeg, stripPng, stripWebp, sniffFormat, webpChunks, UnsupportedFormatError } from '../src/lib/strip-metadata.js';
import { readMetadata, summarize, formatCoord } from '../src/lib/exif-read.js';
import { addFakeMetadata, fakeTiff } from './helpers/exif-writer.js';
import { encodePng, chunk } from './helpers/png.js';

const fixture = (name) => new Uint8Array(readFileSync(new URL(`../test-fixtures/${name}`, import.meta.url)));
const plain = fixture('plain.jpg');
const gpsPhoto = fixture('gps-photo.jpg');

/** Byte range from the first SOS marker to the end: the compressed image data. */
function scanData(u) {
  for (let i = 2; i < u.length - 1; i++) if (u[i] === 0xff && u[i + 1] === 0xda) return Buffer.from(u.subarray(i));
  throw new Error('no SOS');
}

describe('reading metadata (exifr)', () => {
  it('finds the fake GPS location, camera and XMP in the fixture', async () => {
    const meta = await readMetadata(gpsPhoto);
    const s = summarize(meta);
    expect(s.gps).not.toBeNull();
    expect(s.gps.latitude).toBeCloseTo(48.8584, 3);
    expect(s.gps.longitude).toBeCloseTo(2.2945, 3);
    expect(s.gps.altitude).toBe(35);
    expect(meta.Make).toBe('FakeCam');
    expect(meta.Model).toBe('Test Model 1');
    expect(s.rows.map(([k]) => k)).toEqual(expect.arrayContaining(['Location', 'Camera make', 'Camera model', 'Owner / artist']));
    expect(formatCoord(s.gps.latitude, 'lat')).toBe('48.85840° N');
    expect(formatCoord(-73.5, 'lon')).toBe('73.50000° W');
  });

  it('reports nothing for a JPEG without metadata', async () => {
    expect(await readMetadata(plain)).toBeNull();
  });
});

describe('removing metadata', () => {
  it('JPEG: removes EXIF/GPS, XMP and comments without touching image data', async () => {
    const res = stripMetadata(gpsPhoto);
    expect(res.format).toBe('jpeg');
    expect(res.removed).toEqual(expect.arrayContaining(['EXIF (camera, date, GPS)', 'XMP', 'Comment']));
    // Lossless: the compressed scan data is byte-identical...
    expect(scanData(res.bytes).equals(scanData(gpsPhoto))).toBe(true);
    // ...and here the result is exactly the original metadata-free JPEG.
    expect(Buffer.from(res.bytes).equals(Buffer.from(plain))).toBe(true);
    // Verified with an independent reader: no metadata left at all.
    expect(await readMetadata(res.bytes)).toBeNull();
    expect(Buffer.from(res.bytes).includes('FakeCam')).toBe(false);
    expect(Buffer.from(res.bytes).includes('home address')).toBe(false);
  });

  it('JPEG: keeps only the Orientation tag so rotated photos stay upright', async () => {
    const rotated = addFakeMetadata(plain, { orientation: 6 });
    const res = stripJpeg(rotated);
    expect(res.orientation).toBe(6);
    const meta = await readMetadata(res.bytes);
    expect(Object.keys(meta)).toEqual(['Orientation']);
    expect(summarize(meta).gps).toBeNull();
    expect(scanData(res.bytes).equals(scanData(plain))).toBe(true);
  });

  it('JPEG: drops data hidden after the end-of-image marker', () => {
    const withTail = addFakeMetadata(plain, { trailing: Buffer.from('SECOND-IMAGE-WITH-GPS') });
    const res = stripJpeg(withTail);
    expect(res.removed).toContain('Data after end of image');
    expect(Buffer.from(res.bytes).includes('SECOND-IMAGE')).toBe(false);
    expect(res.bytes.at(-2)).toBe(0xff);
    expect(res.bytes.at(-1)).toBe(0xd9);
  });

  it('PNG: removes text, eXIf and time chunks and keeps pixels', async () => {
    const clean = encodePng(3, 2, (x, y) => [x * 80, y * 120, 50, 255]);
    const dirty = encodePng(3, 2, (x, y) => [x * 80, y * 120, 50, 255], [
      chunk('tEXt', Buffer.from('Author\0Jane Example', 'latin1')),
      chunk('iTXt', Buffer.from('XML:com.adobe.xmp\0\0\0\0\0<x:xmpmeta/>', 'latin1')),
      chunk('eXIf', fakeTiff()),
      chunk('tIME', Buffer.from([7, 234, 1, 2, 3, 4, 5]))
    ]);
    const res = stripPng(dirty);
    expect(Buffer.from(res.bytes).equals(clean)).toBe(true);
    expect(res.removed).toEqual(expect.arrayContaining(['Text', 'EXIF', 'Modification time']));
    expect(Buffer.from(res.bytes).includes('Jane Example')).toBe(false);
  });

  it('WebP: removes EXIF and XMP chunks, clears the flags and fixes the RIFF size', async () => {
    const c = (type, data) => {
      const head = Buffer.alloc(8);
      head.write(type, 0, 'latin1');
      head.writeUInt32LE(data.length, 4);
      return Buffer.concat([head, data, data.length & 1 ? Buffer.alloc(1) : Buffer.alloc(0)]);
    };
    const vp8x = Buffer.alloc(10);
    vp8x[0] = 0x08 | 0x04 | 0x10; // EXIF | XMP | alpha
    const body = Buffer.concat([
      c('VP8X', vp8x),
      c('VP8L', Buffer.from([0x2f, 0, 0, 0, 0])),
      c('EXIF', Buffer.concat([Buffer.from('Exif\0\0', 'latin1'), fakeTiff()])),
      c('XMP ', Buffer.from('<x:xmpmeta>Jane</x:xmpmeta>'))
    ]);
    const head = Buffer.alloc(12);
    head.write('RIFF', 0, 'latin1');
    head.writeUInt32LE(body.length + 4, 4);
    head.write('WEBP', 8, 'latin1');
    const webp = new Uint8Array(Buffer.concat([head, body]));

    const before = summarize(await readMetadata(webp));
    expect(before.gps?.latitude).toBeCloseTo(48.8584, 3);

    const res = stripWebp(webp);
    expect(sniffFormat(res.bytes)).toBe('webp');
    expect(webpChunks(res.bytes).map((x) => x.type)).toEqual(['VP8X', 'VP8L']);
    expect(res.bytes[20] & 0x0c).toBe(0);
    expect(res.bytes[20] & 0x10).toBe(0x10);
    expect(new DataView(res.bytes.buffer).getUint32(4, true)).toBe(res.bytes.length - 8);
    expect(await readMetadata(res.bytes)).toBeNull();
  });

  it('refuses unsupported formats with a helpful message', () => {
    const heic = new Uint8Array([0, 0, 0, 24, ...Buffer.from('ftypheic'), 0, 0, 0, 0]);
    expect(sniffFormat(heic)).toBe('heic');
    expect(() => stripMetadata(heic)).toThrow(UnsupportedFormatError);
    expect(() => stripMetadata(heic)).toThrow(/HEIC to JPG/);
    expect(() => stripMetadata(new Uint8Array([1, 2, 3, 4]))).toThrow(/Only JPG, PNG and WebP/);
  });
});
