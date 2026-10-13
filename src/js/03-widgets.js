/* Widgets und Seiten: Jede Widget-ID bekommt genau eine Karte im Raster. Karten von anderen Seiten
 * bleiben im Dokument, sind aber versteckt. So laufen Karten, Timer und Daten beim Seitenwechsel einfach weiter.
 * Pendeln, Wetter und Urlaub stehen fest im HTML, alle anderen werden aus <template id="tpl-typ"> geklont. */
const WT = {};            // Verhalten je Typ: mount(view), render(view), settings
const views = new Map();  // Widget-ID -> { id, type, el, q }
function defineWidget(type, def) { WT[type] = def; }
const curPage = () => state.pages.find(p => p.id === state.page) || state.pages[0];
const pageById = id => state.pages.find(p => p.id === id) || null;
const widgetTitle = id => { const w = state.widgets[id]; return w ? (w.title || TYPES[w.type].name) : ''; };
const pagesUsing = id => state.pages.filter(p => p.items.some(it => it.w === id));
let cardRO = null;

function ensureView(id) {
  const w = state.widgets[id];
  if (!w) return null;
  let v = views.get(id);
  if (v && v.type === w.type) return v;
  let el;
  if (!TYPES[w.type].multi) el = $('#' + w.type);
  else {
    el = $('#tpl-' + w.type).content.firstElementChild.cloneNode(true);
    el.hidden = true;
    $('#board').insertBefore(el, $('#add-tile'));
  }
  el.dataset.wid = id;
  v = { id, type: w.type, el, q: s => el.querySelector(s) };
  views.set(id, v);
  if (WT[w.type] && WT[w.type].mount) WT[w.type].mount(v);
  decorateCard(v);
  if (cardRO) cardRO.observe(el);
  return v;
}
function dropView(id) {
  const v = views.get(id);
  if (!v) return;
  views.delete(id);
  if (WT[v.type] && WT[v.type].unmount) WT[v.type].unmount(v);
  if (TYPES[v.type].multi) { if (cardRO) cardRO.unobserve(v.el); v.el.remove(); }
  else v.el.hidden = true;
}
const viewsOf = type => [...views.values()].filter(v => v.type === type && state.widgets[v.id]);
const widgetsOf = type => Object.entries(state.widgets).filter(([, w]) => w.type === type);

/* Raster an die aktuelle Seite anpassen: richtige Karten zeigen, Reihenfolge und Breite setzen */
function syncBoard() {
  const page = curPage(), board = $('#board'), add = $('#add-tile');
  for (const id of [...views.keys()]) if (!state.widgets[id]) dropView(id);
  const on = new Set(), list = [];
  // Seiten mit „nach Tageszeit ordnen“ zeigen ihre Karten je nach Uhrzeit anders sortiert, beim Bearbeiten in der eigenen Reihenfolge
  for (const it of page.smart && !edit.on ? smartOrder(page.items, new Date()) : page.items) {
    const v = ensureView(it.w);
    if (!v) continue;
    on.add(v.el);
    list.push(v.el);
    v.el.hidden = false;
    v.el.dataset.span = String(it.s);
  }
  // Karten nur umhängen, wenn die Reihenfolge wirklich nicht stimmt: Jedes Umhängen nimmt dem Feld, in dem du gerade tippst, den Fokus
  if (!inOrder(list, add)) {
    const a = document.activeElement, keep = a && a !== document.body && board.contains(a) ? a : null;
    const sel = keep ? [keep.selectionStart, keep.selectionEnd, keep.selectionDirection] : null;
    for (const el of list) board.insertBefore(el, add);
    if (keep && keep.isConnected && document.activeElement !== keep) {
      keep.focus({ preventScroll: true });
      try { if (sel[0] !== null && sel[0] !== undefined) keep.setSelectionRange(...sel); } catch { /* nicht jedes Feld kennt eine Auswahl */ }
    }
  }
  for (const el of board.children) if (el.classList.contains('card') && el.id !== 'add-tile' && !on.has(el)) el.hidden = true;
  $('#add-tile').hidden = !edit.on;
  $('#page-empty').hidden = page.items.length > 0 || edit.on;
  board.classList.toggle('editing', edit.on);
  board.setAttribute('aria-label', page.name);
  renderOverlays();
}
/* Stehen die Karten schon in dieser Reihenfolge vor dem Plus-Feld? */
const inOrder = (list, end) => list.every((el, i) => el.parentNode === end.parentNode && !!(el.compareDocumentPosition(list[i + 1] || end) & Node.DOCUMENT_POSITION_FOLLOWING));
/* Titel und Inhalt aller Widgets zeichnen */
function renderViews() {
  for (const v of views.values()) {
    const w = state.widgets[v.id];
    if (!w) continue;
    const t = v.q('[data-r="title"]');
    if (t) t.textContent = widgetTitle(v.id);
    if (TYPES[w.type].multi) v.el.setAttribute('aria-label', widgetTitle(v.id));
    if (WT[w.type] && WT[w.type].render) WT[w.type].render(v);
  }
  peekAll();
}
function newWidget(type, cfg, title) {
  let id;
  do id = 'w' + uid(); while (state.widgets[id]);
  state.widgets[id] = { type, title: title || '', cfg: normCfg(type, cfg) };
  return id;
}
/* Name fürs Bearbeiten und die Galerie: eigener Titel, bei Aufgaben sonst die Projekte */
function widgetLabel(id) {
  const w = state.widgets[id];
  if (!w) return '';
  if (w.title) return w.title;
  if (w.type === 'tasks') return `Aufgaben: ${w.cfg.projects.join(', ')}`;
  if (w.type === 'football') return FB_LEAGUES[w.cfg.league] + (w.cfg.teamName ? `, ${w.cfg.teamName}` : '');
  if (w.type === 'dep') return w.cfg.stop ? `Abfahrten: ${w.cfg.stop.name}` : 'Abfahrten';
  return TYPES[w.type].name;
}
