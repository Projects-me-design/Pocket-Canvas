/* Pocket-Canvas — tables: moving rows and columns, colours and text styles
 * Copyright (c) 2026 project-tech-me <project-tech-me@protonmail.com>
 *
 * Styles are kept on the table card, lined up with its rows and columns:
 *   c.styles = { rows: [style|null…], cols: [style|null…], cells: [[style|null…]…] }
 *   style    = { bg, color, bold, italic, underline, strike }   (true/false; false = switched off on purpose)
 * A cell shows column, then row, then its own style on top. Whatever you applied last wins,
 * because applying to a row or column clears that setting from the cells (and rows) it covers.
 * Font and size stay whole-table settings (card.textStyle, see text-format.js).
 */
'use strict';

const TBL_FILLS = ['#ffffff', '#f4f1ec', '#fde2dd', '#fdeacc', '#fdf3c4', '#dcf2e2', '#d6efee', '#dbe8fb', '#e6e1fa', '#f6dcec',
  '#e8e4dc', '#d0453b', '#e0673a', '#e8a33d', '#5bb276', '#38a3a5', '#3a7be0', '#6a5fd6', '#c4579f', '#2b2823'];
const TBL_FLAGS = ['bold', 'italic', 'underline', 'strike'];
const hexOk = (v) => typeof v === 'string' && /^#[0-9a-f]{3,8}$/i.test(v);

function cleanCellStyle(s) {
  if (!s || typeof s !== 'object') return null;
  const o = {};
  if (hexOk(s.bg)) o.bg = s.bg;
  if (hexOk(s.color)) o.color = s.color;
  for (const k of TBL_FLAGS) if (typeof s[k] === 'boolean') o[k] = s[k];
  return Object.keys(o).length ? o : null;
}

// Make sure c.styles has the right shape for the table's current size (or remove it if empty).
function tableStyles(c, create = false) {
  const rows = c.rows.length, cols = tableCols(c);
  let st = c.styles;
  if (!st || typeof st !== 'object') { if (!create) return null; st = c.styles = {}; }
  const fit = (arr, n) => { const a = Array.isArray(arr) ? arr.slice(0, n) : []; while (a.length < n) a.push(null); return a.map(cleanCellStyle); };
  st.rows = fit(st.rows, rows);
  st.cols = fit(st.cols, cols);
  st.cells = fit(st.cells, rows).map((_, r) => fit(Array.isArray(st.cells && st.cells[r]) ? st.cells[r] : [], cols));
  return st;
}
// Pictures in cells: c.pics = [[assetId|null…]…], lined up with the rows and columns like the styles.
const PIC_ID = /^[0-9a-f]{16}\.[a-z0-9]{1,10}$/;
function tablePics(c, create = false) {
  if (!Array.isArray(c.pics)) { if (!create) return null; c.pics = []; }
  const rows = c.rows.length, cols = tableCols(c);
  const fit = (arr, n) => { const a = Array.isArray(arr) ? arr.slice(0, n) : []; while (a.length < n) a.push(null); return a; };
  c.pics = fit(c.pics, rows).map((row) => fit(row, cols).map((v) => (typeof v === 'string' && PIC_ID.test(v) ? v : null)));
  return c.pics;
}
function tidyPics(c) { if (Array.isArray(c.pics) && !c.pics.some((row) => row.some(Boolean))) delete c.pics; }
const cellPic = (c, r, k) => (Array.isArray(c.pics) && c.pics[r] && typeof c.pics[r][k] === 'string' && PIC_ID.test(c.pics[r][k]) ? c.pics[r][k] : null);
function setCellPic(c, r, k, id) {
  tablePics(c, true)[r][k] = id || null;
  tidyPics(c);
}
// Put a picture file (dropped, pasted or picked) into a cell.
async function fillCellPic(cardId, r, k, file) {
  const f = file.id ? file : await storeFile(file);
  const c = B().cards[cardId]; if (!c || c.type !== 'table') return;
  checkpoint();
  setCellPic(c, r, k, f.id);
  rerenderCard(cardId); scheduleSave();
}
async function pickCellPic(c, r, k) {
  const files = await api.pickFiles('image-one');
  if (files && files[0]) fillCellPic(c.id, r, k, files[0]);
}
function tablePicHtml(c, r, k) {
  const id = cellPic(c, r, k);
  return id ? `<div class="tbl-pic"><img src="${assetBase + encodeURIComponent(id)}" alt="" draggable="false"></div>` : '';
}

function tidyStyles(c) {
  const st = c.styles; if (!st) return;
  const used = (a) => a.some(Boolean);
  if (!used(st.rows || []) && !used(st.cols || []) && !(st.cells || []).some(used)) delete c.styles;
}

// What a cell actually looks like.
function cellLook(c, r, k) {
  const st = c.styles;
  if (!st) return null;
  const parts = [st.cols && st.cols[k], st.rows && st.rows[r], st.cells && st.cells[r] && st.cells[r][k]];
  const o = {};
  for (const p of parts) if (p) Object.assign(o, cleanCellStyle(p));
  return Object.keys(o).length ? o : null;
}
// Inline CSS for the cell (background) and its text.
function cellCss(look) {
  if (!look) return { td: '', text: '' };
  const deco = [look.underline && 'underline', look.strike && 'line-through'].filter(Boolean).join(' ');
  const text = [
    look.color ? `color:${look.color}` : '',
    look.bold !== undefined ? `font-weight:${look.bold ? 700 : 400}` : '',
    look.italic !== undefined ? `font-style:${look.italic ? 'italic' : 'normal'}` : '',
    (look.underline !== undefined || look.strike !== undefined) ? `text-decoration:${deco || 'none'}` : ''
  ].filter(Boolean).join(';');
  return { td: look.bg ? `background:${look.bg}` : '', text };
}

// ---------- Row and column changes that keep the styles lined up ----------
function tblInsertRow(c, at, cells) {
  const cols = tableCols(c);
  const st = tableStyles(c), pics = tablePics(c);
  c.rows.splice(at, 0, cells || Array(cols).fill(''));
  if (st) { st.rows.splice(at, 0, null); st.cells.splice(at, 0, Array(cols).fill(null)); }
  if (pics) pics.splice(at, 0, Array(cols).fill(null));
}
function tblDeleteRow(c, r) {
  const st = tableStyles(c), pics = tablePics(c);
  c.rows.splice(r, 1);
  if (st) { st.rows.splice(r, 1); st.cells.splice(r, 1); tidyStyles(c); }
  if (pics) { pics.splice(r, 1); tidyPics(c); }
}
function tblInsertCol(c, at) {
  const st = tableStyles(c), pics = tablePics(c);
  c.rows.forEach((row) => { while (row.length < at) row.push(''); row.splice(at, 0, ''); });
  if (st) { st.cols.splice(at, 0, null); st.cells.forEach((row) => row.splice(at, 0, null)); }
  if (pics) pics.forEach((row) => row.splice(at, 0, null));
}
function tblDeleteCol(c, k) {
  const st = tableStyles(c), pics = tablePics(c);
  c.rows.forEach((row) => row.splice(k, 1));
  if (st) { st.cols.splice(k, 1); st.cells.forEach((row) => row.splice(k, 1)); tidyStyles(c); }
  if (pics) { pics.forEach((row) => row.splice(k, 1)); tidyPics(c); }
}
const moveItem = (a, from, to) => { const [x] = a.splice(from, 1); a.splice(to, 0, x); };
// Move row `from` so it ends up at position `to` (both 0-based, `to` after removal).
function tblMoveRow(c, from, to) {
  if (from === to || to < 0 || to >= c.rows.length) return false;
  const st = tableStyles(c), pics = tablePics(c);
  moveItem(c.rows, from, to);
  if (st) { moveItem(st.rows, from, to); moveItem(st.cells, from, to); }
  if (pics) moveItem(pics, from, to);
  return true;
}
function tblMoveCol(c, from, to) {
  const cols = tableCols(c);
  if (from === to || to < 0 || to >= cols) return false;
  const st = tableStyles(c), pics = tablePics(c);
  c.rows.forEach((row) => { while (row.length < cols) row.push(''); moveItem(row, from, to); });
  if (st) { moveItem(st.cols, from, to); st.cells.forEach((row) => moveItem(row, from, to)); }
  if (pics) pics.forEach((row) => moveItem(row, from, to));
  return true;
}

// Move with undo, redraw, save, and keep editing / highlighting the moved cell.
function moveTablePart(c, what, from, to, editAfter) {
  const n = what === 'row' ? c.rows.length : tableCols(c);
  if (from === to || to < 0 || to >= n) return false;
  checkpoint();
  if (what === 'row') tblMoveRow(c, from, to); else tblMoveCol(c, from, to);
  if (lastTableCell && lastTableCell.id === c.id) {
    if (what === 'row' && lastTableCell.r === from) lastTableCell.r = to;
    if (what === 'col' && lastTableCell.k === from) lastTableCell.k = to;
  }
  const el = rerenderCard(c.id); scheduleSave();
  if (el) {
    const sel = what === 'row' ? `td[data-r="${to}"]` : `td[data-c="${to}"]`;
    $$(sel, el).forEach((td) => { td.classList.add('moved'); setTimeout(() => td.classList.remove('moved'), 700); });
  }
  if (editAfter) startEditOf(c.id, `[data-field="cell:${editAfter.r}:${editAfter.k}"]`);
  return true;
}

// ---------- Applying colours and text styles ----------
// scope: 'cell' | 'row' | 'col' | 'table'; prop: 'bg' | 'color' | 'bold' | … ; value: colour, true/false, or null to remove
function setTableStyle(c, scope, r, k, prop, value) {
  if (scope === 'table') {
    // the whole table: text settings go on the card; fills are cleared from everywhere, then set on every column
    const st = tableStyles(c, true);
    const strip = (s) => { if (s) delete s[prop]; };
    st.rows.forEach(strip); st.cols.forEach(strip); st.cells.forEach((row) => row.forEach(strip));
    if (prop === 'bg') { if (value != null) st.cols = st.cols.map((s) => ({ ...(s || {}), bg: value })); }
    else {
      const ts = Object.assign({}, cleanTextStyle(c.textStyle));
      if (value == null || value === false) delete ts[prop === 'color' ? 'color' : prop]; else ts[prop === 'color' ? 'color' : prop] = value;
      c.textStyle = cleanTextStyle(ts); if (!c.textStyle) delete c.textStyle;
    }
    st.rows = st.rows.map(cleanCellStyle); st.cols = st.cols.map(cleanCellStyle); st.cells = st.cells.map((row) => row.map(cleanCellStyle));
    tidyStyles(c);
    return;
  }
  const st = tableStyles(c, true);
  const put = (arr, i) => {
    const s = Object.assign({}, arr[i]);
    if (value == null) delete s[prop]; else s[prop] = value;
    arr[i] = cleanCellStyle(s);
  };
  const strip = (arr, i) => { if (arr[i]) { const s = { ...arr[i] }; delete s[prop]; arr[i] = cleanCellStyle(s); } };
  if (scope === 'cell') put(st.cells[r], k);
  else if (scope === 'row') {
    put(st.rows, r);
    st.cells[r].forEach((_, kk) => strip(st.cells[r], kk));
  } else if (scope === 'col') {
    // columns sit under rows, so where a row has its own setting, write it into those cells instead
    st.cells.forEach((row, rr) => {
      strip(row, k);
      if (st.rows[rr] && st.rows[rr][prop] !== undefined && value != null) { const s = { ...(row[k] || {}) }; s[prop] = value; row[k] = cleanCellStyle(s); }
    });
    put(st.cols, k);
  }
  tidyStyles(c);
}
function clearTableStyle(c, scope, r, k) {
  if (scope === 'table') { delete c.styles; delete c.textStyle; return; }
  const st = tableStyles(c); if (!st) return;
  if (scope === 'cell') st.cells[r][k] = null;
  if (scope === 'row') { st.rows[r] = null; st.cells[r] = st.cells[r].map(() => null); }
  if (scope === 'col') { st.cols[k] = null; st.cells.forEach((row) => { row[k] = null; }); }
  tidyStyles(c);
}

// ---------- In the formatting bar while typing in a cell ----------
let tblScope = 'cell';
const TBL_SCOPE_NAMES = { cell: 'This cell', row: 'This row', col: 'This column', table: 'Whole table' };
function editingCell() {
  if (typeof fmtEd === 'undefined' || !fmtEd || !fmtEd.dataset.field || !fmtEd.dataset.field.startsWith('cell:')) return null;
  const card = fmtEd.closest('.card'); const c = card && B().cards[card.dataset.id];
  if (!c || c.type !== 'table') return null;
  const [, r, k] = fmtEd.dataset.field.split(':').map(Number);
  return { c, r, k, card };
}
// The bar asks this first; returns true when it handled the change for a table cell.
function tableFormat(kind, value) {
  const t = editingCell(); if (!t) return false;
  const { c, r, k } = t;
  if (kind === 'font' || kind === 'size') return false; // whole-table settings, handled by the bar as before
  checkpoint();
  if (kind === 'clear') clearTableStyle(c, tblScope, r, k);
  else if (TBL_FLAGS.includes(kind)) {
    const look = tblScope === 'table' ? (cleanTextStyle(c.textStyle) || {}) : (cellLook(c, r, k) || {});
    const header = c.header && r === 0 && kind === 'bold' && look.bold === undefined && tblScope !== 'table';
    setTableStyle(c, tblScope, r, k, kind, !(look[kind] || header));
  } else if (kind === 'colour') setTableStyle(c, tblScope, r, k, 'color', value || null);
  else if (kind === 'fill') setTableStyle(c, tblScope, r, k, 'bg', value || null);
  refreshTableLooks(c, t.card);
  scheduleSave();
  return true;
}
// Restyle the cells in place (rebuilding the card would stop the typing).
function refreshTableLooks(c, card) {
  applyCardTextStyle(card, c);
  $$('.tbl td[data-r]', card).forEach((td) => {
    const css = cellCss(cellLook(c, +td.dataset.r, +td.dataset.c));
    td.setAttribute('style', css.td);
    const ed = td.querySelector('.editable'); if (ed) ed.setAttribute('style', css.text);
    td.classList.toggle('styled', !!css.td);
  });
  showScopeHint();
}
// Shade the cells the bar will change while the pointer is over the bar.
function showScopeHint(on) {
  const t = editingCell();
  $$('.tbl td.scope-hint').forEach((td) => td.classList.remove('scope-hint'));
  if (!t || !on) return;
  const sel = tblScope === 'cell' ? `td[data-r="${t.r}"][data-c="${t.k}"]` : tblScope === 'row' ? `td[data-r="${t.r}"]` : tblScope === 'col' ? `td[data-c="${t.k}"]` : 'td[data-r]';
  $$('.tbl ' + sel, t.card).forEach((td) => td.classList.add('scope-hint'));
}

// Extra controls added to the formatting bar, shown only while typing in a table.
(function addTableControls() {
  if (typeof fmtBar === 'undefined') return;
  const wrap = document.createElement('span');
  wrap.className = 'fb-table';
  wrap.innerHTML = `<button class="fb-drop" data-fb="tscope" title="What the buttons change"><span class="fb-scope-label">This cell</span> ▾</button>
    <button class="fb-drop fb-fill" data-fb="fill" title="Fill colour"><svg viewBox="0 0 24 24" width="15" height="15"><path d="M5 11l7-7 7 7-7 7z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M19 15s2 2.4 2 3.6a2 2 0 0 1-4 0c0-1.2 2-3.6 2-3.6z" fill="currentColor"/></svg><span class="fb-fill-col"></span></button>
    <span class="fb-sep"></span>`;
  fmtBar.insertBefore(wrap, fmtBar.firstChild);
  fmtBar.addEventListener('mouseenter', () => showScopeHint(true));
  fmtBar.addEventListener('mouseleave', () => showScopeHint(false));
  // our buttons run before the bar's own handler
  fmtBar.addEventListener('click', (e) => {
    const item = e.target.closest('.fb-pop [data-v]');
    if (item && (fbPop.dataset.kind === 'tscope' || fbPop.dataset.kind === 'fill')) {
      e.stopImmediatePropagation();
      fbPop.hidden = true;
      if (fbPop.dataset.kind === 'tscope') { tblScope = item.dataset.v; updateTableControls(); showScopeHint(true); }
      else tableFormat('fill', item.dataset.v || null);
      return;
    }
    const btn = e.target.closest('[data-fb]'); if (!btn) return;
    const k = btn.dataset.fb;
    if (k === 'tscope' || k === 'fill') { e.stopImmediatePropagation(); openTablePop(k, btn); }
  }, true);
})();
function openTablePop(kind, btn) {
  if (!fbPop.hidden && fbPop.dataset.kind === kind) { fbPop.hidden = true; return; }
  fbPop.dataset.kind = kind;
  if (kind === 'tscope') {
    fbPop.innerHTML = Object.entries(TBL_SCOPE_NAMES).map(([v, label]) => `<button class="fb-item ${v === tblScope ? 'on' : ''}" data-v="${v}">${label}</button>`).join('');
  } else {
    fbPop.innerHTML = `<div class="fb-cols fills">${TBL_FILLS.map((col) =>
      `<button class="fb-col" data-v="${col}" style="--sw:${col}" title="${esc(colourName(col))}"></button>`).join('')}</div>
      <label class="fb-item fb-custom">Pick any colour… <input type="color" value="#fdf3c4"></label>
      <button class="fb-item" data-v="">No fill</button>`;
    const inp = fbPop.querySelector('input[type=color]');
    inp.addEventListener('change', () => { fbPop.hidden = true; tableFormat('fill', inp.value); updateTableControls(); });
  }
  fbPop.className = 'fb-pop ' + kind;
  fbPop.hidden = false;
  fbPop.style.left = btn.offsetLeft + 'px';
}
// Show the table controls (and the right button states) for the cell being edited.
function updateTableControls() {
  const t = editingCell();
  fmtBar.classList.toggle('in-table', !!t);
  if (!t) return;
  $('.fb-scope-label', fmtBar).textContent = TBL_SCOPE_NAMES[tblScope];
  const look = Object.assign({}, cleanTextStyle(t.c.textStyle), cellLook(t.c, t.r, t.k) || {});
  if (t.c.header && t.r === 0 && look.bold === undefined) look.bold = true;
  for (const k of TBL_FLAGS) $(`[data-fb="${k}"]`, fmtBar).classList.toggle('on', !!look[k]);
  $('.fb-bar-col', fmtBar).style.background = look.color || 'currentColor';
  $('.fb-fill-col', fmtBar).style.background = look.bg || 'transparent';
}
// Called whenever the bar updates (see text-format.js).
const _updateFormatBar = updateFormatBar;
updateFormatBar = function () { _updateFormatBar(); updateTableControls(); };
// New cell, new choice: each time you start typing in a different table, go back to "This cell".
let tblScopeCard = null;
cardsEl.addEventListener('focusin', (e) => {
  const t = editingCell();
  if (t && t.c.id !== tblScopeCard) { tblScopeCard = t.c.id; tblScope = 'cell'; }
  updateTableControls();
});

// Start editing a cell with the bar set to a scope and the fill (or text colour) list open — from the right-click menu.
function styleTablePart(c, r, k, scope, open = 'fill') {
  selectOnly(c.id);
  startEditOf(c.id, `[data-field="cell:${r}:${k}"]`);
  setTimeout(() => {
    tblScope = scope; tblScopeCard = c.id;
    updateTableControls();
    const btn = $(`[data-fb="${open}"]`, fmtBar);
    if (btn && !fmtBar.hidden) { fbPop.hidden = true; open === 'fill' ? openTablePop('fill', btn) : openFormatPop('colour', btn); }
    showScopeHint(true); setTimeout(() => showScopeHint(false), 1200);
  }, 60);
}

// ---------- Dragging rows and columns by their grips ----------
// Grips sit on the top edge of each column and the left edge of each row; they show when you point at the table.
function tableGrips(ri, ci) {
  return (ri === 0 ? `<button class="tbl-grip col" data-grip="col" data-i="${ci}" title="Drag to move this column" tabindex="-1"></button>` : '') +
    (ci === 0 ? `<button class="tbl-grip row" data-grip="row" data-i="${ri}" title="Drag to move this row" tabindex="-1"></button>` : '');
}
cardsEl.addEventListener('pointerdown', (e) => {
  const grip = e.target.closest && e.target.closest('.tbl-grip');
  if (!grip || e.button !== 0) return;
  e.preventDefault(); e.stopPropagation(); // not a card drag
  const card = grip.closest('.card'); const c = B().cards[card.dataset.id]; if (!c) return;
  if (!selected.has(c.id)) selectOnly(c.id);
  if (document.activeElement && document.activeElement.isContentEditable) document.activeElement.blur();
  const what = grip.dataset.grip, from = +grip.dataset.i;
  const cells = () => what === 'row' ? $$('.tbl tr', card).map((tr) => tr.firstElementChild) : $$('.tbl tr:first-child td', card);
  const all = what === 'row' ? (i) => $$(`.tbl td[data-r="${i}"]`, card) : (i) => $$(`.tbl td[data-c="${i}"]`, card);
  all(from).forEach((td) => td.classList.add('dragging'));
  card.classList.add('tbl-moving');
  let to = from, moved = false;
  const sx = e.clientX, sy = e.clientY;
  const mark = () => {
    $$('.tbl td', card).forEach((td) => td.classList.remove('drop-before', 'drop-after', 'drop-left', 'drop-right'));
    if (to === from) return;
    const cls = what === 'row' ? (to > from ? 'drop-after' : 'drop-before') : (to > from ? 'drop-right' : 'drop-left');
    all(to).forEach((td) => td.classList.add(cls));
  };
  const move = (ev) => {
    if (!moved && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 4) return;
    moved = true;
    // drop onto a row/column to take its place
    const list = cells();
    const p = what === 'row' ? ev.clientY : ev.clientX;
    let i = 0;
    list.forEach((td, n) => { const r = td.getBoundingClientRect(); if (p >= (what === 'row' ? r.top : r.left)) i = n; });
    to = i;
    mark();
  };
  const up = () => {
    document.removeEventListener('pointermove', move);
    document.removeEventListener('pointerup', up);
    document.removeEventListener('pointercancel', up);
    card.classList.remove('tbl-moving');
    $$('.tbl td', card).forEach((td) => td.classList.remove('dragging', 'drop-before', 'drop-after', 'drop-left', 'drop-right'));
    if (moved && to !== from) moveTablePart(c, what, from, to);
    else if (!moved) {
      // a click on a grip: remember that row/column for "− Row" / "− Column" and the colour menu
      lastTableCell = { id: c.id, r: what === 'row' ? from : 0, k: what === 'col' ? from : 0 };
      all(from).forEach((td) => { td.classList.add('moved'); setTimeout(() => td.classList.remove('moved'), 500); });
    }
  };
  document.addEventListener('pointermove', move);
  document.addEventListener('pointerup', up);
  document.addEventListener('pointercancel', up);
}, true);
// Right-click on a grip shows that row's or column's menu.
cardsEl.addEventListener('contextmenu', (e) => {
  const grip = e.target.closest && e.target.closest('.tbl-grip');
  if (!grip) return;
  e.preventDefault(); e.stopPropagation();
  const card = grip.closest('.card'); const c = B().cards[card.dataset.id]; if (!c) return;
  if (!selected.has(c.id)) selectOnly(c.id);
  const i = +grip.dataset.i;
  showMenu(e.clientX, e.clientY, grip.dataset.grip === 'row' ? tableMenuItems(c, i, 0, 'row') : tableMenuItems(c, 0, i, 'col'));
}, true);

// ---------- Pictures in cells: drop, paste, double-click ----------
// Drop a picture file onto a cell (runs before the board's own drop, which would add a picture card).
viewport.addEventListener('drop', async (e) => {
  const td = e.target.closest && e.target.closest('.card.table td[data-r]');
  const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
  if (!td || !f || fileKind(f.name, f.type) !== 'image') return;
  e.preventDefault(); e.stopImmediatePropagation();
  viewport.classList.remove('drop-over');
  $$('.tbl td.pic-drop').forEach((x) => x.classList.remove('pic-drop'));
  await fillCellPic(td.closest('.card').dataset.id, +td.dataset.r, +td.dataset.c, f);
}, true);
viewport.addEventListener('dragover', (e) => {
  const td = e.target.closest && e.target.closest('.card.table td[data-r]');
  $$('.tbl td.pic-drop').forEach((x) => { if (x !== td) x.classList.remove('pic-drop'); });
  if (td && [...e.dataTransfer.types].includes('Files')) td.classList.add('pic-drop');
});
viewport.addEventListener('dragleave', (e) => { if (e.target === viewport) $$('.tbl td.pic-drop').forEach((x) => x.classList.remove('pic-drop')); });
// Paste a picture while typing in a cell.
cardsEl.addEventListener('paste', (e) => {
  const ed = e.target.closest && e.target.closest('.editable[data-field^="cell:"]');
  if (!ed || !ed.isContentEditable) return;
  const file = [...(e.clipboardData.files || [])].find((f) => /^image\//.test(f.type));
  if (!file) return;
  e.preventDefault(); e.stopImmediatePropagation();
  const [, r, k] = ed.dataset.field.split(':').map(Number);
  const id = ed.closest('.card').dataset.id;
  setField(B().cards[id], ed.dataset.field, ed);
  ed.blur();
  fillCellPic(id, r, k, file);
}, true);
// Double-click a picture in a cell to open it.
cardsEl.addEventListener('dblclick', (e) => {
  const pic = e.target.closest && e.target.closest('.tbl-pic');
  if (!pic) return;
  const td = pic.closest('td[data-r]'); const c = B().cards[pic.closest('.card').dataset.id];
  const id = c && cellPic(c, +td.dataset.r, +td.dataset.c);
  if (id) { e.stopPropagation(); api.openAsset(id); }
});
