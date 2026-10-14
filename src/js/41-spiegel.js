/* Spiegel-Modus: schwarzer Vollbild-Überblick für einen Smart Mirror oder einen Bildschirm an der Wand.
 * Schwarz bleibt hinter Spiegelglas unsichtbar, deshalb nur helle Schrift ohne Flächen.
 * Was wo steht, legst du unter Anpassen, Spiegel fest: Bausteine (Uhr, Wetter, Termine …) in sieben Bereichen.
 * Dazu kommen deine Widgets als Kurzzeilen: fest im Baustein „Kurzzeilen“ oder im Wechselplatz, der alle 15 Sekunden weiterblättert.
 * Start über den Knopf oben, die Taste S oder die Adresse …/#spiegel. Beenden mit Esc oder S.
 * Hält den Bildschirm wach (Wake Lock, wenn der Browser es kann), kann nachts dimmen und verschiebt den Inhalt
 * alle paar Minuten um ein paar Pixel, damit sich nichts einbrennt. */
const mr = { on: false, fs: false, lock: null, idle: null, shift: -1, last: '', slot: -1, dirty: 0, fu: 0 };
const M_ROT = 15e3;
function mirrorFromHash() { try { return decodeURIComponent(location.hash.slice(1)).toLowerCase() === 'spiegel'; } catch { return false; } }
async function mirrorLock() {
  if (!mr.on || !('wakeLock' in navigator) || mr.lock) return;
  try { mr.lock = await navigator.wakeLock.request('screen'); mr.lock.addEventListener('release', () => { mr.lock = null; }); } catch { mr.lock = null; }
}
function mirrorOpen(gesture) {
  if (mr.on) return;
  mr.on = true;
  $('#mirror').hidden = false;
  document.documentElement.classList.add('mirror-on');
  if (!mirrorFromHash()) history.replaceState(null, '', location.pathname + location.search + '#spiegel');
  mr.fs = false;
  if (gesture && document.documentElement.requestFullscreen && !document.fullscreenElement) document.documentElement.requestFullscreen().then(() => { mr.fs = true; }).catch(() => {});
  mirrorLock();
  mirrorWake();
  mr.last = '';
  mr.shift = -1;
  mirrorTick(new Date());
}
function mirrorClose() {
  if (!mr.on) return;
  mr.on = false;
  $('#mirror').hidden = true;
  document.documentElement.classList.remove('mirror-on');
  if (mirrorFromHash()) history.replaceState(null, '', location.pathname + location.search);
  if (mr.fs && document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {});
  mr.fs = false;
  if (mr.lock) { mr.lock.release().catch(() => {}); mr.lock = null; }
  $('#mirror-btn').focus();
}
/* Maus bewegt: Knopf zum Verlassen zeigen, nach 3 Sekunden wieder weg samt Mauszeiger */
function mirrorWake() {
  $('#mirror').classList.add('awake');
  clearTimeout(mr.idle);
  mr.idle = setTimeout(() => $('#mirror').classList.remove('awake'), 3000);
}
/* Neue Daten aus einem Widget: Spiegel und Vorschau kurz danach neu zeichnen, statt bis zur nächsten Minute zu warten */
function mirrorDirty() {
  if (mr.dirty || (!mr.on && !mirrorPreviewOn())) return;
  mr.dirty = setTimeout(() => { mr.dirty = 0; renderMirror(); }, 300);
}
/* Platzhalter für die Vorschau, wenn ein Baustein gerade nichts zu zeigen hat */
const mPh = (k, txt) => `<section class="mb m-ph" data-b="${k}"><b>${esc(MB[k])}</b><span>${esc(txt)}</span></section>`;
/* HTML aus „Jetzt wichtig“ als schlichter Text (Linien-Kürzel, Tonnen-Chips). Ein template lädt und startet nichts. */
const mTpl = document.createElement('template');
function mTxt(h) {
  mTpl.innerHTML = String(h || '').replace(/<\/i>\s*<i/g, '</i>, <i').replace(/></g, '> <');
  return mTpl.content.textContent.replace(/\s+/g, ' ').trim();
}
const mCut = (s, n) => { s = String(s || '').trim(); return s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s; };
const mIco = k => NW_ICO[k] || TICON[k] || '';
/* Eine Zeile mit Symbol, Text und leiser Unterzeile. on: im Wechselplatz gerade sichtbar */
function mRow(r, on) {
  const body = r.bars
    ? `<span class="ml-bars">${r.bars.map(b => `<span class="ml-bar"><span>${esc(b.n)}</span><i><i style="width:${(b.p * 100).toFixed(1)}%"></i></i><b>${Math.floor(b.p * 100)} %</b></span>`).join('')}</span>`
    : `<b>${esc(r.t)}</b>`;
  return `<li class="ml${on ? ' on' : ''}"${r.type ? ` data-lt="${r.type}"` : ''}${r.cat ? ` data-cat="${r.cat}"` : ''}${r.lv ? ` data-lv="${r.lv}"` : ''}${r.wc ? ` style="--wc:${r.wc}"` : ''}><span class="m-ico">${mIco(r.ico || r.type)}</span><span class="m-tx">${body}${r.when ? ` <span class="m-when">${esc(r.when)}</span>` : ''}${r.s ? `<span class="m-sub">${esc(r.s)}</span>` : ''}</span></li>`;
}

/* Kurzzeilen: alle passenden Widgets, die auf einer Seite liegen, in deiner Reihenfolge. Neue kommen mit ihrem Vorschlag dazu. */
function mLines() {
  const m = state.ui.mirror, order = [];
  for (const p of state.pages) for (const it of p.items) if (!order.includes(it.w)) order.push(it.w);
  const ok = id => { const w = state.widgets[id]; return !!w && ML_TYPES.includes(w.type) && order.includes(id); };
  const rank = id => ML_TYPES.indexOf(state.widgets[id].type);
  const cand = order.filter(ok).sort((a, b) => rank(a) - rank(b) || order.indexOf(a) - order.indexOf(b));
  const out = (m.lines || []).filter(x => ok(x.w)).map(x => ({ w: x.w, m: x.m }));
  for (const id of cand) {
    if (out.some(x => x.w === id)) continue;
    const w = state.widgets[id];
    let mode = ML_DEF[w.type];
    // Ein weiteres Aufgaben-Widget mit Projekten, die schon eine Zeile haben, wäre doppelt
    if (w.type === 'tasks') {
      const have = new Set(out.filter(x => x.m !== 'off' && state.widgets[x.w].type === 'tasks').flatMap(x => state.widgets[x.w].cfg.projects.map(n => n.toLowerCase())));
      if (w.cfg.projects.every(n => have.has(n.toLowerCase()))) mode = 'off';
    }
    out.push({ w: id, m: mode });
  }
  return out;
}
/* Was jedes Widget als Kurzzeile sagt: { t, s } oder Balken, null wenn es gerade nichts zu sagen gibt */
const MLR = {
  tasks(w) {
    if (!tdToken()) return null;
    const seen = new Set(), due = [];
    let open = 0, loaded = false;
    for (const name of w.cfg.projects) {
      const list = tk.tasks[name.toLowerCase()];
      if (list) loaded = true;
      for (const x of list || []) {
        if (!x || x.checked || seen.has(x.id)) continue;
        seen.add(x.id);
        open++;
        const di = dueInfo(x);
        if (di && di.s !== 'later') due.push({ x, di, p: name });
      }
    }
    if (!loaded) return null;
    const lbl = w.title && w.title !== TYPES.tasks.name ? w.title : w.cfg.projects.join(' und ');
    if (!due.length) return { t: open ? `${lbl}: heute nichts fällig` : `${lbl}: alles erledigt`, s: open ? `${open} offen` : '' };
    const over = due.filter(d => d.di.s === 'over').length, n = due.length;
    const first = due.sort((a, b) => a.di.key - b.di.key)[0];
    return {
      t: over ? `${n} ${n === 1 ? 'Aufgabe' : 'Aufgaben'} fällig, ${over} überfällig` : `${n} ${n === 1 ? 'Aufgabe' : 'Aufgaben'} für heute`,
      s: `Zuerst: ${mCut(plain(first.x.content) || 'Ohne Titel', 60)}${w.cfg.projects.length > 1 ? ` (${first.p})` : ''}`,
      lv: over ? 'warn' : ''
    };
  },
  progress(w, now) {
    const rows = w.cfg.bars.map(b => ({ b, c: calcBar(b, now) })).filter(x => x.c.state !== 'off');
    if (!rows.length) return null;
    // Laufende zuerst, höchstens drei, in der Reihenfolge aus dem Widget
    const pick = [...rows.filter(x => x.c.state === 'run'), ...rows.filter(x => x.c.state !== 'run')].slice(0, 3).sort((a, b) => rows.indexOf(a) - rows.indexOf(b));
    const work = pick.find(x => x.b.kind === 'day') || pick.find(x => x.b.kind === 'workweek');
    return { bars: pick.map(x => ({ n: x.b.name, p: clamp01(x.c.pct) })), s: work ? `${work.b.name}: ${work.c.sub}` : '' };
  },
  vacation(w, now) {
    const t = sod(now), key = ymd(t), v = vacCalc(now), run = vacationOn(t);
    const free = v.free < 0 ? `${numTxt(-v.free)} ${-v.free === 1 ? 'Tag' : 'Tage'} zu viel verplant` : `${numTxt(v.free)} ${v.free === 1 ? 'Urlaubstag' : 'Urlaubstage'} noch frei`;
    if (run) { const to = parseYmd(run.to); return { t: `${run.label || 'Urlaub'} bis ${WD[to.getDay()]} ${dm(to)}`, s: free }; }
    const up = state.vacation.entries.filter(e => e.from > key).sort((a, b) => a.from.localeCompare(b.from))[0];
    if (!up) return { t: free, s: 'Noch nichts geplant' };
    const n = dayDiff(t, parseYmd(up.from));
    return { t: `${up.label || 'Urlaub'} ${n === 1 ? 'ab morgen' : `in ${n} Tagen`}${up.example ? ' (Beispiel)' : ''}`, s: free };
  },
  learn(w, now) {
    const L = learnCalc(w.cfg, now), title = w.title || 'Prüfung';
    if (L.daysLeft == null || L.daysLeft < 0) return L.left ? { t: `${title}: noch ${L.left} ${L.left === 1 ? 'Thema' : 'Themen'} offen` } : null;
    const lv = learnPace(L)[1];
    const pace = { ok: 'Tempo passt', warn: 'wird knapp', bad: 'Tempo reicht nicht' }[lv] || '';
    return {
      t: `${title} ${L.daysLeft === 0 ? 'heute' : L.daysLeft === 1 ? 'morgen' : `in ${L.daysLeft} Tagen`}`,
      s: [L.total ? `${L.done} von ${L.total} Themen` : '', pace].filter(Boolean).join(', '),
      lv: lv === 'bad' || L.daysLeft <= 1 ? 'warn' : ''
    };
  },
  habits(w, now) {
    const st = w.cfg.items.map(h => ({ h, s: hbStats(h, now) }));
    if (!st.length) return null;
    const daily = st.filter(x => x.h.rhythm !== 'weekly' && hbRequired(x.h, now)), open = daily.filter(x => !x.s.doneToday);
    const best = [...st].sort((a, b) => b.s.streak - a.s.streak)[0];
    const unit = best.h.rhythm === 'weekly' ? (best.s.streak === 1 ? 'Woche' : 'Wochen') : (best.s.streak === 1 ? 'Tag' : 'Tage');
    const streak = best.s.streak >= 2 ? `${best.h.name}: ${best.s.streak} ${unit} in Folge` : '';
    if (daily.length) return { t: open.length ? `Heute noch offen: ${mCut(open.map(x => x.h.name).join(', '), 60)}` : 'Heute alles geschafft', s: streak };
    return { t: mCut(st.map(x => `${x.h.name} ${x.s.week} von ${x.s.goal}`).join(', '), 70) + ' diese Woche', s: streak };
  },
  football(w, now) {
    const c = w.cfg, lg = c.league, D = fbData(lg), t = +now;
    if (!D.matches) { if (!D.busy && (!D.tried || t - D.tried > 6e4)) fbLoad(lg); return null; }
    const nm = x => x.shortName || x.teamName;
    const vs = m => `${nm(m.team1)} gegen ${nm(m.team2)}`;
    const res = m => { const s = fbScore(m); return s ? `${nm(m.team1)} ${s[0]}:${s[1]} ${nm(m.team2)}` : vs(m); };
    const when = m => { const d = new Date(kick(m)), n = dayDiff(now, d); return `${n === 0 ? 'Heute' : n === 1 ? 'Morgen' : n < 7 ? WDL[d.getDay()] : `${WD[d.getDay()]} ${dm(d)}`} ${hm(d)}`; };
    if (c.team) {
      const ms = fbTeamMatches(D, c.team), live = ms.find(m => fbIsLive(m, t));
      if (live) return { t: res(live), s: `Live, Anpfiff war ${hm(new Date(kick(live)))}`, lv: 'now' };
      const row = (D.table || []).find(r => r.teamInfoId === c.team), pos = row ? `Platz ${D.table.indexOf(row) + 1}` : '';
      const next = ms.find(m => !m.matchIsFinished && kick(m) > t), last = [...ms].reverse().find(m => m.matchIsFinished);
      // Das Ergebnis steht bis zum nächsten Tag, danach kommt das nächste Spiel
      if (last && (!next || t - kick(last) < 20 * 36e5)) return { t: res(last), s: ['Endstand', pos].filter(Boolean).join(', ') };
      if (next) return { t: vs(next), s: [when(next), pos].filter(Boolean).join(', ') };
      return null;
    }
    const live = D.matches.filter(m => fbIsLive(m, t));
    if (live.length) return { t: live.slice(0, 2).map(res).join(', '), s: `${FB_LEAGUES[lg]} live${live.length > 2 ? `, ${live.length} Spiele laufen` : ''}`, lv: 'now' };
    const next = D.matches.filter(m => !m.matchIsFinished && kick(m) > t).sort((a, b) => kick(a) - kick(b))[0];
    return next ? { t: vs(next), s: `${FB_LEAGUES[lg]}, ${when(next)}` } : null;
  },
  f1(w, now) {
    const t = +now;
    if (!f1.busy && (!f1.races ? !f1.tried || t - f1.tried > 6e4 : t - f1.tried > 30 * 6e4)) f1Load();
    const r = f1.races ? f1Next(t) : null;
    if (!r) return null;
    const ss = f1Sessions(r), gp = f1Short(r.raceName);
    const live = ss.find(s => t >= +s.at && t < +s.at + s.min * 6e4), nx = ss.find(s => +s.at > t);
    if (live) return { t: `${live.name} läuft`, s: gp, lv: 'now' };
    if (!nx) return null;
    const d = nx.at, n = dayDiff(now, d);
    const when = `${n === 0 ? 'heute' : n === 1 ? 'morgen' : n < 7 ? WDL[d.getDay()] : `${WD[d.getDay()]} ${dm(d)}`} ${hm(d)}`;
    const lead = f1.drivers[0] ? `Vorn in der WM: ${f1Name(f1.drivers[0].Driver)}` : '';
    if (nx.race) return { t: `${gp} ${when}`, s: lead };
    const race = f1When(r);
    return { t: `${gp}: ${nx.name} ${when}`, s: `Rennen ${WDL[race.getDay()]} ${hm(race)}` };
  },
  fuel(w, now) {
    if (!fuKey()) return null;
    const c = fuCfg(), t = +now;
    // Tankerkönig nur fragen, wenn die Preise alt sind, und höchstens alle 5 Minuten (fuLoad hält sich selbst an 10 Minuten)
    if (mr.on && !fu.busy && (!fuIsGeo(c) || fu.here) && t - mr.fu > 5 * 6e4) { mr.fu = t; fuLoad(); }
    const R = fuRows();
    if (!R || !R.list.length || t - R.D.at > 6 * 36e5) return null;
    const open = R.list.filter(s => s.open), b = open[0] || R.list[0];
    return { t: `${FU_TYPE[c.type]} ${numDe(b.price, 3)} € bei ${fuNice(b.brand || b.name)}`, s: fuWhere(b, R.A) + (c.mode === 'place' && !fuIsGeo(c) ? ` von ${fuPlaceName(c.place)}` : '') + (t - R.D.at > 30 * 6e4 ? `, Stand ${hm(new Date(R.D.at))}` : '') };
  },
  notes(w) {
    const lines = noteLines(w.cfg.text);
    if (!lines.length) return null;
    const title = w.title && w.title !== TYPES.notes.name ? w.title : '';
    return { t: mCut(title ? `${title}: ${lines[0]}` : lines[0], 70), s: mCut(lines.slice(1, 4).join(', '), 90) };
  }
};
function mLine(id, now) {
  const w = state.widgets[id];
  if (!w || !MLR[w.type]) return null;
  try { const r = MLR[w.type](w, now); return r ? { type: w.type, ...r } : null; } catch { return null; }
}

/* „Jetzt wichtig“ für den Spiegel: was ein eigener Baustein schon zeigt, fliegt raus, außer es drängt richtig */
const nwCat = it => it.k.startsWith('wn') ? 'wn' : it.k === 'ws' ? 'ws-tom' : it.k === 'ws-t' ? 'ws-tod' : it.k.startsWith('bd') ? (it.w === 'morgen' ? 'bd-tom' : 'bd-tod')
  : it.k === 'frost' && it.w === 'morgen' ? 'frost-tom' : it.k === 'ca-tom' ? 'ca-tom' : '';
function mirrorNow(now, cx, on, pv) {
  let items;
  try { items = nwItems(now, mr.on && !pv); } catch { items = []; }
  const used = cx.lines.filter(x => x.m !== 'off'), types = new Set(used.map(x => state.widgets[x.w].type)), ids = new Set(used.map(x => x.w));
  const dup = it => {
    const k = it.k;
    if (k === 'po' || cx.cover.has(nwCat(it))) return true;
    if (it.sc >= 80) return false;
    return ((k === 'ca-run' || k === 'ca-next' || k === 'ca-tom') && on.cal) || (k === 'dep' && on.dep) || (k === 'cm' && on.cm) || (k === 'rain' && on.wx)
      || (k === 'tk' && types.has('tasks')) || (k === 'hb' && types.has('habits')) || (k.startsWith('lr') && ids.has(k.slice(2)));
  };
  const out = items.filter(it => !dup(it)).slice(0, 4);
  for (const it of out) { const c = nwCat(it); if (c) cx.cover.add(c); }
  return out;
}

/* Morgen-Vorschau: ab der eingestellten Uhrzeit bis 4 Uhr nachts. Nach Mitternacht geht es um den angebrochenen Tag. */
function mirrorEveDay(now) {
  if (hm(now) >= state.ui.mirror.eve) return addDays(sod(now), 1);
  return now.getHours() < 4 ? sod(now) : null;
}
const caStartsOn = (e, d) => e.s >= +sod(d) && e.s < +addDays(sod(d), 1);
function mirrorEve(now, cx, pv) {
  const live = mirrorEveDay(now), day = live || (pv ? addDays(sod(now), 1) : null);
  if (!day) return null;
  // Reihenfolge nach Wichtigkeit (pr), denn bei Platzmangel fällt das Hintere weg. Was „Jetzt wichtig“ und die Hinweise
  // deshalb weglassen (cat), bleibt am längsten stehen.
  const off = dayDiff(now, day), sfx = off ? 'tom' : 'tod', items = [];
  const add = (pr, ico, t, s, cat) => { items.push({ pr, ico, t, s: s || '', cat: live && cat ? cat : '' }); if (cat && live) cx.cover.add(cat); };
  // Frei oder Arbeit
  const wb = workBar(), why = wb ? freeReason(wb, day) : holidayName(day) ? `Feiertag: ${holidayName(day)}` : null;
  if (why === 'Urlaub') { const v = vacationOn(day); add(5, 'vacation', 'Urlaubstag', v && v.label ? v.label : ''); }
  else if (why && why.startsWith('Feiertag')) add(5, 'vacation', why, 'Frei');
  else if (wb && !why) add(5, 'commute', `Arbeit ab ${wb.start} Uhr`, cm.res && cm.res.route ? `Fahrt ohne Stau etwa ${Math.round(cm.res.route.duration / 60)} Min` : '');
  // Termine, die an dem Tag beginnen. Steht der Baustein Termine im Spiegel, listet der sie schon.
  if (ca.data && caSec().feeds.length && !cx.on.cal) {
    const list = caDay(day, ca.data.events), all = list.filter(e => e.a), timed = list.filter(e => !e.a && caStartsOn(e, day));
    const allTxt = all.length ? `Ganztags: ${mCut(all.map(e => e.t).join(', '), 50)}` : '';
    if (timed.length) add(4, 'cal', `${hm(new Date(timed[0].s))} Uhr: ${mCut(timed[0].t, 50)}`, [timed.length > 1 ? `Erster von ${timed.length} Terminen` : 'Einziger Termin', allTxt].filter(Boolean).join('. '), 'ca-' + sfx);
    else if (all.length) add(4, 'cal', allTxt, 'Sonst keine Termine', 'ca-' + sfx);
    else add(4, 'cal', 'Keine Termine', '');
  }
  // Wetter am Morgen, tagsüber und Frost
  const h = wx.data && wx.data.hourly;
  if (h && Array.isArray(h.time)) {
    const ts = t => +at(day, t) / 1000, i7 = h.time.findIndex(x => x >= ts('07:00') && x < ts('08:00'));
    if (i7 >= 0 && Number.isFinite(+h.temperature_2m[i7])) {
      let max = -Infinity, rain = null, pmax = 0, min = Infinity;
      h.time.forEach((x, i) => {
        const tt = +h.temperature_2m[i], pp = Array.isArray(h.precipitation_probability) ? +h.precipitation_probability[i] || 0 : 0;
        if (x >= ts('05:00') && x <= ts('09:00') && Number.isFinite(tt)) min = Math.min(min, tt);
        if (x < ts('07:00') || x > ts('21:00')) return;
        if (Number.isFinite(tt)) max = Math.max(max, tt);
        if (pp >= 50 && rain == null) rain = x;
        pmax = Math.max(pmax, pp);
      });
      const w = WMO[h.weather_code[i7]] || ['', ''];
      const s = [Number.isFinite(max) ? `Tagsüber bis ${Math.round(max)}°` : '', rain != null ? `Regen ab etwa ${new Date(rain * 1000).getHours()} Uhr` : pmax < 30 ? 'trocken' : ''].filter(Boolean).join(', ');
      add(6, 'weather', `Früh ${Math.round(+h.temperature_2m[i7])}°${w[0] ? `, ${w[0].toLowerCase()}` : ''}`, s);
      if (min <= 0.5) add(2, 'frost', 'Frost am Morgen', `Bis ${numDe(min, 0)}°, Zeit zum Kratzen einplanen`, 'frost-' + sfx);
    }
  }
  // Müll
  const bins = wsOn(state.waste.bins, day);
  if (bins.length) add(1, 'waste', `Abholung: ${wsNames(bins)}`, off ? 'Heute Abend rausstellen' : 'Früh rausstellen', 'ws-' + sfx);
  // Geburtstage
  for (const x of bdUpcoming(now).filter(b => dayDiff(sod(now), b.d) === off).slice(0, 2)) {
    add(3, 'bday', x.cal ? x.name : `${x.name} hat Geburtstag`, x.age != null ? `Wird ${x.age}` : '', 'bd-' + sfx);
  }
  // Aufgaben aus Todoist, die an dem Tag fällig sind
  if (tdToken() && tk.stamp) {
    const seen = new Set(), list = [];
    for (const [k] of tkKeys()) for (const x of tk.tasks[k] || []) {
      if (!x || x.checked || seen.has(x.id) || !x.due) continue;
      seen.add(x.id);
      const raw = String(x.due.datetime || x.due.date || ''), d = /Z$|[+-]\d\d:\d\d$/.test(raw) ? sod(new Date(raw)) : validYmd(raw.slice(0, 10)) ? parseYmd(raw.slice(0, 10)) : null;
      if (d && dayDiff(day, d) === 0) list.push(x);
    }
    if (list.length) add(7, 'tasks', `${list.length} ${list.length === 1 ? 'Aufgabe' : 'Aufgaben'} für ${off ? 'morgen' : 'heute'}`, mCut(plain(list[0].content) || 'Ohne Titel', 60));
  }
  return { day, off, live: !!live, items: items.sort((a, b) => a.pr - b.pr) };
}

/* Stunden im Wetter: vier Zeitpunkte im Abstand von drei Stunden, ab der nächsten vollen Stunde */
function mirrorHours(d, now) {
  const h = d.hourly;
  if (!state.ui.mirror.wxh || !h || !Array.isArray(h.time)) return '';
  let i = h.time.findIndex(x => x * 1000 >= now.getTime() + 30 * 6e4);
  if (i < 0) return '';
  const pts = [];
  for (; i < h.time.length && pts.length < 4; i += 3) {
    const tt = +h.temperature_2m[i];
    if (!Number.isFinite(tt)) continue;
    pts.push({ h: new Date(h.time[i] * 1000).getHours(), w: WMO[h.weather_code[i]] || ['', 'cloud'], day: !Array.isArray(h.is_day) || h.is_day[i] !== 0, t: Math.round(tt), pp: Array.isArray(h.precipitation_probability) ? +h.precipitation_probability[i] || 0 : 0 });
  }
  if (pts.length < 2) return '';
  const wet = pts.some(p => p.pp >= 30);
  return `<ul class="m-wx-hrs">${pts.map(p => `<li><span class="m-dim">${p.h} Uhr</span><span class="m-hi">${icon(p.w[1], p.day)}</span><b>${p.t}°</b>${wet ? `<small>${p.pp >= 30 ? `${p.pp} %` : ''}</small>` : ''}</li>`).join('')}</ul>`;
}

/* Die Bausteine. Jeder liefert sein HTML oder nichts, wenn es gerade nichts zu zeigen gibt.
 * cx: was in diesem Durchgang schon steht (Kurzzeilen, Morgen-Vorschau, Jetzt wichtig), damit nichts doppelt kommt. */
const MBR = {
  clock(now) {
    const s = state.ui.mirror.secs ? `<span class="sec">${pad(now.getSeconds())}</span>` : '';
    return `<section class="mb m-clock" data-b="clock"><p class="m-time">${pad(now.getHours())}<span class="colon">:</span>${pad(now.getMinutes())}${s}</p><p class="m-date">${WDL[now.getDay()]}, ${now.getDate()}. ${ML[now.getMonth()]}, KW ${isoWeek(now)}</p></section>`;
  },
  now(now, pv, cx) {
    if (!cx.nw.length) return pv ? mPh('now', 'Gerade drängt nichts. Hier steht, was als Nächstes zählt.') : '';
    return `<ul class="mb m-now" data-b="now">${cx.nw.map(it => mRow({ ico: it.ico, t: it.t, s: mTxt(it.s), when: it.w && it.w !== 'live' ? it.w : '', lv: it.lv, wc: it.wc })).join('')}</ul>`;
  },
  notes(now, pv, cx) {
    const cov = cx.cover;
    const list = [
      ...(cov.has('wn') ? [] : wnMirror(now)),
      ...bdMirror(now).filter(t => !cov.has(t.startsWith('Morgen') ? 'bd-tom' : 'bd-tod')).map(t => ({ t, c: '#F0B040' })),
      ...wsMirror(now).filter(n => !cov.has(n.t.startsWith('Morgen') ? 'ws-tom' : 'ws-tod'))
    ];
    if (!list.length) return pv ? mPh('notes', 'Gerade nichts, hier stehen Warnungen, Geburtstage und Müll') : '';
    return `<ul class="mb m-notes" data-b="notes">${list.map(n => `<li style="--c:${n.c}">${esc(n.t)}</li>`).join('')}</ul>`;
  },
  wx(now, pv) {
    const d = wx.data, c = d && d.current;
    if (!c) return pv ? mPh('wx', 'Kommt, sobald das Wetter geladen ist') : '';
    const w = WMO[c.weather_code] || ['', 'cloud'];
    const hi = d.daily ? Math.round(d.daily.temperature_2m_max[0]) : null, lo = d.daily ? Math.round(d.daily.temperature_2m_min[0]) : null;
    const D = sky.day, sun = D && D.rise && D.set ? `Sonne ${hm(D.rise)} bis ${hm(D.set)}` : '';
    const sub = [hi != null ? `${lo}° bis ${hi}°` : '', mirrorRain(d, now), sun].filter(Boolean).join('. ');
    return `<section class="mb m-wx" data-b="wx"><div class="m-wx-now"><span class="m-wx-ico">${icon(w[1], c.is_day !== 0)}</span><b>${Number.isFinite(c.temperature_2m) ? Math.round(c.temperature_2m) + '°' : ''}</b></div><p>${esc(w[0])}</p><p class="m-dim">${esc(sub)}</p>${mirrorHours(d, now)}</section>`;
  },
  cm(now, pv) {
    const s = cm.sum;
    if (!s) return pv ? mPh('cm', state.commute.home ? 'Kommt, sobald die Strecke berechnet ist' : 'Trag erst deine Strecke im Pendeln-Widget ein') : '';
    // Nach Hause vor Feierabend: ab Feierabend gerechnet, sonst ab jetzt
    const wb = workBar(), end = s.dir === 'home' && wb && !freeReason(wb, now) && now < at(now, wb.end) ? at(now, wb.end) : null;
    const arr = `${end ? `ab ${wb.end}, ` : ''}an ${hm(new Date((end ? +end : +now) + s.mins * 6e4))}`;
    const bad = s.closures || s.delay >= 3;
    const how = s.closures ? (s.closures === 1 ? 'Sperrung auf der Strecke' : `${s.closures} Sperrungen`) : s.delay >= 1 ? `+${Math.round(s.delay)} Min Stau` : 'Freie Fahrt';
    const t = s.top, why = bad && t && t.title ? mCut(`${[t.road, t.title].filter(Boolean).join(' ')}${Number.isFinite(t.along) ? `, nach ${numDe(t.along / 1000, t.along < 10000 ? 1 : 0)} km` : ''}`, 80) : '';
    return `<section class="mb m-cm" data-b="cm"><h3>${s.dir === 'home' ? 'Nach Hause' : 'Zur Arbeit'}</h3><p><b>${s.mins} Min</b><span>${esc(arr)}</span></p><p class="m-cm-how${bad ? ' warn' : ''}"><span>${esc(how)}</span>${why ? `<span class="m-dim">${esc(why)}</span>` : ''}</p></section>`;
  },
  eve(now, pv, cx) {
    const E = cx.eve;
    if (!E) return '';
    const d = E.day, head = `${E.off ? 'Morgen' : 'Heute'}, ${WDL[d.getDay()]} ${d.getDate()}. ${ML[d.getMonth()]}`;
    const tag = E.live ? '' : `<small>erscheint ab ${state.ui.mirror.eve} Uhr</small>`;
    const body = E.items.length ? `<ul>${E.items.map(it => mRow(it)).join('')}</ul>` : '<p class="m-dim">Nichts Besonderes.</p>';
    return `<section class="mb m-eve" data-b="eve"><h3>${esc(head)}${tag}</h3>${body}</section>`;
  },
  cal(now, pv) {
    const evs = ca.data && caSec().feeds.length ? ca.data.events : null;
    if (!evs) return pv ? mPh('cal', 'Verbinde zuerst deinen Kalender') : '';
    let html = '', n = 0;
    for (let i = 0; i < 2 && n < 7; i++) {
      const day = addDays(sod(now), i);
      const list = caDay(day, evs).filter(e => i > 0 || e.a || e.e > +now);
      if (!list.length) continue;
      html += `<h3>${i ? 'Morgen' : 'Heute'}</h3><ul>`;
      for (const e of list) {
        if (n++ >= 7) break;
        const live = !e.a && e.s <= +now;
        html += `<li style="--c:${caFeedColor(e.f)}"><span class="m-t">${e.a ? 'Ganztags' : live ? 'Jetzt' : hm(new Date(e.s))}</span><span>${esc(e.t)}</span></li>`;
      }
      html += '</ul>';
    }
    return `<section class="mb m-cal" data-b="cal">${html || '<h3>Heute</h3><p class="m-dim">Keine Termine mehr heute und morgen.</p>'}</section>`;
  },
  lines(now, pv, cx) {
    const want = cx.lines.filter(x => x.m === 'fix'), rows = want.map(x => mLine(x.w, now)).filter(Boolean);
    if (!rows.length) return pv ? mPh('lines', want.length ? 'Deine Widgets haben gerade nichts zu melden' : 'Stell unten Widgets auf „Fest“') : '';
    return `<ul class="mb m-lines" data-b="lines">${rows.map(r => mRow(r)).join('')}</ul>`;
  },
  dep(now, pv) {
    const dep = dpMirror(now);
    if (!dep) return pv ? mPh('dep', 'Wähl zuerst eine Haltestelle im Abfahrten-Widget') : '';
    const go = dep.walk ? dep.rows.find(r => !r.x) : null, left = go ? Math.floor((go.t - dep.walk * 6e4 - +now) / 6e4) : 0;
    return `<section class="mb m-dep" data-b="dep"><h3>${esc(dep.name)}${go ? ` <span>${left < 1 ? 'jetzt los' : `los in ${left} Min`}</span>` : ''}</h3>`
      + (dep.rows.length ? `<ul>${dep.rows.map(r => `<li${r.x ? ' class="x"' : ''}>${dpBadge(r)}<span class="m-to">${esc(r.to)}</span><b>${r.x ? 'fällt aus' : mirrorMin(r.t - +now, r.t)}</b></li>`).join('')}</ul>` : '<p class="m-dim">Gerade keine Abfahrten.</p>') + '</section>';
  },
  cd(now, pv) {
    // Kacheln und Countdowns wie oben im Cockpit, in derselben Reihenfolge
    const u = state.ui, out = [];
    for (const k of normOrder(u.order, u.countdowns)) {
      const el = k.startsWith('cd:') ? $('#cd-' + k.slice(3)) : u.tiles[k] ? $('#t-' + k) : null;
      if (!el) continue;
      const val = el.querySelector('.t-val').textContent.trim();
      if (val) out.push(`<li><span class="m-dim">${esc(el.querySelector('.t-label').textContent)}</span><b>${esc(val)}</b></li>`);
    }
    if (!out.length) return pv ? mPh('cd', 'Schalte unter Kopf ein paar Kacheln ein') : '';
    return `<section class="mb m-cd" data-b="cd"><ul>${out.join('')}</ul></section>`;
  },
  rot(now, pv, cx) {
    const want = cx.lines.filter(x => x.m === 'rot'), rows = want.map(x => mLine(x.w, now)).filter(Boolean);
    if (!rows.length) return pv ? mPh('rot', want.length ? 'Deine Widgets haben gerade nichts zu melden' : 'Stell unten Widgets auf „Wechsel“') : '';
    const i = Math.floor(now.getTime() / M_ROT) % rows.length;
    const dots = rows.length > 1 ? `<p class="m-dots" aria-hidden="true">${rows.map((_, j) => `<i${j === i ? ' class="on"' : ''}></i>`).join('')}</p>` : '';
    return `<div class="mb m-rot" data-b="rot"><ul>${rows.map((r, j) => mRow(r, j === i)).join('')}</ul>${dots}</div>`;
  }
};
/* Spiegel in ein Raster zeichnen: Bereiche ohne Inhalt fallen weg, die Mitte hält den Platz frei */
function mirrorRender(root, now, pv) {
  const m = state.ui.mirror, zones = Object.fromEntries(Object.keys(MZ).map(z => [z, []])), on = {};
  for (const b of m.blocks) on[b.k] = b.on && !!MBR[b.k];
  // Erst die Bausteine, die anderen etwas abnehmen: Morgen-Vorschau, dann Jetzt wichtig
  const cx = { cover: new Set(), lines: mLines(), nw: [], eve: null, on };
  try { if (on.eve) cx.eve = mirrorEve(now, cx, pv); } catch { cx.eve = null; }
  if (on.now) cx.nw = mirrorNow(now, cx, on, pv);
  for (const b of m.blocks) {
    if (!on[b.k]) continue;
    let h = '';
    try { h = MBR[b.k](now, pv, cx); } catch { h = ''; }
    if (h) zones[b.z].push(h);
  }
  const zone = z => zones[z].length ? `<div class="mz" data-z="${z}">${zones[z].join('')}</div>` : '';
  const rows = [];
  if (zones.top.length) rows.push(['top top', 'auto']);
  let html;
  if (zones.mid.length) {
    // Mit Inhalt in der Mitte: drei Reihen, links und rechts teilen sich die Höhe
    if (zones.tl.length || zones.tr.length) rows.push(['tl tr', 'auto']);
    rows.push(['mid mid', 'minmax(0,1fr)']);
    if (zones.bl.length || zones.br.length) rows.push(['bl br', 'auto']);
    html = Object.keys(MZ).map(zone).join('');
  } else {
    // Sonst zwei eigenständige Spalten, oben und unten darin frei verteilt. So nutzt jede Seite ihre ganze Höhe.
    rows.push(['l r', 'minmax(0,1fr)']);
    html = zone('top') + `<div class="mcol" data-c="l">${zone('tl')}${zone('bl')}</div><div class="mcol" data-c="r">${zone('tr')}${zone('br')}</div>`;
  }
  if (zones.bottom.length) rows.push(['bottom bottom', 'auto']);
  if (!zones.mid.length) html += zone('bottom');
  root.style.gridTemplateAreas = rows.map(r => `"${r[0]}"`).join(' ');
  root.style.gridTemplateRows = rows.map(r => r[1]).join(' ');
  root.style.setProperty('--m-k', String(m.size / 100));
  root.innerHTML = html;
  mirrorFit(root);
}
/* Was nicht mehr ganz passt, fliegt raus, immer von hinten: zuerst Kacheln, Kurzzeilen und Termine, dann Jetzt wichtig, Abfahrten,
 * die Morgen-Vorschau und die Stunden im Wetter. Von allem bleibt etwas stehen. Zeilen der Vorschau, die anderswo weggelassen wurden
 * (data-cat), gehen zuletzt. */
const M_FIT = [['.m-cd li', 1], ['.m-lines .ml', 2], ['.m-cal li', 3], ['.m-now .ml', 2], ['.m-dep li', 2], ['.m-eve .ml:not([data-cat])', 2], ['.m-cal li', 2], ['.m-notes li', 1], ['.m-wx-hrs', 0], ['.m-eve .ml:not([data-cat])', 0], ['.m-lines .ml', 1], ['.m-now .ml', 1], ['.m-eve .ml', 1], ['.ml-bars .ml-bar', 1]];
const M_COL = { tl: ['tl', 'bl'], bl: ['tl', 'bl'], tr: ['tr', 'br'], br: ['tr', 'br'] };
/* Wo es zu eng ist: Bereiche werden im Raster gestaucht und ihr Inhalt ragt dann über den Rand, bei den unteren nach oben.
 * Gekürzt wird nur in der Spalte, die überläuft (dazu die Bereiche über die ganze Breite). Die Vorschau ist skaliert, daher k. */
function mirrorTight(root) {
  if (root.scrollHeight > root.clientHeight + 1) return Object.keys(MZ);
  for (const z of root.querySelectorAll('.mz')) {
    const f = z.firstElementChild, l = z.lastElementChild;
    if (!f || !z.offsetHeight) continue;
    const zr = z.getBoundingClientRect(), k = zr.height / z.offsetHeight || 1;
    if (f.getBoundingClientRect().top < zr.top - k || l.getBoundingClientRect().bottom > zr.bottom + k) return [...(M_COL[z.dataset.z] || Object.keys(MZ)), 'top', 'mid', 'bottom'];
  }
  return null;
}
function mirrorFit(root) {
  for (let i = 0; i < 60; i++) {
    const hot = mirrorTight(root);
    if (!hot) break;
    let x = null;
    for (const [sel, keep] of M_FIT) {
      const l = root.querySelectorAll([...new Set(hot)].map(z => `.mz[data-z="${z}"] ${sel}`).join(','));
      if (l.length > keep) { x = l[l.length - 1]; break; }
    }
    if (!x) break;
    const ul = x.parentElement;
    x.remove();
    if (!ul.children.length && ul.previousElementSibling && ul.previousElementSibling.tagName === 'H3') { ul.previousElementSibling.remove(); ul.remove(); }
  }
}
const mirrorPreviewOn = () => dr.open && dr.tab === 'mirror';
function renderMirror() {
  const now = new Date();
  if (mr.on) mirrorRender($('#m-in'), now, false);
  if (mirrorPreviewOn()) { mirrorScale(); mirrorRender($('#mp-in'), now, true); }
}
/* Vorschau: der Spiegel wird in voller Größe (1600 × 900 oder hochkant) gezeichnet und passend verkleinert */
function mirrorScale() {
  const f = $('#mp-frame'), p = f.querySelector('.mp');
  if (!f.offsetWidth || !p.offsetWidth) return;
  p.style.setProperty('--mp-s', String(f.offsetWidth / p.offsetWidth));
}
const mirrorMin = (ms, t) => { const m = Math.floor(ms / 6e4); return m < 1 ? 'jetzt' : m < 60 ? `${m} Min` : hm(new Date(t)); };
/* Regen in den nächsten 2 Stunden in einem Satz */
function mirrorRain(d, now) {
  const m = d.minutely_15;
  if (!m || !m.time) return '';
  const t = now.getTime() / 1000;
  const next = m.time.map((x, i) => [x, m.precipitation[i]]).filter(([x]) => x >= t - 900 && x <= t + 7200);
  if (!next.length) return '';
  if (next[0][1] > 0.05) { const dry = next.find(([, p]) => p <= 0.05); return dry ? `Regen bis etwa ${hm(new Date(dry[0] * 1000))}` : 'Regen hält an'; }
  const wet = next.find(([, p]) => p > 0.05);
  return wet ? `Regen ab etwa ${hm(new Date(wet[0] * 1000))}` : 'Trocken in den nächsten 2 Stunden';
}
/* Liegt die Uhrzeit im Fenster zum Dimmen? Das Fenster darf über Mitternacht gehen. */
function mirrorDimNow(now) {
  const d = state.ui.mirror.dim;
  if (!d.on || d.from === d.to) return false;
  const t = hm(now);
  return d.from < d.to ? t >= d.from && t < d.to : t >= d.from || t < d.to;
}
/* Wechselplatz weiterblättern, ohne alles neu zu zeichnen */
function mirrorRotate(slot) {
  for (const box of document.querySelectorAll('.m-rot')) {
    const li = box.querySelectorAll('.ml'), dots = box.querySelectorAll('.m-dots i');
    if (li.length < 2) continue;
    const i = slot % li.length;
    li.forEach((x, j) => x.classList.toggle('on', j === i));
    dots.forEach((x, j) => x.classList.toggle('on', j === i));
  }
}
function mirrorTick(now) {
  if (!mr.on && !mirrorPreviewOn()) return;
  const k = `${hm(now)}|${ymd(now)}`;
  if (k !== mr.last) { mr.last = k; renderMirror(); }
  if (state.ui.mirror.secs) for (const s of document.querySelectorAll('.m-time .sec')) s.textContent = pad(now.getSeconds());
  const slot = Math.floor(now.getTime() / M_ROT);
  if (slot !== mr.slot) { mr.slot = slot; mirrorRotate(slot); }
  if (!mr.on) return;
  const m = state.ui.mirror, inner = $('#m-in');
  inner.style.opacity = mirrorDimNow(now) ? String(m.dim.lvl / 100) : '';
  const s = Math.floor(now.getTime() / 3e5);
  if (s !== mr.shift) {
    mr.shift = s;
    const a = (s * 2.39996) % (2 * Math.PI);
    inner.style.transform = reduceMotion || !m.shift ? '' : `translate(${(Math.cos(a) * 6).toFixed(1)}px,${(Math.sin(a) * 6).toFixed(1)}px)`;
  }
}
$('#mirror-btn').addEventListener('click', () => mirrorOpen(true));
$('#m-exit').addEventListener('click', mirrorClose);
$('#mirror').addEventListener('mousemove', mirrorWake);
$('#mirror').addEventListener('touchstart', mirrorWake, { passive: true });
document.addEventListener('keydown', e => {
  if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
  if (mr.on && (e.key === 'Escape' || e.key === 's' || e.key === 'S')) { e.preventDefault(); mirrorClose(); return; }
  if (mr.on || (e.key !== 's' && e.key !== 'S')) return;
  if (dr.open || edit.on || document.querySelector('dialog[open]')) return;
  const t = e.target;
  if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
  e.preventDefault();
  mirrorOpen(true);
});
// Wer den Vollbild-Modus mit Esc beendet, will raus aus dem Spiegel
document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement && mr.on && mr.fs) mirrorClose(); });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') mirrorLock(); });
addEventListener('hashchange', () => { if (mirrorFromHash()) mirrorOpen(false); else if (mr.on) mirrorClose(); });
if (typeof ResizeObserver === 'function') new ResizeObserver(mirrorScale).observe($('#mp-frame'));
