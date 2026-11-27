/**
 * HEIC decoding with libheif (WASM). The fixture is generated in CI with
 * `heif-enc` (see .github/workflows); the test is skipped if it is absent.
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { decodeHeic } from '../src/lib/heic-decode.js';
import { isHeic } from '../src/lib/image-size.js';
import { sniffFormat } from '../src/lib/strip-metadata.js';

const path = fileURLToPath(new URL('../test-fixtures/sample.heic', import.meta.url));
const have = existsSync(path);

describe('HEIC decoder', () => {
  it('recognises HEIC files by name and type', () => {
    expect(isHeic({ name: 'IMG_0001.heic' })).toBe(true);
    expect(isHeic({ name: 'x', type: 'image/heif' })).toBe(true);
  });

  it.skipIf(!have)('decodes the sample HEIC to RGBA pixels', async () => {
    const bytes = new Uint8Array(readFileSync(path));
    expect(sniffFormat(bytes)).toBe('heic');
    const img = await decodeHeic(bytes);
    expect(img.width).toBeGreaterThan(0);
    expect(img.height).toBeGreaterThan(0);
    expect(img.data.length).toBe(img.width * img.height * 4);
    // Not a blank image: some pixel differs from the first one.
    const first = img.data.slice(0, 3).join();
    let varied = false;
    for (let i = 4; i < img.data.length && !varied; i += 4) varied = img.data.slice(i, i + 3).join() !== first;
    expect(varied).toBe(true);
  });

  it('rejects data that is not HEIC', async () => {
    await expect(decodeHeic(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]))).rejects.toThrow();
  });
});
