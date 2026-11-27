/**
 * Web Worker helpers.
 *
 * Privacy: workers loaded from a normal URL get their CSP from the HTTP
 * response (GitHub Pages sends none), NOT from the page's <meta> CSP. So we
 * start every worker from a tiny blob: module that imports the real worker
 * script. Workers created from blob: URLs inherit the creating page's
 * policy, which means the page's `connect-src 'self'` also applies inside
 * the worker: it physically cannot send data to another site.
 */

/** Start a module worker that inherits this page's Content-Security-Policy. */
export function createGuardedWorker(scriptUrl, name) {
  const abs = new URL(scriptUrl, location.href).href;
  const shim = new Blob([`import ${JSON.stringify(abs)};\n`], { type: 'text/javascript' });
  const blobUrl = URL.createObjectURL(shim);
  try {
    return new Worker(blobUrl, { type: 'module', name });
  } finally {
    // The worker has already resolved its script URL; revoke after it loads.
    setTimeout(() => URL.revokeObjectURL(blobUrl), 30000);
  }
}

/** Collect ArrayBuffers to transfer (zero-copy) from a result/args value. */
export function transferables(value, out = new Set()) {
  if (!value || typeof value !== 'object') return out;
  if (value instanceof ArrayBuffer) out.add(value);
  else if (ArrayBuffer.isView(value)) out.add(value.buffer);
  else if (Array.isArray(value)) value.forEach((v) => transferables(v, out));
  else if (Object.getPrototypeOf(value) === Object.prototype) Object.values(value).forEach((v) => transferables(v, out));
  return out;
}

/**
 * Promise-based RPC over a worker. Worker side: see src/workers/rpc.js.
 */
export class WorkerClient {
  constructor(scriptUrl, name) {
    this.scriptUrl = scriptUrl;
    this.name = name;
    this.nextId = 1;
    this.pending = new Map();
    this.worker = null;
  }

  ensure() {
    if (this.worker) return this.worker;
    this.worker = createGuardedWorker(this.scriptUrl, this.name);
    this.worker.onmessage = (e) => {
      const { id, type } = e.data || {};
      const p = this.pending.get(id);
      if (!p) return;
      if (type === 'progress') p.onProgress?.(e.data.value);
      else {
        this.pending.delete(id);
        if (type === 'done') p.resolve(e.data.result);
        else {
          const err = new Error(e.data.message || 'Processing failed.');
          err.code = e.data.code;
          p.reject(err);
        }
      }
    };
    this.worker.onerror = (e) => {
      e.preventDefault?.();
      const err = new Error('The background processor could not start. Reload the page and try again.');
      for (const p of this.pending.values()) p.reject(err);
      this.pending.clear();
      this.worker?.terminate();
      this.worker = null;
    };
    return this.worker;
  }

  /**
   * @param {string} op operation name
   * @param {any[]} args arguments (ArrayBuffers/typed arrays are transferred)
   * @param {{onProgress?: (v:number)=>void, transfer?: boolean}} [opts]
   */
  call(op, args = [], { onProgress, transfer = true } = {}) {
    const worker = this.ensure();
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject, onProgress });
      const list = transfer ? [...transferables(args)] : [];
      worker.postMessage({ id, op, args }, list);
    });
  }

  terminate() {
    this.worker?.terminate();
    this.worker = null;
    const err = new Error('Cancelled.');
    for (const p of this.pending.values()) p.reject(err);
    this.pending.clear();
  }
}
