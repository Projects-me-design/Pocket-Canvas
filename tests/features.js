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
    // shapes and pressure (1.4)
    await ex(`startSketch('${sid}')`); await sleep(100);
    await ex(`document.querySelector('#sketch-bar [data-mode="rect"]').click()`);
    await mouse('mouseDown', sx, sy - 60); await mouse('mouseMove', sx + 40, sy - 30); await mouse('mouseMove', sx + 80, sy - 20); await mouse('mouseUp', sx + 80, sy - 20);
    check('sketch: drag to draw a rectangle', await ex(`(s => s.t === 'rect' && s.x2 > s.x1 && s.y2 > s.y1)(B().cards['${sid}'].strokes[2])`));
    await ex(`document.querySelector('#sketch-bar [data-mode="arrow"]').click(); document.querySelector('#sketch-bar [data-sk="fill"]').click()`);
    await mouse('mouseDown', sx + 100, sy + 70); await mouse('mouseMove', sx + 160, sy + 74); await mouse('mouseMove', sx + 200, sy + 76, { modifiers: ['shift'] }); await mouse('mouseUp', sx + 200, sy + 76, { modifiers: ['shift'] });
    check('sketch: arrows, kept level while Shift is held', await ex(`(s => s.t === 'arrow' && Math.abs(s.y2 - s.y1) < 0.5)(B().cards['${sid}'].strokes[3])`));
    await ex(`document.querySelector('#sketch-bar [data-mode="ellipse"]').click()`);
    await mouse('mouseDown', sx + 120, sy - 70); await mouse('mouseMove', sx + 170, sy - 40); await mouse('mouseUp', sx + 170, sy - 40);
    check('sketch: ellipses, filled when Fill is on', await ex(`(s => s.t === 'ellipse' && s.f === 1)(B().cards['${sid}'].strokes[4])`));
    await ex(`document.querySelector('#sketch-bar [data-mode="pen"]').click()`);
    await ex(`(() => { const w = document.querySelector('.card[data-id="${sid}"] .sketch-wrap'); const r = w.getBoundingClientRect();
      const fire = (t, i, p) => w.dispatchEvent(new PointerEvent(t, { pointerId: 9, pointerType: 'pen', pressure: p, clientX: r.left + 30 + i * 12, clientY: r.top + r.height - 30, bubbles: true, cancelable: true, button: 0, buttons: t === 'pointerup' ? 0 : 1 }));
      fire('pointerdown', 0, 0.1); for (let i = 1; i <= 10; i++) fire('pointermove', i, 0.1 + i * 0.08); fire('pointerup', 10, 0.9); })()`); await sleep(100);
    const pen = await ex(`B().cards['${sid}'].strokes[5]`);
    check('sketch: a pen draws thin when pressed lightly and thick when pressed hard', pen && Array.isArray(pen.pr) && pen.pr[0] < 0.2 && pen.pr[pen.pr.length - 1] > 0.8 && pen.pr.length === pen.p.length / 2);
    check('sketch: pressure lines are drawn as a shape that changes width', await ex(`document.querySelectorAll('.card[data-id="${sid}"] .sketch-wrap svg path[fill="#d0453b"]').length >= 1`));
    await ex(`document.querySelector('#sketch-bar [data-sk="eraser"]').click()`);
    await mouse('mouseDown', sx, sy - 40); await mouse('mouseMove', sx + 1, sy - 40); await mouse('mouseUp', sx + 1, sy - 40);
    check('sketch: the eraser removes shapes too', await ex(`!B().cards['${sid}'].strokes.some(s => s.t === 'rect')`));
    await shot('sketch-shapes.png');
    await ex(`stopSketch()`);

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
    // Printing on pages
    const pagedOk = await ex(`(() => {
      const items = [0, 1, 2, 3, 4, 5].map((i) => ({ el: { i }, x: 0, y: i * 400, w: 600, h: 380 }));
      const box = { x1: 0, y1: 0, x2: 600, y2: 2380 };
      const plan = planPages(items, box, { w: 600, h: 1000 });   // 1000 tall pages at scale 1
      const tops = items.map((it) => it.y + plan.moves.get(it.el));
      const crosses = items.some((it, k) => Math.floor(tops[k] / 1000) !== Math.floor((tops[k] + it.h - 0.01) / 1000));
      return { pages: plan.pages, crosses, tops };
    })()`);
    check('pages: no card is cut by the edge of a page', !pagedOk.crosses);
    check('pages: a card that would cross a page edge moves to the top of the next page', pagedOk.tops[2] === 1000 && pagedOk.tops[4] === 2000 && pagedOk.pages === 3);
    check('pages: wide boards are scaled down to fit the page width', await ex(`planPages([{ el: {}, x: 0, y: 0, w: 2000, h: 100 }], { x1: 0, y1: 0, x2: 2000, y2: 100 }, { w: 500, h: 700 }).scale === 0.25`));
    const pagesOut = path.join(tmp, 'plan-pages.pdf');
    const pg3 = await exportBoard({ appDir: path.join(__dirname, '..'), boardId: planId, format: 'pages', quality: 'standard', background: 'white', theme: 'light', filePath: pagesOut, paper: 'A4', orientation: 'portrait' });
    const pagesBuf = fs.readFileSync(pagesOut);
    const pageCount = (pagesBuf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
    check('pages: a board prints on A4 portrait pages', pagesBuf.slice(0, 5).toString() === '%PDF-' && pg3.pages >= 1 && pageCount === pg3.pages && pg3.landscape === false);
    check('pages: the pages are A4 portrait size', /\/MediaBox\s*\[\s*0 0 59[56](\.\d+)? 84[12](\.\d+)?\s*\]/.test(pagesBuf.toString('latin1')));
    const pg4 = await exportBoard({ appDir: path.join(__dirname, '..'), boardId: planId, format: 'pages', quality: 'standard', background: 'white', theme: 'light', filePath: pagesOut + '2', paper: 'A4', orientation: 'landscape' });
    check('pages: landscape pages can be chosen', pg4.landscape === true && /\/MediaBox\s*\[\s*0 0 84[12](\.\d+)? 59[56](\.\d+)?\s*\]/.test(fs.readFileSync(pagesOut + '2').toString('latin1')));
    const pg5 = await exportBoard({ appDir: path.join(__dirname, '..'), boardId: planId, format: 'pages', quality: 'standard', background: 'white', theme: 'light', filePath: pagesOut + '3', paper: 'Letter', orientation: 'auto' });
    check('pages: “best fit” picks the direction with fewer pages', pg5.pages <= Math.min(pg3.pages, pg4.pages + 0) || pg5.pages <= pg3.pages);
    if (process.env.SHOT_DIR) { fs.copyFileSync(pagesOut, path.join(process.env.SHOT_DIR, 'export-pages-portrait.pdf')); fs.copyFileSync(pagesOut + '2', path.join(process.env.SHOT_DIR, 'export-pages-landscape.pdf')); }

    // ---------- Page guides on the board ----------
    check('guides: off to begin with', await ex(`!document.querySelector('#page-guides') && document.querySelector('#pages-chip').hidden && !pageSetup().show`));
    await ex(`fitContent()`); await sleep(150);
    await click(await centre('#pages-btn')); await sleep(200);
    check('guides: the page button opens the page guide menu', await ex(`!ctx.hidden && [...ctx.querySelectorAll('button')].some(b => b.textContent.includes('Show page guides')) && [...ctx.querySelectorAll('button')].some(b => b.textContent.includes('Landscape'))`));
    await ex(`[...ctx.querySelectorAll('button')].find(b => b.textContent.includes('Show page guides')).click()`); await sleep(300);
    check('guides: turning them on draws A4 pages from the top-left corner', await ex(`(() => { const p = document.querySelector('#page-guides .pg-page'); return !!p && p.style.left === '0px' && p.style.top === '0px' && Math.abs(parseFloat(p.style.width) - (8.27 * 96 - 76.8)) < 0.5 && Math.abs(parseFloat(p.style.height) - (11.69 * 96 - 76.8)) < 0.5; })()`));
    check('guides: pages are numbered in printing order', await ex(`document.querySelector('#page-guides .pg-page:not(.blank) .pg-label').textContent === 'Page 1'`));
    check('guides: the page button shows they are on, and a label shows the page count', await ex(`document.querySelector('#pages-btn').classList.contains('on') && !document.querySelector('#pages-chip').hidden && /A4 portrait · \\d+ pages?/.test(document.querySelector('#pages-chip').textContent)`));
    check('guides: the setting is kept with the board', await ex(`B().pages && B().pages.show === true && B().pages.paper === 'A4'`));
    // a card straddling the first page's right edge
    const crossId = await ex(`(() => { const c = makeCard(B(), 'note', 640, 60, { html: '<p>Over the edge</p>' }); renderBoard(); return c.id; })()`);
    await sleep(250);
    check('guides: a card that crosses a page edge is outlined', await ex(`document.querySelector('.card[data-id="${crossId}"]').classList.contains('crosses-page') && /cross/.test(document.querySelector('#pages-chip').textContent)`));
    await shot('page-guides.png');
    await ex(`(() => { B().cards['${crossId}'].x = 360; renderBoard(); })()`); await sleep(250);
    check('guides: moving it inside the page clears the outline', await ex(`!document.querySelector('.card[data-id="${crossId}"]').classList.contains('crosses-page')`));
    check('guides: pages with nothing on them are marked “not printed”', await ex(`(() => { const plan = planGuidePages({ show: true, paper: 'A4', landscape: false, scale: 1 }, [{ x: 50, y: 50, w: 100, h: 100, card: true }, { x: 900, y: 1200, w: 100, h: 100, card: true }]); return plan.cols === 2 && plan.rows === 2 && plan.printed === 2 && plan.pages.filter(p => !p.number).length === 2 && plan.pages[3].number === 2; })()`));
    await ex(`setPageSetup({ landscape: true })`); await sleep(200);
    check('guides: landscape pages are wider than they are tall', await ex(`(() => { const p = document.querySelector('#page-guides .pg-page'); return parseFloat(p.style.width) > parseFloat(p.style.height); })()`));
    await ex(`setPageSetup({ landscape: false, paper: 'Letter' })`); await sleep(200);
    check('guides: Letter pages can be chosen', await ex(`Math.abs(parseFloat(document.querySelector('#page-guides .pg-page').style.width) - (8.5 * 96 - 76.8)) < 0.5`));
    await ex(`setPageSetup({ paper: 'A4', scale: 0.5 })`); await sleep(200);
    check('guides: a smaller print size fits more on each page', await ex(`Math.abs(parseFloat(document.querySelector('#page-guides .pg-page').style.width) - (8.27 * 96 - 76.8) * 2) < 1`));
    await ex(`setPageSetup({ scale: 1 })`); await sleep(200);
    check('guides: the page guide setting syncs with the board', await ex(`(() => { const remote = JSON.parse(JSON.stringify(PCSync.syncState(store))); remote.boards[cur].pages = { show: true, paper: 'Letter', landscape: true, scale: 0.75 }; remote.boards[cur]._mt = Date.now() + 5000; const m = PCSync.merge(JSON.parse(JSON.stringify(store)), remote).store; return m.boards[cur].pages.paper === 'Letter' && m.boards[cur].pages.scale === 0.75; })()`));
    // exporting follows the guides
    await ex(`openExport()`); await sleep(250);
    check('guides: with guides on, “PDF for printing › Follow the page guides” is chosen for you', await ex(`(() => { const f = document.querySelector('.export-form'); return f.elements.format.value === 'pages' && f.elements.layout.value === 'guides' && f.querySelector('.auto-only').hidden; })()`));
    await shot('export-guides.png');
    await ex(`document.querySelectorAll('.modal-actions button').forEach(b => { if (b.textContent === 'Cancel') b.click(); })`).catch(() => {});
    const expected = await ex(`planGuidePages(pageSetup(), boardShapes()).printed`);
    await ex(`flushSave()`); await sleep(400);
    const guideOut = path.join(tmp, 'plan-guides.pdf');
    const pg6 = await exportBoard({ appDir: path.join(__dirname, '..'), boardId: planId, format: 'pages', quality: 'standard', background: 'white', theme: 'light', filePath: guideOut, paper: 'A4', orientation: 'portrait', layout: 'guides' });
    const guideBuf = fs.readFileSync(guideOut);
    const guidePages = (guideBuf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
    check('guides: “Follow the page guides” prints exactly the pages shown on the board', pg6.pages === expected && guidePages === expected && expected >= 2);
    check('guides: …on A4 portrait paper', /\/MediaBox\s*\[\s*0 0 59[56](\.\d+)? 84[12](\.\d+)?\s*\]/.test(guideBuf.toString('latin1')));
    if (process.env.SHOT_DIR) fs.copyFileSync(guideOut, path.join(process.env.SHOT_DIR, 'export-guides.pdf'));
    await ex(`togglePageGuides()`); await sleep(200);
    check('guides: they can be turned off again', await ex(`!document.querySelector('#page-guides') && document.querySelector('#pages-chip').hidden && !document.querySelector('.card.crosses-page') && !document.querySelector('#pages-btn').classList.contains('on')`));
    await ex(`delete B().cards['${crossId}']; B().order = B().order.filter(i => i !== '${crossId}'); renderBoard(); flushSave()`);
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
    check('colour: the name fills in automatically', await ex(`B().cards['${swId}'].title === 'Blue' && document.querySelector('.card[data-id="${swId}"] .swatch-name').textContent.includes('Blue')`));
    check('colour: a named colour gets its exact name (#8B4513 is Saddle Brown)', await ex(`colourName('#8b4513') === 'Saddle Brown' && colourName('8B4513') === 'Saddle Brown'`));
    check('colour: different browns get different, fitting names', await ex(`colourName('#5b3600') === 'Dark Golden Brown' && colourName('#7f2e00') === 'Reddish Brown'`));
    check('colour: a colour is only given a famous name when it really is that colour', await ex(`colourName('#3a7be0') !== 'Dodger Blue' && colourName('#1e90ff') === 'Dodger Blue'`));
    check('colour: greys, navy, pink, tan and olive are described the way people say them', await ex(`colourName('#3c3c3c') === 'Charcoal Grey' && colourName('#123456') === 'Navy' && colourName('#ffb3c6') === 'Light Pink' && colourName('#c6a26b') === 'Tan' && colourName('#4a5d23') === 'Olive Green'`));
    check('colour: cards named by an older version are renamed correctly when opened', await ex(`(() => { const d = { version: 1, root: 'r', boards: { r: { id: 'r', title: 'H', parentId: null, cards: { s1: { id: 's1', type: 'swatch', x: 40, y: 40, w: 140, hex: '#7f2e00', title: 'Saddle Brown', nameAuto: true }, s2: { id: 's2', type: 'swatch', x: 200, y: 40, w: 140, hex: '#5b3600', title: 'My brown', nameAuto: false } }, order: ['s1', 's2'], links: [] } } }; migrate(d); return d.boards.r.cards.s1.title === 'Reddish Brown' && d.boards.r.cards.s2.title === 'My brown'; })()`));
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

    // ================= 1.4: online videos =================
    const vids = await ex(`[
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=1m30s', 'https://youtu.be/dQw4w9WgXcQ', 'https://www.youtube.com/shorts/abcdefghijk',
      'https://vimeo.com/76979871', 'https://vimeo.com/76979871/abc123def0', 'https://www.dailymotion.com/video/x8abc12', 'https://dai.ly/x8abc12',
      'https://www.loom.com/share/0123456789abcdef0123456789abcdef', 'https://example.com/watch?v=dQw4w9WgXcQ', 'https://www.youtube.com/channel/UC123'
    ].map(u => { const v = videoEmbed(u); return v && [v.site, v.id, v.start, v.src]; })`);
    check('video: YouTube links (watch, youtu.be, Shorts) are recognised, with start times', vids[0][0] === 'youtube' && vids[0][2] === 90 && /youtube-nocookie\.com\/embed\/dQw4w9WgXcQ\?.*start=90/.test(vids[0][3]) && vids[1][1] === 'dQw4w9WgXcQ' && vids[2][1] === 'abcdefghijk');
    check('video: Vimeo (incl. unlisted), Dailymotion and Loom are recognised', vids[3][0] === 'vimeo' && /h=abc123def0/.test(vids[4][3]) && vids[5][0] === 'dailymotion' && vids[6][1] === 'x8abc12' && vids[7][0] === 'loom');
    check('video: other web pages stay normal links', vids[8] === null && vids[9] === null);
    const vc = await ex(`(() => { addLinkCard('https://www.youtube.com/watch?v=dQw4w9WgXcQ', toWorld(700, 300)); return Object.values(B().cards).find(c => c.url === 'https://www.youtube.com/watch?v=dQw4w9WgXcQ').id; })()`);
    await sleep(300);
    check('video: a video link shows a player with a Play button (nothing loaded yet)', await ex(`(() => { const el = document.querySelector('.card[data-id="${vc}"]'); return el.classList.contains('video') && !!el.querySelector('.vid-play') && !el.querySelector('iframe'); })()`));
    await until(() => ex(`!previewLoading.has('${vc}')`), 15000); await sleep(200); // the preview (title, picture) has been fetched
    await ex(`clearSelection()`);
    await click(await centre(`.card[data-id="${vc}"] .vid-play`)); await sleep(150);
    check('video: Play opens the video in the card, using YouTube’s privacy-enhanced player', await ex(`(() => { const f = document.querySelector('.card[data-id="${vc}"] iframe'); return !!f && f.src.startsWith('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ') && /autoplay=1/.test(f.src); })()`));
    await shot('video-playing.png');
    await click(await centre(`.card[data-id="${vc}"] [data-act="video-stop"]`));
    check('video: Stop closes the player', await ex(`!document.querySelector('.card[data-id="${vc}"] iframe') && !!document.querySelector('.card[data-id="${vc}"] .vid-play')`));
    await ex(`(() => { const c = B().cards['${vc}']; c.player = false; rerenderCard(c.id); })()`);
    check('video: it can be shown as an ordinary link card instead', await ex(`!document.querySelector('.card[data-id="${vc}"]').classList.contains('video')`));
    await ex(`(() => { delete B().cards['${vc}'].player; rerenderCard('${vc}'); })()`);
    check('video: the app allows these video players and nothing else to be embedded', await ex(`document.querySelector('meta[http-equiv="Content-Security-Policy"]').content.includes('frame-src https://www.youtube-nocookie.com')`));

    // ================= 1.4: Pocket-Canvas Server, shared boards =================
    let srvMod = null, WS = null;
    try { srvMod = require('../server/pocket-canvas-server.js'); WS = require(require.resolve('ws', { paths: [path.join(__dirname, '..', 'server')] })); } catch {}
    if (!srvMod) console.log('(server tests skipped: run  cd server && npm install)');
    else {
      const srvDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pc-srv-'));
      const srv = srvMod.createServer({ dataDir: srvDir, joinCode: 'garden-gate', quiet: true });
      const sport = await srv.listen(0, '127.0.0.1');
      const SURL = `http://127.0.0.1:${sport}`;
      const postJ = async (p, body, token) => (await fetch(SURL + p, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify(body) })).json();
      const fakeDevice = (token, deviceId, deviceName) => new Promise((resolve) => {
        const ws = new WS(`ws://127.0.0.1:${sport}/ws?token=${encodeURIComponent(token)}`);
        const d = { ws, got: [], send: (m) => ws.send(JSON.stringify(m)), waitFor: async (fn, ms = 8000) => { const t = Date.now(); while (Date.now() - t < ms) { const m = [...d.got].reverse().find(fn); if (m) return m; await sleep(60); } return null; } };
        ws.on('message', (data) => d.got.push(JSON.parse(data.toString())));
        ws.on('open', () => { d.send({ t: 'hello', deviceId, deviceName }); resolve(d); });
      });

      // the app makes an account and connects
      const signedIn = await ex(`serverSignIn('${SURL}', 'Sam', 'correct horse', 'garden-gate').then(u => u.name).catch(e => 'ERR ' + e.message)`);
      check('server: you can create an account from Settings › Server', signedIn === 'Sam');
      check('server: the app connects and shows Live', await until(() => ex(`SRV.state === 'online' && document.querySelector('#server-state').textContent === 'Live'`)));
      await ex(`openSettings('server')`); await sleep(400); await shot('settings-server.png'); await ex(`settingsModal && settingsModal.close()`);

      // your other device (a pretend phone signed in as Sam)
      const samPhone = await postJ('/api/login', { name: 'Sam', password: 'correct horse' });
      const phone = await fakeDevice(samPhone.token, 'samphone0001', 'Sam’s phone');
      await ex(`addCard('note', { x: 3000, y: 200 }, { html: '<p>Written on the laptop</p>' }); flushSave()`);
      const fromApp = await phone.waitFor((m) => m.t === 'doc' && m.scope === 'me' && JSON.stringify(m.state).includes('Written on the laptop'));
      check('server: your changes reach your other devices', !!fromApp);
      const st = fromApp.state;
      st.boards[st.root].cards.phonenote1 = { id: 'phonenote1', type: 'note', x: 3300, y: 200, w: 240, color: null, html: '<p>Written on the phone</p>', _mt: Date.now() + 1000 };
      st.boards[st.root].order.push('phonenote1');
      phone.send({ t: 'doc', scope: 'me', state: st });
      check('server: changes from your other devices appear here', await until(() => ex(`!!store.boards[store.root].cards.phonenote1`)));

      // sharing a board with Alex
      const alexAcc = await postJ('/api/register', { name: 'Alex', password: 'another password', joinCode: 'garden-gate' });
      const alex = await fakeDevice(alexAcc.token, 'alexpc000001', 'Alex PC');
      const shareId = await ex(`(() => { const c = makeCard(B(), 'board', 3000, 500, { title: 'Garden plan' }); const sub = store.boards[c.boardId]; makeCard(sub, 'note', 60, 60, { html: '<p>Roses</p>' }); renderBoard(); flushSave(); return c.boardId; })()`);
      await sleep(400);
      await ex(`openShare('${shareId}')`);
      await until(() => ex(`!!document.querySelector('.share-list input[value="Alex"]')`));
      await shot('share-board.png');
      await ex(`document.querySelector('.share-list input[value="Alex"]').click(); [...document.querySelectorAll('.modal-actions button')].find(b => b.textContent === 'Share').click()`);
      const sp = await alex.waitFor((m) => m.t === 'space');
      check('server: sharing a board tells the other person', sp && sp.space.title === 'Garden plan' && sp.space.owner.name === 'Sam');
      const spDoc = await alex.waitFor((m) => m.t === 'doc' && m.scope === sp.space.id);
      check('server: they get the board and what’s on it', spDoc && Object.values(spDoc.state.boards[shareId].cards).some((c) => (c.html || '').includes('Roses')));
      check('server: only the shared board is sent to them', spDoc && Object.keys(spDoc.state.boards).length === 1 && !JSON.stringify(spDoc.state).includes('Written on the laptop'));
      check('server: shared boards show a sharing badge', await until(() => ex(`!!document.querySelector('.card.board .shared-badge') && !!document.querySelector('#tree .tree-shared')`)));
      // Alex adds a card and is looking at it
      const alexState = JSON.parse(JSON.stringify(spDoc.state));
      alexState.boards[shareId].cards.alexcard01 = { id: 'alexcard01', type: 'note', x: 340, y: 60, w: 240, color: null, html: '<p>Tulips (from Alex)</p>', _mt: Date.now() + 2000 };
      alexState.boards[shareId].order.push('alexcard01');
      alex.send({ t: 'doc', scope: sp.space.id, state: alexState });
      await ex(`go('${shareId}')`);
      check('server: changes made by someone else appear on the shared board', await until(() => ex(`!!B().cards.alexcard01 && !!document.querySelector('.card[data-id="alexcard01"]')`)));
      alex.send({ t: 'presence', space: sp.space.id, board: shareId, card: 'alexcard01', editing: true });
      check('server: you can see who else is on the board, and the card they’re typing in', await until(() => ex(`!document.querySelector('#peers').hidden && document.querySelector('#peers .peer-dot').textContent === 'A' && document.querySelector('.card[data-id="alexcard01"]').classList.contains('peer')`)));
      await shot('shared-board-live.png');
      // Sam edits; Alex gets it
      await ex(`(() => { const c = Object.values(B().cards).find(c => (c.html || '').includes('Roses')); c.html = '<p>Roses and lavender</p>'; rerenderCard(c.id); scheduleSave(); })()`);
      check('server: your changes to a shared board reach the other person', !!(await alex.waitFor((m) => m.t === 'doc' && m.scope === sp.space.id && JSON.stringify(m.state).includes('Roses and lavender'))));
      // Alex adds a picture
      const picId = 'abcdef0123456789.png';
      const png = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8cfc0f01f0005000201a3f2b9d40000000049454e44ae426082', 'hex');
      await fetch(SURL + '/api/assets/' + picId, { method: 'PUT', headers: { Authorization: 'Bearer ' + alexAcc.token }, body: png });
      alexState.boards[shareId].cards.alexpic01 = { id: 'alexpic01', type: 'image', x: 640, y: 60, w: 200, color: null, asset: picId, caption: '', _mt: Date.now() + 3000 };
      alexState.boards[shareId].order.push('alexpic01');
      alex.send({ t: 'doc', scope: sp.space.id, state: alexState });
      check('server: pictures added by someone else arrive too', await until(() => fs.existsSync(path.join(userData, 'assets', picId)), 10000));
      check('server: shared boards can’t be given a password', await ex(`lockMenuItems('${shareId}').length === 0`));
      alex.send({ t: 'leave', space: sp.space.id });
      check('server: when everyone else leaves, the board stays yours', await until(() => ex(`!isSharedRoot('${shareId}') && !!store.boards['${shareId}']`)));
      await ex(`go(store.root)`);
      await ex(`serverSignOut()`);
      check('server: signing out disconnects', await until(() => ex(`SRV.ws === null && document.querySelector('#server-state').hidden`)));
      phone.ws.close(); alex.ws.close();
      await srv.close();
      fs.rmSync(srvDir, { recursive: true, force: true });
    }

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
  if (process.env.PC_VERBOSE) console.log('cleaning up');
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
  if (process.env.PC_VERBOSE) console.log('exiting');
  app.exit(failed ? 1 : 0);
  setTimeout(() => process.exit(failed ? 1 : 0), 3000); // in case something holds the app open
})();
