/** Image encode / metadata strip / ZIP, off the main thread. */
import { serve } from './rpc.js';
import { encodeImage, hasOffscreen2d } from '../lib/encode-image.js';
import { stripMetadata } from '../lib/strip-metadata.js';
import { zipFiles } from '../lib/zip.js';

serve({
  caps: () => ({ offscreen: hasOffscreen2d() }),
  encode: (blob, opts) => encodeImage(blob, opts),
  strip: (bytes) => stripMetadata(bytes),
  zip: (files, opts) => zipFiles(files, opts)
});
