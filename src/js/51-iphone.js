/* iPhone-Widget über Scriptable: das Skript (tools/iphone-widget.js, beim Bauen hier eingesetzt) zum Kopieren
 * und ein Zugang, der Sync-Adresse, Sync-Passwort und die Keys dieses Geräts in einem Rutsch ins Widget bringt.
 * Der Zugang landet nur in der Zwischenablage, das Skript räumt sie nach dem Einfügen wieder leer. */
const IW_CODE = /*@iphone-widget*/'';
const IW_PREFIX = 'cockpit-widget:';
function iwAccess() {
  const s = syCfg();
  let tt = '';
  try { tt = localStorage.getItem(TT_KEY) || ''; } catch { tt = ''; }
  const out = { v: 1 };
  if (s) out.sync = { url: s.url, pass: s.pass };
  if (tt) out.tomtom = tt;
  if (fuKey()) out.fuel = fuKey();
  return out;
}
const iwParts = a => [a.sync && 'Sync', a.tomtom && 'TomTom-Key', a.fuel && 'Tankerkönig-Key'].filter(Boolean);
function renderIw() {
  const p = iwParts(iwAccess());
  $('#iw-has').textContent = p.length
    ? `„Zugang kopieren“ bringt von diesem Gerät mit: ${p.join(', ')}. Was fehlt, trägst du im Skript von Hand ein.`
    : 'Auf diesem Gerät sind noch kein Sync und keine Keys eingetragen. Termine und Wetter klappen im Widget auch ohne.';
  $('#iw-key').disabled = !p.length;
}
$('#iw-copy').addEventListener('click', () => syCopy(IW_CODE, 'Skript kopiert. Jetzt in Scriptable ein neues Skript anlegen und einfügen.'));
$('#iw-key').addEventListener('click', () => {
  const a = iwAccess(), p = iwParts(a);
  if (!p.length) { toast('Auf diesem Gerät gibt es noch keinen Sync und keine Keys zum Mitnehmen.'); return; }
  const text = IW_PREFIX + btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(a))));
  syCopy(text, `Zugang kopiert (${p.join(', ')}). Jetzt in Scriptable das Skript starten und „Zugang einfügen“ wählen.`);
});
