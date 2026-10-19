/* F1 Rennanalyse über OpenF1. Kostenlos und ohne Konto gibt es alles, was nicht live ist: Gesperrt ist nur das Fenster
 * von 30 Minuten vor bis 30 Minuten nach einer Session. Ohne Konto gelten 3 Abfragen pro Sekunde und 30 pro Minute,
 * deshalb laufen die Abfragen nacheinander und jedes Rennen wird verdichtet im Browser aufgehoben (jere-cockpit-f1-rennen,
 * höchstens AN_MAX Rennen, kommt nicht in die Sicherung).
 *
 * Die Punkte auf der Karte: Die Strecke stammt aus den Positionsdaten einer schnellen, sauberen Runde (eine Abfrage).
 * Wo jeder Fahrer gerade ist, rechnet das Cockpit aus seinen Runden- und Sektorzeiten: An jeder Sektorgrenze stimmt die
 * Zeit genau, dazwischen fährt der Punkt so wie die Vorlage-Runde. In der Boxengasse und unter roter Flagge bleibt er
 * stehen. Echte Positionsdaten aller Fahrer wären rund 60 MB pro Rennen und sprengen die Grenzen von OpenF1.
 *
 * Messpunkte pro Fahrer (X): Start, Ende Sektor 1, Ende Sektor 2, Ende Runde 1 (= Start Runde 2) und so weiter,
 * in Sekunden ab dem Start. Index i durch 3 ist die Zahl der fertigen Runden, i modulo 3 der Sektor. */
const OF1 = 'https://api.openf1.org/v1';
const AN_KEY = 'jere-cockpit-f1-rennen', AN_MAX = 3, AN_V = 1;
const AN_FREE = 30 * 6e4;
const AN_W = 1000, AN_H = 750, AN_PAD = 44;
/* Abstand der Startplätze in Sekunden der Vorlage-Runde. Echt wären gut 0,1 s, etwas mehr macht die Startaufstellung lesbar. */
const AN_GRID = 0.22;
const AN_CMP = { SOFT: 'S', MEDIUM: 'M', HARD: 'H', INTERMEDIATE: 'I', WET: 'W' };
const AN_TYRE = { S: 'Soft', M: 'Medium', H: 'Hard', I: 'Intermediate', W: 'Regenreifen', '?': 'unbekannt' };
const AN_PER = { sc: 'Safety-Car', vsc: 'Virtuelles Safety-Car', red: 'Rote Flagge' };
const AN_ERR = {
  locked: 'OpenF1 gibt ein Rennen kostenlos erst etwa 30 Minuten nach dem Ende frei. Ich schau automatisch wieder nach.',
  busy: 'Gerade waren es zu viele Abfragen auf einmal. In einer Minute geht es von selbst weiter.',
  net: 'OpenF1 ist gerade nicht erreichbar. In ein paar Minuten gibt es automatisch einen neuen Versuch.',
  http: 'OpenF1 antwortet gerade mit einem Fehler. In ein paar Minuten gibt es automatisch einen neuen Versuch.',
  empty: 'Für dieses Rennen hat OpenF1 noch keine Rundenzeiten. Ich schau später nochmal nach.'
};
const AN_PLAY = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.2v13.6L18.8 12z"/></svg>';
const AN_PAUSE = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6.5" y="5" width="4" height="14" rx="1.2"/><rect x="13.5" y="5" width="4" height="14" rx="1.2"/></svg>';
const an = { list: null, listAt: 0, listYear: 0, listTried: 0, listBusy: null, listErr: null, pick: 0, data: null, busy: null, err: null, errKey: 0, errAt: 0, t: 0, play: false, wasPlaying: false, speed: 30, raf: 0, last: 0, tab: 'map', sel: 0, cars: null, drawn: 0, w: 0, lbSig: '', lbAt: 0, timer: null };

const anNum = x => typeof x === 'number' && Number.isFinite(x) && x > 0;
const anR3 = x => Math.round(x * 1000) / 1000;
const anIso = ms => new Date(ms).toISOString().slice(0, 19);
const anMed = a => { const s = a.filter(Number.isFinite).sort((x, y) => x - y); return s.length ? s[s.length >> 1] : NaN; };
const anNorm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]/g, '');
/* 95.202 → 1:35,202 */
const anLapTxt = s => { const m = Math.floor(s / 60), r = s - m * 60; return `${m}:${r < 10 ? '0' : ''}${r.toFixed(3).replace('.', ',')}`; };
/* Abstand: +2,4 oder +1:02,3 */
const anGapTxt = s => { if (s < 60) return `+${s.toFixed(1).replace('.', ',')}`; const m = Math.floor(s / 60), r = s - m * 60; return `+${m}:${r < 10 ? '0' : ''}${r.toFixed(1).replace('.', ',')}`; };
const anErr = (kind, status) => Object.assign(new Error(kind), { kind, status });
const anWait = e => (e && e.kind === 'busy' ? 65e3 : e && e.kind === 'empty' ? 30 * 6e4 : 10 * 6e4);

/* Speicher im Browser: Rennkalender und die zuletzt angesehenen Rennen */
function anStore() {
  try {
    const j = JSON.parse(localStorage.getItem(AN_KEY) || 'null');
    if (j && j.v === AN_V && j.races && typeof j.races === 'object') return j;
  } catch { /* kaputt, dann eben neu */ }
  return { v: AN_V, list: null, races: {} };
}
function anSave(s) {
  const keys = Object.keys(s.races).sort((a, b) => (s.races[b].used || 0) - (s.races[a].used || 0));
  for (const k of keys.slice(AN_MAX)) delete s.races[k];
  // Passt es nicht in den Speicher, fliegt das am längsten nicht angesehene Rennen raus
  for (let i = 0; i < 5; i++) {
    try { localStorage.setItem(AN_KEY, JSON.stringify(s)); return; } catch {
      const old = Object.keys(s.races).sort((a, b) => (s.races[a].used || 0) - (s.races[b].used || 0))[0];
      if (!old) return;
      delete s.races[old];
    }
  }
}

/* Eine Abfrage bei OpenF1. Alle laufen nacheinander mit mindestens 360 ms Abstand, so bleibt es unter 3 pro Sekunde. */
let anGate = Promise.resolve(), anLastAt = 0;
function anGet(path) {
  const run = async () => {
    const wait = anLastAt + 360 - Date.now();
    if (wait > 0) await new Promise(r => setTimeout(r, wait));
    anLastAt = Date.now();
    const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 25000);
    try {
      let r;
      try { r = await fetch(OF1 + path, { signal: ctl.signal }); } catch { throw anErr('net'); }
      if (r.status === 404) return [];   // OpenF1 meldet „keine Daten“ mit 404
      if (r.status === 429) throw anErr('busy', 429);
      if (r.status === 401 || r.status === 403) throw anErr('locked', r.status);
      if (!r.ok) throw anErr('http', r.status);
      let j;
      try { j = await r.json(); } catch { throw anErr('net'); }
      if (Array.isArray(j)) return j;
      if (j && /live|auth|token|sponsor|subscri/i.test(String(j.detail || j.error || j.message || ''))) throw anErr('locked', r.status);
      return [];
    } finally { clearTimeout(timer); }
  };
  const p = anGate.then(run, run);
  anGate = p.catch(() => {});
  return p;
}

/* Rennkalender: alle Rennen und Sprints eines Jahres, mit Namen aus den Meetings */
function anSessions(ss, ms) {
  const meet = new Map((Array.isArray(ms) ? ms : []).filter(m => m && m.meeting_key).map(m => [m.meeting_key, m]));
  return (Array.isArray(ss) ? ss : []).filter(s => s && s.session_type === 'Race' && !s.is_cancelled && s.session_key && s.date_start).map(s => {
    const m = meet.get(s.meeting_key) || {}, st = Date.parse(s.date_start);
    const nm = m.meeting_name ? f1Short(m.meeting_name) : (COUNTRY_DE[s.country_name] || s.country_name || s.location || 'Rennen');
    return { k: +s.session_key, y: +s.year || new Date(st).getFullYear(), sprint: /sprint/i.test(s.session_name || ''), s: st, e: Date.parse(s.date_end) || st + 2 * 36e5, name: String(nm).slice(0, 60), ck: Number.isInteger(s.circuit_key) ? s.circuit_key : 0 };
  }).filter(s => Number.isFinite(s.s)).sort((a, b) => a.s - b.s);
}
const anFree = (s, now) => now > s.e + AN_FREE;
const anLive = (s, now) => now > s.s - AN_FREE && now <= s.e + AN_FREE;
const anOpts = () => (an.list || []).filter(s => state.widgets.f1an.cfg.sprint || !s.sprint);
const anAvail = now => anOpts().filter(s => anFree(s, now));
const anLabel = (s, y) => `${s.name}${s.sprint ? ' Sprint' : ''}${y && s.y !== y ? ` ${s.y}` : ''}`;
function anTarget(now) {
  const av = anAvail(now);
  return av.find(s => s.k === an.pick) || av[av.length - 1] || null;
}
const anListStale = now => !an.listAt || now - an.listAt > 12 * 36e5 || new Date(now).getFullYear() !== an.listYear;

function anLoadList() {
  if (an.listBusy) return an.listBusy;
  an.listBusy = (async () => {
    const st = anStore(), now = Date.now(), y = new Date(now).getFullYear();
    try {
      let L = st.list;
      if (!L || L.year !== y || now - L.at > 12 * 36e5 || !Array.isArray(L.s)) {
        const ss = await anGet(`/sessions?year=${y}`), ms = await anGet(`/meetings?year=${y}`).catch(e => { if (e.kind === 'busy') throw e; return []; });
        let list = anSessions(ss, ms);
        // Vor dem ersten Rennen des Jahres: das Vorjahr gleich mit, damit es etwas zum Nachschauen gibt
        if (!list.some(s => anFree(s, now))) {
          const s2 = await anGet(`/sessions?year=${y - 1}`), m2 = await anGet(`/meetings?year=${y - 1}`).catch(e => { if (e.kind === 'busy') throw e; return []; });
          list = anSessions(s2, m2).concat(list);
        }
        L = { year: y, at: now, s: list };
        const st2 = anStore();
        st2.list = L;
        anSave(st2);
      }
      an.list = L.s;
      an.listAt = L.at;
      an.listYear = L.year;
      an.listErr = null;
    } catch (e) {
      an.listErr = e;
      if (st.list && Array.isArray(st.list.s)) { an.list = st.list.s; an.listAt = st.list.at; an.listYear = st.list.year; }
    } finally { an.listBusy = null; renderAn(); anPlan(); }
  })();
  return an.listBusy;
}

/* Ein Rennen holen: aus dem Speicher, sonst von OpenF1. Kurz nach dem Rennen geholte Daten werden nach sechs Stunden
 * einmal frisch geholt, falls Strafen das Ergebnis noch geändert haben. */
function anLoad(sess) {
  if (an.busy) return an.busy.p;
  const p = (async () => {
    const st = anStore(), hit = st.races[sess.k], now = Date.now();
    const ok = hit && hit.d && hit.d.v === AN_V && hit.d.k === sess.k && (hit.at > sess.e + 6 * 36e5 || now < sess.e + 6 * 36e5);
    if (ok) {
      hit.used = now;
      anSave(st);
      an.err = null;
      anSet(hit.d);
      return;
    }
    try {
      const d = await anFetch(sess);
      const st2 = anStore();
      st2.races[sess.k] = { at: Date.now(), used: Date.now(), d };
      anSave(st2);
      an.err = null;
      anSet(d);
    } catch (e) {
      if (hit && hit.d && hit.d.v === AN_V) anSet(hit.d);
      an.err = e && e.kind ? e : anErr('http');
      an.errKey = sess.k;
      an.errAt = Date.now();
    }
  })().finally(() => { an.busy = null; renderAn(); anPlan(); });
  an.busy = { k: sess.k, p };
  return p;
}
function anSet(d) {
  const same = an.data && an.data.k === d.k;
  an.data = d;
  if (!same) {
    anPause();
    an.t = 0;
    an.drawn = 0;
    an.lbSig = '';
    if (an.sel && !d.drv.some(o => o.n === an.sel)) an.sel = 0;
  }
}

async function anFetch(sess) {
  const q = `?session_key=${sess.k}`;
  const laps = await anGet('/laps' + q);
  if (!laps.length) throw anErr('empty');
  const R = { laps };
  for (const [k, ep] of [['drivers', 'drivers'], ['res', 'session_result'], ['stints', 'stints'], ['pit', 'pit'], ['rc', 'race_control'], ['pos', 'position'], ['wx', 'weather']]) R[k] = await anGet(`/${ep}${q}`);
  const d = anBuild(sess, R);
  // Die Strecke: Positionsdaten einer schnellen Runde ohne Boxenstopp, notfalls der nächsten. Sind die Positionsdaten
  // in einem Rennen kaputt (alles 0), kommt der Streckenverlauf von MultiViewer, auf den OpenF1 selbst verweist.
  for (const c of d.refs.slice(0, 2)) {
    const loc = await anGet(`/location?session_key=${sess.k}&driver_number=${c.n}&date>=${anIso(c.a - 1500)}&date<=${anIso(c.b + 1500)}`);
    const r = anTrack(d, c, loc);
    if (r === true || r === 'zero') break;
  }
  if (!d.track && sess.ck) {
    try { anTrackMv(d, await getJson(`https://api.multiviewer.app/api/v1/circuits/${sess.ck}/${sess.y}`, 15000)); } catch { /* ohne Karte gehen die anderen Ansichten trotzdem */ }
  }
  delete d.refs;
  return d;
}

/* Letzter Messpunkt bis zur Zeit t (−1 vor dem ersten) */
function anIdx(x, t) {
  if (!x.length || t < x[0]) return -1;
  let lo = 0, hi = x.length - 1;
  while (lo < hi) { const m = (lo + hi + 1) >> 1; if (x[m] <= t) lo = m; else hi = m - 1; }
  return lo;
}

/* Aus den Rohdaten von OpenF1 wird ein kleines Paket: Messpunkte, Positionen pro Runde, Reifen, Stopps, Phasen */
function anBuild(sess, R) {
  const tt = s => Date.parse(s);
  const byN = new Map();
  for (const l of R.laps) {
    if (!l || !Number.isInteger(l.driver_number) || !Number.isInteger(l.lap_number) || l.lap_number < 1) continue;
    if (!byN.has(l.driver_number)) byN.set(l.driver_number, []);
    byN.get(l.driver_number).push(l);
  }
  let t0 = Infinity;
  for (const ls of byN.values()) for (const l of ls) if (l.lap_number === 1 && l.date_start) { const x = tt(l.date_start); if (Number.isFinite(x)) t0 = Math.min(t0, x); }
  if (!Number.isFinite(t0)) throw anErr('empty');
  // Typische Anteile der Sektoren, falls einer Runde Sektorzeiten fehlen
  const q1s = [], q2s = [];
  for (const ls of byN.values()) for (const l of ls) {
    const a = l.duration_sector_1, b = l.duration_sector_2, c = l.duration_sector_3;
    if (anNum(a) && anNum(b) && anNum(c)) { q1s.push(a / (a + b + c)); q2s.push((a + b) / (a + b + c)); }
  }
  const q1 = anMed(q1s) || 1 / 3, q2 = anMed(q2s) || 2 / 3;
  const X = {}, refs = [];
  let fast = null;
  for (const [n, ls] of byN) {
    ls.sort((a, b) => a.lap_number - b.lap_number);
    const x = [];
    let end = null;
    for (let i = 0; i < ls.length; i++) {
      const l = ls[i], nx = ls[i + 1];
      if (l.lap_number !== i + 1) break;   // Lücke in den Daten: ab hier keine verlässlichen Zeiten
      const a = end !== null ? end : l.date_start ? (tt(l.date_start) - t0) / 1000 : NaN;
      if (!Number.isFinite(a)) break;
      if (!x.length) x.push(a);
      const s1 = l.duration_sector_1, s2 = l.duration_sector_2, s3 = l.duration_sector_3;
      let b = nx && nx.lap_number === l.lap_number + 1 && nx.date_start ? (tt(nx.date_start) - t0) / 1000 : NaN;
      if (!(b > a)) b = anNum(l.lap_duration) ? a + l.lap_duration : NaN;
      if (!(b > a)) {
        // Letzte Runde nicht beendet: so weit, wie die Sektorzeiten reichen
        if (anNum(s1)) { x.push(a + s1); if (anNum(s2)) x.push(a + s1 + s2); }
        break;
      }
      const T = b - a;
      let x1, x2;
      if (anNum(s1) && anNum(s2) && anNum(s3)) { const k = T / (s1 + s2 + s3); x1 = a + s1 * k; x2 = x1 + s2 * k; }
      else if (anNum(s1) && anNum(s2) && s1 + s2 < T) { x1 = a + s1; x2 = x1 + s2; }
      else if (anNum(s1) && s1 < T) { x1 = a + s1; x2 = x1 + (T - s1) * (q2 - q1) / (1 - q1); }
      else { x1 = a + T * q1; x2 = a + T * q2; }
      x.push(x1, x2, b);
      end = b;
      if (anNum(l.lap_duration) && (!fast || l.lap_duration < fast.t)) fast = { n, lap: l.lap_number, t: l.lap_duration };
      if (l.lap_number > 1 && !l.is_pit_out_lap && !(nx && nx.is_pit_out_lap) && anNum(s1) && anNum(s2) && anNum(s3)) refs.push({ n, a: t0 + a * 1000, b: t0 + b * 1000, s1, s2, s3, T });
    }
    if (x.length > 1) X[n] = x.map(anR3);
  }
  const nums = Object.keys(X).map(Number);
  if (!nums.length) throw anErr('empty');
  const last = n => X[n][X[n].length - 1];
  const laps = n => Math.floor((X[n].length - 1) / 3);
  const N = Math.max(...nums.map(laps));
  const winEnd = Math.min(...nums.filter(n => laps(n) === N && (X[n].length - 1) % 3 === 0).map(last));
  const T = Math.max(...nums.map(last));

  const res = new Map((Array.isArray(R.res) ? R.res : []).filter(r => r && Number.isInteger(r.driver_number)).map(r => [r.driver_number, r]));
  const info = new Map((Array.isArray(R.drivers) ? R.drivers : []).filter(x => x && Number.isInteger(x.driver_number)).map(x => [x.driver_number, x]));
  const status = n => {
    const r = res.get(n);
    if (r) return r.dsq ? 'dsq' : r.dns ? 'dns' : r.dnf ? 'dnf' : 'fin';
    return (X[n].length - 1) % 3 === 0 && last(n) >= winEnd - 0.01 ? 'fin' : 'dnf';
  };
  // Startaufstellung: die letzte Position jedes Fahrers vor dem Start
  const g0 = new Map();
  for (const p of (Array.isArray(R.pos) ? R.pos : []).filter(p => p && p.date && Number.isInteger(p.driver_number) && Number.isInteger(p.position)).sort((a, b) => tt(a.date) - tt(b.date))) {
    if (tt(p.date) > t0 + 1000) break;
    g0.set(p.driver_number, p.position);
  }
  const grid = new Map(nums.slice().sort((a, b) => (g0.get(a) || 99) - (g0.get(b) || 99) || (X[a][1] || 0) - (X[b][1] || 0) || a - b).map((n, i) => [n, i + 1]));
  // Endstand: Ergebnisliste, Ausfälle danach (wer später raus ist, steht weiter vorn)
  const posOf = n => { const r = res.get(n); return r && Number.isInteger(r.position) ? r.position : 999; };
  const order = nums.slice().sort((a, b) => posOf(a) - posOf(b) || X[b].length - X[a].length || last(a) - last(b));
  const team = new Map();
  const drv = order.map(n => {
    const f = info.get(n) || {}, r = res.get(n), tm = String(f.team_name || '');
    const d2 = !!tm && team.has(tm);
    team.set(tm, true);
    return {
      n, a: String(f.name_acronym || n).slice(0, 4), nm: f.first_name || f.last_name ? `${f.first_name || ''} ${f.last_name || ''}`.trim() : `Nr. ${n}`, ln: String(f.last_name || ''),
      team: tm, c: /^[0-9a-f]{6}$/i.test(f.team_colour || '') ? '#' + f.team_colour : '', d2, g: grid.get(n), p: posOf(n) < 999 ? posOf(n) : 0, st: status(n), pts: r && +r.points || 0
    };
  });
  // Position am Ende jeder Runde: Reihenfolge, in der die Fahrer die Linie überquert haben
  const P = {};
  for (const n of nums) P[n] = [grid.get(n)];
  for (let lap = 1; lap <= N; lap++) nums.filter(n => X[n].length > 3 * lap).sort((a, b) => X[a][3 * lap] - X[b][3 * lap]).forEach((n, i) => { P[n][lap] = i + 1; });
  // Wann der Führende eine Runde beginnt (LS[0] = Start, LS[N] = Ziel)
  const LS = [];
  for (let lap = 0; lap <= N; lap++) LS.push(Math.min(...nums.filter(n => X[n].length > 3 * lap).map(n => X[n][3 * lap])));
  const lastLap = n => Math.ceil((X[n].length - 1) / 3);

  // Phasen aus der Rennleitung: Safety-Car, virtuelles Safety-Car, rote Flagge
  const leaderNext = t => {
    let best = null, bi = -1;
    for (const n of nums) { const i = anIdx(X[n], t); if (i > bi || (i === bi && i >= 0 && best !== null && X[n][i] < X[best][i])) { bi = i; best = n; } }
    if (best === null) return T;
    const x = X[best];
    for (let j = Math.ceil((bi + 1) / 3) * 3; j < x.length; j += 3) if (x[j] > t) return x[j];
    return x[x.length - 1];
  };
  const ev = (Array.isArray(R.rc) ? R.rc : []).filter(m => m && m.date).map(m => ({ t: (tt(m.date) - t0) / 1000, m: String(m.message || '').toUpperCase(), flag: m.flag, scope: m.scope })).filter(m => Number.isFinite(m.t)).sort((a, b) => a.t - b.t);
  const per = [];
  let cur = null;
  const close = t => {
    if (!cur) return;
    const b = cur.k === 'sc' && cur.in !== undefined ? Math.min(t, leaderNext(cur.in)) : t;
    if (b > cur.a + 1) per.push([anR3(Math.max(0, cur.a)), anR3(Math.min(b, T)), cur.k]);
    cur = null;
  };
  for (const e of ev) {
    // Vorsicht: „CHEQUERED FLAG“ enthält auch „RED FLAG“, und Strafen nennen „RED FLAG INFRINGEMENT“
    const isRed = /^(RED FLAG\b|SESSION ABORTED)|\bRACE SUSPENDED/.test(e.m) || (e.flag === 'RED' && e.scope === 'Track');
    if (isRed) { if (e.t > 0 && (!cur || cur.k !== 'red')) { close(e.t); cur = { a: e.t, k: 'red' }; } }
    else if (cur && cur.k === 'red') { if (/SESSION STARTED|RESUMED/.test(e.m) || (e.flag === 'GREEN' && e.scope === 'Track')) close(e.t); }
    else if (/VSC DEPLOYED|VIRTUAL SAFETY CAR DEPLOYED/.test(e.m)) { close(e.t); cur = { a: e.t, k: 'vsc' }; }
    else if (/VSC ENDING|VIRTUAL SAFETY CAR ENDING/.test(e.m)) { if (cur && cur.k === 'vsc') close(e.t + 8); }
    else if (/SAFETY CAR DEPLOYED/.test(e.m)) { if (cur && cur.k === 'sc') delete cur.in; else { close(e.t); cur = { a: e.t, k: 'sc' }; } }
    else if (/SAFETY CAR IN THIS LAP/.test(e.m)) { if (cur && cur.k === 'sc') cur.in = e.t; }
    else if (/SESSION FINISHED|CHEQUERED/.test(e.m) && e.t > 0) close(e.t);
  }
  if (cur) close(cur.k === 'sc' && cur.in !== undefined ? Infinity : T);
  const red = per.filter(p => p[2] === 'red');
  const inRed = (a, b) => red.some(r => a < r[1] && b > r[0]);

  // Boxenstopps. Die Zeit bei OpenF1 ist das Ende der Boxengasse, das prüfen wir an der Ziellinie (die liegt im Fenster).
  const raw = [];
  for (const p of Array.isArray(R.pit) ? R.pit : []) {
    if (!p || !p.date || !X[p.driver_number]) continue;
    const lane = anNum(p.lane_duration) ? p.lane_duration : anNum(p.pit_duration) ? p.pit_duration : 0, t = (tt(p.date) - t0) / 1000;
    if (!Number.isFinite(t) || lane > 600) continue;
    raw.push({ n: p.driver_number, lap: Number.isInteger(p.lap_number) ? p.lap_number : 0, t, lane, stop: anNum(p.stop_duration) ? p.stop_duration : 0 });
  }
  let before = 0, after = 0;
  for (const p of raw) {
    const c = X[p.n][3 * p.lap];
    if (!p.lane || c === undefined) continue;
    if (c >= p.t - p.lane && c <= p.t) before++;
    if (c >= p.t && c <= p.t + p.lane) after++;
  }
  const flip = after > before;
  const pits = raw.map(p => { const a = flip ? p.t : p.t - p.lane, b = flip ? p.t + p.lane : p.t; return [p.n, p.lap, anR3(a), anR3(b), +p.lane.toFixed(1), +p.stop.toFixed(1)]; })
    .filter(p => !inRed(p[2], p[3])).sort((a, b) => a[3] - b[3]);
  // Stehzeiten pro Fahrer: eigene Boxenstopps und rote Flaggen
  const fz = {};
  for (const n of nums) {
    const w = red.map(r => [r[0], r[1]]).concat(pits.filter(p => p[0] === n && p[4] > 0).map(p => [p[2], p[3]])).sort((a, b) => a[0] - b[0]);
    const m = [];
    for (const [a, b] of w) { if (m.length && a <= m[m.length - 1][1]) m[m.length - 1][1] = Math.max(m[m.length - 1][1], b); else m.push([a, b]); }
    if (m.length) fz[n] = m.flat();
  }
  // Reifen: Stints sortiert, ohne Überlappungen, nur so weit, wie der Fahrer gekommen ist
  const ST = {};
  for (const s of Array.isArray(R.stints) ? R.stints : []) {
    if (!s || !X[s.driver_number] || !Number.isInteger(s.lap_start)) continue;
    const n = s.driver_number, a = Math.max(1, s.lap_start), b = Math.min(lastLap(n), Number.isInteger(s.lap_end) ? s.lap_end : lastLap(n));
    if (b < a) continue;
    (ST[n] = ST[n] || []).push([a, b, AN_CMP[String(s.compound || '').toUpperCase()] || '?', Number.isInteger(s.tyre_age_at_start) ? Math.max(0, s.tyre_age_at_start) : 0]);
  }
  for (const n of Object.keys(ST)) {
    const l = ST[n].sort((a, b) => a[0] - b[0]), out = [];
    for (const s of l) { const p = out[out.length - 1]; if (p && s[0] <= p[1]) p[1] = s[0] - 1; if (p && p[1] < p[0]) out.pop(); out.push(s); }
    ST[n] = out;
  }
  // Wetter während des Rennens
  const wx = (Array.isArray(R.wx) ? R.wx : []).filter(w => w && w.date && Number.isFinite(w.air_temperature) && tt(w.date) >= t0 - 6e5 && tt(w.date) <= t0 + T * 1000);
  const avg = a => a.length ? Math.round(a.reduce((s, x) => s + x, 0) / a.length) : null;
  const W = wx.length ? { air: avg(wx.map(w => w.air_temperature)), trk: avg(wx.map(w => w.track_temperature).filter(Number.isFinite)), rain: wx.some(w => w.rainfall > 0) } : null;
  const calm = r => !per.some(p => r.a < t0 + p[1] * 1000 && r.b > t0 + p[0] * 1000);
  return {
    v: AN_V, k: sess.k, name: sess.name, sprint: sess.sprint, y: sess.y, s: sess.s, t0, T: anR3(T + 4), N,
    drv, X, P, LS, pits, fz, ST, per, fast, W, track: null, q: [anR3(q1), anR3(q2)],
    refs: refs.filter(calm).sort((a, b) => a.T - b.T).filter((r, i, l) => l.findIndex(x => x.n === r.n) === i).slice(0, 3)
  };
}

/* Streckenverlauf aus den Positionsdaten einer Runde. 'zero', wenn OpenF1 nur Nullen liefert. */
function anTrack(d, c, loc) {
  const raw = (Array.isArray(loc) ? loc : []).filter(p => p && p.driver_number === c.n && Number.isFinite(p.x) && Number.isFinite(p.y) && p.date);
  const pts = raw.filter(p => p.x || p.y).map(p => [(Date.parse(p.date) - c.a) / 1000, p.x, -p.y]).filter(p => p[0] >= -1.5 && p[0] <= c.T + 1.5).sort((a, b) => a[0] - b[0]);
  if (raw.length && !raw.some(p => p.x || p.y)) return 'zero';
  if (pts.length < 40 || pts[0][0] > 1.2 || pts[pts.length - 1][0] < c.T - 1.2) return false;
  const f = c.T / (c.s1 + c.s2 + c.s3);
  return anFit(d, pts, [0, anR3(c.s1 * f), anR3((c.s1 + c.s2) * f), anR3(c.T)], 'of1');
}
/* Ersatz: Streckenverlauf von MultiViewer mit der Zeit pro Punkt aus einer Runde. Die Sektoren schätzen wir mit den
 * typischen Anteilen aus dem Rennen. */
function anTrackMv(d, j) {
  const x = j && j.x, y = j && j.y, tp = j && j.trackPositionTime, lap = (j && j.candidateLap) || {};
  if (!Array.isArray(x) || !Array.isArray(y) || !Array.isArray(tp) || x.length !== y.length || x.length !== tp.length || x.length < 40) return false;
  const s0 = Number.isFinite(lap.lapStartSessionTime) ? lap.lapStartSessionTime : tp[0];
  const L = anNum(lap.lapTime) ? lap.lapTime : tp[tp.length - 1] - s0;
  const pts = x.map((v, i) => [tp[i] - s0, +v, -y[i]]).filter(p => p.every(Number.isFinite) && p[0] >= -1.5 && p[0] <= L + 1.5);
  if (pts.length < 40 || !(L > 20)) return false;
  return anFit(d, pts, [0, anR3(d.q[0] * L), anR3(d.q[1] * L), anR3(L)], 'mv');
}
/* Strecke ins Bild legen: so gedreht, dass sie die Fläche am besten füllt */
function anFit(d, pts, R, src) {
  let best = null;
  for (let deg = 0; deg < 180; deg += 3) {
    const r = deg * Math.PI / 180, co = Math.cos(r), si = Math.sin(r);
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const [, x, y] of pts) {
      const u = x * co - y * si, w = x * si + y * co;
      if (u < x0) x0 = u;
      if (u > x1) x1 = u;
      if (w < y0) y0 = w;
      if (w > y1) y1 = w;
    }
    const k = Math.min((AN_W - 2 * AN_PAD) / (x1 - x0 || 1), (AN_H - 2 * AN_PAD) / (y1 - y0 || 1));
    if (!best || k > best.k * 1.002) best = { k, co, si, x0, x1, y0, y1 };
  }
  const { k, co, si, x0, x1, y0, y1 } = best, ox = (AN_W - (x1 - x0) * k) / 2, oy = (AN_H - (y1 - y0) * k) / 2;
  const p = [], tau = [];
  for (const [t, x, y] of pts) {
    p.push(Math.round((x * co - y * si - x0) * k + ox), Math.round((x * si + y * co - y0) * k + oy));
    tau.push(Math.round(t * 100) / 100);
  }
  d.track = { p, tau, R, src };
  return true;
}
/* Punkt auf der Vorlage-Runde nach tau Sekunden */
function anPt(tr, tau) {
  const L = tr.R[3], T = tr.tau, P = tr.p;
  tau = ((tau % L) + L) % L;
  let lo = 0, hi = T.length - 1;
  if (tau <= T[0]) return [P[0], P[1]];
  if (tau >= T[hi]) return [P[2 * hi], P[2 * hi + 1]];
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (T[m] <= tau) lo = m; else hi = m; }
  const f = (tau - T[lo]) / (T[hi] - T[lo] || 1);
  return [P[2 * lo] + (P[2 * hi] - P[2 * lo]) * f, P[2 * lo + 1] + (P[2 * hi + 1] - P[2 * lo + 1]) * f];
}
/* Zeit ohne Stehzeiten (Boxengasse, rote Flagge) */
function anEff(w, t) {
  let s = t;
  for (let i = 0; i < w.length; i += 2) { if (t <= w[i]) break; s -= Math.min(t, w[i + 1]) - w[i]; }
  return s;
}
/* Wo auf der Vorlage-Runde ein Fahrer zur Zeit t ist. In Runde 1 startet er von seinem Startplatz hinter der Linie. */
function anTau(d, o, t) {
  const x = d.X[o.n], R = d.track.R, i = anIdx(x, t);
  if (i < 0) return -(o.g - 1) * AN_GRID;
  if (i >= x.length - 1) return R[(x.length - 1) % 3];
  const w = d.fz[o.n] || [], a = anEff(w, x[i]), b = anEff(w, x[i + 1]);
  const f = b - a > 0.05 ? clamp01((anEff(w, t) - a) / (b - a)) : t >= x[i + 1] ? 1 : 0;
  const k = i % 3;
  let tau = R[k] + (R[k + 1] - R[k]) * f;
  if (i === 0) tau -= (o.g - 1) * AN_GRID * (1 - f);
  return tau;
}
/* Reihenfolge zur Zeit t: wer den letzten Messpunkt am weitesten vorn und am frühesten passiert hat */
function anBoard(d, t) {
  const rows = d.drv.map((o, k) => {
    const x = d.X[o.n], i = anIdx(x, t), done = i >= x.length - 1;
    return { o, k, x, i, at: i >= 0 ? x[i] : 0, out: done && o.st !== 'fin', fin: done && o.st === 'fin', box: d.pits.some(p => p[0] === o.n && t >= p[2] && t < p[3]) };
  });
  // Sind alle durch, gilt das amtliche Ergebnis (mit Strafen und gewerteten Ausfällen)
  if (rows.every(r => r.out || r.fin)) rows.sort((a, b) => a.k - b.k);
  else rows.sort((a, b) => (a.out - b.out) || (b.i - a.i) || (a.at - b.at) || (a.o.g - b.o.g));
  const L = rows[0];
  const end = rows.every(r => r.out || r.fin);
  rows.forEach((r, j) => {
    r.pos = end ? r.o.p || '' : r.out ? '' : j + 1;
    if (r.out) r.gap = { dsq: 'DSQ', dns: 'DNS' }[r.o.st] || 'Aus';
    else if (j === 0) r.gap = r.fin ? 'Ziel' : r.i < 1 ? '' : 'Führt';
    else if (r.i <= 0) r.gap = '';
    else if (L.i - r.i >= 3) r.gap = `+${Math.floor((L.i - r.i) / 3)} Rd.`;
    else r.gap = anGapTxt(Math.max(0, r.x[r.i] - L.x[r.i]));
  });
  return rows;
}
const anTyreAt = (d, n, lap) => (d.ST[n] || []).find(s => lap >= s[0] && lap <= s[1]) || null;
/* Runde des Führenden zur Zeit t, als Zahl mit Nachkommastellen (für die Kurve) */
function anLapF(d, t) {
  const L = d.LS;
  if (t <= L[0]) return 0;
  for (let n = 1; n < L.length; n++) if (t < L[n]) return n - 1 + (t - L[n - 1]) / (L[n] - L[n - 1] || 1);
  return d.N;
}
function anFav(d) {
  const f = state.widgets.f1 ? String(state.widgets.f1.cfg.fav || '').toLowerCase() : '';
  if (!f) return 0;
  const key = f.split('_').pop(), all = f.replace(/_/g, '');
  const o = d.drv.find(x => anNorm(x.ln) === key || anNorm(x.ln) === all || anNorm(x.nm) === all);
  return o ? o.n : 0;
}

/* ---------- Anzeige ---------- */
function renderAn() {
  const v = views.get('f1an');
  if (!v) return;
  const now = Date.now(), vis = !v.el.hidden, cfg = state.widgets.f1an.cfg;
  if (vis && !an.listBusy && (an.list ? anListStale(now) && now - an.listTried > 6e4 : now - an.listTried > 6e4)) { an.listTried = now; anLoadList(); }
  const tgt = an.list ? anTarget(now) : null;
  if (vis && tgt && (!an.data || an.data.k !== tgt.k) && !an.busy && !(an.err && an.errKey === tgt.k && now - an.errAt < anWait(an.err))) anLoad(tgt);
  const d = an.data, y = new Date(now).getFullYear();
  $('#an-off').hidden = !!d;
  $('#an-live').hidden = !d;
  if (!d) {
    const loading = an.listBusy || an.busy || (!an.list && !an.listErr) || (tgt && !an.err);
    const e = an.err || an.listErr;
    const none = an.list && !tgt && !an.listBusy;
    $('#an-off').classList.toggle('is-loading', !!loading && !none);
    $('#an-off-t').textContent = none ? 'Noch kein Rennen zum Nachschauen' : loading ? 'Rennanalyse wird geladen' : e && e.kind === 'locked' ? 'Das Rennen ist noch gesperrt' : 'Rennanalyse gerade nicht erreichbar';
    $('#an-off-p').textContent = none ? `Sobald ein Rennen${cfg.sprint ? ' oder Sprint' : ''} vorbei ist, taucht es hier etwa 30 Minuten nach dem Ziel auf.` : loading ? 'Rundenzeiten, Reifen und Strecke kommen von OpenF1, das dauert ein paar Sekunden.' : AN_ERR[(e && e.kind) || 'http'] || AN_ERR.http;
    $('#an-retry').hidden = !!loading || none;
    $('#an-round').textContent = '';
    $('#an-src').textContent = 'Daten: OpenF1';
    anPlan();
    return;
  }
  // Rennen zur Auswahl, das neueste zuerst
  const sel = $('#an-race'), av = anAvail(now).slice().reverse(), want = an.busy ? an.busy.k : d.k;
  if (!av.some(s => s.k === d.k)) av.unshift({ k: d.k, name: d.name, sprint: d.sprint, y: d.y });
  const sig = av.map(s => s.k).join(',');
  if (sel.dataset.sig !== sig) { sel.innerHTML = av.map(s => `<option value="${s.k}">${esc(anLabel(s, y))}</option>`).join(''); sel.dataset.sig = sig; }
  if (sel.value !== String(want)) sel.value = String(want);
  const day = new Date(d.s);
  $('#an-when').textContent = `${WD[day.getDay()]} ${dm(day)}${day.getFullYear() !== y ? day.getFullYear() : ''} · ${d.N} Runden`;
  $('#an-round').textContent = d.sprint ? 'Sprint' : '';
  // Hinweis oben: was gerade lädt, nicht klappt oder läuft
  const live = anOpts().find(s => anLive(s, now)), lbl = k => { const s = (an.list || []).find(x => x.k === k); return s ? anLabel(s, y) : 'Das Rennen'; };
  let note = '';
  if (an.busy && an.busy.k !== d.k) note = `${lbl(an.busy.k)} wird geladen …`;
  else if (an.err && an.errKey !== d.k) note = `${lbl(an.errKey)}: ${AN_ERR[an.err.kind] || AN_ERR.http}`;
  else if (live) note = now < live.s ? `${anLabel(live, y)} startet um ${hm(new Date(live.s))} Uhr. Zum Nachschauen gibt es das Rennen etwa 30 Minuten nach dem Ziel.` : `${anLabel(live, y)} läuft gerade. Zum Nachschauen gibt es das Rennen etwa 30 Minuten nach dem Ziel, also gegen ${hm(new Date(live.e + AN_FREE))} Uhr.`;
  $('#an-note').hidden = !note;
  $('#an-note').textContent = note;
  $('#an-facts').innerHTML = anFactsHtml(d);
  segSet($('#an-tabs'), an.tab);
  segSet($('#an-speed'), String(an.speed));
  const map = an.tab === 'map';
  $('#an-mapbox').hidden = !map;
  $('#an-ctl').hidden = !map;
  $('#an-pane').hidden = map;
  if (map) {
    if (an.drawn !== d.k) anDrawMap();
    anPaint(true);
  } else {
    anPause();
    $('#an-pane').innerHTML = an.tab === 'pos' ? anPosHtml(d) : an.tab === 'tyre' ? anTyreHtml(d) : anPitHtml(d);
  }
  $('#an-src').textContent = `Daten: OpenF1${d.track && d.track.src === 'mv' ? ', Strecke: MultiViewer' : ''}${map ? ' · Punkte aus Runden- und Sektorzeiten berechnet' : ''}`;
  anPlan();
}

function anFactsHtml(d) {
  const by = n => d.drv.find(o => o.n === n);
  const who = o => o ? `<i class="dot" style="--c:${o.c || 'var(--muted)'}"></i>${esc(o.a)}` : '–';
  const win = d.drv.find(o => o.p === 1) || d.drv[0];
  const out = [`<li><span>Sieger</span><b>${who(win)}</b></li>`];
  if (d.fast) out.push(`<li><span>Schnellste Runde</span><b>${who(by(d.fast.n))} ${anLapTxt(d.fast.t)}</b></li>`);
  const gain = d.drv.filter(o => o.p && o.g && o.st === 'fin').map(o => [o, o.g - o.p]).sort((a, b) => b[1] - a[1])[0];
  if (gain && gain[1] > 0) out.push(`<li><span>Bester Aufholer</span><b>${who(gain[0])} +${gain[1]}</b></li>`);
  const dnf = d.drv.filter(o => o.st !== 'fin').length;
  out.push(`<li><span>Ausfälle</span><b>${dnf || 'keine'}</b></li>`);
  const cnt = k => d.per.filter(p => p[2] === k).length;
  const ph = [['sc', 'SC'], ['vsc', 'VSC'], ['red', 'Rot']].filter(([k]) => cnt(k)).map(([k, l]) => `${l} ${cnt(k)}×`);
  out.push(`<li><span>Safety-Car</span><b>${ph.length ? esc(ph.join(', ')) : 'keins'}</b></li>`);
  if (d.W && d.W.air !== null) out.push(`<li><span>Wetter</span><b>${d.W.rain ? 'Regen, ' : ''}${d.W.air} °C${d.W.trk !== null ? `, Strecke ${d.W.trk} °C` : ''}</b></li>`);
  return out.join('');
}

function anDrawMap() {
  const d = an.data, svg = $('#an-svg');
  an.drawn = d.k;
  an.cars = new Map();
  an.w = 0;
  an.lbSig = '';
  const tm = $('#an-time');
  tm.max = String(Math.ceil(d.T));
  $('#an-bands').innerHTML = d.per.map(([a, b, k]) => `<i data-k="${k}" style="left:${(a / d.T * 100).toFixed(2)}%;width:${Math.max(0.5, (b - a) / d.T * 100).toFixed(2)}%" title="${AN_PER[k]}"></i>`).join('');
  if (!d.track) {
    svg.innerHTML = `<text class="an-miss" x="${AN_W / 2}" y="${AN_H / 2}" text-anchor="middle">Die Streckenkarte fehlt für dieses Rennen</text>`;
    return;
  }
  const p = d.track.p;
  let path = `M${p[0]} ${p[1]}`;
  for (let i = 2; i < p.length; i += 2) path += `L${p[i]} ${p[i + 1]}`;
  // Start und Ziel: ein Strich quer zur Fahrtrichtung
  const [sx, sy] = anPt(d.track, 0), [ax, ay] = anPt(d.track, 0.8), len = Math.hypot(ax - sx, ay - sy) || 1;
  const nx = -(ay - sy) / len, ny = (ax - sx) / len;
  const cars = d.drv.slice().reverse().map(o => `<g class="an-car" data-n="${o.n}" style="--c:${o.c || '#8A8F96'}"><circle r="12"/><text>${esc(o.a)}</text></g>`).join('');
  svg.innerHTML = `<path class="an-trk0" d="${path}Z"/><path class="an-trk" d="${path}Z"/><path class="an-sf" data-nx="${nx.toFixed(3)}" data-ny="${ny.toFixed(3)}" data-x="${sx.toFixed(1)}" data-y="${sy.toFixed(1)}"/><g class="an-cars">${cars}</g>`;
  for (const g of svg.querySelectorAll('.an-car')) an.cars.set(+g.dataset.n, g);
  const s = an.sel && an.cars.get(an.sel);
  if (s) { s.classList.add('sel'); s.parentNode.appendChild(s); }
}
/* Größen im Bild an die echte Breite anpassen, damit Punkte und Schrift auf dem Handy und am großen Schirm gleich groß wirken */
function anScale() {
  const svg = $('#an-svg'), w = svg.clientWidth;
  if (!w || w === an.w) return;
  an.w = w;
  const k = AN_W / w;
  svg.style.setProperty('--k', k.toFixed(3));
  const r = Math.max(9, 5.6 * k);
  for (const g of an.cars.values()) {
    const c = g.firstChild, t = g.lastChild, big = g.classList.contains('sel');
    c.setAttribute('r', (big ? r * 1.45 : r).toFixed(1));
    t.setAttribute('x', ((big ? r * 1.45 : r) + 3 * k).toFixed(1));
    t.setAttribute('y', (4 * k).toFixed(1));
  }
  const sf = svg.querySelector('.an-sf');
  if (sf) {
    const x = +sf.dataset.x, y = +sf.dataset.y, nx = +sf.dataset.nx * 9 * k, ny = +sf.dataset.ny * 9 * k;
    sf.setAttribute('d', `M${(x - nx).toFixed(1)} ${(y - ny).toFixed(1)}L${(x + nx).toFixed(1)} ${(y + ny).toFixed(1)}`);
  }
}
/* Ein Bild zur Zeit an.t: Punkte, Reihenfolge, Runde, Flagge */
function anPaint(force) {
  const d = an.data;
  if (!d) return;
  const t = an.t, rows = anBoard(d, t), lbl = state.widgets.f1an.cfg.labels, fav = anFav(d);
  if (d.track && an.cars) {
    if (force) an.w = 0;
    anScale();
    rows.forEach((r, j) => {
      const g = an.cars.get(r.o.n);
      if (!g) return;
      const [x, y] = anPt(d.track, anTau(d, r.o, t));
      g.setAttribute('transform', `translate(${x.toFixed(1)} ${y.toFixed(1)})`);
      const gone = r.out || (r.fin && t - r.x[r.x.length - 1] > 4);
      g.classList.toggle('gone', gone);
      g.classList.toggle('box', r.box);
      g.classList.toggle('lbl', !gone && (lbl === 'all' || r.o.n === an.sel || (lbl === 'top' && (j < 3 || r.o.n === fav))));
      g.classList.toggle('fav', r.o.n === fav);
    });
  }
  const tm = $('#an-time');
  if (+tm.value !== Math.round(t)) tm.value = String(Math.round(t));
  tm.style.setProperty('--pct', `${(Math.min(1, t / d.T) * 100).toFixed(2)}%`);
  const lapN = d.LS.filter(x => x <= t).length;
  $('#an-lap').textContent = t >= d.LS[d.N] ? 'Ziel' : t <= 0 ? 'Start' : `Runde ${Math.min(d.N, lapN)}/${d.N}`;
  const per = d.per.find(p => t >= p[0] && t < p[1]), flag = $('#an-flag');
  const fk = per ? per[2] : t >= d.LS[d.N] ? 'fin' : '';
  flag.hidden = !fk;
  if (fk) { flag.dataset.k = fk; flag.textContent = fk === 'fin' ? 'Zielflagge' : AN_PER[fk]; }
  $('#an-big').hidden = an.play || t > 0 || !d.track;
  // Die Liste nur neu zeichnen, wenn sich etwas geändert hat, und höchstens etwa sechs Mal pro Sekunde
  const now = performance.now();
  if (!force && now - an.lbAt < 160) return;
  const items = rows.map((r, j) => {
    const lap = Math.max(1, Math.min(d.N, Math.floor(Math.max(0, r.i) / 3) + 1)), ty = anTyreAt(d, r.o.n, lap);
    return [r, j, ty ? ty[2] : ''];
  });
  const sig = items.map(([r, , ty]) => `${r.pos}${r.o.n}${r.gap}${r.box ? 'b' : ''}${ty}`).join('|') + an.sel + fav;
  if (sig === an.lbSig) return;
  an.lbSig = sig;
  an.lbAt = now;
  $('#an-board').innerHTML = items.map(([r, j, ty]) => {
    const o = r.o;
    return `<li><button type="button" class="an-row${o.n === an.sel ? ' sel' : ''}${o.n === fav ? ' fav' : ''}${r.out ? ' out' : ''}" data-an="${o.n}" aria-pressed="${o.n === an.sel}" title="${esc(o.nm)}${o.team ? `, ${esc(o.team)}` : ''}"><span class="p">${r.pos}</span><i class="tm" style="--c:${o.c || 'var(--muted)'}"></i><b>${esc(o.a)}</b><span class="g${r.box ? ' box' : ''}">${esc(r.box ? 'Box' : r.gap)}</span><i class="an-tc" data-c="${ty}" title="${ty ? esc(AN_TYRE[ty]) : ''}">${ty === '?' ? '' : ty}</i></button></li>`;
  }).join('');
}

function anPosHtml(d) {
  const n = d.drv.length, N = Math.max(1, d.N), fav = anFav(d), hi = an.sel || fav;
  const bands = d.per.map(([a, b, k]) => { const la = anLapF(d, a), lb = anLapF(d, b); return `<rect class="b-${k}" x="${la.toFixed(2)}" y="0" width="${Math.max(0.2, lb - la).toFixed(2)}" height="${n}"/>`; }).join('');
  const lines = d.drv.slice().sort((a, b) => (a.n === hi) - (b.n === hi)).map(o => {
    const pts = (d.P[o.n] || []).map((p, i) => (p ? `${i},${p - 0.5}` : '')).filter(Boolean).join(' ');
    return `<polyline class="${o.d2 ? 'd2' : ''}${o.n === hi ? ' hi' : ''}" style="--c:${o.c || 'var(--muted)'}" points="${pts}"/>`;
  }).join('');
  const lab = (o, txt) => `<button type="button" data-an="${o.n}" class="${o.n === hi ? 'hi' : ''}${o.st !== 'fin' ? ' out' : ''}" title="${esc(o.nm)}"><i class="tm" style="--c:${o.c || 'var(--muted)'}"></i>${txt}</button>`;
  const left = d.drv.slice().sort((a, b) => a.g - b.g).map(o => lab(o, `<span class="n">${o.g}</span>${esc(o.a)}`)).join('');
  const right = d.drv.map(o => lab(o, `${esc(o.a)}<span class="n">${o.p || (o.st === 'fin' ? '' : 'Aus')}</span>`)).join('');
  const step = N > 40 ? 10 : 5, ticks = [];
  for (let l = 0; l <= N; l += step) ticks.push(`<span style="left:${(l / N * 100).toFixed(2)}%">${l || 'Start'}</span>`);
  return `<div class="an-pc${an.sel ? ' has-sel' : ''}" style="--n:${n}"><div class="lab l" aria-label="Startaufstellung">${left}</div><div class="mid"><svg viewBox="0 0 ${N} ${n}" preserveAspectRatio="none" aria-hidden="true">${bands}${lines}</svg><div class="an-ax">${ticks.join('')}</div></div><div class="lab r" aria-label="Ergebnis">${right}</div></div>`
    + `<p class="hint">Links der Startplatz, rechts das Ergebnis, dazwischen die Position am Ende jeder Runde. Gestrichelt ist der zweite Fahrer eines Teams.${d.per.length ? ' Gelb hinterlegt: Safety-Car, rot: Unterbrechung.' : ''} Tipp auf einen Namen hebt ihn hervor.</p>`;
}

function anTyreHtml(d) {
  const N = Math.max(1, d.N), fav = anFav(d);
  const rows = d.drv.map(o => {
    const segs = (d.ST[o.n] || []).map(([a, b, c, age]) => `<i data-c="${c}" class="${age > 0 ? 'used' : ''}" style="left:${((a - 1) / N * 100).toFixed(2)}%;width:${((b - a + 1) / N * 100).toFixed(2)}%" title="${esc(`${AN_TYRE[c]}, Runde ${a} bis ${b}${age > 0 ? `, vorher schon ${age} Runden gefahren` : ', neu'}`)}"><span>${b - a + 1 >= N / 14 ? c : ''}</span></i>`).join('');
    return `<li><button type="button" class="an-tr${o.n === an.sel ? ' sel' : ''}${o.n === fav ? ' fav' : ''}${o.st !== 'fin' ? ' out' : ''}" data-an="${o.n}" title="${esc(o.nm)}"><span class="p">${o.p || ''}</span><b>${esc(o.a)}</b><span class="bar">${segs || '<em>keine Reifendaten</em>'}</span></button></li>`;
  }).join('');
  const used = Object.values(d.ST).some(l => l.some(s => s[3] > 0));
  const kinds = [...new Set(Object.values(d.ST).flat().map(s => s[2]))].filter(c => AN_TYRE[c]).sort((a, b) => 'SMHIW?'.indexOf(a) - 'SMHIW?'.indexOf(b));
  return `<ul class="an-ty">${rows}</ul><ul class="an-leg">${kinds.map(c => `<li><i class="an-tc" data-c="${c}">${c === '?' ? '' : c}</i>${AN_TYRE[c]}</li>`).join('')}${used ? '<li><i class="an-used"></i>schon gefahren</li>' : ''}</ul>`;
}

function anPitHtml(d) {
  if (!d.pits.length) return '<p class="empty">Keine Boxenstopps in diesem Rennen.</p>';
  const by = n => d.drv.find(o => o.n === n) || { n, a: String(n), c: '', nm: '' }, fav = anFav(d);
  const dur = p => p[5] || p[4];
  const best = d.pits.filter(p => dur(p) > 0).sort((a, b) => dur(a) - dur(b))[0];
  const stand = d.pits.some(p => p[5] > 0);
  const ty = (n, lap) => { const s = anTyreAt(d, n, lap); return s ? `<i class="an-tc" data-c="${s[2]}" title="${esc(AN_TYRE[s[2]])}">${s[2] === '?' ? '' : s[2]}</i>` : '<i class="an-tc"></i>'; };
  const rows = d.pits.map(p => {
    const o = by(p[0]);
    return `<li><button type="button" class="an-pr${p === best ? ' best' : ''}${o.n === an.sel ? ' sel' : ''}${o.n === fav ? ' fav' : ''}" data-an="${o.n}" title="${esc(o.nm)}"><span class="l">R${p[1]}</span><span class="who"><i class="tm" style="--c:${o.c || 'var(--muted)'}"></i><b>${esc(o.a)}</b></span><span class="ty">${ty(o.n, p[1])}<span aria-hidden="true">→</span>${ty(o.n, p[1] + 1)}</span><span class="d">${p[5] ? `${numDe(p[5], 1)} s<small>Gasse ${numDe(p[4], 1)} s</small>` : p[4] ? `${numDe(p[4], 1)} s` : '–'}</span></button></li>`;
  }).join('');
  const b = best && by(best[0]);
  return `<p class="sub-h">${d.pits.length} ${d.pits.length === 1 ? 'Stopp' : 'Stopps'}${b ? ` · am schnellsten ${esc(b.a)} in Runde ${best[1]} mit ${numDe(dur(best), 1)} s` : ''}</p><ul class="an-pits">${rows}</ul><p class="hint">${stand ? 'Die große Zahl ist die Standzeit, darunter die Zeit in der ganzen Boxengasse.' : 'Die Zeit gilt für die ganze Boxengasse von der Einfahrt bis zur Ausfahrt, die reine Standzeit liefert OpenF1 für diese Saison nicht.'}</p>`;
}

/* ---------- Abspielen ---------- */
function anStart() {
  const d = an.data;
  if (!d || an.play) return;
  if (an.t >= d.T - 1) an.t = 0;
  an.play = true;
  an.last = 0;
  anPlayUi();
  an.raf = requestAnimationFrame(anFrame);
}
function anPause() {
  if (an.raf) cancelAnimationFrame(an.raf);
  an.raf = 0;
  if (!an.play) return;
  an.play = false;
  anPlayUi();
}
function anPlayUi() {
  const b = $('#an-play');
  b.innerHTML = an.play ? AN_PAUSE : AN_PLAY;
  b.setAttribute('aria-label', an.play ? 'Anhalten' : 'Abspielen');
  b.title = an.play ? 'Anhalten' : 'Abspielen';
  if (an.data) $('#an-big').hidden = an.play || an.t > 0 || !an.data.track;
}
function anFrame(ts) {
  an.raf = 0;
  const v = views.get('f1an'), d = an.data;
  if (!an.play || !d) return;
  if (!v || v.el.hidden || document.visibilityState !== 'visible' || an.tab !== 'map') { anPause(); return; }
  const dt = an.last ? Math.min(0.25, (ts - an.last) / 1000) : 0;
  an.last = ts;
  // Unterbrechungen unter roter Flagge laufen in etwa zwei Sekunden durch
  const red = d.per.find(p => p[2] === 'red' && an.t >= p[0] && an.t < p[1]);
  const sp = red ? Math.max(an.speed, (red[1] - red[0]) / 2) : an.speed;
  an.t = Math.min(d.T, an.t + dt * sp);
  anPaint(false);
  if (an.t >= d.T) { anPause(); anPaint(true); return; }
  an.raf = requestAnimationFrame(anFrame);
}
/* Eine Runde vor oder zurück, gemessen am Führenden */
function anStep(dir) {
  const d = an.data;
  if (!d) return;
  const L = d.LS, c = L.filter(x => x <= an.t).length;   // Runde, in der der Führende gerade ist
  if (dir < 0) an.t = an.t - L[Math.max(0, c - 1)] > 3 ? L[Math.max(0, c - 1)] : L[Math.max(0, c - 2)];
  else an.t = c < L.length ? L[c] : d.T;
  anPaint(true);
}
/* Auswahl geändert: Karte, Liste oder Ansicht neu */
function anRefresh() {
  if (!an.data) return;
  if (an.tab === 'map') {
    if (an.cars && an.sel && an.cars.get(an.sel)) an.cars.get(an.sel).parentNode.appendChild(an.cars.get(an.sel));
    if (an.cars) for (const [n, g] of an.cars) g.classList.toggle('sel', n === an.sel);
    anPaint(true);
  } else renderAn();
}

/* Wann wieder nachsehen: nach einem Fehler und etwa 30 Minuten nach dem Ende eines Rennens */
function anPlan() {
  clearTimeout(an.timer);
  if (!views.has('f1an')) return;
  const now = Date.now();
  let at = Infinity;
  if (an.err) at = an.errAt + anWait(an.err);
  if (an.listErr || !an.list) at = Math.min(at, an.listTried + 10 * 6e4);
  for (const s of anOpts()) if (!anFree(s, now) && s.e + AN_FREE - now < 2 * DAY) at = Math.min(at, s.e + AN_FREE + 6e4);
  if (!Number.isFinite(at)) return;
  an.timer = setTimeout(() => { if (views.has('f1an')) { if (an.err && Date.now() >= an.errAt + anWait(an.err)) an.err = null; renderAn(); } }, Math.min(Math.max(at - now, 5000), 6 * 36e5));
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') { anPause(); return; }
  if (views.has('f1an')) renderAn();
});

/* Aus dem F1-Widget oder dem Hinweis: Rennanalyse zeigen und, falls sie noch auf keiner Seite liegt, neben die Formel 1 legen */
function anShow() {
  if (!pagesUsing('f1an').length) {
    const p = pagesUsing('f1')[0] || curPage(), i = p.items.findIndex(x => x.w === 'f1');
    p.items.splice(i >= 0 ? i + 1 : p.items.length, 0, { w: 'f1an', s: 2 });
    commit();
    layoutNow();
    toast(`Die Rennanalyse liegt jetzt auf „${p.name}“.`);
  }
  setTimeout(() => nwJump('f1an'), 60);
}

$('#f1an').addEventListener('click', e => {
  const b = e.target.closest('[data-an]');
  if (b) { const n = +b.dataset.an; an.sel = an.sel === n ? 0 : n; anRefresh(); return; }
  const tab = e.target.closest('#an-tabs [data-v]');
  if (tab) { an.tab = tab.dataset.v; renderAn(); return; }
  const sp = e.target.closest('#an-speed [data-v]');
  if (sp) { an.speed = +sp.dataset.v; segSet($('#an-speed'), String(an.speed)); return; }
  if (e.target.closest('#an-play, #an-big')) { if (an.play) anPause(); else anStart(); return; }
  const st = e.target.closest('[data-step]');
  if (st) { anPause(); anStep(+st.dataset.step); }
});
$('#an-time').addEventListener('input', e => { an.t = +e.target.value; anPaint(true); });
$('#an-time').addEventListener('pointerdown', () => { if (an.play) { an.wasPlaying = true; anPause(); } });
$('#an-time').addEventListener('change', () => { if (an.wasPlaying) { an.wasPlaying = false; anStart(); } });
$('#an-race').addEventListener('change', e => {
  const k = +e.target.value, av = anAvail(Date.now());
  an.pick = av.length && av[av.length - 1].k === k ? 0 : k;
  an.err = null;
  renderAn();
});
$('#an-retry').addEventListener('click', () => { an.err = null; an.listErr = null; an.listTried = 0; renderAn(); });
// Pfeiltasten auf der Karte: eine Runde vor oder zurück, Leertaste spielt ab
$('#an-mapbox').addEventListener('keydown', e => {
  if (e.target.closest('button')) return;
  if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); anPause(); anStep(e.key === 'ArrowLeft' ? -1 : 1); }
  else if (e.key === ' ') { e.preventDefault(); if (an.play) anPause(); else anStart(); }
});
addEventListener('resize', () => { if (an.data && an.tab === 'map' && views.has('f1an')) { an.w = 0; anPaint(true); } });

defineWidget('f1an', {
  render: renderAn,
  settings: {
    render(box, w) {
      const c = w.cfg;
      box.innerHTML = `<label class="check-row"><input type="checkbox" class="switch" data-s="sprint"${c.sprint ? ' checked' : ''}> Sprints mit anbieten</label>`
        + `<label class="field"><span class="lbl">Kürzel an den Punkten</span><select data-s="labels"><option value="top"${c.labels === 'top' ? ' selected' : ''}>Die ersten drei und dein Lieblingsfahrer</option><option value="all"${c.labels === 'all' ? ' selected' : ''}>An allen</option><option value="none"${c.labels === 'none' ? ' selected' : ''}>Nur am angetippten Fahrer</option></select></label>`
        + '<p class="hint">Deinen Lieblingsfahrer stellst du im Formel-1-Widget ein, er ist hier dann hervorgehoben. Rennen gibt es kostenlos ab etwa 30 Minuten nach dem Ziel.</p>';
    },
    save(box, w) {
      w.cfg.sprint = box.querySelector('[data-s="sprint"]').checked;
      w.cfg.labels = box.querySelector('[data-s="labels"]').value;
      an.pick = 0;
      return null;
    }
  }
});
