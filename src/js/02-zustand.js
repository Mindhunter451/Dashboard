/* Zustand: Datenmodell mit Seiten und Widgets, Umzug vom alten Format, Speichern im Browser
 *
 * state.pages    Seiten in Tab-Reihenfolge: { id, name, tiles, items: [{ w: Widget-ID, s: Breite 1 bis 3 }] }
 * state.widgets  alle Widgets: { [id]: { type, title, cfg } }. Ein Widget kann auf mehreren Seiten liegen.
 *                Pendeln, Wetter und Urlaub gibt es genau einmal (ID = Typ), den Rest beliebig oft.
 * state.page     zuletzt geöffnete Seite
 * state.meta     wann zuletzt geändert und gesichert wurde (für die Erinnerung ans Sichern), zuletzt gesehene Version
 * state.flex     alte Gleitzeit-Daten (Widget gibt es seit 2.3 nicht mehr, die Daten bleiben für die Sicherung)
 * state.pomo     erledigte Pomodoro-Runden pro Tag
 */
const KIND_NAME = { day: 'Arbeitstag', workweek: 'Arbeitswoche', month: 'Monat', year: 'Jahr', range: 'Zeitraum' };
const TILES = { fa: 'Feierabend', we: 'Wochenende', ft: 'Nächster Feiertag', ur: 'Nächster Urlaub' };
const ACCENTS = {
  amber:  { name: 'Bernstein', l: ['#E8A126', '#8A5604', '#FCEFD3', '#1D1404'], d: ['#F0B040', '#F3C266', '#3A2B0E', '#1D1404'] },
  coral:  { name: 'Koralle',   l: ['#E5654B', '#A3361F', '#FBE1DA', '#2A0B05'], d: ['#F08068', '#F6A08C', '#3D1D16', '#2A0B05'] },
  pink:   { name: 'Pink',      l: ['#D9488A', '#9C2059', '#FADDEA', '#2B0716'], d: ['#EE6FA6', '#F49CC2', '#401629', '#2B0716'] },
  violet: { name: 'Violett',   l: ['#8A5CD8', '#5B3399', '#EAE0FA', '#FFFFFF'], d: ['#A987EE', '#C4ABF4', '#2B1E46', '#170C2B'] },
  blue:   { name: 'Blau',      l: ['#3D7BE0', '#1E4F9E', '#DDE8FB', '#06142C'], d: ['#6A9CF0', '#9BBDF5', '#172A4A', '#06142C'] },
  teal:   { name: 'Petrol',    l: ['#1A9AA0', '#0E6267', '#D4EFF0', '#03191A'], d: ['#3CC0C6', '#7AD6DA', '#0E2F31', '#03191A'] },
  green:  { name: 'Grün',      l: ['#2FA36B', '#1C6B45', '#D9F1E4', '#04180D'], d: ['#4CC48A', '#7FD8AA', '#12301F', '#04180D'] }
};
const SIZES = { s: 320, m: 380, l: 470 };

/* Widget-Typen. multi: kann es mehrfach geben, jede Kopie hat eigene Daten. w: Standardbreite in Spalten */
const TYPES = {
  tasks:    { name: 'Aufgaben', multi: true, w: 1, desc: 'Deine Todoist-Projekte zum Abhaken. Pro Widget legst du fest, welche Projekte es zeigt.' },
  progress: { name: 'Fortschritt', multi: true, w: 1, desc: 'Balken für Arbeitstag, Arbeitswoche, Monat, Jahr oder eigene Zeiträume.' },
  vacation: { name: 'Urlaub', multi: false, w: 1, desc: 'Resturlaub, geplante und genommene Tage, mit Feiertagen und halben Tagen.' },
  commute:  { name: 'Pendeln', multi: false, w: 1, desc: 'Fahrzeit mit dem Auto, Staus, Baustellen und Sperrungen auf deiner Strecke.' },
  weather:  { name: 'Wetter', multi: false, w: 2, desc: 'Wetter jetzt, Regen der nächsten 2 Stunden, Stundenleiste und Regenradar.' },
  links:    { name: 'Schnellzugriff', multi: true, w: 1, desc: 'Deine wichtigsten Seiten als Kacheln, zum Beispiel Webmail oder Ticketsystem.' },
  notes:    { name: 'Notizen', multi: true, w: 1, desc: 'Ein Notizzettel, der beim Tippen automatisch speichert.' },
  pomodoro: { name: 'Pomodoro', multi: false, w: 1, since: '2.1', desc: 'Fokus-Timer mit Pausen, Ton am Ende, Aufgabe aus Todoist und deinen Runden von heute.' },
  habits:   { name: 'Gewohnheiten', multi: true, w: 1, since: '2.1', desc: 'Tracker für Sport, Lernen und Co. mit Rhythmus, Serie und Verlauf zum Nachtragen.' },
  learn:    { name: 'Lernfortschritt', multi: true, w: 1, since: '2.1', desc: 'Countdown zur Prüfung mit Themenliste, Fortschritt und ob dein Tempo reicht.' },
  football: { name: 'Fußball', multi: true, w: 1, since: '2.2', desc: 'Eine Liga mit deinem Verein: nächstes Spiel, Form, Live-Stand, Spieltag, Tabelle und Torjäger. Vereine antippen für mehr.' },
  f1:       { name: 'Formel 1', multi: false, w: 1, since: '2.2', desc: 'Nächstes Rennen mit allen Sessions, WM-Stand und letztes Ergebnis. Fahrer und Teams antippen für mehr.' },
  fuel:     { name: 'Spritpreise', multi: false, w: 1, since: '2.2', desc: 'Günstige Tankstellen auf deiner Pendelstrecke, rund um Zuhause oder da, wo du gerade bist.' },
  cal:      { name: 'Kalender', multi: false, w: 1, since: '2.3', desc: 'Deine nächsten Termine aus dem iCloud-Kalender, nach Tagen sortiert, mit Farbe pro Kalender.' },
  verse:    { name: 'Vers des Tages', multi: false, w: 1, since: '2.3', desc: 'Jeden Tag ein Bibelvers, in Luther 1912 oder einer anderen Übersetzung. Mit Link zum ganzen Abschnitt.' }
};
const SOON = [];
const FB_LEAGUES = { bl1: '1. Bundesliga', bl2: '2. Bundesliga', bl3: '3. Liga' };
/* Bibelübersetzungen bei bolls.life, bs = Kürzel für den Link zu bibleserver.com */
const VS_TR = {
  LUT: { name: 'Luther 1912', bs: 'LUT' },
  S00: { name: 'Schlachter 2000', bs: 'SLT' },
  ELB: { name: 'Elberfelder 1871', bs: 'ELB' },
  MB: { name: 'Menge', bs: 'MENG' },
  NeU: { name: 'Neue evangelistische Übersetzung', bs: 'NE%C3%9C' },
  HFA: { name: 'Hoffnung für alle', bs: 'HFA' }
};
const svgIco = p => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
const TICON = {
  tasks: svgIco('<rect x="4" y="4" width="16" height="16" rx="3.5"/><path d="M8.2 12.3l2.6 2.6 5-5.4"/>'),
  progress: svgIco('<rect x="3.5" y="5.5" width="17" height="4.5" rx="2.25"/><rect x="3.5" y="14" width="17" height="4.5" rx="2.25"/><path d="M6 7.75h7M6 16.25h10"/>'),
  vacation: svgIco('<circle cx="12" cy="10" r="3.6"/><path d="M12 3v1.4M5 10H3.6M20.4 10H19M7 5l1 1M17 5l-1 1M3 18.5c3-2 6-2 9 0s6 2 9 0"/>'),
  commute: svgIco('<path d="M5 17h14v-4.6l-2.1-5H7.1L5 12.4z"/><path d="M5 12.4h14M6.6 17v2.2M17.4 17v2.2"/><circle cx="8.2" cy="14.7" r=".6"/><circle cx="15.8" cy="14.7" r=".6"/>'),
  weather: svgIco('<circle cx="9" cy="8" r="3"/><path d="M9 2.6v1M3.6 8h1M5.2 4.2l.7.7M12.8 4.2l-.7.7"/><path d="M7.5 19.5h9.5a3.4 3.4 0 0 0 .3-6.8 4.8 4.8 0 0 0-9.1-.6 3.7 3.7 0 0 0-.7 7.4z"/>'),
  links: svgIco('<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>'),
  notes: svgIco('<path d="M6 3.5h8.5L18.5 7.5v13H6z"/><path d="M14.5 3.5v4h4M9 12h6M9 16h6"/>'),
  pomodoro: svgIco('<circle cx="12" cy="13" r="7.5"/><path d="M12 9.2V13l2.6 1.8M10 2.6h4"/>'),
  habits: svgIco('<path d="M12 21c-3.8 0-6.5-2.6-6.5-6 0-3.6 3-5.4 3.8-9 2.7 1.7 3.4 4 3.2 6 1-.6 1.8-1.7 2-3 1.7 1.6 2.9 3.6 2.9 6 0 3.4-2.6 6-5.4 6z"/>'),
  learn: svgIco('<path d="M2.5 9.5L12 5l9.5 4.5L12 14z"/><path d="M6.5 11.6v4c1.5 1.6 3.4 2.4 5.5 2.4s4-.8 5.5-2.4v-4"/>'),
  football: svgIco('<circle cx="12" cy="12" r="8.5"/><path d="M12 7.6l3.7 2.7-1.4 4.4H9.7l-1.4-4.4z"/>'),
  f1: svgIco('<path d="M5 21V4"/><path d="M5 4.6c4-2 6 2 10 0s4 0 4 0v8.6s-1-2-4 0-6-2-10 0"/>'),
  fuel: svgIco('<path d="M5 20V5.5A1.5 1.5 0 0 1 6.5 4h6A1.5 1.5 0 0 1 14 5.5V20M3.5 20h12M5 10h9"/><path d="M14 8.5l3 2.5v6.5a1.5 1.5 0 0 0 3 0V9l-2.5-2.5"/>'),
  cal: svgIco('<rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/><circle cx="8.5" cy="14.5" r=".9" fill="currentColor"/><circle cx="12" cy="14.5" r=".9" fill="currentColor"/>'),
  verse: svgIco('<path d="M12 6.5c-1.8-1.4-4.6-2-7.5-1.8v13c2.9-.2 5.7.4 7.5 1.8 1.8-1.4 4.6-2 7.5-1.8v-13c-2.9-.2-5.7.4-7.5 1.8z"/><path d="M12 6.5v13"/>')
};

const DEF_WIDGETS_V1 = [['tasks', 1], ['commute', 1], ['weather', 2], ['progress', 1], ['vacation', 1], ['links', 1], ['notes', 1]];
const DEF_BARS = () => [
  { id: 'b1', kind: 'day', name: 'Arbeitstag', start: '07:30', end: '16:00', days: [1, 2, 3, 4, 5], example: true },
  { id: 'b2', kind: 'workweek', name: 'Arbeitswoche', start: '07:30', end: '16:00', days: [1, 2, 3, 4, 5], example: true },
  { id: 'b3', kind: 'month', name: 'Monat' },
  { id: 'b4', kind: 'year', name: 'Jahr' },
  { id: 'b5', kind: 'range', name: 'Ausbildung', from: '2024-08-01', to: '2027-07-31', example: true }
];
const DEF_UI = () => ({
  greet: 'Moin Jere', theme: 'auto', accent: 'amber', size: 'm', seconds: true, region: 'HH', sky: true,
  tiles: { fa: true, we: true, ft: true, ur: true }, countdowns: [],
  start: { mode: 'last', page: '', work: '', free: '' }
});
/* Ausgangslage im alten Format (Version 1). Neue Nutzer laufen durch denselben Umzug wie alte Daten. */
const v1Defaults = () => ({
  v: 1, edited: false,
  vacation: { allowance: 30, carry: 0, allowanceExample: true, halfXmas: true, entries: [{ id: 'ex1', from: '2026-10-19', to: '2026-10-23', label: 'Herbsturlaub', example: true }] },
  ui: {}, notes: '', links: [], bars: DEF_BARS(), loc: { mode: 'auto' }, commute: { home: null, work: null }
});

function normPlace(p) {
  if (!p || typeof p.text !== 'string' || !p.text.trim()) return null;
  const ok = v => v !== null && v !== undefined && v !== '' && Number.isFinite(+v);
  return { text: p.text.trim(), label: String(p.label || ''), lat: ok(p.lat) ? +p.lat : null, lon: ok(p.lon) ? +p.lon : null };
}
function safeUrl(u) {
  let s = String(u || '').trim();
  if (!s) return null;
  if (!/^[a-z][a-z0-9+.-]*:/i.test(s)) s = 'https://' + s;
  try { const x = new URL(s); return /^https?:$/.test(x.protocol) && x.hostname ? x.href : null; } catch { return null; }
}
function normProjects(list) {
  const out = [], seen = new Set();
  for (const p of Array.isArray(list) ? list : []) {
    const n = String(p || '').trim().slice(0, 40);
    if (n && !seen.has(n.toLowerCase())) { seen.add(n.toLowerCase()); out.push(n); }
  }
  return out.length ? out.slice(0, 4) : ['Arbeit', 'Privat'];
}
function normBars(list) {
  return (Array.isArray(list) ? list : []).filter(b => b && KIND_NAME[b.kind]).slice(0, 12).map(b => {
    const o = { id: String(b.id || uid()).slice(0, 20), kind: b.kind, name: String(b.name || KIND_NAME[b.kind]).slice(0, 40) };
    if (b.example) o.example = true;
    if (b.kind === 'day' || b.kind === 'workweek') {
      o.start = validHm(b.start) ? b.start : '08:00';
      o.end = validHm(b.end) ? b.end : '16:30';
      o.days = Array.isArray(b.days) ? [...new Set(b.days.map(Number).filter(x => x >= 0 && x <= 6))] : [1, 2, 3, 4, 5];
    }
    if (b.kind === 'range') { o.from = validYmd(b.from) ? b.from : ''; o.to = validYmd(b.to) ? b.to : ''; }
    return o;
  });
}
const normLinks = list => (Array.isArray(list) ? list : [])
  .map(l => l && { id: String(l.id || uid()).slice(0, 20), name: String(l.name || '').slice(0, 30), url: safeUrl(l.url) })
  .filter(l => l && l.url).slice(0, 40);
const intIn = (x, lo, hi, d) => x !== null && x !== '' && Number.isFinite(+x) && +x >= lo && +x <= hi ? Math.round(+x) : d;
const normDays = (list, d) => Array.isArray(list) ? [...new Set(list.map(Number).filter(x => Number.isInteger(x) && x >= 0 && x <= 6))] : d;
const HB_RHYTHM = ['daily', 'workdays', 'weekly'];
const normHabits = list => (Array.isArray(list) ? list : []).filter(h => h && String(h.name || '').trim()).slice(0, 20).map(h => ({
  id: String(h.id || uid()).slice(0, 20),
  name: String(h.name).trim().slice(0, 40),
  rhythm: HB_RHYTHM.includes(h.rhythm) ? h.rhythm : 'daily',
  n: intIn(h.n, 1, 7, 3),
  log: [...new Set((Array.isArray(h.log) ? h.log : []).filter(validYmd))].sort().slice(-800)
}));
const normTopics = list => (Array.isArray(list) ? list : []).filter(t => t && String(t.name || '').trim()).slice(0, 300)
  .map(t => ({ id: String(t.id || uid()).slice(0, 20), name: String(t.name).trim().slice(0, 80), done: validYmd(t.done) ? t.done : null }));
function normFlexDays(o) {
  const out = {};
  if (!o || typeof o !== 'object') return out;
  for (const k of Object.keys(o).filter(validYmd).sort().slice(-800)) {
    const d = o[k];
    if (!d || typeof d !== 'object') continue;
    const e = { in: validHm(d.in) ? d.in : '', out: validHm(d.out) ? d.out : '', pause: intIn(d.pause, 0, 600, 0), kind: ['school', 'sick', 'flexday'].includes(d.kind) ? d.kind : '' };
    if (!e.in) { e.out = ''; e.pause = 0; }
    if (e.in || e.kind) out[k] = e;
  }
  return out;
}
/* Einstellungen des früheren Gleitzeit-Widgets aufheben, damit nichts verloren geht */
function flexCfgKeep(s) {
  const w = s.widgets && s.widgets.flex && s.widgets.flex.type === 'flex' ? s.widgets.flex.cfg : s.flex && s.flex.cfg;
  if (!w || typeof w !== 'object') return null;
  const out = {};
  for (const k of ['soll', 'carry']) if (Number.isFinite(+w[k])) out[k] = Math.round(+w[k]);
  if (Array.isArray(w.days)) out.days = normDays(w.days, []);
  if (validYmd(w.from)) out.from = w.from;
  if (w.autoBreak === false) out.autoBreak = false;
  return Object.keys(out).length ? out : null;
}
function normPomoLog(o) {
  const out = {};
  if (!o || typeof o !== 'object') return out;
  for (const k of Object.keys(o).filter(validYmd).sort().slice(-120)) {
    const d = o[k] || {};
    out[k] = { n: intIn(d.n, 0, 60, 0), min: intIn(d.min, 0, 1440, 0) };
  }
  return out;
}
function normCfg(type, c) {
  c = c && typeof c === 'object' ? c : {};
  switch (type) {
    case 'pomodoro': return { focus: intIn(c.focus, 1, 120, 25), short: intIn(c.short, 1, 60, 5), long: intIn(c.long, 1, 90, 15), every: intIn(c.every, 2, 8, 4), sound: c.sound !== false, auto: !!c.auto };
    case 'habits': return { items: normHabits(c.items) };
    case 'learn': return { date: validYmd(c.date) ? c.date : '', time: validHm(c.time) ? c.time : '', start: validYmd(c.start) ? c.start : '', topics: normTopics(c.topics) };
    case 'football': return { league: FB_LEAGUES[c.league] ? c.league : 'bl1', team: intIn(c.team, 1, 1e7, 0), teamName: typeof c.teamName === 'string' ? c.teamName.slice(0, 60) : '' };
    case 'f1': return { fav: typeof c.fav === 'string' ? c.fav.replace(/[^a-z0-9_]/gi, '').slice(0, 40) : '' };
    case 'cal': return { days: [7, 14, 30].includes(+c.days) ? +c.days : 14, loc: c.loc !== false };
    case 'verse': return { tr: VS_TR[c.tr] ? c.tr : 'LUT' };
    case 'fuel': return { type: ['e5', 'e10', 'diesel'].includes(c.type) ? c.type : 'e5', mode: ['route', 'home', 'here'].includes(c.mode) ? c.mode : 'route' };
    case 'tasks': return { projects: normProjects(c.projects) };
    case 'progress': return { bars: normBars(c.bars) };
    case 'weather': return { hours: c.hours !== false, radar: c.radar !== false };
    case 'links': return { items: normLinks(c.items) };
    case 'notes': return { text: typeof c.text === 'string' ? c.text.slice(0, 8000) : '' };
    default: return {};
  }
}

/* Umzug vom alten Format: Die bisherige Ansicht wird zur Seite „Übersicht“, dazu kommen „Arbeit“ und „Privat“. */
function fromV1(s) {
  const u = s.ui && typeof s.ui === 'object' ? s.ui : {};
  const projects = normProjects(u.projects);
  const widgets = {
    tasks: { type: 'tasks', cfg: { projects } },
    progress: { type: 'progress', cfg: { bars: Array.isArray(s.bars) ? s.bars : DEF_BARS() } },
    vacation: { type: 'vacation' },
    commute: { type: 'commute' },
    weather: { type: 'weather', cfg: { hours: u.wxHours !== false, radar: u.wxRadar !== false } },
    links: { type: 'links', cfg: { items: s.links } },
    notes: { type: 'notes', cfg: { text: s.notes } },
    'tasks-arbeit': { type: 'tasks', cfg: { projects: [projects[0]] } },
    'tasks-privat': { type: 'tasks', cfg: { projects: projects.length > 1 ? projects.slice(1) : ['Privat'] } },
    'notes-arbeit': { type: 'notes', title: 'Notizen Arbeit', cfg: { text: '' } }
  };
  const seen = new Set(), home = [];
  for (const w of Array.isArray(u.widgets) ? u.widgets : []) {
    if (!w || !TYPES[w.id] || seen.has(w.id)) continue;
    seen.add(w.id);
    if (w.on !== false) home.push({ w: w.id, s: +w.w || 1 });
  }
  for (const [id, sp] of DEF_WIDGETS_V1) if (!seen.has(id)) home.push({ w: id, s: sp });
  const items = list => list.map(([w, sp]) => ({ w, s: sp }));
  return {
    v: 2, edited: !!s.edited, vacation: s.vacation, ui: u, widgets,
    pages: [
      { id: 'home', name: 'Übersicht', tiles: true, items: home },
      { id: 'arbeit', name: 'Arbeit', tiles: true, items: items([['tasks-arbeit', 1], ['commute', 1], ['progress', 1], ['vacation', 1], ['notes-arbeit', 1], ['links', 1]]) },
      { id: 'privat', name: 'Privat', tiles: true, items: items([['tasks-privat', 1], ['weather', 2], ['notes', 1]]) }
    ],
    page: 'home', loc: s.loc, commute: s.commute,
    meta: { changedAt: s.edited ? new Date().toISOString() : null }
  };
}

function normUi(u) {
  const d = DEF_UI();
  if (!u || typeof u !== 'object') return d;
  const t = u.tiles && typeof u.tiles === 'object' ? u.tiles : {};
  const st = u.start && typeof u.start === 'object' ? u.start : {};
  const pid = x => String(x || '').slice(0, 24);
  return {
    greet: typeof u.greet === 'string' ? u.greet.slice(0, 40) : d.greet,
    theme: ['auto', 'light', 'dark'].includes(u.theme) ? u.theme : 'auto',
    accent: ACCENTS[u.accent] ? u.accent : 'amber',
    size: SIZES[u.size] ? u.size : 'm',
    seconds: u.seconds !== false,
    sky: u.sky !== false,
    region: REGIONS[u.region] ? u.region : 'HH',
    tiles: { fa: t.fa !== false, we: t.we !== false, ft: t.ft !== false, ur: t.ur !== false },
    countdowns: (Array.isArray(u.countdowns) ? u.countdowns : []).filter(c => c && validYmd(c.date)).slice(0, 6)
      .map(c => ({ id: String(c.id || '').replace(/[^a-z0-9]/gi, '').slice(0, 16) || uid(), name: String(c.name || 'Countdown').slice(0, 30), date: c.date, time: validHm(c.time) ? c.time : '' })),
    start: { mode: ['last', 'fixed', 'auto'].includes(st.mode) ? st.mode : 'last', page: pid(st.page), work: pid(st.work), free: pid(st.free) }
  };
}
const isoOrNull = x => typeof x === 'string' && !Number.isNaN(Date.parse(x)) ? x : null;
function normalize(s) {
  if (!s || typeof s !== 'object') s = v1Defaults();
  if (!Array.isArray(s.pages)) s = fromV1(s);
  const d = v1Defaults();
  const v = s.vacation && typeof s.vacation === 'object' ? s.vacation : d.vacation;
  const widgets = {};
  if (s.widgets && typeof s.widgets === 'object') {
    for (const [id, w] of Object.entries(s.widgets)) {
      if (Object.keys(widgets).length >= 60) break;
      if (!/^[a-z][a-z0-9-]{0,39}$/.test(id) || !w || !TYPES[w.type]) continue;
      if (!TYPES[w.type].multi && id !== w.type) continue;
      widgets[id] = { type: w.type, title: typeof w.title === 'string' ? w.title.trim().slice(0, 30) : '', cfg: normCfg(w.type, w.cfg) };
    }
  }
  for (const [t, T] of Object.entries(TYPES)) if (!T.multi && !widgets[t]) widgets[t] = { type: t, title: '', cfg: normCfg(t) };
  const pages = [], pids = new Set();
  for (const p of s.pages) {
    if (!p || typeof p !== 'object' || pages.length >= 12) continue;
    let id = slug(p.id).slice(0, 24) || 'p' + uid();
    while (pids.has(id)) id = 'p' + uid();
    pids.add(id);
    const seen = new Set(), items = [];
    for (const it of Array.isArray(p.items) ? p.items : []) {
      if (!it || !widgets[it.w] || seen.has(it.w)) continue;
      seen.add(it.w);
      items.push({ w: it.w, s: [1, 2, 3].includes(+it.s) ? +it.s : 1 });
    }
    pages.push({ id, name: String(p.name || '').trim().slice(0, 24) || 'Seite', tiles: p.tiles !== false, items });
  }
  if (!pages.length) pages.push({ id: 'home', name: 'Übersicht', tiles: true, items: [] });
  const m = s.meta && typeof s.meta === 'object' ? s.meta : {};
  return {
    v: 2,
    edited: !!s.edited,
    vacation: {
      allowance: Number.isFinite(+v.allowance) ? +v.allowance : d.vacation.allowance,
      carry: Number.isFinite(+v.carry) ? +v.carry : 0,
      allowanceExample: v.allowanceExample !== undefined ? !!v.allowanceExample : d.vacation.allowanceExample,
      halfXmas: v.halfXmas !== false,
      entries: Array.isArray(v.entries)
        ? v.entries.filter(e => e && validYmd(e.from) && validYmd(e.to)).map(e => ({ ...e, id: String(e.id || uid()), label: String(e.label || ''), half: !!e.half && e.from === e.to }))
        : d.vacation.entries
    },
    ui: normUi(s.ui),
    pages,
    page: pages.some(p => p.id === s.page) ? s.page : pages[0].id,
    widgets,
    loc: s.loc && s.loc.mode === 'fixed' && Number.isFinite(+s.loc.lat) && Number.isFinite(+s.loc.lon) ? { mode: 'fixed', name: String(s.loc.name || 'Ort'), lat: +s.loc.lat, lon: +s.loc.lon } : { mode: 'auto' },
    commute: { home: normPlace(s.commute && s.commute.home), work: normPlace(s.commute && s.commute.work) },
    flex: { days: normFlexDays(s.flex && s.flex.days), cfg: flexCfgKeep(s) },
    pomo: { log: normPomoLog(s.pomo && s.pomo.log) },
    meta: { since: isoOrNull(m.since) || new Date().toISOString(), backupAt: isoOrNull(m.backupAt), changedAt: isoOrNull(m.changedAt), snooze: isoOrNull(m.snooze), seen: typeof m.seen === 'string' ? m.seen.slice(0, 10) : '' }
  };
}
const DEFAULTS = () => normalize(null);

/* Speichern im Browser. Vor dem ersten Umzug aufs neue Format wird der alte Stand extra abgelegt. */
const LS_KEY = 'jere-cockpit-v1', GEO_KEY = 'jere-cockpit-geo', LS_OLD = 'jere-cockpit-v1-vor-seiten';
let lsOk = true;
function lsGet(k) { try { const r = localStorage.getItem(k); return r ? JSON.parse(r) : null; } catch { lsOk = false; return null; } }
function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { lsOk = false; } }
function loadState() {
  const raw = lsGet(LS_KEY);
  const next = normalize(raw);
  if (raw && typeof raw === 'object' && !Array.isArray(raw.pages)) {
    if (!lsGet(LS_OLD)) lsSet(LS_OLD, raw);
    lsSet(LS_KEY, next);
  }
  return next;
}
let state = loadState();

const SYNC_TXT = {
  local: 'Gespeichert in diesem Browser.',
  none: 'Dieser Browser speichert hier nichts, zum Beispiel im privaten Fenster. Änderungen sind nach dem Neuladen weg.'
};
function setSync(m) { const el = $('#sync'); el.dataset.mode = m; el.textContent = SYNC_TXT[m]; }
/* Jede Änderung: speichern, merken wann, alles neu zeichnen */
function commit() {
  state.edited = true;
  state.meta.changedAt = new Date().toISOString();
  lsSet(LS_KEY, state);
  renderAll();
  setSync(lsOk ? 'local' : 'none');
}
/* Nur speichern, ohne als Änderung zu zählen (z. B. welche Seite offen ist) */
function persist() { lsSet(LS_KEY, state); }

/* Toast mit Rückgängig */
let toastTimer = null, undoFn = null;
function toast(msg, undo, opt) {
  $('#toast-msg').textContent = msg;
  undoFn = undo || null;
  $('#toast-undo').hidden = !undo;
  $('#toast-undo').textContent = (opt && opt.label) || 'Rückgängig';
  $('#toast').hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { $('#toast').hidden = true; undoFn = null; }, (opt && opt.ms) || 6000);
}
$('#toast-undo').addEventListener('click', () => { if (undoFn) undoFn(); undoFn = null; $('#toast').hidden = true; });
