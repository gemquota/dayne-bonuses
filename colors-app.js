// Colour Lab — live hue editor for the Dayne viewer's colour scheme.
// Loaded by colors.html. Edits are previewed immediately and can be copied
// back into src/colors.js (TYPE_RULES / COLUMN_GROUPS / OTHER_TYPE).

import {
  TYPE_RULES, OTHER_TYPE, CAT_ORDER, COLUMN_GROUPS,
  stripTags, classifyBonus,
} from './src/colors.js';

const STORAGE_KEY = 'dayne_color_lab';

// Overrides stored as { rules: {sub: hue}, groups: {name: hue}, other: hue }
function loadOverrides() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') || {}; } catch { return {}; }
}
function saveOverrides(o) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(o)); } catch {}
}

const ov = loadOverrides();
const state = {
  rules: TYPE_RULES.map(r => ({ ...r, hue: (ov.rules && ov.rules[r.sub] != null) ? ov.rules[r.sub] : r.hue })),
  groups: COLUMN_GROUPS.map(g => ({ ...g, hue: (ov.groups && ov.groups[g.name] != null) ? ov.groups[g.name] : g.hue })),
  other: (ov.other != null) ? ov.other : OTHER_TYPE.hue,
};

const EXAMPLES = [
  'WELCOME BONUS', 'TOP UP AUD 100', 'CASHBACK', 'SLOT DAILY BONUS', 'DAILY FREE',
  'VIP 1', 'REFER FRIEND', 'WEEKLY DOWNLINE COMMISION', 'COMMISSION',
  'APP DOWNLOAD', 'SOCIAL MEDIA', 'LUCKY BOX GIVEAWAY',
];

function hueOf(rule) { return rule ? rule.hue : state.other; }
function catHueOf(cat) {
  const r = state.rules.find(x => x.cat === cat);
  return r ? r.hue : state.other;
}
function classifyWith(name) {
  const clean = stripTags(name);
  for (const rule of state.rules) if (rule.re.test(clean)) return rule;
  return OTHER_TYPE;
}
function persist() {
  saveOverrides({
    rules: Object.fromEntries(state.rules.map(r => [r.sub, r.hue])),
    groups: Object.fromEntries(state.groups.map(g => [g.name, g.hue])),
    other: state.other,
  });
}
function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

// ── Palette (legend order) ──
function renderPalette() {
  const pal = document.getElementById('palette');
  pal.innerHTML = '';
  [...CAT_ORDER, 'Other'].forEach(cat => {
    const hue = catHueOf(cat);
    const chip = el('div', 'palette-chip');
    chip.style.setProperty('--hue', hue);
    const dot = el('span', 'dot');
    dot.style.background = `hsl(${hue}, 70%, 60%)`;
    chip.appendChild(dot);
    chip.appendChild(el('span', '', cat));
    pal.appendChild(chip);
  });
}

// ── Example chips inside a rule card ──
function buildExamples(container, names) {
  container.innerHTML = '';
  names.forEach(n => {
    const rule = classifyWith(n);
    const hue = hueOf(rule);
    const chip = el('span', 'ex-name');
    chip.textContent = n;
    chip.style.border = `1px solid hsl(${hue}, 75%, 60%)`;
    chip.style.color = `hsl(${hue}, 70%, 78%)`;
    chip.title = `${rule.cat} · ${rule.sub} (hue ${hue})`;
    container.appendChild(chip);
  });
}

// ── Rule card: slider + regex + examples ──
function ruleCard(rule) {
  const card = el('div', 'card');

  const head = el('div', 'card-head');
  const swatch = el('div', 'swatch');
  swatch.style.background = `hsl(${rule.hue}, 70%, 60%)`;
  const titles = el('div', '');
  titles.appendChild(el('div', 'card-title', `${rule.cat} — ${rule.sub}`));
  titles.appendChild(el('div', 'card-sub', `re: ${rule.re.source}`));
  head.appendChild(swatch); head.appendChild(titles);
  card.appendChild(head);

  const hueRow = el('div', 'hue-row');
  const input = document.createElement('input');
  input.type = 'range'; input.min = 0; input.max = 360; input.step = 1;
  input.value = rule.hue;
  const val = el('span', 'hue-val', String(rule.hue));
  hueRow.appendChild(input); hueRow.appendChild(val);
  card.appendChild(hueRow);

  const examples = el('div', 'examples');
  const names = EXAMPLES.filter(n => rule.re.test(stripTags(n)));
  if (!names.length) names.push(EXAMPLES.find(n => classifyWith(n) === rule) || '');
  buildExamples(examples, names.filter(Boolean));
  card.appendChild(examples);

  input.addEventListener('input', () => {
    rule.hue = parseInt(input.value, 10);
    persist();
    swatch.style.background = `hsl(${rule.hue}, 70%, 60%)`;
    val.textContent = String(rule.hue);
    buildExamples(examples, names.filter(Boolean));
    // Refresh any palette chips that share this category.
    renderPalette();
  });
  return card;
}

// ── Group card: slider + member columns ──
function groupCard(group) {
  const card = el('div', 'card');

  const head = el('div', 'card-head');
  const swatch = el('div', 'swatch');
  swatch.style.background = `hsl(${group.hue}, 70%, 60%)`;
  const titles = el('div', '');
  titles.appendChild(el('div', 'card-title', `Column group — ${group.name}`));
  titles.appendChild(el('div', 'card-sub', `${group.cols.length} column(s)`));
  head.appendChild(swatch); head.appendChild(titles);
  card.appendChild(head);

  const hueRow = el('div', 'hue-row');
  const input = document.createElement('input');
  input.type = 'range'; input.min = 0; input.max = 360; input.step = 1;
  input.value = group.hue;
  const val = el('span', 'hue-val', String(group.hue));
  hueRow.appendChild(input); hueRow.appendChild(val);
  card.appendChild(hueRow);

  const colList = el('div', 'col-list');
  group.cols.forEach(c => colList.appendChild(el('span', 'col-chip', c)));
  card.appendChild(colList);

  input.addEventListener('input', () => {
    group.hue = parseInt(input.value, 10);
    persist();
    swatch.style.background = `hsl(${group.hue}, 70%, 60%)`;
    val.textContent = String(group.hue);
  });
  return card;
}

// ── Other card (fallback hue) ──
function otherCard() {
  const card = el('div', 'card');
  const head = el('div', 'card-head');
  const swatch = el('div', 'swatch');
  swatch.style.background = `hsl(${state.other}, 70%, 60%)`;
  const titles = el('div', '');
  titles.appendChild(el('div', 'card-title', 'Other (fallback)'));
  titles.appendChild(el('div', 'card-sub', 'anything that matches no rule'));
  head.appendChild(swatch); head.appendChild(titles);
  card.appendChild(head);

  const hueRow = el('div', 'hue-row');
  const input = document.createElement('input');
  input.type = 'range'; input.min = 0; input.max = 360; input.step = 1;
  input.value = state.other;
  const val = el('span', 'hue-val', String(state.other));
  hueRow.appendChild(input); hueRow.appendChild(val);
  card.appendChild(hueRow);

  input.addEventListener('input', () => {
    state.other = parseInt(input.value, 10);
    persist();
    swatch.style.background = `hsl(${state.other}, 70%, 60%)`;
    val.textContent = String(state.other);
    renderPalette();
  });
  return card;
}

// ── Copy generated src/colors.js snippets ──
function copyOutput() {
  const re = r => `/${r.re.source}/i`;
  const lines = [];
  lines.push('const TYPE_RULES = [');
  state.rules.forEach(r => {
    lines.push(`  { cat: '${r.cat}', sub: '${r.sub}', hue: ${r.hue}, re: ${re(r)} },`);
  });
  lines.push('];');
  lines.push(`const OTHER_TYPE = { cat: 'Other', sub: 'other', hue: ${state.other} };`);
  lines.push('const COLUMN_GROUPS = [');
  state.groups.forEach(g => {
    const cols = g.cols.map(c => `'${c}'`).join(',');
    lines.push(`  { name: '${g.name}', hue: ${g.hue}, cols: [${cols}] },`);
  });
  lines.push('];');
  const out = lines.join('\n');
  const done = () => {
    const note = document.getElementById('copyNote');
    note.textContent = 'Copied — paste into src/colors.js';
    setTimeout(() => { note.textContent = ''; }, 2500);
  };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(out).then(done, () => fallbackCopy(out, done));
  } else fallbackCopy(out, done);
}
function fallbackCopy(text, done) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed'; ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand('copy'); done(); } catch {}
  ta.remove();
}

function init() {
  renderPalette();
  const rulesBox = document.getElementById('ruleCards');
  state.rules.forEach(r => rulesBox.appendChild(ruleCard(r)));
  rulesBox.appendChild(otherCard());
  const groupsBox = document.getElementById('groupCards');
  state.groups.forEach(g => groupsBox.appendChild(groupCard(g)));
  document.getElementById('copyBtn').addEventListener('click', copyOutput);
  // Keep the viewer's classifyBonus import referenced (used for parity hints).
  void classifyBonus;
}

init();
