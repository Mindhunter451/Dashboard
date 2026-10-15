// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: orange; icon-glyph: sun;

/* Jeres Tagescockpit als iPhone-Widget, für die kostenlose App Scriptable.
 * Zeigt wie „Jetzt wichtig“, was gerade zählt: Termine, Geburtstage, Wetter, Pendeln und Spritpreise.
 *
 *   Groß:    alles
 *   Mittel:  Termine, Geburtstage und Wetter. Mit Parameter 2: Pendeln und Spritpreise
 *   Klein:   nächster Termin und Wetter
 *   Sperrbildschirm: nächster Termin und Wetter, rund: Temperatur
 *   Eigene Auswahl über den Parameter des Widgets, zum Beispiel: termine, wetter, sprit
 *
 * Termine kommen direkt aus dem Kalender des iPhones. Geburtstage, Adressen, Arbeitszeit, Urlaub, Wetterort
 * und der Ort für die Spritpreise kommen per Sync aus dem Cockpit. Sync-Zugang und Keys liegen im Schlüsselbund
 * von Scriptable, nie hier im Skript. Zum Einrichten das Skript in Scriptable einmal starten.
 * Mehrere Widgets teilen sich einen Zwischenspeicher, damit TomTom und Tankerkönig nicht mehrfach gefragt werden. */

const VERSION = '1.0';
const COCKPIT = 'https://mindhunter451.github.io/Dashboard/';
const KC = { sync: 'cockpit-widget-sync', tomtom: 'cockpit-widget-tomtom', fuel: 'cockpit-widget-tankerkoenig', cals: 'cockpit-widget-kalender' };
const PASTE = 'cockpit-widget:';

/* ---------- Kleine Helfer ---------- */
const DAY = 864e5;
const pad = n => String(n).padStart(2, '0');
const hm = d => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const sod = d => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const dayDiff = (a, b) => Math.round((sod(b) - sod(a)) / DAY);
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const at = (d, t) => { const [h, m] = t.split(':').map(Number); return new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, m); };
const validHm = s => typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
const numDe = (x, dec = 0) => (Math.round(x * 10 ** dec) / 10 ** dec).toFixed(dec).replace('.', ',');
const WD = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const cut = (s, n) => { const t = String(s || '').replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t; };
const dayWord = (now, d) => { const n = dayDiff(now, d); return n === 0 ? 'Heute' : n === 1 ? 'Morgen' : n === 2 ? 'Übermorgen' : `${WD[d.getDay()]}, ${d.getDate()}.${d.getMonth() + 1}.`; };
const okPlace = p => !!p && p.lat !== null && p.lat !== undefined && p.lon !== null && p.lon !== undefined && Number.isFinite(+p.lat) && Number.isFinite(+p.lon);
// Scriptable hat kein setTimeout, dafür Timer
const sleep = ms => new Promise(res => { if (typeof Timer !== 'undefined') Timer.schedule(ms, false, () => res()); else globalThis.setTimeout(res, ms); });
const timeout = (p, ms) => Promise.race([p, sleep(ms).then(() => { throw new Error('timeout'); })]);
const runUrl = () => `scriptable:///run/${encodeURIComponent(Script.name())}`;

/* ---------- Schlüsselbund ---------- */
function kcGet(k) { try { return Keychain.contains(k) ? Keychain.get(k) : ''; } catch { return ''; } }
function kcSet(k, v) { try { if (v) Keychain.set(k, v); else if (Keychain.contains(k)) Keychain.remove(k); } catch { /* egal */ } }
function kcJson(k) { try { return JSON.parse(kcGet(k) || 'null'); } catch { return null; } }

/* ---------- Gemeinsamer Zwischenspeicher, eine Datei pro Quelle ---------- */
const FM = FileManager.local();
const DIR = FM.joinPath(FM.documentsDirectory(), 'cockpit-widget');
function cRead(name) {
  try { const p = FM.joinPath(DIR, `${name}.json`); return FM.fileExists(p) ? JSON.parse(FM.readString(p)) : null; } catch { return null; }
}
function cWrite(name, v) {
  try { if (!FM.fileExists(DIR)) FM.createDirectory(DIR, true); FM.writeString(FM.joinPath(DIR, `${name}.json`), JSON.stringify(v)); } catch { /* ohne Zwischenspeicher geht es auch */ }
}
/* Warum etwas nicht geklappt hat: key (abgelehnt), limit, svc (Fehler beim Dienst), net (nicht erreichbar) */
const errWhy = e => (e && e.why) || (e && (e.status === 401 || e.status === 403) ? 'key' : e && e.status === 429 ? 'limit' : e && e.status ? 'svc' : 'net');
/* Holt Daten, solange der letzte Stand älter als ttl ist. Mehrere Widgets laden oft im selben Moment:
 * Wer innerhalb von gap nach dem letzten Versuch kommt, fragt nicht nochmal und nimmt den letzten Stand.
 * Bei einem Fehler bleibt der letzte gute Stand stehen. Ergebnis: { v, at, err } */
async function cached(name, sig, ttl, gap, load) {
  const c = cRead(name), now = Date.now(), same = !!c && c.sig === sig && c.v !== undefined && c.v !== null;
  if (same && now - c.at < ttl) return { v: c.v, at: c.at, err: '' };
  if (c && c.call && now - c.call < gap) {
    if (same) return { v: c.v, at: c.at, err: c.err || '' };
    // Ein anderes Widget lädt gerade zum ersten Mal: kurz auf sein Ergebnis warten
    for (let i = 0; i < 12; i++) {
      await sleep(700);
      const n = cRead(name);
      if (n && n.sig === sig && n.v !== undefined && n.v !== null) return { v: n.v, at: n.at, err: n.err || '' };
      if (n && n.err && n.call === c.call) break;
    }
    return { v: null, at: 0, err: 'wait' };
  }
  cWrite(name, { ...(same ? c : {}), sig, call: now });
  try {
    const v = await load();
    cWrite(name, { sig, at: Date.now(), call: now, v });
    return { v, at: Date.now(), err: '' };
  } catch (e) {
    const err = errWhy(e);
    cWrite(name, { ...(same ? c : {}), sig, call: now, err });
    return same ? { v: c.v, at: c.at, err } : { v: null, at: 0, err };
  }
}

/* ---------- Netz ---------- */
async function getJson(url, headers, secs = 10) {
  const r = new Request(url);
  r.timeoutInterval = secs;
  if (headers) r.headers = headers;
  const raw = await r.loadString();
  const st = (r.response && r.response.statusCode) || 0;
  let j = null;
  try { j = JSON.parse(raw); } catch { j = null; }
  if (st >= 400 || j === null) throw Object.assign(new Error(`HTTP ${st}`), { status: st, body: j });
  return j;
}

/* ---------- Stand aus dem Cockpit (Sync) ---------- */
const ACCENTS = { amber: '#E8A126', coral: '#E5654B', pink: '#D9488A', violet: '#8A5CD8', indigo: '#5B63E0', blue: '#3D7BE0', teal: '#1A9AA0', green: '#2FA36B', lime: '#86B42A', graphite: '#45464A', 'g-glut': '#E8A126', 'g-abend': '#EE7A4E', 'g-lavendel': '#D9488A', 'g-lagune': '#1A9AA0', 'g-nordlicht': '#2FA36B', 'g-zitrus': '#86B42A' };
/* Nur das, was das Widget braucht. Der ganze Stand mit Notizen bleibt draußen. */
function slim(st) {
  const W = st.widgets || {}, ui = st.ui || {};
  const bars = Object.values(W).filter(w => w && w.type === 'progress').flatMap(w => (w.cfg && Array.isArray(w.cfg.bars)) ? w.cfg.bars : []);
  const wb = bars.find(b => b && (b.kind === 'day' || b.kind === 'workweek') && validHm(b.start) && validHm(b.end));
  const place = p => (okPlace(p) ? { lat: +p.lat, lon: +p.lon, label: p.label || p.text || '' } : null);
  return {
    bdays: ((st.bdays && st.bdays.list) || []).filter(b => b && b.name && b.m && b.d).map(b => ({ name: String(b.name), m: +b.m, d: +b.d, y: +b.y || null })),
    home: place(st.commute && st.commute.home),
    work: place(st.commute && st.commute.work),
    loc: st.loc && st.loc.mode === 'fixed' && okPlace(st.loc) ? { lat: +st.loc.lat, lon: +st.loc.lon, name: st.loc.name || '' } : null,
    fuel: W.fuel && W.fuel.cfg ? W.fuel.cfg : null,
    hours: wb ? { start: wb.start, end: wb.end, days: Array.isArray(wb.days) ? wb.days : [1, 2, 3, 4, 5] } : null,
    vac: ((st.vacation && st.vacation.entries) || []).filter(e => e && e.from && e.to).map(e => [e.from, e.to]),
    region: ui.region || 'HH',
    accent: ui.accent === 'custom' && /^#[0-9a-f]{6}$/i.test(ui.accentHex || '') ? ui.accentHex : ACCENTS[ui.accent] || ACCENTS.amber,
    bdCal: !(W.bday && W.bday.cfg && W.bday.cfg.cal === false)
  };
}
async function loadSync() {
  const s = kcJson(KC.sync);
  if (!s || !s.url || !s.pass) return null;
  const r = await cached('sync', s.url, 30 * 6e4, 30e3, async () => {
    const j = await getJson(s.url, { Authorization: `Bearer ${s.pass}` });
    if (!j.state || typeof j.state !== 'object') throw Object.assign(new Error('leer'), { why: 'empty' });
    return slim(j.state);
  });
  return r.v ? { ...r.v, err: r.err } : { err: r.err || 'net', none: true };
}

/* ---------- Arbeitstage: Feiertage je Bundesland und Urlaub, wie im Cockpit ---------- */
function holidays(y, R) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4,
    f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30,
    i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451),
    mo = Math.floor((h + l - 7 * m + 114) / 31), da = ((h + l - 7 * m + 114) % 31) + 1;
  const E = new Date(y, mo - 1, da);
  const list = [
    [new Date(y, 0, 1), 'Neujahr'], [addDays(E, -2), 'Karfreitag'], [addDays(E, 1), 'Ostermontag'],
    [new Date(y, 4, 1), 'Tag der Arbeit'], [addDays(E, 39), 'Christi Himmelfahrt'], [addDays(E, 50), 'Pfingstmontag'],
    [new Date(y, 9, 3), 'Tag der Deutschen Einheit'], [new Date(y, 11, 25), '1. Weihnachtstag'], [new Date(y, 11, 26), '2. Weihnachtstag']
  ];
  const has = (...rs) => rs.includes(R);
  if (has('BW', 'BY', 'ST')) list.push([new Date(y, 0, 6), 'Heilige Drei Könige']);
  if ((has('BE') && y >= 2019) || (has('MV') && y >= 2023)) list.push([new Date(y, 2, 8), 'Internationaler Frauentag']);
  if (has('BW', 'BY', 'HE', 'NW', 'RP', 'SL')) list.push([addDays(E, 60), 'Fronleichnam']);
  if (has('SL')) list.push([new Date(y, 7, 15), 'Mariä Himmelfahrt']);
  if (has('TH') && y >= 2019) list.push([new Date(y, 8, 20), 'Weltkindertag']);
  if (has('BB', 'MV', 'SN', 'ST', 'TH') || (has('HB', 'HH', 'NI', 'SH') && y >= 2018)) list.push([new Date(y, 9, 31), 'Reformationstag']);
  if (has('BW', 'BY', 'NW', 'RP', 'SL')) list.push([new Date(y, 10, 1), 'Allerheiligen']);
  if (has('SN')) { let x = new Date(y, 10, 22); while (x.getDay() !== 3) x = addDays(x, -1); list.push([x, 'Buß- und Bettag']); }
  return new Map(list.map(([dt, n]) => [ymd(dt), n]));
}
const HOL = {};
const holidayName = (d, R) => { const k = R + d.getFullYear(); if (!HOL[k]) HOL[k] = holidays(d.getFullYear(), R); return HOL[k].get(ymd(d)); };
const nextWork = (S, d) => { for (let i = 1; i <= 21; i++) { const x = addDays(d, i); if (!freeReason(S, x)) return x; } return null; };
function freeReason(S, d) {
  const days = S && S.hours ? S.hours.days : [1, 2, 3, 4, 5];
  if (!days.includes(d.getDay())) return d.getDay() === 0 || d.getDay() === 6 ? 'Wochenende' : 'kein Arbeitstag';
  const h = holidayName(d, (S && S.region) || 'HH');
  if (h) return h;
  const k = ymd(d);
  if (S && S.vac && S.vac.some(([a, b]) => a <= k && k <= b)) return 'Urlaub';
  return '';
}

/* ---------- Orte ---------- */
const HH = { lat: 53.5511, lon: 9.9937, name: 'Hamburg' };
async function deviceLoc() {
  const c = cRead('standort');
  if (c && Date.now() - c.at < 30 * 6e4) return c.v;
  try {
    Location.setAccuracyToKilometer();
    const p = await timeout(Location.current(), 6000);
    if (p && Number.isFinite(p.latitude)) {
      const v = { lat: p.latitude, lon: p.longitude };
      cWrite('standort', { at: Date.now(), v });
      return v;
    }
  } catch { /* kein Standort, dann der letzte bekannte */ }
  return c ? c.v : null;
}
/* Ort fürs Wetter: der feste Ort aus dem Cockpit, sonst der Standort, sonst Hamburg */
async function wxPlace(S) {
  if (S && S.loc) return S.loc;
  const p = await deviceLoc();
  return p ? { ...p, name: '' } : HH;
}

/* ---------- Kalender ---------- */
const BD_CAL = /geburtstag|birthday|bday|🎂/i;
const firstLine = s => String(s || '').split('\n')[0].trim();
const hexOf = c => { try { const h = c && c.hex ? String(c.hex).replace('#', '') : ''; return /^[0-9a-f]{6}$/i.test(h) ? `#${h}` : ''; } catch { return ''; } };
async function loadCal(now) {
  let all;
  try { all = await Calendar.forEvents(); } catch { return { err: 'perm' }; }
  if (!Array.isArray(all)) return { err: 'perm' };
  const pick = kcJson(KC.cals), isBd = c => BD_CAL.test(c.title || '');
  const evC = all.filter(c => !isBd(c) && (!Array.isArray(pick) || !pick.length || pick.includes(c.identifier)));
  const bdC = all.filter(isBd);
  const from = sod(now), to = addDays(from, 8);
  const norm = e => ({ t: String(e.title || 'Ohne Titel'), s: +e.startDate, e: +e.endDate, a: !!e.isAllDay, l: firstLine(e.location), c: hexOf(e.calendar && e.calendar.color) });
  try {
    const [ev, bd] = await Promise.all([evC.length ? CalendarEvent.between(from, to, evC) : [], bdC.length ? CalendarEvent.between(from, to, bdC) : []]);
    return { ev: ev.map(norm), bd: bd.map(norm), err: '' };
  } catch { return { err: 'perm' }; }
}

/* ---------- Wetter und Warnungen ---------- */
const WMO = {
  0: ['Klar', 'sun.max.fill', 'moon.stars.fill'], 1: ['Überwiegend klar', 'sun.max.fill', 'moon.fill'], 2: ['Teils bewölkt', 'cloud.sun.fill', 'cloud.moon.fill'], 3: ['Bedeckt', 'cloud.fill'],
  45: ['Nebel', 'cloud.fog.fill'], 48: ['Reifnebel', 'cloud.fog.fill'],
  51: ['Leichter Nieselregen', 'cloud.drizzle.fill'], 53: ['Nieselregen', 'cloud.drizzle.fill'], 55: ['Starker Nieselregen', 'cloud.drizzle.fill'], 56: ['Gefrierender Niesel', 'cloud.sleet.fill'], 57: ['Gefrierender Niesel', 'cloud.sleet.fill'],
  61: ['Leichter Regen', 'cloud.rain.fill'], 63: ['Regen', 'cloud.rain.fill'], 65: ['Starker Regen', 'cloud.heavyrain.fill'], 66: ['Gefrierender Regen', 'cloud.sleet.fill'], 67: ['Gefrierender Regen', 'cloud.sleet.fill'],
  71: ['Leichter Schneefall', 'cloud.snow.fill'], 73: ['Schneefall', 'cloud.snow.fill'], 75: ['Starker Schneefall', 'cloud.snow.fill'], 77: ['Schneegriesel', 'cloud.snow.fill'],
  80: ['Leichte Schauer', 'cloud.sun.rain.fill', 'cloud.moon.rain.fill'], 81: ['Regenschauer', 'cloud.rain.fill'], 82: ['Heftige Schauer', 'cloud.heavyrain.fill'],
  85: ['Schneeschauer', 'cloud.snow.fill'], 86: ['Starke Schneeschauer', 'cloud.snow.fill'],
  95: ['Gewitter', 'cloud.bolt.rain.fill'], 96: ['Gewitter mit Hagel', 'cloud.bolt.rain.fill'], 99: ['Gewitter mit Hagel', 'cloud.bolt.rain.fill']
};
const WN_LV = { minor: 1, moderate: 2, severe: 3, extreme: 4 };
const WN_NAME = ['', 'Wetterwarnung', 'Markantes Wetter', 'Unwetter', 'Extremes Unwetter'];
const WN_COLOR = ['', '#E0A800', '#F08A1C', '#D7263D', '#8E2DA8'];
const WN_SMALL = new Set(['MIT', 'UND', 'VOR', 'VON', 'IM', 'IN', 'AM', 'BIS', 'ODER', 'AUF']);
/* Der DWD schreibt in Großbuchstaben („SCHWERE STURMBÖEN“), daraus wird normale Schreibung */
function wnEvent(s) {
  return String(s || '').trim().split(/\s+/).filter(Boolean).map((x, i) => {
    const up = x.toUpperCase(), low = x.toLowerCase();
    if (WN_SMALL.has(up)) return low;
    if (i > 0 && /^(SCHWER|STARK|HEFTIG|EXTREM|ERGIEBIG|LEICHT|MARKANT|ORKANARTIG)/.test(up)) return low;
    return low.charAt(0).toUpperCase() + low.slice(1);
  }).join(' ');
}
function wnParse(list) {
  const out = [], seen = new Set();
  for (const a of Array.isArray(list) ? list : []) {
    if (!a || a.status === 'test' || a.response_type === 'allclear') continue;
    const on = Date.parse(a.onset || a.effective), ex = a.expires ? Date.parse(a.expires) : NaN;
    if (!Number.isFinite(on)) continue;
    const ev = cut(wnEvent(a.event_de || String(a.headline_de || '').replace(/^amtliche\s+\S+\s+vor\s+/i, '')), 60) || 'Wetterwarnung';
    const k = `${ev}|${on}|${ex}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ lv: WN_LV[a.severity] || 1, ev, on, ex: Number.isFinite(ex) ? ex : null });
  }
  return out.sort((x, y) => y.lv - x.lv || x.on - y.on);
}
function wnWhen(w, now) {
  const day = t => { const d = dayDiff(now, new Date(t)); return d === 0 ? '' : d === 1 ? 'morgen ' : `${WD[new Date(t).getDay()]} `; };
  if (w.on <= +now) return w.ex ? `bis ${day(w.ex)}${hm(new Date(w.ex))} Uhr` : 'gilt jetzt';
  return `ab ${day(w.on)}${hm(new Date(w.on))} Uhr`;
}
async function loadWeather(P) {
  const sig = `${(+P.lat).toFixed(2)},${(+P.lon).toFixed(2)}`, q = `latitude=${(+P.lat).toFixed(4)}&longitude=${(+P.lon).toFixed(4)}`;
  const [w, a] = await Promise.all([
    cached('wetter', sig, 15 * 6e4, 30e3, () => getJson(`https://api.open-meteo.com/v1/forecast?${q}&current=temperature_2m,weather_code,is_day&minutely_15=precipitation&hourly=temperature_2m,precipitation_probability&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&timeformat=unixtime&forecast_days=2`)),
    cached('warnungen', sig, 15 * 6e4, 30e3, async () => wnParse((await getJson(`https://api.brightsky.dev/alerts?lat=${(+P.lat).toFixed(4)}&lon=${(+P.lon).toFixed(4)}`)).alerts))
  ]);
  return { w, a };
}
/* Ein Satz zum Wetter: Regen gleich, Regen später, Frost, abends die Aussicht für morgen */
function wxLine(d, now) {
  const t = +now, h = now.getHours(), c = d.current || {}, m = d.minutely_15, hr = d.hourly, dl = d.daily || {};
  if (m && Array.isArray(m.time)) {
    const slots = m.time.map((x, i) => [x * 1000, +m.precipitation[i] || 0]).filter(([x]) => x + 15 * 6e4 > t && x <= t + 2 * 36e5);
    const wet = slots.findIndex(([, p]) => p >= 0.05);
    if (wet === 0) { const dry = slots.find(([, p]) => p < 0.05); return { s: dry ? `Regnet gerade, trocken ab ${hm(new Date(dry[0]))}` : 'Regnet die nächsten 2 Stunden durch', rain: true }; }
    if (wet > 0) return { s: `Regen ab ${hm(new Date(slots[wet][0]))}, Schirm einpacken`, rain: true, lv: slots[wet][0] - t < 45 * 6e4 ? 'warn' : '' };
  }
  if (h < 11 && Number.isFinite(+c.temperature_2m) && +c.temperature_2m <= 0.5) return { s: 'Frost draußen, Zeit zum Kratzen einplanen', lv: 'warn' };
  if (hr && Array.isArray(hr.time) && h < 20) {
    const end = +at(now, '22:00');
    let first = null, max = 0;
    hr.time.forEach((x, i) => { const ts = x * 1000, pp = +hr.precipitation_probability[i] || 0; if (ts < t || ts > end) return; if (pp >= 60 && !first) first = ts; max = Math.max(max, pp); });
    if (first) return { s: `Ab ${new Date(first).getHours()} Uhr Regen wahrscheinlich (${max} %)`, rain: true };
  }
  if (h >= 17 && hr && Array.isArray(hr.time)) {
    const tm = addDays(now, 1), a = +at(tm, '05:00'), b = +at(tm, '09:00');
    let min = Infinity;
    hr.time.forEach((x, i) => { const ts = x * 1000; if (ts >= a && ts <= b && Number.isFinite(+hr.temperature_2m[i])) min = Math.min(min, +hr.temperature_2m[i]); });
    if (min <= 0.5) return { s: `Morgen früh Frost bis ${numDe(min, 0)}°`, lv: 'warn' };
    if (Array.isArray(dl.temperature_2m_max) && dl.temperature_2m_max.length > 1) {
      const p = Array.isArray(dl.precipitation_probability_max) ? +dl.precipitation_probability_max[1] || 0 : 0;
      return { s: `Morgen ${Math.round(dl.temperature_2m_min[1])}° bis ${Math.round(dl.temperature_2m_max[1])}°${p >= 60 ? `, Regen wahrscheinlich (${p} %)` : ', eher trocken'}` };
    }
  }
  return { s: 'Bleibt heute trocken' };
}

/* ---------- Pendeln ---------- */
const thin = (pts, n) => { if (pts.length <= n) return pts; const step = (pts.length - 1) / (n - 1); return Array.from({ length: n }, (_, i) => pts[Math.round(i * step)]); };
/* Wohin es gerade geht: morgens zur Arbeit, nach Arbeitsbeginn nach Hause, spät abends schon wieder für morgen */
function cmPlan(S, now) {
  const w = S && S.hours;
  if (!w) return { dir: now.getHours() < 11 ? 'work' : 'home', day: now };
  const st = at(now, w.start), en = at(now, w.end);
  if (now < new Date(+st + 60 * 6e4)) return { dir: 'work', day: now };
  if (now < new Date(+en + 3 * 36e5)) return { dir: 'home', day: now, end: en };
  return { dir: 'work', day: addDays(now, 1), next: true };
}
async function osrm(a, b) {
  const q = `${a.lon},${a.lat};${b.lon},${b.lat}?overview=simplified&geometries=geojson`;
  let o;
  try { o = await getJson(`https://routing.openstreetmap.de/routed-car/route/v1/driving/${q}`, null, 12); }
  catch { o = await getJson(`https://router.project-osrm.org/route/v1/driving/${q}`, null, 12); }
  const R = o && Array.isArray(o.routes) ? o.routes[0] : null;
  if (!R) throw Object.assign(new Error('route'), { why: 'route' });
  return { live: false, mins: R.duration / 60, delay: 0, closures: 0, pts: thin(R.geometry.coordinates.map(([lo, la]) => [la, lo]), 250) };
}
async function loadRoute(S, dir, live) {
  if (!S || !S.home || !S.work) return { missing: true };
  const [a, b] = dir === 'home' ? [S.work, S.home] : [S.home, S.work];
  const key = kcGet(KC.tomtom), sig = `${dir}|${a.lat.toFixed(4)},${a.lon.toFixed(4)}|${b.lat.toFixed(4)},${b.lon.toFixed(4)}`;
  let ttErr = '';
  if (key && live) {
    const r = await cached(`pendeln-${dir}`, sig, 10 * 6e4, 30e3, async () => {
      const j = await getJson(`https://api.tomtom.com/routing/1/calculateRoute/${a.lat},${a.lon}:${b.lat},${b.lon}/json?key=${encodeURIComponent(key)}&traffic=true&travelMode=car&routeType=fastest&sectionType=traffic&computeTravelTimeFor=all`, null, 12);
      const R = j && Array.isArray(j.routes) ? j.routes[0] : null;
      if (!R || !R.summary) throw Object.assign(new Error('route'), { why: 'route' });
      const pts = (R.legs || []).flatMap(l => (l.points || []).map(p => [+p.latitude, +p.longitude]));
      const closures = (R.sections || []).filter(s => s.sectionType === 'TRAFFIC' && s.simpleCategory === 'ROAD_CLOSURE').length;
      return { live: true, mins: R.summary.travelTimeInSeconds / 60, delay: (+R.summary.trafficDelayInSeconds || 0) / 60, closures, pts: thin(pts, 250) };
    });
    if (r.v) return { ...r.v, at: r.at, err: r.err, a, b, dir };
    ttErr = r.err;
  }
  // Ohne Key oder wenn TomTom gerade streikt: normale Fahrzeit ohne Verkehr
  const r = await cached(`strecke-${dir}`, sig, 6 * 36e5, 30e3, () => osrm(a, b));
  return r.v ? { ...r.v, at: r.at, err: ttErr || r.err, a, b, dir } : { err: ttErr || r.err || 'net', a, b, dir };
}

/* ---------- Spritpreise ---------- */
const FU_TYPE = { e5: 'Super E5', e10: 'Super E10', diesel: 'Diesel' };
const SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹';
const fuPrice = p => { const s = p.toFixed(3); return `${s.slice(0, -1).replace('.', ',')}${SUP[+s.slice(-1)]} €`; };
const fuNice = s => { const t = String(s || '').trim(); return t.length > 3 && t === t.toUpperCase() ? t.toLowerCase().replace(/(^|[\s\-/.(])(\p{L})/gu, (m, a, b) => a + b.toUpperCase()) : t; };
function prepRoute(pts) {
  const kx = 111320 * Math.cos(pts[0][0] * Math.PI / 180), ky = 110540;
  const xy = pts.map(([la, lo]) => [lo * kx, la * ky]), cum = [0];
  for (let i = 1; i < xy.length; i++) cum.push(cum[i - 1] + Math.hypot(xy[i][0] - xy[i - 1][0], xy[i][1] - xy[i - 1][1]));
  return { xy, cum, kx, ky };
}
function nearestOn(g, lat, lon) {
  const px = lon * g.kx, py = lat * g.ky;
  let best = Infinity;
  for (let i = 1; i < g.xy.length; i++) {
    const [ax, ay] = g.xy[i - 1], [bx, by] = g.xy[i], dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
    const u = L ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L)) : 0;
    best = Math.min(best, Math.hypot(px - (ax + u * dx), py - (ay + u * dy)));
  }
  return best;
}
async function loadFuel(S, route) {
  const key = kcGet(KC.fuel);
  if (!key) return { missing: true };
  const c = { type: 'e5', mode: 'place', place: { how: 'geo' }, rad: 5, sort: 'price', ...((S && S.fuel) || {}) };
  if (!FU_TYPE[c.type]) c.type = 'e5';
  let A = null;
  if (c.mode === 'route' && route && Array.isArray(route.pts) && route.pts.length > 1) {
    const g = prepRoute(route.pts), total = g.cum[g.cum.length - 1];
    let i = g.cum.findIndex(x => x >= total / 2);
    if (i < 0) i = Math.floor(route.pts.length / 2);
    A = { lat: route.pts[i][0], lon: route.pts[i][1], rad: Math.min(25, Math.max(3, total / 2000 + 2)), g };
  } else {
    let p = null;
    if (c.mode === 'home' || c.mode === 'route') p = (S && S.home) || await wxPlace(S);
    else if (c.place && c.place.how === 'fixed' && okPlace(c.place)) p = c.place;
    else if (c.place && c.place.how === 'wx') p = await wxPlace(S);
    else p = await deviceLoc();
    if (!p) return { c, err: 'ort' };
    A = { lat: +p.lat, lon: +p.lon, rad: [3, 5, 10, 25].includes(+c.rad) ? +c.rad : 5 };
  }
  const sig = `${A.lat.toFixed(3)},${A.lon.toFixed(3)},${A.rad.toFixed(1)}`;
  // Tankerkönig bittet um höchstens eine Abfrage pro Minute und keine häufigeren automatischen als alle 5 bis 10 Minuten
  const r = await cached('sprit', sig, 10 * 6e4, 61e3, async () => {
    const j = await getJson(`https://creativecommons.tankerkoenig.de/json/list.php?lat=${A.lat.toFixed(5)}&lng=${A.lon.toFixed(5)}&rad=${A.rad.toFixed(1)}&sort=dist&type=all&apikey=${encodeURIComponent(key)}`, null, 15);
    if (!j || j.ok === false) throw Object.assign(new Error((j && j.message) || 'tk'), { why: /key|schl/i.test((j && j.message) || '') ? 'key' : 'svc' });
    return (j.stations || []).slice(0, 200).map(s => ({ name: s.name, brand: s.brand, street: s.street, nr: s.houseNumber, place: s.place, lat: +s.lat, lng: +s.lng, dist: +s.dist, e5: s.e5, e10: s.e10, diesel: s.diesel, open: !!s.isOpen }));
  });
  return { c, A, r };
}

/* ---------- Zeilen je Bereich ---------- */
const COL = { cal: '#3D7BE0', bday: '#D9488A', sun: '#E8A126', night: '#7C6FD8', rain: '#3D7BE0', cm: '#1A9AA0', fuel: '#2FA36B', calm: '#8E9199', warn: '#E08A1C', bad: '#D7263D' };
const setupRow = (ico, col, t, s) => ({ ico, col, t, s, lv: 'calm', url: runUrl() });

function calRows(C, now) {
  if (!C) return [];
  if (C.err) return [setupRow('calendar', COL.cal, 'Kalender erlauben', 'Skript einmal in Scriptable starten')];
  const t = +now, today = sod(now), out = [];
  const timed = C.ev.filter(e => !e.a && e.e > t).sort((a, b) => a.s - b.s);
  const where = e => (e.l ? `, ${cut(e.l, 26)}` : '');
  const ev = (e, extra) => ({ ico: 'calendar', col: e.c || COL.cal, t: e.t, url: 'calshow:', ...extra });
  const run = timed.find(e => e.s <= t);
  if (run) out.push(ev(run, { s: `Läuft bis ${hm(new Date(run.e))} Uhr${where(run)}`, w: 'jetzt', lv: 'now' }));
  // Ganztägige Termine (ohne Geburtstage) für heute und morgen, nach den Terminen mit Uhrzeit des Tages
  const allDay = n => { const d0 = +addDays(today, n), d1 = +addDays(today, n + 1); return C.ev.filter(e => e.a && !BD_CAL.test(e.t) && e.s < d1 && e.e > d0 && (n === 0 || e.s >= d0)); };
  for (const n of [0, 1]) {
    for (const e of timed.filter(x => x.s > t && dayDiff(now, new Date(x.s)) === n)) {
      const ms = e.s - t, m = Math.max(1, Math.floor(ms / 6e4));
      out.push(ev(e, { s: `${n ? 'Morgen' : 'Heute'} um ${hm(new Date(e.s))} Uhr${where(e)}`, w: ms < 36e5 ? `in ${m} Min` : n ? 'morgen' : hm(new Date(e.s)), lv: ms <= 15 * 6e4 ? 'now' : '' }));
    }
    for (const e of allDay(n)) out.push(ev(e, { s: `${n ? 'Morgen' : 'Heute'}, ganztägig`, w: n ? 'morgen' : 'heute' }));
  }
  if (!out.length) {
    const next = timed.find(e => e.s > t);
    if (next) { const d = new Date(next.s); out.push(ev(next, { s: `${dayWord(now, d)} um ${hm(d)} Uhr${where(next)}`, w: WD[d.getDay()] })); }
    else out.push({ ico: 'calendar', col: COL.calm, t: 'Keine Termine', s: 'Die nächsten Tage ist der Kalender frei', lv: 'calm', url: 'calshow:' });
  }
  return out;
}

const leap = y => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
const bdDate = (b, y) => (b.m === 2 && b.d === 29 && !leap(y) ? new Date(y, 1, 28) : new Date(y, b.m - 1, b.d));
const bdNext = (b, today) => { const d = bdDate(b, today.getFullYear()); return d < today ? bdDate(b, today.getFullYear() + 1) : d; };
/* Geburtstage der nächsten 7 Tage: die eigene Liste aus dem Cockpit und, wenn dort eingeschaltet, die aus dem Kalender */
function bdRows(S, C, now) {
  const today = sod(now), list = [];
  for (const b of (S && S.bdays) || []) {
    const d = bdNext(b, today), dd = dayDiff(today, d);
    if (dd <= 7) list.push({ name: b.name, d, dd, age: b.y ? d.getFullYear() - b.y : null, cal: false });
  }
  if (C && !C.err && (!S || S.bdCal !== false)) {
    for (const e of [...C.bd, ...C.ev.filter(x => x.a && BD_CAL.test(x.t))]) {
      const d = sod(new Date(e.s)), dd = dayDiff(today, d), low = e.t.toLowerCase();
      if (dd < 0 || dd > 7) continue;
      // Steht dieselbe Person schon in der eigenen Liste, reicht der eigene Eintrag
      if (list.some(x => x.dd === dd && (x.cal ? x.name === e.t : low.includes(x.name.toLowerCase().split(/\s+/)[0])))) continue;
      list.push({ name: e.t, d, dd, age: null, cal: true });
    }
  }
  list.sort((a, b) => a.dd - b.dd || a.name.localeCompare(b.name, 'de'));
  return list.map(x => {
    const t = x.cal ? x.name : x.dd === 0 ? `${x.name} hat heute Geburtstag` : x.dd === 1 ? `${x.name} hat morgen Geburtstag` : `${x.name} hat Geburtstag`;
    const s = [x.dd > 1 ? dayWord(now, x.d) : '', x.age != null ? `wird ${x.age}` : ''].filter(Boolean).join(', ');
    return { ico: 'gift.fill', col: COL.bday, t, s: s ? s.charAt(0).toUpperCase() + s.slice(1) : '', w: x.dd === 0 ? 'heute' : x.dd === 1 ? 'morgen' : `in ${x.dd} Tagen`, lv: x.dd === 0 ? 'now' : '', url: COCKPIT };
  });
}

function wxRows(W, now) {
  if (!W) return [];
  const out = [], t = +now, d = W.w && W.w.v;
  for (const w of ((W.a && W.a.v) || []).filter(x => (x.ex == null || x.ex > t) && x.on <= t + 12 * 36e5).slice(0, 1)) {
    out.push({ ico: 'exclamationmark.triangle.fill', col: WN_COLOR[w.lv], t: w.ev, s: `${WN_NAME[w.lv]}, ${wnWhen(w, now)}`, w: w.on <= t ? 'jetzt' : hm(new Date(w.on)), lv: w.lv >= 3 ? 'bad' : 'warn', url: COCKPIT });
  }
  if (!d || !d.current) { out.push({ ico: 'cloud.fill', col: COL.calm, t: 'Wetter', s: 'Gerade nicht erreichbar, kommt gleich', lv: 'calm', url: COCKPIT }); return out; }
  const c = d.current, day = c.is_day !== 0, [name, sym, symN] = WMO[c.weather_code] || ['Wetter', 'cloud.fill'];
  const L = wxLine(d, now), dl = d.daily || {};
  const mm = Array.isArray(dl.temperature_2m_min) ? `${Math.round(dl.temperature_2m_min[0])}° / ${Math.round(dl.temperature_2m_max[0])}°` : '';
  const old = t - W.w.at > 45 * 6e4 ? `, Stand ${hm(new Date(W.w.at))}` : '';
  out.push({ ico: day ? sym : symN || sym, col: L.rain ? COL.rain : day ? COL.sun : COL.night, t: `${Math.round(c.temperature_2m)}°, ${name}`, s: L.s + old, w: mm, lv: L.lv || '', url: COCKPIT, temp: Math.round(c.temperature_2m) });
  return out;
}

function cmRows(S, R, plan, now, must) {
  if (!S) return must ? [setupRow('car.fill', COL.cm, 'Pendeln einrichten', 'Sync fehlt, tippen zum Einrichten')] : [];
  if (S.none) return must ? [S.err === 'key' ? setupRow('car.fill', COL.bad, 'Pendeln', 'Sync-Passwort stimmt nicht, tippen') : { ico: 'car.fill', col: COL.calm, t: 'Pendeln', s: 'Sync gerade nicht erreichbar, kommt gleich', lv: 'calm', url: COCKPIT }] : [];
  const free = freeReason(S, plan.day);
  if (free) {
    if (!must) return [];
    const nx = nextWork(S, plan.day);
    return [{ ico: 'car.fill', col: COL.cm, t: plan.next ? 'Morgen frei' : 'Heute frei', s: `${free}${nx ? `, weiter am ${WD[nx.getDay()]}, ${nx.getDate()}.${nx.getMonth() + 1}.` : ''}`, url: COCKPIT }];
  }
  if (!R || R.missing) return must ? [{ ico: 'car.fill', col: COL.calm, t: 'Pendeln', s: 'Adressen im Cockpit eintragen', lv: 'calm', url: COCKPIT }] : [];
  const title = plan.dir === 'work' ? 'Zur Arbeit' : 'Nach Hause';
  const maps = `https://maps.apple.com/?saddr=${R.a.lat},${R.a.lon}&daddr=${R.b.lat},${R.b.lon}&dirflg=d`;
  if (!Number.isFinite(R.mins)) return [{ ico: 'car.fill', col: COL.calm, t: title, s: 'Route gerade nicht erreichbar, kommt gleich', lv: 'calm', url: maps }];
  const mins = Math.max(1, Math.round(R.mins)), delay = Math.round(R.delay || 0);
  let s;
  if (R.closures) s = `${R.closures === 1 ? 'Sperrung' : `${R.closures} Sperrungen`} auf der Strecke`;
  else if (!R.live) s = R.err === 'key' ? 'TomTom-Key abgelehnt' : 'Ohne Live-Verkehr';
  else s = delay >= 1 ? `${delay} Min Stau` : 'Freie Fahrt';
  // Spät abends geht der Blick auf morgen: wann du los musst, wenn es so bleibt wie jetzt
  if (plan.next) s = `Morgen um ${hm(new Date(+at(plan.day, S.hours.start) - R.mins * 6e4))} los, wenn es so bleibt`;
  else if (plan.dir === 'home' && plan.end && now < plan.end) s += `, ab ${hm(plan.end)} an ${hm(new Date(+plan.end + R.mins * 6e4))} Uhr`;
  else s += `, an ${hm(new Date(+now + R.mins * 6e4))} Uhr`;
  if (R.live && +now - R.at > 20 * 6e4) s += `, Stand ${hm(new Date(R.at))}`;
  return [{ ico: 'car.fill', col: COL.cm, t: `${title} ${mins} Min`, s, w: R.live ? 'live' : '', lv: R.closures ? 'bad' : delay >= 3 ? 'warn' : '', url: maps }];
}

function fuelRows(F, now) {
  if (!F) return [];
  if (F.missing) return [setupRow('fuelpump.fill', COL.fuel, 'Spritpreise einrichten', 'Tankerkönig-Key fehlt, tippen zum Einrichten')];
  const sorte = FU_TYPE[F.c.type];
  if (F.err === 'ort') return [{ ico: 'fuelpump.fill', col: COL.calm, t: sorte, s: 'Kein Standort, Ort im Cockpit wählen', lv: 'calm', url: COCKPIT }];
  const { c, A, r } = F;
  if (!r || !r.v) {
    const s = r && r.err === 'key' ? 'Tankerkönig lehnt den Key ab' : r && r.err === 'wait' ? 'Preise kommen gleich' : 'Gerade nicht erreichbar, kommt gleich';
    return [{ ico: 'fuelpump.fill', col: COL.calm, t: sorte, s, lv: 'calm', url: r && r.err === 'key' ? runUrl() : COCKPIT }];
  }
  let list = r.v.map(s => ({ ...s, price: typeof s[c.type] === 'number' && s[c.type] > 0.5 ? s[c.type] : null })).filter(s => s.price);
  if (A.g) list = list.map(s => ({ ...s, off: nearestOn(A.g, s.lat, s.lng) })).filter(s => s.off <= 1500);
  const far = s => (s.off !== undefined ? s.off : s.dist * 1000);
  list.sort(c.sort === 'dist'
    ? (a, b) => (b.open - a.open) || (far(a) - far(b)) || (a.price - b.price)
    : (a, b) => (b.open - a.open) || (a.price - b.price) || (far(a) - far(b)));
  if (!list.length) return [{ ico: 'fuelpump.fill', col: COL.calm, t: sorte, s: A.g ? 'Keine Tankstelle direkt an der Strecke' : `Keine Tankstelle im Umkreis von ${A.rad} km`, lv: 'calm', url: COCKPIT }];
  const old = +now - r.at > 20 * 6e4 ? `, Stand ${hm(new Date(r.at))}` : '';
  // Erste Zeile mit Sorte, darunter Marke und Adresse. Rechts, wie weit es ist.
  return list.slice(0, 3).map((s, i) => {
    const where = A.g ? (s.off < 300 ? 'an der Strecke' : `${numDe(s.off * 2 / 1000, 1)} km Umweg`) : `${numDe(s.dist, 1)} km`;
    const name = fuNice(s.brand || s.name) || 'Tankstelle', street = fuNice(`${s.street || ''} ${s.nr || ''}`.trim());
    const sub = i === 0 ? [name, street] : [street, fuNice(s.place)];
    return {
      ico: 'fuelpump.fill', col: s.open ? COL.fuel : COL.calm, t: i === 0 ? `${sorte} ${fuPrice(s.price)}` : `${name} ${fuPrice(s.price)}`,
      s: `${sub.filter(Boolean).join(', ')}${s.open ? '' : ', geschlossen'}${i === 0 ? old : ''}`, w: where, lv: s.open ? '' : 'calm', fuel: true,
      url: `https://maps.apple.com/?daddr=${s.lat},${s.lng}&dirflg=d`
    };
  });
}

/* ---------- Was soll rein: nach Größe und Parameter ---------- */
const SECTIONS = ['termine', 'geburtstage', 'wetter', 'pendeln', 'sprit'];
const PRESET = { 1: ['termine', 'geburtstage', 'wetter'], 2: ['pendeln', 'sprit'], alles: SECTIONS };
const WORDS = { termine: 'termine', termin: 'termine', kalender: 'termine', geburtstage: 'geburtstage', geburtstag: 'geburtstage', wetter: 'wetter', pendeln: 'pendeln', fahrt: 'pendeln', auto: 'pendeln', sprit: 'sprit', tanken: 'sprit', spritpreise: 'sprit' };
function wanted(family, param) {
  const p = String(param || '').toLowerCase().trim();
  if (p) {
    if (PRESET[p]) return { list: PRESET[p], set: true };
    const list = [...new Set(p.split(/[\s,;+/]+/).map(x => WORDS[x.replace(/[^a-zäöüß]/g, '')]).filter(Boolean))];
    if (list.length) return { list, set: true };
  }
  if (family === 'large' || family === 'extraLarge') return { list: SECTIONS, set: false };
  if (family === 'medium') return { list: PRESET[1], set: false };
  return { list: ['termine', 'wetter'], set: false };
}
/* Platz verteilen: erst bekommt jeder Bereich eine Zeile, dann der Reihe nach mehr (Termine zuerst) */
const MAXROWS = { termine: 4, geburtstage: 2, wetter: 2, pendeln: 1, sprit: 2 };
function allocate(groups, cap) {
  const take = groups.map(g => Math.min(g.rows.length, g.min || 1));
  let left = cap - take.reduce((a, b) => a + b, 0);
  for (let i = groups.length - 1; left < 0 && i >= 0; i--) if (take[i]) { take[i] = 0; left++; }
  for (let i = 0; i < groups.length && left > 0; i++) {
    const extra = Math.min(groups[i].rows.length - take[i], MAXROWS[groups[i].key] - take[i], left);
    if (extra > 0) { take[i] += extra; left -= extra; }
  }
  return groups.flatMap((g, i) => g.rows.slice(0, take[i]));
}

/* ---------- Alles laden ---------- */
async function collect(family, param, now) {
  const want = wanted(family, param), has = k => want.list.includes(k);
  const S = await loadSync();
  const plan = cmPlan(S && !S.none ? S : null, now);
  // An freien Tagen braucht es keine Live-Fahrzeit, außer die Spritpreise suchen entlang der Strecke
  const free = S && !S.none ? freeReason(S, plan.day) : '';
  const needRoute = (has('pendeln') && !free) || (has('sprit') && S && S.fuel && S.fuel.mode === 'route');
  const [C, W, R] = await Promise.all([
    has('termine') || has('geburtstage') ? loadCal(now) : null,
    has('wetter') ? wxPlace(S && !S.none ? S : null).then(loadWeather) : null,
    // An freien Tagen reicht für die Spritsuche die Strecke ohne Verkehr, das spart TomTom-Abfragen
    needRoute && S && !S.none ? loadRoute(S, plan.dir, !free) : null
  ]);
  const F = has('sprit') ? await loadFuel(S && !S.none ? S : null, R) : null;
  const rows = {
    termine: has('termine') ? calRows(C, now) : [],
    geburtstage: has('geburtstage') ? bdRows(S && !S.none ? S : null, C, now) : [],
    wetter: has('wetter') ? wxRows(W, now) : [],
    pendeln: has('pendeln') ? cmRows(S, R, plan, now, want.set || !want.list.includes('termine')) : [],
    sprit: has('sprit') ? fuelRows(F, now) : []
  };
  // Ohne Sync gibt es keine Geburtstagsliste und keine Adressen, das sagt eine Zeile, wenn Platz ist
  const syncNote = S && S.none && S.err === 'key' ? { ...setupRow('arrow.triangle.2.circlepath', COL.bad, 'Sync-Passwort stimmt nicht', 'Tippen und neu eintragen'), lv: 'bad' } : null;
  return { want, rows, S, syncNote, accent: (S && S.accent) || ACCENTS.amber };
}

/* ---------- Zeichnen ---------- */
const dyn = (l, d) => Color.dynamic(new Color(l), new Color(d));
function darken(hex, f) {
  const n = parseInt(hex.slice(1), 16), ch = s => Math.round(((n >> s) & 255) * (1 - f));
  return `#${[16, 8, 0].map(s => pad(ch(s).toString(16))).join('')}`;
}
function palette(accent) {
  return {
    bg: dyn('#FBFAF7', '#141518'),
    ink: dyn('#1B1F27', '#F2F1EE'),
    muted: dyn('#6B6F78', '#9A9DA4'),
    faint: dyn('#9A9DA4', '#6B6F78'),
    accent: new Color(accent),
    accentText: dyn(darken(accent, 0.3), accent),
    warn: dyn('#B8620A', '#F2A24A'),
    bad: dyn('#C2412D', '#EF7B6E')
  };
}
function symbol(name, size, weight) {
  const s = SFSymbol.named(name) || SFSymbol.named('circle.fill');
  s.applyFont(weight === 'bold' ? Font.boldSystemFont(size) : Font.semiboldSystemFont(size));
  return s.image;
}
const rowColor = r => (r.lv === 'bad' ? COL.bad : r.lv === 'calm' ? COL.calm : r.col);
function addRow(parent, r, P, opt) {
  const s = parent.addStack();
  s.layoutHorizontally();
  s.centerAlignContent();
  s.spacing = 9;
  if (r.url && opt.links) s.url = r.url;
  const col = r.lv === 'now' ? P.accentHex : rowColor(r);
  const ic = s.addStack();
  ic.size = new Size(24, 24);
  ic.cornerRadius = 7;
  ic.backgroundColor = new Color(col, 0.16);
  ic.centerAlignContent();
  const img = ic.addImage(symbol(r.ico, 12));
  img.imageSize = new Size(14, 14);
  img.tintColor = new Color(col);
  const tx = s.addStack();
  tx.layoutVertically();
  tx.spacing = 1;
  const t = tx.addText(r.t);
  t.font = Font.semiboldSystemFont(opt.small ? 12.5 : 13.5);
  t.textColor = r.lv === 'calm' ? P.muted : P.ink;
  t.lineLimit = 1;
  t.minimumScaleFactor = 0.8;
  if (r.s) {
    const u = tx.addText(r.s);
    u.font = Font.systemFont(opt.small ? 11 : 11.5);
    u.textColor = r.lv === 'warn' || r.lv === 'bad' ? (r.lv === 'bad' ? P.bad : P.warn) : P.muted;
    u.lineLimit = 1;
    u.minimumScaleFactor = 0.85;
  }
  if (r.w && !opt.small) {
    s.addSpacer();
    const w = s.addText(r.w);
    w.font = r.lv === 'now' ? Font.semiboldSystemFont(11.5) : Font.mediumSystemFont(11.5);
    w.textColor = r.lv === 'now' ? P.accentText : P.faint;
    w.lineLimit = 1;
  } else s.addSpacer();
}
function addFooter(w, P, now, fuel) {
  const f = w.addStack();
  f.layoutHorizontally();
  const a = f.addText(`Stand ${hm(now)}`);
  a.font = Font.systemFont(9);
  a.textColor = P.faint;
  f.addSpacer();
  if (fuel) {
    const b = f.addText('Spritpreise: Tankerkönig, MTS-K, CC BY 4.0');
    b.font = Font.systemFont(9);
    b.textColor = P.faint;
    b.lineLimit = 1;
    b.minimumScaleFactor = 0.7;
  }
}
async function buildWidget(family, param) {
  const now = new Date(), D = await collect(family, param, now);
  const P = { ...palette(D.accent), accentHex: D.accent };
  const w = new ListWidget();
  w.url = COCKPIT;
  w.refreshAfterDate = new Date(+now + 15 * 6e4);
  // Bei einer Warnung bleibt die Temperatur trotzdem stehen
  const groups = D.want.list.map(k => ({ key: k, rows: D.rows[k], min: k === 'wetter' ? Math.min(2, D.rows[k].length) : 1 })).filter(g => g.rows.length);

  if (family && family.startsWith('accessory')) return accessory(w, family, groups, D, now);

  w.backgroundColor = P.bg;
  const big = family === 'large' || family === 'extraLarge', small = family === 'small';
  let short = false;
  try { short = Device.screenSize().height < 700; } catch { short = false; }
  const cap = big ? (short ? 6 : 7) : 3;
  if (D.syncNote && big) groups.unshift({ key: 'pendeln', rows: [D.syncNote] });
  const rows = allocate(groups, cap);
  w.setPadding(big ? 15 : small ? 12 : 12, small ? 12 : 15, big ? 13 : small ? 12 : 10, small ? 12 : 15);
  if (big) {
    const h = w.addStack();
    h.layoutHorizontally();
    h.centerAlignContent();
    const dot = h.addStack();
    dot.size = new Size(7, 7);
    dot.cornerRadius = 3.5;
    dot.backgroundColor = P.accent;
    h.addSpacer(6);
    const a = h.addText('Jetzt wichtig');
    a.font = Font.semiboldSystemFont(12);
    a.textColor = P.muted;
    h.addSpacer();
    const b = h.addText(`${WD[now.getDay()]}, ${now.getDate()}.${now.getMonth() + 1}.`);
    b.font = Font.mediumSystemFont(12);
    b.textColor = P.faint;
    w.addSpacer(10);
  }
  if (!rows.length) {
    const t = w.addText('Alles ruhig, gerade drängt nichts.');
    t.font = Font.mediumSystemFont(13);
    t.textColor = P.muted;
  }
  rows.forEach((r, i) => {
    if (i) w.addSpacer(big ? 8 : small ? 7 : 6);
    addRow(w, r, P, { small, links: !small });
  });
  // Klein: Inhalt mittig, ohne Fußzeile. Sonst oben beginnen, unten der Stand.
  if (!small) {
    w.addSpacer();
    addFooter(w, P, now, rows.some(r => r.fuel));
  }
  return w;
}
/* Sperrbildschirm: iOS färbt selbst ein, deshalb nur Text und Symbole */
function accessory(w, family, groups, D, now) {
  const rows = groups.flatMap(g => g.rows);
  const wx = (D.rows.wetter || []).find(r => r.temp !== undefined);
  if (family === 'accessoryInline') {
    const r = rows[0];
    w.addText(r ? `${r.w && r.w !== 'jetzt' && !/°/.test(r.w) ? `${r.w} ` : ''}${r.t}` : 'Alles ruhig');
    return w;
  }
  if (family === 'accessoryCircular') {
    w.addAccessoryWidgetBackground = true;
    const img = w.addImage(symbol(wx ? wx.ico : 'cloud.fill', 14));
    img.imageSize = new Size(18, 18);
    img.centerAlignImage();
    const t = w.addText(wx ? `${wx.temp}°` : '–');
    t.font = Font.semiboldSystemFont(15);
    t.centerAlignText();
    return w;
  }
  rows.slice(0, 2).forEach((r, i) => {
    const t = w.addText(r.t);
    t.font = i ? Font.systemFont(12) : Font.semiboldSystemFont(14);
    t.lineLimit = 1;
    if (!i && r.s) { const s = w.addText(r.s); s.font = Font.systemFont(12); s.lineLimit = 1; s.textOpacity = 0.8; }
  });
  if (!rows.length) w.addText('Alles ruhig');
  return w;
}

/* ---------- Einrichten in der App ---------- */
async function say(title, message) { const a = new Alert(); a.title = title; a.message = message; a.addAction('OK'); await a.presentAlert(); }
async function ask(title, message, fields, ok = 'Speichern') {
  const a = new Alert();
  a.title = title;
  a.message = message;
  for (const f of fields) { if (f.secure) a.addSecureTextField(f.label, f.value || ''); else a.addTextField(f.label, f.value || ''); }
  a.addAction(ok);
  a.addCancelAction('Abbrechen');
  const i = await a.presentAlert();
  return i === -1 ? null : fields.map((_, n) => a.textFieldValue(n).trim());
}
async function testSync(url, pass) {
  try {
    const j = await getJson(url, { Authorization: `Bearer ${pass}` });
    return j.state ? `Klappt. Stand vom ${j.at ? new Date(j.at).toLocaleString('de-DE') : 'Cockpit'}.` : 'Verbunden, aber die Ablage ist noch leer. Erst im Cockpit den Sync einschalten.';
  } catch (e) {
    return e.status === 401 ? 'Das Passwort stimmt nicht.' : e.status ? `Die Ablage antwortet mit Fehler ${e.status}.` : 'Die Adresse ist nicht erreichbar.';
  }
}
async function testTomTom(key) {
  try { await getJson(`https://api.tomtom.com/routing/1/calculateRoute/53.5503,9.9927:53.5530,10.0067/json?key=${encodeURIComponent(key)}&traffic=true`); return 'TomTom: klappt.'; }
  catch (e) { return e.status === 401 || e.status === 403 ? 'TomTom lehnt den Key ab. Nimm den Key aus dem Feld ganz rechts im TomTom-Dashboard, nicht die ID.' : 'TomTom ist gerade nicht erreichbar.'; }
}
async function testFuel(key) {
  try {
    const j = await getJson(`https://creativecommons.tankerkoenig.de/json/list.php?lat=53.5511&lng=9.9937&rad=1.5&sort=dist&type=all&apikey=${encodeURIComponent(key)}`);
    return j.ok === false ? `Tankerkönig sagt: ${j.message || 'Fehler'}` : 'Tankerkönig: klappt.';
  } catch { return 'Tankerkönig ist gerade nicht erreichbar.'; }
}
function clearCache() { try { if (FM.fileExists(DIR)) FM.remove(DIR); } catch { /* egal */ } }
/* Zugang aus dem Cockpit: Anpassen, Daten, iPhone-Widget, „Zugang kopieren“ legt ihn in die Zwischenablage */
async function importPaste() {
  const raw = String(Pasteboard.pasteString() || '').trim();
  if (!raw.startsWith(PASTE)) { await say('Nichts gefunden', 'In der Zwischenablage liegt kein Zugang. Im Cockpit unter Anpassen, Daten, iPhone-Widget auf „Zugang kopieren“ tippen und dann hier nochmal.'); return; }
  let j = null;
  try { j = JSON.parse(Data.fromBase64String(raw.slice(PASTE.length)).toRawString()); } catch { j = null; }
  if (!j || typeof j !== 'object') { await say('Das hat nicht geklappt', 'Der Zugang in der Zwischenablage ist unvollständig. Kopier ihn im Cockpit bitte nochmal.'); return; }
  const got = [], tests = [];
  if (j.sync && j.sync.url && j.sync.pass) { kcSet(KC.sync, JSON.stringify({ url: j.sync.url, pass: j.sync.pass })); got.push('Sync'); tests.push(testSync(j.sync.url, j.sync.pass)); }
  if (j.tomtom) { kcSet(KC.tomtom, j.tomtom); got.push('TomTom-Key'); tests.push(testTomTom(j.tomtom)); }
  if (j.fuel) { kcSet(KC.fuel, j.fuel); got.push('Tankerkönig-Key'); tests.push(testFuel(j.fuel)); }
  // Passwort und Keys nicht in der Zwischenablage liegen lassen
  Pasteboard.copyString(' ');
  clearCache();
  const res = await Promise.all(tests);
  await say(got.length ? `Übernommen: ${got.join(', ')}` : 'Leer', got.length ? res.join('\n') : 'Im Zugang war nichts drin. Auf dem Gerät mit dem Cockpit fehlen wohl Sync und Keys.');
}
async function setupSync() {
  const s = kcJson(KC.sync) || {};
  const v = await ask('Sync', 'Adresse und Passwort findest du im Cockpit unter Anpassen, Daten, Sync. Leer lassen heißt: ohne Sync.', [{ label: 'https://…workers.dev', value: s.url }, { label: 'Passwort', value: s.pass, secure: true }]);
  if (!v) return;
  if (!v[0] || !v[1]) { kcSet(KC.sync, ''); clearCache(); await say('Sync entfernt', 'Ohne Sync fehlen Geburtstage, Adressen und dein Sprit-Ort.'); return; }
  const url = /^https?:\/\//i.test(v[0]) ? v[0] : `https://${v[0]}`;
  kcSet(KC.sync, JSON.stringify({ url, pass: v[1] }));
  clearCache();
  await say('Sync', await testSync(url, v[1]));
}
async function setupKey(which) {
  const tt = which === 'tomtom', k = tt ? KC.tomtom : KC.fuel;
  const v = await ask(tt ? 'TomTom-Key' : 'Tankerkönig-Key', tt ? 'Für die Live-Fahrzeit. Ohne Key gibt es die normale Fahrzeit ohne Verkehr.' : 'Für die Spritpreise. Den Key bekommst du kostenlos auf onboarding.tankerkoenig.de.', [{ label: 'Key', value: kcGet(k), secure: true }]);
  if (!v) return;
  kcSet(k, v[0]);
  clearCache();
  if (v[0]) await say(tt ? 'TomTom' : 'Tankerkönig', tt ? await testTomTom(v[0]) : await testFuel(v[0]));
}
async function setupCals() {
  const a = new Alert();
  a.title = 'Kalender';
  a.message = 'Welche Kalender sollen ins Widget? Geburtstage kommen immer extra.';
  a.addAction('Alle');
  a.addAction('Auswählen');
  a.addCancelAction('Abbrechen');
  const i = await a.presentSheet();
  if (i === 0) kcSet(KC.cals, '');
  if (i === 1) {
    try { const list = await Calendar.presentPicker(true); kcSet(KC.cals, JSON.stringify(list.map(c => c.identifier))); }
    catch { /* abgebrochen */ }
  }
}
async function preview(family, param) {
  const w = await buildWidget(family, param);
  if (family === 'large') await w.presentLarge();
  else if (family === 'medium') await w.presentMedium();
  else await w.presentSmall();
}
async function menu() {
  // Beim ersten Start einmal nach Kalender und Standort fragen lassen, damit die Widgets später dürfen
  try { await Calendar.forEvents(); } catch { /* später nochmal */ }
  if (!kcGet(KC.sync) && !kcGet(KC.tomtom) && !kcGet(KC.fuel)) {
    await say('Cockpit-Widget', 'Am schnellsten geht es so: Im Cockpit unter Anpassen, Daten, iPhone-Widget auf „Zugang kopieren“ tippen, dann hier „Zugang einfügen“ wählen. Termine und Wetter klappen auch ohne.');
  }
  for (;;) {
    const s = kcJson(KC.sync), cals = kcJson(KC.cals);
    const a = new Alert();
    a.title = `Cockpit-Widget ${VERSION}`;
    a.message = [`Sync: ${s ? 'eingerichtet' : 'fehlt'}`, `TomTom: ${kcGet(KC.tomtom) ? 'Key da' : 'ohne, Fahrzeit ohne Verkehr'}`, `Tankerkönig: ${kcGet(KC.fuel) ? 'Key da' : 'fehlt'}`, `Kalender: ${Array.isArray(cals) && cals.length ? `${cals.length} ausgewählt` : 'alle'}`].join('\n');
    const acts = [
      ['Vorschau groß', () => preview('large', '')],
      ['Vorschau mittel, Teil 1', () => preview('medium', '')],
      ['Vorschau mittel, Teil 2', () => preview('medium', '2')],
      ['Vorschau klein', () => preview('small', '')],
      ['Zugang einfügen', importPaste],
      ['Sync einrichten', setupSync],
      ['TomTom-Key', () => setupKey('tomtom')],
      ['Tankerkönig-Key', () => setupKey('fuel')],
      ['Kalender auswählen', setupCals],
      ['Zwischenspeicher leeren', async () => { clearCache(); await say('Erledigt', 'Beim nächsten Mal holt das Widget alles frisch.'); }]
    ];
    for (const [t] of acts) a.addAction(t);
    a.addCancelAction('Fertig');
    const i = await a.presentSheet();
    if (i < 0 || i >= acts.length) break;
    await acts[i][1]();
  }
}

/* ---------- Start ---------- */
if (config.runsInApp) {
  await menu();
} else {
  const w = await buildWidget(config.widgetFamily || 'medium', args.widgetParameter);
  Script.setWidget(w);
}
Script.complete();
