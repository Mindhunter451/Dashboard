/* Als App installieren: Manifest und Service Worker (sw.js). Klappt nur über die Adresse im Netz
 * (GitHub Pages) oder localhost, nicht mit der Datei vom Rechner. Das Manifest wird deshalb erst hier eingehängt,
 * sonst meckert der Browser bei der lokalen Datei. Der Service Worker holt die Seite immer zuerst frisch,
 * Updates kommen also wie gewohnt an. Ohne Netz startet das Cockpit mit dem letzten Stand. */
const app = { prompt: null };
const appWeb = /^https?:$/.test(location.protocol);
const appSecure = appWeb && (location.protocol === 'https:' || /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname));
const appStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const appIos = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
const appMacSafari = () => /Macintosh/.test(navigator.userAgent) && /Safari\//.test(navigator.userAgent) && !/Chrome|Chromium|Edg\/|Firefox|OPR\//.test(navigator.userAgent) && navigator.maxTouchPoints <= 1;
function appInit() {
  if (!appWeb) return;
  if (!document.querySelector('link[rel="manifest"]')) {
    const l = document.createElement('link');
    l.rel = 'manifest';
    l.href = 'manifest.webmanifest';
    document.head.appendChild(l);
  }
  if (appSecure && 'serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => { /* ohne Service Worker geht alles, nur nicht offline */ });
  // Als App darf der Browser die Daten nicht einfach wegräumen, wenn der Speicher knapp wird
  if (appStandalone() && navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
}
function renderAppInfo() {
  const txt = $('#dr-app-txt'), ios = $('#dr-app-ios');
  $('#dr-install').hidden = !app.prompt;
  ios.hidden = true;
  if (appStandalone()) txt.textContent = 'Das Cockpit läuft gerade als App. Updates kommen wie im Browser von selbst, sobald du es neu öffnest.';
  else if (!appWeb) txt.textContent = 'Installieren geht nur über die Adresse im Netz, also mindhunter451.github.io/Dashboard, nicht mit der Datei vom Rechner.';
  else if (app.prompt) txt.textContent = 'Das Cockpit lässt sich wie eine App installieren. Es startet dann ohne Browserleiste in einem eigenen Fenster und öffnet auch ohne Netz.';
  else if (appIos()) {
    txt.textContent = 'Auf iPhone und iPad: unten auf Teilen tippen und dann „Zum Home-Bildschirm“. Das Cockpit startet dann ohne Browserleiste und öffnet auch ohne Netz.';
    ios.hidden = false;
    ios.textContent = 'Wichtig: Die App auf dem Home-Bildschirm hat ihren eigenen Speicher. Speicher hier im Browser unter Daten eine Sicherung und lade sie in der App. Den Todoist-Token, die Keys und die Kalender-Links trägst du dort einmal neu ein.';
  } else if (appMacSafari()) txt.textContent = 'In Safari am Mac über Ablage und „Zum Dock hinzufügen“. Das Cockpit startet dann in einem eigenen Fenster und öffnet auch ohne Netz.';
  else if (/Firefox\//.test(navigator.userAgent)) txt.textContent = 'Firefox kann Webseiten nicht als App installieren. Mit Chrome, Edge oder Safari geht es.';
  else txt.textContent = 'Im Browser-Menü findest du „App installieren“ oder „Zum Startbildschirm hinzufügen“, manchmal auch als Symbol in der Adressleiste.';
}
addEventListener('beforeinstallprompt', e => { e.preventDefault(); app.prompt = e; renderAppInfo(); });
addEventListener('appinstalled', () => { app.prompt = null; renderAppInfo(); toast('Installiert. Du findest das Cockpit jetzt bei deinen Apps.'); });
$('#dr-install').addEventListener('click', async () => {
  const p = app.prompt;
  if (!p) return;
  app.prompt = null;
  try { await p.prompt(); await p.userChoice; } catch { /* abgebrochen */ }
  renderAppInfo();
});
appInit();
renderAppInfo();
