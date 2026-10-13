/* Anpassen: schwebendes Fenster mit fünf Bereichen (Aussehen, Kopf, Seiten, Spiegel, Daten).
 * Jede Änderung wirkt sofort, das Cockpit bleibt dahinter sichtbar. Auf dem Handy ein Blatt von unten zum Wegziehen. */
const DR_TABS = ['look', 'head', 'pages', 'mirror', 'data'];
const dr = { open: false, tab: 'look', closeT: 0 };
let editingCd = null, greetTimer = null, radiusTimer = null, slideTimer = null;
const GRIP = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="9" cy="6.5" r="1.6"/><circle cx="15" cy="6.5" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="17.5" r="1.6"/><circle cx="15" cy="17.5" r="1.6"/></svg>';
/* Schieberegler mit gefülltem Stück bis zum Daumen und Wert daneben */
function setRange(sel, v, lo, hi, txt) {
  const r = $(sel);
  r.value = v;
  r.style.setProperty('--p', `${((v - lo) / (hi - lo)) * 100}%`);
  $(sel + '-v').textContent = txt;
}
const HW_TXT = w => w < 260 ? 'Hauchdünn' : w < 360 ? 'Leicht' : w < 480 ? 'Normal' : w < 600 ? 'Kräftig' : 'Fett';
/* Regler: sofort zeigen, kurz nach dem Loslassen speichern */
function slideSave() { clearTimeout(slideTimer); slideTimer = setTimeout(() => { slideTimer = null; commit(); }, 400); }
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
/* Kopf: Stil, Größe und Stärke der Uhr, was daneben steht */
function renderHeadSec() {
  const u = state.ui, h = u.head;
  segSet($('#dr-hstyle'), h.style);
  setRange('#dr-hsize', h.size, 70, 140, `${h.size} %`);
  setRange('#dr-hweight', h.weight, 200, 700, HW_TXT(h.weight));
  $('#dr-secs').checked = u.seconds;
  $('#dr-hgreet').checked = h.greet;
  $('#dr-greet-row').hidden = !h.greet;
  $('#dr-hdate').checked = h.date;
  $('#dr-hkw').checked = h.kw;
  $('#dr-sky').checked = u.sky;
}
/* Kacheln oben: eine Liste zum Sortieren, Countdowns mittendrin. Daneben steht, was die Kachel gerade zeigt. */
const TILE_SUB = { cal: 'Aus deinem Kalender', sun: 'Nächster Auf- oder Untergang' };
function renderTilesSec() {
  const u = state.ui;
  $('#dr-tiles').innerHTML = normOrder(u.order, u.countdowns).map(k => {
    const cd = k.startsWith('cd:') ? u.countdowns.find(c => 'cd:' + c.id === k) : null;
    const name = cd ? cd.name : TILES[k];
    if (!name) return '';
    const el = cd ? $('#cd-' + cd.id) : $('#t-' + k);
    const val = el ? el.querySelector('.t-val').textContent.trim() : '';
    const sub = k === 'sun' && val ? `${el.querySelector('.t-label').textContent} ${val}` : val || TILE_SUB[k] || '';
    return `<li class="sort-row" data-key="${esc(k)}"><button type="button" class="sort-h" aria-label="${esc(name)} verschieben" title="Ziehen oder mit den Pfeiltasten schieben">${GRIP}</button>`
      + `<span class="dr-lt">${esc(name)}${sub ? `<small>${esc(sub)}</small>` : ''}</span>`
      + (cd ? '<span class="chip">Countdown</span>' : `<input type="checkbox" class="switch" data-tile="${k}"${u.tiles[k] ? ' checked' : ''} aria-label="${esc(name)} zeigen">`) + '</li>';
  }).join('');
}
/* Spiegel: Vorlage, Bausteine mit Bereich, Uhr, Nachtmodus. Die Vorschau zeichnet sich bei jeder Änderung neu. */
const mp = { o: 'land' };
function renderMirrorSec() {
  const m = state.ui.mirror;
  segSet($('#dr-mpreset'), m.preset);
  segSet($('#mp-o'), mp.o);
  $('#mp-frame').dataset.o = mp.o;
  $('#dr-mblocks').innerHTML = m.blocks.map(b => `<li class="sort-row" data-key="${b.k}"><button type="button" class="sort-h" aria-label="${esc(MB[b.k])} verschieben" title="Ziehen oder mit den Pfeiltasten schieben">${GRIP}</button>`
    + `<span class="dr-lt">${esc(MB[b.k])}${MB_SUB[b.k] ? `<small>${esc(MB_SUB[b.k])}</small>` : ''}</span>`
    + `<select class="dr-in mz-sel" data-mz="${b.k}" aria-label="Bereich für ${esc(MB[b.k])}"${b.on ? '' : ' disabled'}>${Object.entries(MZ).map(([z, n]) => `<option value="${z}"${z === b.z ? ' selected' : ''}>${esc(n)}</option>`).join('')}</select>`
    + `<input type="checkbox" class="switch" data-mon="${b.k}"${b.on ? ' checked' : ''} aria-label="${esc(MB[b.k])} zeigen"></li>`).join('');
  setRange('#dr-msize', m.size, 70, 140, `${m.size} %`);
  $('#dr-msecs').checked = m.secs;
  $('#dr-mdim').checked = m.dim.on;
  $('#dr-mdim-from').value = m.dim.from;
  $('#dr-mdim-to').value = m.dim.to;
  $('#dr-mdim-times').hidden = !m.dim.on;
  $('#dr-mdim-row').hidden = !m.dim.on;
  setRange('#dr-mdim-lvl', m.dim.lvl, 15, 80, `${m.dim.lvl} %`);
  $('#dr-mshift').checked = m.shift;
  renderMirror();
}
function renderDrawer() {
  const u = state.ui;
  if (document.activeElement !== $('#dr-greet')) $('#dr-greet').value = u.greet;
  renderThemePick();
  segSet($('#dr-size'), u.size);
  segSet($('#dr-density'), u.density);
  renderRadius();
  renderSwatches();
  renderHeadSec();
  renderTilesSec();
  renderMirrorSec();
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
  if (tab === 'devices') tab = 'data';
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
  if (tab === 'mirror') { mr.last = ''; renderMirror(); }
  if (tab === 'head') renderTilesSec();
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
  if (slideTimer) { clearTimeout(slideTimer); slideTimer = null; commit(); }
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
/* Kopf */
$('#dr-hstyle').addEventListener('click', e => {
  const b = e.target.closest('[data-v]');
  if (!b) return;
  const h = state.ui.head;
  h.style = b.dataset.v;
  h.weight = HEAD_STYLES[h.style][1];
  h.size = 100;
  commit();
  renderHeadSec();
});
$('#dr-hsize').addEventListener('input', e => { state.ui.head.size = +e.target.value; applyUi(); renderHeadSec(); slideSave(); });
$('#dr-hweight').addEventListener('input', e => { state.ui.head.weight = +e.target.value; applyUi(); renderHeadSec(); slideSave(); });
for (const [sel, key] of [['#dr-hgreet', 'greet'], ['#dr-hdate', 'date'], ['#dr-hkw', 'kw']]) {
  $(sel).addEventListener('change', e => { state.ui.head[key] = e.target.checked; commit(); renderHeadSec(); });
}
/* Kacheln oben */
$('#dr-tiles').addEventListener('change', e => {
  const k = e.target.dataset.tile;
  if (!k) return;
  state.ui.tiles[k] = e.target.checked;
  commit();
});
sortable($('#dr-tiles'), { item: '.sort-row', handle: '.sort-h', done: keys => { state.ui.order = normOrder(keys, state.ui.countdowns); commit(); } });
/* Spiegel */
$('#dr-mirror').addEventListener('click', () => { closeDrawer(); mirrorOpen(true); });
$('#mp-o').addEventListener('click', e => {
  const b = e.target.closest('[data-v]');
  if (!b) return;
  mp.o = b.dataset.v;
  segSet($('#mp-o'), mp.o);
  $('#mp-frame').dataset.o = mp.o;
  renderMirror();
});
$('#dr-mpreset').addEventListener('click', e => {
  const b = e.target.closest('[data-v]');
  if (!b || !M_PRESETS[b.dataset.v]) return;
  const m = state.ui.mirror;
  m.blocks = mPresetBlocks(b.dataset.v);
  m.preset = b.dataset.v;
  commit();
  renderMirrorSec();
});
$('#dr-mblocks').addEventListener('change', e => {
  const m = state.ui.mirror, t = e.target, k = t.dataset.mz || t.dataset.mon, b = m.blocks.find(x => x.k === k);
  if (!b) return;
  if (t.dataset.mz && MZ[t.value]) b.z = t.value;
  if (t.dataset.mon) { b.on = t.checked; const s = t.closest('li').querySelector('.mz-sel'); if (s) s.disabled = !b.on; }
  m.preset = '';
  segSet($('#dr-mpreset'), '');
  commit();
  renderMirror();
});
sortable($('#dr-mblocks'), { item: '.sort-row', handle: '.sort-h', done: keys => {
  const m = state.ui.mirror;
  m.blocks = keys.map(k => m.blocks.find(b => b.k === k)).filter(Boolean);
  m.preset = '';
  segSet($('#dr-mpreset'), '');
  commit();
  renderMirror();
} });
$('#dr-msize').addEventListener('input', e => { state.ui.mirror.size = +e.target.value; setRange('#dr-msize', state.ui.mirror.size, 70, 140, `${state.ui.mirror.size} %`); renderMirror(); slideSave(); });
$('#dr-mdim-lvl').addEventListener('input', e => { state.ui.mirror.dim.lvl = +e.target.value; setRange('#dr-mdim-lvl', state.ui.mirror.dim.lvl, 15, 80, `${state.ui.mirror.dim.lvl} %`); slideSave(); });
$('#dr-msecs').addEventListener('change', e => { state.ui.mirror.secs = e.target.checked; commit(); renderMirror(); });
$('#dr-mshift').addEventListener('change', e => { state.ui.mirror.shift = e.target.checked; commit(); });
$('#dr-mdim').addEventListener('change', e => { state.ui.mirror.dim.on = e.target.checked; commit(); renderMirrorSec(); });
for (const [sel, key] of [['#dr-mdim-from', 'from'], ['#dr-mdim-to', 'to']]) {
  $(sel).addEventListener('change', e => { if (validHm(e.target.value)) { state.ui.mirror.dim[key] = e.target.value; commit(); } });
}
$('#dr-cd-list').addEventListener('click', e => {
  const del = e.target.closest('[data-cddel]');
  if (del) {
    const i = state.ui.countdowns.findIndex(c => c.id === del.dataset.cddel);
    if (i < 0) return;
    const [removed] = state.ui.countdowns.splice(i, 1);
    const pos = state.ui.order.indexOf('cd:' + removed.id);
    state.ui.order = normOrder(state.ui.order, state.ui.countdowns);
    if (editingCd === removed.id) resetCdForm();
    commit();
    renderCdList();
    renderTilesSec();
    toast(`„${removed.name}“ gelöscht`, () => {
      state.ui.countdowns.splice(Math.min(i, state.ui.countdowns.length), 0, removed);
      if (pos >= 0) state.ui.order.splice(Math.min(pos, state.ui.order.length), 0, 'cd:' + removed.id);
      state.ui.order = normOrder(state.ui.order, state.ui.countdowns);
      commit(); renderCdList(); renderTilesSec();
    });
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
  state.ui.order = normOrder(state.ui.order, state.ui.countdowns);
  resetCdForm();
  commit();
  renderCdList();
  renderTilesSec();
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
