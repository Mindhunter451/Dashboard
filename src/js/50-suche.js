/* Schnellsuche mit Strg+K (am Mac Cmd+K) oder über „Suchen“ oben: Seiten, Widgets, Aktionen und Einstellungen finden
 * und mit Enter direkt ausführen. Ohne Suchwort zeigt sie Seiten und die wichtigsten Aktionen. */
const cmd = { all: [], hits: [], sel: 0 };
const cmdMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
const cmdNorm = s => String(s || '').toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
  .normalize('NFD').replace(/[̀-ͯ]/g, '');
const CMD_ICO = {
  page: svgIco('<rect x="3.5" y="4.5" width="17" height="15" rx="3"/><path d="M3.5 9h17"/>'),
  note: svgIco('<path d="M5 19.5h4L19.5 9a2.5 2.5 0 0 0-3.5-3.5L5.5 16z"/>'),
  edit: svgIco('<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4z"/><path d="M13.5 6.5l4 4"/>'),
  plus: svgIco('<path d="M12 5v14M5 12h14"/>'),
  mirror: svgIco('<rect x="3" y="4" width="18" height="13" rx="2"/><path d="M9 21h6M12 17v4M7 8.5l3-3M7 12.5l7-7"/>'),
  tune: svgIco('<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>'),
  sync: svgIco('<path d="M20 8a8 8 0 0 0-14.5-2.5M4 4v4h4"/><path d="M4 16a8 8 0 0 0 14.5 2.5M20 20v-4h-4"/>'),
  save: svgIco('<path d="M12 4v11M7.5 10.5L12 15l4.5-4.5"/><path d="M5 19.5h14"/>'),
  sun: svgIco('<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>'),
  moon: svgIco('<path d="M19.5 14.5A7.5 7.5 0 0 1 9.5 4.5a7.5 7.5 0 1 0 10 10z"/>'),
  auto: svgIco('<circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor"/>'),
  clock: svgIco('<circle cx="12" cy="12" r="8"/><path d="M12 7.5V12l3 2"/>'),
  sky: svgIco('<path d="M3 16.5c3-4.5 6-6.5 9-6.5s6 2 9 6.5"/><circle cx="12" cy="6" r="2"/>'),
  grid: svgIco('<rect x="3.5" y="3.5" width="7.5" height="9" rx="2"/><rect x="13" y="3.5" width="7.5" height="5.5" rx="2"/><rect x="3.5" y="14.5" width="7.5" height="6" rx="2"/><rect x="13" y="11" width="7.5" height="9.5" rx="2"/>'),
  data: svgIco('<ellipse cx="12" cy="6" rx="7.5" ry="2.8"/><path d="M4.5 6v12c0 1.5 3.4 2.8 7.5 2.8s7.5-1.3 7.5-2.8V6"/>'),
  flag: svgIco('<path d="M5 21V4M5 4.6c4-2 6 2 10 0s4 0 4 0v8.6s-1-2-4 0-6-2-10 0"/>')
};
function cmdSetUi(o, msg) {
  Object.assign(state.ui, o);
  commit();
  if (dr.open) renderDrawer();
  if (msg) toast(msg, null, { ms: 2500 });
}
/* Alle Einträge. words: zusätzliche Suchwörter, sw: Farbe für einen Punkt statt Symbol, on: ist schon so eingestellt */
function cmdBuild() {
  const out = [], u = state.ui;
  const add = (group, title, run, o = {}) => out.push({ group, title, run, sub: o.sub || '', key: o.key || '', ico: o.ico || '', sw: o.sw || '', on: !!o.on, top: !!o.top,
    words: cmdNorm(`${title} ${o.sub || ''} ${o.words || ''}`) });
  const cur = curPage();
  state.pages.forEach((p, i) => add('Seiten', p.name, () => showPage(p.id, 'user'), {
    key: i < 9 ? String(i + 1) : '', ico: CMD_ICO.page, top: true, on: p.id === cur.id,
    sub: p.id === cur.id ? 'Gerade offen' : `${p.items.length} ${p.items.length === 1 ? 'Widget' : 'Widgets'}`, words: 'seite'
  }));
  for (const [id, w] of Object.entries(state.widgets)) {
    const ps = pagesUsing(id);
    if (!ps.length || !TYPES[w.type]) continue;
    add('Widgets', widgetLabel(id) || TYPES[w.type].name, () => nwJump(id), { ico: TICON[w.type] || '', sub: `Auf ${ps.map(p => p.name).join(', ')}`, words: `${TYPES[w.type].name} widget karte` });
  }
  add('Aktionen', 'Schnell notieren', openCapture, { key: 'N', ico: CMD_ICO.note, top: true, words: 'notiz aufgabe todo idee merken' });
  add('Aktionen', edit.on ? 'Bearbeiten beenden' : 'Seiten und Widgets bearbeiten', () => setEdit(!edit.on), { ico: CMD_ICO.edit, top: true, words: 'bearbeiten verschieben anordnen breite entfernen' });
  add('Aktionen', 'Widget hinzufügen', () => { setEdit(true); openGallery(); }, { ico: CMD_ICO.plus, top: true, words: 'neu galerie karte' });
  add('Aktionen', 'Spiegel-Modus starten', () => mirrorOpen(true), { key: 'S', ico: CMD_ICO.mirror, top: true, words: 'vollbild smart mirror wand kiosk' });
  add('Aktionen', 'Anpassen öffnen', () => openDrawer('look'), { ico: CMD_ICO.tune, top: true, words: 'einstellungen optionen' });
  if (syncMode().startsWith('cloud')) add('Aktionen', 'Jetzt abgleichen', () => $('#sy-now').click(), { ico: CMD_ICO.sync, words: 'sync cloud geraete' });
  add('Aktionen', 'Sicherung als Datei speichern', exportState, { ico: CMD_ICO.save, words: 'export backup download' });
  add('Aktionen', 'Seiten neu ordnen', openPlan, { ico: CMD_ICO.grid, words: 'aufraeumen heute arbeit privat fokus sport' });

  const th = [['light', 'Hell', CMD_ICO.sun], ['dark', 'Dunkel', CMD_ICO.moon], ['auto', 'Wie das System', CMD_ICO.auto]];
  for (const [v, n, ico] of th) add('Aussehen', `Design: ${n}`, () => cmdSetUi({ theme: v }), { ico, on: u.theme === v, words: 'modus dark light nacht tag' });
  add('Aussehen', 'Dunkel in Graphit', () => cmdSetUi({ dark: 'graphite', theme: isDark() ? u.theme : 'dark' }), { ico: CMD_ICO.moon, on: u.dark === 'graphite', words: 'grau dunkel design' });
  add('Aussehen', 'Dunkel in Schwarz', () => cmdSetUi({ dark: 'oled', theme: isDark() ? u.theme : 'dark' }), { ico: CMD_ICO.moon, on: u.dark === 'oled', words: 'oled amoled schwarz dunkel design spiegel' });
  const dark = isDark();
  for (const [k, a] of Object.entries(ACCENTS)) add('Aussehen', `Akzent: ${a.name}`, () => cmdSetUi({ accent: k }), { sw: accentSwatch(k, dark), on: u.accent === k, words: 'akzentfarbe farbe' });
  for (const [k, g] of Object.entries(GRADS)) add('Aussehen', `Akzent: ${g.name}`, () => cmdSetUi({ accent: k }), { sw: accentSwatch(k, dark), on: u.accent === k, words: 'akzentfarbe farbe verlauf' });
  add('Aussehen', 'Akzent: Mit dem Tag', () => cmdSetUi({ accent: 'sun' }), { ico: CMD_ICO.sun, on: u.accent === 'sun', words: 'akzentfarbe farbe sonne tageszeit' });
  add('Aussehen', 'Akzent: Eigene Farbe', () => { openDrawer('look'); setTimeout(() => { const c = $('#dr-acc-pick'); if (c) c.focus(); }, 60); }, { sw: accentSwatch('custom', dark), on: u.accent === 'custom', words: 'akzentfarbe farbe farbwaehler' });
  for (const [k, n] of Object.entries(DENSITY)) add('Aussehen', `Abstände: ${n}`, () => cmdSetUi({ density: k }), { ico: CMD_ICO.grid, on: u.density === k, words: 'dichte kompakt luft platz' });
  for (const [k, n] of [['s', 'Schmal'], ['m', 'Normal'], ['l', 'Breit']]) add('Aussehen', `Kartenbreite: ${n}`, () => cmdSetUi({ size: k }), { ico: CMD_ICO.grid, on: u.size === k, words: 'karten groesse spalten' });
  add('Aussehen', u.seconds ? 'Sekunden ausblenden' : 'Sekunden zeigen', () => cmdSetUi({ seconds: !u.seconds }), { ico: CMD_ICO.clock, words: 'uhr zeit' });
  add('Aussehen', u.sky ? 'Himmel ausschalten' : 'Himmel nach Sonnenstand färben', () => cmdSetUi({ sky: !u.sky }), { ico: CMD_ICO.sky, words: 'kopf sonne farbe' });
  for (const [k, [n]] of Object.entries(HEAD_STYLES)) add('Aussehen', `Uhr: ${n}`, () => cmdSetUi({ head: { ...u.head, style: k, weight: HEAD_STYLES[k][1], size: 100 } }), { ico: CMD_ICO.clock, on: u.head.style === k, words: 'kopf stil uhrzeit' });
  add('Aussehen', 'Ecken einstellen', () => { openDrawer('look'); setTimeout(() => $('#dr-radius').focus(), 60); }, { ico: CMD_ICO.tune, words: 'rund radius form' });

  add('Einstellungen', 'Startseite festlegen', () => openDrawer('pages'), { ico: CMD_ICO.page, words: 'beim oeffnen arbeitszeit automatisch' });
  add('Einstellungen', 'Uhr und Kopf anpassen', () => openDrawer('head'), { ico: CMD_ICO.clock, words: 'groesse schrift datum kalenderwoche begruessung sekunden' });
  add('Einstellungen', 'Spiegel einrichten', () => openDrawer('mirror'), { ico: CMD_ICO.mirror, words: 'smart mirror bausteine dimmen nachts vorschau kurzzeilen wechselplatz morgen widgets' });
  add('Einstellungen', 'Countdown anlegen', () => { openDrawer('head'); setTimeout(() => { const n = $('#cd-name'); n.scrollIntoView({ block: 'center' }); n.focus({ preventScroll: true }); }, 60); }, { ico: CMD_ICO.flag, words: 'kachel pruefung termin zaehlen' });
  add('Einstellungen', 'Kacheln oben wählen und sortieren', () => { openDrawer('head'); setTimeout(() => $('#dr-tiles').scrollIntoView({ block: 'start' }), 60); }, { ico: CMD_ICO.grid, words: 'feierabend wochenende feiertag urlaub reihenfolge termin sonne' });
  add('Einstellungen', 'Sync zwischen Geräten', () => openDrawer('data'), { ico: CMD_ICO.sync, words: 'cloud cloudflare worker handy mac' });
  add('Einstellungen', 'Als App installieren', () => openDrawer('data'), { ico: CMD_ICO.plus, words: 'pwa homescreen dock' });
  add('Einstellungen', 'iPhone-Widget einrichten', () => { openDrawer('data'); setTimeout(() => { const d = $('#dr-iw details'); if (d) { d.open = true; d.scrollIntoView({ block: 'center' }); } }, 300); }, { ico: CMD_ICO.plus, words: 'scriptable homescreen sperrbildschirm ios widget' });
  add('Einstellungen', 'Zwischenstand zurückholen', () => openDrawer('data'), { ico: CMD_ICO.data, words: 'rueckgaengig wiederherstellen backup gestern' });
  add('Einstellungen', 'Sicherung laden', () => openDrawer('data'), { ico: CMD_ICO.data, words: 'import datei backup' });
  return out;
}
const CMD_GROUPS = ['Seiten', 'Aktionen', 'Widgets', 'Aussehen', 'Einstellungen'];
/* Treffer: jedes Wort der Suche muss vorkommen. Wer mit dem Titel anfängt oder ein Wort im Titel trifft, steht weiter oben. */
function cmdFilter(q) {
  const t = cmdNorm(q).split(/\s+/).filter(Boolean);
  if (!t.length) return cmd.all.filter(x => x.top);
  const score = x => {
    const title = cmdNorm(x.title);
    let s = 0;
    if (title.startsWith(t[0])) s += 4;
    if (title.split(/[\s:,-]+/).some(w => w.startsWith(t[0]))) s += 2;
    if (x.group === 'Seiten' || x.group === 'Aktionen') s += 1;
    return s;
  };
  const hits = cmd.all.filter(x => t.every(w => x.words.includes(w))).map(x => [x, score(x)]);
  hits.sort((a, b) => b[1] - a[1] || CMD_GROUPS.indexOf(a[0].group) - CMD_GROUPS.indexOf(b[0].group));
  return hits.slice(0, 40).map(h => h[0]);
}
function cmdRender() {
  const q = $('#cmd-q').value, list = $('#cmd-list');
  cmd.hits = cmdFilter(q);
  cmd.sel = Math.min(cmd.sel, Math.max(0, cmd.hits.length - 1));
  // Ohne Suchwort in Gruppen, mit Suchwort nach Treffergüte, die Gruppe steht dann klein rechts
  const grouped = !q.trim();
  let html = '', last = '';
  cmd.hits.forEach((x, i) => {
    if (grouped && x.group !== last) { html += `<li class="cmd-gh" role="presentation">${esc(x.group)}</li>`; last = x.group; }
    const ico = x.sw ? `<span class="cmd-ico cmd-sw" style="--c:${x.sw}"></span>` : `<span class="cmd-ico">${x.ico}</span>`;
    const right = x.on ? `<span class="cmd-on">${CHECK}</span>` : x.key ? `<kbd>${esc(x.key)}</kbd>` : (!grouped ? `<span class="cmd-grp">${esc(x.group)}</span>` : '');
    html += `<li class="cmd-it" role="option" id="cmd-o${i}" data-i="${i}" aria-selected="${i === cmd.sel}">${ico}<span class="cmd-tx"><b>${esc(x.title)}</b>${x.sub ? `<small>${esc(x.sub)}</small>` : ''}</span>${right}</li>`;
  });
  list.innerHTML = html;
  $('#cmd-empty').hidden = !!cmd.hits.length;
  if (!cmd.hits.length) $('#cmd-empty').textContent = `Nichts gefunden für „${q.trim()}“. Probier es mit einem Seitennamen, einem Widget oder Wörtern wie Farbe, Dunkel oder Sync.`;
  cmdMark();
}
function cmdMark() {
  const q = $('#cmd-q');
  for (const li of document.querySelectorAll('#cmd-list .cmd-it')) li.setAttribute('aria-selected', String(+li.dataset.i === cmd.sel));
  const el = $(`#cmd-o${cmd.sel}`);
  if (el) { q.setAttribute('aria-activedescendant', el.id); el.scrollIntoView({ block: 'nearest' }); } else q.removeAttribute('aria-activedescendant');
}
function cmdRun(i) {
  const x = cmd.hits[i];
  if (!x) return;
  $('#dlg-cmd').close();
  requestAnimationFrame(() => x.run());
}
function openCmd() {
  if (mr.on) return;
  for (const d of $$('dialog[open]')) if (d.id !== 'dlg-cmd') return;
  if (dr.open) closeDrawer();
  cmd.all = cmdBuild();
  cmd.sel = 0;
  $('#cmd-q').value = '';
  cmdRender();
  const d = $('#dlg-cmd');
  if (!d.open) d.showModal();
  $('#cmd-q').focus();
}
$('#search-kbd').textContent = cmdMac ? '⌘K' : 'Strg K';
$('#search-btn').title = `Schnellsuche (${cmdMac ? 'Cmd+K' : 'Strg+K'})`;
$('#search-btn').addEventListener('click', openCmd);
$('#cmd-q').addEventListener('input', () => { cmd.sel = 0; cmdRender(); });
$('#cmd-q').addEventListener('keydown', e => {
  const n = cmd.hits.length;
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    if (!n) return;
    cmd.sel = (cmd.sel + (e.key === 'ArrowDown' ? 1 : -1) + n) % n;
    cmdMark();
  } else if (e.key === 'Enter' && !e.isComposing) {
    e.preventDefault();
    cmdRun(cmd.sel);
  }
});
$('#cmd-list').addEventListener('mousemove', e => {
  const li = e.target.closest('.cmd-it');
  if (li && +li.dataset.i !== cmd.sel) { cmd.sel = +li.dataset.i; cmdMark(); }
});
$('#cmd-list').addEventListener('click', e => { const li = e.target.closest('.cmd-it'); if (li) cmdRun(+li.dataset.i); });
document.addEventListener('keydown', e => {
  // Im Notizen-Editor ist Strg+K ein Link, dort hat CodeMirror die Taste schon genommen
  if (e.defaultPrevented || !(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey || (e.key !== 'k' && e.key !== 'K')) return;
  e.preventDefault();
  if ($('#dlg-cmd').open) $('#dlg-cmd').close(); else openCmd();
});
