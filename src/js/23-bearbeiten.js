/* Bearbeiten: Seiten anlegen, umbenennen, sortieren, löschen. Widgets hinzufügen, verschieben, Breite, Einstellungen. */
const edit = { on: false };
function setEdit(on) {
  if (edit.on === on) return;
  edit.on = on;
  if (!on) flushPageName();
  $('#edit-btn').setAttribute('aria-pressed', String(on));
  $('#edit-btn-txt').textContent = on ? 'Fertig' : 'Bearbeiten';
  $('#editbar').hidden = !on;
  syncBoard();
  renderEditBar();
  schedLayout();
}
$('#edit-btn').addEventListener('click', () => setEdit(!edit.on));
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && edit.on && !dr.open && !document.querySelector('dialog[open]')) { e.preventDefault(); setEdit(false); }
});

function renderEditBar() {
  if (!edit.on) return;
  const p = curPage(), i = state.pages.indexOf(p), n = $('#eb-name');
  if (document.activeElement !== n) n.value = p.name;
  $('#eb-left').disabled = i <= 0;
  $('#eb-right').disabled = i >= state.pages.length - 1;
  $('#eb-tiles').checked = p.tiles;
  $('#eb-del').disabled = state.pages.length <= 1;
  $('#eb-del').title = state.pages.length <= 1 ? 'Die letzte Seite bleibt' : '';
  $('#eb-add').disabled = state.pages.length >= 12;
}

/* Überlagerung auf jeder Karte im Bearbeiten-Modus */
function renderOverlays() {
  const page = curPage();
  for (const v of views.values()) {
    let ov = v.el.querySelector(':scope > .ed-ov');
    const idx = page.items.findIndex(x => x.w === v.id);
    const on = edit.on && idx >= 0 && !v.el.hidden && !!state.widgets[v.id];
    for (const c of v.el.children) if (c !== ov) c.inert = on;
    if (!on) { if (ov) ov.remove(); continue; }
    if (!ov) { ov = document.createElement('div'); ov.className = 'ed-ov'; v.el.appendChild(ov); }
    const it = page.items[idx], w = state.widgets[v.id], T = TYPES[w.type];
    const others = pagesUsing(v.id).filter(p => p.id !== page.id).map(p => p.name);
    const label = widgetLabel(v.id);
    ov.innerHTML = `<div class="ed-box"><span class="ed-ico">${TICON[w.type]}</span><p class="ed-type">${esc(T.name)}</p>${label !== T.name ? `<p class="ed-title">${esc(label)}</p>` : ''}<p class="ed-also">${others.length ? `Auch auf: ${esc(others.join(', '))}` : 'Nur auf dieser Seite'}</p>`
      + `<div class="ed-tools"><button type="button" class="icon-btn" data-ed="prev" aria-label="${esc(label)} nach vorne" title="Nach vorne"${idx === 0 ? ' disabled' : ''}>${LEFT}</button>`
      + `<div class="seg sm" role="group" aria-label="Breite von ${esc(label)}">${[1, 2, 3].map(k => `<button type="button" data-ed="span" data-v="${k}" aria-pressed="${it.s === k}" title="${k} ${k === 1 ? 'Spalte' : 'Spalten'} breit">${k}×</button>`).join('')}</div>`
      + `<button type="button" class="icon-btn" data-ed="next" aria-label="${esc(label)} nach hinten" title="Nach hinten"${idx === page.items.length - 1 ? ' disabled' : ''}>${RIGHT}</button></div>`
      + `<div class="ed-tools"><button type="button" class="btn-ghost" data-ed="conf">Einstellungen</button><button type="button" class="btn-ghost" data-ed="rm">Von der Seite nehmen</button></div></div>`;
  }
}
function refocus(id, sel) {
  const card = $(`#board [data-wid="${id}"]`);
  if (!card) return;
  const el = card.querySelector(sel);
  if (el && !el.disabled) el.focus();
  else { const alt = card.querySelector('[data-ed="prev"]:not([disabled]),[data-ed="next"]:not([disabled])'); if (alt) alt.focus(); }
}
$('#board').addEventListener('click', e => {
  const b = e.target.closest('[data-ed]');
  if (!b || !edit.on) return;
  const card = b.closest('[data-wid]');
  if (!card) return;
  const id = card.dataset.wid, page = curPage(), i = page.items.findIndex(x => x.w === id);
  if (i < 0) return;
  const act = b.dataset.ed;
  if (act === 'prev' || act === 'next') {
    const j = i + (act === 'prev' ? -1 : 1);
    if (j < 0 || j >= page.items.length) return;
    [page.items[i], page.items[j]] = [page.items[j], page.items[i]];
    commit();
    refocus(id, `[data-ed="${act}"]`);
  } else if (act === 'span') {
    page.items[i].s = +b.dataset.v;
    commit();
    refocus(id, `[data-ed="span"][data-v="${b.dataset.v}"]`);
  } else if (act === 'conf') openWidgetDialog(id);
  else if (act === 'rm') removeFromPage(id);
});
function removeFromPage(id) {
  const page = curPage(), i = page.items.findIndex(x => x.w === id);
  if (i < 0) return;
  const label = widgetLabel(id);
  const [it] = page.items.splice(i, 1);
  commit();
  const gone = !pagesUsing(id).length;
  toast(gone ? `„${label}“ weggenommen, liegt jetzt unter „Widget hinzufügen“` : `„${label}“ von dieser Seite genommen`, () => {
    const p = pageById(page.id);
    if (!p || !state.widgets[id] || p.items.some(x => x.w === id)) return;
    p.items.splice(Math.min(i, p.items.length), 0, it);
    commit();
  });
}

/* Seite: Name, Reihenfolge, Kacheln, neu, löschen */
let nameTimer = null;
function flushPageName() { if (nameTimer) { clearTimeout(nameTimer); nameTimer = null; commit(); } }
$('#eb-name').addEventListener('input', e => {
  const p = curPage(), val = e.target.value.trim().slice(0, 24);
  if (!val) return;
  p.name = val;
  const tab = $(`#tabs [data-page="${p.id}"]`);
  if (tab) tab.textContent = val;
  clearTimeout(nameTimer);
  nameTimer = setTimeout(() => { nameTimer = null; commit(); }, 500);
});
$('#eb-name').addEventListener('blur', e => { if (!e.target.value.trim()) e.target.value = curPage().name; flushPageName(); });
$('#eb-name').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); } });
function movePage(d) {
  const i = state.pages.indexOf(curPage()), j = i + d;
  if (j < 0 || j >= state.pages.length) return;
  [state.pages[i], state.pages[j]] = [state.pages[j], state.pages[i]];
  commit();
  const b = $(d < 0 ? '#eb-left' : '#eb-right');
  (b.disabled ? $(d < 0 ? '#eb-right' : '#eb-left') : b).focus();
}
$('#eb-left').addEventListener('click', () => movePage(-1));
$('#eb-right').addEventListener('click', () => movePage(1));
$('#eb-tiles').addEventListener('change', e => { curPage().tiles = e.target.checked; commit(); });
$('#eb-add').addEventListener('click', () => {
  if (state.pages.length >= 12) return;
  let name = 'Neue Seite', k = 2, id;
  while (state.pages.some(p => p.name === name)) name = `Neue Seite ${k++}`;
  do id = 'p' + uid(); while (pageById(id));
  state.pages.push({ id, name, tiles: true, items: [] });
  state.page = id;
  commit();
  layoutNow();
  const n = $('#eb-name');
  n.focus();
  n.select();
});
$('#eb-del').addEventListener('click', () => {
  if (state.pages.length <= 1) return;
  const i = state.pages.indexOf(curPage());
  const [removed] = state.pages.splice(i, 1);
  state.page = state.pages[Math.max(0, i - 1)].id;
  commit();
  layoutNow();
  toast(`Seite „${removed.name}“ gelöscht`, () => {
    if (pageById(removed.id)) return;
    removed.items = removed.items.filter(x => state.widgets[x.w]);
    state.pages.splice(Math.min(i, state.pages.length), 0, removed);
    state.page = removed.id;
    commit();
    layoutNow();
  });
});

/* Galerie: neues Widget anlegen oder ein vorhandenes auf diese Seite holen */
function newCfg(type) {
  if (type === 'tasks') {
    const p = curPage(), known = tk.projList ? tk.projList.map(x => String(x.name || '').trim()) : [];
    const hit = known.find(n => n.toLowerCase() === p.name.toLowerCase());
    return { projects: hit ? [hit] : ['arbeit', 'privat'].includes(slug(p.name)) ? [p.name] : ['Arbeit', 'Privat'] };
  }
  if (type === 'progress') return { bars: [{ id: uid(), kind: 'month', name: 'Monat' }, { id: uid(), kind: 'year', name: 'Jahr' }] };
  return {};
}
function openGallery() {
  const page = curPage(), body = $('#gal-body');
  body.textContent = '';
  const ul = document.createElement('ul');
  ul.className = 'gal';
  for (const [type, T] of Object.entries(TYPES)) {
    let act;
    if (!T.multi) {
      act = page.items.some(x => x.w === type)
        ? '<button type="button" class="btn-ghost" disabled>Ist schon auf dieser Seite</button>'
        : `<button type="button" class="btn" data-gadd="${type}">Hinzufügen</button>`;
    } else {
      act = `<button type="button" class="btn" data-gnew="${type}">Neu anlegen</button>`;
      for (const [id] of widgetsOf(type)) {
        if (page.items.some(x => x.w === id)) continue;
        const where = pagesUsing(id).map(p => p.name);
        act += `<button type="button" class="btn-ghost" data-gadd="${esc(id)}" title="${esc(where.length ? `Liegt auf: ${where.join(', ')}` : 'Liegt gerade auf keiner Seite')}">„${esc(widgetLabel(id))}“ einfügen</button>`;
      }
    }
    const li = document.createElement('li');
    li.className = 'gal-item';
    li.innerHTML = `<span class="gal-ico">${TICON[type]}</span><p class="gal-name">${esc(T.name)}${T.since === VERSION ? ' <span class="chip">Neu</span>' : ''}</p><p class="gal-desc">${esc(T.desc)}</p><div class="gal-act">${act}</div>`;
    ul.appendChild(li);
  }
  body.appendChild(ul);
  if (!SOON.length) { $('#dlg-gallery').showModal(); return; }
  const sub = document.createElement('p');
  sub.className = 'gal-sub';
  sub.textContent = 'Kommt demnächst';
  body.appendChild(sub);
  const soon = document.createElement('div');
  soon.className = 'soon';
  soon.innerHTML = SOON.map(([k, n]) => `<span>${TICON[k]}${esc(n)}</span>`).join('');
  body.appendChild(soon);
  $('#dlg-gallery').showModal();
}
function placeWidget(id) {
  const page = curPage(), w = state.widgets[id];
  if (!w || page.items.some(x => x.w === id)) return;
  page.items.push({ w: id, s: TYPES[w.type].w });
  if ($('#dlg-gallery').open) $('#dlg-gallery').close();
  commit();
  const v = views.get(id);
  if (!v) return;
  v.el.classList.remove('flash');
  void v.el.offsetWidth;
  v.el.classList.add('flash');
  setTimeout(() => v.el.scrollIntoView({ block: 'nearest', behavior: reduceMotion ? 'auto' : 'smooth' }), 120);
}
$('#gal-body').addEventListener('click', e => {
  const n = e.target.closest('[data-gnew]'), a = e.target.closest('[data-gadd]');
  if (n) {
    const type = n.dataset.gnew;
    const id = newWidget(type, newCfg(type));
    placeWidget(id);
    if (type === 'tasks' || type === 'dep') openWidgetDialog(id);
  } else if (a) placeWidget(a.dataset.gadd);
});
$('#add-tile').addEventListener('click', openGallery);
$('#page-empty-add').addEventListener('click', openGallery);

/* Einstellungen eines Widgets */
const wd = { id: null };
function openWidgetDialog(id) {
  const w = state.widgets[id];
  if (!w) return;
  const T = TYPES[w.type], S = WT[w.type] && WT[w.type].settings;
  wd.id = id;
  $('#wd-h').textContent = `${T.name} einstellen`;
  $('#wd-title').value = w.title;
  $('#wd-title').placeholder = T.name;
  const box = $('#wd-extra');
  box.textContent = '';
  if (S) S.render(box, w);
  box.hidden = !S;
  const used = pagesUsing(id).map(p => p.name);
  $('#wd-used').textContent = !used.length ? 'Liegt gerade auf keiner Seite.'
    : `Liegt auf: ${used.join(', ')}.${used.length > 1 ? ' Änderungen gelten überall, wo es liegt.' : ''}`;
  $('#wd-err').hidden = true;
  $('#wd-del').hidden = !T.multi;
  $('#dlg-widget').showModal();
}
$('#wd-form').addEventListener('submit', e => {
  e.preventDefault();
  const w = state.widgets[wd.id];
  if (!w) { $('#dlg-widget').close(); return; }
  const S = WT[w.type] && WT[w.type].settings;
  const draft = JSON.parse(JSON.stringify(w));
  const err = S ? S.save($('#wd-extra'), draft) : null;
  if (err) { $('#wd-err').textContent = err; $('#wd-err').hidden = false; return; }
  let title = $('#wd-title').value.trim().slice(0, 30);
  if (title === TYPES[w.type].name) title = '';
  state.widgets[wd.id] = { type: w.type, title, cfg: normCfg(w.type, draft.cfg) };
  $('#dlg-widget').close();
  commit();
});
$('#wd-del').addEventListener('click', () => {
  const id = wd.id, w = state.widgets[id];
  if (!w || !TYPES[w.type].multi) return;
  const label = widgetLabel(id), snap = state.pages.map(p => ({ id: p.id, items: p.items.slice() }));
  delete state.widgets[id];
  for (const p of state.pages) p.items = p.items.filter(x => x.w !== id);
  $('#dlg-widget').close();
  commit();
  toast(`„${label}“ gelöscht`, () => {
    if (state.widgets[id]) return;
    state.widgets[id] = w;
    for (const sp of snap) { const p = pageById(sp.id); if (p) p.items = sp.items.filter(x => state.widgets[x.w]); }
    commit();
  });
});
for (const d of $$('dialog.dlg')) {
  d.addEventListener('click', e => { if (e.target === d) d.close(); });
  for (const b of d.querySelectorAll('[data-close]')) b.addEventListener('click', () => d.close());
}
