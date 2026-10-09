/* Karten: einheitlicher Kopf (Symbol, Titel, Status links, Knöpfe rechts), Ebenen, Einklappen mit Kurzinfo,
 * Platzhalter beim Laden und der kurze Auftritt beim Seitenwechsel.
 * Eingeklappte Karten merkt sich jedes Gerät selbst (jere-cockpit-zu), aufs Handy passt eben weniger als auf den großen Schirm. */
const ZU_KEY = 'jere-cockpit-zu';
const zu = new Set((Array.isArray(lsGet(ZU_KEY)) ? lsGet(ZU_KEY) : []).map(String));
const narrowMq = matchMedia('(max-width: 720px)');
const isNarrow = () => narrowMq.matches;
/* Wichtige Karten schweben etwas höher, ruhige liegen flach */
const TIER = { weather: 'hero', dep: 'hero', cal: 'hero', commute: 'hero', links: 'quiet', notes: 'quiet', verse: 'quiet' };
const CHEV = '<svg class="card-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';

/* Aus dem Titel wird ein Knopf zum Einklappen, davor das Symbol des Widgets, dahinter Platz für die Kurzinfo */
function decorateCard(v) {
  const tier = TIER[v.type];
  if (tier) v.el.dataset.tier = tier; else delete v.el.dataset.tier;
  const head = v.el.querySelector(':scope > .card-head'), h2 = head && head.querySelector(':scope > h2');
  if (!h2 || h2.querySelector('.card-tg')) { applyCollapsed(v); return; }
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'card-tg';
  b.innerHTML = `<span class="card-ico">${TICON[v.type] || ''}</span>`;
  const tt = document.createElement('span');
  tt.className = 'card-tt';
  while (h2.firstChild) tt.appendChild(h2.firstChild);
  b.appendChild(tt);
  b.insertAdjacentHTML('beforeend', CHEV);
  h2.appendChild(b);
  const peek = document.createElement('span');
  peek.className = 'card-peek';
  h2.after(peek);
  applyCollapsed(v);
}
function applyCollapsed(v) {
  const on = zu.has(v.id), b = v.el.querySelector('.card-tg');
  v.el.classList.toggle('is-collapsed', on);
  if (b) { b.setAttribute('aria-expanded', String(!on)); b.title = on ? 'Aufklappen' : 'Einklappen'; }
  if (on) peekCard(v);
}
function setCollapsed(v, on) {
  if (on) zu.add(v.id); else zu.delete(v.id);
  for (const id of [...zu]) if (!state.widgets[id]) zu.delete(id);
  lsSet(ZU_KEY, [...zu]);
  applyCollapsed(v);
  // Beim Aufklappen frisch zeichnen, Minuten und Zeiten könnten inzwischen anders sein
  if (!on && WT[v.type] && WT[v.type].render) WT[v.type].render(v);
  if (!on && v.type === 'progress') tickBars(new Date());
  if (v.type === 'weather') renderRadarTg();
  schedLayout();
}
$('#board').addEventListener('click', e => {
  const b = e.target.closest('.card-tg');
  if (!b || edit.on) return;
  const card = b.closest('[data-wid]'), v = card && views.get(card.dataset.wid);
  if (v) setCollapsed(v, !zu.has(v.id));
});

/* Kurzinfo für eingeklappte Karten. Gibt HTML zurück, Texte immer durch esc(). */
const PEEK = {
  weather() {
    const c = wx.data && wx.data.current;
    if (!c || !Number.isFinite(c.temperature_2m)) return '';
    return `${Math.round(c.temperature_2m)}° <small>${esc((WMO[c.weather_code] || [''])[0])}</small>`;
  },
  dep(v) {
    const c = state.widgets[v.id].cfg, D = c.stop && dp.data[c.stop.id];
    if (!D) return '';
    const now = Date.now(), r = dpRows(D, c, now).find(x => !x.x);
    if (!r) return '<small>Gerade keine Abfahrt</small>';
    if (c.walk) { const m = Math.floor((r.t - c.walk * 6e4 - now) / 6e4); return `${m < 1 ? 'Jetzt los' : `Los in ${m} Min`} ${dpBadge(r)}`; }
    const m = Math.floor((r.t - now) / 6e4);
    return `${dpBadge(r)} ${m < 1 ? 'jetzt' : m < 60 ? `in ${m} Min` : hm(new Date(r.t))}`;
  },
  cal() {
    if (!caSec().feeds.length || !ca.data) return '';
    const n = caNext(new Date());
    return n ? `${esc(n.label)} <small>${esc(n.sub)}</small>` : '<small>Die nächsten 24 Std frei</small>';
  },
  tasks(v) {
    if (!tdToken()) return '';
    let open = 0, today = 0, any = false;
    for (const p of state.widgets[v.id].cfg.projects) {
      const list = tk.tasks[p.toLowerCase()];
      if (!list) continue;
      any = true;
      for (const t of list) if (t && !t.checked) { open++; const d = dueInfo(t); if (d && d.s !== 'later') today++; }
    }
    return any ? `${open} offen${today ? ` <small>${today} heute</small>` : ''}` : '';
  },
  bday() {
    const now = new Date(), x = bdUpcoming(now)[0];
    return x ? `${esc(x.name)} <small>${esc(bdWhen(dayDiff(sod(now), x.d)))}</small>` : '';
  },
  waste() {
    const now = new Date(), up = wsUpcoming(state.waste.bins, now);
    if (!up.length) return '';
    const d = up[0].next;
    return `${esc(wsNames(up.filter(x => +x.next === +d).map(x => x.b)))} <small>${esc(wsDay(d, sod(now)))}</small>`;
  },
  vacation: () => `${esc($('#vac-free').textContent)} <small>Tage frei</small>`,
  progress(v) {
    const r = v.refs && [...v.refs.values()][0];
    return r ? `${esc(r.b.name)} <small>${esc(r.pct.textContent)}</small>` : '';
  },
  commute: () => ($('#cm-live').hidden ? '' : `${esc($('#cm-time').textContent)} <small>${esc($('#cm-time-lbl').textContent)}</small>`),
  verse: () => ($('#vs-ref').hidden ? '' : `<small>${esc($('#vs-ref').textContent)}</small>`),
  notes(v) {
    const line = (state.widgets[v.id].cfg.text || '').split('\n').map(s => s.trim()).find(Boolean);
    return line ? `<small>${esc(line.slice(0, 60))}</small>` : '';
  },
  links(v) { const n = state.widgets[v.id].cfg.items.length; return n ? `<small>${n} ${n === 1 ? 'Link' : 'Links'}</small>` : ''; },
  pomodoro: () => (po.running ? `${esc(PO_NAME[po.mode])} <small>${esc($('#po-time').textContent)}</small>` : ''),
  habits(v) {
    const items = state.widgets[v.id].cfg.items, today = ymd(new Date());
    return items.length ? `${items.filter(h => h.log.includes(today)).length} von ${items.length} <small>heute</small>` : '';
  },
  learn(v) { const h = v.q('[data-r="hero"]'); return h && !h.hidden ? `${esc(v.q('[data-r="days"]').textContent)} <small>${esc(v.q('[data-r="days-lbl"]').textContent)}</small>` : ''; },
  football(v) { const t = v.q('[data-r="md"]').textContent; return t ? `<small>${esc(t)}</small>` : ''; },
  f1() { const t = $('#f1-round').textContent; return t ? `<small>${esc(t)}</small>` : ''; }
};
function peekCard(v) {
  const el = v.el.querySelector(':scope > .card-head > .card-peek');
  if (!el || !zu.has(v.id) || !state.widgets[v.id]) return;
  let html = '';
  try { html = PEEK[v.type] ? PEEK[v.type](v) || '' : ''; } catch { html = ''; }
  if (el.dataset.h !== html) { el.dataset.h = html; el.innerHTML = html; }
}
function peekAll() { for (const v of views.values()) if (!v.el.hidden && zu.has(v.id)) peekCard(v); }

/* Platzhalter-Zeilen für Listen, solange Daten unterwegs sind */
const skelRows = (n, label) => `<li class="vh">${esc(label || 'Wird geladen')}</li>` + Array.from({ length: n }, (_, i) =>
  `<li class="sk-row" aria-hidden="true"><i class="sk-a"></i><span><i style="width:${[72, 56, 64, 48][i % 4]}%"></i><i class="s" style="width:${[36, 44, 30, 40][i % 4]}%"></i></span><i class="sk-b"></i></li>`).join('');
const skelLines = (n, label) => `<span class="sk-lines" role="img" aria-label="${esc(label || 'Wird geladen')}">${Array.from({ length: n }, (_, i) => `<i style="width:${i === n - 1 ? 58 : 100}%"></i>`).join('')}</span>`;

/* Seitenwechsel: Karten kommen von oben links nach unten rechts kurz nacheinander rein */
let cardsInTimer = 0;
function cardsIn() {
  if (reduceMotion) return;
  const board = $('#board');
  const cards = [...board.children].filter(el => el.classList.contains('card') && !el.hidden && el.id !== 'add-tile');
  cards.map(el => [el, el.getBoundingClientRect()]).sort((a, b) => (a[1].top - b[1].top) || (a[1].left - b[1].left))
    .forEach(([el], i) => el.style.setProperty('--i', String(Math.min(i, 12))));
  board.classList.remove('page-in');
  void board.offsetWidth;
  board.classList.add('page-in');
  clearTimeout(cardsInTimer);
  cardsInTimer = setTimeout(() => board.classList.remove('page-in'), 1000);
}
