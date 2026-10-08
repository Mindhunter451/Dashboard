/* Fortschrittsbalken. Jedes Fortschritt-Widget hat seine eigenen Balken (cfg.bars). */
const vacationOn = d => { const k = ymd(d); return state.vacation.entries.find(e => e.from <= k && k <= e.to); };
/* Arbeitszeit für Feierabend-Kachel, Pendeln und automatische Startseite: der erste Arbeitstag- oder Arbeitswochen-Balken */
function allBars() { const out = []; for (const [, w] of widgetsOf('progress')) out.push(...w.cfg.bars); return out; }
const workBar = () => allBars().find(b => (b.kind === 'day' || b.kind === 'workweek') && validHm(b.start) && validHm(b.end));
function freeReason(b, d) {
  if (!(b.days || []).includes(d.getDay())) return d.getDay() === 0 || d.getDay() === 6 ? 'Wochenende' : 'Kein Arbeitstag';
  const h = holidayName(d); if (h) return `Feiertag: ${h}`;
  if (vacationOn(d)) return 'Urlaub';
  return null;
}

function calcBar(b, now) {
  const y = now.getFullYear();
  switch (b.kind) {
    case 'day': {
      if (!validHm(b.start) || !validHm(b.end)) return { pct: 0, state: 'off', sub: 'Uhrzeit fehlt', left: '', right: '' };
      const r = { left: b.start, right: b.end };
      const why = freeReason(b, now);
      if (why) return { ...r, pct: 0, state: 'off', sub: why === 'Urlaub' ? 'Heute Urlaub' : why === 'Wochenende' || why === 'Kein Arbeitstag' ? 'Heute frei' : `Heute frei, ${why}` };
      const s = at(now, b.start), e = at(now, b.end);
      if (e <= s) return { ...r, pct: 0, state: 'off', sub: 'Ende liegt vor dem Start' };
      if (now < s) return { ...r, pct: 0, state: 'wait', sub: `beginnt in ${dur(s - now, true)}` };
      if (now >= e) return { ...r, pct: 1, state: 'done', sub: 'Geschafft, Feierabend' };
      return { ...r, pct: (now - s) / (e - s), state: 'run', sub: `noch ${dur(e - now)}` };
    }
    case 'workweek': {
      if (!validHm(b.start) || !validHm(b.end)) return { pct: 0, state: 'off', sub: 'Uhrzeit fehlt', left: '', right: '' };
      const mon = addDays(sod(now), -((now.getDay() + 6) % 7));
      let total = 0, done = 0, first = null, last = null;
      for (let i = 0; i < 7; i++) {
        const d = addDays(mon, i);
        if (!(b.days || []).includes(d.getDay())) continue;
        if (!first) first = d; last = d;
        if (freeReason(b, d)) continue;
        const s = at(d, b.start), e = at(d, b.end);
        if (e <= s) continue;
        total += e - s;
        done += Math.max(0, Math.min(e - s, now - s));
      }
      const r = { left: first ? WD[first.getDay()] : '', right: last ? WD[last.getDay()] : '' };
      if (!total) return { ...r, pct: 0, state: 'off', sub: 'Diese Woche keine Arbeitszeit' };
      if (done >= total) return { ...r, pct: 1, state: 'done', sub: 'Woche geschafft' };
      if (done <= 0) return { ...r, pct: 0, state: 'wait', sub: `${hrsMin(total)} Arbeitszeit vor dir` };
      return { ...r, pct: done / total, state: 'run', sub: `noch ${hrsMin(total - done)} Arbeitszeit` };
    }
    case 'month': {
      const s = new Date(y, now.getMonth(), 1), e = new Date(y, now.getMonth() + 1, 1), last = addDays(e, -1);
      return { pct: (now - s) / (e - s), state: 'run', sub: `noch ${dur(e - now)}`, left: `1. ${MS[s.getMonth()]}`, right: `${last.getDate()}. ${MS[s.getMonth()]}`, meta: ML[now.getMonth()] };
    }
    case 'year': {
      const s = new Date(y, 0, 1), e = new Date(y + 1, 0, 1);
      return { pct: (now - s) / (e - s), state: 'run', sub: `noch ${dur(e - now)}`, left: '1. Jan', right: '31. Dez', meta: String(y) };
    }
    case 'range': {
      if (!validYmd(b.from) || !validYmd(b.to)) return { pct: 0, state: 'off', sub: 'Datum fehlt', left: '', right: '' };
      const s = parseYmd(b.from), e = addDays(parseYmd(b.to), 1);
      const r = { left: dmy(s), right: dmy(parseYmd(b.to)) };
      if (e <= s) return { ...r, pct: 0, state: 'off', sub: 'Ende liegt vor dem Start' };
      if (now < s) return { ...r, pct: 0, state: 'wait', sub: `startet ${inDays(dayDiff(now, s)).toLowerCase()}` };
      if (now >= e) return { ...r, pct: 1, state: 'done', sub: 'Abgeschlossen' };
      const totalDays = Math.round((e - s) / DAY), dayNo = dayDiff(s, now) + 1, left = totalDays - dayNo;
      return { ...r, pct: (now - s) / (e - s), state: 'run', sub: left > 0 ? `noch ${left} ${left === 1 ? 'Tag' : 'Tage'} · Tag ${dayNo} von ${totalDays}` : 'Letzter Tag' };
    }
  }
  return { pct: 0, state: 'off', sub: '', left: '', right: '' };
}

const barsOf = v => state.widgets[v.id].cfg.bars;
function renderBars(v) {
  const ul = v.q('[data-r="bars"]');
  ul.textContent = '';
  v.refs.clear();
  const bars = barsOf(v);
  if (!bars.length) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = 'Noch keine Balken. Leg mit „+ Balken“ deinen ersten an.';
    ul.appendChild(li);
    return;
  }
  for (const b of bars) {
    const li = document.createElement('li');
    li.className = 'bar';
    li.innerHTML = `<div class="bar-top"><span class="bar-name"></span><span class="bar-meta"></span>${b.example ? '<span class="chip" title="Tipp auf den Stift und trag deine echten Werte ein">Beispiel</span>' : ''}<span class="bar-pct"></span><button type="button" class="icon-btn" data-edit="${esc(b.id)}">${PENCIL}</button></div><div class="track" role="progressbar" aria-valuemin="0" aria-valuemax="100"><div class="fill"></div><i class="tick" style="left:25%"></i><i class="tick" style="left:50%"></i><i class="tick" style="left:75%"></i></div><div class="bar-foot"><span class="l"></span><span class="bar-sub"></span><span class="r"></span></div>`;
    li.querySelector('.bar-name').textContent = b.name;
    li.querySelector('[data-edit]').setAttribute('aria-label', `${b.name} bearbeiten`);
    li.querySelector('.track').setAttribute('aria-label', b.name);
    ul.appendChild(li);
    v.refs.set(b.id, { b, li, meta: li.querySelector('.bar-meta'), pct: li.querySelector('.bar-pct'), fill: li.querySelector('.fill'), track: li.querySelector('.track'), sub: li.querySelector('.bar-sub'), l: li.querySelector('.l'), r: li.querySelector('.r') });
  }
}
function tickBars(now) {
  for (const v of viewsOf('progress')) {
    if (v.el.hidden) continue;
    for (const ref of v.refs.values()) {
      const c = calcBar(ref.b, now), p = clamp01(c.pct);
      ref.fill.style.width = (p * 100).toFixed(3) + '%';
      ref.pct.textContent = pctTxt(p);
      ref.sub.textContent = c.sub;
      ref.l.textContent = c.left;
      ref.r.textContent = c.right;
      ref.meta.textContent = c.meta || '';
      ref.li.dataset.state = c.state;
      ref.track.setAttribute('aria-valuenow', (p * 100).toFixed(0));
    }
  }
}

/* Balken-Formular, je Widget */
function syncKind(v) {
  const k = v.q('[data-r="kind"]').value;
  v.q('[data-r="time"]').hidden = !(k === 'day' || k === 'workweek');
  v.q('[data-r="days"]').hidden = !(k === 'day' || k === 'workweek');
  v.q('[data-r="date"]').hidden = k !== 'range';
  v.q('[data-r="name"]').placeholder = KIND_NAME[k];
}
function openBarForm(v, b) {
  v.editing = b ? b.id : null;
  const wb = workBar(), t = sod(new Date()), q = v.q;
  q('[data-r="form-title"]').textContent = b ? `${b.name} bearbeiten` : 'Neuer Balken';
  q('[data-r="kind"]').value = b ? b.kind : 'range';
  q('[data-r="name"]').value = b ? b.name : '';
  q('[data-r="start"]').value = (b && b.start) || (wb && wb.start) || '08:00';
  q('[data-r="end"]').value = (b && b.end) || (wb && wb.end) || '16:30';
  const days = (b && b.days) || [1, 2, 3, 4, 5];
  v.el.querySelectorAll('[data-day]').forEach(cb => { cb.checked = days.includes(+cb.dataset.day); });
  q('[data-r="from"]').value = (b && b.from) || ymd(t);
  q('[data-r="to"]').value = (b && b.to) || ymd(addDays(t, 30));
  q('[data-r="del"]').hidden = !b;
  q('[data-r="err"]').hidden = true;
  syncKind(v);
  q('[data-r="form"]').hidden = false;
  q('[data-r="kind"]').focus();
}
function closeBarForm(v) { v.q('[data-r="form"]').hidden = true; v.editing = null; }

defineWidget('progress', {
  mount(v) {
    v.refs = new Map();
    v.editing = null;
    const q = v.q;
    q('[data-r="add"]').addEventListener('click', () => openBarForm(v, null));
    q('[data-r="kind"]').addEventListener('change', () => syncKind(v));
    q('[data-r="cancel"]').addEventListener('click', () => closeBarForm(v));
    q('[data-r="bars"]').addEventListener('click', e => {
      const btn = e.target.closest('[data-edit]');
      if (!btn) return;
      const b = barsOf(v).find(x => x.id === btn.dataset.edit);
      if (b) { openBarForm(v, b); q('[data-r="form"]').scrollIntoView({ block: 'nearest', behavior: reduceMotion ? 'auto' : 'smooth' }); }
    });
    q('[data-r="form"]').addEventListener('submit', e => {
      e.preventDefault();
      const k = q('[data-r="kind"]').value;
      const err = msg => { q('[data-r="err"]').textContent = msg; q('[data-r="err"]').hidden = false; };
      const bar = { id: v.editing || uid(), kind: k, name: q('[data-r="name"]').value.trim() || KIND_NAME[k] };
      if (k === 'day' || k === 'workweek') {
        const s = q('[data-r="start"]').value, en = q('[data-r="end"]').value;
        if (!validHm(s) || !validHm(en)) return err('Trag eine Start- und eine Endzeit ein.');
        if (en <= s) return err('Die Endzeit muss nach der Startzeit liegen.');
        const days = [...v.el.querySelectorAll('[data-day]')].filter(cb => cb.checked).map(cb => +cb.dataset.day).sort();
        if (!days.length) return err('Wähl mindestens einen Tag aus.');
        Object.assign(bar, { start: s, end: en, days });
      }
      if (k === 'range') {
        const f = q('[data-r="from"]').value, t = q('[data-r="to"]').value;
        if (!validYmd(f) || !validYmd(t)) return err('Trag ein Start- und ein Enddatum ein.');
        if (t < f) return err('Das Enddatum liegt vor dem Startdatum.');
        Object.assign(bar, { from: f, to: t });
      }
      const bars = barsOf(v), i = bars.findIndex(x => x.id === bar.id);
      if (i >= 0) bars[i] = bar;
      else if (bars.length < 12) bars.push(bar);
      else return err('Mehr als 12 Balken passen nicht in ein Widget.');
      closeBarForm(v);
      commit();
    });
    q('[data-r="del"]').addEventListener('click', () => {
      const bars = barsOf(v), i = bars.findIndex(x => x.id === v.editing);
      if (i < 0) return;
      const [removed] = bars.splice(i, 1);
      closeBarForm(v);
      commit();
      toast(`„${removed.name}“ gelöscht`, () => { const w = state.widgets[v.id]; if (!w) return; w.cfg.bars.splice(Math.min(i, w.cfg.bars.length), 0, removed); commit(); });
    });
  },
  render(v) {
    // Nur neu aufbauen, wenn sich die Balken geändert haben, sonst laufen die Balken bei jeder Änderung neu an
    const sig = JSON.stringify(barsOf(v));
    if (sig === v.sig && v.refs.size) return;
    v.sig = sig;
    renderBars(v);
  }
});
