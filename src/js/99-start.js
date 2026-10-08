/* Takt und Start */
const VERSION = '2.0';
function tick() {
  const now = new Date();
  tickHeader(now);
  tickBars(now);
  tickTiles(now);
  autoTick(now);
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
setInterval(tick, 1000);
startWeather();
loadCommute();
initTasks();
