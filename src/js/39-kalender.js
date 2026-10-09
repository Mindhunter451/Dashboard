/* Kalender (gibt es nur einmal): öffentlich geteilte iCloud-Kalender als ICS-Abo.
 * Apple schickt keine CORS-Freigabe, der Browser darf den Link also nicht direkt laden. Dafür gibt es eine kleine
 * Weiterleitung als Cloudflare Worker (Code unten in CA_WORKER und im Repo unter tools/kalender-worker.js).
 * Links und Weiterleitung bleiben nur in diesem Browser (jere-cockpit-kalender) und kommen nicht in die Sicherung.
 * Zum Auslesen der Termine samt Wiederholungen und Zeitzonen wird ical.js nachgeladen, sobald ein Kalender da ist. */
const CA_KEY = 'jere-cockpit-kalender', CA_CACHE = 'jere-cockpit-kalender-daten';
const CA_COLORS = ['#3D7BE0', '#E5654B', '#2FA36B', '#8A5CD8', '#E8A126', '#D9488A', '#1A9AA0'];
const CA_LIB = { src: 'https://unpkg.com/ical.js@2.2.1/dist/ical.es5.min.cjs', sri: 'sha384-ju8ozm4ZyuCTzjb4fvLmPUASX0zfc5jLOvyN9wadLx23y965jxfdbKTPMIeLrliP' };
const CA_WORKER = `// Weiterleitung für Jeres Tagescockpit: holt einen öffentlich geteilten
// iCloud-Kalender und gibt ihn mit CORS-Freigabe an den Browser weiter.
// Aufruf: https://<dein-worker>.workers.dev/?url=<Kalender-Link>
const ERLAUBT = /(^|\\.)icloud\\.com$/i; // nur iCloud, sonst wäre es ein offener Proxy

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
`;
const ca = { busy: false, err: '', feedErr: {}, data: lsGet(CA_CACHE), lib: null, seq: 0, more: false, draft: null, last: 0 };
const caCfg = () => state.widgets.cal.cfg;
function caSec() {
  const s = lsGet(CA_KEY) || {};
  const feeds = (Array.isArray(s.feeds) ? s.feeds : []).filter(f => f && typeof f.url === 'string' && f.url).slice(0, 6)
    .map((f, i) => ({ id: String(f.id || uid()).slice(0, 16), name: String(f.name || `Kalender ${i + 1}`).slice(0, 30), url: f.url, color: CA_COLORS.includes(f.color) ? f.color : CA_COLORS[i % CA_COLORS.length] }));
  return { proxy: typeof s.proxy === 'string' ? s.proxy : '', feeds };
}
function caSaveSec(sec) {
  try { localStorage.setItem(CA_KEY, JSON.stringify(sec)); return true; } catch { return false; }
}
/* webcal:// und Leerzeichen raus, nur https */
function caNormUrl(u) {
  const s = String(u || '').trim().replace(/^webcal:\/\//i, 'https://');
  try { const x = new URL(s); return x.protocol === 'https:' && x.hostname ? x.href : null; } catch { return null; }
}
function caFetchUrl(feed, proxy) {
  const u = caNormUrl(feed.url);
  if (!proxy) return u;
  const p = new URL(proxy);
  p.searchParams.set('url', u);
  return p.href;
}
function caLoadLib() {
  if (window.ICAL) return Promise.resolve(window.ICAL);
  if (!ca.lib) {
    ca.lib = new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = CA_LIB.src;
      s.integrity = CA_LIB.sri;
      s.crossOrigin = 'anonymous';
      s.onload = () => (window.ICAL ? res(window.ICAL) : rej(new Error('lib')));
      s.onerror = () => { ca.lib = null; s.remove(); rej(new Error('lib')); };
      document.head.appendChild(s);
    });
  }
  return ca.lib;
}
async function caFetch(url) {
  const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 20000);
  try {
    const r = await fetch(url, { signal: ctl.signal, cache: 'no-store' });
    if (!r.ok) throw Object.assign(new Error('HTTP ' + r.status), { status: r.status });
    return await r.text();
  } finally { clearTimeout(timer); }
}
/* Alle Termine eines Kalenders im Zeitraum, Wiederholungen ausgerollt, verschobene und abgesagte Termine berücksichtigt */
function caExpand(ICAL, text, feed, from, to) {
  const comp = new ICAL.Component(ICAL.parse(text));
  for (const tz of comp.getAllSubcomponents('vtimezone')) { try { ICAL.TimezoneService.register(tz); } catch { /* unbekannte Zone, dann eben ohne */ } }
  const ves = comp.getAllSubcomponents('vevent');
  const uidOf = v => String(v.getFirstPropertyValue('uid') || '');
  const masters = new Set(ves.filter(v => !v.hasProperty('recurrence-id')).map(uidOf));
  const ex = new Map();
  for (const v of ves) if (v.hasProperty('recurrence-id') && masters.has(uidOf(v))) { const u = uidOf(v); if (!ex.has(u)) ex.set(u, []); ex.get(u).push(v); }
  const out = [], seen = new Set(), until = +to + 7 * DAY;
  const push = (item, st, en) => {
    if (!st) return;
    if (String(item.component.getFirstPropertyValue('status') || '').toUpperCase() === 'CANCELLED') return;
    const allDay = !!st.isDate, S = st.toJSDate();
    let E = en ? en.toJSDate() : null;
    if (!E || E < S) E = allDay ? addDays(S, 1) : S;
    if (allDay && +E === +S) E = addDays(S, 1);
    if (S >= to || E <= from && !(+E === +S && S >= from)) return;
    const id = `${feed.id}|${item.uid}|${+S}`;
    if (seen.has(id)) return;
    seen.add(id);
    out.push({ id, f: feed.id, t: String(item.summary || '').trim() || 'Ohne Titel', l: String(item.location || '').replace(/\s*\n\s*/g, ', ').trim(), s: +S, e: +E, a: allDay });
  };
  for (const v of ves) {
    const u = uidOf(v);
    if (v.hasProperty('recurrence-id') && masters.has(u)) continue;
    const ev = new ICAL.Event(v, { exceptions: ex.get(u) || [] });
    if (!ev.isRecurring()) { push(ev, ev.startDate, ev.endDate); continue; }
    const it = ev.iterator();
    let t, n = 0;
    while ((t = it.next()) && n++ < 20000) {
      if (+t.toJSDate() >= until) break;
      const d = ev.getOccurrenceDetails(t);
      push(d.item, d.startDate, d.endDate);
    }
  }
  return out;
}
const CA_ERR = {
  cors: 'Apple lässt den Browser den Kalender nicht direkt laden. Trag über die Regler oben rechts in dieser Karte deine Weiterleitung ein.',
  net: 'Keine Verbindung zum Kalender. Das Cockpit versucht es gleich nochmal.',
  403: 'Die Weiterleitung lässt diesen Link nicht durch. Erlaubt sind nur iCloud-Adressen.',
  404: 'Unter diesem Link gibt es keinen Kalender. Prüf, ob er in iCloud noch öffentlich geteilt ist.',
  parse: 'Unter dem Link kam kein Kalender zurück. Prüf den Link und die Weiterleitung.',
  lib: 'Der Kalender-Leser konnte nicht geladen werden. Das Cockpit versucht es gleich nochmal.'
};
async function caLoad() {
  const sec = caSec();
  if (!sec.feeds.length || ca.busy) return;
  const seq = ++ca.seq;
  ca.busy = true;
  ca.last = Date.now();
  renderCalAll();
  const from = sod(new Date()), to = addDays(from, 31);
  const feedErr = {}, events = [];
  let ICAL = null;
  try { ICAL = await caLoadLib(); } catch { ca.err = CA_ERR.lib; }
  if (ICAL) {
    await Promise.all(sec.feeds.map(async f => {
      let text;
      try { text = await caFetch(caFetchUrl(f, sec.proxy)); }
      catch (e) { feedErr[f.id] = e.status === 403 ? CA_ERR[403] : e.status === 404 ? CA_ERR[404] : e.status ? `Der Kalender antwortet mit Fehler ${e.status}.` : sec.proxy ? CA_ERR.net : CA_ERR.cors; return; }
      try {
        if (!/BEGIN:VCALENDAR/i.test(text)) throw new Error('kein ICS');
        events.push(...caExpand(ICAL, text, f, from, to));
      } catch { feedErr[f.id] = CA_ERR.parse; }
    }));
    ca.err = '';
  }
  if (seq !== ca.seq) return;
  ca.busy = false;
  ca.feedErr = feedErr;
  const okIds = new Set(sec.feeds.filter(f => !feedErr[f.id]).map(f => f.id));
  if (ICAL && okIds.size) {
    // Kalender, die gerade nicht laden, behalten ihre alten Termine
    const keep = ca.data && Array.isArray(ca.data.events) ? ca.data.events.filter(e => !okIds.has(e.f) && sec.feeds.some(f => f.id === e.f)) : [];
    ca.data = { at: Date.now(), events: [...events, ...keep].sort((a, b) => a.s - b.s || b.a - a.a || a.t.localeCompare(b.t, 'de')) };
    lsSet(CA_CACHE, ca.data);
  }
  if (!ICAL || Object.keys(feedErr).length) {
    clearTimeout(ca.retry);
    ca.retry = setTimeout(() => caLoad(), 3 * 6e4);
  }
  renderCalAll();
}
/* Termine eines Tages: ganztägige zuerst, dann nach Beginn */
function caDay(d, list) {
  const a = +sod(d), b = +addDays(sod(d), 1);
  return list.filter(e => e.s < b && (e.e > a || (e.e === e.s && e.s >= a))).sort((x, y) => (y.a - x.a) || x.s - y.s || x.t.localeCompare(y.t, 'de'));
}
const caDayName = (d, now) => { const n = dayDiff(now, d); return n === 0 ? 'Heute' : n === 1 ? 'Morgen' : WDL[d.getDay()]; };
/* Was als Nächstes kommt, für Kopf und Spiegel: läuft gerade oder beginnt in den nächsten 24 Stunden */
function caNext(now) {
  if (!ca.data || !caSec().feeds.length) return null;
  const t = +now, list = ca.data.events.filter(e => !e.a && e.e > t && e.s < t + DAY);
  if (!list.length) return null;
  const e = list.sort((x, y) => x.s - y.s)[0], s = new Date(e.s), en = new Date(e.e);
  if (e.s <= t) return { e, label: `Jetzt: ${e.t}`, sub: `bis ${hm(en)} Uhr` };
  const same = dayDiff(now, s) === 0;
  return { e, label: `${same ? '' : 'Morgen '}${hm(s)} ${e.t}`, sub: e.s - t < 2 * 36e5 ? `in ${dur(e.s - t)}` : same ? 'heute' : 'morgen' };
}
function caFeedColor(id) { const f = caSec().feeds.find(x => x.id === id); return f ? f.color : CA_COLORS[0]; }

function renderCal() {
  const sec = caSec(), c = caCfg(), now = new Date();
  const formOpen = !$('#ca-form').hidden;
  $('#ca-setup').hidden = formOpen || sec.feeds.length > 0;
  $('#ca-live').hidden = formOpen || !sec.feeds.length;
  $('#ca-refresh').hidden = formOpen || !sec.feeds.length;
  $('#ca-refresh').disabled = ca.busy;
  $('#ca-refresh').classList.toggle('spin', ca.busy);
  if (!sec.feeds.length || formOpen) return;
  // Automatisch aktualisieren, wenn die Daten älter als 15 Minuten sind
  if (!ca.busy && (!ca.data || Date.now() - ca.data.at > 15 * 6e4) && Date.now() - ca.last > 6e4) setTimeout(caLoad, 300);
  const evs = ca.data ? ca.data.events.filter(e => sec.feeds.some(f => f.id === e.f)) : [];
  const ul = $('#ca-list'), t0 = sod(now);
  const errs = sec.feeds.filter(f => ca.feedErr[f.id]).map(f => `${f.name}: ${ca.feedErr[f.id]}`);
  $('#ca-err').textContent = ca.err || errs.join(' ');
  $('#ca-err').hidden = !ca.err && !errs.length;
  if (!ca.data) { ul.innerHTML = ca.busy || !ca.err ? skelRows(4, 'Termine werden geladen') : '<li class="empty">Noch keine Termine geladen.</li>'; $('#ca-more').hidden = true; $('#ca-src').textContent = ''; return; }
  // Auf dem Handy erst mal nur die nächsten fünf, der Rest steckt hinter „Alle zeigen“
  const LIMIT = isNarrow() ? 5 : 9;
  const nx = caNext(now), nxIn = nx && nx.e.s > +now ? nx.e.s - now : 0;
  let html = '', shown = 0, total = 0, past = 0;
  for (let i = 0; i < c.days; i++) {
    const d = addDays(t0, i);
    let list = caDay(d, evs);
    if (i === 0) { const before = list.length; list = list.filter(e => e.a || e.e > +now || (e.e === e.s && e.s >= +now - 15 * 6e4)); past = before - list.length; }
    if (!list.length) continue;
    total += list.length;
    if (!ca.more && shown >= LIMIT) continue;
    html += `<li class="ca-day"><b>${caDayName(d, now)}</b><span>${i > 1 ? '' : WD[d.getDay()] + ' '}${d.getDate()}. ${MS[d.getMonth()]}</span></li>`;
    for (const e of list) {
      if (!ca.more && shown >= LIMIT) break;
      shown++;
      const s = new Date(e.s), en = new Date(e.e), live = !e.a && e.s <= +now && e.e > +now, next = !live && nx && nx.e === e && i === 0;
      let tm, sub = '';
      if (e.a) {
        const span = dayDiff(s, en);
        tm = 'Ganztags';
        if (span > 1) sub = `Tag ${dayDiff(s, d) + 1} von ${span}`;
      } else {
        const startsToday = sod(s).getTime() === +d, endsToday = sod(new Date(e.e - 1)).getTime() === +d;
        tm = startsToday ? hm(s) : 'weiter';
        sub = endsToday ? (e.e > e.s ? `bis ${hm(en)}` : '') : `bis ${WD[en.getDay()]} ${hm(en)}`;
      }
      const where = c.loc && e.l ? e.l : '';
      const tag = live ? '<span class="ca-now">Jetzt</span>' : next && nxIn < 3 * 36e5 ? `<span class="ca-in">in ${esc(dur(nxIn))}</span>` : '';
      html += `<li class="ca-ev${live ? ' is-now' : ''}${next ? ' is-next' : ''}" style="--c:${caFeedColor(e.f)}"><span class="ca-t">${esc(tm)}${!e.a && sub ? `<small>${esc(sub)}</small>` : ''}</span><span class="ca-main"><b>${esc(e.t)}</b>${e.a && sub ? `<small>${esc(sub)}</small>` : ''}${where ? `<small>${esc(where)}</small>` : ''}</span>${tag}</li>`;
    }
  }
  if (!total) html = `<li class="empty">Keine Termine in den nächsten ${c.days} Tagen${past ? ', die von heute sind schon vorbei' : ''}.</li>`;
  ul.innerHTML = html;
  $('#ca-more').hidden = total <= LIMIT;
  $('#ca-more').textContent = ca.more ? 'Weniger zeigen' : `Alle ${total} Termine zeigen`;
  const names = sec.feeds.length > 1 ? sec.feeds.map(f => `<span class="ca-key" style="--c:${f.color}">${esc(f.name)}</span>`).join('') : '';
  $('#ca-src').innerHTML = `${names}<span>Stand ${hm(new Date(ca.data.at))} Uhr${past ? `, ${past} ${past === 1 ? 'Termin' : 'Termine'} von heute schon vorbei` : ''}</span>`;
}
function renderCalAll() { if (views.has('cal')) renderCal(); if (views.has('bday')) renderBday(); renderSkyNext(); renderMirror(); }

/* Einrichten: Formular mit Kalendern, Weiterleitung und Zeitraum. Erst beim Speichern wird etwas übernommen. */
function caOpenForm() {
  const sec = caSec(), c = caCfg();
  ca.draft = sec.feeds.map(f => ({ ...f }));
  $('#ca-proxy').value = sec.proxy;
  $('#ca-days').value = String(c.days);
  $('#ca-loc').checked = c.loc;
  $('#ca-name').value = '';
  $('#ca-url').value = '';
  $('#ca-ferr').hidden = true;
  $('#ca-code').textContent = CA_WORKER;
  caRenderDraft();
  $('#ca-form').hidden = false;
  renderCal();
  (ca.draft.length ? $('#ca-proxy') : $('#ca-url')).focus();
}
function caRenderDraft() {
  const ul = $('#ca-feeds');
  ul.innerHTML = ca.draft.map((f, i) => `<li><button type="button" class="ca-dot" data-cacol="${i}" style="--c:${f.color}" aria-label="Farbe von ${esc(f.name)} ändern" title="Farbe ändern"></button><div class="tx"><b>${esc(f.name)}</b><span>${esc(f.url.replace(/^(webcal|https):\/\//i, '').slice(0, 44))}…</span></div><button type="button" class="icon-btn" data-cadel="${i}" aria-label="${esc(f.name)} entfernen">${TRASH}</button></li>`).join('');
  ul.hidden = !ca.draft.length;
  $('#ca-add').disabled = ca.draft.length >= 6;
  $('#ca-add').textContent = ca.draft.length >= 6 ? 'Maximal 6 Kalender' : '+ Kalender';
  $('#ca-forget').hidden = !caSec().feeds.length;
}
function caAddDraft() {
  const fail = m => { $('#ca-ferr').textContent = m; $('#ca-ferr').hidden = false; return false; };
  const raw = $('#ca-url').value.trim();
  if (!raw) return true;
  const url = caNormUrl(raw);
  if (!url) return fail('Der Link muss mit webcal:// oder https:// anfangen.');
  if (ca.draft.some(f => caNormUrl(f.url) === url)) return fail('Diesen Kalender hast du schon drin.');
  if (ca.draft.length >= 6) return fail('Mehr als 6 Kalender gehen nicht.');
  const used = new Set(ca.draft.map(f => f.color));
  ca.draft.push({ id: uid(), name: $('#ca-name').value.trim().slice(0, 30) || (ca.draft.length ? `Kalender ${ca.draft.length + 1}` : 'Privat'), url: raw.replace(/\s+/g, ''), color: CA_COLORS.find(x => !used.has(x)) || CA_COLORS[0] });
  $('#ca-name').value = '';
  $('#ca-url').value = '';
  $('#ca-ferr').hidden = true;
  caRenderDraft();
  return true;
}
$('#ca-setup-btn').addEventListener('click', caOpenForm);
$('#ca-set-btn').addEventListener('click', () => { if ($('#ca-form').hidden) caOpenForm(); else { $('#ca-form').hidden = true; renderCal(); } });
$('#ca-add').addEventListener('click', () => { if (caAddDraft()) $('#ca-url').focus(); });
$('#ca-url').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); caAddDraft(); } });
$('#ca-feeds').addEventListener('click', e => {
  const d = e.target.closest('[data-cadel]'), c = e.target.closest('[data-cacol]');
  if (d) { ca.draft.splice(+d.dataset.cadel, 1); caRenderDraft(); }
  if (c) { const f = ca.draft[+c.dataset.cacol]; f.color = CA_COLORS[(CA_COLORS.indexOf(f.color) + 1) % CA_COLORS.length]; caRenderDraft(); }
});
$('#ca-copy').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(CA_WORKER); toast('Worker-Code kopiert'); }
  catch {
    const r = document.createRange();
    r.selectNodeContents($('#ca-code'));
    const s = getSelection(); s.removeAllRanges(); s.addRange(r);
    toast('Code ist markiert, kopier ihn mit Strg+C oder Cmd+C');
  }
});
$('#ca-cancel').addEventListener('click', () => { $('#ca-form').hidden = true; ca.draft = null; renderCal(); });
$('#ca-forget').addEventListener('click', () => {
  try { localStorage.removeItem(CA_KEY); localStorage.removeItem(CA_CACHE); } catch { /* egal */ }
  ca.data = null; ca.feedErr = {}; ca.err = ''; ca.draft = null;
  $('#ca-form').hidden = true;
  renderCalAll();
  toast('Kalender aus diesem Browser entfernt');
});
$('#ca-form').addEventListener('submit', e => {
  e.preventDefault();
  const fail = m => { $('#ca-ferr').textContent = m; $('#ca-ferr').hidden = false; };
  if ($('#ca-url').value.trim() && !caAddDraft()) return;
  let proxy = $('#ca-proxy').value.trim();
  if (proxy) {
    if (!/^https?:\/\//i.test(proxy)) proxy = 'https://' + proxy;
    try { const x = new URL(proxy); if (x.protocol !== 'https:') throw 0; proxy = x.href; } catch { return fail('Die Weiterleitung braucht eine Adresse, die mit https:// anfängt.'); }
  }
  if (!ca.draft.length) return fail('Füg zuerst den Link von mindestens einem Kalender ein.');
  const old = caSec();
  if (!caSaveSec({ proxy, feeds: ca.draft })) return fail('Dein Browser speichert hier nichts, zum Beispiel im privaten Fenster.');
  const c = caCfg();
  c.days = +$('#ca-days').value || 14;
  c.loc = $('#ca-loc').checked;
  $('#ca-form').hidden = true;
  ca.draft = null;
  ca.more = false;
  const changed = old.proxy !== proxy || JSON.stringify(old.feeds.map(f => f.url)) !== JSON.stringify(caSec().feeds.map(f => f.url));
  commit();
  if (changed || !ca.data) { ca.feedErr = {}; ca.err = ''; ca.last = 0; caLoad(); }
});
$('#ca-refresh').addEventListener('click', () => { ca.last = 0; caLoad(); });
$('#ca-more').addEventListener('click', () => { ca.more = !ca.more; renderCal(); layoutNow(); });
/* Einmal pro Minute: alle 15 Minuten neu laden, auch wenn die Karte gerade nicht zu sehen ist (für Kopf und Spiegel) */
function caTick(now) {
  if (now.getSeconds() !== 7 || document.visibilityState !== 'visible' || ca.busy) return;
  if (caSec().feeds.length && (!ca.data || Date.now() - ca.data.at > 15 * 6e4) && Date.now() - ca.last > 6e4) caLoad();
  else if (views.has('cal') && !views.get('cal').el.hidden) renderCal();
}

defineWidget('cal', { render: renderCal });
