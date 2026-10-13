/* Anpassen: schwebendes Fenster mit vier Bereichen (Aussehen, Seiten, Geräte, Daten).
 * Jede Änderung wirkt sofort, das Cockpit bleibt dahinter sichtbar. Auf dem Handy ein Blatt von unten zum Wegziehen. */
const DR_TABS = ['look', 'pages', 'devices', 'data'];
const dr = { open: false, tab: 'look', closeT: 0 };
let editingCd = null, greetTimer = null, radiusTimer = null;
function afterStateSwap(old) {
  if (JSON.stringify(old.loc) !== JSON.stringify(state.loc) && (wx.live || state.loc.mode === 'fixed')) startWeather();
  if (JSON.stringify(old.commute) !== JSON.stringify(state.commute)) { cm.res = null; loadCommute(); }
  const proj = s => Object.values(s.widgets).filter(w => w.type === 'tasks').map(w => w.cfg.projects.join('|')).join('/');
  if (proj(old) !== proj(state)) tasksReconfigure();
}
function segSet(box, v) { box.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === v))); }
/* Name des gewählten Akzents für die Zeile unter den Farben */
function accentName(u) {
  if (u.accent === 'custom') return `Eigene Farbe ${u.accentHex}`;
  if (u.accent === 'sun') return 'Mit dem Tag: nachts Violett, morgens Koralle und Bernstein, mittags Petrol und Blau, abends wieder warm';
  return (ACCENTS[u.accent] || GRADS[u.accent] || ACCENTS.amber).name;
}
function renderSwatches() {
  const box = $('#dr-accent'), dark = isDark(), u = state.ui;
  const one = (k, name, cls) => {
    const on = accentFor(GRADS[k] ? GRADS[k].a : (ACCENTS[k] || ACCENTS.amber).hex, dark ? (u.dark === 'oled' ? 'oled' : 'graphite') : 'light');
    const ink = onAccent([on.a], on.H, on.C);
    return `<label class="swatch${cls ? ' ' + cls : ''}" title="${esc(name)}"><input type="radio" name="dr-acc" value="${k}"${k === u.accent ? ' checked' : ''} aria-label="${esc(name)}"><span style="--c:${accentSwatch(k, dark)};--on:${ink}">${CHECK}</span></label>`;
  };
  const sunC = acc.sunHex ? accentFor(acc.sunHex, dark ? 'graphite' : 'light').a : ACCENTS.amber.hex;
  box.innerHTML = '<p class="acc-sub">Einfarbig</p><div class="swatches">'
    + Object.entries(ACCENTS).map(([k, p]) => one(k, p.name)).join('')
    + `<label class="swatch sw-custom${u.accent === 'custom' ? ' on' : ''}" title="Eigene Farbe wählen"><input type="color" id="dr-acc-pick" value="${esc(u.accentHex.toLowerCase())}" aria-label="Eigene Farbe wählen"><span style="--c:${accentSwatch('custom', dark)}"></span></label></div>`
    + '<p class="acc-sub">Verlauf</p><div class="swatches">' + Object.entries(GRADS).map(([k, g]) => one(k, g.name)).join('') + '</div>'
    + `<p class="acc-sub">Mit der Sonne</p><div class="swatches"><label class="swatch sw-sun" title="Folgt dem Sonnenstand"><input type="radio" name="dr-acc" value="sun"${u.accent === 'sun' ? ' checked' : ''} aria-label="Mit dem Tag, folgt dem Sonnenstand"><span style="--c:${sunC}"><b>Mit dem Tag</b><em></em>${CHECK}</span></label></div>`;
  $('#dr-acc-now').innerHTML = `<b>${esc(accentName(u).split(':')[0])}</b>${u.accent === 'sun' ? ': ' + esc(accentName(u).split(': ')[1]) : ''}`;
}
/* Vorschau-Kacheln im Design-Bereich zeigen Graphit oder Schwarz, je nach Wahl */
function renderThemePick() {
  segSet($('#dr-theme'), state.ui.theme);
  for (const el of document.querySelectorAll('#dr-theme .tp-prev')) el.toggleAttribute('data-oled', state.ui.dark === 'oled');
  segSet($('#dr-dark'), state.ui.dark);
}
function renderRadius() {
  const r = $('#dr-radius'), v = state.ui.radius;
  r.value = v;
  r.style.setProperty('--p', `${((v - 4) / 24) * 100}%`);
  $('#dr-radius-v').textContent = `${v} px`;
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
function renderTilesSec() {
  const tl = $('#dr-tiles');
  tl.innerHTML = Object.entries(TILES).map(([k, n]) => `<label class="dr-line"><span class="dr-lt">${esc(n)}</span><input type="checkbox" class="switch" data-tile="${k}"${state.ui.tiles[k] ? ' checked' : ''}></label>`).join('');
}
function renderDrawer() {
  const u = state.ui;
  if (document.activeElement !== $('#dr-greet')) $('#dr-greet').value = u.greet;
  renderThemePick();
  segSet($('#dr-size'), u.size);
  segSet($('#dr-density'), u.density);
  renderRadius();
  renderSwatches();
  $('#dr-secs').checked = u.seconds;
  $('#dr-sky').checked = u.sky;
  renderTilesSec();
  renderCdList();
  renderStartSec();
  const sel = $('#dr-region');
  if (!sel.options.length) for (const [k, n] of Object.entries(REGIONS)) sel.add(new Option(n, k));
  sel.value = u.region;
  renderBackupInfo();
  renderSnaps();
  renderPlanBtns();
  renderSync();
  $('#dr-data-err').hidden = true;
}
/* Bereich wechseln: Pille gleitet, Inhalt blendet weich ein */
function setDrTab(tab, focus) {
  if (!DR_TABS.includes(tab)) tab = 'look';
  const changed = dr.tab !== tab;
  dr.tab = tab;
  for (const b of document.querySelectorAll('#dr-tabs [role="tab"]')) {
    const on = b.dataset.tab === tab;
    b.setAttribute('aria-selected', String(on));
    b.tabIndex = on ? 0 : -1;
    if (on && focus) b.focus();
  }
  $('#dr-tabs').style.setProperty('--i', DR_TABS.indexOf(tab));
  for (const t of DR_TABS) $('#dr-p-' + t).hidden = t !== tab;
  if (changed) $('#dr-body').scrollTop = 0;
}
function openDrawer(tab) {
  clearTimeout(dr.closeT);
  const d = $('#drawer'), sc = $('#scrim');
  d.classList.remove('closing', 'settle');
  sc.classList.remove('closing');
  d.style.transform = '';
  renderDrawer();
  setDrTab(tab || dr.tab);
  d.hidden = false;
  sc.hidden = false;
  $('#cust-btn').setAttribute('aria-expanded', 'true');
  dr.open = true;
  $(`#dr-tabs [aria-selected="true"]`).focus({ preventScroll: true });
}
function closeDrawer() {
  if (!dr.open) return;
  if (greetTimer) { clearTimeout(greetTimer); greetTimer = null; commit(); }
  if (radiusTimer) { clearTimeout(radiusTimer); radiusTimer = null; commit(); }
  const d = $('#drawer'), sc = $('#scrim');
  $('#cust-btn').setAttribute('aria-expanded', 'false');
  dr.open = false;
  resetCdForm();
  const done = () => { d.hidden = true; sc.hidden = true; d.classList.remove('closing', 'settle'); sc.classList.remove('closing'); d.style.transform = ''; };
  if (reduceMotion) done();
  else {
    // Beim Wegziehen auf dem Handy läuft das Blatt von dort weiter, wo der Finger es losgelassen hat
    if (d.style.transform) { d.classList.add('settle'); d.style.transform = 'translateY(100%)'; }
    else d.classList.add('closing');
    sc.classList.add('closing');
    dr.closeT = setTimeout(done, 240);
  }
  $('#cust-btn').focus({ preventScroll: true });
}
$('#cust-btn').addEventListener('click', () => (dr.open ? closeDrawer() : openDrawer()));
$('#dr-close').addEventListener('click', closeDrawer);
$('#scrim').addEventListener('click', closeDrawer);
$('#dr-tabs').addEventListener('click', e => { const b = e.target.closest('[data-tab]'); if (b) setDrTab(b.dataset.tab); });
$('#dr-tabs').addEventListener('keydown', e => {
  const i = DR_TABS.indexOf(dr.tab), n = DR_TABS.length;
  const j = e.key === 'ArrowRight' ? (i + 1) % n : e.key === 'ArrowLeft' ? (i - 1 + n) % n : e.key === 'Home' ? 0 : e.key === 'End' ? n - 1 : -1;
  if (j < 0) return;
  e.preventDefault();
  setDrTab(DR_TABS[j], true);
});
document.addEventListener('keydown', e => {
  if (!dr.open) return;
  if (e.key === 'Escape') { e.preventDefault(); closeDrawer(); return; }
  if (e.key !== 'Tab') return;
  const f = [...$('#drawer').querySelectorAll('button:not([disabled]),input:not([type=hidden]):not([hidden]),select,textarea,a[href],summary,[tabindex="0"]')].filter(el => el.offsetParent !== null && el.tabIndex >= 0);
  if (!f.length) return;
  const first = f[0], last = f[f.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
});
/* Handy: Blatt am Griff oder an der Überschrift nach unten ziehen, ab einem Stück schließt es */
(() => {
  const d = $('#drawer');
  let y0 = null, dy = 0, t0 = 0;
  const start = e => {
    if (!matchMedia('(max-width:640px)').matches || e.target.closest('button')) return;
    y0 = e.clientY; dy = 0; t0 = Date.now();
    d.classList.add('dragging');
    d.setPointerCapture(e.pointerId);
  };
  const move = e => {
    if (y0 === null) return;
    dy = Math.max(0, e.clientY - y0);
    d.style.transform = dy ? `translateY(${dy}px)` : '';
  };
  const end = () => {
    if (y0 === null) return;
    y0 = null;
    d.classList.remove('dragging');
    const fast = dy > 40 && Date.now() - t0 < 250;
    if (dy > Math.min(140, d.offsetHeight * 0.25) || fast) closeDrawer();
    else { d.classList.add('settle'); d.style.transform = ''; setTimeout(() => d.classList.remove('settle'), 320); }
  };
  for (const el of [$('#dr-grab'), $('#dr-head')]) el.addEventListener('pointerdown', start);
  d.addEventListener('pointermove', move);
  d.addEventListener('pointerup', end);
  d.addEventListener('pointercancel', end);
})();
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
  renderThemePick();
  renderSwatches();
});
$('#dr-dark').addEventListener('click', e => {
  const b = e.target.closest('[data-v]');
  if (!b) return;
  state.ui.dark = b.dataset.v;
  // Wer Schwarz wählt, will es meist auch sehen
  if (!isDark()) state.ui.theme = 'dark';
  commit();
  renderThemePick();
  renderSwatches();
});
$('#dr-size').addEventListener('click', e => {
  const b = e.target.closest('[data-v]');
  if (!b) return;
  state.ui.size = b.dataset.v;
  commit();
  segSet($('#dr-size'), state.ui.size);
});
$('#dr-density').addEventListener('click', e => {
  const b = e.target.closest('[data-v]');
  if (!b) return;
  state.ui.density = b.dataset.v;
  commit();
  segSet($('#dr-density'), state.ui.density);
});
$('#dr-radius').addEventListener('input', e => {
  state.ui.radius = Math.round(okClamp(+e.target.value, 4, 28) / 2) * 2;
  document.documentElement.style.setProperty('--r', state.ui.radius + 'px');
  renderRadius();
  clearTimeout(radiusTimer);
  radiusTimer = setTimeout(() => { radiusTimer = null; commit(); }, 400);
});
$('#dr-accent').addEventListener('change', e => {
  if (e.target.name === 'dr-acc') { state.ui.accent = e.target.value; commit(); renderSwatches(); }
  if (e.target.id === 'dr-acc-pick') { commit(); renderSwatches(); }
});
/* Eigene Farbe: beim Ziehen im Farbwähler gleich zeigen, gespeichert wird beim Loslassen */
$('#dr-accent').addEventListener('input', e => {
  if (e.target.id !== 'dr-acc-pick' || !okValidHex(e.target.value)) return;
  state.ui.accentHex = e.target.value.toUpperCase();
  state.ui.accent = 'custom';
  applyAccent();
  const sp = e.target.nextElementSibling;
  if (sp) sp.style.setProperty('--c', accentSwatch('custom', isDark()));
  e.target.closest('.sw-custom').classList.add('on');
  for (const r of document.querySelectorAll('#dr-accent input[name="dr-acc"]')) r.checked = false;
});
/* Ein Klick auf die eigene Farbe wählt sie auch dann, wenn man im Farbwähler nichts ändert */
$('#dr-accent').addEventListener('click', e => {
  if (e.target.id !== 'dr-acc-pick' || state.ui.accent === 'custom') return;
  state.ui.accent = 'custom';
  commit();
  e.target.closest('.sw-custom').classList.add('on');
  for (const r of document.querySelectorAll('#dr-accent input[name="dr-acc"]')) r.checked = false;
  $('#dr-acc-now').innerHTML = `<b>${esc(accentName(state.ui))}</b>`;
});
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
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { applyUi(); sky.minute = -1; skyTick(new Date()); if (dr.open) renderSwatches(); });
