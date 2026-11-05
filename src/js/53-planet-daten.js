/* Wetterplanet, Teil 2: Daten für die Extras.
 * Stundenwerte fürs Vollbild (gestern bis übermorgen) und Luftqualität für Dunst und Saharastaub kommen von Open-Meteo,
 * der Kp-Index fürs Polarlicht von NOAA SWPC, die Bahn der ISS von wheretheiss.at. Alle drei ohne Anmeldung, mit CORS.
 * Dazu, was im Cockpit los ist: Pendelzeit fürs Auto, der nächste Urlaub fürs Flugzeug und den Urlaubsplaneten, Termine fürs
 * Fähnchen, geschaffte Gewohnheitstage für den Wald, Feiertage, Silvester und Sternschnuppen.
 * Geholt wird nur, was ein sichtbarer Planet gerade braucht (Kp und ISS nur nachts), und alles wird zwischengespeichert. */
const pnx = { hourly: new Map(), air: new Map(), rainAt: new Map(), kp: { v: null, at: 0, busy: false, tried: 0 }, iss: { list: null, at: 0, busy: false, tried: 0 }, memo: new Map() };
const pnKey = P => `${(+P.lat).toFixed(2)}|${(+P.lon).toFixed(2)}`;
/* Neue Daten: Szenen gleich neu berechnen, im Vollbild die Beschriftung auffrischen */
function pnxDirty() { for (const I of pn.inst.values()) I.envAt = 0; if (pnFs.open) pnFsRefresh(); }
function pnMemo(k, sig, fn) { const m = pnx.memo.get(k); if (m && m.sig === sig) return m.v; const v = fn(); pnx.memo.set(k, { sig, v }); return v; }
const pnDue = (e, every, retry) => !e || (!e.busy && Date.now() - e.at > every && Date.now() - (e.tried || 0) > retry);

/* Stundenwerte: nur fürs Vollbild, alle 30 Minuten neu */
function pnHourly(loc) {
  const k = pnKey(loc), e = pnx.hourly.get(k);
  if (pnDue(e, 30 * 6e4, 6e4)) pnHourFetch(loc, k);
  return e && e.h ? e.h : null;
}
async function pnHourFetch(loc, k) {
  const e = pnx.hourly.get(k) || { at: 0 };
  e.busy = true; e.tried = Date.now();
  pnx.hourly.set(k, e);
  try {
    const j = await getJson(`https://api.open-meteo.com/v1/forecast?latitude=${(+loc.lat).toFixed(4)}&longitude=${(+loc.lon).toFixed(4)}&hourly=temperature_2m,relative_humidity_2m,weather_code,cloud_cover,wind_speed_10m,wind_direction_10m,snow_depth,precipitation&past_days=1&forecast_days=3&timezone=auto&timeformat=unixtime&wind_speed_unit=kmh`);
    if (j && j.hourly && Array.isArray(j.hourly.time) && j.hourly.time.length > 2) { e.h = j.hourly; e.at = Date.now(); }
  } catch { /* nächster Versuch in einer Minute */ }
  e.busy = false;
  pnxDirty();
}
/* Wetter zu einem Zeitpunkt: Code von der nächsten vollen Stunde, Zahlen dazwischen gemittelt, Wind über den kürzeren Weg */
function pnAtHour(h, t) {
  const T = h.time, s = t / 1000;
  if (!T || s < T[0] - 1800 || s > T[T.length - 1] + 1800) return null;
  let i = 0;
  while (i < T.length - 2 && T[i + 1] <= s) i++;
  const f = clamp01((s - T[i]) / ((T[i + 1] - T[i]) || 3600)), j = i + 1;
  const L = key => { const a = h[key] && h[key][i], b = h[key] && h[key][j]; return Number.isFinite(a) && Number.isFinite(b) ? a + (b - a) * f : Number.isFinite(a) ? a : Number.isFinite(b) ? b : NaN; };
  const d0 = h.wind_direction_10m[i], d1 = h.wind_direction_10m[j];
  const dd = Number.isFinite(d0) && Number.isFinite(d1) ? ((((d1 - d0) % 360) + 540) % 360) - 180 : 0;
  return {
    weather_code: h.weather_code[f < 0.5 ? i : j], cloud_cover: L('cloud_cover'), temperature_2m: L('temperature_2m'), wind_speed_10m: L('wind_speed_10m'),
    wind_direction_10m: Number.isFinite(d0) ? (d0 + dd * f + 360) % 360 : NaN, snow_depth: L('snow_depth'), precipitation: L('precipitation'), relative_humidity_2m: L('relative_humidity_2m')
  };
}

/* Luftqualität (Europäischer Index und Saharastaub), stündlich */
function pnAir(loc) {
  const k = pnKey(loc), e = pnx.air.get(k);
  if (pnDue(e, 60 * 6e4, 5 * 6e4)) pnAirFetch(loc, k);
  return e && e.c ? e.c : null;
}
async function pnAirFetch(loc, k) {
  const e = pnx.air.get(k) || { at: 0 };
  e.busy = true; e.tried = Date.now();
  pnx.air.set(k, e);
  try {
    const j = await getJson(`https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${(+loc.lat).toFixed(3)}&longitude=${(+loc.lon).toFixed(3)}&current=european_aqi,pm2_5,dust&timezone=auto`);
    if (j && j.current) { e.c = j.current; e.at = Date.now(); }
  } catch { /* später noch mal */ }
  e.busy = false;
  pnxDirty();
}

/* Polarlicht: geomagnetische Breite (Dipol, Pol bei 80,7° N, 72,7° W) und der aktuelle Kp-Index.
 * Sichtbar am Horizont ab etwa 66 − 2,1 · Kp Grad geomagnetischer Breite, in Hamburg also ab Kp 6 bis 7. */
function pnGeomag(lat, lon) {
  const p = 80.7 * PN_RAD, l0 = -72.7 * PN_RAD, a = lat * PN_RAD, b = lon * PN_RAD;
  return Math.asin(Math.sin(a) * Math.sin(p) + Math.cos(a) * Math.cos(p) * Math.cos(b - l0)) / PN_RAD;
}
function pnKp() {
  const K = pnx.kp;
  if (!K.busy && Date.now() - K.at > 20 * 6e4 && Date.now() - K.tried > 5 * 6e4) pnKpFetch();
  return K.v;
}
async function pnKpFetch() {
  const K = pnx.kp;
  K.busy = true; K.tried = Date.now();
  try {
    const j = await getJson('https://services.swpc.noaa.gov/json/planetary_k_index_1m.json');
    // Der höchste Wert der letzten Viertelstunde, die Minutenwerte schwanken
    const v = (Array.isArray(j) ? j.slice(-15) : []).map(x => +(x.estimated_kp ?? x.kp_index)).filter(Number.isFinite);
    if (v.length) { K.v = Math.max(...v); K.at = Date.now(); }
  } catch { /* später noch mal */ }
  K.busy = false;
  pnxDirty();
}

/* ISS: Positionen für die nächsten zehn Minuten (eine pro Minute), alle fünf Minuten neu, nur nachts.
 * Daraus Höhe und Richtung über dem Ort. Zu sehen ist sie, wenn sie über 10° steht, selbst in der Sonne ist und es bei dir dunkel. */
const pnEcef = (lat, lon, r) => { const a = lat * PN_RAD, b = lon * PN_RAD; return [r * Math.cos(a) * Math.cos(b), r * Math.cos(a) * Math.sin(b), r * Math.sin(a)]; };
function pnIssAt(loc, t) {
  const S = pnx.iss;
  if (!S.busy && (Date.now() - S.at > 5 * 6e4) && Date.now() - S.tried > 6e4) pnIssFetch();
  const L = S.list, s = t / 1000;
  if (!L || L.length < 2 || s < L[0].t || s >= L[L.length - 1].t) return null;
  let i = 0;
  while (i < L.length - 2 && L[i + 1].t <= s) i++;
  const A = L[i], B = L[i + 1], f = (s - A.t) / (B.t - A.t);
  if (!A.lit || !B.lit) return null;
  const sat = pnV.mix(pnEcef(A.lat, A.lon, 6371 + A.h), pnEcef(B.lat, B.lon, 6371 + B.h), f);
  const la = +loc.lat * PN_RAD, lo = +loc.lon * PN_RAD, o = pnEcef(+loc.lat, +loc.lon, 6371), d = pnV.norm(pnV.sub(sat, o));
  const up = pnV.norm(o), east = [-Math.sin(lo), Math.cos(lo), 0], north = [-Math.sin(la) * Math.cos(lo), -Math.sin(la) * Math.sin(lo), Math.cos(la)];
  const el = Math.asin(pnV.dot(d, up)) / PN_RAD, az = (Math.atan2(pnV.dot(d, east), pnV.dot(d, north)) / PN_RAD + 360) % 360;
  return el > 10 ? { el, az, h: A.h } : null;
}
async function pnIssFetch() {
  const S = pnx.iss, t0 = Math.floor(Date.now() / 1000);
  S.busy = true; S.tried = Date.now();
  try {
    const ts = Array.from({ length: 10 }, (_, i) => t0 + i * 60).join(',');
    const j = await getJson(`https://api.wheretheiss.at/v1/satellites/25544/positions?timestamps=${ts}&units=kilometers`);
    if (Array.isArray(j) && j.length > 1) {
      S.list = j.map(p => ({ t: +p.timestamp, lat: +p.latitude, lon: +p.longitude, h: +p.altitude, lit: p.visibility !== 'eclipsed' })).filter(p => Number.isFinite(p.lat)).sort((a, b) => a.t - b.t);
      S.at = Date.now();
    }
  } catch { /* später noch mal */ }
  S.busy = false;
}

/* Feiertags-Deko: Lichterkette vom 1. Dezember bis Heilige Drei Könige, Kürbisse rund um Halloween */
function pnFest(now) {
  const m = now.getMonth() + 1, d = now.getDate();
  return { xmas: m === 12 || (m === 1 && d <= 6), pumpkins: (m === 10 && d >= 20) || (m === 11 && d <= 2) };
}
/* Feuerwerk an Silvester, Raketen pro Sekunde: ab 18 Uhr ab und zu eine, ab halb zwölf mehr, um Mitternacht richtig viel,
 * bis ein Uhr klingt es ab */
function pnFireworks(now) {
  const m = now.getMonth() + 1, d = now.getDate(), mins = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;
  if (m === 12 && d === 31 && mins >= 18 * 60) return mins >= 1438 ? 1.4 : mins >= 1410 ? 0.12 + (mins - 1410) / 28 * 0.3 : 0.04;
  if (m === 1 && d === 1 && mins < 60) return mins < 20 ? 1.4 : 1.4 - (mins - 20) / 40 * 1.25;
  return 0;
}
/* Sternschnuppen: die großen Ströme mit Höhepunkt und Stärke (ZHR). Um den Höhepunkt herum deutlich mehr. */
const PN_SHOWERS = [[1, 3, 110, 'Quadrantiden'], [4, 22, 18, 'Lyriden'], [5, 6, 50, 'Eta-Aquariiden'], [8, 12, 100, 'Perseiden'], [10, 21, 20, 'Orioniden'], [11, 17, 15, 'Leoniden'], [12, 14, 150, 'Geminiden']];
function pnShower(now) {
  let best = null;
  for (const [m, d, zhr, name] of PN_SHOWERS) for (const y of [now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1]) {
    const dd = Math.abs(+now - +new Date(y, m - 1, d, 2)) / DAY;
    if (dd < 3) { const k = Math.exp(-dd * dd / 1.4) * zhr; if (!best || k > best.k) best = { name, k, zhr, peak: new Date(y, m - 1, d) }; }
  }
  return best;
}
/* Pro Sekunde: sonst etwa alle zweieinhalb Minuten eine, in der Perseiden-Nacht alle zwölf Sekunden */
const pnMeteorRate = now => { const s = pnShower(now); return 1 / 150 + (s ? s.k / 60 / 20 : 0); };

/* Dein Auto: Arbeitszeit aus dem Fortschritt (Arbeitstag-Balken), Fahrzeit aus dem Pendeln (sonst 30 Minuten).
 * Morgens fährt es so los, dass du pünktlich ankommst, abends kommt es nach Feierabend zurück. Ohne Strecke im Pendeln kein Auto. */
function pnCarState(now) {
  const C = state.commute, ok = p => p && Number.isFinite(p.lat) && Number.isFinite(p.lon);
  if (!ok(C.home) || !ok(C.work)) return null;
  const mins = Math.max(8, Math.min(120, (cm.sum && cm.sum.mins) || cm.homeMins || 30)), wb = workBar();
  if (!wb || freeReason(wb, now)) return { st: 'home', mins };
  const s = +at(now, wb.start), e = +at(now, wb.end), lead = (mins + 5) * 6e4, t = +now;
  if (e <= s) return { st: 'home', mins };
  if (t < s - lead) return { st: 'home', mins };
  if (t < s) return { st: 'drive', dir: 'work', a: s - lead, b: s, mins };
  if (t < e) return { st: 'away', mins, back: e };
  if (t < e + lead) return { st: 'drive', dir: 'home', a: e, b: e + lead, mins };
  return { st: 'home', mins };
}
/* Der nächste Urlaub: läuft gerade oder kommt als Nächstes. Beispiel-Einträge zählen nicht. */
function pnTrip(now) {
  const k = ymd(now), e = state.vacation.entries.filter(x => !x.example && x.to >= k).sort((a, b) => a.from.localeCompare(b.from))[0];
  if (!e) return null;
  const P = e.place && Number.isFinite(+e.place.lat) && Number.isFinite(+e.place.lon) ? e.place : null;
  return { e, now: e.from <= k, days: Math.max(0, dayDiff(sod(now), parseYmd(e.from))), place: P };
}
/* Termine aus dem Kalender: was heute noch kommt (ganztägige zählen mit) und morgen */
function pnAgenda(now) {
  if (!ca.data || !Array.isArray(ca.data.events)) return null;
  return pnMemo('agenda', `${ymd(now)}|${Math.floor(+now / 3e4)}|${ca.data.at}`, () => {
    const feeds = caSec().feeds;
    if (!feeds.length) return null;
    const evs = ca.data.events.filter(e => feeds.some(f => f.id === e.f));
    return { today: caDay(now, evs).filter(e => e.a || e.e > +now), tomorrow: caDay(addDays(sod(now), 1), evs) };
  });
}
/* Das Fähnchen geht hoch, solange heute noch ein Termin mit Uhrzeit ansteht */
const pnFlagUp = now => { const A = pnAgenda(now); return !!(A && A.today.some(e => !e.a)); };
/* Gewohnheitswald: jeder geschaffte Tag pflanzt einen Baum. Geschafft heißt: alles, was an dem Tag dran war, ist abgehakt
 * (eine Gewohnheit zählt erst ab ihrem ersten Haken, wöchentliche nie als Pflicht) und mindestens eine ist erledigt.
 * ages: Alter der Bäume in Tagen (höchstens 14, dann sind sie ausgewachsen), die jüngsten zuletzt. */
function pnHabitTrees(now) {
  const items = [];
  for (const [, w] of widgetsOf('habits')) items.push(...w.cfg.items);
  const today = ymd(now), sig = today + '|' + items.map(h => `${h.id}:${h.rhythm}:${h.log.length}:${h.log[h.log.length - 1] || ''}`).join(',');
  return pnMemo('habit', sig, () => {
    const H = items.map(h => ({ h, set: new Set(h.log), first: h.log[0] || '9999-12-31' }));
    const days = [...new Set(items.flatMap(h => h.log))].filter(k => k <= today).sort();
    const good = days.filter(k => { const d = parseYmd(k); return H.every(x => x.h.rhythm === 'weekly' || x.first > k || !hbRequired(x.h, d) || x.set.has(k)); });
    const t0 = sod(now), ages = good.slice(-PN_HABIT_MAX).map(k => Math.min(14, Math.max(0, dayDiff(parseYmd(k), t0))));
    return { n: good.length, today: good[good.length - 1] === today, ages, key: `${ages.length}:${ages.slice(-15).join(',')}` };
  });
}
