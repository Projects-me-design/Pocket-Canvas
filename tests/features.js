// Pocket-Canvas — end-to-end tests for version 1.1 features
// Copyright (c) 2026 project-tech-me <project-tech-me@protonmail.com>
//
// Starts the real app with a throw-away data folder and checks: tables, sketches,
// audio/video, picture placeholders, comments, templates, link previews, export to
// PNG/PDF, syncing with another (simulated) computer, and the browser-extension
// connection. Run with:  npm run test:features   (Linux without a screen: xvfb-run -a …)

const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const http = require('http');
const crypto = require('crypto');
const zlib = require('zlib');
const { waitForApp } = require('./wait-ready');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pocket-canvas-features-'));
const userData = path.join(tmp, 'Pocket-Canvas');
const syncDir = path.join(tmp, 'Dropbox', 'Pocket-Canvas Sync');
fs.mkdirSync(path.join(userData, 'assets'), { recursive: true });
fs.mkdirSync(path.join(syncDir, 'devices'), { recursive: true });
fs.mkdirSync(path.join(syncDir, 'assets'), { recursive: true });
app.setPath('appData', tmp);
app.setPath('userData', userData);

// ---------- A tiny website for link previews ----------
function png(w, h, rgb) {
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => { const t = Buffer.from(type); const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const c = Buffer.alloc(4); c.writeUInt32BE(crc(Buffer.concat([t, data]))); return Buffer.concat([len, t, data, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) rgb.forEach((v, i) => { raw[y * (w * 3 + 1) + 1 + x * 3 + i] = v; });
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
function wav(seconds) {
  const rate = 8000, n = rate * seconds, data = Buffer.alloc(n * 2);
  for (let i = 0; i < n; i++) data.writeInt16LE(Math.round(Math.sin(i / rate * 2 * Math.PI * 440) * 8000), i * 2);
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + data.length, 4); h.write('WAVE', 8); h.write('fmt ', 12);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(rate, 24); h.writeUInt32LE(rate * 2, 28);
  h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}
const site = http.createServer((req, res) => {
  if (req.url === '/article') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`<!doctype html><html><head><title>Fallback title</title>
      <meta property="og:title" content="Ten Ideas for Cosy Rooms &amp; Spaces">
      <meta property="og:description" content="Warm light, soft textures and natural colours.">
      <meta property="og:site_name" content="Home Journal">
      <meta property="og:image" content="/hero.png"><link rel="icon" href="/icon.png"></head><body>Hi</body></html>`);
  } else if (req.url === '/hero.png' || req.url === '/icon.png') {
    res.writeHead(200, { 'Content-Type': 'image/png' }); res.end(png(40, 20, [200, 120, 60]));
  } else if (req.url === '/song.wav') {
    res.writeHead(200, { 'Content-Type': 'audio/wav' }); res.end(wav(1));
  } else { res.writeHead(404); res.end(); }
});

// ---------- Another computer's sync file ----------
const OTHER = 'otherdevice00001';
fs.writeFileSync(path.join(syncDir, 'assets', 'remotepic00000001.png'), png(30, 30, [60, 120, 200]));
function otherState(extraCards = {}) {
  return {
    format: 1, app: 'Pocket-Canvas', deviceId: OTHER, deviceName: 'Laptop', savedAt: Date.now(),
    state: {
      root: 'zzzz-other-home', templates: {}, deleted: {},
      boards: { 'zzzz-other-home': { id: 'zzzz-other-home', title: 'Home', parentId: null, color: '#8a7f70', view: { x: 0, y: 0, z: 1 },
        order: ['rnote1', 'rpic1', ...Object.keys(extraCards)], links: [], _mt: 1000,
        cards: {
          rnote1: { id: 'rnote1', type: 'note', x: 0, y: 0, w: 240, color: null, html: '<p>Written on the laptop</p>', _mt: 1000 },
          rpic1: { id: 'rpic1', type: 'image', x: 300, y: 0, w: 200, color: null, asset: 'remotepic00000001.png', caption: '', _mt: 1000 },
          ...extraCards
        } } }
    }
  };
}
fs.writeFileSync(path.join(syncDir, 'devices', OTHER + '.json'), JSON.stringify(otherState()));

// ---------- Settings: sync on, extension on a test port with a known token ----------
const TOKEN = crypto.randomBytes(32).toString('hex');
let PORT = 0;

const results = [];
const check = (name, ok) => { results.push({ name, ok: !!ok }); if (process.env.PC_VERBOSE) console.log((ok ? 'pass  ' : 'FAIL  ') + name); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms = 8000) { const t = Date.now(); while (Date.now() - t < ms) { if (await fn()) return true; await sleep(150); } return false; }

function request(method, p, { body, token, origin } = {}) {
  return new Promise((resolve) => {
    const data = body ? Buffer.from(JSON.stringify(body)) : null;
    const req = http.request({ host: '127.0.0.1', port: PORT, path: p, method, headers: {
      ...(data ? { 'Content-Type': 'application/json', 'Content-Length': data.length } : {}),
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
      ...(origin ? { Origin: origin } : {})
    } }, (res) => {
      const chunks = []; res.on('data', (c) => chunks.push(c));
      res.on('end', () => { let j = null; try { j = JSON.parse(Buffer.concat(chunks).toString()); } catch {} resolve({ status: res.statusCode, body: j }); });
    });
    req.on('error', (e) => resolve({ status: 0, body: { error: e.message } }));
    if (data) req.write(data);
    req.end();
  });
}

(async () => {
  await new Promise((r) => site.listen(0, '127.0.0.1', r));
  const SITE = `http://127.0.0.1:${site.address().port}`;
  PORT = await new Promise((r) => { const s = http.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });
  fs.writeFileSync(path.join(userData, 'settings.json'), JSON.stringify({
    deviceId: 'thisdevice000001', deviceHost: os.hostname(), deviceName: 'Desktop', userName: 'Sam', linkPreviews: true,
    sync: { folder: syncDir },
    clipper: { enabled: true, port: PORT, tokens: [{ id: 'test', name: 'Test browser', token: TOKEN, created: Date.now() }] },
    backup: { enabled: true, folder: path.join(tmp, 'USB', 'Pocket-Canvas Backups'), every: 'day', keep: 30 }
  }));

  require(path.join(__dirname, '..', 'main.js'));
  await app.whenReady();
  const wc = (await waitForApp()).webContents;
  const errors = [];
  wc.on('console-message', (...a) => { if (a[1] >= 3) errors.push(a[2]); });
  const ex = (js) => wc.executeJavaScript(js);
  const centre = (sel) => ex(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});if(!e)return null;const r=e.getBoundingClientRect();return [Math.round(r.left+r.width/2),Math.round(r.top+r.height/2)]})()`);
  const mouse = async (type, x, y, extra = {}) => { wc.sendInputEvent({ type, x, y, button: 'left', clickCount: 1, ...extra }); await sleep(25); };
  const click = async (p) => { await mouse('mouseDown', ...p); await mouse('mouseUp', ...p); await sleep(60); };
  const type = async (text) => { for (const ch of text) wc.sendInputEvent({ type: 'char', keyCode: ch }); await sleep(120); };
  const key = async (keyCode, modifiers = []) => { wc.sendInputEvent({ type: 'keyDown', keyCode, modifiers }); wc.sendInputEvent({ type: 'keyUp', keyCode, modifiers }); await sleep(120); };
  const shot = async (name) => fs.writeFileSync(path.join(process.env.SHOT_DIR || tmp, name), (await wc.capturePage()).toPNG());
  const cards = (type) => ex(`Object.values(B().cards).filter(c=>c.type==='${type}').map(c=>c.id)`);

  try {
    // ================= Sync: receiving from another computer =================
    check('sync: a card written on another computer appears here',
      await until(() => ex(`Object.values(B().cards).some(c => c.html && c.html.includes('Written on the laptop'))`)));
    check('sync: the other computer’s Home is combined with this one', await ex(`Object.keys(store.boards).length === 2 && Object.values(B().cards).some(c=>c.type==='board')`));
    check('sync: pictures from the other computer are copied here', await until(() => fs.existsSync(path.join(userData, 'assets', 'remotepic00000001.png'))));
    check('sync: the top bar shows sync status', await until(() => ex(`!document.querySelector('#sync-state').hidden`)));
    check('sync: this computer writes its own file to the sync folder', await until(() => fs.existsSync(path.join(syncDir, 'devices', 'thisdevice000001.json'))));
    await ex(`go(store.root); B().view={x:40,y:20,z:0.8}; applyView(); renderBoard();`);

    // A later change on the other computer
    const later = otherState({ rnote2: { id: 'rnote2', type: 'note', x: 0, y: 200, w: 240, color: null, html: '<p>Second change from laptop</p>', _mt: Date.now() + 1000 } });
    later.state.boards['zzzz-other-home'].cards.rnote1.html = '<p>Edited on the laptop</p>';
    later.state.boards['zzzz-other-home'].cards.rnote1._mt = Date.now() + 1000;
    fs.writeFileSync(path.join(syncDir, 'devices', OTHER + '.json'), JSON.stringify(later));
    check('sync: later edits from the other computer arrive', await until(() => ex(`Object.values(store.boards).some(b=>Object.values(b.cards).some(c=>c.html&&c.html.includes('Edited on the laptop')))`), 10000));

    // A change made here reaches our own sync file
    await ex(`(() => { const c = makeCard(B(), 'note', 900, 600, { html: '<p>Made on the desktop</p>' }); renderBoard(); scheduleSave(); })()`);
    check('sync: changes made here are written for the other computer',
      await until(() => { try { return fs.readFileSync(path.join(syncDir, 'devices', 'thisdevice000001.json'), 'utf8').includes('Made on the desktop'); } catch { return false; } }));
    check('sync: pictures added here are copied to the sync folder', await until(() => fs.readdirSync(path.join(userData, 'assets')).filter((f) => !f.startsWith('.')).every((f) => fs.existsSync(path.join(syncDir, 'assets', f)))));

    // ================= Tables =================
    await ex(`clearSelection(); addTool('table', toWorld(700, 300))`);
    await sleep(250);
    const tid = (await cards('table'))[0];
    check('table: the Table tool adds a table and starts editing the first cell', tid && await ex(`document.activeElement.dataset.field === 'cell:0:0'`));
    await type('Name'); await key('Tab'); await type('Due');
    check('table: typing and Tab fill cells across the row', await ex(`B().cards['${tid}'].rows[0][0]==='Name' && B().cards['${tid}'].rows[0][1]==='Due'`));
    await key('Tab'); await key('Tab'); await type('Paint');
    check('table: Tab wraps to the next row', await ex(`B().cards['${tid}'].rows[1][0]==='Paint'`));
    await ex(`document.activeElement.blur()`);
    await ex(`cardAction('add-col', B().cards['${tid}']); document.activeElement.blur(); cardAction('add-row', B().cards['${tid}']); document.activeElement.blur()`);
    check('table: + Row and + Column grow the table', await ex(`B().cards['${tid}'].rows.length===4 && B().cards['${tid}'].rows[0].length===4`));
    await ex(`tableMenuItems(B().cards['${tid}'], 3, 3).find(i=>i.label==='Delete row').run()`);
    check('table: right-click › Delete row works', await ex(`B().cards['${tid}'].rows.length===3`));
    check('table: exports to Markdown as a real table', await ex(`boardToMd(cur,1).includes('| Name | Due |')`));

    // ================= Sketch =================
    await ex(`clearSelection(); addTool('sketch', toWorld(760, 560))`);
    await sleep(250);
    const sid = (await cards('sketch'))[0];
    check('sketch: adding a sketch opens drawing mode with the pen toolbar', await ex(`sketchEditing==='${sid}' && !document.querySelector('#sketch-bar').hidden`));
    const sb = await ex(`(()=>{const r=document.querySelector('.card[data-id="${sid}"] .sketch-wrap').getBoundingClientRect();return [r.left,r.top,r.width,r.height]})()`);
    const sx = Math.round(sb[0] + sb[2] * 0.2), sy = Math.round(sb[1] + sb[3] * 0.5);
    await mouse('mouseDown', sx, sy);
    for (let i = 1; i <= 12; i++) await mouse('mouseMove', sx + i * Math.round(sb[2] * 0.05), sy + Math.round(Math.sin(i / 2) * 20));
    await mouse('mouseUp', sx + 12 * Math.round(sb[2] * 0.05), sy);
    check('sketch: dragging the mouse draws a line', await ex(`B().cards['${sid}'].strokes.length===1 && B().cards['${sid}'].strokes[0].p.length > 10`));
    await ex(`document.querySelector('#sketch-bar [data-color="#d0453b"]').click(); document.querySelector('#sketch-bar [data-size="9"]').click()`);
    await mouse('mouseDown', sx, sy + 40); await mouse('mouseMove', sx + 60, sy + 60); await mouse('mouseUp', sx + 60, sy + 60);
    check('sketch: pen colour and size are used for new lines', await ex(`(s=>s.c==='#d0453b'&&s.s===9)(B().cards['${sid}'].strokes[1])`));
    await ex(`document.querySelector('#sketch-bar [data-sk="eraser"]').click()`);
    await mouse('mouseDown', sx + 30, sy + 50); await mouse('mouseMove', sx + 31, sy + 50); await mouse('mouseUp', sx + 31, sy + 50);
    check('sketch: the eraser removes a line it touches', await ex(`B().cards['${sid}'].strokes.length===1`));
    await ex(`document.querySelector('#sketch-bar [data-sk="done"]').click()`);
    check('sketch: Done leaves drawing mode and keeps the drawing', await ex(`sketchEditing===null && document.querySelectorAll('.card[data-id="${sid}"] .sketch-wrap svg path').length===1`));
    await ex(`undo()`);
    check('sketch: undo brings back an erased line', await ex(`B().cards['${sid}'].strokes.length===2`));

    // ================= Audio / video =================
    const wavPath = path.join(userData, 'assets', 'testtone00000001.wav');
    fs.writeFileSync(wavPath, wav(3));
    await ex(`addAssetCards([{ id: 'testtone00000001.wav', name: 'Tone.wav', size: 48044 }], toWorld(1100, 300))`);
    await sleep(300);
    const mid = (await cards('media'))[0];
    check('media: an audio file becomes a playable media card', mid && await ex(`B().cards['${mid}'].kind==='audio' && !!document.querySelector('.card[data-id="${mid}"] audio')`));
    await until(() => ex(`isFinite(mediaEls.get('${mid}').el.duration)`), 5000);
    await click(await centre(`.card[data-id="${mid}"] [data-act="media-play"]`));
    check('media: Play starts playback', await until(() => ex(`!mediaEls.get('${mid}').el.paused && mediaEls.get('${mid}').el.currentTime > 0.05`), 5000));
    await ex(`makeCard(B(), 'note', 1200, 700, { html: '<p>x</p>' }); renderBoard()`);
    check('media: playback carries on when the board is redrawn', await ex(`!mediaEls.get('${mid}').el.paused`));
    await click(await centre(`.card[data-id="${mid}"] [data-act="media-stop"]`));
    check('media: Stop stops and rewinds to the start', await ex(`mediaEls.get('${mid}').el.paused && mediaEls.get('${mid}').el.currentTime===0`));
    check('media: video files become video cards', await ex(`cardForAsset({id:'a.mp4',name:'clip.mp4'})[1].kind==='video' && cardForAsset({id:'a.webm',name:'x.webm'})[0]==='media'`));

    // ================= Comments =================
    const nid = await ex(`Object.values(B().cards).find(c=>c.type==='note'&&!c.col&&c.html.includes('visual board')).id`);
    await ex(`openComments('${nid}')`);
    await sleep(150);
    check('comments: the comments panel opens for the card', await ex(`!document.querySelector('#comments-panel').hidden`));
    await type('Can we make this shorter?');
    await key('Enter', ['control']);
    check('comments: Ctrl+Enter posts a comment with your name', await ex(`(c=>c.length===1&&c[0].author==='Sam'&&c[0].text==='Can we make this shorter?')(B().cards['${nid}'].comments||[])`));
    check('comments: the card shows a comment count', await ex(`document.querySelector('.card[data-id="${nid}"] .cmt-badge span')?.textContent==='1'`));
    await ex(`document.querySelector('#comments-panel [data-cmt="resolve"]').click()`);
    check('comments: resolving hides the count', await ex(`B().cards['${nid}'].comments[0].resolved && !document.querySelector('.card[data-id="${nid}"] .cmt-badge span')`));
    await ex(`document.querySelector('#search').value='shorter'; runSearch()`);
    check('comments: search finds text in comments', await ex(`[...document.querySelectorAll('.sr small')].some(s=>s.textContent.includes('comment by Sam'))`));
    await ex(`document.querySelector('#search').value=''; runSearch(); closeComments()`);

    // ================= Link previews =================
    await ex(`addLinkCard('${SITE}/article', toWorld(1000, 650))`);
    const lid = await ex(`Object.values(B().cards).find(c=>c.type==='link'&&c.url.includes('/article')).id`);
    check('preview: the page title, description and site name are fetched',
      await until(() => ex(`(c=>c.title==='Ten Ideas for Cosy Rooms & Spaces'&&c.desc.includes('Warm light')&&c.site==='Home Journal')(B().cards['${lid}'])`), 10000));
    check('preview: the page picture is downloaded and shown', await until(() => ex(`!!B().cards['${lid}'].image && !!document.querySelector('.card[data-id="${lid}"] .link-img img')`)));
    await ex(`api.setSettings({ linkPreviews: false }).then(s => settingsCache = s)`); await sleep(200);
    await ex(`addLinkCard('${SITE}/article?2', toWorld(1000, 400))`); await sleep(800);
    check('preview: turning previews off in Settings stops website visits', await ex(`(c=>!c.desc&&!c.image)(Object.values(B().cards).find(c=>c.type==='link'&&c.url.endsWith('?2')))`));
    await ex(`api.setSettings({ linkPreviews: true }).then(s => settingsCache = s)`);

    // ================= Templates =================
    await ex(`openTemplates('new-board', toWorld(500, 500))`);
    await sleep(200);
    check('templates: the gallery shows the six ready-made templates', await ex(`document.querySelectorAll('.tpl[data-id^="builtin-"]').length===6`));
    await shot('templates.png');
    await ex(`document.querySelector('.tpl[data-id="builtin-projectplan"]').click()`);
    await sleep(400);
    check('templates: “Project plan” creates and opens a new board', await ex(`B().title==='Project plan' && Object.values(B().cards).some(c=>c.type==='table') && Object.values(B().cards).filter(c=>c.type==='column').length>=3`));
    check('templates: boards inside a template are created too', await ex(`childBoards(cur).map(id=>store.boards[id].title).includes('Meeting notes')`));
    await shot('project-plan.png');
    const planId = await ex('cur');
    const saving = ex(`saveBoardAsTemplate(cur)`);
    await sleep(250);
    await ex(`(()=>{const f=document.querySelector('.modal form');f.elements.name.value='Client project';f.elements.description.value='My standard setup';f.requestSubmit();})()`);
    await saving; await sleep(150);
    check('templates: you can save a board as your own template', await ex(`Object.values(store.templates).some(t=>t.name==='Client project'&&t.payload.cards.length>5)`));
    await ex(`go(store.root)`);
    await ex(`openTemplates('insert', toWorld(600, 600))`); await sleep(200);
    check('templates: your templates appear under “My templates”', await ex(`[...document.querySelectorAll('.tpl[data-own="1"] .tpl-name')].some(n=>n.textContent.includes('Client project'))`));
    const before = await ex(`Object.keys(B().cards).length`);
    await ex(`document.querySelector('.tpl[data-own="1"]').click()`); await sleep(300);
    check('templates: inserting your template adds its cards to the board', (await ex(`Object.keys(B().cards).length`)) > before + 5);
    await ex(`openTemplates('insert'); `); await sleep(150);
    await ex(`document.querySelector('.tpl[data-id="builtin-moodboard"]').click()`); await sleep(300);
    const ph = await ex(`Object.values(B().cards).find(c=>c.type==='image'&&!c.asset).id`);
    check('templates: the mood board has empty picture placeholders', !!ph && await ex(`!!document.querySelector('.card[data-id="${ph}"] .img-empty')`));
    await ex(`(async()=>{const cv=document.createElement('canvas');cv.width=8;cv.height=8;const b=await new Promise(r=>cv.toBlob(r));await fillImage('${ph}', new File([b],'pic.png',{type:'image/png'}));})()`);
    await sleep(300);
    check('templates: dropping a picture fills a placeholder', await ex(`!!B().cards['${ph}'].asset && !!document.querySelector('.card[data-id="${ph}"] > img')`));

    // ================= Export =================
    await ex(`go('${planId}')`); await sleep(300);
    await ex(`flushSave()`); await sleep(300);
    const { exportBoard } = require('../lib/export.js');
    const pngOut = path.join(tmp, 'plan.png'), pdfOut = path.join(tmp, 'plan.pdf');
    const r1 = await exportBoard({ appDir: path.join(__dirname, '..'), boardId: planId, format: 'png', quality: 'high', background: 'board', theme: 'light', filePath: pngOut });
    const pngBuf = fs.readFileSync(pngOut);
    const pw = pngBuf.readUInt32BE(16), phh = pngBuf.readUInt32BE(20);
    check('export: the whole board is saved as a PNG picture', pngBuf.slice(1, 4).toString() === 'PNG' && pw === r1.width && pw > 2000 && phh > 900);
    const r2 = await exportBoard({ appDir: path.join(__dirname, '..'), boardId: planId, format: 'pdf', quality: 'standard', background: 'white', theme: 'light', filePath: pdfOut });
    const pdfBuf = fs.readFileSync(pdfOut);
    check('export: the whole board is saved as a one-page PDF', pdfBuf.slice(0, 5).toString() === '%PDF-' && pdfBuf.length > 5000 && (pdfBuf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length === 1);
    if (process.env.SHOT_DIR) { fs.copyFileSync(pngOut, path.join(process.env.SHOT_DIR, 'export.png')); fs.copyFileSync(pdfOut, path.join(process.env.SHOT_DIR, 'export.pdf')); }
    await ex(`go(store.root)`); await sleep(200);

    // ================= Browser extension connection =================
    const st = await request('GET', '/status', { origin: 'chrome-extension://abcdefghijklmnop' });
    check('extension: the app answers on this computer', st.status === 200 && st.body.app === 'Pocket-Canvas');
    check('extension: ordinary websites are refused', (await request('POST', '/pair', { origin: 'https://evil.example', body: {} })).status === 403);
    check('extension: requests without the secret token are refused', (await request('POST', '/clip', { body: { kind: 'text', text: 'x' } })).status === 401);
    const boards = await request('GET', '/boards', { token: TOKEN, origin: 'moz-extension://1234' });
    check('extension: the board list is available after connecting', boards.status === 200 && boards.body.boards.some((b) => b.title === 'Project plan'));
    const r3 = await request('POST', '/clip', { token: TOKEN, origin: 'chrome-extension://abc', body: { kind: 'text', text: 'A great quote from the web', pageUrl: SITE + '/article', pageTitle: 'Cosy rooms', note: 'Use this in the intro' } });
    check('extension: saving selected text adds a note in “From the web”', r3.status === 200 && await until(() => ex(`(()=>{const col=Object.values(B().cards).find(c=>c.inbox);if(!col)return false;const n=B().cards[col.items[0]];return n.type==='note'&&n.html.includes('great quote')&&n.html.includes('Cosy rooms')})()`)));
    check('extension: the note typed in the extension becomes a comment', await ex(`(()=>{const col=Object.values(B().cards).find(c=>c.inbox);const n=B().cards[col.items[0]];return n.comments&&n.comments[0].text==='Use this in the intro'})()`));
    const shotData = 'data:image/png;base64,' + png(64, 40, [10, 160, 90]).toString('base64');
    await request('POST', '/clip', { token: TOKEN, body: { kind: 'screenshot', dataUrl: shotData, pageUrl: SITE, pageTitle: 'Example' } });
    check('extension: screenshots and pictures are saved as picture cards', await until(() => ex(`Object.values(B().cards).some(c=>c.type==='image'&&c.caption==='Screenshot: Example'&&c.col)`)));
    await request('POST', '/clip', { token: TOKEN, body: { kind: 'media', srcUrl: SITE + '/song.wav', pageUrl: SITE, pageTitle: 'Song' } });
    check('extension: audio from a page is downloaded into a playable card', await until(() => ex(`Object.values(B().cards).some(c=>c.type==='media'&&c.col&&c.kind==='audio')`)));
    const target = boards.body.boards.find((b) => b.title === 'Project plan').id;
    await request('POST', '/clip', { token: TOKEN, body: { kind: 'page', url: SITE + '/article', title: 'Cosy', pageUrl: SITE + '/article', boardId: target } });
    check('extension: pages can be saved to a chosen board', await until(() => ex(`Object.values(store.boards['${target}'].cards).some(c=>c.type==='link'&&c.col)`)));

    // ================= 1.2: fixed top-left corner =================
    await ex(`go(store.root)`); await sleep(200);
    await ex(`B().view = { x: 900, y: 700, z: 1 }; applyView()`);
    check('corner: you can’t scroll past the top-left corner', await ex(`B().view.x <= ORIGIN_PAD && B().view.y <= ORIGIN_PAD`));
    const vy = await ex(`B().view.y`);
    const vp = await centre('#viewport');
    wc.sendInputEvent({ type: 'mouseWheel', x: vp[0], y: vp[1], deltaX: 0, deltaY: 400 }); await sleep(150);
    check('corner: scrolling up at the top stays put', (await ex(`B().view.y`)) <= vy + 0.5 && (await ex(`B().view.y`)) <= 40);
    wc.sendInputEvent({ type: 'mouseWheel', x: vp[0], y: vp[1], deltaX: 0, deltaY: -1200 }); await sleep(150);
    check('corner: the board carries on downwards', (await ex(`B().view.y`)) < vy - 500);
    check('corner: no gap between the board and the window edge', await ex(`B().view={x:40,y:40,z:1}; applyView(); B().view.x === 0 && B().view.y === 0 && !document.querySelector('#edge-left')`));
    const nid2 = await ex(`(() => { const c = makeCard(B(), 'note', -300, -200, { html: '<p>corner</p>' }); renderBoard(); return c.id; })()`);
    check('corner: new cards can’t be placed beyond the corner', await ex(`B().cards['${nid2}'].x === 0 && B().cards['${nid2}'].y === 0`));
    await ex(`selectOnly('${nid2}')`);
    const np = await centre(`.card[data-id="${nid2}"]`);
    await mouse('mouseDown', np[0], np[1]);
    for (let i = 1; i <= 6; i++) await mouse('mouseMove', np[0] - i * 40, np[1] - i * 40);
    await mouse('mouseUp', np[0] - 240, np[1] - 240); await sleep(150);
    check('corner: dragging a card past the corner stops at the edge', await ex(`B().cards['${nid2}'].x === 0 && B().cards['${nid2}'].y === 0`));
    check('corner: older boards with cards beyond the corner are moved into place',
      await ex(`(() => { const b = { cards: { a: { x: -500, y: 30 }, b: { x: 100, y: -80 } }, view: { x: 0, y: 0, z: 1 } }; normaliseOrigin(b); return b.cards.a.x === 40 && b.cards.b.y === 40 && b.cards.b.x === 640; })()`));
    await ex(`fitContent()`);
    check('corner: “fit to content” starts from the top-left corner', await ex(`B().view.x === ORIGIN_PAD && B().view.y === ORIGIN_PAD`));

    // Templates load at the top-left
    await ex(`openTemplates('new-board')`); await sleep(200);
    await ex(`document.querySelector('.tpl[data-id="builtin-mindmap"]').click()`); await sleep(400);
    check('templates: a new board from a template starts at the top-left corner',
      await ex(`(() => { const t = Object.values(B().cards).filter(c => !c.col); return Math.min(...t.map(c => c.x)) === 40 && Math.min(...t.map(c => c.y)) === 40 && B().view.x === ORIGIN_PAD && B().view.y === ORIGIN_PAD; })()`));
    const mindId = await ex('cur');
    const beforeIds = await ex(`Object.keys(B().cards)`);
    const bottom = await ex(`contentBottom()`);
    await ex(`openTemplates('insert')`); await sleep(200);
    await ex(`document.querySelector('.tpl[data-id="builtin-week"]').click()`); await sleep(400);
    check('templates: inserting onto a busy board puts it at the left edge, below what’s there',
      await ex(`(() => { const old = new Set(${JSON.stringify(beforeIds)}); const t = Object.values(B().cards).filter(c => !old.has(c.id) && !c.col); return Math.min(...t.map(c => c.x)) === 40 && Math.min(...t.map(c => c.y)) >= ${Math.round(bottom)}; })()`));
    check('templates: the new board gets the template’s icon', await ex(`store.boards['${mindId}'].icon === 'idea'`));

    // ================= 1.2: board icons =================
    check('icons: a set of board icons is available', await ex(`BOARD_ICONS.length >= 40 && BOARD_ICONS.every(i => i.id && i.file)`));
    const iconsOk = await ex(`Promise.all(BOARD_ICONS.map(i => new Promise(r => { const im = new Image(); im.onload = () => r(im.naturalWidth > 0); im.onerror = () => r(false); im.src = 'board-icons/' + i.file; }))).then(a => a.every(Boolean))`);
    check('icons: every icon file loads', iconsOk);
    await ex(`go(store.root)`); await sleep(200);
    const bcId = await ex(`Object.values(B().cards).find(c => c.type === 'board' && store.boards[c.boardId].title === 'My first board').boardId`);
    await ex(`openBoardIcon('${bcId}')`); await sleep(200);
    await ex(`document.querySelector('.ip-ico[data-icon="star"]').click()`); await sleep(150);
    await ex(`document.querySelector('.ip-col[data-col="#c4579f"]').click()`); await sleep(150);
    check('icons: choosing an icon updates the board card', await ex(`store.boards['${bcId}'].icon === 'star' && [...document.querySelectorAll('.card.board .board-ico img')].some(i => i.src.endsWith('/star.svg'))`));
    check('icons: the sidebar shows the board’s icon', await ex(`[...document.querySelectorAll('.tree-ico img')].some(i => i.src.endsWith('/star.svg'))`));
    check('icons: changing the colour there updates card and sidebar', await ex(`store.boards['${bcId}'].color === '#c4579f' && Object.values(B().cards).find(c => c.boardId === '${bcId}').color === '#c4579f'`));
    await shot('icon-picker.png');
    await ex(`document.querySelector('.modal-actions .primary-btn').click()`);
    check('icons: board icons are part of what syncs', await ex(`(() => { const s = PCSync.syncState(store); const b = s.boards['${bcId}']; return b.icon === 'star'; })()`) && (() => {
      const S = require('../src/merge.js');
      const a = { root: 'h', boards: { h: { id: 'h', title: 'H', parentId: null, cards: { bc: { id: 'bc', type: 'board', boardId: 'x', x: 0, y: 0, w: 130 } }, order: ['bc'], links: [] }, x: { id: 'x', title: 'X', parentId: 'h', icon: 'board', cards: {}, order: [], links: [] } } };
      const idx = S.buildIndex(a); const b2 = JSON.parse(JSON.stringify(a)); b2.boards.x.icon = 'star'; S.stamp(b2, idx, 5);
      return S.merge(a, b2, 6).store.boards.x.icon === 'star';
    })());

    // ================= 1.2: colour cards =================
    await ex(`clearSelection(); addTool('swatch', toWorld(700, 300))`); await sleep(250);
    const swId = await ex(`[...selected][0]`);
    check('colour: the Colour tool opens with the colour code ready to type', await ex(`document.activeElement.classList.contains('swatch-hex-input')`));
    check('colour: a new colour card is named after its colour', await ex(`(c => c.title === colourName(c.hex) && c.title.length > 2)(B().cards['${swId}'])`));
    await key('A', ['control']);
    await type('#3a7be0'); await key('Enter');
    check('colour: typing a colour code changes the colour', await ex(`B().cards['${swId}'].hex === '#3a7be0'`));
    check('colour: the name fills in automatically', await ex(`B().cards['${swId}'].title === 'Dodger Blue' && document.querySelector('.card[data-id="${swId}"] .swatch-name').textContent.includes('Dodger Blue')`));
    await ex(`(() => { const i = document.querySelector('.card[data-id="${swId}"] .swatch-hex-input'); i.focus(); i.value = '2e8b57'; i.dispatchEvent(new Event('change', { bubbles: true })); })()`); await sleep(150);
    check('colour: codes work without the # too', await ex(`B().cards['${swId}'].hex === '#2e8b57' && B().cards['${swId}'].title === 'Sea Green'`));
    await ex(`(() => { const i = document.querySelector('.card[data-id="${swId}"] .swatch-hex-input'); i.focus(); i.value = 'not a colour'; i.dispatchEvent(new Event('change', { bubbles: true })); })()`); await sleep(150);
    check('colour: an invalid code is refused and the colour kept', await ex(`B().cards['${swId}'].hex === '#2e8b57' && document.querySelector('.card[data-id="${swId}"] .swatch-hex-input').value === '#2E8B57'`));
    await ex(`(() => { const inp = document.querySelector('.card[data-id="${swId}"] input[type=color]'); inp.value = '#ff7f50'; inp.dispatchEvent(new Event('change', { bubbles: true })); })()`); await sleep(150);
    check('colour: picking from the colour picker fills in the name too', await ex(`B().cards['${swId}'].hex === '#ff7f50' && B().cards['${swId}'].title === 'Coral'`));
    await ex(`(() => { const c = B().cards['${swId}']; const el = document.querySelector('.card[data-id="${swId}"] .swatch-name .editable'); el.textContent = 'Brand orange'; setField(c, 'title', el); })()`);
    await ex(`setSwatchColour(B().cards['${swId}'], '#ffa500')`);
    check('colour: a name you typed yourself isn’t replaced', await ex(`B().cards['${swId}'].title === 'Brand orange' && B().cards['${swId}'].hex === '#ffa500'`));
    await ex(`(() => { const c = B().cards['${swId}']; const el = document.querySelector('.card[data-id="${swId}"] .swatch-name .editable'); el.textContent = ''; setField(c, 'title', el); setSwatchColour(c, '#008080'); })()`);
    check('colour: clearing the name turns automatic naming back on', await ex(`B().cards['${swId}'].title === 'Teal'`));
    check('colour: template palette names are kept', await ex(`(() => { const p = BUILTIN_TEMPLATES[0].build(); const s = p.cards.find(c => c.type === 'swatch' && c.title === 'Deep'); return s && !swatchAutoName(s); })()`));
    const chip = await centre(`.card[data-id="${swId}"] .swatch-chip`);
    const before2 = await ex(`B().cards['${swId}'].x`);
    await mouse('mouseDown', ...chip);
    for (let i = 1; i <= 5; i++) await mouse('mouseMove', chip[0] + i * 20, chip[1]);
    await mouse('mouseUp', chip[0] + 100, chip[1]); await sleep(150);
    check('colour: the card can be dragged by its colour block', (await ex(`B().cards['${swId}'].x`)) > before2 + 60);

    // ================= 1.3: deleting and the Recycle bin =================
    await ex(`go(store.root); clearSelection()`); await sleep(200);
    const binBefore = await ex(`binCount()`);
    const delId = await ex(`(() => { const c = makeCard(B(), 'note', 300, 900, { html: '<p>Throw me away</p>' }); const t = makeCard(B(), 'note', 600, 900, { html: '<p>Keep me</p>' }); B().links.push({ id: uid(), from: c.id, to: t.id }); renderBoard(); return c.id; })()`);
    await ex(`B().view.z = 1; applyView(); selectOnly('${delId}'); centreOn('${delId}')`); await sleep(200);
    check('delete: a selected card shows a delete button', await ex(`getComputedStyle(document.querySelector('.card[data-id="${delId}"] .card-del')).display !== 'none'`));
    await click(await centre(`.card[data-id="${delId}"] .card-del`)); await sleep(250);
    check('delete: the delete button removes the card', await ex(`!B().cards['${delId}']`));
    check('bin: the deleted card is in the Recycle bin', (await ex(`binCount()`)) === binBefore + 1 && await ex(`Object.values(store.bin).some(e => e.label === 'Throw me away')`));
    check('bin: the sidebar bin button shows how many items it holds', await ex(`document.querySelector('#bin-btn span').textContent === String(binCount())`));
    const entryId = await ex(`Object.values(store.bin).find(e => e.label === 'Throw me away').id`);
    await ex(`openBin()`); await sleep(150);
    check('bin: the Recycle bin window lists it with days left', await ex(`[...document.querySelectorAll('.bin-row')].some(r => r.textContent.includes('Throw me away') && r.textContent.includes('30 days left'))`));
    await shot('bin.png');
    await ex(`document.querySelector('.bin-row[data-id="${entryId}"] [data-bin="restore"]').click()`); await sleep(250);
    check('bin: Restore puts the card back where it was, with its line', await ex(`!!B().cards['${delId}'] && B().cards['${delId}'].x === 300 && B().links.some(l => l.from === '${delId}')`));
    check('bin: restored items leave the bin', await ex(`!store.bin['${entryId}']`));
    await ex(`binModal && binModal.close()`);
    // Delete a whole board from the sidebar
    const brdId = await ex(`(() => { const c = makeCard(B(), 'board', 900, 900, { title: 'Old ideas' }); makeCard(store.boards[c.boardId], 'note', 40, 40, { html: '<p>inside old ideas</p>' }); renderBoard(); renderTree(); return c.boardId; })()`);
    await ex(`deleteBoard('${brdId}')`); await sleep(200);
    check('delete: a board can be deleted from the sidebar, with everything in it', await ex(`!store.boards['${brdId}'] && ![...document.querySelectorAll('.tree-row')].some(r => r.dataset.board === '${brdId}')`));
    check('bin: a deleted board appears as a board in the bin', await ex(`Object.values(store.bin).some(e => e.kind === 'board' && e.label === 'Old ideas' && e.count >= 2)`));
    const bEntry = await ex(`Object.values(store.bin).find(e => e.label === 'Old ideas').id`);
    await ex(`restoreFromBin('${bEntry}')`); await sleep(200);
    check('bin: restoring a board brings back its contents', await ex(`!!store.boards['${brdId}'] && Object.values(store.boards['${brdId}'].cards).some(c => (c.html||'').includes('inside old ideas'))`));
    check('delete: Home can’t be deleted', await ex(`(deleteBoard(store.root), !!store.boards[store.root])`));
    await ex(`(() => { const old = makeCard(B(), 'note', 40, 1200, { html: '<p>old</p>' }); const young = makeCard(B(), 'note', 300, 1200, { html: '<p>young</p>' }); renderBoard(); return Promise.all([moveCardsToBin(B(), [old.id], { quiet: true }), moveCardsToBin(B(), [young.id], { quiet: true })]); })()`);
    await ex(`(() => { const es = Object.values(store.bin); es.find(e => e.label === 'old').deletedAt = Date.now() - 31 * 864e5; es.find(e => e.label === 'young').deletedAt = Date.now() - 29 * 864e5; purgeBin(); })()`);
    check('bin: items older than 30 days are removed for good; newer ones stay', await ex(`!Object.values(store.bin).some(e => e.label === 'old') && Object.values(store.bin).some(e => e.label === 'young')`));
    check('bin: the Recycle bin syncs between computers', await ex(`Object.keys(PCSync.syncState(store).bin).length === binCount()`));

    // ================= 1.3: password-protected boards =================
    const secId = await ex(`(() => { const c = makeCard(B(), 'board', 1100, 900, { title: 'Diary' }); const sb = store.boards[c.boardId]; makeCard(sb, 'note', 40, 40, { html: '<p>Top secret text</p>' }); const inner = makeCard(sb, 'board', 300, 40, { title: 'Inner' }); makeCard(store.boards[inner.boardId], 'note', 40, 40, { html: '<p>Deep secret</p>' }); renderBoard(); renderTree(); return c.boardId; })()`);
    const locking = ex(`lockBoard('${secId}')`); await sleep(250);
    await ex(`(() => { const f = document.querySelector('.modal form'); f.elements.password.value = 'abc'; f.elements.repeat.value = 'abc'; f.requestSubmit(); })()`); await sleep(200);
    check('lock: passwords under 6 characters are refused', await ex(`!!document.querySelector('.modal .form-error:not([hidden])')`));
    await ex(`(() => { const f = document.querySelector('.modal form'); f.elements.password.value = 'correct horse'; f.elements.repeat.value = 'correct horse'; f.elements.hint.value = 'stable animal'; f.requestSubmit(); })()`);
    await locking; await sleep(300);
    check('lock: a locked board shows a padlock and “Locked”', await ex(`(() => { const el = [...document.querySelectorAll('.card.board')].find(e => e.textContent.includes('Diary')); return !!el.querySelector('.lock-badge') && el.textContent.includes('Locked'); })()`));
    check('lock: its contents are no longer readable in the app', await ex(`Object.keys(store.boards['${secId}'].cards).length === 0 && !Object.values(store.boards).some(b => b.title === 'Inner')`));
    await ex(`flushSave()`); await sleep(400);
    const dataFile = path.join(userData, 'pocket-canvas-data.json');
    const disk = fs.readFileSync(dataFile, 'utf8');
    check('lock: the saved file holds only encrypted contents', !disk.includes('Top secret') && !disk.includes('Deep secret') && disk.includes('"lock"'));
    check('lock: sync files hold only encrypted contents', await until(() => { const t = fs.readFileSync(path.join(syncDir, 'devices', 'thisdevice000001.json'), 'utf8'); return t.includes('"lock"') && !t.includes('Top secret'); }));
    // Opening asks for the password
    await ex(`go('${secId}')`); await sleep(250);
    check('lock: opening the board asks for its password and shows the hint', await ex(`!!document.querySelector('.modal input[type=password]') && document.querySelector('.modal').textContent.includes('stable animal')`));
    await ex(`(() => { const f = document.querySelector('.modal form'); f.elements.password.value = 'wrong password'; f.requestSubmit(); })()`); await sleep(1500);
    check('lock: a wrong password is refused', await ex(`!!document.querySelector('.modal .form-error:not([hidden])') && cur !== '${secId}'`));
    await ex(`(() => { const f = document.querySelector('.modal form'); f.elements.password.value = 'correct horse'; f.requestSubmit(); })()`);
    check('lock: the right password opens it', await until(() => ex(`cur === '${secId}' && Object.values(B().cards).some(c => (c.html||'').includes('Top secret'))`), 8000));
    check('lock: the top bar shows it’s unlocked, with “Lock now”', await ex(`!!document.querySelector('#crumbs .unlocked-pill')`));
    await ex(`makeCard(B(), 'note', 40, 300, { html: '<p>Written while unlocked</p>' }); renderBoard(); flushSave()`); await sleep(500);
    check('lock: changes while it’s open are saved encrypted too', !fs.readFileSync(dataFile, 'utf8').includes('Written while unlocked'));
    const innerId = await ex(`Object.values(B().cards).find(c => c.type === 'board').boardId`);
    await ex(`go('${innerId}')`); await sleep(250);
    check('lock: boards inside a locked board open without asking again', await ex(`cur === '${innerId}' && Object.values(B().cards).some(c => (c.html||'').includes('Deep secret'))`));
    await ex(`go('${secId}')`); await sleep(200);
    const secNote = await ex(`Object.values(B().cards).find(c => (c.html||'').includes('Written while unlocked')).id`);
    await ex(`selectOnly('${secNote}'); deleteSelection()`); await sleep(300);
    await ex(`flushSave()`); await sleep(400);
    check('lock: items deleted from a locked board are encrypted in the Recycle bin', await ex(`Object.values(store.bin).some(e => e.sealed && e.lockedBoard === '${secId}' && !JSON.stringify(e).includes('Written while'))`) && !fs.readFileSync(dataFile, 'utf8').includes('Written while unlocked'));
    const secEntry = await ex(`Object.values(store.bin).find(e => e.lockedBoard === '${secId}').id`);
    await ex(`go(store.root)`); await sleep(500);
    check('lock: leaving the board locks it again', await ex(`!isUnlocked('${secId}') && Object.keys(store.boards['${secId}'].cards).length === 0`));
    await ex(`restoreFromBin('${secEntry}')`); await sleep(200);
    check('lock: its bin items can’t be restored until the board is opened', await ex(`!!store.bin['${secEntry}']`));
    check('lock: cards can’t be dragged into a locked board', await ex(`(() => { const c = makeCard(B(), 'note', 40, 1500, { html: '<p>sneak</p>' }); return moveToBoard([c.id], '${secId}') === false; })()`));
    // unlock again, restore, change password
    await ex(`go('${secId}')`); await sleep(250);
    await ex(`(() => { const f = document.querySelector('.modal form'); f.elements.password.value = 'correct horse'; f.requestSubmit(); })()`);
    await until(() => ex(`cur === '${secId}'`), 8000);
    await ex(`restoreFromBin('${secEntry}')`); await sleep(300);
    check('lock: once opened, its bin items restore normally', await ex(`!store.bin['${secEntry}'] && Object.values(B().cards).some(c => (c.html||'').includes('Written while unlocked'))`));
    const changing = ex(`changePassword('${secId}')`); await sleep(250);
    await ex(`(() => { const f = document.querySelector('.modal form'); f.elements.password.value = 'battery staple'; f.elements.repeat.value = 'battery staple'; f.requestSubmit(); })()`);
    await changing; await sleep(300);
    const newLock = await ex(`store.boards['${secId}'].lock`);
    const pwOk = await ex(`(async () => { const l = store.boards['${secId}'].lock; const tryPw = async (pw) => { try { await openText(await lockKey(pw, fromB64(l.salt), l.iter), l); return true; } catch { return false; } }; return [await tryPw('battery staple'), await tryPw('correct horse')]; })()`);
    check('lock: changing the password works, and the old one stops working', pwOk[0] === true && pwOk[1] === false && !!newLock.ct);
    await shot('locked-board.png');
    await ex(`go(store.root)`); await sleep(500);

    // ================= 1.3: backups =================
    const bkRoot = path.join(tmp, 'USB', 'Pocket-Canvas Backups');
    check('backup: an automatic backup was made in the chosen folder', await until(() => fs.existsSync(path.join(bkRoot, 'snapshots')) && fs.readdirSync(path.join(bkRoot, 'snapshots')).some((n) => n.endsWith('.json')), 10000));
    const bk1 = await ex(`flushSave().then(() => api.backupNow())`);
    check('backup: “Back up now” saves a backup', !!(bk1 && bk1.ok));
    const snapFile = path.join(bkRoot, 'snapshots', bk1.name);
    const snapText = fs.readFileSync(snapFile, 'utf8');
    check('backup: a backup holds all the boards', snapText.includes('Pocket-Canvas') && snapText.includes('Project plan'));
    check('backup: locked boards stay encrypted in backups', !snapText.includes('Top secret') && snapText.includes('"lock"'));
    check('backup: pictures and files are copied into the backup folder', fs.readdirSync(path.join(userData, 'assets')).filter((f) => !f.startsWith('.')).every((f) => fs.existsSync(path.join(bkRoot, 'assets', f))));
    await ex(`api.backupSet({ keep: 2 })`);
    await ex(`api.backupNow()`); await sleep(1100); await ex(`api.backupNow()`); await sleep(1100); await ex(`api.backupNow()`);
    check('backup: only the chosen number of backups is kept', fs.readdirSync(path.join(bkRoot, 'snapshots')).filter((n) => n.endsWith('.json')).length === 2);
    const bst = await ex(`api.backupStatus()`);
    check('backup: Settings lists the backups', bst.count === 2 && bst.snapshots.length === 2 && !!bst.last);
    // restore
    const keepName = bst.snapshots[0].name;
    await ex(`(() => { makeCard(B(), 'note', 40, 1700, { html: '<p>after the backup</p>' }); renderBoard(); return flushSave(); })()`);
    await ex(`(async () => { const r = await api.backupRead('${keepName}'); unlocked.clear(); store = migrate(r.data); cur = store.root; render(); await flushSave(); })()`); await sleep(300);
    check('backup: restoring brings the boards back as they were', await ex(`!Object.values(store.boards).some(b => Object.values(b.cards).some(c => (c.html||'').includes('after the backup')))`) && await ex(`Object.values(store.boards).some(b => b.title === 'Project plan')`));
    check('backup: a backup of the boards is made just before restoring', fs.readFileSync(path.join(bkRoot, 'snapshots', fs.readdirSync(path.join(bkRoot, 'snapshots')).sort().pop()), 'utf8').includes('after the backup'));
    await ex(`api.backupSet({ keep: 30 })`);
    await ex(`openSettings('backups')`); await sleep(500); await shot('settings-backups.png');

    // ================= 1.3: spelling =================
    const sp = await ex(`api.spellGet()`);
    check('spelling: on by default, in English (UK)', sp.enabled === true && sp.languages[0] === 'en-GB');
    await ex(`api.spellSet({ enabled: false })`);
    check('spelling: can be turned off', (await ex(`api.spellGet()`)).enabled === false);
    await ex(`api.spellSet({ enabled: true, languages: ['en-GB', 'fr'] })`);
    check('spelling: a second language can be added', (await ex(`api.spellGet()`)).languages.join() === 'en-GB,fr');
    await ex(`api.spellSet({ languages: ['en-GB'] })`);
    await ex(`openSettings('spelling')`); await sleep(500); await shot('settings-spelling.png');
    await ex(`settingsModal && settingsModal.close()`);
    check('spelling: notes and other text are spell-checked', await ex(`[...document.querySelectorAll('#cards .editable')].every(e => e.spellcheck)`));
    const ctxNote = await ex(`Object.values(B().cards).find(c => c.type === 'note' && !c.col).id`);
    const ctx = await ex(`(() => { const ed = document.querySelector('.card[data-id="${ctxNote}"] .editable'); const fire = () => { const ev = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 10, clientY: 10 }); ed.dispatchEvent(ev); return ev.defaultPrevented; }; const notEditing = fire(); hideMenu(); makeEditable(ed); ed.focus(); const editing = fire(); ed.blur(); return [notEditing, editing]; })()`);
    check('spelling: right-clicking while typing shows the spelling menu instead of the card menu', ctx[0] === true && ctx[1] === false);

    // ================= 1.4: a fresh board to work on =================
    await ex(`(() => { const c = makeCard(store.boards[store.root], 'board', 2000, 40, { title: 'Testing 1.4' }); go(c.boardId); })()`); await sleep(300);
    check('board: the board starts flush with the window (no gap)', await ex(`B().view.x === 0 && B().view.y === 0`));
    const q4Vpr = await ex(`(() => { const r = document.querySelector('#viewport').getBoundingClientRect(); return [r.left, r.top]; })()`);
    const q4At = (x, y) => [Math.round(q4Vpr[0] + x), Math.round(q4Vpr[1] + y)];

    // ================= 1.4: tables =================
    const q4Tbl = await ex(`(() => { const c = makeCard(B(), 'table', 60, 60, { w: 380, rows: [['A','B','C'],['1','2','3'],['4','5','6']] }); renderBoard(); return c.id; })()`);
    check('tables: delete buttons are shown on the table', await ex(`!!document.querySelector('.card[data-id="${q4Tbl}"] [data-act="del-row"]') && !!document.querySelector('.card[data-id="${q4Tbl}"] [data-act="del-col"]')`));
    await ex(`(() => { const ed = document.querySelector('.card[data-id="${q4Tbl}"] [data-field="cell:1:1"]'); makeEditable(ed); ed.focus(); ed.blur(); })()`);
    await ex(`document.querySelector('.card[data-id="${q4Tbl}"] [data-act="del-row"]').dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))`);
    check('tables: hovering “− Row” highlights the row it will delete', await ex(`[...document.querySelectorAll('.card[data-id="${q4Tbl}"] td.del-hint')].every(td => td.dataset.r === '1') && document.querySelectorAll('.card[data-id="${q4Tbl}"] td.del-hint').length === 3`));
    await shot('table-delete.png');
    await click(await centre(`.card[data-id="${q4Tbl}"] [data-act="del-row"]`));
    check('tables: “− Row” deletes the row of the cell you clicked', await ex(`JSON.stringify(B().cards['${q4Tbl}'].rows) === JSON.stringify([['A','B','C'],['4','5','6']])`));
    await ex(`(() => { const ed = document.querySelector('.card[data-id="${q4Tbl}"] [data-field="cell:0:0"]'); makeEditable(ed); ed.focus(); ed.blur(); })()`);
    await click(await centre(`.card[data-id="${q4Tbl}"] [data-act="del-col"]`));
    check('tables: “− Column” deletes the column of the cell you clicked', await ex(`JSON.stringify(B().cards['${q4Tbl}'].rows) === JSON.stringify([['B','C'],['5','6']])`));
    await ex(`lastTableCell = null`);
    await click(await centre(`.card[data-id="${q4Tbl}"] [data-act="del-col"]`));
    check('tables: with no cell chosen, the last column goes', await ex(`JSON.stringify(B().cards['${q4Tbl}'].rows) === JSON.stringify([['B'],['5']])`));
    await click(await centre(`.card[data-id="${q4Tbl}"] [data-act="del-col"]`));
    check('tables: the last column can’t be deleted', await ex(`B().cards['${q4Tbl}'].rows[0].length === 1`));
    await ex(`undo()`);
    check('tables: deleting can be undone', await ex(`B().cards['${q4Tbl}'].rows[0].length === 2`));

    // ================= 1.4: board icon colours =================
    await ex(`openBoardIcon(cur)`); await sleep(300);
    check('board icons: 51 background colours to choose from', (await ex(`document.querySelectorAll('.ip-colours .ip-col').length`)) === 51);
    await ex(`document.querySelector('.ip-col[data-col="#22509c"]').click()`); await sleep(100);
    check('board icons: picking a deep blue changes the board colour', await ex(`B().color === '#22509c'`));
    await ex(`(() => { const i = document.querySelector('.ip-hex'); i.value = '#0f8a5f'; i.dispatchEvent(new Event('change', { bubbles: true })); })()`); await sleep(100);
    check('board icons: any colour can be typed as a hex code', await ex(`B().color === '#0f8a5f' && document.querySelector('.ip-name').textContent.length > 2`));
    await shot('board-icon-colours.png');
    await ex(`document.querySelector('.modal .primary-btn, .modal-actions button').click()`); await sleep(200);

    // ================= 1.4: lines =================
    await ex(`toggleConnect()`);
    check('lines: the line style bar shows while drawing', await ex(`!document.querySelector('#line-bar').hidden`));
    await click(q4At(600, 380)); await click(q4At(900, 520));
    const q4Fl = await ex(`B().links[B().links.length - 1]`);
    check('lines: a line can be drawn between two empty spots', q4Fl && !q4Fl.from && !q4Fl.to && q4Fl.fromPt && q4Fl.toPt && Math.abs(q4Fl.toPt.x - q4Fl.fromPt.x - 300) < 3);
    check('lines: the new line is selected with handles on both ends', await ex(`selectedLink === '${q4Fl.id}' && document.querySelectorAll('#line-handles circle').length === 2`));
    await ex(`setLineProp('arrow', 'both'); setLineProp('dash', 'dotted')`);
    check('lines: arrows at both ends', await ex(`(() => { const p = document.querySelector('path.link[data-id="${q4Fl.id}"]'); return p.hasAttribute('marker-start') && p.hasAttribute('marker-end'); })()`));
    check('lines: dotted lines', await ex(`(() => { const p = document.querySelector('path.link[data-id="${q4Fl.id}"]'); return p.classList.contains('dotted') && p.style.strokeDasharray.length > 0; })()`));
    await ex(`setLineProp('arrow', 'none')`);
    check('lines: no arrowheads', await ex(`(() => { const p = document.querySelector('path.link[data-id="${q4Fl.id}"]'); return !p.hasAttribute('marker-start') && !p.hasAttribute('marker-end'); })()`));
    await ex(`setLineProp('dash', 'dashed'); setLineProp('width', 5); setLineProp('shape', 'straight')`);
    check('lines: dashed, thick and straight', await ex(`(() => { const l = B().links.find(x => x.id === '${q4Fl.id}'); const p = document.querySelector('path.link[data-id="${q4Fl.id}"]'); return l.dash === 'dashed' && l.width === 5 && p.getAttribute('d').includes(' L'); })()`));
    check('lines: new lines remember the last style picked', await ex(`lineDefaults().dash === 'dashed' && lineDefaults().arrow === 'none'`));
    await shot('lines-free.png');
    // drag the whole free line
    const q4Mid = q4At(750, 450);
    await mouse('mouseDown', ...q4Mid);
    for (let i = 1; i <= 5; i++) await mouse('mouseMove', q4Mid[0] + i * 10, q4Mid[1] + i * 8);
    await mouse('mouseUp', q4Mid[0] + 50, q4Mid[1] + 40); await sleep(100);
    check('lines: a free line can be dragged anywhere', await ex(`(() => { const l = B().links.find(x => x.id === '${q4Fl.id}'); return Math.abs(l.fromPt.x - ${q4Fl.fromPt.x} - 50) < 3 && Math.abs(l.toPt.y - ${q4Fl.toPt.y} - 40) < 3; })()`));
    // attach one end to a card by dragging its handle onto it
    const q4Lnote = await ex(`(() => { const c = makeCard(B(), 'note', 750, 150, { w: 200, html: '<p>Target</p>' }); renderBoard(); return c.id; })()`);
    await ex(`selectedLink = '${q4Fl.id}'; refreshSelection()`);
    const q4HEnd = await ex(`(() => { const r = document.querySelector('#line-handles circle[data-end="to"]').getBoundingClientRect(); return [Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2)]; })()`);
    const q4Tgt = await centre(`.card[data-id="${q4Lnote}"]`);
    await mouse('mouseDown', ...q4HEnd);
    for (let i = 1; i <= 8; i++) await mouse('mouseMove', Math.round(q4HEnd[0] + (q4Tgt[0] - q4HEnd[0]) * i / 8), Math.round(q4HEnd[1] + (q4Tgt[1] - q4HEnd[1]) * i / 8));
    check('lines: the card under a dragged end is highlighted', await ex(`document.querySelector('.card[data-id="${q4Lnote}"]').classList.contains('line-target')`));
    await mouse('mouseUp', ...q4Tgt); await sleep(100);
    check('lines: dropping an end on a card attaches it', await ex(`(() => { const l = B().links.find(x => x.id === '${q4Fl.id}'); return l.to === '${q4Lnote}' && !l.toPt && !!l.fromPt; })()`));
    const q4Ny = await ex(`B().cards['${q4Lnote}'].y`);
    await ex(`B().cards['${q4Lnote}'].y += 200; renderBoard();`);
    check('lines: an attached end follows its card', await ex(`(() => { const d = document.querySelector('path.link[data-id="${q4Fl.id}"]').getAttribute('d'); const y = +d.split(/[ ,L]/).filter(Boolean).pop(); return y > ${q4Ny} + 150; })()`));
    // press, drag and let go from a card to an empty spot
    await ex(`clearSelection(); toggleConnect()`);
    const q4From = await centre(`.card[data-id="${q4Lnote}"]`);
    await mouse('mouseDown', ...q4From);
    for (let i = 1; i <= 6; i++) await mouse('mouseMove', q4From[0] + i * 40, q4From[1] - i * 30);
    await mouse('mouseUp', q4From[0] + 240, q4From[1] - 180); await sleep(100);
    const q4Dl = await ex(`B().links[B().links.length - 1]`);
    check('lines: drag from a card to anywhere to draw a line', q4Dl.from === q4Lnote && !q4Dl.to && q4Dl.toPt && q4Dl.id !== q4Fl.id);
    check('lines: free lines are kept when the board is saved and reopened', await ex(`(() => { const b = JSON.parse(JSON.stringify(B())); return b.links.filter(l => lineValid(l, b)).length === b.links.length; })()`));
    check('lines: older lines with the arrow hidden still have no arrowhead', await ex(`lineArrow({ arrow: false }) === 'none' && lineArrow({}) === 'end'`));
    const q4Pasted = await ex(`(() => { const p = serialize(['${q4Lnote}']); const n = p.links.length; insertPayload(p, 400, 0); return n; })()`);
    check('lines: copying a card brings its lines, free ends included', q4Pasted === 2);
    await ex(`renderBoard()`);
    const q4MenuLabels = await ex(`(() => { const l = B().links.find(x => x.id === '${q4Fl.id}'); return lineMenuItems(l).filter(i => i.label).map(i => i.label.trim()); })()`);
    check('lines: the right-click menu has arrow, dash and detach options', ['Arrows at both ends', 'Dotted line', 'Detach from cards'].every((t) => q4MenuLabels.some((m) => m.endsWith(t))));
    await ex(`(() => { const l = B().links.find(x => x.id === '${q4Fl.id}'); detachLine(l); })()`);
    check('lines: “Detach from cards” frees both ends where they are', await ex(`(() => { const l = B().links.find(x => x.id === '${q4Fl.id}'); return !l.from && !l.to && l.fromPt && l.toPt; })()`));
    await ex(`selectedLink = '${q4Dl.id}'; refreshSelection()`);
    await shot('lines-attached.png');
    await ex(`clearSelection()`);

    // ================= 1.4: text formatting =================
    const q4Tn = await ex(`(() => { const c = makeCard(B(), 'note', 60, 420, { w: 300, html: '<p>Hello world, this is a note</p>' }); renderBoard(); return c.id; })()`);
    const q4Edp = await centre(`.card[data-id="${q4Tn}"] .editable`);
    await click(q4Edp); await click(q4Edp); await sleep(100);
    check('text: the formatting bar appears while typing', await ex(`!document.querySelector('#format-bar').hidden`));
    await ex(`(() => { const ed = document.querySelector('.card[data-id="${q4Tn}"] .editable'); const t = ed.querySelector('p').firstChild; const r = document.createRange(); r.setStart(t, 6); r.setEnd(t, 11); const s = getSelection(); s.removeAllRanges(); s.addRange(r); })()`);
    await ex(`applyFormat('bold')`);
    check('text: bold', await ex(`/<b>world<\\/b>/.test(B().cards['${q4Tn}'].html)`));
    await ex(`applyFormat('underline'); applyFormat('strike')`);
    check('text: underline and strikethrough', await ex(`(() => { const h = B().cards['${q4Tn}'].html; return /<u>/.test(h) && /<strike>|<s>/.test(h); })()`));
    await ex(`applyFormat('size', 28)`);
    check('text: change size', await ex(`/font-size: 28px/.test(B().cards['${q4Tn}'].html)`));
    await ex(`applyFormat('colour', '#d0453b')`);
    check('text: change colour', await ex(`/color: (rgb\\(208, 69, 59\\)|#d0453b)/.test(B().cards['${q4Tn}'].html)`));
    await ex(`applyFormat('font', "Georgia, 'Times New Roman', Times, serif")`);
    check('text: change font', await ex(`/font-family: Georgia/.test(B().cards['${q4Tn}'].html)`));
    check('text: only the selected words change', await ex(`(() => { const d = document.createElement('div'); d.innerHTML = B().cards['${q4Tn}'].html; return d.querySelector('[style*="28px"]').textContent === 'world' && d.querySelector('[style*="color"]').textContent === 'world' && d.querySelector('[style*="Georgia"]').textContent === 'world'; })()`));
    await shot('text-format-note.png');
    await ex(`getSelection().collapseToEnd(); applyFormat('italic')`);
    check('text: with nothing selected, the whole note changes', await ex(`/^<p><i>|<i><p>/.test(B().cards['${q4Tn}'].html) || /<i>Hello/.test(B().cards['${q4Tn}'].html)`));
    await ex(`document.activeElement.blur()`); await sleep(50);
    check('text: the bar goes away when you stop typing', await ex(`document.querySelector('#format-bar').hidden`));
    check('text: styles survive saving and reopening', await ex(`(() => { const h = sanitize(B().cards['${q4Tn}'].html); return /font-size: 28px/.test(h) && /font-family/.test(h); })()`));
    check('text: unsafe styles are removed from pasted text', await ex(`sanitize('<span style="color:red;background:url(x);position:fixed">x</span><font color="#ff0000">y</font>') === '<span style="color: red">x</span><span style="color: rgb(255, 0, 0)">y</span>'`));
    // whole-card styles on a heading
    const q4Hd2 = await ex(`(() => { const c = makeCard(B(), 'heading', 60, 700, { text: 'Big title' }); renderBoard(); return c.id; })()`);
    const q4Hp = await centre(`.card[data-id="${q4Hd2}"] .editable`);
    await click(q4Hp); await click(q4Hp); await sleep(100);
    await ex(`applyFormat('size', 48); applyFormat('bold'); applyFormat('underline'); applyFormat('colour', '#3a7be0'); applyFormat('font', "ui-monospace, Consolas, 'Courier New', monospace")`);
    check('text: headings and other cards change as a whole', await ex(`(() => { const t = B().cards['${q4Hd2}'].textStyle; return t.size === 48 && t.bold && t.underline && t.color === '#3a7be0' && /monospace/.test(t.font); })()`));
    check('text: …and it shows straight away', await ex(`(() => { const cs = getComputedStyle(document.querySelector('.card[data-id="${q4Hd2}"] .editable')); return cs.fontSize === '48px' && cs.textDecorationLine.includes('underline') && cs.color === 'rgb(58, 123, 224)'; })()`));
    await shot('text-format-heading.png');
    await key('B', ['control']);
    check('text: Ctrl+B toggles bold on a heading', await ex(`!B().cards['${q4Hd2}'].textStyle.bold`));
    await ex(`applyFormat('clear')`);
    check('text: “clear formatting” resets the card', await ex(`!B().cards['${q4Hd2}'].textStyle`));
    await ex(`document.activeElement.blur()`);
    await ex(`go(store.root)`); await sleep(200);

    await ex(`B().view={x:20,y:20,z:0.55}; applyView(); renderBoard();`); await sleep(400);
    await shot('home-after.png');
    await ex(`openSettings('sync')`); await sleep(500); await shot('settings-sync.png');
    await ex(`openSettings('clipper')`); await sleep(500); await shot('settings-clipper.png');
    await ex(`settingsModal && settingsModal.close()`);

    check('no script errors in the window', errors.length === 0);
    if (errors.length) console.log('Script errors:\n  ' + errors.join('\n  '));
  } catch (err) {
    check('test run finished without crashing: ' + err.stack, false);
  }

  let failed = 0;
  for (const r of results) { console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}`); if (!r.ok) failed++; }
  console.log(`\n${results.length - failed} passed, ${failed} failed`);
  site.close();
  fs.rmSync(tmp, { recursive: true, force: true });
  app.exit(failed ? 1 : 0);
})();
