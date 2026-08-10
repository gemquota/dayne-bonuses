// Shared colour scheme + bonus classification for the Dayne viewer.
// Level 1 = category (hue family). Level 2 = subcategory (shade inside the family).
// Hues are spaced so categories that sit next to each other in the legend stay
// visually distinct (>= ~35deg between neighbours) while related families keep
// neighbouring hues: commission (teal) ~ referral (green) ~ rebate (cyan) ~
// daily (blue) ~ app (indigo) ~ welcome (violet) ~ spins (magenta) ~ vip (rose)
// ~ deposit/free (orange/gold).

const TYPE_RULES = [
  { cat: 'Commission', sub: 'commission', hue: 168, re: /commis/i },
  { cat: 'Referral',   sub: 'share',      hue: 130, re: /\b(share|refer(?:ral)?|invite|friend|downline|partner)\b/i },
  { cat: 'Referral',   sub: 'social',     hue: 96,  re: /\b(telegram|subscribe|official|social)\b/i },
  { cat: 'Welcome',    sub: 'welcome',    hue: 268, re: /\b(welcome|new register|register|sign\s?up|comeback|rebrand|no deposit)\b/i },
  { cat: 'Deposit',    sub: 'deposit',    hue: 30,  re: /\b(deposit|reload|top\s?up|match|1\+1|convert|pay)\b/i },
  { cat: 'Rebate',     sub: 'rebate',     hue: 196, re: /\b(rebate|rescue|cashback|cash\s?back|insurance)\b/i },
  { cat: 'Spins',      sub: 'spins',      hue: 318, re: /\b(spin|slot)\b/i },
  { cat: 'Daily',      sub: 'recurring',  hue: 212, re: /\b(daily|hourly|login|check\s?in|points?|reward|weekly|monthly|365|delights)\b/i },
  { cat: 'VIP',        sub: 'loyalty',    hue: 352, re: /\b(vip|level|exclusive|appreciation|loyalty)\b/i },
  { cat: 'App',        sub: 'app',        hue: 240, re: /\b(app|apk|download|install|android|ios)\b/i },
  { cat: 'Free',       sub: 'free',       hue: 52,  re: /\b(free|giveaway|lucky|box|angpao|envelope|bonus)\b/i },
];
const OTHER_TYPE = { cat: 'Other', sub: 'other', hue: 225 };
const CAT_ORDER = [...new Set(TYPE_RULES.map(r => r.cat))];
const CAT_RANK = {};
CAT_ORDER.forEach((c, i) => CAT_RANK[c] = i);
CAT_RANK['Other'] = CAT_ORDER.length;

// Column groups (one cohesive hue system, mirrors bonus categories).
// Every header is bucketed into a visually distinct group so whole sets of
// columns can be shown/hidden and stay color-consistent across every sheet.
const COLUMN_GROUPS = [
  { name: 'Identity', hue: 215, cols: ['url','mname','id','name','displaygroup','displayorder','image','angpaoid','angpaoimage','sysnote','message','description'] },
  { name: 'Value',    hue: 47,  cols: ['amount','perceived_value','bonus','bonusfixed','bonusrandom','balance','displayamount','transactioncash','total_amount','avg_amount','max_amount','total_perceived','avg_perceived','commission_total','value_per_bonus','avg_daily_value'] },
  { name: 'Withdraw', hue: 352, cols: ['minwithdraw','maxwithdraw','avg_minwithdraw','avg_maxwithdraw','headroom','avg_withdraw_headroom'] },
  { name: 'Rollover', hue: 194, cols: ['rollover','rollover_amount','value_per_rollover','ratio','avg_rollover','avg_ratio','avg_rollover_burden'] },
  { name: 'Limits',   hue: 30,  cols: ['mintopup','maxtopup','depositfreelimit','initialfreelimit','minround','maxround','minbet','minbetignorebalance'] },
  { name: 'Claim',    hue: 168, cols: ['claimconfig','claimcondition','claimdatetime','reset','transactiontype','transactionid','updata','referlink'] },
  { name: 'Timing',   hue: 268, cols: ['expiry','first_seen','last_seen','createddatetime','last_checked','tracked_days','days_visible','bonus_lifetime_days','avg_bonus_lifetime_days','hours_since_seen'] },
  { name: 'Flags',    hue: 130, cols: ['is_new','is_commission','is_surprise','active_today','source','status','failures'] },
  { name: 'Activity', hue: 318, cols: ['bonus_count','window_count','last_24h_count','prev_24h_count','distinct_days','bonuses_per_day','recent_share','growth_24h','stability','commission_count','commission_share'] },
  { name: 'Links',    hue: 200, cols: ['referral_url','short_url'] },
];
const OTHER_GROUP = { name: 'Other', hue: 225, cols: [] };
const GROUP_BY_COL = new Map();
COLUMN_GROUPS.forEach(g => g.cols.forEach(c => GROUP_BY_COL.set(c, g.name)));

function colGroup(h) {
  const name = GROUP_BY_COL.get(h);
  return (name && COLUMN_GROUPS.find(g => g.name === name)) || OTHER_GROUP;
}

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

export { TYPE_RULES, OTHER_TYPE, CAT_ORDER, CAT_RANK, COLUMN_GROUPS, OTHER_GROUP, GROUP_BY_COL, colGroup, stripTags, classifyBonus, catHue };
