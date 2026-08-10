import Papa from 'papaparse';
import { TYPE_RULES, OTHER_TYPE, CAT_ORDER, CAT_RANK, COLUMN_GROUPS, OTHER_GROUP, colGroup, stripTags, classifyBonus, catHue } from './src/colors.js';

const SHEETS = {
  raw: 'dayne-bonuses.csv',
  cleaned: 'dayne-bonuses-cleaned.csv',
  sites: 'dayne-sites.csv',
  bonusesAll: 'dayne-bonuses-all.csv',
  fresh: 'dayne-bonuses-fresh.csv'
};

const HEADER_RENAME = {
  'mname': 'Merchant',
  'name': 'Bonus',
  'transactiontype': 'Tx Type',
  'mintopup': 'Min $ In',
  'perceived_value': 'Value',
  'bonusfixed': 'Fixed $',
  'rollover_amount': 'Rollover $',
  'value_per_rollover': 'Value/Roll',
  'days_visible': 'Days Visible',
  'bonus_lifetime_days': 'Lifetime Days',
  'headroom': 'Headroom',
  'minround': 'Min Rounds',
  'maxround': 'Max Rounds',
  'initialfreelimit': 'Free Limit',
  'depositfreelimit': 'Dep Free',
  'minbet': 'Min Bet',
  'transactioncash': 'Cash',
  'displayorder': 'Order',
  'balance': 'Balance',
  'claimconfig': 'Claim Config',
  'claimcondition': 'Claim Cond',
  'bonusrandom': 'Rand',
  'referlink': 'Refer',
  'is_new': 'New',
  'expiry': 'Expiry',
  'first_seen': 'First Seen',
  'last_seen': 'Last Seen',
  'angpaoid': 'Angpao ID',
  'angpaoimage': 'Angpao Img',
  'claimdatetime': 'Claim Time',
  'createddatetime': 'Created',
  'description': 'Description',
  'displayamount': 'Display Amt',
  'displaygroup': 'Display Grp',
  'minbetignorebalance': 'Bet Ignores Bal',
  'message': 'Message',
  'sysnote': 'Sys Note',
  'transactionid': 'Tx ID',
  'updata': 'Updata',
  'source': 'Source',
  'status': 'Status',
  'failures': 'Fails',
  'last_checked': 'Last Checked',
  'tracked_days': 'Tracked Days',
  'bonus_count': 'Bonuses',
  'window_count': 'Window',
  'last_24h_count': 'Last 24h',
  'prev_24h_count': 'Prev 24h',
  'distinct_days': 'Days Active',
  'total_amount': 'Total $',
  'avg_amount': 'Avg $',
  'max_amount': 'Max $',
  'total_perceived': 'Total Value',
  'avg_perceived': 'Avg Value',
  'commission_count': 'Comm Count',
  'commission_total': 'Comm $',
  'avg_minwithdraw': 'Avg Min WD',
  'avg_maxwithdraw': 'Avg Max WD',
  'avg_rollover': 'Avg Roll',
  'bonuses_per_day': 'Per Day',
  'recent_share': 'Recent Share',
  'growth_24h': 'Growth 24h',
  'hours_since_seen': 'Hours Since',
  'avg_withdraw_headroom': 'Avg Headroom',
  'avg_ratio': 'Avg Ratio',
  'avg_rollover_burden': 'Roll Burden',
  'value_per_bonus': 'Value/Bonus',
  'value_per_rollover': 'Value/Roll',
  'commission_share': 'Comm Share',
  'stability': 'Stability',
  'avg_daily_value': 'Daily Value',
  'active_today': 'Active Today',
  'referral_url': 'Referral',
  'short_url': 'Short Link'
};
const KNOWN_HEADERS = ['url','mname','id','name','transactiontype','bonusfixed','amount','minwithdraw','maxwithdraw','rollover','balance','claimconfig','claimcondition','bonus','bonusrandom','reset','mintopup','maxtopup','referlink','perceived_value','is_new'];
const NUMERIC_COLS = new Set([
  'id','amount','minwithdraw','maxwithdraw','rollover','ratio','perceived_value','mintopup','maxtopup','balance','bonus',
  'bonusfixed','headroom','rollover_amount','value_per_rollover','days_visible','bonus_lifetime_days',
  'minround','maxround','initialfreelimit','depositfreelimit','minbet','transactioncash','displayorder'
]);

function isLinkCol(h) {
  return h === 'url' || h === 'referral_url' || h === 'short_url';
}

let currentSheet = 'all';
let rawData = null;
let cleanedData = null;
let freshData = null;
let uploadData = null;
let sortStates = {};
let nameExpandedRow = null;
let rawMnameMap = {};
let hiddenRows = new Set();
let wideCols = {};
let typeFilter = null;
let sitesData = null;
let bonusesAllData = null;
let combinedData = null;
let sitesSort = {};
let sitesSearch = '';
let sitesHiddenCols = new Set();
let hiddenGroupsBySheet = {};
let siteDetailUrl = null;

const HIDDEN_STORAGE_KEY = 'dayne_hidden_rows';
function loadHiddenRows() {
  try {
    const v = JSON.parse(localStorage.getItem(HIDDEN_STORAGE_KEY) || '[]');
    hiddenRows = new Set(Array.isArray(v) ? v.filter(Boolean) : []);
  } catch { hiddenRows = new Set(); }
}
function saveHiddenRows() {
  try { localStorage.setItem(HIDDEN_STORAGE_KEY, JSON.stringify([...hiddenRows])); } catch {}
}

// ── Settings / layout state ──
const SETTINGS_KEY = 'dayne_settings';
const COL_ORDER_KEY = 'dayne_col_order';
const SAVED_SORTS_KEY = 'dayne_saved_sorts';
const DEFAULT_SETTINGS = { reorder: false, freezeUrl: true, density: 'cozy', persistSort: false };
let settings = { ...DEFAULT_SETTINGS };
let colOrder = {};
let savedSorts = {};
let siteFilter = null;
let amountFilter = null;
let rowLongPressTimer = null;
let lastDragMovedAt = 0;

function loadSettings() {
  try { settings = { ...DEFAULT_SETTINGS, ...(JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}')) }; } catch { settings = { ...DEFAULT_SETTINGS }; }
  try { colOrder = JSON.parse(localStorage.getItem(COL_ORDER_KEY) || '{}') || {}; } catch { colOrder = {}; }
  try { savedSorts = JSON.parse(localStorage.getItem(SAVED_SORTS_KEY) || '{}') || {}; } catch { savedSorts = {}; }
  applySettingsToBody();
}
function saveSettings() { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch {} }
function saveColOrder() { try { localStorage.setItem(COL_ORDER_KEY, JSON.stringify(colOrder)); } catch {} }
function saveSavedSorts() { try { localStorage.setItem(SAVED_SORTS_KEY, JSON.stringify(savedSorts)); } catch {} }
function applySettingsToBody() {
  document.body.classList.toggle('reorder-on', settings.reorder);
  document.body.classList.toggle('no-freeze', !settings.freezeUrl);
  document.body.classList.remove('density-compact', 'density-cozy');
  document.body.classList.add('density-' + (settings.density === 'compact' ? 'compact' : 'cozy'));
}

function resetAll() {
  hiddenRows = new Set(); saveHiddenRows();
  sortStates = {}; savedSorts = {}; saveSavedSorts();
  nameExpandedRow = null; wideCols = {}; typeFilter = null; siteFilter = null; amountFilter = null;
  sitesSort = {}; sitesSearch = ''; sitesHiddenCols = new Set();
  hiddenGroupsBySheet = {}; colOrder = {}; saveColOrder();
  settings = { ...DEFAULT_SETTINGS }; saveSettings(); applySettingsToBody();
  if (sitesSearchInput) sitesSearchInput.value = '';
  closeDetail();
  renderCurrent();
}

const tabs = document.querySelectorAll('.tab');
const thead = document.getElementById('tableHead');
const tbody = document.getElementById('tableBody');
const sheetInfo = document.getElementById('sheetInfo');
const fileInput = document.getElementById('fileInput');
const uploadBtn = document.getElementById('uploadBtn');
const fileName = document.getElementById('fileName');
const sitesSearchInput = document.getElementById('sitesSearch');
const colsBtn = document.getElementById('colsBtn');
const colsDropdown = document.getElementById('colsDropdown');
const sitesToolbar = document.getElementById('sitesToolbar');
const legendEl = document.getElementById('legend');
const detailOverlay = document.getElementById('detailOverlay');
const detailTitle = document.getElementById('detailTitle');
const detailSub = document.getElementById('detailSub');
const detailTable = document.getElementById('detailTable');
const detailHead = document.getElementById('detailHead');
const detailBody = document.getElementById('detailBody');
const detailClose = document.getElementById('detailClose');
const rowMenu = document.getElementById('rowMenu');
const rowMenuTitle = document.getElementById('rowMenuTitle');
const rowMenuOpts = document.getElementById('rowMenuOpts');
const rowMenuDelete = document.getElementById('rowMenuDelete');
const rowMenuCancel = document.getElementById('rowMenuCancel');
let pendingDeleteKey = null;

function showRowMenu(row, headers, x, y) {
  const nameIdx = headers ? headers.indexOf('name') : 3;
  const amtIdx = headers ? headers.indexOf('amount') : 6;
  const urlIdx = headers ? headers.indexOf('url') : 0;
  const name = nameIdx !== -1 ? stripTags(row[nameIdx] ?? '') : '';
  const amt = amtIdx !== -1 ? (row[amtIdx] ?? '') : '';
  const url = urlIdx !== -1 ? (row[urlIdx] ?? '') : '';
  rowMenuTitle.textContent = `${name}${amt !== '' && amt != null ? ' — $' + amt : ''} · ${stripUrl(url)}`;
  pendingDeleteKey = rowKey(row, headers);
  rowMenuOpts.innerHTML = '';
  const addOpt = (label, fn) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'row-menu-opt';
    b.textContent = label;
    b.addEventListener('click', () => { closeRowMenu(); fn(); });
    rowMenuOpts.appendChild(b);
  };
  if (url) addOpt('Filter: Site — ' + stripUrl(url), () => { siteFilter = url; renderCurrent(); });
  const cat = nameIdx !== -1 ? classifyBonus(row[nameIdx]).cat : null;
  if (cat) addOpt('Filter: Type — ' + cat, () => { typeFilter = cat; renderCurrent(); });
  const amtNum = parseFloat(amt);
  if (!Number.isNaN(amtNum) && amt !== '' && amt != null) {
    addOpt('Amount > $' + amtNum, () => { amountFilter = { op: '>', val: amtNum }; renderCurrent(); });
    addOpt('Amount < $' + amtNum, () => { amountFilter = { op: '<', val: amtNum }; renderCurrent(); });
  }
  addOpt('History', () => openHistory(row, headers));
  rowMenu.hidden = false;
  const vw = window.innerWidth || 320;
  const vh = window.innerHeight || 600;
  const menuW = Math.min(340, vw - 24);
  const mx = Math.max(12, Math.min(x || 120, vw - menuW - 12));
  const my = Math.max(12, Math.min(y || 120, vh - 120));
  rowMenu.style.width = menuW + 'px';
  rowMenu.style.left = mx + 'px';
  rowMenu.style.top = my + 'px';
}

function closeRowMenu() {
  rowMenu.hidden = true;
  pendingDeleteKey = null;
}

rowMenuDelete.addEventListener('click', () => {
  if (pendingDeleteKey) {
    hiddenRows.add(pendingDeleteKey);
    saveHiddenRows();
  }
  closeRowMenu();
  renderCurrent();
});
rowMenuCancel.addEventListener('click', closeRowMenu);
rowMenu.addEventListener('click', e => e.stopPropagation());
document.addEventListener('click', e => {
  if (rowMenu && !rowMenu.contains(e.target)) closeRowMenu();
});

// ── Column ordering (drag anywhere in a column, saved per sheet) ──
function applyColOrder(viewCols, sheet) {
  const saved = colOrder[sheet];
  if (!saved || !saved.length) return viewCols;
  const typeCol = viewCols.find(c => c.h === 'type');
  const reals = viewCols.filter(c => c.h !== 'type');
  const byName = new Map(reals.map(c => [c.h, c]));
  const out = [];
  saved.forEach(h => { if (byName.has(h)) { out.push(byName.get(h)); byName.delete(h); } });
  reals.forEach(c => { if (byName.has(c.h)) { out.push(c); byName.delete(c.h); } });
  if (typeCol) {
    const np = out.findIndex(c => c.h === 'name');
    out.splice(np === -1 ? 1 : np + 1, 0, typeCol);
  }
  return out;
}

let dragState = null;
const colIndicator = document.createElement('div');
colIndicator.id = 'colIndicator';
colIndicator.style.display = 'none';

function startColDrag(e, h) {
  if (!settings.reorder) return;
  dragState = { h, startX: e.clientX, startY: e.clientY, moved: false, insertAt: null };
  e.preventDefault();
  document.addEventListener('pointermove', onColDragMove);
  document.addEventListener('pointerup', onColDragEnd);
  document.addEventListener('pointercancel', onColDragEnd);
}

function onColDragMove(e) {
  if (!dragState) return;
  const dx = e.clientX - dragState.startX, dy = e.clientY - dragState.startY;
  if (!dragState.moved && Math.hypot(dx, dy) < 6) return;
  if (!dragState.moved) {
    dragState.moved = true;
    clearTimeout(rowLongPressTimer);
  }
  const ths = [...document.querySelectorAll('#tableHead th')]
    .filter(th => th.dataset.col !== '-1' && th.dataset.header !== dragState.h);
  const rects = ths.map(th => th.getBoundingClientRect());
  let insertAt = rects.length;
  for (let k = 0; k < rects.length; k++) {
    if (e.clientX < rects[k].left + rects[k].width / 2) { insertAt = k; break; }
  }
  dragState.insertAt = insertAt;
  const boundary = insertAt === 0 ? (rects[0] ? rects[0].left : e.clientX)
    : insertAt >= rects.length ? rects[rects.length - 1].right
    : (rects[insertAt - 1].right + rects[insertAt].left) / 2;
  showColIndicator(boundary);
  document.querySelectorAll('.col-dragging').forEach(el => el.classList.remove('col-dragging'));
  document.querySelectorAll('#tableBody td, #tableHead th').forEach(el => {
    if (el.dataset.h === dragState.h) el.classList.add('col-dragging');
  });
}

function onColDragEnd() {
  if (!dragState) return;
  if (dragState.moved && dragState.insertAt !== null) {
    const sheet = currentSheet;
    const viewCols = getViewCols(currentHeaders());
    const reals = viewCols.filter(c => c.h !== 'type').map(c => c.h);
    const from = reals.indexOf(dragState.h);
    if (from !== -1) {
      const item = reals.splice(from, 1)[0];
      const to = Math.max(0, Math.min(dragState.insertAt, reals.length));
      reals.splice(to, 0, item);
      colOrder[sheet] = reals;
      saveColOrder();
    }
    lastDragMovedAt = Date.now();
  }
  hideColIndicator();
  document.querySelectorAll('.col-dragging').forEach(el => el.classList.remove('col-dragging'));
  document.removeEventListener('pointermove', onColDragMove);
  document.removeEventListener('pointerup', onColDragEnd);
  document.removeEventListener('pointercancel', onColDragEnd);
  dragState = null;
  renderCurrent();
}

function showColIndicator(x) {
  const wrap = document.querySelector('.table-wrapper');
  if (!wrap) return;
  if (!wrap.contains(colIndicator)) wrap.appendChild(colIndicator);
  const wr = wrap.getBoundingClientRect();
  colIndicator.style.display = 'block';
  colIndicator.style.left = (x - wr.left + wrap.scrollLeft) + 'px';
  colIndicator.style.top = '0px';
  colIndicator.style.height = wrap.clientHeight + 'px';
}

function hideColIndicator() { colIndicator.style.display = 'none'; }

// ── History modal: every stored value of this bonus from this site ──
function openHistory(row, headers) {
  if (!bonusesAllData) return;
  const ah = bonusesAllData[0];
  const urlIdx = headers ? headers.indexOf('url') : 0;
  const nameIdx = headers ? headers.indexOf('name') : 3;
  const url = urlIdx !== -1 ? (row[urlIdx] ?? '') : '';
  const name = nameIdx !== -1 ? stripTags(row[nameIdx] ?? '') : '';
  const ai = ah.indexOf('url'), ni = ah.indexOf('name'), si = ah.indexOf('first_seen');
  const rows = bonusesAllData.slice(1)
    .filter(r => !isEmptyRow(r) && r[ai] === url && stripTags(r[ni] ?? '') === name)
    .sort((a, b) => String(b[si] || '').localeCompare(String(a[si] || '')));
  detailTitle.textContent = 'History — ' + name;
  detailSub.textContent = `${stripUrl(url)} · ${rows.length} record(s)`;
  const cols = ['amount', 'perceived_value', 'first_seen', 'last_seen', 'days_visible', 'reset', 'is_commission'];
  const names = { amount: 'Amount', perceived_value: 'Value', first_seen: 'First Seen', last_seen: 'Last Seen', days_visible: 'Days', reset: 'Reset', is_commission: 'Comm' };
  detailHead.innerHTML = '';
  const tr = document.createElement('tr');
  cols.forEach(c => { const th = document.createElement('th'); th.textContent = names[c] || c; tr.appendChild(th); });
  detailHead.appendChild(tr);
  detailBody.innerHTML = '';
  rows.forEach(r => {
    const tr2 = document.createElement('tr');
    cols.forEach(c => {
      const td = document.createElement('td');
      const i = ah.indexOf(c);
      const v = i !== -1 ? (r[i] ?? '') : '';
      td.textContent = c === 'amount' && v !== '' && v != null ? '$' + v : v;
      tr2.appendChild(td);
    });
    detailBody.appendChild(tr2);
  });
  detailOverlay.hidden = false;
}

// ── Settings panel ──
const settingsOverlay = document.getElementById('settingsOverlay');
const settingsBtn = document.getElementById('settingsBtn');
const settingsClose = document.getElementById('settingsClose');
const setReorder = document.getElementById('setReorder');
const setFreeze = document.getElementById('setFreeze');
const setDensity = document.getElementById('setDensity');
const setSort = document.getElementById('setSort');
const deletedList = document.getElementById('deletedList');
const settingsReset = document.getElementById('settingsReset');

function openSettings() {
  setReorder.checked = settings.reorder;
  setFreeze.checked = settings.freezeUrl;
  setSort.checked = settings.persistSort;
  [...setDensity.querySelectorAll('button')].forEach(b => b.classList.toggle('active', b.dataset.d === settings.density));
  renderDeletedList();
  settingsOverlay.hidden = false;
}
function closeSettings() { settingsOverlay.hidden = true; }
function renderDeletedList() {
  deletedList.innerHTML = '';
  if (!hiddenRows.size) { deletedList.innerHTML = '<div class="setting-desc">No deleted rows.</div>'; return; }
  hiddenRows.forEach(k => {
    const parts = String(k).split('|');
    const url = parts[0] || '', name = parts[2] || '', amt = parts[3] || '';
    const div = document.createElement('div'); div.className = 'deleted-item';
    const nm = document.createElement('span'); nm.className = 'di-name';
    nm.textContent = `${name} · ${stripUrl(url)}`;
    const am = document.createElement('span'); am.className = 'di-amt';
    am.textContent = amt ? '$' + amt : '';
    const rb = document.createElement('button'); rb.type = 'button'; rb.textContent = 'Restore';
    rb.addEventListener('click', () => { hiddenRows.delete(k); saveHiddenRows(); renderDeletedList(); renderCurrent(); });
    div.appendChild(nm); div.appendChild(am); div.appendChild(rb);
    deletedList.appendChild(div);
  });
}
if (settingsBtn) {
  settingsBtn.addEventListener('click', openSettings);
  settingsClose.addEventListener('click', closeSettings);
  settingsOverlay.addEventListener('click', e => { if (e.target === settingsOverlay) closeSettings(); });
  setReorder.addEventListener('change', () => {
    settings.reorder = setReorder.checked; saveSettings(); applySettingsToBody(); renderCurrent();
  });
  setFreeze.addEventListener('change', () => { settings.freezeUrl = setFreeze.checked; saveSettings(); applySettingsToBody(); });
  setSort.addEventListener('change', () => { settings.persistSort = setSort.checked; saveSettings(); });
  setDensity.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    settings.density = b.dataset.d; saveSettings(); applySettingsToBody();
    [...setDensity.querySelectorAll('button')].forEach(x => x.classList.toggle('active', x.dataset.d === settings.density));
  });
  settingsReset.addEventListener('click', () => { resetAll(); closeSettings(); });
}

tabs.forEach(tab => {
  tab.addEventListener('click', () => {
    if (tab.dataset.sheet === 'reset') {
      resetAll();
      return;
    }
    tabs.forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    currentSheet = tab.dataset.sheet;
    sortStates = (settings.persistSort && savedSorts[currentSheet]) ? { ...savedSorts[currentSheet] } : defaultSortFor(currentSheet);
    nameExpandedRow = null;
    wideCols = {};
    typeFilter = null;
    renderCurrent();
  });
});

uploadBtn.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  fileName.textContent = file.name;
  const reader = new FileReader();
  reader.onload = (ev) => {
    const csv = ev.target.result;
    Papa.parse(csv, {
      complete: (results) => {
        const processed = processUploaded(results.data);
        uploadData = processed;
        currentSheet = 'upload';
        tabs.forEach(t => t.classList.remove('active'));
        document.querySelector('[data-sheet="upload"]').classList.add('active');
        sortStates = defaultSortFor('upload');
        nameExpandedRow = null;
        wideCols = {};
        typeFilter = null;
        renderCurrent();
      }
    });
  };
  reader.readAsText(file);
});

function renderCurrent() {
  sitesToolbar.hidden = true;
  renderTable();
}

// Default column sort per sheet: highest amount first whenever an amount column exists.
function defaultSortFor(sheet) {
  const data = sheet === 'upload' ? uploadData
    : sheet === 'raw' ? rawData
    : sheet === 'fresh' ? freshData
    : sheet === 'cleaned' ? cleanedData
    : combinedData;
  if (!data || data.length < 2) return {};
  const amtIdx = data[0].indexOf('amount');
  return amtIdx !== -1 ? { [String(amtIdx)]: 'desc' } : {};
}

document.addEventListener('click', () => {
  if (nameExpandedRow !== null) {
    nameExpandedRow = null;
    renderTable();
  }
});

// ── Upload processing pipeline (handles headerless CSVs) ──
function processUploaded(rawRows) {
  if (!rawRows || rawRows.length < 2) return rawRows;
  const nonEmpty = rawRows.filter(r => r.some(c => c && String(c).trim() !== ''));

  // Detect if first row is a header row
  const first = nonEmpty[0].map(c => String(c).trim().toLowerCase());
  const isHeader = first.some(c => KNOWN_HEADERS.includes(c));

  let headers, rows;
  if (isHeader) {
    headers = nonEmpty[0];
    rows = nonEmpty.slice(1);
  } else {
    // No header row — use known headers
    headers = [...KNOWN_HEADERS];
    rows = nonEmpty;
    // Pad rows that are shorter than headers
    rows = rows.map(r => {
      const padded = [...r];
      while (padded.length < headers.length) padded.push('');
      return padded;
    });
  }

  const hMap = {};
  headers.forEach((h, i) => hMap[h.trim().toLowerCase()] = i);

  const allCols = headers.map(h => h.trim().toLowerCase());

  const newRows = rows.map(row =>
    allCols.map(h => {
      const idx = hMap[h];
      return idx !== undefined ? (row[idx] ?? '') : '';
    })
  );

  const amountIdx = allCols.indexOf('amount');
  const minwIdx = allCols.indexOf('minwithdraw');
  const maxwIdx = allCols.indexOf('maxwithdraw');
  const rolloverIdx = allCols.indexOf('rollover');
  const ratioCol = 'ratio';
  let ratioIdx = allCols.indexOf(ratioCol);
  if (ratioIdx === -1) { allCols.push(ratioCol); ratioIdx = allCols.length - 1; }

  const filtered = [];
  for (const row of newRows) {
    const amount = parseFloat(row[amountIdx] ?? 0);
    const minw = parseFloat(row[minwIdx] ?? 0);
    const maxw = parseFloat(row[maxwIdx] ?? 0);
    const ratio = amount !== 0 ? minw / amount : 0;
    row[ratioIdx] = String(ratio);
    if (amount < 0.5) continue;
    if (ratio > 1.0 && ratio < 2.0) continue;
    if (ratio - maxw > 20) continue;
    filtered.push(row);
  }

  // Move ratio after rollover/amount
  const afterCol = rolloverIdx !== -1 ? 'rollover' : 'amount';
  const afterIdx = allCols.indexOf(afterCol);
  if (ratioIdx !== afterIdx + 1 && afterIdx !== -1) {
    allCols.splice(ratioIdx, 1);
    const newRatioIdx = allCols.indexOf(afterCol) + 1;
    allCols.splice(newRatioIdx, 0, ratioCol);
    filtered.forEach(row => {
      const val = row.splice(ratioIdx > newRatioIdx ? ratioIdx - 1 : ratioIdx, 1)[0];
      row.splice(newRatioIdx, 0, val);
    });
  }
  return [allCols, ...filtered];
}

// ── Helpers ──
function truncate(str, len = 60) {
  if (!str) return ''; const s = String(str);
  return s.length > len ? s.slice(0, len) + '…' : s;
}

function stripUrl(url) {
  return url.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
}

function isEmptyRow(row) {
  return row.every(cell => !cell || String(cell).trim() === '');
}

function normAmount(val) {
  if (val === null || val === undefined || val === '') return String(val ?? '');
  const n = parseFloat(val);
  return Number.isNaN(n) ? String(val) : String(n);
}

function rowKey(row, headers) {
  let amt = '';
  if (headers) {
    const ai = headers.indexOf('amount');
    if (ai !== -1) amt = normAmount(row[ai]);
  } else {
    amt = normAmount(row[6]);
  }
  return (row[0] || '') + '|' + (row[2] || '') + '|' + (row[3] || '') + '|' + amt;
}

function numVal(v) { const n = parseFloat(v); return isNaN(n) ? null : n; }

// ── Classification helpers ──
function formatCell(val, h) {
  if (val === '' || val == null) return '';
  const n = parseFloat(val);
  if (isNaN(n)) return String(val);
  if (h === 'amount' || h === 'ratio' || h === 'perceived_value') return n.toFixed(2);
  return Number.isInteger(n) ? n.toFixed(0) : n.toFixed(3).replace(/\.?0+$/, '');
}

function getDisplayText(row, colIdx, headers, sheet) {
  const h = headers[colIdx];
  let val = row[colIdx] ?? '';
  if (h === 'url') {
    if (sheet === 'raw') return stripUrl(val);
    return rawMnameMap[val] || stripUrl(val);
  }
  return val;
}

function compareRows(a, b, colIdx, dir, headers, sheet) {
  const h = colIdx === -1 ? 'type' : headers[colIdx];
  const nameIdx = headers.indexOf('name');
  if (h === 'type') {
    const ta = classifyBonus(a[nameIdx]); const tb = classifyBonus(b[nameIdx]);
    const ra = CAT_RANK[ta.cat] ?? CAT_RANK['Other']; const rb = CAT_RANK[tb.cat] ?? CAT_RANK['Other'];
    let c = ra - rb;
    if (c === 0) c = ta.sub.localeCompare(tb.sub);
    if (c === 0) c = String(a[nameIdx] || '').localeCompare(String(b[nameIdx] || ''));
    return dir === 'asc' ? c : -c;
  }
  const rawA = a[colIdx] ?? ''; const rawB = b[colIdx] ?? '';
  if (h === 'name' || h === 'url' || h === 'mname') {
    const da = String(getDisplayText(a, colIdx, headers, sheet)).toLowerCase();
    const db = String(getDisplayText(b, colIdx, headers, sheet)).toLowerCase();
    const c = da.localeCompare(db, undefined, { numeric: true });
    return dir === 'asc' ? c : -c;
  }
  const na = numVal(rawA); const nb = numVal(rawB);
  if (na !== null && nb !== null) return dir === 'asc' ? na - nb : nb - na;
  if (na !== null) return -1; if (nb !== null) return 1;
  const sa = String(rawA).toLowerCase(); const sb = String(rawB).toLowerCase();
  const c = sa.localeCompare(sb, undefined, { numeric: true });
  return dir === 'asc' ? c : -c;
}

// Stable multi-key sort: least significant key first.
function applySort(rows, sortState, headers, sheet) {
  const keys = Object.keys(sortState).filter(k => sortState[k] !== 'default');
  for (let i = keys.length - 1; i >= 0; i--) {
    const idx = parseInt(keys[i]);
    const dir = sortState[keys[i]];
    rows.sort((a, b) => compareRows(a, b, idx, dir, headers, sheet));
  }
  return keys;
}

// Columns to render: real headers + the derived `type` column after `name`.
function getViewCols(headers) {
  const cols = headers.map((h, i) => ({ h, idx: i }));
  const namePos = cols.findIndex(c => c.h === 'name');
  if (namePos !== -1) cols.splice(namePos + 1, 0, { h: 'type', idx: -1 });
  return cols;
}

// Widths: numbers get their longest value, text gets its average length —
// clamped so columns stay narrow but readable.
function fitWidths(headers, cols, rows, numericSet) {
  const widths = {};
  const nameIdx = headers.indexOf('name');
  cols.forEach(({ h, idx }) => {
    let samples;
    if (h === 'type') samples = rows.map(r => classifyBonus(r[nameIdx]).cat);
    else if (isLinkCol(h)) samples = rows.map(r => stripUrl(r[idx]));
    else if (h === 'name') samples = rows.map(r => stripTags(r[idx]));
    else samples = rows.map(r => fmtCell(h, r[idx]));
    const lens = samples.filter(s => s !== '' && s != null).map(s => String(s).length);
    if (!lens.length) { widths[h] = 64; return; }
    const len = numericSet.has(h) || h === 'type'
      ? Math.max(...lens)
      : Math.round(lens.reduce((a, b) => a + b, 0) / lens.length);
    const headerLen = (HEADER_RENAME[h] || h).length;
    const charW = (h === 'name' || isLinkCol(h)) ? 7.3 : 7.9;
    let w = Math.max(headerLen * 6.9 + 18, len * charW + 24);
    const cap = h === 'name' ? 230 : isLinkCol(h) ? 185 : h === 'mname' ? 250 : h === 'type' ? 122 : 150;
    w = Math.min(w, cap);
    widths[h] = Math.max(48, Math.round(w));
  });
  return widths;
}

function legendChip(label, hue, count, active, onClick) {
  const b = document.createElement('button');
  b.className = 'legend-chip' + (active ? ' active' : '');
  b.style.setProperty('--hue', hue);
  b.innerHTML = `${label} <span class="count">${count}</span>`;
  b.addEventListener('click', onClick);
  return b;
}

function currentHeaders() {
  const data = currentSheet === 'upload' ? uploadData
    : currentSheet === 'raw' ? rawData
    : currentSheet === 'fresh' ? freshData
    : currentSheet === 'cleaned' ? cleanedData
    : combinedData;
  return data ? data[0] : null;
}

function hiddenGroupsFor(sheet) {
  return hiddenGroupsBySheet[sheet] || new Set();
}

// Two legend rows: bonus-type categories, then column groups.
// Column-group chips toggle whole sets of columns; url/name are always kept.
function renderLegend(counts) {
  if (!legendEl) return;
  legendEl.innerHTML = '';

  if (Object.keys(counts).length) {
    const row = document.createElement('div');
    row.className = 'legend-row';
    const label = document.createElement('span');
    label.className = 'legend-label'; label.textContent = 'Type';
    row.appendChild(label);
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    row.appendChild(legendChip('All', 215, total, typeFilter === null, () => { typeFilter = null; renderCurrent(); }));
    CAT_ORDER.forEach(cat => {
      if (!counts[cat]) return;
      row.appendChild(legendChip(cat, catHue(cat), counts[cat], typeFilter === cat,
        () => { typeFilter = typeFilter === cat ? null : cat; renderCurrent(); }));
    });
    legendEl.appendChild(row);
  }

  const headers = currentHeaders();
  if (!headers) return;
  const row = document.createElement('div');
  row.className = 'legend-row';
  const label = document.createElement('span');
  label.className = 'legend-label'; label.textContent = 'Columns';
  row.appendChild(label);
  const hidden = hiddenGroupsFor(currentSheet);
  const grpCounts = {};
  headers.forEach(h => { const g = colGroup(h).name; grpCounts[g] = (grpCounts[g] || 0) + 1; });
  COLUMN_GROUPS.forEach(g => {
    if (!grpCounts[g.name]) return;
    row.appendChild(legendChip(g.name, g.hue, grpCounts[g.name], !hidden.has(g.name), () => {
      if (!hiddenGroupsBySheet[currentSheet]) hiddenGroupsBySheet[currentSheet] = new Set();
      const set = hiddenGroupsBySheet[currentSheet];
      if (set.has(g.name)) set.delete(g.name); else set.add(g.name);
      renderCurrent();
    }));
  });
  legendEl.appendChild(row);
}

function buildHeaderArrow(th, stateKey, sortState) {
  const dir = sortState[stateKey] || 'default';
  const arrowSpan = document.createElement('span');
  arrowSpan.className = 'sort-arrow';
  if (dir !== 'default') {
    const keys = Object.keys(sortState).filter(k => sortState[k] !== 'default');
    const rank = keys.indexOf(String(stateKey)) + 1;
    th.classList.add('sorted', dir);
    arrowSpan.textContent = dir === 'asc' ? ' ▲' : ' ▼';
    if (rank > 1) {
      const badge = document.createElement('span');
      badge.className = 'sort-rank';
      badge.textContent = rank;
      th.appendChild(badge);
    }
  } else { arrowSpan.textContent = '  '; }
  th.appendChild(arrowSpan);
}

// ── Main render ──
function renderTable() {
  let headers, rows;

  const data = currentSheet === 'upload' ? uploadData
    : currentSheet === 'raw' ? rawData
    : currentSheet === 'fresh' ? freshData
    : currentSheet === 'cleaned' ? cleanedData
    : combinedData;
  if (!data) return;
  headers = data[0];
  rows = data.slice(1).filter(r => !isEmptyRow(r));

  // Raw: filter out amount=0
  if (currentSheet === 'raw') {
    const amtIdx = headers.indexOf('amount');
    if (amtIdx !== -1) {
      rows = rows.filter(r => { const v = parseFloat(r[amtIdx]); return !isNaN(v) && v > 0; });
    }
  }

  const urlIdx = headers.indexOf('url');
  const nameIdx = headers.indexOf('name');

  // Remove hidden rows by key
  rows = rows.filter(r => !hiddenRows.has(rowKey(r, headers)));

  // Category filter (legend) + counts
  const legendCounts = {};
  if (nameIdx !== -1) {
    rows.forEach(r => {
      const cat = classifyBonus(r[nameIdx]).cat;
      legendCounts[cat] = (legendCounts[cat] || 0) + 1;
    });
    if (typeFilter) rows = rows.filter(r => classifyBonus(r[nameIdx]).cat === typeFilter);
  }
  // Site / amount filters (from the row context menu)
  const fUrlIdx = headers.indexOf('url');
  const fAmtIdx = headers.indexOf('amount');
  if (siteFilter && fUrlIdx !== -1) rows = rows.filter(r => (r[fUrlIdx] || '') === siteFilter);
  if (amountFilter && fAmtIdx !== -1) {
    rows = rows.filter(r => {
      const v = parseFloat(r[fAmtIdx]);
      if (Number.isNaN(v)) return false;
      return amountFilter.op === '>' ? v > amountFilter.val : v < amountFilter.val;
    });
  }
  renderLegend(legendCounts);

  applySort(rows, sortStates, headers, currentSheet);

  const viewColsAll = applyColOrder(getViewCols(headers), currentSheet);
  const hiddenGroups = hiddenGroupsFor(currentSheet);
  const viewCols = viewColsAll.filter(c =>
    c.idx === -1 || c.h === 'url' || c.h === 'name' || !hiddenGroups.has(colGroup(c.h).name)
  );
  const widths = fitWidths(headers, viewCols, rows, ALL_NUMERIC);

  let filterNote = '';
  if (typeFilter) filterNote += ` · ${typeFilter} only`;
  if (siteFilter) filterNote += ` · site: ${stripUrl(siteFilter)}`;
  if (amountFilter) filterNote += ` · amount ${amountFilter.op} ${amountFilter.val}`;
  sheetInfo.textContent = `${viewCols.length}/${viewColsAll.length} cols · ${rows.length} rows${filterNote}`;

  thead.innerHTML = '';
  const tr = document.createElement('tr');
  viewCols.forEach(({ h, idx }) => {
    const key = String(idx);
    const th = document.createElement('th');
    th.textContent = HEADER_RENAME[h] || h;
    th.dataset.col = key;
    th.dataset.header = h;
    th.style.width = widths[h] + 'px';
    th.style.minWidth = widths[h] + 'px';
    if (ALL_NUMERIC.has(h)) th.classList.add('num');
    const grp = colGroup(h);
    th.dataset.grp = grp.name;
    th.style.setProperty('--col-hue', grp.hue);
    th.classList.add('col-grp');

    buildHeaderArrow(th, key, sortStates);

    // Width-toggle triangle on mname using data attribute + CSS
    if (h === 'mname') {
      th.dataset.wide = wideCols[idx] ? '1' : '0';
      th.classList.add('has-toggle');
      th.addEventListener('click', (e) => {
        if (e.target.classList.contains('toggle-tri')) {
          e.stopPropagation();
          wideCols[idx] = !wideCols[idx];
          renderTable();
        }
      });
    }

    th.addEventListener('click', (e) => {
      if (h === 'mname' && e.target.classList.contains('toggle-tri')) return;
      e.stopPropagation();
      const current = sortStates[key] || 'default';
      if (!e.shiftKey) for (const k of Object.keys(sortStates)) if (k !== key) sortStates[k] = 'default';
      if (current === 'default') sortStates[key] = (ALL_NUMERIC.has(h) || h === 'type') ? 'desc' : 'asc';
      else if (current === 'desc') sortStates[key] = 'asc';
      else sortStates[key] = 'default';
      if (settings.persistSort) { savedSorts[currentSheet] = { ...sortStates }; saveSavedSorts(); }
      renderTable();
    });
    if (settings.reorder) th.addEventListener('pointerdown', (e) => startColDrag(e, h));

    tr.appendChild(th);
  });
  thead.appendChild(tr);

  tbody.innerHTML = '';
  rows.forEach((row, ri) => {
    const tr = document.createElement('tr');

    let suppressClickUntil = 0;
    const cancelLongPress = () => clearTimeout(rowLongPressTimer);
    const fireLongPress = (x, y) => {
      suppressClickUntil = Date.now() + 650;
      showRowMenu(row, headers, x, y);
    };
    tr.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      rowLongPressTimer = setTimeout(() => fireLongPress(e.clientX, e.clientY), 500);
    });
    tr.addEventListener('mouseup', cancelLongPress);
    tr.addEventListener('mouseleave', cancelLongPress);
    tr.addEventListener('touchstart', (e) => {
      const t = e.touches[0];
      rowLongPressTimer = setTimeout(() => fireLongPress(t.clientX, t.clientY), 500);
    }, { passive: true });
    tr.addEventListener('touchend', cancelLongPress);
    tr.addEventListener('touchmove', cancelLongPress);
    tr.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      fireLongPress(e.clientX, e.clientY);
    });

    const type = nameIdx !== -1 ? classifyBonus(row[nameIdx]) : OTHER_TYPE;
    tr.style.setProperty('--row-hue', type.hue);

    viewCols.forEach(({ h, idx }) => {
      const td = document.createElement('td');
      td.style.maxWidth = widths[h] + 'px';
      td.dataset.h = h;
      if (settings.reorder && h !== 'type') {
        td.addEventListener('pointerdown', (e) => startColDrag(e, h));
      }

      if (idx === -1) {
        // Derived type column
        const t = classifyBonus(row[nameIdx]);
        td.className = 'col-type';
        const chip = document.createElement('span');
        chip.className = 'type-chip';
        chip.style.setProperty('--hue', t.hue);
        chip.textContent = t.cat;
        const sub = document.createElement('span');
        sub.className = 'type-sub';
        sub.style.setProperty('--hue', t.hue);
        sub.textContent = t.sub;
        td.appendChild(chip);
        td.appendChild(sub);
        td.title = `${t.cat} · ${t.sub}`;
        tr.appendChild(td);
        return;
      }

      let val = row[idx] ?? '';

      if (h === 'url') {
        const display = getDisplayText(row, idx, headers, currentSheet);
        if (val) {
          const a = document.createElement('a'); a.href = val;
          a.textContent = display; a.target = '_blank'; a.rel = 'noopener';
          a.addEventListener('click', (e) => { if (Date.now() - lastDragMovedAt < 400) e.preventDefault(); });
          td.appendChild(a);
        } else { td.textContent = display; }
        td.classList.add('col-url');
      } else if (ALL_NUMERIC.has(h)) {
        td.textContent = formatCell(val, h);
        td.classList.add('num');
      } else {
        td.textContent = truncate(val);
      }

      if (h === 'mname' && wideCols[idx]) td.classList.add('col-wide');

      if (h === 'name') {
        td.classList.add('col-name');
        if (nameExpandedRow === ri) td.classList.add('expanded');
        td.addEventListener('click', (e) => {
          if (Date.now() < suppressClickUntil) return;
          e.stopPropagation();
          nameExpandedRow = (nameExpandedRow === ri) ? null : ri;
          renderTable();
        });
        td.style.cursor = 'pointer';
      }

      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
}

// ── Sites spreadsheet (all sites from urls/oldurls + DB aggregates) ──
const NUMERIC_SITE_COLS = new Set([
  'failures','tracked_days','bonus_count','window_count','last_24h_count','prev_24h_count',
  'distinct_days','total_amount','avg_amount','max_amount','total_perceived','avg_perceived',
  'commission_count','commission_total','avg_minwithdraw','avg_maxwithdraw','avg_rollover',
  'bonuses_per_day','recent_share','growth_24h','hours_since_seen','avg_withdraw_headroom',
  'avg_ratio','avg_rollover_burden','value_per_bonus','value_per_rollover','commission_share',
  'avg_bonus_lifetime_days','stability','avg_daily_value','active_today'
]);
const ALL_NUMERIC = new Set([...NUMERIC_COLS, ...NUMERIC_SITE_COLS]);

function fmtCell(h, val) {
  if (val === null || val === undefined || val === '') return '';
  const s = String(val);
  const t = s.trim();
  if (t !== '' && /^-?\d+(\.\d+)?$/.test(t)) {
    const n = parseFloat(t);
    return n.toLocaleString('en-US', { maximumFractionDigits: 3 });
  }
  return s;
}

function renderSites() {
  if (!sitesData) return;
  const headers = sitesData[0];
  const allRows = sitesData.slice(1).filter(r => !isEmptyRow(r));
  const hiddenGroups = hiddenGroupsFor('sites');
  const visIdxs = headers.map((h, i) => i).filter(i => !sitesHiddenCols.has(i));
  const viewCols = visIdxs.map(i => ({ h: headers[i], idx: i }))
    .filter(c => c.h === 'url' || c.h === 'mname' || !hiddenGroups.has(colGroup(c.h).name));

  let rows = allRows;
  if (sitesSearch.trim()) {
    const q = sitesSearch.toLowerCase();
    const searchIdx = new Set(viewCols.map(c => c.idx));
    rows = rows.filter(r => r.some((c, i) => searchIdx.has(i) && String(c ?? '').toLowerCase().includes(q)));
  }
  applySort(rows, sitesSort, headers, 'sites');

  const widths = fitWidths(headers, viewCols, rows, NUMERIC_SITE_COLS);

  renderLegend({});
  sheetInfo.textContent = `${viewCols.length}/${headers.length} cols · ${rows.length} sites`;
  thead.innerHTML = ''; tbody.innerHTML = '';

  const tr = document.createElement('tr');
  viewCols.forEach(({ h, idx }) => {
    const th = document.createElement('th');
    th.dataset.col = idx; th.dataset.header = h;
    th.textContent = HEADER_RENAME[h] || h;
    th.style.width = widths[h] + 'px';
    th.style.minWidth = widths[h] + 'px';
    if (NUMERIC_SITE_COLS.has(h)) th.classList.add('num');
    const grp = colGroup(h);
    th.dataset.grp = grp.name;
    th.style.setProperty('--col-hue', grp.hue);
    th.classList.add('col-grp');

    buildHeaderArrow(th, idx, sitesSort);

    th.addEventListener('click', (e) => {
      e.stopPropagation();
      const cur = sitesSort[idx] || 'default';
      if (!e.shiftKey) for (const k of Object.keys(sitesSort)) if (k !== String(idx)) sitesSort[k] = 'default';
      if (cur === 'default') sitesSort[idx] = NUMERIC_SITE_COLS.has(h) ? 'desc' : 'asc';
      else if (cur === 'desc') sitesSort[idx] = 'asc';
      else sitesSort[idx] = 'default';
      renderSites();
    });
    tr.appendChild(th);
  });
  thead.appendChild(tr);

  rows.forEach(row => {
    const rTr = document.createElement('tr');
    rTr.classList.add('row-click');
    rTr.addEventListener('click', () => openSiteDetail(row[0]));
    viewCols.forEach(({ h, idx }) => {
      const td = document.createElement('td');
      td.style.maxWidth = widths[h] + 'px';
      const val = row[idx] ?? '';
      if (isLinkCol(h) && val) {
        const a = document.createElement('a');
        a.href = val; a.textContent = stripUrl(val); a.target = '_blank'; a.rel = 'noopener';
        a.addEventListener('click', e => e.stopPropagation());
        td.appendChild(a);
      } else if (NUMERIC_SITE_COLS.has(h)) {
        td.textContent = fmtCell(h, val);
        td.classList.add('num');
      } else {
        td.textContent = fmtCell(h, val);
      }
      if (h === 'status') {
        const st = String(val).toLowerCase();
        td.classList.add('chip');
        td.classList.add(st === 'ok' ? 'st-ok' : (st.includes('block') || st.includes('fail') ? 'st-bad' : 'st-warn'));
      }
      if (h === 'source') {
        td.classList.add('chip');
        if (String(val) === 'urls') td.classList.add('st-ok');
        else if (String(val) === 'oldurls') td.classList.add('st-warn');
      }
      rTr.appendChild(td);
    });
    tbody.appendChild(rTr);
  });
}

function buildColsDropdown() {
  if (!sitesData) return;
  const headers = sitesData[0];
  colsDropdown.innerHTML = '';
  headers.forEach((h, i) => {
    const label = document.createElement('label');
    const cb = document.createElement('input');
    cb.type = 'checkbox'; cb.checked = !sitesHiddenCols.has(i);
    cb.addEventListener('change', () => {
      if (cb.checked) sitesHiddenCols.delete(i); else sitesHiddenCols.add(i);
      renderSites();
    });
    const span = document.createElement('span'); span.textContent = h;
    label.appendChild(cb); label.appendChild(span);
    colsDropdown.appendChild(label);
  });
}

function openSiteDetail(url) {
  if (!bonusesAllData || !sitesData) return;
  const headers = bonusesAllData[0];
  const rows = bonusesAllData.slice(1).filter(r => r[0] === url && !isEmptyRow(r));
  const siteRow = sitesData.slice(1).find(r => r[0] === url);
  detailTitle.textContent = stripUrl(url) + (siteRow && siteRow[1] ? ' — ' + siteRow[1] : '');
  if (siteRow) {
    const siteHeaders = sitesData[0];
    const shortIdx = siteHeaders.indexOf('short_url');
    const refIdx = siteHeaders.indexOf('referral_url');
    let sub = `Status: ${siteRow[3] || '—'} · Source: ${siteRow[2] || '—'} · Bonuses: ${siteRow[9] ?? 0} · Total: $${fmtCell('total_amount', siteRow[14])}`;
    const shortVal = shortIdx !== -1 ? siteRow[shortIdx] : '';
    if (shortVal) sub += ` · Ref: ${stripUrl(shortVal)}`;
    detailSub.textContent = sub;
  } else {
    detailSub.textContent = '';
  }

  const viewCols = getViewCols(headers);
  const nameIdx = headers.indexOf('name');
  const widths = fitWidths(headers, viewCols, rows, NUMERIC_COLS);

  detailHead.innerHTML = ''; detailBody.innerHTML = '';
  const tr = document.createElement('tr');
  viewCols.forEach(({ h }) => {
    const th = document.createElement('th');
    th.textContent = HEADER_RENAME[h] || h;
    th.style.width = widths[h] + 'px';
    th.style.minWidth = widths[h] + 'px';
    if (ALL_NUMERIC.has(h)) th.classList.add('num');
    const grp = colGroup(h);
    th.dataset.grp = grp.name;
    th.style.setProperty('--col-hue', grp.hue);
    th.classList.add('col-grp');
    tr.appendChild(th);
  });
  detailHead.appendChild(tr);
  rows.forEach(row => {
    const rTr = document.createElement('tr');
    if (nameIdx !== -1) {
      const type = classifyBonus(row[nameIdx]);
      rTr.style.setProperty('--row-hue', type.hue);
    }
    viewCols.forEach(({ h, idx }) => {
      const td = document.createElement('td');
      td.style.maxWidth = widths[h] + 'px';
      const val = row[idx] ?? '';
      if (idx === -1) {
        const t = classifyBonus(row[nameIdx]);
        td.className = 'col-type';
        const chip = document.createElement('span');
        chip.className = 'type-chip';
        chip.style.setProperty('--hue', t.hue);
        chip.textContent = t.cat;
        const sub = document.createElement('span');
        sub.className = 'type-sub';
        sub.style.setProperty('--hue', t.hue);
        sub.textContent = t.sub;
        td.appendChild(chip); td.appendChild(sub);
        rTr.appendChild(td);
        return;
      }
      if (h === 'url' && val) {
        const a = document.createElement('a');
        a.href = val; a.textContent = stripUrl(val); a.target = '_blank'; a.rel = 'noopener';
        td.appendChild(a);
      } else if (ALL_NUMERIC.has(h)) {
        td.textContent = formatCell(val, h);
        td.classList.add('num');
      } else {
        td.textContent = fmtCell(h, val);
      }
      if (h === 'name') td.classList.add('col-name');
      rTr.appendChild(td);
    });
    detailBody.appendChild(rTr);
  });
  siteDetailUrl = url;
  detailOverlay.hidden = false;
}

function closeDetail() {
  detailOverlay.hidden = true;
  siteDetailUrl = null;
}

document.addEventListener('click', () => {
  if (colsDropdown && !colsDropdown.hidden) colsDropdown.hidden = true;
});

if (sitesSearchInput) {
  sitesSearchInput.addEventListener('input', () => {
    sitesSearch = sitesSearchInput.value;
    renderSites();
  });
}
if (colsBtn) {
  colsBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    buildColsDropdown();
    colsDropdown.hidden = !colsDropdown.hidden;
  });
}
if (detailClose) detailClose.addEventListener('click', closeDetail);
if (detailOverlay) {
  detailOverlay.addEventListener('click', (e) => { if (e.target === detailOverlay) closeDetail(); });
}

function buildRawMnameMap(headers, rows) {
  const urlIdx = headers.indexOf('url'); const mnameIdx = headers.indexOf('mname'); const map = {};
  rows.forEach(row => { if (urlIdx !== -1 && mnameIdx !== -1 && row[urlIdx]) map[row[urlIdx]] = row[mnameIdx]; });
  return map;
}

async function loadSheet(path) {
  const res = await fetch(path);
  const csv = await res.text();
  return new Promise(resolve => { Papa.parse(csv, { complete: results => resolve(results.data) }); });
}

// ── Combined sheet: union of every column from every CSV ──
// Bonus rows come from the all-time bonuses sheet; site-level metrics are
// joined by URL; any columns only present in raw/cleaned (e.g. `balance`)
// are backfilled from the matching bonus row by url|id|name.
function buildCombinedData() {
  if (!rawData || !cleanedData || !sitesData || !bonusesAllData) return null;
  const ah = bonusesAllData[0];
  const ar = bonusesAllData.slice(1).filter(r => !isEmptyRow(r));
  const sh = sitesData[0];
  const sr = sitesData.slice(1).filter(r => !isEmptyRow(r));
  const rh = rawData[0];
  const rr = rawData.slice(1).filter(r => !isEmptyRow(r));
  const ch = cleanedData[0];
  const cr = cleanedData.slice(1).filter(r => !isEmptyRow(r));

  const headers = [...ah];
  [...sh, ...rh, ...ch].forEach(h => { if (!headers.includes(h)) headers.push(h); });

  const ix = (hs, h) => hs.indexOf(h);
  const keyOf = (r, hs) => {
    const ai = ix(hs, 'amount');
    const amt = ai !== -1 ? normAmount(r[ai]) : '';
    return `${r[ix(hs, 'url')] ?? ''}|${r[ix(hs, 'id')] ?? ''}|${r[ix(hs, 'name')] ?? ''}|${amt}`;
  };
  const siteByUrl = new Map(sr.map(r => [r[ix(sh, 'url')], r]));
  const rawByKey = new Map(rr.map(r => [keyOf(r, rh), r]));
  const cleanedByKey = new Map(cr.map(r => [keyOf(r, ch), r]));

  const rows = ar.map(r => {
    const url = r[ix(ah, 'url')] ?? '';
    const site = siteByUrl.get(url);
    const match = rawByKey.get(keyOf(r, ah)) || cleanedByKey.get(keyOf(r, ah));
    return headers.map(h => {
      let i = ah.indexOf(h);
      if (i !== -1) return r[i] ?? '';
      if (site) { i = sh.indexOf(h); if (i !== -1) return site[i] ?? ''; }
      if (match) {
        i = rh.indexOf(h);
        if (i !== -1) return match[i] ?? '';
        i = ch.indexOf(h);
        if (i !== -1) return match[i] ?? '';
      }
      return '';
    });
  });
  return [headers, ...rows];
}

async function init() {
  loadSettings();
  loadHiddenRows();
  const rawRaw = await loadSheet(SHEETS.raw);
  const [rh, ...rr] = rawRaw;
  const rawRows = rr.filter(r => !isEmptyRow(r));
  rawData = [rh, ...rawRows];
  rawMnameMap = buildRawMnameMap(rh, rawRows);

  const cleanedRaw = await loadSheet(SHEETS.cleaned);
  const [ch, ...cr] = cleanedRaw;
  cleanedData = [ch, ...cr.filter(r => !isEmptyRow(r))];

  const freshRaw = await loadSheet(SHEETS.fresh);
  const [fh, ...fr] = freshRaw;
  freshData = [fh, ...fr.filter(r => !isEmptyRow(r))];

  const sitesRaw = await loadSheet(SHEETS.sites);
  const [sh, ...sr] = sitesRaw;
  sitesData = [sh, ...sr.filter(r => !isEmptyRow(r))];

  const allRaw = await loadSheet(SHEETS.bonusesAll);
  const [ah, ...ar] = allRaw;
  bonusesAllData = [ah, ...ar.filter(r => !isEmptyRow(r))];

  combinedData = buildCombinedData();
  const amtIdx = combinedData ? combinedData[0].indexOf('amount') : -1;
  if (amtIdx !== -1) sortStates[String(amtIdx)] = 'desc';

  renderCurrent();
}

document.addEventListener('DOMContentLoaded', init);
