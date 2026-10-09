/* Seiten: Tabs, Wechsel per Klick, Pfeiltasten, Zahlentasten 1 bis 9 oder über die Adresse (…/#arbeit).
 * Startseite: zuletzt geöffnet, immer dieselbe oder automatisch nach Arbeitszeit. */
const pg = { manualAt: 0, autoWant: undefined, minute: -1, hiddenAt: 0 };
const pageSlug = p => slug(p.name) || p.id;
function pageFromHash() {
  let h = '';
  try { h = decodeURIComponent(location.hash.slice(1)); } catch { h = ''; }
  h = slug(h);
  return h ? state.pages.find(p => pageSlug(p) === h || p.id === h) || null : null;
}
function renderTabs() {
  const nav = $('#tabs'), cur = curPage();
  const had = nav.contains(document.activeElement);
  nav.textContent = '';
  state.pages.forEach((p, i) => {
    const b = document.createElement('button');
    const sel = p.id === cur.id;
    b.type = 'button';
    b.className = 'tab';
    b.setAttribute('role', 'tab');
    b.setAttribute('aria-selected', String(sel));
    b.tabIndex = sel ? 0 : -1;
    b.dataset.page = p.id;
    b.textContent = p.name;
    if (i < 9) b.title = `${p.name} (Taste ${i + 1})`;
    nav.appendChild(b);
  });
  const act = nav.querySelector('[aria-selected="true"]');
  if (act && had) act.focus();
  if (act && nav.scrollWidth > nav.clientWidth) nav.scrollLeft = Math.max(0, act.offsetLeft - 24);
  // Dieselben Seiten in der Mini-Leiste oben
  const mb = $('#mb-tabs');
  mb.innerHTML = state.pages.map(p => `<button type="button" class="tab" data-page="${esc(p.id)}"${p.id === cur.id ? ' aria-current="page"' : ''}>${esc(p.name)}</button>`).join('');
  const ma = mb.querySelector('[aria-current]');
  if (ma && mb.scrollWidth > mb.clientWidth) mb.scrollLeft = Math.max(0, ma.offsetLeft - 24);
}
/* Mini-Leiste: taucht auf, sobald die Seiten-Tabs oben aus dem Bild sind */
function setMinibar(on) {
  const m = $('#minibar');
  if (m.classList.contains('on') === on) return;
  m.classList.toggle('on', on);
  m.inert = !on;
  m.setAttribute('aria-hidden', String(!on));
}
if (typeof IntersectionObserver === 'function') new IntersectionObserver(es => { for (const e of es) setMinibar(!e.isIntersecting && e.boundingClientRect.top < 0); }).observe($('#tabs'));
$('#mb-tabs').addEventListener('click', e => {
  const b = e.target.closest('[data-page]');
  if (!b) return;
  const y = $('.wrap').getBoundingClientRect().top + scrollY - 6;
  showPage(b.dataset.page, 'user');
  if (scrollY > y) scrollTo({ top: y, behavior: 'instant' });
});
$('#mb-up').addEventListener('click', () => scrollTo({ top: 0, behavior: reduceMotion ? 'instant' : 'smooth' }));
function showPage(id, how) {
  const p = pageById(id);
  if (!p) return;
  if (how === 'user') {
    pg.manualAt = Date.now();
    if (location.hash) history.replaceState(null, '', location.pathname + location.search);
  }
  if (state.page === p.id) return;
  state.page = p.id;
  persist();
  renderAll();
  layoutNow();
  cardsIn();
}
$('#tabs').addEventListener('click', e => { const b = e.target.closest('[data-page]'); if (b) showPage(b.dataset.page, 'user'); });
$('#tabs').addEventListener('keydown', e => {
  const n = state.pages.length, i = state.pages.indexOf(curPage());
  const j = e.key === 'ArrowRight' ? (i + 1) % n : e.key === 'ArrowLeft' ? (i - 1 + n) % n : e.key === 'Home' ? 0 : e.key === 'End' ? n - 1 : -1;
  if (j < 0) return;
  e.preventDefault();
  showPage(state.pages[j].id, 'user');
  const t = $(`#tabs [data-page="${state.pages[j].id}"]`);
  if (t) t.focus();
});
document.addEventListener('keydown', e => {
  if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || !/^[1-9]$/.test(e.key)) return;
  if (dr.open || document.querySelector('dialog[open]')) return;
  const t = e.target;
  if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
  const p = state.pages[+e.key - 1];
  if (p) { e.preventDefault(); showPage(p.id, 'user'); }
});
addEventListener('hashchange', () => { const p = pageFromHash(); if (p) showPage(p.id, 'hash'); });

/* Startseite */
function startTargets() {
  const st = state.ui.start, bySlug = s => state.pages.find(p => pageSlug(p) === s);
  const work = pageById(st.work) || bySlug('arbeit') || state.pages[0];
  const free = pageById(st.free) || bySlug('privat') || state.pages.find(p => p !== work) || state.pages[0];
  return { work, free };
}
/* Arbeitszeit aus dem Arbeitstag-Balken, ab einer Stunde vor Beginn. Feiertage und Urlaub zählen als frei. */
function isWorkTime(now) {
  const wb = workBar();
  if (!wb || freeReason(wb, now)) return false;
  const s = at(now, wb.start).getTime() - 36e5, e = at(now, wb.end).getTime();
  return now >= s && now < e;
}
function autoPage(now) {
  if (state.ui.start.mode !== 'auto') return null;
  const t = startTargets();
  return (isWorkTime(now) ? t.work : t.free).id;
}
function startPageId() {
  const h = pageFromHash();
  if (h) return h.id;
  const st = state.ui.start;
  if (st.mode === 'fixed' && pageById(st.page)) return st.page;
  if (st.mode === 'auto') return autoPage(new Date());
  return curPage().id;
}
/* Einmal pro Minute: Arbeitszeit vorbei oder angefangen? Dann Seite wechseln, außer du hast gerade selbst gewechselt. */
function autoTick(now) {
  const mk = Math.floor(now.getTime() / 6e4);
  if (mk === pg.minute) return;
  pg.minute = mk;
  const want = autoPage(now), prev = pg.autoWant;
  pg.autoWant = want;
  if (!want || prev === undefined || prev === want || want === state.page) return;
  if (edit.on || dr.open || document.querySelector('dialog[open]') || document.visibilityState !== 'visible') return;
  if (Date.now() - pg.manualAt < 30 * 6e4) return;
  showPage(want, 'auto');
  toast(`Automatisch zu „${pageById(want).name}“ gewechselt`);
}
