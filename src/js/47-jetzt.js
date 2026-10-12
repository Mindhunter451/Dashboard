/* Jetzt wichtig (gibt es nur einmal): sammelt aus allen Widgets, was gerade zählt, und sortiert es nach Dringlichkeit.
 * Morgens zählen Weg, Abfahrten, Regen und der erste Termin mehr, abends das, was morgen ansteht: Müll, Termine,
 * Geburtstage und Frost. Jeder Hinweis führt per Tipp zur passenden Karte.
 * Darunter ein Feld zum schnellen Notieren (auch mit der Taste N): landet im Todoist-Eingang, ohne Todoist in einer Notiz.
 * Seiten mit „nach Tageszeit ordnen“ (page.smart) stellen außerdem morgens andere Karten nach vorn als abends. */
const nw = { phase: '', t: 0, more: false, busy: false };
const NW_PH = { morning: 'Für den Morgen', day: 'Für den Tag', evening: 'Für heute Abend und morgen' };
const dayPhase = now => { const h = now.getHours(); return h >= 4 && h < 11 ? 'morning' : h >= 11 && h < 17 ? 'day' : 'evening'; };
const NW_ICO = {
  warn: svgIco('<path d="M10.3 4.3L2.6 18a2 2 0 0 0 1.7 3h15.4a2 2 0 0 0 1.7-3L13.7 4.3a2 2 0 0 0-3.4 0z"/><path d="M12 9.5v4.5M12 17.4v.2"/>'),
  rain: svgIco('<path d="M7 15.5h10a3.5 3.5 0 0 0 .3-7 5 5 0 0 0-9.6-1.3A4 4 0 0 0 7 15.5z"/><path d="M8.5 18.5l-1 2.5M12.5 18.5l-1 2.5M16.5 18.5l-1 2.5"/>'),
  frost: svgIco('<path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9"/><path d="M9.5 4.5L12 7l2.5-2.5M9.5 19.5L12 17l2.5 2.5"/>')
};

/* Reihenfolge der Karten je Tageszeit. „Jetzt wichtig“ steht immer vorn, unbekannte Typen hinten. */
const PH_ORDER = {
  morning: ['now', 'weather', 'dep', 'commute', 'cal', 'tasks', 'waste', 'bday', 'pomodoro', 'progress', 'learn', 'habits', 'fuel', 'verse', 'notes', 'links', 'vacation', 'football', 'f1'],
  day: ['now', 'cal', 'tasks', 'weather', 'dep', 'pomodoro', 'commute', 'progress', 'learn', 'habits', 'notes', 'links', 'fuel', 'waste', 'bday', 'verse', 'vacation', 'football', 'f1'],
  evening: ['now', 'waste', 'cal', 'bday', 'weather', 'tasks', 'habits', 'verse', 'dep', 'football', 'f1', 'notes', 'learn', 'links', 'commute', 'fuel', 'progress', 'pomodoro', 'vacation']
};
function smartOrder(items, now) {
  const L = PH_ORDER[dayPhase(now)];
  const rank = it => { const w = state.widgets[it.w], i = w ? L.indexOf(w.type) : -1; return i < 0 ? L.length : i; };
  return items.map((it, i) => [it, i]).sort((a, b) => rank(a[0]) - rank(b[0]) || a[1] - b[1]).map(x => x[0]);
}

/* Zu welcher Karte ein Hinweis führt: die auf der offenen Seite, sonst die erste auf irgendeiner Seite */
function nwTarget(type) {
  const ids = [...curPage().items.map(x => x.w), ...state.pages.flatMap(p => p.items.map(x => x.w))];
  return ids.find(id => state.widgets[id] && state.widgets[id].type === type) || null;
}
const nwIn = ms => (ms < 36e5 ? `in ${Math.max(1, Math.floor(ms / 6e4))} Min` : '');
const nwChips = bins => bins.map(b => `<i class="nw-bin" style="--c:${b.color}">${esc(b.name)}</i>`).join('');

/* Alle Hinweise mit Punktzahl. load: fehlende Abfahrten nachladen (nur, wenn die Karte zu sehen ist) */
function nwItems(now, load) {
  const t = +now, ph = dayPhase(now), today = sod(now), hrs = now.getHours(), out = [];
  const add = (k, sc, o) => out.push({ k, sc, ...o });
  const wxTo = nwTarget('weather');

  // Amtliche Warnungen: jetzt oder in den nächsten 12 Stunden
  for (const w of wnActive(now, 12 * 36e5).slice(0, 2)) {
    add('wn' + w.id, [0, 70, 86, 96, 99][w.lv], { ico: 'warn', wc: WN_COLOR[w.lv], t: w.ev, s: esc(`${WN_NAME[w.lv]}, ${wnWhen(w, now)}`), w: w.on <= t ? 'jetzt' : hm(new Date(w.on)), lv: w.lv >= 3 ? 'bad' : 'warn', to: wxTo });
  }

  // Termine: was gerade läuft, was gleich kommt, morgens der erste des Tages, abends der erste von morgen
  if (ca.data && caSec().feeds.length) {
    const evs = ca.data.events.filter(e => !e.a && e.e > t).sort((a, b) => a.s - b.s), to = nwTarget('cal');
    const where = e => (caCfg().loc && e.l ? `, ${e.l}` : '');
    const run = evs.find(e => e.s <= t);
    if (run) add('ca-run', 58, { ico: 'cal', t: run.t, s: esc(`Läuft bis ${hm(new Date(run.e))} Uhr${where(run)}`), w: 'jetzt', lv: 'now', to });
    const next = evs.find(e => e.s > t);
    if (next) {
      const ms = next.s - t, dd = dayDiff(now, new Date(next.s));
      const sc = ms <= 15 * 6e4 ? 92 : ms <= 36e5 ? 82 : ms <= 3 * 36e5 ? 68 : dd === 0 && ph === 'morning' ? 54 : 0;
      if (sc) add('ca-next', sc, { ico: 'cal', t: next.t, s: esc(`${dd === 0 ? 'Heute' : 'Morgen'} um ${hm(new Date(next.s))} Uhr${where(next)}`), w: nwIn(ms) || hm(new Date(next.s)), lv: ms <= 15 * 6e4 ? 'now' : '', to });
    }
    if (ph === 'evening' && hrs >= 17) {
      const tom = evs.find(e => dayDiff(now, new Date(e.s)) === 1);
      if (tom && !out.some(x => x.t === tom.t && x.k === 'ca-next')) {
        add('ca-tom', new Date(tom.s).getHours() < 10 ? 57 : 47, { ico: 'cal', t: tom.t, s: esc(`Morgen um ${hm(new Date(tom.s))} Uhr${where(tom)}`), w: 'morgen', to });
      }
    }
  }

  // Abfahrten der ersten Haltestelle, bevorzugt von der offenen Seite. Mit Fußweg: wann du los musst.
  const depId = (() => { const id = nwTarget('dep'); if (id && state.widgets[id].cfg.stop) return id; return [...state.pages.flatMap(p => p.items.map(x => x.w))].find(x => state.widgets[x] && state.widgets[x].type === 'dep' && state.widgets[x].cfg.stop) || null; })();
  if (depId) {
    const c = state.widgets[depId].cfg, st = c.stop, D = dp.data[st.id];
    if (load && (!D || t - D.at > 6e4) && !dp.busy[st.id] && t - (dp.last[st.id] || 0) > 6e4) setTimeout(() => dpLoad(st, Math.max(dpNeed(c), D ? D.need : 0)), 50);
    if (D && t - D.at < 30 * 6e4) {
      const rows = dpRows(D, c, t), r = rows.find(x => !x.x);
      if (r) {
        const m = Math.max(0, Math.floor((r.t - t) / 6e4)), leave = c.walk ? Math.floor((r.t - c.walk * 6e4 - t) / 6e4) : null;
        // Fällt die Fahrt vor deiner aus, steht das dabei. Ausfälle anderer Linien danach sind hier nur Rauschen.
        const delay = r.rt ? Math.round((r.t - r.s) / 6e4) : 0, x = rows.find(y => y.x && y.s < r.s);
        const s = `${dpBadge(r)}<span>${esc(r.to || 'Ohne Ziel')}, ${hm(new Date(r.s))}</span>${delay >= 1 ? `<span class="dp-late${delay >= 5 ? ' big' : ''}">+${delay}</span>` : ''}${x ? `<span class="dp-x">${esc(x.line)} ${hm(new Date(x.s))} fällt aus</span>` : ''}`;
        add('dep', ph === 'morning' ? (leave != null && leave <= 15 ? 88 : 76) : ph === 'day' ? 50 : 36, {
          ico: 'dep', t: leave != null ? (leave < 1 ? 'Jetzt los' : `Los in ${leave} Min`) : `Nächste Abfahrt ${m < 1 ? 'jetzt' : `in ${m} Min`}`,
          s, w: m < 1 ? 'jetzt' : `${m} Min`, lv: leave != null && leave < 2 ? 'now' : '', to: depId
        });
      }
    }
  }

  // Pendeln: morgens vor Arbeitsbeginn und rund um den Feierabend, an freien Tagen nicht
  const S = cm.sum, wb = workBar();
  if (S && t - S.at < 20 * 6e4 && wb && !freeReason(wb, now)) {
    const st = +at(now, wb.start), en = +at(now, wb.end);
    const toWork = S.dir === 'work' && t >= st - 150 * 6e4 && t <= st + 15 * 6e4;
    const toHome = S.dir === 'home' && t >= en - 45 * 6e4 && t <= en + 90 * 6e4;
    if (toWork || toHome) {
      const arr = hm(new Date(t + S.mins * 6e4));
      add('cm', S.closures ? 84 : S.delay >= 10 ? 76 : S.delay >= 3 ? 62 : 46, {
        ico: 'commute', t: `${toWork ? 'Zur Arbeit' : 'Nach Hause'} ${S.mins} Min`,
        s: esc(S.closures ? `${S.closures === 1 ? 'Eine Sperrung' : `${S.closures} Sperrungen`} auf der Strecke` : S.delay >= 1 ? `${Math.round(S.delay)} Min Stau, an ${arr} Uhr` : `Freie Fahrt, an ${arr} Uhr`),
        w: S.live ? 'live' : '', lv: S.closures ? 'bad' : S.delay >= 3 ? 'warn' : '', to: nwTarget('commute')
      });
    }
  }

  // Wetter: Regen in den nächsten 2 Stunden, morgens die Aussicht für den Tag, Frost am Morgen
  const d = wx.data;
  if (d && d.minutely_15 && Array.isArray(d.minutely_15.time)) {
    const m = d.minutely_15;
    const slots = m.time.map((x, i) => [x * 1000, +m.precipitation[i] || 0]).filter(([x]) => x + 15 * 6e4 > t && x <= t + 2 * 36e5);
    const wet = slots.findIndex(([, p]) => p >= 0.05);
    if (wet === 0) {
      const dry = slots.find(([, p]) => p < 0.05);
      add('rain', 46, { ico: 'rain', t: 'Regnet gerade', s: esc(dry ? `Trocken ab etwa ${hm(new Date(dry[0]))} Uhr` : 'Hält die nächsten 2 Stunden an'), w: '', to: wxTo });
    } else if (wet > 0) {
      const a = slots[wet][0];
      add('rain', a - t < 45 * 6e4 ? 66 : 58, { ico: 'rain', t: `Regen ab ${hm(new Date(a))}`, s: 'Schirm einpacken, wenn du rausgehst', w: nwIn(a - t), to: wxTo });
    }
  }
  if (d && d.hourly && Array.isArray(d.hourly.time)) {
    const h = d.hourly;
    if (ph === 'morning' && !out.some(x => x.k === 'rain') && Array.isArray(h.precipitation_probability)) {
      const end = +at(now, '20:00');
      let first = null, max = 0;
      h.time.forEach((x, i) => { const ts = x * 1000, pp = +h.precipitation_probability[i] || 0; if (ts < t - 36e5 || ts > end) return; if (pp >= 60 && !first) first = ts; max = Math.max(max, pp); });
      if (first) add('rain-day', 50, { ico: 'rain', t: 'Heute Regen wahrscheinlich', s: esc(`Bis ${max} %, ab etwa ${new Date(first).getHours()} Uhr. Schirm mitnehmen.`), w: '', to: wxTo });
    }
    if (ph === 'evening' && hrs >= 17 && Array.isArray(h.temperature_2m)) {
      const tm = addDays(today, 1), a = +at(tm, '05:00'), b = +at(tm, '09:00');
      let min = Infinity;
      h.time.forEach((x, i) => { const ts = x * 1000; if (ts >= a && ts <= b && Number.isFinite(+h.temperature_2m[i])) min = Math.min(min, +h.temperature_2m[i]); });
      if (min <= 0.5) add('frost', 56, { ico: 'frost', t: 'Morgen früh Frost', s: esc(`Bis ${numDe(min, 0)}°. Zeit zum Kratzen einplanen.`), w: 'morgen', to: wxTo });
    }
  }
  if (ph === 'morning' && d && d.current && Number.isFinite(+d.current.temperature_2m) && +d.current.temperature_2m <= 0.5) {
    add('frost', 58, { ico: 'frost', t: 'Frost draußen', s: esc(`${numDe(+d.current.temperature_2m, 0)}°. Zeit zum Kratzen einplanen.`), w: '', to: wxTo });
  }

  // Müll: am Vorabend rausstellen, morgens den Abholtag
  const bins = state.waste.bins;
  if (bins.length) {
    const tom = wsOn(bins, addDays(today, 1)), tod = wsOn(bins, today), to = nwTarget('waste');
    if (tom.length && hrs >= 12) {
      const late = now >= at(now, wsCfg().at);
      add('ws', late ? 82 : 44, { ico: 'waste', t: late ? 'Heute Abend rausstellen' : 'Morgen wird abgeholt', s: nwChips(tom), w: 'morgen', lv: late ? 'now' : '', to });
    }
    if (tod.length && hrs < 12) add('ws-t', ph === 'morning' ? 66 : 50, { ico: 'waste', t: 'Heute wird abgeholt', s: nwChips(tod), w: 'heute', lv: 'warn', to });
  }

  // Geburtstage heute, und ab dem Nachmittag die von morgen
  let nb = 0;
  for (const x of bdUpcoming(now)) {
    const dd = dayDiff(today, x.d);
    if (dd > 1 || nb >= 2) break;
    if (dd === 1 && hrs < 15) continue;
    nb++;
    add('bd' + x.id, dd ? 44 : 74, {
      ico: 'bday', t: x.cal ? x.name : `${x.name} hat ${dd ? 'morgen ' : ''}Geburtstag`,
      s: esc(x.cal ? (dd ? 'Morgen, aus dem Kalender' : 'Heute, aus dem Kalender') : x.age != null ? `Wird ${x.age}` : ''), w: dd ? 'morgen' : 'heute', lv: dd ? '' : 'now', to: nwTarget('bday')
    });
  }

  // Aufgaben aus Todoist: überfällig und für heute
  if (tdToken() && tk.stamp) {
    const seen = new Set(), over = [], due = [];
    for (const [k] of tkKeys()) for (const x of tk.tasks[k] || []) {
      if (!x || x.checked || seen.has(x.id)) continue;
      seen.add(x.id);
      const di = dueInfo(x);
      if (di && di.s === 'over') over.push(x); else if (di && di.s === 'today') due.push(x);
    }
    const n = over.length + due.length, first = over[0] || due[0];
    if (n) {
      const more = n > 1 ? ` und ${n - 1} weitere` : '';
      add('tk', over.length ? 64 : ph === 'morning' ? 60 : ph === 'day' ? 52 : 46, {
        ico: 'tasks', t: over.length ? `${over.length} ${over.length === 1 ? 'Aufgabe' : 'Aufgaben'} überfällig${due.length ? `, ${due.length} für heute` : ''}` : `${due.length} ${due.length === 1 ? 'Aufgabe' : 'Aufgaben'} für heute`,
        s: esc(`${plain(first.content) || 'Ohne Titel'}${more}`), w: '', lv: over.length ? 'warn' : '', to: nwTarget('tasks')
      });
    }
  }

  // Pomodoro läuft
  if (po.running && po.endsAt > t) {
    const left = Math.ceil((po.endsAt - t) / 6e4);
    add('po', 52, { ico: 'pomodoro', t: `${PO_NAME[po.mode]} läuft`, s: esc(po.mode === 'focus' && po.task ? po.task : `Noch ${left} Min`), w: `${left} Min`, lv: 'now', to: nwTarget('pomodoro') });
  }

  // Prüfung in den nächsten zwei Wochen
  for (const [id, w] of widgetsOf('learn')) {
    if (!w.cfg.date || !pagesUsing(id).length) continue;
    const L = learnCalc(w.cfg, now);
    if (L.daysLeft == null || L.daysLeft < 0 || L.daysLeft > 14) continue;
    add('lr' + id, L.daysLeft <= 3 ? 70 : L.daysLeft <= 7 ? 55 : 40, {
      ico: 'learn', t: `${w.title || 'Prüfung'} ${L.daysLeft === 0 ? 'heute' : L.daysLeft === 1 ? 'morgen' : `in ${L.daysLeft} Tagen`}`,
      s: esc(L.total ? (L.left ? `Noch ${L.left} von ${L.total} Themen offen` : 'Alle Themen abgehakt') : 'Noch keine Themen angelegt'), w: '', lv: L.daysLeft <= 1 ? 'now' : '', to: id
    });
  }

  // Abends: tägliche Gewohnheiten, die heute noch fehlen
  if (hrs >= 18) {
    const open = [];
    for (const [id, w] of widgetsOf('habits')) {
      if (!pagesUsing(id).length) continue;
      for (const h of w.cfg.items) if (h.rhythm !== 'weekly' && hbRequired(h, now) && !h.log.includes(ymd(now))) open.push([id, h.name]);
    }
    if (open.length) add('hb', 34, { ico: 'habits', t: `${open.length} ${open.length === 1 ? 'Gewohnheit' : 'Gewohnheiten'} heute noch offen`, s: esc(open.slice(0, 3).map(x => x[1]).join(', ')), w: '', to: open[0][0] });
  }

  return out.sort((a, b) => b.sc - a.sc);
}

function nwRowHtml(it) {
  const inner = `<span class="nw-ico"${it.wc ? ` style="--wc:${it.wc}"` : ''}>${NW_ICO[it.ico] || TICON[it.ico] || ''}</span>`
    + `<span class="nw-main"><b>${esc(it.t)}</b>${it.s ? `<small>${it.s}</small>` : ''}</span>${it.w ? `<span class="nw-when">${esc(it.w)}</span>` : ''}`;
  const lv = it.lv ? ` data-lv="${it.lv}"` : '';
  return `<li>${it.to ? `<button type="button" class="nw-row" data-go="${esc(it.to)}" data-k="${esc(it.k)}"${lv}>${inner}</button>` : `<div class="nw-row"${lv}>${inner}</div>`}</li>`;
}
/* Wenn nichts drängt: ein ruhiger Satz und, falls bekannt, was als Nächstes kommt */
function nwCalm(now) {
  let next = '';
  if (ca.data && caSec().feeds.length) {
    const e = ca.data.events.filter(x => !x.a && x.s > +now).sort((a, b) => a.s - b.s)[0];
    if (e) { const s = new Date(e.s), dd = dayDiff(now, s); next = `Nächster Termin: ${dd === 0 ? 'heute' : dd === 1 ? 'morgen' : WD[s.getDay()]} ${hm(s)} Uhr, ${e.t}.`; }
  }
  return `<li class="nw-calm"><b>Alles ruhig.</b><span>Gerade drängt nichts.${next ? ` ${esc(next)}` : ''}</span></li>`;
}
function renderNow() {
  const v = views.get('now');
  if (!v || v.el.hidden) return;
  if (zu.has('now')) { peekCard(v); return; }
  const now = new Date(), c = state.widgets.now.cfg;
  const all = nwItems(now, document.visibilityState === 'visible'), n = isNarrow() ? Math.min(c.n, 4) : c.n;
  const list = nw.more ? all : all.slice(0, n);
  const ul = $('#nw-list'), act = document.activeElement, keep = act && ul.contains(act) && act.dataset.k;
  const html = list.length ? list.map(nwRowHtml).join('') : nwCalm(now);
  if (ul.dataset.h !== html) {
    ul.dataset.h = html;
    ul.innerHTML = html;
    if (keep) { const b = ul.querySelector(`[data-k="${CSS.escape(keep)}"]`); if (b) b.focus(); }
  }
  $('#nw-more').hidden = all.length <= n;
  $('#nw-more').textContent = nw.more ? 'Weniger zeigen' : `${all.length - n} weitere zeigen`;
  $('#nw-ph').textContent = NW_PH[dayPhase(now)];
  $('#nw-cap').hidden = !c.cap;
  $('#nw-src').hidden = !c.cap;
  if (c.cap) {
    const tg = capTarget(), inp = $('#nw-in');
    inp.disabled = nw.busy || !tg;
    inp.placeholder = tg ? 'Schnell notieren …' : 'Notieren geht mit Todoist oder einer Notiz';
    $('#nw-go').disabled = nw.busy || !tg;
    $('#nw-src').textContent = capHint(tg, true);
  }
}
let nwDirtyT = 0;
function nowDirty() {
  if (nwDirtyT) return;
  nwDirtyT = setTimeout(() => { nwDirtyT = 0; const v = views.get('now'); if (v && !v.el.hidden) { if (zu.has('now')) peekCard(v); else renderNow(); } }, 200);
}
/* Takt: alle 10 Sekunden neu sortieren. Wechselt die Tageszeit, ordnen sich Seiten mit „nach Tageszeit“ neu. */
function nwTick(now) {
  const ph = dayPhase(now);
  if (ph !== nw.phase) {
    const first = !nw.phase;
    nw.phase = ph;
    if (!first && curPage().smart && !edit.on) { syncBoard(); schedLayout(); }
  }
  if (now.getSeconds() % 10 === 5 && document.visibilityState === 'visible') renderNow();
}
/* Zu einer Karte springen, notfalls auf die Seite, auf der sie liegt */
function nwJump(id) {
  if (!curPage().items.some(x => x.w === id)) {
    const p = pagesUsing(id)[0];
    if (!p) return;
    showPage(p.id, 'user');
  }
  const v = views.get(id);
  if (!v) return;
  if (zu.has(id)) setCollapsed(v, false);
  requestAnimationFrame(() => {
    v.el.scrollIntoView({ block: 'start', behavior: reduceMotion ? 'auto' : 'smooth' });
    v.el.classList.remove('flash');
    void v.el.offsetWidth;
    v.el.classList.add('flash');
  });
}
$('#nw-list').addEventListener('click', e => { const b = e.target.closest('[data-go]'); if (b) nwJump(b.dataset.go); });
$('#nw-more').addEventListener('click', () => { nw.more = !nw.more; renderNow(); schedLayout(); });

/* Schnell notieren: mit Todoist in den Eingang (Quick Add versteht „morgen 9 Uhr“ und Co.), sonst in eine Notiz */
/* Welche Notiz: die auf der offenen Seite, sonst eine, die nicht nach Arbeit klingt, sonst irgendeine */
function capNoteId() {
  const isNote = id => state.widgets[id] && state.widgets[id].type === 'notes';
  const here = curPage().items.map(x => x.w).find(isNote);
  if (here) return here;
  const ids = [...state.pages.flatMap(p => p.items.map(x => x.w)), ...Object.keys(state.widgets)].filter(isNote);
  return ids.find(id => !PL_WORK.test(state.widgets[id].title)) || ids[0] || null;
}
function capTarget() {
  if (tdToken() && !(tk.ask && tk.ask.err)) return { kind: 'td' };
  const id = capNoteId();
  return id ? { kind: 'note', id } : null;
}
function capHint(tg, short) {
  const key = matchMedia('(hover: hover)').matches ? ' Taste N öffnet das Feld von überall.' : '';
  if (!tg) return 'Verbinde Todoist im Aufgaben-Widget oder leg ein Notizen-Widget an, dann kannst du hier notieren.';
  if (tg.kind === 'td') return short ? `Landet in deinem Todoist-Eingang.${key}` : 'Landet in deinem Todoist-Eingang. Ein Datum wie „morgen 9 Uhr“ erkennt Todoist selbst.';
  return `Landet in der Notiz „${widgetTitle(tg.id)}“. Mit Todoist landet es im Eingang.${short ? key : ''}`;
}
function capNote(id, text, pre) {
  const w = state.widgets[id];
  if (!w) return false;
  const old = w.cfg.text, next = `${old.replace(/\s+$/, '')}${old.trim() ? '\n' : ''}${text}`.slice(0, 8000);
  w.cfg.text = next;
  commit();
  toast(`${pre}Steht jetzt in „${widgetTitle(id)}“`, () => { const x = state.widgets[id]; if (x && x.cfg.text === next) { x.cfg.text = old; commit(); } });
  return true;
}
async function capture(raw) {
  const text = String(raw || '').replace(/\s+/g, ' ').trim().slice(0, 500);
  if (!text) return false;
  const tg = capTarget();
  if (!tg) { toast('Zum Notieren Todoist verbinden oder ein Notizen-Widget anlegen.'); return false; }
  if (tg.kind === 'note') return capNote(tg.id, text, '');
  try {
    const t = await tdFetch('/tasks/quick', 'POST', null, { text });
    const name = t && t.content ? plain(t.content) : text;
    toast(`„${name}“ steht in Todoist`, t && t.id ? async () => {
      try { await tdFetch(`/tasks/${encodeURIComponent(t.id)}`, 'DELETE'); } catch (err) { tdError(err); }
      tdLoad();
    } : null);
    tdLoad();
    return true;
  } catch (err) {
    if (err && err.code === 'bad_token') { tdError(err); }
    // Lieber in der Notiz als verloren
    const id = capNoteId();
    if (id && (!err || err.code !== 'rate')) return capNote(id, text, 'Todoist ging gerade nicht. ');
    toast(err && err.code === 'rate' ? 'Todoist bremst gerade. Versuch es in einer Minute nochmal.' : 'Todoist ist gerade nicht erreichbar. Versuch es gleich nochmal.');
    return false;
  }
}
async function captureFrom(inp, btn) {
  if (nw.busy || !inp.value.trim()) return;
  nw.busy = true;
  inp.disabled = true;
  btn.disabled = true;
  let ok = false;
  try { ok = await capture(inp.value); } finally {
    nw.busy = false;
    inp.disabled = false;
    btn.disabled = false;
  }
  if (ok) inp.value = '';
  renderNow();
  return ok;
}
$('#nw-cap').addEventListener('submit', async e => { e.preventDefault(); await captureFrom($('#nw-in'), $('#nw-go')); $('#nw-in').focus(); });
$('#cap-form').addEventListener('submit', async e => {
  e.preventDefault();
  if (await captureFrom($('#cap-in'), $('#cap-ok'))) $('#dlg-cap').close();
  else $('#cap-in').focus();
});
function openCapture() {
  const v = views.get('now');
  if (v && !v.el.hidden && state.widgets.now.cfg.cap && capTarget()) {
    if (zu.has('now')) setCollapsed(v, false);
    const inp = $('#nw-in');
    inp.focus({ preventScroll: true });
    inp.scrollIntoView({ block: 'center', behavior: reduceMotion ? 'auto' : 'smooth' });
    return;
  }
  const tg = capTarget();
  $('#cap-in').value = '';
  $('#cap-in').disabled = !tg;
  $('#cap-ok').disabled = !tg;
  $('#cap-hint').textContent = capHint(tg, false);
  $('#dlg-cap').showModal();
  if (tg) $('#cap-in').focus();
}
document.addEventListener('keydown', e => {
  if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || (e.key !== 'n' && e.key !== 'N')) return;
  if (mr.on || dr.open || edit.on || document.querySelector('dialog[open]')) return;
  const t = e.target;
  if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
  e.preventDefault();
  openCapture();
});

defineWidget('now', {
  render: renderNow,
  settings: {
    render(box, w) {
      box.innerHTML = `<label class="field"><span class="lbl">Höchstens so viele Hinweise</span><select data-s="n">${[3, 4, 6, 8].map(n => `<option value="${n}"${n === w.cfg.n ? ' selected' : ''}>${n}</option>`).join('')}</select></label>`
        + `<label class="check-row"><input type="checkbox" data-s="cap"${w.cfg.cap ? ' checked' : ''}> Feld zum schnellen Notieren zeigen</label>`
        + '<p class="hint">Die Karte sammelt aus deinen anderen Widgets, was gerade zählt: Wetterwarnungen, Termine, Abfahrten, Pendeln, Regen, Frost, Müll, Geburtstage, Aufgaben, Prüfung und Gewohnheiten. Morgens zählt der Weg, abends das, was morgen ansteht. Auf dem Handy zeigt sie höchstens 4, der Rest steckt hinter „weitere zeigen“.</p>';
    },
    save(box, w) {
      w.cfg.n = +box.querySelector('[data-s="n"]').value || 6;
      w.cfg.cap = box.querySelector('[data-s="cap"]').checked;
      return null;
    }
  }
});
