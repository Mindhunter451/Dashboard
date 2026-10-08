/* Sichern, Laden, Zurücksetzen und die Erinnerung ans Sichern */
const BACKUP_DAYS = 14;
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
/* Hinweis zeigen, wenn seit der letzten Sicherung (oder seit Beginn) zwei Wochen um sind und sich etwas geändert hat */
function checkBackup() {
  const m = state.meta, now = Date.now();
  const last = m.backupAt ? Date.parse(m.backupAt) : 0;
  const changed = m.changedAt ? Date.parse(m.changedAt) : 0;
  const base = last || Date.parse(m.since) || now;
  const due = changed > last && now - base > BACKUP_DAYS * DAY && !(m.snooze && Date.parse(m.snooze) > now);
  $('#notice').hidden = !due;
  if (due) $('#notice-text').innerHTML = last
    ? `<b>Deine letzte Sicherung ist ${agoTxt(last)} her.</b> Seitdem hast du einiges geändert, und alles liegt nur in diesem Browser.`
    : '<b>Du hast deine Einstellungen noch nie gesichert.</b> Alles liegt nur in diesem Browser. Ein Klick, und du hast eine Kopie als Datei.';
}
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
