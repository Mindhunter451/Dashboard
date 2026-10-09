/* Gewohnheiten: jede Kopie hat ihre eigene Liste (cfg.items). Pro Gewohnheit zählen die erledigten Tage (log). */
const habitsOf = v => state.widgets[v.id].cfg.items;
const weekStart = d => addDays(sod(d), -((d.getDay() + 6) % 7));
/* An welchen Tagen die Gewohnheit dran ist. Werktags: ohne Feiertage und Urlaub. */
function hbRequired(h, d) {
  if (h.rhythm !== 'workdays') return true;
  return d.getDay() >= 1 && d.getDay() <= 5 && !holidayName(d) && !vacationOn(d);
}
function hbStats(h, now) {
  const set = new Set(h.log), t = sod(now), today = ymd(t), mon = weekStart(t);
  const inWeek = m => { let c = 0; for (let i = 0; i < 7; i++) if (set.has(ymd(addDays(m, i)))) c++; return c; };
  const week = inWeek(mon);
  let goal = h.n, streak = 0;
  if (h.rhythm === 'weekly') {
    // Wochen in Folge mit erreichtem Ziel. Die laufende Woche zählt erst, wenn das Ziel geschafft ist.
    if (week >= h.n) streak++;
    for (let m = addDays(mon, -7), i = 0; i < 520; i++, m = addDays(m, -7)) { if (inWeek(m) >= h.n) streak++; else break; }
  } else {
    goal = 0;
    for (let i = 0; i < 7; i++) if (hbRequired(h, addDays(mon, i))) goal++;
    // Tage in Folge. Heute noch offen bricht die Serie nicht, Tage ohne Pflicht werden übersprungen.
    let d = set.has(today) ? t : addDays(t, -1);
    for (let i = 0; i < 1500; i++, d = addDays(d, -1)) {
      if (!hbRequired(h, d)) continue;
      if (set.has(ymd(d))) streak++; else break;
    }
  }
  return { streak, week, goal, doneToday: set.has(today) };
}
function renderHabits(v) {
  const ul = v.q('[data-r="list"]'), items = habitsOf(v), now = new Date(), t = sod(now), today = ymd(t);
  const keep = document.activeElement && ul.contains(document.activeElement) ? document.activeElement : null;
  const focusSel = keep ? (keep.dataset.day ? `[data-hid="${keep.closest('[data-hid]').dataset.hid}"] [data-day="${keep.dataset.day}"]` : keep.hasAttribute('data-hdone') ? `[data-hid="${keep.closest('[data-hid]').dataset.hid}"] [data-hdone]` : null) : null;
  ul.textContent = '';
  v.q('[data-r="legend"]').hidden = !items.length;
  if (!items.length) {
    const li = document.createElement('li');
    li.className = 'habit empty';
    li.innerHTML = '<p class="empty">Noch keine Gewohnheit. Leg mit dem Plus oben eine an, zum Beispiel Sport, Lesen oder Vokabeln.</p>';
    ul.appendChild(li);
    return;
  }
  const mon = weekStart(t);
  for (const h of items) {
    const st = hbStats(h, now), set = new Set(h.log);
    let weeks = '';
    for (const w of [-2, -1, 0]) {
      const m = addDays(mon, 7 * w);
      let cells = '';
      for (let i = 0; i < 7; i++) {
        const d = addDays(m, i), k = ymd(d), fut = d > t, req = hbRequired(h, d);
        cells += `<button type="button" class="hb-day${req ? '' : ' opt'}${k === today ? ' today' : ''}" data-day="${k}" aria-pressed="${set.has(k)}" title="${WD[d.getDay()]} ${dm(d)}${set.has(k) ? ', erledigt' : ''}"${fut ? ' disabled' : ''}></button>`;
      }
      weeks += `<div class="hb-week" role="group" aria-label="Woche ab ${dm(m)}">${cells}</div>`;
    }
    const rh = h.rhythm === 'daily' ? 'Jeden Tag' : h.rhythm === 'workdays' ? 'Werktags' : `${h.n}× pro Woche`;
    const unit = h.rhythm === 'weekly' ? (st.streak === 1 ? 'Woche' : 'Wochen') : (st.streak === 1 ? 'Tag' : 'Tage');
    const li = document.createElement('li');
    li.className = 'habit';
    li.dataset.hid = h.id;
    li.innerHTML = `<button type="button" class="hb-check" data-hdone aria-pressed="${st.doneToday}">${CHECK}</button><div class="hb-main"><div class="hb-top"><span class="hb-name"></span>${st.streak ? `<span class="hb-streak">${st.streak} ${unit} in Folge</span>` : ''}<button type="button" class="icon-btn" data-hedit>${PENCIL}</button></div><div class="hb-meta">${esc(rh)} · diese Woche ${st.week} von ${st.goal}${st.week >= st.goal && st.goal ? ', Ziel geschafft' : ''}</div><div class="hb-days">${weeks}</div></div>`;
    li.querySelector('.hb-name').textContent = h.name;
    li.querySelector('[data-hdone]').setAttribute('aria-label', `${h.name}: heute erledigt`);
    li.querySelector('[data-hedit]').setAttribute('aria-label', `${h.name} bearbeiten`);
    ul.appendChild(li);
  }
  if (focusSel) { const el = ul.querySelector(focusSel); if (el) el.focus(); }
}
function hbToggle(v, hid, day) {
  const h = habitsOf(v).find(x => x.id === hid);
  if (!h || day > ymd(new Date())) return;
  const i = h.log.indexOf(day);
  if (i >= 0) h.log.splice(i, 1);
  else { h.log.push(day); h.log.sort(); }
  commit();
}
function openHabitForm(v, h) {
  const q = v.q;
  v.editing = h ? h.id : null;
  q('[data-r="form-title"]').textContent = h ? `${h.name} bearbeiten` : 'Neue Gewohnheit';
  q('[data-r="name"]').value = h ? h.name : '';
  q('[data-r="rhythm"]').value = h ? h.rhythm : 'daily';
  q('[data-r="n"]').value = h ? h.n : 3;
  q('[data-r="n-wrap"]').hidden = q('[data-r="rhythm"]').value !== 'weekly';
  q('[data-r="del"]').hidden = !h;
  q('[data-r="err"]').hidden = true;
  q('[data-r="form"]').hidden = false;
  q('[data-r="name"]').focus();
}
function closeHabitForm(v) { v.q('[data-r="form"]').hidden = true; v.editing = null; }
defineWidget('habits', {
  mount(v) {
    const q = v.q;
    v.editing = null;
    q('[data-r="add"]').addEventListener('click', () => { if (q('[data-r="form"]').hidden || v.editing) openHabitForm(v, null); else closeHabitForm(v); });
    q('[data-r="cancel"]').addEventListener('click', () => closeHabitForm(v));
    q('[data-r="rhythm"]').addEventListener('change', e => { q('[data-r="n-wrap"]').hidden = e.target.value !== 'weekly'; });
    q('[data-r="list"]').addEventListener('click', e => {
      const li = e.target.closest('[data-hid]');
      if (!li) return;
      const hid = li.dataset.hid;
      if (e.target.closest('[data-hedit]')) { const h = habitsOf(v).find(x => x.id === hid); if (h) openHabitForm(v, h); return; }
      if (e.target.closest('[data-hdone]')) return hbToggle(v, hid, ymd(new Date()));
      const d = e.target.closest('[data-day]');
      if (d && !d.disabled) hbToggle(v, hid, d.dataset.day);
    });
    q('[data-r="form"]').addEventListener('submit', e => {
      e.preventDefault();
      const fail = m => { q('[data-r="err"]').textContent = m; q('[data-r="err"]').hidden = false; };
      const name = q('[data-r="name"]').value.trim().slice(0, 40);
      if (!name) return fail('Gib der Gewohnheit einen Namen.');
      const rhythm = q('[data-r="rhythm"]').value, n = Math.round(+q('[data-r="n"]').value);
      if (rhythm === 'weekly' && !(n >= 1 && n <= 7)) return fail('Pro Woche geht 1 bis 7 Mal.');
      const items = habitsOf(v), old = items.find(x => x.id === v.editing);
      if (!old && items.length >= 20) return fail('Mehr als 20 Gewohnheiten passen nicht in ein Widget.');
      const h = { id: old ? old.id : uid(), name, rhythm: HB_RHYTHM.includes(rhythm) ? rhythm : 'daily', n: rhythm === 'weekly' ? n : (old ? old.n : 3), log: old ? old.log : [] };
      if (old) items[items.indexOf(old)] = h; else items.push(h);
      closeHabitForm(v);
      commit();
    });
    q('[data-r="del"]').addEventListener('click', () => {
      const items = habitsOf(v), i = items.findIndex(x => x.id === v.editing);
      if (i < 0) return;
      const [removed] = items.splice(i, 1);
      closeHabitForm(v);
      commit();
      toast(`„${removed.name}“ gelöscht`, () => { const w = state.widgets[v.id]; if (!w) return; w.cfg.items.splice(Math.min(i, w.cfg.items.length), 0, removed); commit(); });
    });
  },
  render: renderHabits
});
