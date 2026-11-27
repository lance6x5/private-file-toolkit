/**
 * File size limits based on device memory.
 *
 * navigator.deviceMemory (Chromium only) reports RAM in GB, rounded and
 * capped at 8. Other browsers do not expose it, so we assume 4 GB.
 * Images are limited by pixel count too, because decoding a photo needs
 * width x height x 4 bytes, and iOS Safari caps canvases at ~16.7 MP.
 */

const TABLE = [
  // [min GB, max MB per file, max MB per batch, max megapixels]
  [8, 500, 1500, 100],
  [4, 250, 750, 64],
  [2, 120, 300, 36],
  [0, 60, 150, 24]
];

export const IOS_CANVAS_MP = 16.7;

/**
 * @param {{deviceMemory?: number, ios?: boolean}} env
 * @returns {{maxFileBytes:number, maxBatchBytes:number, maxMegapixels:number, memoryGB:number, assumed:boolean}}
 */
export function getLimits({ deviceMemory, ios = false } = {}) {
  const assumed = !(Number(deviceMemory) > 0);
  const memoryGB = assumed ? 4 : Number(deviceMemory);
  const [, fileMB, batchMB, mp] = TABLE.find(([gb]) => memoryGB >= gb);
  return {
    memoryGB,
    assumed,
    maxFileBytes: fileMB * 1024 * 1024,
    maxBatchBytes: batchMB * 1024 * 1024,
    maxMegapixels: ios ? Math.min(mp, IOS_CANVAS_MP) : mp
  };
}

/** Detect iOS / iPadOS from a user agent and touch points. */
export function isIOS(userAgent = '', maxTouchPoints = 0) {
  return /iPad|iPhone|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && maxTouchPoints > 1);
}

const mb = (b) => `${Math.round(b / 1048576)} MB`;

/**
 * Split a file list into accepted and rejected (with a friendly reason).
 * @param {{name:string,size:number,type?:string}[]} files
 * @param {ReturnType<typeof getLimits>} limits
 * @param {(f:{name:string,type?:string}) => boolean} [accept]
 * @param {number} [alreadyQueuedBytes] bytes already in the current batch
 */
export function checkFiles(files, limits, accept = () => true, alreadyQueuedBytes = 0) {
  const accepted = [];
  const rejected = [];
  let total = alreadyQueuedBytes;
  for (const f of files) {
    if (!accept(f)) {
      rejected.push({ file: f, reason: `${f.name} is not a supported file type for this tool.` });
    } else if (f.size > limits.maxFileBytes) {
      rejected.push({
        file: f,
        reason: `${f.name} is ${mb(f.size)}, over this device’s limit of ${mb(limits.maxFileBytes)} per file. Try a smaller file or a device with more memory.`
      });
    } else if (total + f.size > limits.maxBatchBytes) {
      rejected.push({
        file: f,
        reason: `${f.name} was skipped: the batch would go over ${mb(limits.maxBatchBytes)} on this device. Process it in another batch.`
      });
    } else {
      total += f.size;
      accepted.push(f);
    }
  }
  return { accepted, rejected };
}

/** Human summary of the limits for the drop zone hint. */
export function describeLimits(limits) {
  return `Up to ${mb(limits.maxFileBytes)} per file and ${mb(limits.maxBatchBytes)} per batch on this device${limits.assumed ? ' (estimated)' : ''}.`;
}
