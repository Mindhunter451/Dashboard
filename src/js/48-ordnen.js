/* Seiten neu ordnen: Aus den Standardseiten (Übersicht, Arbeit, Privat, Fokus, Sport) werden Heute, Arbeit, Privat,
 * Fokus und Sport. „Heute“ hat „Jetzt wichtig“ ganz oben und ordnet sich nach Tageszeit.
 * Eigene Seiten bleiben, wie sie sind. Widgets, die gerade auf keiner Standardseite liegen, holt der Plan nicht zurück,
 * denn was du weggeräumt hast, soll weg bleiben. Vorher wird der alte Stand gemerkt (jere-cockpit-seiten-vorher),
 * damit du ihn in „Anpassen“ zurückholen kannst. */
const PL_KEY = 'jere-cockpit-seiten-vorher';
const PL_STD = /^(uebersicht|home|start|heute|arbeit|privat|fokus|sport)(-\d+)?$/;
const PL_WORK = /arbeit|work|job|büro|buero|firma|dienst/i, PL_PRIV = /privat|private|zuhause|haushalt|einkauf|familie/i;

/* Kern: welche Widgets auf welche Seite kommen. used: Widget-IDs in bisheriger Reihenfolge, from: Seite (Slug), auf der
 * sie bisher lagen, span: bisherige Breite. Ein Widget darf auf mehreren Seiten liegen, es bleibt dasselbe. */
function planBuild(W, used, from, span) {
  const of = t => used.filter(id => W[id] && W[id].type === t);
  const one = t => of(t).slice(0, 1);
  const txt = id => `${W[id].title} ${(W[id].cfg.projects || []).join(' ')}`;
  const isWork = id => PL_WORK.test(txt(id)) || from[id] === 'arbeit';
  const isPriv = id => PL_PRIV.test(txt(id)) || from[id] === 'privat';
  const T = of('tasks');
  const tW = T.filter(id => isWork(id) && !isPriv(id)), tP = T.filter(id => isPriv(id) && !isWork(id));
  const main = T.find(id => !tW.includes(id) && !tP.includes(id)) || tW[0] || tP[0];
  const N = of('notes'), nW = N.filter(isWork), Lk = of('links'), lW = Lk.filter(isWork);
  const plan = [
    { key: 'heute', name: 'Heute', smart: true, tiles: true, ids: ['now', ...one('weather'), ...of('dep'), ...one('cal'), ...(main ? [main] : []), ...one('waste'), ...one('bday')] },
    { key: 'arbeit', name: 'Arbeit', tiles: true, ids: [...tW, ...one('commute'), ...one('fuel'), ...of('progress'), ...one('vacation'), ...nW, ...lW] },
    { key: 'privat', name: 'Privat', tiles: false, ids: [...tP, ...one('cal'), ...one('bday'), ...N.filter(id => !nW.includes(id)), ...Lk.filter(id => !lW.includes(id))] },
    { key: 'fokus', name: 'Fokus', tiles: false, ids: [...one('pomodoro'), ...of('learn'), ...of('habits')] },
    { key: 'sport', name: 'Sport', tiles: false, ids: [...of('football'), ...one('f1')] }
  ];
  // Was nirgends passt (zum Beispiel ein künftiger Widget-Typ), kommt ans Ende von „Heute“
  const placed = new Set(plan.flatMap(p => p.ids));
  plan[0].ids.push(...used.filter(id => !placed.has(id)));
  return plan.filter(p => p.key === 'heute' || p.ids.length).map(p => ({
    key: p.key, name: p.name, smart: !!p.smart, tiles: p.tiles,
    items: [...new Set(p.ids)].filter(id => W[id]).map(id => ({ w: id, s: id === 'now' ? 2 : span[id] || TYPES[W[id].type].w }))
  }));
}
const planIsStd = p => PL_STD.test(slug(p.name)) || PL_STD.test(p.id);
function pagePlan(s) {
  const stdP = s.pages.filter(planIsStd), own = s.pages.filter(p => !planIsStd(p));
  const used = [], from = {}, span = {};
  for (const p of stdP) for (const it of p.items) {
    if (!s.widgets[it.w] || it.w in span) continue;
    used.push(it.w);
    span[it.w] = it.s;
    from[it.w] = slug(p.name).replace(/-\d+$/, '');
  }
  // Seiten-IDs: Arbeit bleibt Arbeit, „Heute“ übernimmt die ID der Übersicht. So bleiben Lesezeichen wie …/#arbeit gültig.
  const taken = new Set(own.map(p => p.id));
  const pages = planBuild(s.widgets, used, from, span).map(pp => {
    const alias = pp.key === 'heute' ? ['heute', 'uebersicht', 'home', 'start'] : [pp.key];
    const old = stdP.find(p => alias.includes(slug(p.name).replace(/-\d+$/, '')) && !taken.has(p.id));
    let id = old ? old.id : pp.key;
    while (taken.has(id)) id = 'p' + uid();
    taken.add(id);
    return { id, name: pp.name, tiles: old ? old.tiles : pp.tiles, smart: pp.smart, items: pp.items, was: old ? old.name : '' };
  });
  const start = { ...s.ui.start }, H = pages[0], A = pages.find(p => p.name === 'Arbeit');
  if (start.mode === 'fixed') start.page = H.id;
  if (start.mode === 'auto') { start.free = H.id; if (A) start.work = A.id; }
  return { pages, own, start, page: H.id, gone: stdP.filter(p => !pages.some(q => q.id === p.id)) };
}
/* Neue Nutzer und „Alles zurücksetzen“: Heute, Arbeit und Privat mit den Grund-Widgets, ohne Fokus und Sport */
function planFresh(s) {
  const W = s.widgets;
  if (!Object.values(W).some(w => w.type === 'dep')) W.wdep = { type: 'dep', title: '', cfg: normCfg('dep', {}) };
  const used = ['tasks', 'tasks-arbeit', 'tasks-privat', 'weather', ...Object.keys(W).filter(id => W[id].type === 'dep'), 'cal', 'waste', 'bday', 'commute', 'progress', 'vacation', 'notes', 'notes-arbeit', 'links'].filter(id => W[id]);
  const from = { 'tasks-arbeit': 'arbeit', 'notes-arbeit': 'arbeit', 'tasks-privat': 'privat' };
  s.pages = planBuild(W, used, from, {}).map(p => ({ id: p.key, name: p.name, tiles: p.tiles, smart: p.smart, items: p.items }));
  s.page = s.pages[0].id;
  return s;
}

/* Vorschau im Dialog, erst „Übernehmen“ ändert etwas */
function openPlan() {
  const P = pagePlan(state), st = P.start;
  const chip = id => `<span class="pl-w">${TICON[state.widgets[id].type] || ''}${esc(widgetLabel(id))}</span>`;
  let html = '<p class="hint">So sehen deine Seiten danach aus. Alle Widgets behalten ihre Einstellungen und Daten. Was auf mehreren Seiten liegt, ist dasselbe Widget.</p><ol class="pl-list">';
  for (const p of [...P.pages, ...P.own]) {
    const own = P.own.includes(p);
    html += `<li${own ? ' class="own"' : ''}><p class="pl-name"><b>${esc(p.name)}</b>${p.smart ? '<span class="chip">nach Tageszeit</span>' : ''}${own ? '<small>bleibt, wie sie ist</small>' : p.was && p.was !== p.name ? `<small>statt „${esc(p.was)}“</small>` : ''}</p>`
      + `<p class="pl-ws">${p.items.length ? p.items.map(it => chip(it.w)).join('') : '<small>leer</small>'}</p></li>`;
  }
  html += '</ol>';
  const notes = [];
  const gone = P.gone.map(p => `„${p.name}“`);
  if (gone.length) notes.push(`${gone.join(', ').replace(/, ([^,]*)$/, ' und $1')} ${gone.length === 1 ? 'geht' : 'gehen'} in den neuen Seiten auf.`);
  if (st.mode === 'fixed') notes.push('Beim Öffnen startet das Cockpit mit „Heute“.');
  else if (st.mode === 'auto') notes.push('Beim Öffnen: während der Arbeitszeit „Arbeit“, sonst „Heute“.');
  notes.push('Danach kannst du es kurz rückgängig machen oder später in „Anpassen“ die alten Seiten zurückholen.');
  html += `<p class="hint">${esc(notes.join(' '))}</p>`;
  $('#pl-body').innerHTML = html;
  if (dr.open) closeDrawer();
  $('#dlg-plan').showModal();
  $('#pl-ok').focus();
}
function planSwap(next, msg, onUndo) {
  const prev = state;
  state = next;
  commit();
  afterStateSwap(prev);
  layoutNow();
  cardsIn();
  renderPlanBtns();
  toast(msg, () => {
    const cur = state;
    state = prev;
    commit();
    afterStateSwap(cur);
    layoutNow();
    if (onUndo) onUndo();
    renderPlanBtns();
  }, { ms: 20000 });
}
const planNext = (pages, page, start) => normalize(JSON.parse(JSON.stringify({ ...state, pages, page, ui: { ...state.ui, start } })));
function applyPlan() {
  const P = pagePlan(state), before = lsGet(PL_KEY);
  lsSet(PL_KEY, { at: new Date().toISOString(), pages: state.pages, page: state.page, start: state.ui.start });
  $('#dlg-plan').close();
  pg.manualAt = Date.now();
  planSwap(planNext([...P.pages, ...P.own].slice(0, 12), P.page, P.start), 'Seiten neu geordnet', () => { if (before) lsSet(PL_KEY, before); else lsDel(PL_KEY); });
}
function planBack() {
  const o = lsGet(PL_KEY);
  if (!o || !Array.isArray(o.pages)) return;
  lsDel(PL_KEY);
  if (dr.open) closeDrawer();
  planSwap(planNext(o.pages, o.page, o.start || state.ui.start), 'Alte Seiten sind zurück', () => lsSet(PL_KEY, o));
}
function lsDel(k) { try { localStorage.removeItem(k); } catch { /* egal */ } }
function renderPlanBtns() { const o = lsGet(PL_KEY); $('#dr-plan-back').hidden = !(o && Array.isArray(o.pages)); }
$('#dr-plan').addEventListener('click', openPlan);
$('#dr-plan-back').addEventListener('click', planBack);
$('#pl-ok').addEventListener('click', applyPlan);
