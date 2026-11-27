/**
 * Regenerate test fixtures (plain Node, no dependencies):
 *   test-fixtures/sample.pdf     3-page text PDF; page 2 contains fake secrets
 *   test-fixtures/gps-photo.jpg  plain.jpg + FAKE EXIF (camera, date, GPS: Eiffel Tower), XMP, comment
 * test-fixtures/plain.jpg is a small JPEG rendered once with System.Drawing.
 * test-fixtures/sample.heic (optional) is produced in CI with heif-enc.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildTextPdf, SAMPLE_PAGES } from '../tests/helpers/pdf-writer.js';
import { addFakeMetadata } from '../tests/helpers/exif-writer.js';

const dir = fileURLToPath(new URL('../test-fixtures/', import.meta.url));
writeFileSync(`${dir}sample.pdf`, buildTextPdf(SAMPLE_PAGES, { title: 'Fileward sample', author: 'Fixture Author' }));
writeFileSync(`${dir}gps-photo.jpg`, addFakeMetadata(readFileSync(`${dir}plain.jpg`)));
console.log('Fixtures written to', dir);
