import { describe, it, expect } from 'vitest';
import { parsePageRanges, chunkPages, groupLabel } from '../src/lib/page-range.js';
import { formatBytes, formatChange, safeName, renameExt, uniqueNames, splitExt } from '../src/lib/format.js';
import { getLimits, checkFiles, isIOS, describeLimits } from '../src/lib/limits.js';
import { targetSize, downscaleSteps, qualityFromPercent, formatOf, isHeic } from '../src/lib/image-size.js';
import { sanitizePrefs, loadPrefs, savePrefs, exportPrefs, parseImport, clearPrefs, DEFAULT_PREFS } from '../src/lib/prefs.js';
import { boxFromPoints, isUsableBox, toPixelRect, matchBoxes, termsStillPresent } from '../src/lib/redact-geom.js';
import { buildIssueUrl, trimEnvironment, REPO_URL } from '../src/common/feedback.js';

describe('page ranges', () => {
  it('parses lists, ranges, open ends and reverse ranges (1-based in, 0-based out)', () => {
    expect(parsePageRanges('1-3, 5', 10)).toEqual([0, 1, 2, 4]);
    expect(parsePageRanges('8-', 10)).toEqual([7, 8, 9]);
    expect(parsePageRanges('-2', 10)).toEqual([0, 1]);
    expect(parsePageRanges('3-1', 10)).toEqual([2, 1, 0]);
    expect(parsePageRanges(' 2 ;4 ', 10)).toEqual([1, 3]);
    expect(parsePageRanges('2–4', 10)).toEqual([1, 2, 3]);
  });
  it('rejects invalid input with friendly messages', () => {
    expect(() => parsePageRanges('', 5)).toThrow(/Enter the pages/);
    expect(() => parsePageRanges('0', 5)).toThrow(/does not exist/);
    expect(() => parsePageRanges('6', 5)).toThrow(/this PDF has 5 pages/);
    expect(() => parsePageRanges('abc', 5)).toThrow(/not a page number/);
    expect(() => parsePageRanges('1 2', 5)).toThrow(/not a page number/);
  });
  it('chunks pages and labels groups', () => {
    expect(chunkPages(5, 2)).toEqual([[0, 1], [2, 3], [4]]);
    expect(chunkPages(3, 1)).toEqual([[0], [1], [2]]);
    expect(() => chunkPages(3, 0)).toThrow();
    expect(groupLabel([0, 1, 2])).toBe('1-3');
    expect(groupLabel([4])).toBe('5');
    expect(groupLabel([0, 4])).toBe('selection');
  });
});

describe('formatting and names', () => {
  it('formats sizes and changes', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5 MB');
    expect(formatChange(1000, 250)).toBe('-75%');
    expect(formatChange(100, 112)).toBe('+12%');
  });
  it('makes safe, unique file names', () => {
    expect(safeName('a/b:c?.pdf')).toBe('a_b_c_.pdf');
    expect(safeName('...')).toBe('file');
    expect(splitExt('photo.final.JPG')).toEqual(['photo.final', '.JPG']);
    expect(renameExt('IMG_0001.HEIC', 'jpg')).toBe('IMG_0001.jpg');
    expect(renameExt('a.png', 'webp', '-compressed')).toBe('a-compressed.webp');
    expect(uniqueNames(['a.jpg', 'A.jpg', 'a.jpg', 'b.jpg'])).toEqual(['a.jpg', 'A (2).jpg', 'a (3).jpg', 'b.jpg']);
  });
});

describe('device limits', () => {
  it('scales with device memory and caps iOS canvases', () => {
    const big = getLimits({ deviceMemory: 8 });
    const small = getLimits({ deviceMemory: 1 });
    expect(big.maxFileBytes).toBeGreaterThan(small.maxFileBytes);
    expect(getLimits({}).assumed).toBe(true);
    expect(getLimits({ deviceMemory: 8, ios: true }).maxMegapixels).toBeLessThanOrEqual(16.7);
    expect(isIOS('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)')).toBe(true);
    expect(isIOS('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 5)).toBe(true);
    expect(isIOS('Mozilla/5.0 (Windows NT 10.0)', 0)).toBe(false);
    expect(describeLimits(small)).toMatch(/per file/);
  });
  it('rejects oversized, unsupported and over-budget files with reasons', () => {
    const limits = getLimits({ deviceMemory: 1 });
    const MB = 1024 * 1024;
    const files = [
      { name: 'ok.pdf', size: 10 * MB },
      { name: 'huge.pdf', size: 61 * MB },
      { name: 'x.txt', size: 1 },
      { name: 'a.pdf', size: 59 * MB },
      { name: 'b.pdf', size: 59 * MB },
      { name: 'c.pdf', size: 59 * MB }
    ];
    const { accepted, rejected } = checkFiles(files, limits, (f) => f.name.endsWith('.pdf'));
    expect(accepted.map((f) => f.name)).toEqual(['ok.pdf', 'a.pdf', 'b.pdf']);
    expect(rejected.map((r) => r.file.name)).toEqual(['huge.pdf', 'x.txt', 'c.pdf']);
    expect(rejected[0].reason).toMatch(/over this device/);
    expect(rejected[1].reason).toMatch(/not a supported file type/);
    expect(rejected[2].reason).toMatch(/batch/);
  });
});

describe('image geometry', () => {
  it('computes target sizes for every mode', () => {
    expect(targetSize(4000, 3000, { mode: 'max', maxDim: 2000 })).toEqual({ width: 2000, height: 1500, capped: false });
    expect(targetSize(1000, 500, { mode: 'max', maxDim: 4000 })).toEqual({ width: 1000, height: 500, capped: false });
    expect(targetSize(1000, 500, { mode: 'percent', percent: 50 })).toMatchObject({ width: 500, height: 250 });
    expect(targetSize(1000, 500, { mode: 'pixels', width: 200 })).toMatchObject({ width: 200, height: 100 });
    expect(targetSize(1000, 500, { mode: 'pixels', height: 100 })).toMatchObject({ width: 200, height: 100 });
    expect(targetSize(1000, 500, { mode: 'pixels', width: 300, height: 300 })).toMatchObject({ width: 300, height: 150 });
    expect(targetSize(1000, 500, { mode: 'pixels', width: 300, height: 300, keepAspect: false })).toMatchObject({ width: 300, height: 300 });
    const capped = targetSize(10000, 10000, { maxPixels: 16e6 });
    expect(capped.capped).toBe(true);
    expect(capped.width * capped.height).toBeLessThanOrEqual(16e6 + 20000);
    expect(() => targetSize(0, 10)).toThrow();
  });
  it('plans halving steps that end at the target', () => {
    const steps = downscaleSteps(4000, 3000, 500, 375);
    expect(steps.at(-1)).toEqual({ width: 500, height: 375 });
    expect(steps.length).toBe(3);
    expect(downscaleSteps(100, 100, 200, 200)).toEqual([{ width: 200, height: 200 }]);
  });
  it('maps formats and qualities', () => {
    expect(formatOf('image/jpeg')).toBe('jpeg');
    expect(formatOf('IMG.JPEG')).toBe('jpeg');
    expect(formatOf('x.webp')).toBe('webp');
    expect(formatOf('x.gif')).toBe(null);
    expect(isHeic({ name: 'IMG_1.HEIC', type: '' })).toBe(true);
    expect(isHeic({ name: 'a.jpg', type: 'image/jpeg' })).toBe(false);
    expect(qualityFromPercent(75)).toBe(0.75);
    expect(qualityFromPercent(500)).toBe(1);
    expect(qualityFromPercent('x')).toBe(0.8);
  });
});

describe('preferences (the only stored data)', () => {
  const mem = () => {
    const m = new Map();
    return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k) };
  };
  it('sanitizes, saves, exports and re-imports', () => {
    const s = mem();
    expect(loadPrefs(s)).toEqual(DEFAULT_PREFS);
    savePrefs({ compressQuality: 60, bogus: 1, redactDpi: 999 }, s);
    expect(loadPrefs(s).compressQuality).toBe(60);
    expect(loadPrefs(s).redactDpi).toBe(150);
    expect(loadPrefs(s)).not.toHaveProperty('bogus');
    const json = exportPrefs(loadPrefs(s), '1.0.0');
    expect(parseImport(json).compressQuality).toBe(60);
    clearPrefs(s);
    expect(loadPrefs(s)).toEqual(DEFAULT_PREFS);
  });
  it('rejects files that are not settings exports', () => {
    expect(() => parseImport('nope')).toThrow(/not valid JSON/);
    expect(() => parseImport('{"kind":"other"}')).toThrow(/not a Fileward settings export/);
    expect(sanitizePrefs(null)).toEqual(DEFAULT_PREFS);
  });
});

describe('redaction geometry', () => {
  it('builds clamped boxes and rounds pixel rects outward', () => {
    expect(boxFromPoints(0.5, 0.6, 0.1, -0.2)).toEqual({ x: 0.1, y: 0, w: 0.4, h: 0.6 });
    expect(isUsableBox({ w: 0.001, h: 0.5 })).toBe(false);
    const r = toPixelRect({ x: 0.1, y: 0.1, w: 0.2, h: 0.2 }, 1001, 1001, 1);
    expect(r.x).toBeLessThanOrEqual(100);
    expect(r.x + r.w).toBeGreaterThanOrEqual(301);
    expect(toPixelRect({ x: 0, y: 0, w: 1, h: 1 }, 50, 40, 3)).toEqual({ x: 0, y: 0, w: 50, h: 40 });
  });
  it('finds every occurrence inside text items and pads the boxes', () => {
    // Identity "viewport" flipped vertically like PDF -> screen (height 800).
    const toVp = (x, y) => [x, 800 - y];
    const items = [{ str: 'Name: Jane Doe, again Jane', transform: [10, 0, 0, 10, 100, 700], width: 260, height: 10 }];
    const boxes = matchBoxes(items, 'jane', toVp, 600, 800);
    expect(boxes).toHaveLength(2);
    const [b] = boxes;
    // "Jane" starts at char 6 of 26 -> x ~ 100 + 6/26*260 = 160
    expect(b.x * 600).toBeLessThan(160);
    expect((b.x + b.w) * 600).toBeGreaterThan(200);
    // covers the glyphs vertically (baseline 700 -> screen y 100; cap height up to y 90)
    expect(b.y * 800).toBeLessThan(90);
    expect((b.y + b.h) * 800).toBeGreaterThan(100);
    expect(matchBoxes(items, '   ', toVp, 600, 800)).toEqual([]);
  });
  it('reports which terms are still present in extracted text', () => {
    expect(termsStillPresent(['hello Jane Doe'], ['jane doe', 'Smith'])).toEqual(['jane doe']);
    expect(termsStillPresent(['J a n e'], ['Jane'])).toEqual(['Jane']);
    expect(termsStillPresent(['nothing here'], ['secret'])).toEqual([]);
  });
});

describe('feedback URLs', () => {
  it('builds a bug report URL with version, tool and environment', () => {
    const url = new URL(buildIssueUrl('bug', { version: '1.0.0', userAgent: 'Mozilla/5.0 (Test) & Co', tool: 'merge-pdf' }));
    expect(`${url.origin}${url.pathname}`).toBe(`${REPO_URL}/issues/new`);
    expect(url.searchParams.get('template')).toBe('bug_report.yml');
    expect(url.searchParams.get('title')).toBe('[Bug]: ');
    expect(url.searchParams.get('version')).toBe('1.0.0');
    expect(url.searchParams.get('tool')).toBe('merge-pdf');
    expect(url.searchParams.get('environment')).toBe('Mozilla/5.0 (Test) & Co');
    expect(buildIssueUrl('bug', { version: '1' })).not.toContain('+');
  });
  it('builds a feature request URL without environment', () => {
    const url = new URL(buildIssueUrl('feature', { version: '1.0.0', userAgent: 'UA' }));
    expect(url.searchParams.get('template')).toBe('feature_request.yml');
    expect(url.searchParams.get('title')).toBe('[Feature]: ');
    expect(url.searchParams.has('environment')).toBe(false);
  });
  it('trims long user agents and rejects unknown kinds', () => {
    expect(trimEnvironment('x'.repeat(500)).length).toBe(160);
    expect(() => buildIssueUrl('nope')).toThrow();
  });
});
