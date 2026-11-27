/**
 * libheif-js wrapper. Works in a Web Worker and in Node (tests).
 * The "wasm-bundle" build embeds the .wasm file, so nothing is fetched
 * from the network.
 */
let libPromise;

/** Load (and cache) the decoder. Called early so the WASM is ready offline. */
export async function getLib() {
  libPromise ??= (async () => {
    const mod = await import('libheif-js/wasm-bundle');
    let lib = mod.default ?? mod;
    // Depending on the release the export is the module, a factory or a promise.
    if (typeof lib === 'function' && !lib.HeifDecoder) lib = await lib();
    if (lib && typeof lib.then === 'function') lib = await lib;
    if (lib?.ready && typeof lib.ready.then === 'function') await lib.ready;
    if (!lib?.HeifDecoder) throw new Error('The HEIC decoder failed to load.');
    return lib;
  })();
  return libPromise;
}

/**
 * Decode the primary image of a HEIC/HEIF file to RGBA pixels.
 * @param {Uint8Array|ArrayBuffer} bytes
 * @returns {Promise<{data: Uint8ClampedArray, width: number, height: number}>}
 */
export async function decodeHeic(bytes) {
  const lib = await getLib();
  const decoder = new lib.HeifDecoder();
  let images;
  try {
    images = decoder.decode(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
  } catch {
    throw new Error('This file could not be decoded as HEIC.');
  }
  if (!images?.length) throw new Error('This file could not be decoded as HEIC.');
  const image = images[0];
  const width = image.get_width();
  const height = image.get_height();
  const data = await new Promise((resolve, reject) => {
    image.display({ data: new Uint8ClampedArray(width * height * 4), width, height }, (out) => {
      if (!out) reject(new Error('This HEIC variant is not supported by the decoder.'));
      else resolve(out.data);
    });
  });
  for (const im of images) im.free?.();
  return { data, width, height };
}
