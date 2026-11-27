/** Shared pdf-lib worker client for the PDF tools. */
import pdfWorkerUrl from '../workers/pdf-ops.worker.js?worker&url';
import { WorkerClient } from '../common/worker-client.js';

export const pdfWorker = new WorkerClient(pdfWorkerUrl, 'pdf-ops');

/** Start the worker right away so it is cached for offline use. */
export function warmPdfWorker() {
  pdfWorker.ensure();
}
