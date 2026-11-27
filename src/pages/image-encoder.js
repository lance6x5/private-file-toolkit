/**
 * Encode images in the image worker when it supports OffscreenCanvas,
 * otherwise on the main thread (older Safari). Shared by compress/resize.
 */
import imageWorkerUrl from '../workers/image.worker.js?worker&url';
import { WorkerClient } from '../common/worker-client.js';
import { encodeImage } from '../lib/encode-image.js';

export const imageWorker = new WorkerClient(imageWorkerUrl, 'images');
let offscreen = null;

export async function encode(file, opts) {
  if (offscreen === null) {
    try {
      offscreen = (await imageWorker.call('caps')).offscreen;
    } catch {
      offscreen = false;
    }
  }
  return offscreen ? imageWorker.call('encode', [file, opts], { transfer: false }) : encodeImage(file, opts);
}
