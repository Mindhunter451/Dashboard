/* Takt und Start */
const VERSION = '2.2';
function tick() {
  const now = new Date();
  tickHeader(now);
  tickBars(now);
  tickTiles(now);
  autoTick(now);
  tickPomo(now);
  fxTick(now);
  f1Tick(now);
  if (ymd(now) !== vacDayKey) renderVacation();
  if (now.getMinutes() === 0 && now.getSeconds() === 0) checkBackup();
}
function renderAll() {
  applyUi();
  renderTabs();
  renderTiles();
  syncBoard();
  renderViews();
  renderEditBar();
  checkBackup();
  tick();
  schedLayout();
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') { pg.hiddenAt = Date.now(); return; }
  const away = pg.hiddenAt ? Date.now() - pg.hiddenAt : 0;
  tick();
  if (away > 30 * 6e4 && state.ui.start.mode === 'auto' && !edit.on && !dr.open && !document.querySelector('dialog[open]')) {
    const want = autoPage(new Date());
    if (want && want !== state.page) showPage(want, 'auto');
  }
  if (wx.live && Date.now() - wx.at > 10 * 6e4) loadWeather(wx.loc);
  if (cm.res && Date.now() - cm.res.at > 5 * 6e4) loadCommute();
  if (tdToken() && tkKeys().length && Date.now() - tk.stamp > 6e4) tdLoad();
});
/* Nach einem Update einmal zeigen, was neu ist. Mit Knopf, der eine Fokus-Seite einrichtet. */
const NEWS = {
  '2.1': ['Neu: Pomodoro, Gewohnheiten, Lernfortschritt und Gleitzeit. Soll ich dir eine Fokus-Seite damit einrichten?', () => setupFocusPage()],
  '2.2': ['Neu: Fußball, Formel 1 und Spritpreise. Soll ich dir eine Sport-Seite mit dem HSV einrichten?', () => setupSportPage()]
};
function announceNew() {
  if (state.meta.seen === VERSION) return;
  const known = state.edited, news = NEWS[VERSION];
  state.meta.seen = VERSION;
  persist();
  if (known && news) setTimeout(() => toast(news[0], news[1], { label: 'Einrichten', ms: 20000 }), 900);
}
function setupSportPage() {
  if (state.pages.length >= 12) return;
  const fb = newWidget('football', { league: 'bl1', team: 100, teamName: 'Hamburger SV' });
  let id;
  do id = 'p' + uid(); while (pageById(id));
  const name = state.pages.some(p => p.name === 'Sport') ? 'Sport 2' : 'Sport';
  state.pages.push({ id, name, tiles: false, items: [{ w: fb, s: 1 }, { w: 'f1', s: 1 }] });
  const work = state.pages.find(p => pageSlug(p) === 'arbeit');
  const addFuel = work && !work.items.some(x => x.w === 'fuel');
  if (addFuel) { const i = work.items.findIndex(x => x.w === 'commute'); work.items.splice(i >= 0 ? i + 1 : work.items.length, 0, { w: 'fuel', s: 1 }); }
  state.page = id;
  commit();
  layoutNow();
  toast(addFuel ? `Seite „${name}“ ist fertig, und die Spritpreise liegen auf „${work.name}“ neben dem Pendeln.` : `Seite „${name}“ ist fertig.`);
}
function setupFocusPage() {
  if (state.pages.length >= 12) return;
  const cd = state.ui.countdowns.find(c => /prüfung|pruefung|klausur|exam/i.test(c.name));
  const learn = newWidget('learn', { date: cd ? cd.date : '', time: cd ? cd.time : '' }, cd ? cd.name : '');
  const habits = newWidget('habits', {});
  let id;
  do id = 'p' + uid(); while (pageById(id));
  const name = state.pages.some(p => p.name === 'Fokus') ? 'Fokus 2' : 'Fokus';
  state.pages.push({ id, name, tiles: false, items: [{ w: 'pomodoro', s: 1 }, { w: learn, s: 1 }, { w: habits, s: 1 }] });
  const work = state.pages.find(p => pageSlug(p) === 'arbeit');
  const addFlex = work && !work.items.some(x => x.w === 'flex');
  if (addFlex) work.items.splice(Math.min(1, work.items.length), 0, { w: 'flex', s: 1 });
  state.page = id;
  commit();
  layoutNow();
  toast(addFlex ? `Seite „${name}“ ist fertig, und die Gleitzeit liegt jetzt auf „${work.name}“.` : `Seite „${name}“ ist fertig.`);
}
/* Änderungen aus einem anderen Tab übernehmen. Jeder Tab behält dabei seine eigene offene Seite. */
addEventListener('storage', e => {
  if (e.key !== LS_KEY || !e.newValue) return;
  let raw;
  try { raw = JSON.parse(e.newValue); } catch { return; }
  const old = state, page = state.page;
  state = normalize(raw);
  if (pageById(page)) state.page = page;
  renderAll();
  afterStateSwap(old);
  if (dr.open && !$('#drawer').contains(document.activeElement)) renderDrawer();
});

$('#foot-ver').textContent = `Version ${VERSION}`;
if (!lsOk) setSync('none');
for (const t of ['commute', 'weather', 'vacation']) ensureView(t);
state.page = startPageId() || state.page;
persist();
renderAll();
announceNew();
setInterval(tick, 1000);
startWeather();
loadCommute();
initTasks();
