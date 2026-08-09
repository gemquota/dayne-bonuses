import Papa from 'papaparse';

const SHEETS = {
  raw: 'dayne-bonuses.csv',
  cleaned: 'dayne-bonuses-cleaned.csv',
  sites: 'dayne-sites.csv',
  bonusesAll: 'dayne-bonuses-all.csv'
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

// ── Bonus classification (two levels, one cohesive hue system) ──
// Level 1 = category (hue family). Level 2 = subcategory (shade inside the family).
// Families sit next to each other on the wheel so related bonuses share neighbouring hues:
// referral/social (greens) → commission (teal) → rebate (cyan) → daily (blue) → app (steel)
// → welcome (violet) → spins (magenta) → free (gold) → deposit (orange) → vip (red).
const TYPE_RULES = [
  { cat: 'Commission', sub: 'commission', hue: 170, re: /commis/i },
  { cat: 'Referral',   sub: 'share',      hue: 138, re: /\b(share|refer(?:ral)?|invite|friend|downline|partner)\b/i },
  { cat: 'Referral',   sub: 'social',     hue: 96,  re: /\b(telegram|subscribe|official|social)\b/i },
  { cat: 'Welcome',    sub: 'welcome',    hue: 266, re: /\b(welcome|new register|register|sign\s?up|comeback|rebrand|no deposit)\b/i },
  { cat: 'Deposit',    sub: 'deposit',    hue: 30,  re: /\b(deposit|reload|top\s?up|match|1\+1|convert|pay)\b/i },
  { cat: 'Rebate',     sub: 'rebate',     hue: 187, re: /\b(rebate|rescue|cashback|cash\s?back|insurance)\b/i },
  { cat: 'Spins',      sub: 'spins',      hue: 322, re: /\b(spin|slot)\b/i },
  { cat: 'Daily',      sub: 'recurring',  hue: 210, re: /\b(daily|hourly|login|check\s?in|points?|reward|weekly|monthly|365|delights)\b/i },
  { cat: 'VIP',        sub: 'loyalty',    hue: 350, re: /\b(vip|level|exclusive|appreciation|loyalty)\b/i },
  { cat: 'App',        sub: 'app',        hue: 232, re: /\b(app|apk|download|install|android|ios)\b/i },
  { cat: 'Free',       sub: 'free',       hue: 47,  re: /\b(free|giveaway|lucky|box|angpao|envelope|bonus)\b/i },
];
const OTHER_TYPE = { cat: 'Other', sub: 'other', hue: 215 };
const CAT_ORDER = [...new Set(TYPE_RULES.map(r => r.cat))];
const CAT_RANK = {};
CAT_ORDER.forEach((c, i) => CAT_RANK[c] = i);
CAT_RANK['Other'] = CAT_ORDER.length;

// ── Column groups (one cohesive hue system, mirrors bonus categories) ──
// Every header is bucketed into a visually distinct group so whole sets of
// columns can be shown/hidden and stay color-consistent across every sheet.
const COLUMN_GROUPS = [
  { name: 'Identity', hue: 215, cols: ['url','mname','id','name','displaygroup','displayorder','image','angpaoid','angpaoimage','sysnote','message','description'] },
  { name: 'Value',    hue: 47,  cols: ['amount','perceived_value','bonus','bonusfixed','bonusrandom','balance','displayamount','transactioncash','total_amount','avg_amount','max_amount','total_perceived','avg_perceived','commission_total','value_per_bonus','avg_daily_value'] },
  { name: 'Withdraw', hue: 350, cols: ['minwithdraw','maxwithdraw','avg_minwithdraw','avg_maxwithdraw','headroom','avg_withdraw_headroom'] },
  { name: 'Rollover', hue: 187, cols: ['rollover','rollover_amount','value_per_rollover','ratio','avg_rollover','avg_ratio','avg_rollover_burden'] },
  { name: 'Limits',   hue: 30,  cols: ['mintopup','maxtopup','depositfreelimit','initialfreelimit','minround','maxround','minbet','minbetignorebalance'] },
  { name: 'Claim',    hue: 170, cols: ['claimconfig','claimcondition','claimdatetime','reset','transactiontype','transactionid','updata','referlink'] },
  { name: 'Timing',   hue: 266, cols: ['expiry','first_seen','last_seen','createddatetime','last_checked','tracked_days','days_visible','bonus_lifetime_days','avg_bonus_lifetime_days','hours_since_seen'] },
  { name: 'Flags',    hue: 138, cols: ['is_new','is_commission','is_surprise','active_today','source','status','failures'] },
  { name: 'Activity', hue: 322, cols: ['bonus_count','window_count','last_24h_count','prev_24h_count','distinct_days','bonuses_per_day','recent_share','growth_24h','stability','commission_count','commission_share'] },
  { name: 'Links',    hue: 200, cols: ['referral_url','short_url'] },
];
const OTHER_GROUP = { name: 'Other', hue: 215, cols: [] };
const GROUP_BY_COL = new Map();
COLUMN_GROUPS.forEach(g => g.cols.forEach(c => GROUP_BY_COL.set(c, g.name)));
function colGroup(h) {
  const name = GROUP_BY_COL.get(h);
  return (name && COLUMN_GROUPS.find(g => g.name === name)) || OTHER_GROUP;
}

function isLinkCol(h) {
  return h === 'url' || h === 'referral_url' || h === 'short_url';
}

let currentSheet = 'sites';
let rawData = null;
let cleanedData = null;
let uploadData = null;
let sortStates = {};
let nameExpandedRow = null;
let rawMnameMap = {};
let hiddenRowKeys = {};
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

tabs.forEach(tab => {
  tab.addEventListener('click', () => {
    if (tab.dataset.sheet === 'reset') {
      hiddenRowKeys = {};
      sortStates = {};
      nameExpandedRow = null;
      wideCols = {};
      typeFilter = null;
      sitesSort = {};
      sitesSearch = '';
      sitesHiddenCols = new Set();
      hiddenGroupsBySheet = {};
      if (sitesSearchInput) sitesSearchInput.value = '';
      closeDetail();
      renderCurrent();
      return;
    }
    tabs.forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    currentSheet = tab.dataset.sheet;
    sortStates = defaultSortFor(currentSheet);
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
  sitesToolbar.hidden = currentSheet !== 'sites';
  if (currentSheet === 'sites') { renderSites(); return; }
  renderTable();
}

// Default column sort per sheet: highest amount first whenever an amount column exists.
function defaultSortFor(sheet) {
  if (sheet === 'sites') return {};
  const data = sheet === 'upload' ? uploadData
    : sheet === 'raw' ? rawData
    : sheet === 'bonusesAll' ? bonusesAllData
    : sheet === 'combined' ? combinedData
    : cleanedData;
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

function rowKey(row) {
  return (row[0] || '') + '|' + (row[2] || '') + '|' + (row[3] || '');
}

function numVal(v) { const n = parseFloat(v); return isNaN(n) ? null : n; }

// ── Classification helpers ──
function stripTags(s) {
  return String(s || '').replace(/<[^>]*>/g, ' ').replace(/&[a-z]+;/gi, ' ').replace(/\s+/g, ' ').trim();
}
function classifyBonus(name) {
  const clean = stripTags(name);
  for (const rule of TYPE_RULES) if (rule.re.test(clean)) return rule;
  return OTHER_TYPE;
}
function catHue(cat) {
  const r = TYPE_RULES.find(r => r.cat === cat);
  return r ? r.hue : OTHER_TYPE.hue;
}
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
    : currentSheet === 'bonusesAll' ? bonusesAllData
    : currentSheet === 'combined' ? combinedData
    : currentSheet === 'sites' ? sitesData
    : cleanedData;
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
    : currentSheet === 'bonusesAll' ? bonusesAllData
    : currentSheet === 'combined' ? combinedData
    : cleanedData;
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
  const hiddenKeys = hiddenRowKeys[currentSheet] || new Set();
  rows = rows.filter(r => !hiddenKeys.has(rowKey(r)));

  // Category filter (legend) + counts
  const legendCounts = {};
  if (nameIdx !== -1) {
    rows.forEach(r => {
      const cat = classifyBonus(r[nameIdx]).cat;
      legendCounts[cat] = (legendCounts[cat] || 0) + 1;
    });
    if (typeFilter) rows = rows.filter(r => classifyBonus(r[nameIdx]).cat === typeFilter);
  }
  renderLegend(legendCounts);

  applySort(rows, sortStates, headers, currentSheet);

  const viewColsAll = getViewCols(headers);
  const hiddenGroups = hiddenGroupsFor(currentSheet);
  const viewCols = viewColsAll.filter(c =>
    c.idx === -1 || c.h === 'url' || c.h === 'name' || !hiddenGroups.has(colGroup(c.h).name)
  );
  const widths = fitWidths(headers, viewCols, rows, ALL_NUMERIC);

  sheetInfo.textContent = `${viewCols.length}/${viewColsAll.length} cols · ${rows.length} rows${typeFilter ? ` · ${typeFilter} only` : ''}`;

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
      renderTable();
    });

    tr.appendChild(th);
  });
  thead.appendChild(tr);

  tbody.innerHTML = '';
  rows.forEach((row, ri) => {
    const tr = document.createElement('tr');
    const key = rowKey(row);

    let longPressTimer = null;
    tr.addEventListener('mousedown', () => {
      longPressTimer = setTimeout(() => {
        if (!hiddenRowKeys[currentSheet]) hiddenRowKeys[currentSheet] = new Set();
        hiddenRowKeys[currentSheet].add(key);
        renderTable();
      }, 500);
    });
    tr.addEventListener('mouseup', () => clearTimeout(longPressTimer));
    tr.addEventListener('mouseleave', () => clearTimeout(longPressTimer));
    tr.addEventListener('touchstart', () => {
      longPressTimer = setTimeout(() => {
        if (!hiddenRowKeys[currentSheet]) hiddenRowKeys[currentSheet] = new Set();
        hiddenRowKeys[currentSheet].add(key);
        renderTable();
      }, 500);
    });
    tr.addEventListener('touchend', () => clearTimeout(longPressTimer));
    tr.addEventListener('touchmove', () => clearTimeout(longPressTimer));

    const type = nameIdx !== -1 ? classifyBonus(row[nameIdx]) : OTHER_TYPE;
    tr.style.setProperty('--row-hue', type.hue);

    viewCols.forEach(({ h, idx }) => {
      const td = document.createElement('td');
      td.style.maxWidth = widths[h] + 'px';

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
  const keyOf = (r, hs) => `${r[ix(hs, 'url')] ?? ''}|${r[ix(hs, 'id')] ?? ''}|${r[ix(hs, 'name')] ?? ''}`;
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
  const rawRaw = await loadSheet(SHEETS.raw);
  const [rh, ...rr] = rawRaw;
  const rawRows = rr.filter(r => !isEmptyRow(r));
  rawData = [rh, ...rawRows];
  rawMnameMap = buildRawMnameMap(rh, rawRows);

  const cleanedRaw = await loadSheet(SHEETS.cleaned);
  const [ch, ...cr] = cleanedRaw;
  cleanedData = [ch, ...cr.filter(r => !isEmptyRow(r))];

  const amtIdx = ch.indexOf('amount');
  if (amtIdx !== -1) sortStates[String(amtIdx)] = 'desc';

  const sitesRaw = await loadSheet(SHEETS.sites);
  const [sh, ...sr] = sitesRaw;
  sitesData = [sh, ...sr.filter(r => !isEmptyRow(r))];

  const allRaw = await loadSheet(SHEETS.bonusesAll);
  const [ah, ...ar] = allRaw;
  bonusesAllData = [ah, ...ar.filter(r => !isEmptyRow(r))];

  combinedData = buildCombinedData();

  renderCurrent();
}

document.addEventListener('DOMContentLoaded', init);
