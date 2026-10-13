/* Sichern, Laden, Zurücksetzen, Zwischenstände und die Erinnerung ans Sichern.
 * Läuft der Sync, erinnert das Cockpit nicht mehr ans Sichern als Datei. Dafür hebt jedes Gerät einmal am Tag
 * einen Zwischenstand auf, so lassen sich Fehler zurückholen, die der Sync schon auf alle Geräte verteilt hat. */
const BACKUP_DAYS = 14, SNAP_KEY = 'jere-cockpit-staende', SNAP_MAX = 7;
function exportState() {
  state.meta.backupAt = new Date().toISOString();
  state.meta.snooze = null;
  persist();
  const body = JSON.stringify({ app: 'jere-cockpit', version: VERSION, exported: state.meta.backupAt, state }, null, 2);
  const url = URL.createObjectURL(new Blob([body], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `cockpit-sicherung-${ymd(new Date())}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  checkBackup();
  renderBackupInfo();
  toast('Sicherung gespeichert. Leg die Datei am besten an einen Ort, der selbst gesichert wird.');
}
/* „3 Wochen“ (… her) oder mit dat=true „3 Wochen“ / „5 Tagen“ (vor …) */
const agoTxt = (t, dat) => {
  const d = Math.floor((Date.now() - t) / DAY);
  if (d >= 14) return `${Math.floor(d / 7)} Wochen`;
  return d === 1 ? (dat ? 'einem Tag' : 'einen Tag') : `${d} ${dat ? 'Tagen' : 'Tage'}`;
};
/* Hinweis zeigen, wenn seit der letzten Sicherung (oder seit Beginn) zwei Wochen um sind und sich etwas geändert hat. Mit Sync nicht. */
function checkBackup() {
  const m = state.meta, now = Date.now();
  const last = m.backupAt ? Date.parse(m.backupAt) : 0;
  const changed = m.changedAt ? Date.parse(m.changedAt) : 0;
  const base = last || Date.parse(m.since) || now;
  const cloud = !!syCfg();
  const due = !cloud && changed > last && now - base > BACKUP_DAYS * DAY && !(m.snooze && Date.parse(m.snooze) > now);
  $('#notice').hidden = !due;
  if (due) $('#notice-text').innerHTML = last
    ? `<b>Deine letzte Sicherung ist ${agoTxt(last)} her.</b> Seitdem hast du einiges geändert, und alles liegt nur in diesem Browser.`
    : '<b>Du hast deine Einstellungen noch nie gesichert.</b> Alles liegt nur in diesem Browser. Ein Klick, und du hast eine Kopie als Datei.';
}
/* Zwischenstände: der Stand, wie er am Tag beim ersten Öffnen war. Liste neueste zuerst: [{ at, state }] */
const snapView = s => JSON.stringify({ ...s, page: undefined, meta: undefined });
function snapList() {
  const l = lsGet(SNAP_KEY);
  return Array.isArray(l) ? l.filter(x => x && typeof x.at === 'string' && x.state && typeof x.state === 'object' && Array.isArray(x.state.pages)) : [];
}
function snapTake() {
  if (!lsOk) return;
  const list = snapList(), now = new Date();
  if (list[0] && ymd(new Date(list[0].at)) === ymd(now)) return;
  const cur = snapView(state);
  if (cur.length > 4e5) return;
  // Hat sich seit dem letzten Zwischenstand nichts geändert, reicht der alte
  if (list[0] && snapView(list[0].state) === cur) return;
  let next = [{ at: now.toISOString(), state: JSON.parse(JSON.stringify(state)) }, ...list].slice(0, SNAP_MAX);
  // Ist der Speicher knapp, fallen die ältesten weg
  while (next.length) {
    try { localStorage.setItem(SNAP_KEY, JSON.stringify(next)); break; } catch { next = next.slice(0, -1); }
  }
  if (dr.open) renderSnaps();
}
function snapLabel(t) {
  const d = new Date(t), n = dayDiff(d, new Date());
  return `${n === 0 ? 'Heute' : n === 1 ? 'Gestern' : `${WD[d.getDay()]} ${dm(d)}`}, ${hm(d)} Uhr`;
}
function renderSnaps() {
  const list = snapList(), cloud = !!syCfg(), cur = snapView(state);
  $('#dr-snap-txt').textContent = (cloud ? 'Weil der Sync läuft, erinnert dich das Cockpit nicht mehr ans Sichern als Datei. ' : '')
    + 'Einmal am Tag hebt dieses Gerät auf, wie dein Cockpit beim ersten Öffnen aussah. Hast du dich vertan, holst du hier einen der letzten sieben Stände zurück'
    + (cloud ? ', und der Sync bringt ihn auf deine anderen Geräte.' : '.');
  const ul = $('#dr-snaps');
  ul.hidden = !list.length;
  ul.innerHTML = list.map((x, i) => {
    const s = x.state, same = snapView(s) === cur;
    const nw = Object.keys(s.widgets || {}).length;
    const info = `${s.pages.length} ${s.pages.length === 1 ? 'Seite' : 'Seiten'}, ${nw} Widgets${same ? ', wie jetzt' : ''}`;
    return `<li><div class="tx"><b>${esc(snapLabel(x.at))}</b><span>${esc(info)}</span></div><button type="button" class="btn-ghost" data-snap="${i}"${same ? ' disabled' : ''}>Zurückholen</button></li>`;
  }).join('');
}
$('#dr-snaps').addEventListener('click', e => {
  const b = e.target.closest('[data-snap]');
  if (!b) return;
  const x = snapList()[+b.dataset.snap];
  if (!x) return;
  replaceState(normalize({ ...x.state, page: state.page, meta: state.meta }), `Stand von ${snapLabel(x.at).replace(/^Heute/, 'heute').replace(/^Gestern/, 'gestern')} ist zurück`);
  renderSnaps();
});
function renderBackupInfo() {
  const t = state.meta.backupAt;
  $('#dr-backup-at').textContent = !t ? 'Du hast noch keine Sicherung gemacht.'
    : dayDiff(new Date(t), new Date()) === 0 ? 'Letzte Sicherung: heute.'
    : `Letzte Sicherung am ${dmy(new Date(t))}, vor ${agoTxt(Date.parse(t), true)}.`;
}
$('#notice-save').addEventListener('click', exportState);
$('#notice-later').addEventListener('click', () => { state.meta.snooze = new Date(Date.now() + 7 * DAY).toISOString(); persist(); checkBackup(); });
$('#dr-export').addEventListener('click', exportState);
$('#dr-import').addEventListener('click', () => { $('#dr-file').value = ''; $('#dr-file').click(); });
$('#dr-file').addEventListener('change', async e => {
  const f = e.target.files && e.target.files[0];
  const fail = m => { $('#dr-data-err').textContent = m; $('#dr-data-err').hidden = false; };
  $('#dr-data-err').hidden = true;
  if (!f) return;
  if (f.size > 2e6) return fail('Die Datei ist zu groß für eine Cockpit-Sicherung.');
  try {
    const j = JSON.parse(await f.text());
    const raw = j && j.app === 'jere-cockpit' ? j.state : j;
    if (!raw || typeof raw !== 'object' || !(raw.vacation || raw.bars || raw.ui || raw.pages)) return fail('Das ist keine Sicherung von diesem Cockpit.');
    replaceState(normalize(raw), 'Sicherung geladen');
  } catch { fail('Die Datei konnte nicht gelesen werden.'); }
});
$('#dr-reset').addEventListener('click', () => replaceState(DEFAULTS(), 'Alles auf Anfang gesetzt'));
