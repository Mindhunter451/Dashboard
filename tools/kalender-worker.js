// Weiterleitung für Jeres Tagescockpit: holt einen öffentlich geteilten
// iCloud-Kalender und gibt ihn mit CORS-Freigabe an den Browser weiter.
// Aufruf: https://<dein-worker>.workers.dev/?url=<Kalender-Link>
const ERLAUBT = /(^|\.)icloud\.com$/i; // nur iCloud, sonst wäre es ein offener Proxy

export default {
  async fetch(request) {
    const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS' };
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
    let ziel;
    try {
      ziel = new URL((new URL(request.url).searchParams.get('url') || '').replace(/^webcal:/i, 'https:'));
    } catch {
      return new Response('Parameter url fehlt', { status: 400, headers: cors });
    }
    if (ziel.protocol !== 'https:' || !ERLAUBT.test(ziel.hostname)) {
      return new Response('Diese Adresse ist nicht erlaubt', { status: 403, headers: cors });
    }
    const antwort = await fetch(ziel, { headers: { 'User-Agent': 'Mozilla/5.0 (Kalender-Weiterleitung)' }, cf: { cacheTtl: 300 } });
    return new Response(antwort.body, {
      status: antwort.status,
      headers: { ...cors, 'Content-Type': 'text/calendar; charset=utf-8', 'Cache-Control': 'max-age=300' }
    });
  }
};
