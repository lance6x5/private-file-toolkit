/** Shared UI helpers: drop zone, toasts, downloads, progress, DOM. */
import { getLimits, isIOS, checkFiles, describeLimits } from '../lib/limits.js';

export const $ = (sel, root = document) => root.querySelector(sel);

/** Tiny element builder: h('button', {class: 'btn', onclick}, 'Text'). */
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

let toastTimer;
/** Show a short status message (also announced to screen readers). */
export function toast(message, { error = false, ms = 5000 } = {}) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = message;
  el.classList.toggle('toast-error', error);
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), ms);
}

/** Download a Blob or bytes as a file. Uses an object URL; nothing is uploaded. */
export function saveBlob(data, name, type = 'application/octet-stream') {
  const blob = data instanceof Blob ? data : new Blob([data], { type });
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: name, hidden: true });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

/** Device-based size limits (computed once). */
export const limits = getLimits({
  deviceMemory: navigator.deviceMemory,
  ios: isIOS(navigator.userAgent, navigator.maxTouchPoints)
});

/**
 * Progress bar + label controller for a <div class="progress"> element.
 */
export function progress(el) {
  const bar = el.querySelector('progress');
  const label = el.querySelector('.progress-label');
  return {
    start(text) {
      el.hidden = false;
      bar.removeAttribute('value');
      label.textContent = text;
    },
    set(fraction, text) {
      el.hidden = false;
      bar.value = Math.max(0, Math.min(1, fraction));
      if (text) label.textContent = text;
    },
    done(text = 'Done.') {
      bar.value = 1;
      label.textContent = text;
    },
    hide() {
      el.hidden = true;
    }
  };
}

/** Progress markup for a tool panel. */
export function progressEl() {
  return h(
    'div',
    { class: 'progress', hidden: true },
    h('progress', { max: '1', 'aria-label': 'Progress' }),
    h('p', { class: 'progress-label', role: 'status', 'aria-live': 'polite' })
  );
}

/**
 * Wire a drop zone: drag-and-drop, click/keyboard to open the file picker,
 * and (optionally) paste images from the clipboard anywhere on the page.
 *
 * @param {HTMLElement} zone element with class "dropzone" containing an <input type=file>
 * @param {{accept:(f:File)=>boolean, onFiles:(files:File[])=>void, paste?:boolean,
 *          queuedBytes?:()=>number}} opts
 */
export function dropzone(zone, { accept, onFiles, paste = false, queuedBytes = () => 0 }) {
  const input = zone.querySelector('input[type=file]');
  const hint = zone.querySelector('.dz-limits');
  if (hint) hint.textContent = describeLimits(limits);

  const handle = (list) => {
    const files = [...list];
    if (!files.length) return;
    const { accepted, rejected } = checkFiles(files, limits, accept, queuedBytes());
    renderRejections(zone, rejected);
    if (accepted.length) onFiles(accepted);
  };

  input.addEventListener('change', () => {
    handle(input.files);
    input.value = '';
  });
  zone.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    zone.classList.add('dragging');
  });
  zone.addEventListener('dragleave', (e) => {
    if (!zone.contains(e.relatedTarget)) zone.classList.remove('dragging');
  });
  zone.addEventListener('drop', (e) => {
    e.preventDefault();
    zone.classList.remove('dragging');
    handle(e.dataTransfer.files);
  });
  // Dropping a file outside the zone should not navigate away from the page.
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', (e) => e.preventDefault());

  if (paste) {
    document.addEventListener('paste', (e) => {
      const t = e.target;
      if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement) return;
      const files = [...(e.clipboardData?.files ?? [])];
      if (!files.length) return;
      e.preventDefault();
      // Pasted screenshots are usually named "image.png"; give them a better name.
      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
      const named = files.map((f, i) =>
        /^image\.\w+$/.test(f.name)
          ? new File([f], `pasted-${stamp}${files.length > 1 ? `-${i + 1}` : ''}.${f.type.split('/')[1] || 'png'}`, { type: f.type })
          : f
      );
      toast(`Pasted ${named.length} image${named.length === 1 ? '' : 's'}.`);
      handle(named);
    });
  }
}

function renderRejections(zone, rejected) {
  let box = zone.parentElement.querySelector('.dz-errors');
  if (!box) {
    box = h('ul', { class: 'dz-errors', role: 'alert' });
    zone.after(box);
  }
  box.replaceChildren(...rejected.map((r) => h('li', {}, r.reason)));
  box.hidden = !rejected.length;
}

/** Read a File into a Uint8Array. */
export async function readBytes(file) {
  return new Uint8Array(await file.arrayBuffer());
}

/** Accept helpers. */
export const acceptPdf = (f) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name);

/** Move an item inside an array (returns a new array). */
export function moveItem(arr, from, to) {
  const copy = arr.slice();
  if (from < 0 || from >= copy.length || to < 0 || to >= copy.length) return copy;
  const [it] = copy.splice(from, 1);
  copy.splice(to, 0, it);
  return copy;
}

/**
 * Make the children of a list sortable by drag-and-drop (mouse) while
 * keyboard/touch users use the explicit move buttons each item renders.
 * @param {HTMLElement} list container whose children carry data-index
 * @param {(from:number, to:number) => void} onMove
 */
export function sortable(list, onMove) {
  let from = null;
  list.addEventListener('dragstart', (e) => {
    const item = e.target.closest('[data-index]');
    if (!item) return;
    from = Number(item.dataset.index);
    item.classList.add('drag-source');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(from));
  });
  list.addEventListener('dragover', (e) => {
    if (from == null) return;
    e.preventDefault();
    e.stopPropagation();
    const item = e.target.closest('[data-index]');
    list.querySelectorAll('.drop-target').forEach((n) => n.classList.remove('drop-target'));
    item?.classList.add('drop-target');
  });
  list.addEventListener('drop', (e) => {
    if (from == null) return;
    e.preventDefault();
    e.stopPropagation();
    const item = e.target.closest('[data-index]');
    const to = item ? Number(item.dataset.index) : null;
    const f = from;
    from = null;
    if (to != null && to !== f) onMove(f, to);
  });
  list.addEventListener('dragend', () => {
    from = null;
    list.querySelectorAll('.drag-source, .drop-target').forEach((n) => n.classList.remove('drag-source', 'drop-target'));
  });
}
