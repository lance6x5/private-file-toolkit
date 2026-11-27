import { APP_VERSION, networkReport } from '../common/boot.js';
import { $, h, toast, saveBlob } from '../common/ui.js';
import { loadPrefs, savePrefs, clearPrefs, exportPrefs, parseImport } from '../lib/prefs.js';

/* ---------------- live network check ---------------- */
function renderNet() {
  const r = networkReport();
  $('#net-total').textContent = String(r.total);
  $('#net-outside').textContent = String(r.outside.length);
  $('#net-blocked').textContent = String(r.blocked.length);
  const list = $('#net-outside-list');
  list.replaceChildren(...r.outside.map((u) => h('li', {}, u)), ...r.blocked.map((b) => h('li', {}, `Blocked by CSP (${b.directive}): ${b.uri}`)));
  list.hidden = !r.outside.length && !r.blocked.length;
  $('#net-verdict').textContent =
    r.outside.length || r.blocked.length
      ? 'Something on this page tried to reach another site. Please report it with the Feedback menu.'
      : 'This page has made no requests to any other website.';
}
renderNet();
setInterval(renderNet, 2000);
window.addEventListener('fileward:netchange', renderNet);

const csp = document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.content;
$('#csp-text').textContent = csp ? csp.replace(/;\s*/g, ';\n') : 'Not present (this is a development build).';

const onlineEl = $('#online-status');
const syncOnline = () => {
  onlineEl.textContent = navigator.onLine
    ? 'You are online. Try turning off Wi-Fi now: every tool keeps working.'
    : 'You are offline, and Fileward still works.';
};
syncOnline();
window.addEventListener('online', syncOnline);
window.addEventListener('offline', syncOnline);

const swEl = $('#sw-status');
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.ready
    .then(() => (swEl.textContent = 'Offline support is installed. Tools you have opened work without a connection.'))
    .catch(() => {});
  swEl.textContent = 'Installing offline support…';
} else {
  swEl.textContent = 'This browser does not support offline mode.';
}

/* ---------------- your data ---------------- */
$('#export-btn').addEventListener('click', () => {
  saveBlob(exportPrefs(loadPrefs(), APP_VERSION), 'fileward-settings.json', 'application/json');
});

const importFile = $('#import-file');
$('#import-btn').addEventListener('click', () => importFile.click());
importFile.addEventListener('change', async () => {
  const f = importFile.files?.[0];
  importFile.value = '';
  if (!f) return;
  try {
    const prefs = parseImport(await f.text());
    savePrefs(prefs);
    toast('Settings imported.');
  } catch (err) {
    toast(err.message, { error: true });
  }
});

const dialog = $('#confirm-dialog');
$('#reset-btn').addEventListener('click', () => dialog.showModal());
dialog.addEventListener('close', async () => {
  if (dialog.returnValue !== 'confirm') return;
  clearPrefs();
  try {
    if ('caches' in window) for (const k of await caches.keys()) await caches.delete(k);
    const regs = (await navigator.serviceWorker?.getRegistrations?.()) ?? [];
    for (const r of regs) await r.unregister();
  } catch {
    /* ignore */
  }
  toast('All Fileward data on this device was deleted. Offline support will reinstall on your next visit.');
});
