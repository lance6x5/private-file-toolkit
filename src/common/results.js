/** Result lists: per-file downloads plus "Download all as ZIP". */
import { h, saveBlob, toast } from './ui.js';
import { formatBytes } from '../lib/format.js';

/**
 * Render output files into a container.
 * @param {HTMLElement} container
 * @param {{name:string, blob:Blob, meta?:string, preview?:string}[]} outputs
 * @param {{zipName?:string, zipper?:{call:Function}, heading?:string}} opts
 */
export function renderResults(container, outputs, { zipName = 'fileward.zip', zipper, heading = 'Your files' } = {}) {
  container.hidden = !outputs.length;
  if (!outputs.length) {
    container.replaceChildren();
    return;
  }
  const list = h(
    'ul',
    { class: 'result-list' },
    outputs.map((o) =>
      h(
        'li',
        { class: 'result-item' },
        o.preview ? h('img', { class: 'result-thumb', src: o.preview, alt: '', loading: 'lazy' }) : null,
        h('div', { class: 'result-text' }, h('strong', { class: 'file-name' }, o.name), h('span', { class: 'muted' }, o.meta ?? formatBytes(o.blob.size))),
        h('button', { class: 'btn btn-small', type: 'button', onclick: () => saveBlob(o.blob, o.name) }, 'Download', h('span', { class: 'visually-hidden' }, ` ${o.name}`))
      )
    )
  );
  const actions = h('div', { class: 'actions' });
  if (outputs.length > 1 && zipper) {
    const btn = h('button', { class: 'btn btn-primary', type: 'button' }, `Download all (${outputs.length}) as ZIP`);
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      const old = btn.textContent;
      btn.textContent = 'Building ZIP…';
      try {
        const files = await Promise.all(outputs.map(async (o) => ({ name: o.name, data: new Uint8Array(await o.blob.arrayBuffer()) })));
        const zip = await zipper.call('zip', [files], { onProgress: (p) => (btn.textContent = `Building ZIP… ${Math.round(p * 100)}%`) });
        saveBlob(zip, zipName, 'application/zip');
      } catch (err) {
        toast(err.message, { error: true });
      } finally {
        btn.disabled = false;
        btn.textContent = old;
      }
    });
    actions.append(btn);
  }
  container.replaceChildren(h('h2', { class: 'result-heading', tabindex: '-1' }, heading), list, actions);
  container.querySelector('.result-heading').focus({ preventScroll: false });
}
