/* Lernfortschritt: Prüfungsdatum, Themen zum Abhaken und ob das Tempo bis zur Prüfung reicht */
const learnOf = v => state.widgets[v.id].cfg;
function learnCalc(c, now) {
  const t = sod(now), topics = c.topics;
  const total = topics.length, doneDates = topics.filter(x => x.done).map(x => x.done).sort(), done = doneDates.length, left = total - done;
  const exam = c.date ? parseYmd(c.date) : null;
  const daysLeft = exam ? dayDiff(t, exam) : null;
  // Tempo: abgehakte Themen der letzten 4 Wochen, bzw. seit Lernstart oder dem ersten Haken (mindestens über eine Woche gemittelt)
  const startK = c.start && c.start <= ymd(t) ? c.start : doneDates[0] || ymd(t);
  const span = Math.max(7, Math.min(28, dayDiff(parseYmd(startK), t) + 1));
  const from = ymd(addDays(t, -(span - 1)));
  const recent = doneDates.filter(k => k >= from).length;
  const rate = recent / span;
  const finish = rate > 0 && left > 0 ? addDays(t, Math.ceil(left / rate)) : null;
  return { total, done, left, exam, daysLeft, rate, finish };
}
function learnPace(L) {
  const th = n => `${n} ${n === 1 ? 'Thema' : 'Themen'}`;
  const dd = d => d.getFullYear() === new Date().getFullYear() ? dm(d) : dmy(d);
  if (!L.total) return ['Leg deine Themen an. Dann siehst du hier, ob dein Tempo bis zur Prüfung reicht.', ''];
  if (!L.left) return ['Alles abgehakt. Jetzt nur noch wiederholen.', 'ok'];
  if (!L.exam) return [`Noch ${th(L.left)} offen. Trag das Prüfungsdatum ein, dann rechnet das Cockpit dein Tempo aus.`, ''];
  if (L.daysLeft < 0) return ['Die Prüfung ist vorbei. Trag die nächste ein oder räum die Liste auf.', ''];
  const d = Math.max(1, L.daysLeft);
  const perWeek = L.left / (d / 7);
  const need = d <= 21 ? `${numDe(L.left / d, 1)} pro Tag` : perWeek >= 1 ? `${numDe(perWeek, 1)} pro Woche` : `eins alle ${Math.round(1 / perWeek)} Wochen`;
  const base = `Noch ${th(L.left)} in ${d} ${d === 1 ? 'Tag' : 'Tagen'}, also etwa ${need}.`;
  if (!L.rate) return [`${base} Hak Themen ab, sobald du sie draufhast, dann siehst du hier dein Tempo.`, d <= 30 ? 'warn' : ''];
  const buf = dayDiff(L.finish, L.exam);
  if (buf >= 7) return [`${base} Bei deinem Tempo bist du am ${dd(L.finish)} durch, ${buf >= 14 ? `${Math.floor(buf / 7)} Wochen` : `${buf} Tage`} vor der Prüfung.`, 'ok'];
  if (buf >= 0) return [`${base} Bei deinem Tempo wirst du am ${dd(L.finish)} fertig, das wird knapp.`, 'warn'];
  return [`${base} Bei deinem jetzigen Tempo wärst du erst am ${dd(L.finish)} durch, ${-buf} ${buf === -1 ? 'Tag' : 'Tage'} zu spät. Leg einen Zahn zu.`, 'bad'];
}
function renderLearn(v) {
  const c = learnOf(v), q = v.q, now = new Date(), L = learnCalc(c, now);
  q('[data-r="empty"]').hidden = !!c.date;
  q('[data-r="hero"]').hidden = !c.date;
  if (c.date) {
    const big = q('[data-r="days"]'), lbl = q('[data-r="days-lbl"]');
    if (L.daysLeft > 0) { big.textContent = L.daysLeft; lbl.textContent = L.daysLeft === 1 ? 'Tag bis zur Prüfung' : 'Tage bis zur Prüfung'; }
    else if (L.daysLeft === 0) { big.textContent = 'Heute'; lbl.textContent = 'ist Prüfung. Viel Erfolg!'; }
    else { big.textContent = 'Vorbei'; lbl.textContent = `seit ${-L.daysLeft} ${L.daysLeft === -1 ? 'Tag' : 'Tagen'}`; }
    const ex = L.exam;
    q('[data-r="dl"]').innerHTML = [
      ['Prüfung', `${WD[ex.getDay()]} ${dmy(ex)}${c.time ? `, ${c.time}` : ''}`],
      ['Erledigt', `${L.done} von ${L.total}`],
      ['Fortschritt', L.total ? `${Math.round(L.done / L.total * 100)} %` : '0 %']
    ].map(([k, x]) => `<dt>${esc(k)}</dt><dd>${esc(x)}</dd>`).join('');
  }
  q('[data-r="bar-wrap"]').hidden = !L.total;
  q('[data-r="bar"]').style.width = L.total ? (L.done / L.total * 100).toFixed(2) + '%' : '0';
  q('[data-r="bar-wrap"]').setAttribute('aria-label', `${L.done} von ${L.total} Themen erledigt`);
  const [txt, lv] = learnPace(L);
  const pace = q('[data-r="pace"]');
  pace.textContent = txt;
  pace.dataset.lv = lv;
  q('[data-r="tip"]').hidden = L.total > 3;

  // Themen: offene zuerst, erledigte darunter (eingeklappt, wenn es viele sind)
  const keep = document.activeElement && v.el.contains(document.activeElement) && document.activeElement.dataset.tid;
  const ul = q('[data-r="topics"]'), open = c.topics.filter(x => !x.done), done = c.topics.filter(x => x.done).sort((a, b) => b.done.localeCompare(a.done));
  ul.textContent = '';
  const LIM = 10;
  const row = x => {
    const li = document.createElement('li');
    li.className = 'tp' + (x.done ? ' done' : '');
    li.innerHTML = `<label class="check-row"><input type="checkbox" data-tid="${esc(x.id)}"${x.done ? ' checked' : ''}><span></span></label>${x.done ? `<small>${dm(parseYmd(x.done))}</small>` : ''}<button type="button" class="icon-btn" data-tdel="${esc(x.id)}">${TRASH}</button>`;
    li.querySelector('span').textContent = x.name;
    li.querySelector('[data-tdel]').setAttribute('aria-label', `${x.name} löschen`);
    ul.appendChild(li);
  };
  (v.allOpen ? open : open.slice(0, LIM)).forEach(row);
  if (done.length && (v.showDone || !open.length)) {
    const h = document.createElement('li');
    h.className = 'tp-head';
    h.textContent = `Erledigt (${done.length})`;
    ul.appendChild(h);
    done.forEach(row);
  }
  const more = q('[data-r="more-row"]');
  more.textContent = '';
  const btn = (label, fn) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'more'; b.textContent = label; b.addEventListener('click', fn); more.appendChild(b); };
  if (open.length > LIM) btn(v.allOpen ? 'Weniger anzeigen' : `${open.length - LIM} weitere offen`, () => { v.allOpen = !v.allOpen; renderLearn(v); });
  if (done.length && open.length) btn(v.showDone ? 'Erledigte ausblenden' : `${done.length} erledigte zeigen`, () => { v.showDone = !v.showDone; renderLearn(v); });
  more.hidden = !more.children.length;
  if (keep) { const el = ul.querySelector(`[data-tid="${keep}"]`); if (el) el.focus(); }
}
function learnAdd(v, names) {
  const c = learnOf(v);
  const list = names.map(s => s.replace(/^\s*([-*•]|\d+[.)])\s+/, '').trim()).filter(Boolean);
  if (!list.length) return 0;
  const room = 300 - c.topics.length;
  for (const n of list.slice(0, room)) c.topics.push({ id: uid(), name: n.slice(0, 80), done: null });
  commit();
  return Math.min(list.length, room);
}
defineWidget('learn', {
  mount(v) {
    const q = v.q;
    v.allOpen = false;
    v.showDone = false;
    const openForm = () => {
      const c = learnOf(v);
      q('[data-r="date"]').value = c.date;
      q('[data-r="time"]').value = c.time;
      q('[data-r="start"]').value = c.start;
      q('[data-r="err"]').hidden = true;
      q('[data-r="form"]').hidden = false;
      q('[data-r="date"]').focus();
    };
    q('[data-r="set"]').addEventListener('click', () => { if (q('[data-r="form"]').hidden) openForm(); else q('[data-r="form"]').hidden = true; });
    q('[data-r="empty-btn"]').addEventListener('click', openForm);
    q('[data-r="cancel"]').addEventListener('click', () => { q('[data-r="form"]').hidden = true; });
    q('[data-r="form"]').addEventListener('submit', e => {
      e.preventDefault();
      const d = q('[data-r="date"]').value, tm = q('[data-r="time"]').value, st = q('[data-r="start"]').value;
      if (!validYmd(d)) { q('[data-r="err"]').textContent = 'Trag das Datum der Prüfung ein.'; q('[data-r="err"]').hidden = false; return; }
      if (validYmd(st) && st > d) { q('[data-r="err"]').textContent = 'Der Lernstart liegt nach der Prüfung.'; q('[data-r="err"]').hidden = false; return; }
      Object.assign(learnOf(v), { date: d, time: validHm(tm) ? tm : '', start: validYmd(st) ? st : '' });
      q('[data-r="form"]').hidden = true;
      commit();
    });
    const inp = q('[data-r="new"]');
    q('[data-r="addform"]').addEventListener('submit', e => {
      e.preventDefault();
      if (learnAdd(v, [inp.value])) inp.value = '';
      inp.focus();
    });
    // Eingefügte Liste: ein Thema pro Zeile
    inp.addEventListener('paste', e => {
      const txt = (e.clipboardData || window.clipboardData).getData('text');
      if (!/\n/.test(txt)) return;
      e.preventDefault();
      const n = learnAdd(v, txt.split(/\r?\n/));
      if (n) toast(`${n} ${n === 1 ? 'Thema' : 'Themen'} eingefügt`);
      inp.focus();
    });
    q('[data-r="topics"]').addEventListener('change', e => {
      const id = e.target.dataset.tid;
      const x = id && learnOf(v).topics.find(y => y.id === id);
      if (!x) return;
      x.done = e.target.checked ? ymd(new Date()) : null;
      commit();
    });
    q('[data-r="topics"]').addEventListener('click', e => {
      const b = e.target.closest('[data-tdel]');
      if (!b) return;
      const list = learnOf(v).topics, i = list.findIndex(y => y.id === b.dataset.tdel);
      if (i < 0) return;
      const [removed] = list.splice(i, 1);
      commit();
      toast(`„${removed.name}“ gelöscht`, () => { const w = state.widgets[v.id]; if (!w) return; w.cfg.topics.splice(Math.min(i, w.cfg.topics.length), 0, removed); commit(); });
    });
  },
  render: renderLearn
});
