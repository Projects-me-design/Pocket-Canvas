/* Pocket-Canvas — export a board as a picture (PNG) or PDF
 * Copyright (c) 2026 project-tech-me <project-tech-me@protonmail.com>
 */
'use strict';

function openExport() {
  if (!B().order.length) { toast('This board is empty'); return; }
  const body = document.createElement('form');
  body.className = 'form export-form';
  body.innerHTML = `
    <p class="muted">Exports everything on <b>${esc(B().title)}</b> exactly as it looks, at full size.</p>
    <fieldset><legend>Format</legend>
      <label class="radio"><input type="radio" name="format" value="png" checked> <span><b>Picture (PNG)</b><br><small>For sharing, chat apps and presentations</small></span></label>
      <label class="radio"><input type="radio" name="format" value="pdf"> <span><b>PDF document</b><br><small>For printing and email; text stays sharp at any zoom</small></span></label>
    </fieldset>
    <fieldset class="png-only"><legend>Quality</legend>
      <label class="radio"><input type="radio" name="quality" value="standard"> <span>Standard</span></label>
      <label class="radio"><input type="radio" name="quality" value="high" checked> <span>High (sharper, bigger file)</span></label>
    </fieldset>
    <fieldset><legend>Background</legend>
      <label class="radio"><input type="radio" name="background" value="board" checked> <span>Board colour</span></label>
      <label class="radio"><input type="radio" name="background" value="white"> <span>White</span></label>
      <label class="radio png-only"><input type="radio" name="background" value="transparent"> <span>Transparent</span></label>
    </fieldset>`;
  const sync = () => {
    const pdf = body.elements.format.value === 'pdf';
    body.querySelectorAll('.png-only').forEach((x) => { x.hidden = pdf; });
    if (pdf && body.elements.background.value === 'transparent') body.elements.background.value = 'white';
  };
  body.addEventListener('change', sync);
  sync();
  openModal({
    title: 'Export board',
    body,
    actions: [
      { label: 'Cancel' },
      {
        label: 'Export…', primary: true,
        run: async (close) => {
          const opts = {
            boardId: cur, title: B().title,
            format: body.elements.format.value,
            quality: body.elements.quality.value,
            background: body.elements.background.value,
            theme: document.documentElement.dataset.theme,
            data: JSON.stringify({ version: store.version, root: store.root, boards: store.boards, ui: {} })
          };
          close();
          await flushSave();
          toast('Exporting…');
          const r = await api.exportVisual(opts);
          if (r.canceled) return;
          if (r.error) { toast('Export failed: ' + r.error); return; }
          toast(`Exported ${opts.format === 'pdf' ? 'PDF' : 'picture'} (${r.width} × ${r.height})`, { label: 'Show file', run: () => api.showFile(r.filePath) });
        }
      }
    ]
  });
}

// ---------- Export mode: this page is being drawn in an invisible window ----------
async function runExportMode() {
  const q = new URLSearchParams(location.search);
  const format = q.get('format') === 'pdf' ? 'pdf' : 'png';
  const high = q.get('quality') === 'high';
  const background = q.get('background') || 'board';
  document.documentElement.classList.add('export-mode');
  if (background === 'white') document.documentElement.classList.add('export-white');
  if (background === 'transparent' && format === 'png') document.documentElement.classList.add('export-transparent');

  assetBase = await api.assetBase();
  let data = null;
  try { const d = await api.exportData(); if (d) data = JSON.parse(d); } catch {}
  if (!data) data = await api.load();
  if (!data || !data.boards) throw new Error('No boards found');
  store = migrate(data);
  cur = store.boards[EXPORT_MODE] ? EXPORT_MODE : store.root;
  store.ui.theme = q.get('theme') === 'dark' ? 'dark' : 'light';
  applyTheme();
  B().view = { x: 0, y: 0, z: 1 };
  renderBoard();

  // Wait for pictures, video frames and fonts.
  await Promise.all($$('img', cardsEl).map((img) => (img.complete ? null : new Promise((r) => { img.addEventListener('load', r); img.addEventListener('error', r); setTimeout(r, 8000); }))));
  await Promise.all($$('video', cardsEl).map((v) => (v.readyState >= 2 ? null : new Promise((r) => { v.addEventListener('loadeddata', r); v.addEventListener('error', r); setTimeout(r, 4000); }))));
  if (document.fonts) await document.fonts.ready;
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  drawLinks();

  const tops = $$(':scope > .card', cardsEl);
  if (!tops.length) throw new Error('This board is empty');
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  for (const el of tops) {
    const r = worldRect(el);
    x1 = Math.min(x1, r.x); y1 = Math.min(y1, r.y);
    x2 = Math.max(x2, r.x + r.w); y2 = Math.max(y2, r.y + r.h);
  }
  try {
    const bb = $('#links-g').getBBox();
    if (bb.width || bb.height) { x1 = Math.min(x1, bb.x); y1 = Math.min(y1, bb.y); x2 = Math.max(x2, bb.x + bb.width); y2 = Math.max(y2, bb.y + bb.height); }
  } catch {}
  const pad = 48;
  const w = x2 - x1, h = y2 - y1;
  let z = format === 'pdf' ? 1 : high ? 2 : 1;
  const limit = format === 'pdf' ? 19000 : 16000;   // PDF page and picture size limits
  z = Math.min(z, (limit - pad * 2) / Math.max(w, h, 1));
  B().view = { x: pad - x1 * z, y: pad - y1 * z, z };
  applyView();
  drawLinks();
  await new Promise((r) => requestAnimationFrame(r));
  await api.exportReady({ width: Math.ceil(w * z + pad * 2), height: Math.ceil(h * z + pad * 2) });
}
