/* Service Worker von Jeres Tagescockpit. Wird von build.mjs mit der Versionsnummer nach sw.js geschrieben.
 * Seite: immer zuerst frisch aus dem Netz, die gespeicherte Kopie nur ohne Netz. Updates kommen also sofort an.
 * Schriften und Bibliotheken: einmal laden, dann aus dem Speicher (die Adressen enthalten feste Versionen).
 * Wetter: ohne Netz die letzte Antwort, markiert mit _cockpitCache (Zeitpunkt), damit die Karte den alten Stand anzeigt.
 * Alles andere (Todoist, Tankerkönig, Abfahrten, Fußball …) geht ganz normal ins Netz. */
const VERSION = '2.4';
const SHELL = 'cockpit-seite-' + VERSION, LIBS = 'cockpit-bibliotheken', DATA = 'cockpit-wetter';
const PRE = ['./', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'];
const LIB_HOSTS = /^(fonts\.googleapis\.com|fonts\.gstatic\.com|unpkg\.com|cdnjs\.cloudflare\.com)$/;
const WX_HOST = 'api.open-meteo.com';

self.addEventListener('install', e => {
  e.waitUntil(caches.open(SHELL).then(c => c.addAll(PRE.map(u => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith('cockpit-seite-') && k !== SHELL).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

async function page(req) {
  const c = await caches.open(SHELL);
  try {
    const res = await fetch(req);
    if (res.ok && res.type === 'basic') c.put('./', res.clone());
    return res;
  } catch {
    return (await c.match('./')) || (await c.match(req)) || Response.error();
  }
}
async function fresh(req) {
  const c = await caches.open(SHELL), hit = await c.match(req);
  const net = fetch(req).then(res => { if (res.ok) c.put(req, res.clone()); return res; }).catch(() => null);
  return hit || (await net) || Response.error();
}
async function lib(req, url) {
  const c = await caches.open(LIBS), hit = await c.match(req);
  // Das Stylesheet von Google Fonts ändert sich selten, also im Hintergrund auffrischen. Der Rest ist unveränderlich.
  if (hit && url.hostname !== 'fonts.googleapis.com') return hit;
  const net = fetch(req).then(res => { if (res.ok || res.type === 'opaque') c.put(req, res.clone()); return res; }).catch(() => null);
  return hit || (await net) || Response.error();
}
async function weather(req) {
  const c = await caches.open(DATA);
  try {
    const res = await fetch(req);
    if (res.ok) {
      try {
        const j = await res.clone().json();
        if (j && typeof j === 'object' && !Array.isArray(j)) {
          j._cockpitCache = new Date().toISOString();
          await c.put(req.url, new Response(JSON.stringify(j), { headers: { 'Content-Type': 'application/json' } }));
        }
      } catch { /* kein JSON, dann eben nicht aufheben */ }
    }
    return res;
  } catch (err) {
    const hit = await c.match(req.url);
    if (hit) return hit;
    throw err;
  }
}
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === self.location.origin) {
    if (req.mode === 'navigate') e.respondWith(page(req));
    else if (!url.pathname.endsWith('/sw.js')) e.respondWith(fresh(req));
    return;
  }
  if (LIB_HOSTS.test(url.hostname)) { e.respondWith(lib(req, url)); return; }
  if (url.hostname === WX_HOST) {
    // Alte Wetterdaten nur aufheben, solange die Daten sonst ganz fehlen würden: der Cache hat genau eine Antwort pro Ort
    e.respondWith(weather(req));
  }
});
