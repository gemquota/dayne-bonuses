import Papa from 'papaparse';

const SHEETS = {
  raw: 'dayne-bonuses.csv',
  cleaned: 'dayne-bonuses-cleaned.csv',
  sites: 'dayne-sites.csv',
  bonusesAll: 'dayne-bonuses-all.csv'
};

const HIDDEN_COLS_CLEANED = new Set(['rollover','claimconfig','claimcondition','bonus','bonusrandom','maxtopup','referlink','is_new']);
const HEADER_RENAME = { 'mintopup': 'Min $ In', 'perceived_value': 'Value' };
const CLEANED_COL_ORDER = ['url','name','amount','minwithdraw','maxwithdraw','ratio','perceived_value','reset','mintopup'];
const KNOWN_HEADERS = ['url','mname','id','name','transactiontype','bonusfixed','amount','minwithdraw','maxwithdraw','rollover','balance','claimconfig','claimcondition','bonus','bonusrandom','reset','mintopup','maxtopup','referlink','perceived_value','is_new'];

let currentSheet = 'sites';
let rawData = null;
let cleanedData = null;
let uploadData = null;
let sortStates = {};
let nameExpandedRow = null;
let rawMnameMap = {};
let hiddenRowKeys = {};
let wideCols = {};
let sitesData = null;
let bonusesAllData = null;
let sitesSort = {};
let sitesSearch = '';
let sitesHiddenCols = new Set();
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
      sitesSort = {};
      sitesSearch = '';
      sitesHiddenCols = new Set();
      if (sitesSearchInput) sitesSearchInput.value = '';
      closeDetail();
      renderCurrent();
      return;
    }
    tabs.forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    currentSheet = tab.dataset.sheet;
    sortStates = {};
    nameExpandedRow = null;
    wideCols = {};
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
        sortStates = {};
        nameExpandedRow = null;
        wideCols = {};
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

  const keepCols = CLEANED_COL_ORDER.filter(h => hMap[h] !== undefined);
  const extraCols = headers.filter(h => !CLEANED_COL_ORDER.includes(h.toLowerCase()) && !HIDDEN_COLS_CLEANED.has(h.toLowerCase()));
  const allCols = [...keepCols, ...extraCols];

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
  const h = headers[colIdx];
  const rawA = a[colIdx] ?? '';
  const rawB = b[colIdx] ?? '';
  if (h === 'maxwithdraw' && dir === 'desc-zero-top') {
    const na = numVal(rawA); const nb = numVal(rawB);
    const aEmpty = na === null || na === 0; const bEmpty = nb === null || nb === 0;
    if (aEmpty && !bEmpty) return -1; if (!aEmpty && bEmpty) return 1;
    if (aEmpty && bEmpty) return 0; return nb - na;
  }
  if (h === 'name' || h === 'url') {
    const da = getDisplayText(a, colIdx, headers, sheet).toLowerCase();
    const db = getDisplayText(b, colIdx, headers, sheet).toLowerCase();
    if (dir === 'asc') return da.localeCompare(db); return db.localeCompare(da);
  }
  const na = numVal(rawA); const nb = numVal(rawB);
  if (na !== null && nb !== null) return dir === 'asc' ? na - nb : nb - na;
  if (na !== null) return -1; if (nb !== null) return 1;
  const sa = String(rawA).toLowerCase(); const sb = String(rawB).toLowerCase();
  if (dir === 'asc') return sa.localeCompare(sb); return sb.localeCompare(sa);
}

function getVisibleCols(headers) {
  if (currentSheet === 'cleaned') {
    return CLEANED_COL_ORDER.map(h => headers.indexOf(h)).filter(i => i !== -1);
  }
  return headers.map((h, i) => i);
}

// ── Main render ──
function renderTable() {
  let headers, rows;

  if (currentSheet === 'upload') {
    if (!uploadData) return;
    headers = uploadData[0];
    rows = uploadData.slice(1).filter(r => !isEmptyRow(r));
  } else {
    const data = currentSheet === 'raw' ? rawData : cleanedData;
    if (!data) return;
    headers = data[0];
    rows = data.slice(1).filter(r => !isEmptyRow(r));
  }

  // Raw: filter out amount=0
  if (currentSheet === 'raw') {
    const amtIdx = headers.indexOf('amount');
    if (amtIdx !== -1) {
      rows = rows.filter(r => { const v = parseFloat(r[amtIdx]); return !isNaN(v) && v > 0; });
    }
  }

  const visIdxs = getVisibleCols(headers);
  const visHeaders = visIdxs.map(i => headers[i]);

  const urlIdx = headers.indexOf('url');
  const nameIdx = headers.indexOf('name');

  // Remove hidden rows by key
  const hiddenKeys = hiddenRowKeys[currentSheet] || new Set();
  rows = rows.filter(r => !hiddenKeys.has(rowKey(r)));

  // Apply sorts
  for (const [colIdx, dir] of Object.entries(sortStates)) {
    if (dir === 'default') continue;
    const idx = parseInt(colIdx);
    rows.sort((a, b) => compareRows(a, b, idx, dir, headers, currentSheet));
  }

  sheetInfo.textContent = `${visHeaders.length} columns · ${rows.length} rows`;

  thead.innerHTML = '';
  const tr = document.createElement('tr');
  visIdxs.forEach((origIdx) => {
    const h = headers[origIdx];
    const th = document.createElement('th');
    th.textContent = HEADER_RENAME[h] || h;
    th.dataset.col = origIdx;
    th.dataset.header = h;

    const dir = sortStates[origIdx];
    const arrowSpan = document.createElement('span');
    arrowSpan.className = 'sort-arrow';
    if (dir && dir !== 'default') {
      const label = dir === 'desc-zero-top' ? ' ▼' : dir === 'asc' ? ' ▲' : ' ▼';
      th.classList.add('sorted', dir);
      arrowSpan.textContent = label;
    } else { arrowSpan.textContent = '  '; }
    th.appendChild(arrowSpan);

    // Width-toggle triangle on mname using data attribute + CSS
    if (h === 'mname') {
      th.dataset.wide = wideCols[origIdx] ? '1' : '0';
      th.classList.add('has-toggle');
      th.addEventListener('click', (e) => {
        // Only toggle on triangle click, not sort
        if (e.target.classList.contains('toggle-tri')) {
          e.stopPropagation();
          wideCols[origIdx] = !wideCols[origIdx];
          renderTable();
        }
      });
    }

    th.addEventListener('click', (e) => {
      if (h === 'mname' && e.target.classList.contains('toggle-tri')) return;
      e.stopPropagation();
      const current = sortStates[origIdx] || 'default';
      for (const key of Object.keys(sortStates)) { if (key !== String(origIdx)) sortStates[key] = 'default'; }
      if (current === 'default') sortStates[origIdx] = 'desc';
      else if (current === 'desc-zero-top') sortStates[origIdx] = 'desc';
      else if (current === 'desc') sortStates[origIdx] = 'asc';
      else sortStates[origIdx] = 'default';
      renderTable();
    });

    if (h === 'amount') th.classList.add('col-narrow');
    else if (['minwithdraw','maxwithdraw','rollover','ratio','perceived_value'].includes(h)) th.classList.add('col-mid');

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

    visIdxs.forEach((origIdx) => {
      const h = headers[origIdx];
      const td = document.createElement('td');
      let val = row[origIdx] ?? '';

      if (origIdx === urlIdx) {
        const display = getDisplayText(row, origIdx, headers, currentSheet);
        if (val) {
          const a = document.createElement('a'); a.href = val;
          a.textContent = display; a.target = '_blank'; a.rel = 'noopener';
          td.appendChild(a);
        } else { td.textContent = display; }
        td.classList.add('col-url');
        if (currentSheet === 'cleaned') td.classList.add('cleaned-width');
      } else {
        td.textContent = truncate(val);
      }

      if (['amount','minwithdraw','maxwithdraw','rollover','ratio','perceived_value'].includes(h)) {
        td.style.textAlign = 'right';
        const n = parseFloat(val);
        if (!isNaN(n)) td.textContent = (h === 'amount' || h === 'ratio' || h === 'perceived_value') ? n.toFixed(2) : n.toFixed(0);
      }

      if (h === 'amount') td.classList.add('col-narrow');
      else if (['minwithdraw','maxwithdraw','rollover','ratio','perceived_value'].includes(h)) td.classList.add('col-mid');

      if (h === 'mname' && wideCols[origIdx]) td.classList.add('col-wide');

      if (origIdx === nameIdx) {
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
  const visIdxs = headers.map((h, i) => i).filter(i => !sitesHiddenCols.has(i));

  let rows = allRows;
  if (sitesSearch.trim()) {
    const q = sitesSearch.toLowerCase();
    rows = rows.filter(r => r.some((c, i) => visIdxs.includes(i) && String(c ?? '').toLowerCase().includes(q)));
  }
  for (const [ci, dir] of Object.entries(sitesSort)) {
    if (dir === 'default') continue;
    const idx = parseInt(ci);
    rows.sort((a, b) => compareRows(a, b, idx, dir, headers, 'sites'));
  }

  sheetInfo.textContent = `${headers.length} columns · ${rows.length} sites`;
  thead.innerHTML = ''; tbody.innerHTML = '';

  const tr = document.createElement('tr');
  visIdxs.forEach(i => {
    const h = headers[i];
    const th = document.createElement('th');
    th.dataset.col = i; th.dataset.header = h;
    const dir = sitesSort[i];
    if (dir && dir !== 'default') {
      th.classList.add('sorted');
      th.innerHTML = `${h} <span class="sort-arrow">${dir === 'asc' ? '▲' : '▼'}</span>`;
    } else {
      th.textContent = h;
    }
    th.addEventListener('click', () => {
      const cur = sitesSort[i] || 'default';
      sitesSort[i] = cur === 'default' ? 'desc' : (cur === 'desc' ? 'asc' : 'default');
      renderSites();
    });
    tr.appendChild(th);
  });
  thead.appendChild(tr);

  rows.forEach(row => {
    const rTr = document.createElement('tr');
    rTr.classList.add('row-click');
    rTr.addEventListener('click', () => openSiteDetail(row[0]));
    visIdxs.forEach(i => {
      const h = headers[i];
      const td = document.createElement('td');
      const val = row[i] ?? '';
      if (i === 0 && val) {
        const a = document.createElement('a');
        a.href = val; a.textContent = stripUrl(val); a.target = '_blank'; a.rel = 'noopener';
        a.addEventListener('click', e => e.stopPropagation());
        td.appendChild(a);
      } else {
        td.textContent = fmtCell(h, val);
      }
      if (NUMERIC_SITE_COLS.has(h)) td.style.textAlign = 'right';
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
    detailSub.textContent = `Status: ${siteRow[3] || '—'} · Source: ${siteRow[2] || '—'} · Bonuses: ${siteRow[9] ?? 0} · Total: $${fmtCell('total_amount', siteRow[14])}`;
  } else {
    detailSub.textContent = '';
  }
  detailHead.innerHTML = ''; detailBody.innerHTML = '';
  const tr = document.createElement('tr');
  headers.forEach(h => {
    const th = document.createElement('th'); th.textContent = h; tr.appendChild(th);
  });
  detailHead.appendChild(tr);
  rows.forEach(row => {
    const rTr = document.createElement('tr');
    headers.forEach((h, i) => {
      const td = document.createElement('td');
      const val = row[i] ?? '';
      if (i === 0 && val) {
        const a = document.createElement('a');
        a.href = val; a.textContent = stripUrl(val); a.target = '_blank'; a.rel = 'noopener';
        td.appendChild(a);
      } else {
        td.textContent = fmtCell(h, val);
      }
      if (NUMERIC_SITE_COLS.has(h) || ['amount','perceived_value','ratio','headroom','rollover_amount','value_per_rollover','days_visible','bonus_lifetime_days'].includes(h)) {
        td.style.textAlign = 'right';
      }
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

async function init() {
  const rawRaw = await loadSheet(SHEETS.raw);
  const [rh, ...rr] = rawRaw;
  const rawRows = rr.filter(r => !isEmptyRow(r));
  rawData = [rh, ...rawRows];
  rawMnameMap = buildRawMnameMap(rh, rawRows);

  const cleanedRaw = await loadSheet(SHEETS.cleaned);
  const [ch, ...cr] = cleanedRaw;
  cleanedData = [ch, ...cr.filter(r => !isEmptyRow(r))];

  const mwIdx = ch.indexOf('maxwithdraw');
  if (mwIdx !== -1) sortStates[mwIdx] = 'desc-zero-top';

  const sitesRaw = await loadSheet(SHEETS.sites);
  const [sh, ...sr] = sitesRaw;
  sitesData = [sh, ...sr.filter(r => !isEmptyRow(r))];

  const allRaw = await loadSheet(SHEETS.bonusesAll);
  const [ah, ...ar] = allRaw;
  bonusesAllData = [ah, ...ar.filter(r => !isEmptyRow(r))];

  renderCurrent();
}

document.addEventListener('DOMContentLoaded', init);
