/** PDF operations (pdf-lib) and ZIP building, off the main thread. */
import { serve } from './rpc.js';
import {
  pdfInfo, mergePdfs, extractPages, splitGroups, organizePages, redactionPlan, assembleRedacted
} from '../lib/pdf-ops.js';
import { zipFiles } from '../lib/zip.js';

serve({
  info: (bytes) => pdfInfo(bytes),
  merge: (files, opts) => mergePdfs(files, opts),
  extract: (bytes, indices, opts) => extractPages(bytes, indices, opts),
  split: (bytes, groups, opts) => splitGroups(bytes, groups, opts),
  organize: (bytes, items, opts) => organizePages(bytes, items, opts),
  redactionPlan: (bytes, redacted) => redactionPlan(bytes, redacted),
  assembleRedacted: (bytes, images, options, { onProgress }) =>
    assembleRedacted(bytes, images, { ...options, onProgress }),
  zip: (files, opts) => zipFiles(files, opts)
});
