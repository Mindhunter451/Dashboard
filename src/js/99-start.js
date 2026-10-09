/* Takt und Start */
const VERSION = '2.4';
function tick() {
  const now = new Date();
  tickHeader(now);
  tickBars(now);
  tickTiles(now);
  autoTick(now);
  tickPomo(now);
  skyTick(now);
  vsTick(now);
  caTick(now);
  dpTick(now);
  bdTick(now);
  wsTick(now);
  mirrorTick(now);
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
  if (caSec().feeds.length && (!ca.data || Date.now() - ca.data.at > 15 * 6e4) && Date.now() - ca.last > 6e4) caLoad();
});
/* Nach einem Update einmal zeigen, was neu ist. Mit Knopf, der eine Fokus-Seite einrichtet. */
const NEWS = {
  '2.1': ['Neu: Pomodoro, Gewohnheiten und Lernfortschritt. Soll ich dir eine Fokus-Seite damit einrichten?', () => setupFocusPage()],
  '2.2': ['Neu: Fußball, Formel 1 und Spritpreise. Soll ich dir eine Sport-Seite mit dem HSV einrichten?', () => setupSportPage()],
  '2.3': ['Neu: Kalender, Vers des Tages, der Himmel oben und der Spiegel-Modus (Taste S). Die Gleitzeit ist raus. Soll ich Kalender und Vers auf deine erste Seite legen?', () => setupNews23()],
  '2.4': ['Neu: Abfahrten, Geburtstage und Müllabfuhr. Und das Cockpit lässt sich jetzt als App installieren. Soll ich die drei auf deine erste Seite legen?', () => setupNews24()]
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
/* 2.3: Vers und Kalender auf die erste Seite, das Gleitzeit-Widget gibt es nicht mehr */
function setupNews23() {
  const p = state.pages[0], add = ['cal', 'verse'].filter(w => !p.items.some(x => x.w === w));
  if (!add.length) { toast(`Kalender und Vers liegen schon auf „${p.name}“.`); return; }
  p.items.splice(Math.min(1, p.items.length), 0, ...add.map(w => ({ w, s: 1 })));
  if (state.page !== p.id) state.page = p.id;
  commit();
  layoutNow();
  toast(`Liegt jetzt auf „${p.name}“. Den Kalender richtest du direkt im Widget ein.`);
}
/* 2.4: Abfahrten, Geburtstage und Müllabfuhr auf die erste Seite. Abfahrten fragen gleich nach der Haltestelle. */
function setupNews24() {
  const p = state.pages[0];
  let dep = widgetsOf('dep').map(([id]) => id).find(id => p.items.some(x => x.w === id));
  const fresh = !dep;
  if (fresh) dep = newWidget('dep', {});
  const add = [dep, 'bday', 'waste'].filter(w => !p.items.some(x => x.w === w));
  if (!add.length) { toast(`Die drei liegen schon auf „${p.name}“.`); return; }
  p.items.splice(Math.min(1, p.items.length), 0, ...add.map(w => ({ w, s: 1 })));
  if (state.page !== p.id) state.page = p.id;
  commit();
  layoutNow();
  if (fresh) openWidgetDialog(dep);
  else toast(`Liegt jetzt auf „${p.name}“. Geburtstage und Müllabfuhr richtest du direkt in der Karte ein.`);
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
  state.page = id;
  commit();
  layoutNow();
  toast(`Seite „${name}“ ist fertig.`);
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
if (mirrorFromHash()) mirrorOpen(false);
setInterval(tick, 1000);
startWeather();
loadCommute();
initTasks();
if (caSec().feeds.length) caLoad();
