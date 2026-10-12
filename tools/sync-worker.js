// Ablage für Jeres Tagescockpit: hält den Stand des Cockpits in Cloudflare KV,
// damit sich deine Geräte abgleichen können. Erreichbar nur mit deinem Passwort.
// Einrichtung: einen KV-Namespace unter dem Namen SYNC_KV an den Worker binden
// und ein Secret SYNC_SECRET mit deinem Passwort anlegen.
const MAX_ZEICHEN = 1900000;

async function hash(text) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
}
// Vergleich ohne Abkürzung, damit die Antwortzeit nichts über das Passwort verrät
async function gleich(a, b) {
  const x = await hash(a), y = await hash(b);
  let d = 0;
  for (let i = 0; i < x.length; i++) d |= x[i] ^ y[i];
  return d === 0;
}

export default {
  async fetch(request, env) {
    const cors = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type',
      'Access-Control-Max-Age': '86400',
      'Cache-Control': 'no-store'
    };
    const antwort = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8' } });
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (!env.SYNC_KV || !env.SYNC_SECRET) {
      return antwort({ error: 'setup', missing: [!env.SYNC_KV && 'SYNC_KV', !env.SYNC_SECRET && 'SYNC_SECRET'].filter(Boolean) }, 500);
    }
    const gegeben = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    if (!(await gleich(gegeben, env.SYNC_SECRET))) {
      await new Promise(r => setTimeout(r, 500));
      return antwort({ error: 'auth' }, 401);
    }
    if (request.method === 'GET') {
      return antwort((await env.SYNC_KV.get('stand', 'json')) || { rev: 0 });
    }
    if (request.method === 'PUT') {
      const text = await request.text();
      if (text.length > MAX_ZEICHEN) return antwort({ error: 'size' }, 413);
      let b;
      try { b = JSON.parse(text); } catch { return antwort({ error: 'format' }, 400); }
      if (!b || typeof b !== 'object' || !b.state || typeof b.state !== 'object' || Array.isArray(b.state) || Number.isNaN(Date.parse(b.at))) {
        return antwort({ error: 'format' }, 400);
      }
      const jetzt = (await env.SYNC_KV.get('stand', 'json')) || { rev: 0 };
      // Ein anderes Gerät war schneller: den aktuellen Stand zurückgeben, das Cockpit entscheidet dann
      if (!b.force && b.base !== jetzt.rev) return antwort({ error: 'conflict', ...jetzt }, 409);
      const neu = { rev: jetzt.rev + 1, at: b.at, ver: String(b.ver || ''), state: b.state };
      try {
        await env.SYNC_KV.put('stand', JSON.stringify(neu));
      } catch (e) {
        return antwort({ error: 'kv', message: String((e && e.message) || e).slice(0, 200) }, 503);
      }
      return antwort({ rev: neu.rev, at: neu.at });
    }
    return antwort({ error: 'method' }, 405);
  }
};
