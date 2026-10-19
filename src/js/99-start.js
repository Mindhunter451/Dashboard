/* Takt und Start */
const VERSION = '3.7';
function tick() {
  const now = new Date();
  tickHeader(now);
  tickBars(now);
  tickTiles(now);
  autoTick(now);
  tickPomo(now);
  skyTick(now);
  caTick(now);
  dpTick(now);
  bdTick(now);
  wsTick(now);
  mirrorTick(now);
  f1Tick(now);
  wnTick(now);
  nwTick(now);
  if (now.getSeconds() % 10 === 3) peekAll();
  if (ymd(now) !== vacDayKey) renderVacation();
  if (now.getMinutes() === 0 && now.getSeconds() === 0) { checkBackup(); snapTake(); }
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
  renderMirror();
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
/* Nach einem Update einmal zeigen, was neu ist. Manche Hinweise haben einen Knopf (dritter Eintrag: seine Beschriftung). */
const NEWS = {
  '2.1': ['Neu: Pomodoro, Gewohnheiten und Lernfortschritt. Soll ich dir eine Fokus-Seite damit einrichten?', () => setupFocusPage()],
  '2.2': ['Neu: Fußball, Formel 1 und Spritpreise. Soll ich dir eine Sport-Seite mit dem HSV einrichten?', () => setupSportPage()],
  '2.3': ['Neu: Kalender, der Himmel oben und der Spiegel-Modus (Taste S). Die Gleitzeit ist raus. Soll ich den Kalender auf deine erste Seite legen?', () => setupNews23()],
  '2.4': ['Neu: Abfahrten, Geburtstage und Müllabfuhr. Und das Cockpit lässt sich jetzt als App installieren. Soll ich die drei auf deine erste Seite legen?', () => setupNews24()],
  '2.5': ['Frischer Schliff: ruhigere Karten, wichtige stehen weiter vorn. Tipp auf einen Kartentitel, dann klappt die Karte ein und zeigt nur noch das Wichtigste.', null],
  '2.6': ['Neu: „Jetzt wichtig“, Wetterwarnungen vom DWD und schnelles Notieren mit der Taste N. Soll ich deine Seiten zu Heute, Arbeit, Privat, Fokus und Sport ordnen?', () => openPlan(), 'Vorschau'],
  '2.7': ['Neu: Sync zwischen Geräten. Mit einem eigenen Cloudflare Worker bleiben Handy, Mac und Spiegel auf demselben Stand. Soll ich dir zeigen, wie du ihn einrichtest?', () => openDrawer('data'), 'Zeigen'],
  '2.8': ['Neuer Look: Dunkel in Graphit oder Schwarz, mehr Akzentfarben mit Verläufen, ein neues Anpassen-Fenster und die Schnellsuche mit Strg+K.', () => openDrawer('look'), 'Ansehen'],
  '2.9': ['Feinschliff: Notizen lassen dich jetzt durchschreiben, Auswahllisten passen zum Look, alle laufenden Balken leuchten in deiner Farbe und Pendeln sagt genauer, was mit TomTom los ist. Der Vers des Tages ist raus.', null],
  '3.0': ['Neu: Stile für die Uhr, Kacheln zum Sortieren, ein Spiegel zum Einrichten mit Vorschau, kompaktes Wetter und Pendeln und eine Galerie mit Registern. Soll ich dir den neuen Kopf zeigen?', () => openDrawer('head'), 'Zeigen'],
  '3.1': ['Der Spiegel zeigt jetzt viel mehr: deine Widgets als Kurzzeilen, einen Wechselplatz, „Jetzt wichtig“, Stunden im Wetter, die Ankunft beim Pendeln und abends die Morgen-Vorschau. Soll ich ihn dir zeigen?', () => openDrawer('mirror'), 'Zeigen'],
  '3.5': ['Neu: Das Cockpit als echtes iPhone-Widget über die App Scriptable, mit Terminen, Geburtstagen, Wetter, Pendeln und Spritpreisen. Soll ich dir zeigen, wie es geht?', () => { openDrawer('data'); setTimeout(() => { const d = $('#dr-iw details'); if (d) { d.open = true; d.scrollIntoView({ block: 'center', behavior: 'smooth' }); } }, 300); }, 'Zeigen'],
  '3.4': ['Notizen können jetzt Markdown wie in Obsidian: Überschriften, Listen, Aufgaben zum Abhaken, Links und mehr, nur die Zeile mit dem Cursor zeigt die Zeichen. Strg+Enter macht eine Aufgabe.', () => { const id = widgetsOf('notes').map(([i]) => i).find(i => pagesUsing(i).length); if (!id) { setEdit(true); openGallery(); return; } nwJump(id); setTimeout(() => { const v = views.get(id); if (v && v.cm) v.cm.focus(); }, 350); }, 'Ausprobieren'],
  '3.3': ['Spritpreise mit eigenem Ort: Such dir einen Ort, nimm den vom Wetter oder deinen Standort, dazu Umkreis und Sortierung. Soll ich dir die Einstellungen zeigen?', () => { if (!pagesUsing('fuel').length) { setEdit(true); openGallery(); return; } nwJump('fuel'); setTimeout(() => { if (fuKey()) fuOpenSet(true); else fuOpenForm(); }, 350); }, 'Zeigen'],
  '3.6': ['Neu: Fußball und Formel 1 zeigen, wo gespielt und gefahren wird. Bei der F1 auch gratis bei ORF, ServusTV und SRF, mit VPN-Hinweis und Knopf zum Livestream. Was davon auftaucht, stellst du pro Widget ein.', () => { const id = pagesUsing('f1').length ? 'f1' : (widgetsOf('football').map(([i]) => i).find(i => pagesUsing(i).length) || ''); if (!id) { setEdit(true); openGallery(); return; } nwJump(id); setTimeout(() => openWidgetDialog(id), 350); }, 'Einstellen'],
  '3.7': ['Neu: die F1 Rennanalyse. Das letzte Rennen im Zeitraffer auf der Streckenkarte, dazu Positionsverlauf, Reifen und Boxenstopps, kostenlos über OpenF1. Soll ich sie neben die Formel 1 legen?', () => anShow(), 'Hinzufügen'],
  '3.2': ['Der Kalender kann jetzt auch Google, Outlook und jeden anderen Kalender mit ICS-Link. Deine Weiterleitung braucht dafür einmal neuen Code, die Einrichtung zeigt dir, was fehlt.', () => { if (!pagesUsing('cal').length) { setEdit(true); openGallery(); return; } nwJump('cal'); setTimeout(caOpenForm, 350); }, 'Einrichten']
};
const verNum = v => String(v || '0').split('.').reduce((a, x, i) => a + (+x || 0) / 1000 ** i, 0);
function announceNew() {
  if (state.meta.seen === VERSION) return;
  const known = state.edited, from = verNum(state.meta.seen);
  // Wer eine Version übersprungen hat, bekommt das neueste Angebot mit Knopf, sonst den neuesten Hinweis
  const fresh = Object.keys(NEWS).filter(k => verNum(k) > from && verNum(k) <= verNum(VERSION)).sort((a, b) => verNum(b) - verNum(a));
  const news = NEWS[fresh.find(k => NEWS[k][1]) || fresh[0]];
  state.meta.seen = VERSION;
  persist();
  if (known && news) setTimeout(() => toast(news[0], news[1], { label: news[2] || 'Einrichten', ms: news[1] ? 20000 : 12000 }), 900);
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
/* 2.3: Kalender auf die erste Seite, das Gleitzeit-Widget gibt es nicht mehr */
function setupNews23() {
  const p = state.pages[0], add = ['cal'].filter(w => !p.items.some(x => x.w === w));
  if (!add.length) { toast(`Der Kalender liegt schon auf „${p.name}“.`); return; }
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
  syRebase();
  renderAll();
  afterStateSwap(old);
  if (dr.open && !$('#drawer').contains(document.activeElement)) renderDrawer();
});

$('#foot-ver').textContent = `Version ${VERSION}`;
// Den Vers des Tages gibt es seit 2.9 nicht mehr, sein Zwischenspeicher kann weg
try { localStorage.removeItem('jere-cockpit-vers'); } catch { /* Browser speichert nicht */ }
if (!lsOk) setSync('none');
for (const t of ['commute', 'weather', 'vacation']) ensureView(t);
// Ganz neu hier (nichts gespeichert): mit Heute, Arbeit und Privat starten
if (lsOk && lsGet(LS_KEY) === null) state = DEFAULTS();
state.page = startPageId() || state.page;
persist();
renderAll();
snapTake();
announceNew();
if (mirrorFromHash()) mirrorOpen(false);
setInterval(tick, 1000);
/* Handy quer oder Fenster schmaler: Listen kürzen oder wieder verlängern */
narrowMq.addEventListener('change', () => { renderViews(); renderRadarTg(); schedLayout(); });
startWeather();
loadCommute();
initTasks();
if (caSec().feeds.length) caLoad();
syInit();
