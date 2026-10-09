/* Anpassen: Seitenleiste mit allgemeinen Einstellungen */
const dr = { open: false };
let editingCd = null, greetTimer = null;
function afterStateSwap(old) {
  if (JSON.stringify(old.loc) !== JSON.stringify(state.loc) && (wx.live || state.loc.mode === 'fixed')) startWeather();
  if (JSON.stringify(old.commute) !== JSON.stringify(state.commute)) { cm.res = null; loadCommute(); }
  const proj = s => Object.values(s.widgets).filter(w => w.type === 'tasks').map(w => w.cfg.projects.join('|')).join('/');
  if (proj(old) !== proj(state)) tasksReconfigure();
}
function segSet(box, v) { box.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === v))); }
function renderSwatches() {
  const box = $('#dr-accent'), dark = isDark();
  box.textContent = '';
  for (const [k, p] of Object.entries(ACCENTS)) {
    const lab = document.createElement('label');
    lab.className = 'swatch';
    lab.title = p.name;
    lab.innerHTML = `<input type="radio" name="dr-acc" value="${k}"${k === state.ui.accent ? ' checked' : ''}><span style="--c:${dark ? p.d[0] : p.l[0]}"></span>`;
    lab.querySelector('input').setAttribute('aria-label', p.name);
    box.appendChild(lab);
  }
}
function renderCdList() {
  const ul = $('#dr-cd-list');
  ul.textContent = '';
  for (const c of state.ui.countdowns) {
    const d = parseYmd(c.date);
    const li = document.createElement('li');
    li.innerHTML = `<div class="tx"><b></b><span>${esc(`${dm(d)}${d.getFullYear()}${c.time ? ', ' + c.time : ''}`)}</span></div><button type="button" class="icon-btn" data-cdedit="${c.id}">${PENCIL}</button><button type="button" class="icon-btn" data-cddel="${c.id}">${TRASH}</button>`;
    li.querySelector('b').textContent = c.name;
    li.querySelector('[data-cdedit]').setAttribute('aria-label', `${c.name} bearbeiten`);
    li.querySelector('[data-cddel]').setAttribute('aria-label', `${c.name} löschen`);
    ul.appendChild(li);
  }
  const full = state.ui.countdowns.length >= 6 && !editingCd;
  $('#cd-save').disabled = full;
  $('#cd-save').textContent = editingCd ? 'Speichern' : full ? 'Maximal 6 Countdowns' : '+ Countdown';
  $('#cd-cancel').hidden = !editingCd;
}
function resetCdForm() { editingCd = null; $('#cd-name').value = ''; $('#cd-date').value = ''; $('#cd-time').value = ''; $('#cd-err').hidden = true; }
const DAYS_TXT = days => {
  const d = [...days].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
  if (d.join() === '1,2,3,4,5') return 'Mo bis Fr';
  if (d.join() === '1,2,3,4,5,6') return 'Mo bis Sa';
  return d.map(x => WD[x]).join(', ');
};
function renderStartSec() {
  const st = state.ui.start, tg = startTargets();
  $('#dr-start').value = st.mode;
  const fill = (sel, val, fb) => {
    sel.textContent = '';
    for (const p of state.pages) sel.add(new Option(p.name, p.id));
    sel.value = pageById(val) ? val : fb;
  };
  fill($('#dr-start-page'), st.page, curPage().id);
  fill($('#dr-start-work'), st.work, tg.work.id);
  fill($('#dr-start-free'), st.free, tg.free.id);
  $('#dr-start-fixed').hidden = st.mode !== 'fixed';
  $('#dr-start-auto').hidden = st.mode !== 'auto';
  const wb = workBar();
  const tip = `Tipp: Hängst du #${pageSlug(tg.work)} an die Adresse an, öffnet sich direkt die Seite „${tg.work.name}“. Praktisch als Lesezeichen auf dem Arbeitsrechner.`;
  $('#dr-start-hint').textContent = st.mode !== 'auto' ? tip
    : wb ? `Deine Arbeitszeit kommt aus dem Balken „${wb.name}“: ${DAYS_TXT(wb.days || [])}, ${wb.start} bis ${wb.end} Uhr. Eine Stunde vor Beginn zählt schon als Arbeit, Feiertage und Urlaub als frei. Das Cockpit wechselt auch, während es offen ist, außer du hast in der letzten halben Stunde selbst eine Seite gewählt.`
    : 'Dafür braucht das Cockpit deine Arbeitszeit. Leg im Fortschritt-Widget einen Arbeitstag-Balken an.';
}
function renderDrawer() {
  const u = state.ui;
  $('#dr-greet').value = u.greet;
  segSet($('#dr-theme'), u.theme);
  segSet($('#dr-size'), u.size);
  renderSwatches();
  $('#dr-secs').checked = u.seconds;
  $('#dr-sky').checked = u.sky;
  const tl = $('#dr-tiles');
  tl.textContent = '';
  for (const [k, n] of Object.entries(TILES)) {
    const lab = document.createElement('label');
    lab.className = 'check-row';
    lab.innerHTML = `<input type="checkbox" data-tile="${k}"${u.tiles[k] ? ' checked' : ''}> ${esc(n)}`;
    tl.appendChild(lab);
  }
  renderCdList();
  renderStartSec();
  const sel = $('#dr-region');
  if (!sel.options.length) for (const [k, n] of Object.entries(REGIONS)) sel.add(new Option(n, k));
  sel.value = u.region;
  renderBackupInfo();
  $('#dr-data-err').hidden = true;
}
function openDrawer() {
  renderDrawer();
  $('#drawer').hidden = false;
  $('#scrim').hidden = false;
  $('#cust-btn').setAttribute('aria-expanded', 'true');
  dr.open = true;
  $('#dr-close').focus();
}
function closeDrawer() {
  if (!dr.open) return;
  if (greetTimer) { clearTimeout(greetTimer); greetTimer = null; commit(); }
  $('#drawer').hidden = true;
  $('#scrim').hidden = true;
  $('#cust-btn').setAttribute('aria-expanded', 'false');
  dr.open = false;
  resetCdForm();
  $('#cust-btn').focus();
}
$('#cust-btn').addEventListener('click', () => (dr.open ? closeDrawer() : openDrawer()));
$('#dr-close').addEventListener('click', closeDrawer);
$('#scrim').addEventListener('click', closeDrawer);
document.addEventListener('keydown', e => {
  if (!dr.open) return;
  if (e.key === 'Escape') { e.preventDefault(); closeDrawer(); return; }
  if (e.key !== 'Tab') return;
  const f = [...$('#drawer').querySelectorAll('button:not([disabled]),input:not([type=hidden]):not([hidden]),select,textarea,a[href]')].filter(el => el.offsetParent !== null);
  if (!f.length) return;
  const first = f[0], last = f[f.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
});
$('#dr-greet').addEventListener('input', e => {
  state.ui.greet = e.target.value.slice(0, 40);
  $('#h-greet').textContent = state.ui.greet.trim() || 'Moin';
  clearTimeout(greetTimer);
  greetTimer = setTimeout(() => { greetTimer = null; commit(); }, 600);
});
$('#dr-theme').addEventListener('click', e => {
  const b = e.target.closest('[data-v]');
  if (!b) return;
  state.ui.theme = b.dataset.v;
  commit();
  segSet($('#dr-theme'), state.ui.theme);
  renderSwatches();
});
$('#dr-size').addEventListener('click', e => {
  const b = e.target.closest('[data-v]');
  if (!b) return;
  state.ui.size = b.dataset.v;
  commit();
  segSet($('#dr-size'), state.ui.size);
});
$('#dr-accent').addEventListener('change', e => { if (e.target.name === 'dr-acc') { state.ui.accent = e.target.value; commit(); } });
$('#dr-secs').addEventListener('change', e => { state.ui.seconds = e.target.checked; commit(); });
$('#dr-sky').addEventListener('change', e => { state.ui.sky = e.target.checked; commit(); });
$('#dr-mirror').addEventListener('click', () => { closeDrawer(); mirrorOpen(true); });
$('#dr-tiles').addEventListener('change', e => {
  const k = e.target.dataset.tile;
  if (!k) return;
  state.ui.tiles[k] = e.target.checked;
  commit();
});
$('#dr-cd-list').addEventListener('click', e => {
  const del = e.target.closest('[data-cddel]');
  if (del) {
    const i = state.ui.countdowns.findIndex(c => c.id === del.dataset.cddel);
    if (i < 0) return;
    const [removed] = state.ui.countdowns.splice(i, 1);
    if (editingCd === removed.id) resetCdForm();
    commit();
    renderCdList();
    toast(`„${removed.name}“ gelöscht`, () => { state.ui.countdowns.splice(Math.min(i, state.ui.countdowns.length), 0, removed); commit(); renderCdList(); });
    return;
  }
  const ed = e.target.closest('[data-cdedit]');
  if (!ed) return;
  const c = state.ui.countdowns.find(x => x.id === ed.dataset.cdedit);
  if (!c) return;
  editingCd = c.id;
  $('#cd-name').value = c.name;
  $('#cd-date').value = c.date;
  $('#cd-time').value = c.time || '';
  $('#cd-err').hidden = true;
  renderCdList();
  $('#cd-name').focus();
});
$('#cd-cancel').addEventListener('click', () => { resetCdForm(); renderCdList(); });
$('#dr-cd-form').addEventListener('submit', e => {
  e.preventDefault();
  const name = $('#cd-name').value.trim(), date = $('#cd-date').value, time = $('#cd-time').value;
  const fail = m => { $('#cd-err').textContent = m; $('#cd-err').hidden = false; };
  if (!name) return fail('Gib dem Countdown einen Namen.');
  if (!validYmd(date)) return fail('Wähl ein Datum.');
  const c = { id: editingCd || uid(), name: name.slice(0, 30), date, time: validHm(time) ? time : '' };
  const i = state.ui.countdowns.findIndex(x => x.id === c.id);
  if (i >= 0) state.ui.countdowns[i] = c;
  else if (state.ui.countdowns.length < 6) state.ui.countdowns.push(c);
  resetCdForm();
  commit();
  renderCdList();
});
$('#dr-start').addEventListener('change', e => {
  const st = state.ui.start, tg = startTargets();
  st.mode = e.target.value;
  if (st.mode === 'fixed' && !pageById(st.page)) st.page = curPage().id;
  if (st.mode === 'auto') { if (!pageById(st.work)) st.work = tg.work.id; if (!pageById(st.free)) st.free = tg.free.id; }
  pg.autoWant = undefined;
  commit();
  renderStartSec();
});
for (const [sel, key] of [['#dr-start-page', 'page'], ['#dr-start-work', 'work'], ['#dr-start-free', 'free']]) {
  $(sel).addEventListener('change', e => { state.ui.start[key] = e.target.value; pg.autoWant = undefined; commit(); renderStartSec(); });
}
$('#dr-edit').addEventListener('click', () => { closeDrawer(); setEdit(true); });
$('#dr-region').addEventListener('change', e => { if (REGIONS[e.target.value]) { state.ui.region = e.target.value; commit(); } });
function replaceState(next, msg) {
  const prev = state;
  state = next;
  commit();
  afterStateSwap(prev);
  layoutNow();
  if (dr.open) renderDrawer();
  toast(msg, () => { const cur = state; state = prev; commit(); afterStateSwap(cur); layoutNow(); if (dr.open) renderDrawer(); });
}
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { applyUi(); if (dr.open) renderSwatches(); });
