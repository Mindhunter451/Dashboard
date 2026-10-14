// Weiterleitung für Jeres Tagescockpit (Version 2): holt einen öffentlich
// geteilten Kalender (ICS) und gibt ihn mit CORS-Freigabe an den Browser weiter.
// Aufruf: https://<dein-worker>.workers.dev/?url=<Kalender-Link>
// Nur diese Adressen gehen durch (Unteradressen zählen mit), sonst wäre es ein
// offener Proxy. Und es kommen nur Kalender zurück, keine Webseiten.
const ERLAUBT = [
  'icloud.com',
  'calendar.google.com',
  'outlook.live.com',
  'outlook.office365.com',
  'outlook.office.com',
  'calendar.proton.me'
];

export default {
  async fetch(request) {
    const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS' };
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
    const frage = new URL(request.url).searchParams;
    if (frage.has('info')) return Response.json({ v: 2, erlaubt: ERLAUBT }, { headers: cors });
    let ziel;
    try {
      ziel = new URL((frage.get('url') || '').replace(/^webcal:/i, 'https:'));
    } catch {
      return new Response('Parameter url fehlt', { status: 400, headers: cors });
    }
    const host = ziel.hostname.toLowerCase();
    if (ziel.protocol !== 'https:' || !ERLAUBT.some(d => host === d || host.endsWith('.' + d))) {
      return new Response('Diese Adresse ist nicht erlaubt', { status: 403, headers: cors });
    }
    const antwort = await fetch(ziel, { headers: { 'User-Agent': 'Mozilla/5.0 (Kalender-Weiterleitung)', 'Accept': 'text/calendar, */*' }, cf: { cacheTtl: 300 } });
    if (!antwort.ok) {
      // Gesperrt heißt beim Anbieter meist: nicht mehr geteilt
      const status = antwort.status === 401 || antwort.status === 403 ? 404 : antwort.status;
      return new Response('Der Kalender antwortet mit ' + antwort.status, { status, headers: cors });
    }
    const text = await antwort.text();
    if (!/^\uFEFF?\s*BEGIN:VCALENDAR/i.test(text)) {
      return new Response('Unter dem Link kam kein Kalender zurück', { status: 422, headers: cors });
    }
    return new Response(text, {
      headers: { ...cors, 'Content-Type': 'text/calendar; charset=utf-8', 'Cache-Control': 'max-age=300' }
    });
  }
};
