/**
 * Worker side of the RPC protocol used by src/common/worker-client.js.
 *   in:  { id, op, args }
 *   out: { id, type: 'progress', value } | { id, type: 'done', result } | { id, type: 'error', message, code }
 * Only operations in the given table can be called.
 */
function collect(value, out = new Set()) {
  if (!value || typeof value !== 'object') return out;
  if (value instanceof ArrayBuffer) out.add(value);
  else if (ArrayBuffer.isView(value)) out.add(value.buffer);
  else if (Array.isArray(value)) value.forEach((v) => collect(v, out));
  else if (Object.getPrototypeOf(value) === Object.prototype) Object.values(value).forEach((v) => collect(v, out));
  return out;
}

export function serve(ops) {
  self.onmessage = async (e) => {
    const { id, op, args = [] } = e.data || {};
    const fn = Object.prototype.hasOwnProperty.call(ops, op) ? ops[op] : null;
    if (!fn) {
      self.postMessage({ id, type: 'error', message: `Unknown operation: ${op}` });
      return;
    }
    const onProgress = (value) => self.postMessage({ id, type: 'progress', value });
    try {
      const result = await fn(...args, { onProgress });
      // Blobs are structured-cloned cheaply; buffers are transferred.
      self.postMessage({ id, type: 'done', result }, [...collect(result)]);
    } catch (err) {
      self.postMessage({ id, type: 'error', message: err?.message || String(err), code: err?.code });
    }
  };
}
