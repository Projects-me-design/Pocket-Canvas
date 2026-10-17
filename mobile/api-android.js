/* Pocket-Canvas for Android — the same `window.api` the desktop app gets from preload.js,
 * built on Capacitor's native plugins instead of Electron.
 * Copyright (c) 2026 project-tech-me <project-tech-me@protonmail.com>
 *
 * Where things live on the phone:
 *   <app files>/Pocket-Canvas/pocket-canvas-data.json   your boards
 *   <app files>/Pocket-Canvas/assets/                   pictures, files, audio and video
 *   <app files>/Pocket-Canvas/settings.json             this phone's settings (never synced)
 *
 * Sync works exactly like the desktop app: a folder that a sync app (for example Syncthing)
 * keeps the same on every device. This phone writes devices/<id>.json in it and reads the others'.
 */
'use strict';

(function () {
  const Cap = window.Capacitor;
  if (!Cap || !Cap.isNativePlatform || !Cap.isNativePlatform()) return; // not running inside the Android app
  const P = Cap.Plugins;
  const FS = P.Filesystem;
  const VERSION = '__VERSION__';
  const FOLDER_NAME = 'Pocket-Canvas Sync';
  const POLL_MS = 5000;
  const ASSET_POLL_MS = 20000;

  // ---------- small helpers ----------
  const listeners = {};
  const on = (ch) => (fn) => { (listeners[ch] = listeners[ch] || []).push(fn); };
  const emit = (ch, payload) => (listeners[ch] || []).forEach((fn) => { try { fn(payload); } catch (e) { console.error(e); } });
  // join path parts, keeping the "file://" at the start intact
  const join = (...parts) => {
    const s = parts.join('/');
    const pre = (/^[a-z]+:\/\//i.exec(s) || [''])[0];
    return pre + s.slice(pre.length).replace(/\/{2,}/g, '/');
  };
  const fileUri = (p) => (p.startsWith('file://') ? p : 'file://' + p);
  const rand = (n = 8) => [...crypto.getRandomValues(new Uint8Array(n))].map((b) => b.toString(16).padStart(2, '0')).join('');
  const extOf = (name) => ((/\.[a-z0-9]{1,8}$/i.exec(name || '') || ['.bin'])[0]).toLowerCase();
  const newAssetId = (name) => rand(8) + extOf(name);

  async function readText(uri) {
    try { return (await FS.readFile({ path: uri, encoding: 'utf8' })).data; } catch { return null; }
  }
  async function writeText(uri, text) { await FS.writeFile({ path: uri, data: text, encoding: 'utf8', recursive: true }); }
  async function writeB64(uri, b64) { await FS.writeFile({ path: uri, data: b64, recursive: true }); }
  async function exists(uri) { try { await FS.stat({ path: uri }); return true; } catch { return false; } }
  async function mkdir(uri) { try { await FS.mkdir({ path: uri, recursive: true }); } catch { /* already there */ } }
  async function list(uri) { try { return (await FS.readdir({ path: uri })).files.map((f) => (typeof f === 'string' ? { name: f } : f)); } catch { return []; } }
  async function remove(uri) { try { await FS.deleteFile({ path: uri }); } catch {} }
  async function rename(from, to) { await remove(to); await FS.rename({ from, to }); }
  async function copy(from, to) { await FS.copy({ from, to }); }
  const toB64 = (bytes) => {
    const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    let s = '';
    for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
    return btoa(s);
  };
  const fileToB64 = (file) => new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] || '');
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });

  // ---------- places ----------
  let ROOT = null, ASSETS = null, DATA = null, SETTINGS_FILE = null;
  const ready = (async () => {
    const base = (await FS.getUri({ directory: 'DATA', path: '' })).uri;
    ROOT = join(base, 'Pocket-Canvas');
    ASSETS = join(ROOT, 'assets');
    DATA = join(ROOT, 'pocket-canvas-data.json');
    SETTINGS_FILE = join(ROOT, 'settings.json');
    await mkdir(ASSETS);
    await loadSettings();
  })();

  // ---------- settings (this phone only) ----------
  let settings = null;
  async function loadSettings() {
    let saved = {};
    try { saved = JSON.parse(await readText(SETTINGS_FILE)) || {}; } catch {}
    settings = {
      deviceId: rand(8), deviceName: 'Android device', userName: 'Me', linkPreviews: true,
      ...saved, sync: { folder: null, ...(saved.sync || {}) }
    };
    await saveSettings();
  }
  const saveSettings = () => writeText(SETTINGS_FILE, JSON.stringify(settings, null, 1));

  // ---------- "All files access", needed to read the folder your sync app fills ----------
  const Access = P.AllFilesAccess;
  async function haveFolderAccess() {
    try { return !!(await Access.check()).granted; } catch { return true; }
  }
  async function askFolderAccess() {
    if (await haveFolderAccess()) {
      try { await FS.requestPermissions(); } catch {}
      return true;
    }
    const ok = await window.api.confirm('Allow Pocket-Canvas to use your sync folder?',
      'Android will open a settings page. Turn on “Allow access to manage all files” for Pocket-Canvas, then come back. ' +
      'Pocket-Canvas only reads and writes its own sync folder.');
    if (!ok) return false;
    await Access.request();
    // wait until the person comes back from the settings page
    await new Promise((resolve) => {
      let done = false;
      const finish = () => { if (!done) { done = true; resolve(); } };
      try { P.App.addListener('resume', finish); } catch {}
      setTimeout(finish, 120000);
    });
    return haveFolderAccess();
  }

  // ---------- sync through a shared folder (same layout as the desktop app) ----------
  const sync = {
    seen: new Map(), devices: new Map(), timer: null, assetTimer: null, pushing: false, pulling: false,
    latest: null, pendingWrite: false,
    state: { ok: true, error: null, lastWrite: null, lastRead: null },
    get folder() { return settings && settings.sync.folder; },
    get enabled() { return !!this.folder; },
    devicesDir() { return join(fileUri(this.folder), 'devices'); },
    assetsDir() { return join(fileUri(this.folder), 'assets'); },
    ownFile() { return join(this.devicesDir(), settings.deviceId + '.json'); },

    async enable(chosen) {
      const clean = chosen.replace(/^file:\/\//, '').replace(/\/+$/, '');
      const dir = clean.split('/').pop() === FOLDER_NAME ? clean : clean + '/' + FOLDER_NAME;
      const d = fileUri(dir);
      await mkdir(join(d, 'devices')); await mkdir(join(d, 'assets'));
      const probe = join(d, '.write-test');
      await writeText(probe, 'ok'); await remove(probe);
      if (!(await exists(join(d, 'README.txt')))) {
        await writeText(join(d, 'README.txt'), 'This folder is used by Pocket-Canvas to keep your boards the same on all your devices.\n\n  devices/   one file per device\n  assets/    your pictures, files, audio and video\n\nPlease don’t edit or move these files.\n');
      }
      settings.sync = { folder: dir }; await saveSettings();
      this.seen.clear();
      if (this.latest) await this.writeOwn(this.latest);
      this.start();
      return dir;
    },
    async disable() {
      this.stop();
      settings.sync = { folder: null }; await saveSettings();
      this.devices.clear(); this.seen.clear();
      this.emitStatus();
    },
    start() {
      this.stop();
      if (!this.enabled) return;
      this.timer = setInterval(() => this.poll(), POLL_MS);
      this.assetTimer = setInterval(() => this.pullAssets(), ASSET_POLL_MS);
      this.poll(); this.pullAssets();
    },
    stop() { clearInterval(this.timer); clearInterval(this.assetTimer); this.timer = this.assetTimer = null; },
    async folderOk() {
      if (!this.enabled) return false;
      if (!(await exists(this.devicesDir()))) {
        this.state.ok = false;
        this.state.error = (await haveFolderAccess())
          ? 'The sync folder can’t be found. Is your sync app running?'
          : 'Pocket-Canvas needs “All files access” to use the sync folder. Choose the folder again to allow it.';
        return false;
      }
      return true;
    },
    async writeOwn(json) {
      this.latest = json;
      if (!(await this.folderOk())) { this.pendingWrite = true; this.emitStatus(); return; }
      this.pendingWrite = false;
      try {
        const doc = { format: 1, app: 'Pocket-Canvas', deviceId: settings.deviceId, deviceName: settings.deviceName, savedAt: Date.now(), state: PCSync.syncState(JSON.parse(json)) };
        const file = this.ownFile();
        const tmp = join(this.devicesDir(), '.' + settings.deviceId + '.json.tmp');
        await writeText(tmp, JSON.stringify(doc));
        await rename(tmp, file);
        this.state.ok = true; this.state.error = null; this.state.lastWrite = Date.now();
        this.pushAssets();
      } catch (err) {
        this.pendingWrite = true;
        this.state.ok = false; this.state.error = 'Couldn’t write to the sync folder: ' + (err.message || err);
      }
      this.emitStatus();
    },
    async poll() {
      if (this.polling) return;
      this.polling = true;
      try {
        if (!(await this.folderOk())) { this.emitStatus(); return; }
        if (this.pendingWrite && this.latest) await this.writeOwn(this.latest);
        for (const f of await list(this.devicesDir())) {
          const name = f.name;
          if (!name.endsWith('.json') || name.startsWith('.')) continue;
          const file = join(this.devicesDir(), name);
          let st;
          try { st = await FS.stat({ path: file }); } catch { continue; }
          const key = st.mtime + ':' + st.size;
          if (this.seen.get(name) === key) continue;
          let doc;
          try { doc = JSON.parse(await readText(file)); } catch { continue; } // still arriving
          this.seen.set(name, key);
          if (!doc || doc.app !== 'Pocket-Canvas' || !doc.state || !doc.state.boards) continue;
          if (doc.deviceId === settings.deviceId) continue;
          this.devices.set(doc.deviceId, { id: doc.deviceId, name: doc.deviceName || 'Another device', savedAt: doc.savedAt });
          this.state.lastRead = Date.now();
          await this.pullAssets();
          emit('sync:incoming', { deviceId: doc.deviceId, deviceName: doc.deviceName, savedAt: doc.savedAt, state: doc.state });
        }
        this.state.ok = true; this.state.error = null;
        this.emitStatus();
      } finally { this.polling = false; }
    },
    async pushAssets() {
      if (this.pushing || !this.enabled) return;
      this.pushing = true;
      try {
        const there = new Set((await list(this.assetsDir())).map((f) => f.name));
        for (const f of await list(ASSETS)) {
          if (there.has(f.name) || f.name.startsWith('.')) continue;
          const tmp = join(this.assetsDir(), '.' + f.name + '.tmp');
          await copy(join(ASSETS, f.name), tmp);
          await rename(tmp, join(this.assetsDir(), f.name));
        }
      } catch {} finally { this.pushing = false; }
    },
    async pullAssets() {
      if (this.pulling || !this.enabled) return;
      this.pulling = true;
      try {
        const here = new Set((await list(ASSETS)).map((f) => f.name));
        let got = 0;
        for (const f of await list(this.assetsDir())) {
          if (here.has(f.name) || f.name.startsWith('.')) continue;
          const tmp = join(ASSETS, '.' + f.name + '.tmp');
          await copy(join(this.assetsDir(), f.name), tmp);
          await rename(tmp, join(ASSETS, f.name));
          got++;
        }
        if (got) emit('assets:arrived', got);
      } catch {} finally { this.pulling = false; }
    },
    status() {
      return {
        enabled: this.enabled, folder: this.folder, ok: this.state.ok, error: this.state.error,
        lastWrite: this.state.lastWrite, lastRead: this.state.lastRead,
        devices: [...this.devices.values()].sort((a, b) => b.savedAt - a.savedAt)
      };
    },
    emitStatus() { emit('sync:status', this.status()); }
  };

  // ---------- link previews (the phone fetches the page itself, like the desktop app) ----------
  const Http = P.CapacitorHttp;
  const UA = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36 Pocket-Canvas';
  const decode = (s) => { const t = document.createElement('textarea'); t.innerHTML = String(s || ''); return t.value.replace(/\s+/g, ' ').trim(); };
  function parseHtml(html, baseUrl) {
    const doc = new DOMParser().parseFromString(String(html).slice(0, 400000), 'text/html');
    const meta = {};
    doc.querySelectorAll('meta').forEach((m) => {
      const k = (m.getAttribute('property') || m.getAttribute('name') || m.getAttribute('itemprop') || '').toLowerCase();
      if (k && m.getAttribute('content') != null && !(k in meta)) meta[k] = m.getAttribute('content');
    });
    let icon = null;
    doc.querySelectorAll('link[rel][href]').forEach((l) => { if (!icon && /(^|\s)(icon|apple-touch-icon)(\s|$)/i.test(l.getAttribute('rel'))) icon = l.getAttribute('href'); });
    const abs = (u) => { try { return u ? new URL(u, baseUrl).href : null; } catch { return null; } };
    return {
      title: decode(meta['og:title'] || meta['twitter:title'] || (doc.querySelector('title') || {}).textContent || ''),
      description: decode(meta['og:description'] || meta['twitter:description'] || meta.description || '').slice(0, 400),
      siteName: decode(meta['og:site_name'] || ''),
      image: abs(meta['og:image:secure_url'] || meta['og:image'] || meta['og:image:url'] || meta['twitter:image']),
      icon: abs(icon) || abs('/favicon.ico')
    };
  }
  async function download(url, maxBytes) {
    try {
      const r = await Http.request({ url, method: 'GET', responseType: 'blob', headers: { 'User-Agent': UA }, connectTimeout: 8000, readTimeout: 15000 });
      const type = String((r.headers && (r.headers['Content-Type'] || r.headers['content-type'])) || '').split(';')[0].toLowerCase();
      if (r.status >= 400 || !/^image\//.test(type) || typeof r.data !== 'string' || r.data.length * 0.75 > maxBytes) return null;
      const ext = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/gif': '.gif', 'image/webp': '.webp', 'image/svg+xml': '.svg', 'image/x-icon': '.ico', 'image/vnd.microsoft.icon': '.ico', 'image/avif': '.avif' }[type] || extOf(new URL(url).pathname);
      const id = rand(8) + ext;
      await writeB64(join(ASSETS, id), r.data);
      return id;
    } catch { return null; }
  }
  async function linkPreview(url) {
    if (!settings.linkPreviews || !/^https?:\/\//i.test(url)) return null;
    try {
      const r = await Http.request({ url, method: 'GET', responseType: 'text', headers: { 'User-Agent': UA, Accept: 'text/html,*/*;q=0.5' }, connectTimeout: 8000, readTimeout: 10000 });
      if (r.status >= 400) return { error: 'The website answered ' + r.status };
      const p = parseHtml(r.data, r.url || url);
      const [image, icon] = await Promise.all([p.image ? download(p.image, 8 << 20) : null, p.icon ? download(p.icon, 300 << 10) : null]);
      return { title: p.title, description: p.description, siteName: p.siteName, image, icon };
    } catch (err) { return { error: String(err.message || err) }; }
  }

  // ---------- choosing files with the phone's file picker ----------
  function chooseFiles(accept, multiple) {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file'; input.accept = accept || ''; input.multiple = !!multiple;
      input.style.display = 'none';
      let settled = false;
      const done = (files) => { if (settled) return; settled = true; input.remove(); resolve(files); };
      input.addEventListener('change', () => done([...input.files]));
      input.addEventListener('cancel', () => done([]));
      document.body.appendChild(input);
      input.click();
    });
  }
  async function shareFile(uri, title) {
    try { await P.Share.share({ title, files: [uri], dialogTitle: title }); return true; } catch { return false; }
  }

  // ---------- the API ----------
  window.api = {
    platform: 'android',
    load: async () => {
      await ready;
      for (const f of [DATA, DATA + '.bak']) {
        const t = await readText(f);
        if (t) { try { sync.latest = t; return JSON.parse(t); } catch {} }
      }
      return null;
    },
    save: async (json) => {
      await ready;
      const tmp = DATA + '.tmp';
      if (await exists(DATA)) { try { await copy(DATA, DATA + '.bak'); } catch {} }
      await writeText(tmp, json);
      await rename(tmp, DATA);
      sync.latest = json;
      if (sync.enabled) sync.writeOwn(json);
      return true;
    },
    ready: async () => { await ready; if (sync.enabled) { sync.seen.clear(); sync.start(); } sync.emitStatus(); return true; },

    assetBase: async () => { await ready; return Cap.convertFileSrc(ASSETS + '/'); },
    saveBytes: async (name, bytes) => { const id = newAssetId(name); await writeB64(join(ASSETS, id), toB64(bytes)); return id; },
    pickFiles: async (kind) => {
      const accept = kind === 'image' || kind === 'image-one' ? 'image/*' : kind === 'media' ? 'audio/*,video/*' : '';
      const files = await chooseFiles(accept, kind !== 'image-one');
      const out = [];
      for (const f of files) {
        const id = newAssetId(f.name);
        await writeB64(join(ASSETS, id), await fileToB64(f));
        out.push({ id, name: f.name, size: f.size });
      }
      return out;
    },
    openAsset: (id) => shareFile(join(ASSETS, String(id).split('/').pop()), 'Open with…'),
    saveAssetAs: (id, name) => shareFile(join(ASSETS, String(id).split('/').pop()), name || 'Save'),

    openLink: async (url) => { if (/^https?:\/\//i.test(url)) { try { await P.Browser.open({ url }); } catch { window.open(url, '_blank'); } } },
    linkPreview,

    saveText: async (defaultName, text) => {
      const uri = (await FS.getUri({ directory: 'CACHE', path: '' })).uri;
      const file = join(uri, String(defaultName || 'export.txt').replace(/[\\/:*?"<>|]/g, '_'));
      await writeText(file, text);
      return shareFile(file, defaultName);
    },
    openText: async () => {
      const [f] = await chooseFiles('.json,.md,.txt,application/json,text/*', false);
      return f ? f.text() : null;
    },
    confirm: (message, detail) => new Promise((resolve) => {
      if (typeof openModal !== 'function') { resolve(window.confirm(message + (detail ? '\n\n' + detail : ''))); return; }
      const body = document.createElement('div');
      body.innerHTML = `<p>${esc(detail || '')}</p>`;
      let answer = false;
      openModal({
        title: message, body,
        actions: [{ label: 'Cancel' }, { label: 'OK', primary: true, run: (close) => { answer = true; close(); } }],
        onClose: () => resolve(answer)
      });
    }),
    showFile: async () => {},

    // Exporting pictures and PDFs needs the desktop app.
    exportVisual: async () => ({ error: 'Export as picture or PDF is available in the desktop app.' }),
    exportReady: async () => {},
    exportData: async () => null,

    getSettings: async () => { await ready; return { ...settings, clipperStatus: {}, clipper: { enabled: false, tokens: [] }, version: VERSION, platform: 'android' }; },
    setSettings: async (patch) => {
      await ready;
      for (const [k, v] of Object.entries(patch || {})) {
        if (['userName', 'deviceName', 'linkPreviews'].includes(k)) settings[k] = v;
      }
      await saveSettings();
      return window.api.getSettings();
    },
    forgetBrowser: async () => {},

    backupStatus: async () => ({ enabled: false, unsupported: true, snapshots: [] }),
    backupNow: async () => ({ error: 'Backups to another folder are available in the desktop app.' }),
    backupSet: async () => ({}), backupChoose: async () => ({ canceled: true }), backupOpen: async () => {}, backupRead: async () => null,
    onBackupStatus: on('backup:status'), onBackupDone: on('backup:done'),

    spellGet: async () => ({ enabled: true, languages: [], available: [], words: [] }),
    spellSet: async () => ({}), spellRemoveWord: async () => true,

    syncStatus: async () => { await ready; return sync.status(); },
    syncChoose: async () => {
      await ready;
      let root = '/storage/emulated/0';
      try { root = (await Access.check()).storageRoot || root; } catch {}
      const fields = [{ name: 'folder', label: 'Folder on this device', value: sync.folder || root + '/' + FOLDER_NAME }];
      const res = await askText({
        title: 'Sync folder',
        intro: 'Type the folder your sync app keeps up to date (for example a folder you share with Syncthing). Pocket-Canvas uses a <i>Pocket-Canvas Sync</i> folder inside it.',
        fields, ok: 'Use this folder'
      });
      if (!res || !res.folder) return { canceled: true };
      if (!(await askFolderAccess())) return { error: 'Pocket-Canvas wasn’t allowed to use folders on this device.' };
      try { await sync.enable(res.folder.trim()); return sync.status(); } catch (err) { return { error: 'That folder can’t be used: ' + (err.message || err) }; }
    },
    syncDisable: async () => { await sync.disable(); return sync.status(); },
    syncNow: async () => { sync.seen.clear(); if (sync.latest) await sync.writeOwn(sync.latest); await sync.poll(); return sync.status(); },
    syncOpen: async () => {},

    onMenu: on('menu'),
    onSyncIncoming: on('sync:incoming'),
    onSyncStatus: on('sync:status'),
    onAssetsArrived: on('assets:arrived'),
    onClip: on('clip:add'),
    clipDone: () => {},

    // Android only: the menu button and the back button send these
    menu: (cmd) => emit('menu', cmd)
  };
  document.documentElement.classList.add('android');
})();
