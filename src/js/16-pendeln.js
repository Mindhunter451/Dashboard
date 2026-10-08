/* Pendeln (gibt es nur einmal): Route über OSRM, Meldungen der Autobahn GmbH, optional Live-Fahrzeit von TomTom */
const TT_KEY = 'jere-cockpit-tomtom';
const cm = { dir: new Date().getHours() < 11 ? 'work' : 'home', seq: 0, timer: null, res: null, homeMins: null, map: null, layer: null, abCache: new Map() };
const ORDER = { closure: 0, jam: 1, slow: 2, warn: 3, works: 4 };
const cmPlaces = () => cm.dir === 'home' ? [state.commute.work, state.commute.home] : [state.commute.home, state.commute.work];
function cmPane(which) { for (const p of ['empty', 'off', 'live']) $('#cm-' + p).hidden = p !== which; }
function cmOff(title, text) { cmPane('off'); $('#cm-off-title').textContent = title; $('#cm-off-text').textContent = text; }
function cmDirUi() {
  $('#cm-dir-home').setAttribute('aria-pressed', String(cm.dir === 'home'));
  $('#cm-dir-work').setAttribute('aria-pressed', String(cm.dir === 'work'));
}
function cmLink() {
  const [a, b] = cmPlaces(), link = $('#cm-gmaps');
  link.hidden = !(a && b);
  if (a && b) link.href = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(a.text)}&destination=${encodeURIComponent(b.text)}&travelmode=driving`;
}
async function geocode(text) {
  const j = await getJson(`https://photon.komoot.io/api/?q=${encodeURIComponent(text)}&limit=1&lang=de&lat=53.55&lon=9.99`, 9000);
  const f = j && Array.isArray(j.features) ? j.features[0] : null;
  if (!f || !f.geometry) return null;
  const p = f.properties || {};
  const street = p.street ? `${p.street}${p.housenumber ? ' ' + p.housenumber : ''}` : (p.name || '');
  const town = p.city || p.town || p.village || p.district || '';
  const label = [street, [p.postcode, town !== street ? town : ''].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  return { lat: +f.geometry.coordinates[1], lon: +f.geometry.coordinates[0], label: label || text };
}
function prepRoute(coords) {
  const lat0 = coords[0][1] * Math.PI / 180, kx = 111320 * Math.cos(lat0), ky = 110540;
  const pts = coords.map(([lo, la]) => [lo * kx, la * ky]);
  const cum = [0];
  let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
  coords.forEach(([lo, la], i) => {
    if (i) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    a = Math.min(a, la); b = Math.min(b, lo); c = Math.max(c, la); d = Math.max(d, lo);
  });
  return { kx, ky, pts, cum, bbox: [a, b, c, d] };
}
function nearestOn(g, lon, lat) {
  const x = lon * g.kx, y = lat * g.ky;
  let best = { d: Infinity, along: 0 };
  for (let i = 0; i < g.pts.length - 1; i++) {
    const [ax, ay] = g.pts[i], [bx, by] = g.pts[i + 1];
    const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy;
    const t = L2 ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / L2)) : 0;
    const dd = Math.hypot(x - (ax + t * dx), y - (ay + t * dy));
    if (dd < best.d) best = { d: dd, along: g.cum[i] + t * Math.sqrt(L2) };
  }
  return best;
}
async function abFetch(road, svc) {
  const key = road + '/' + svc, hit = cm.abCache.get(key);
  if (hit && Date.now() - hit.at < 4 * 6e4) return hit.items;
  const j = await getJson(`https://verkehr.autobahn.de/o/autobahn/${road}/services/${svc}`, 15000);
  const items = j && Array.isArray(j[svc]) ? j[svc] : [];
  cm.abCache.set(key, { at: Date.now(), items });
  return items;
}
function toIncident(it, svc, road, along, lat, lon) {
  const blocked = String(it.isBlocked) === 'true';
  let k, label;
  if (svc === 'closure' || blocked) { k = 'closure'; label = 'Sperrung'; }
  else if (svc === 'roadworks') { k = 'works'; label = 'Baustelle'; }
  else {
    const t = String(it.abnormalTrafficType || '');
    if (/STATIONARY|QUEUING/.test(t)) { k = 'jam'; label = 'Stau'; }
    else if (/SLOW/.test(t)) { k = 'slow'; label = 'Zähfließend'; }
    else { k = 'warn'; label = 'Meldung'; }
  }
  const m = String(it.subtitle || '').match(/->\s*(.+)$/);
  return {
    k, label, road, along, lat, lon, src: 'ab',
    delay: Number.parseInt(it.delayTimeValue, 10) || 0,
    title: String(it.title || '').replace(/^\s*A\s?\d+\s*\|\s*/, '').replace(/\s+-\s+/g, ' bis ').trim() || road,
    dir: m ? `Richtung ${m[1].trim()}` : '',
    desc: (Array.isArray(it.description) ? it.description : []).map(s => String(s).trim()).filter(Boolean).slice(0, 12)
  };
}
async function autobahnItems(roads, g, skipWarnings) {
  const jobs = [];
  for (const r of roads) for (const svc of ['closure', 'warning', 'roadworks']) {
    if (skipWarnings && svc === 'warning') continue;
    jobs.push(abFetch(r, svc).then(items => ({ r, svc, items })).catch(() => ({ r, svc, items: [], failed: true })));
  }
  const res = await Promise.all(jobs);
  const out = [], seen = new Set();
  const [aLat, aLon, bLat, bLon] = g.bbox, pad = 0.03;
  let failed = 0;
  for (const { r, svc, items, failed: f } of res) {
    if (f) failed++;
    for (const it of items) {
      if (it.future === true || it.future === 'true') continue;
      const c = it.coordinate || {}, la = +c.lat, lo = +c.long;
      if (!(la > aLat - pad && la < bLat + pad && lo > aLon - pad && lo < bLon + pad)) continue;
      let line = it.geometry && Array.isArray(it.geometry.coordinates) ? it.geometry.coordinates : null;
      if (line && it.geometry.type === 'MultiLineString') line = line.flat();
      if (!line || !line.length || !Array.isArray(line[0])) line = [[lo, la]];
      const n = line.length, S = 60;
      const idx = n <= S ? line.map((_, i) => i) : Array.from({ length: S }, (_, q) => Math.round(q * (n - 1) / (S - 1)));
      const near = idx.map(i => ({ i, ...nearestOn(g, +line[i][0], +line[i][1]) })).filter(x => x.d < 200);
      if (!near.length) continue;
      if (near.length >= 2) {
        if (near[near.length - 1].along < near[0].along - 50) continue; // Gegenrichtung
      } else if (n > 1) {
        // nur ein Treffer: Fahrtrichtung über die direkten Nachbarpunkte der Meldung prüfen
        const j = near[0].i, a = line[Math.max(0, j - 1)], b = line[Math.min(n - 1, j + 1)];
        const na = nearestOn(g, +a[0], +a[1]), nb = nearestOn(g, +b[0], +b[1]);
        if (na.d < 300 && nb.d < 300 && nb.along < na.along - 5) continue;
      }
      const id = it.identifier || `${r}${svc}${la}${lo}`;
      if (seen.has(id)) continue;
      seen.add(id);
      const inc = toIncident(it, svc, r, near[0].along, la, lo);
      // Abschnitt der Meldung, der auf der eigenen Strecke liegt (für die farbige Linie auf der Karte)
      if (n > 1) {
        const step = Math.max(1, Math.ceil(n / 160)), seg = [];
        for (let i = 0; i < n; i += step) { const p = line[i]; if (nearestOn(g, +p[0], +p[1]).d < 250) seg.push([+p[1], +p[0]]); }
        const lastP = line[n - 1];
        if ((n - 1) % step && nearestOn(g, +lastP[0], +lastP[1]).d < 250) seg.push([+lastP[1], +lastP[0]]);
        if (seg.length > 1) inc.seg = seg;
      }
      out.push(inc);
    }
  }
  return { list: out, failed };
}
async function tomtom(from, to) {
  let key = null;
  try { key = localStorage.getItem(TT_KEY); } catch { key = null; }
  if (!key) return null;
  const j = await getJson(`https://api.tomtom.com/routing/1/calculateRoute/${from.lat},${from.lon}:${to.lat},${to.lon}/json?key=${encodeURIComponent(key)}&traffic=true&travelMode=car&routeType=fastest&sectionType=traffic&computeTravelTimeFor=all&language=de-DE`, 12000);
  const r = j && Array.isArray(j.routes) ? j.routes[0] : null;
  if (!r || !r.summary || !Number.isFinite(+r.summary.travelTimeInSeconds)) throw new Error('tomtom');
  const points = (r.legs || []).flatMap(l => (l.points || []).map(p => [+p.longitude, +p.latitude]));
  const g = points.length > 1 ? prepRoute(points) : null;
  const CAT = { JAM: ['jam', 'Stau'], ROAD_WORK: ['works', 'Baustelle'], ROAD_CLOSURE: ['closure', 'Sperrung'] };
  const secs = (r.sections || []).filter(s => s.sectionType === 'TRAFFIC').map(s => {
    const [k, label] = CAT[s.simpleCategory] || ['warn', 'Behinderung'];
    const si = Math.min(+s.startPointIndex || 0, points.length - 1), ei = Math.min(+s.endPointIndex || si, points.length - 1);
    const p = points[si] || [0, 0];
    const along = g ? g.cum[si] : 0, len = g ? g.cum[ei] - along : 0;
    const seg = ei > si ? points.slice(si, ei + 1).map(([lo, la]) => [la, lo]) : null;
    const kk = k === 'jam' && Number.isFinite(+s.effectiveSpeedInKmh) && +s.effectiveSpeedInKmh > 25 ? 'slow' : k;
    return { k: kk, label: kk === 'slow' ? 'Zähfließend' : label, road: '', along, lat: p[1], lon: p[0], src: 'tt', seg, delay: Math.round((+s.delayInSeconds || 0) / 60), title: len > 50 ? `${kk === 'slow' ? 'Zähfließend' : label} auf ${numDe(len / 1000, 1)} km` : label, dir: Number.isFinite(+s.effectiveSpeedInKmh) && s.effectiveSpeedInKmh ? `etwa ${Math.round(s.effectiveSpeedInKmh)} km/h` : '', desc: [] };
  });
  const sm = r.summary;
  return { time: +sm.travelTimeInSeconds, delay: +sm.trafficDelayInSeconds || 0, length: +sm.lengthInMeters || 0, secs, points };
}
async function loadCommute() {
  clearTimeout(cm.timer);
  cmDirUi();
  cmLink();
  const c = state.commute;
  if (!c.home || !c.work) { cmPane('empty'); $('#cm-src').textContent = ''; return; }
  const seq = ++cm.seq;
  if (!cm.res) cmOff('Strecke wird berechnet', 'Einen Moment, Route und Verkehrsmeldungen kommen gleich.');
  try {
    let changed = false;
    for (const k of ['home', 'work']) {
      const p = state.commute[k];
      if (p.lat !== null && p.lon !== null) continue;
      const g = await geocode(p.text);
      if (seq !== cm.seq) return;
      if (!g) { cmOff('Adresse nicht gefunden', `„${p.text}“ findet die Kartensuche nicht. Tipp auf „Adressen“ und schreib sie genauer, am besten mit Ort.`); return; }
      Object.assign(p, g);
      changed = true;
    }
    if (changed) commit();
    const [from, to] = cmPlaces();
    const q = `${from.lon},${from.lat};${to.lon},${to.lat}?overview=full&geometries=geojson&steps=true`;
    let o;
    try { o = await getJson(`https://routing.openstreetmap.de/routed-car/route/v1/driving/${q}`, 12000); }
    catch { o = await getJson(`https://router.project-osrm.org/route/v1/driving/${q}`, 12000); }
    const route = o && Array.isArray(o.routes) ? o.routes[0] : null;
    if (!route) { cmOff('Keine Route gefunden', 'Zwischen den beiden Adressen findet der Routenplaner keine Autostrecke. Check die Adressen.'); return; }
    const refs = new Set();
    for (const leg of route.legs || []) for (const s of leg.steps || []) for (const part of String(s.ref || '').split(';')) {
      const m = part.trim().match(/^A\s?(\d+)$/);
      if (m) refs.add('A' + m[1]);
    }
    const g = prepRoute(route.geometry.coordinates);
    const tt = await tomtom(from, to).catch(() => ({ error: true }));
    const ab = await autobahnItems([...refs], g, !!(tt && !tt.error));
    if (seq !== cm.seq) return;
    cm.res = { dir: cm.dir, from, to, route, refs: [...refs], ab, tt, at: Date.now() };
    renderCommute();
    cm.timer = setTimeout(loadCommute, 5 * 6e4);
  } catch (e) {
    if (seq !== cm.seq) return;
    if (cm.res && cm.res.dir === cm.dir) { $('#cm-src').textContent = `Stand ${hm(new Date(cm.res.at))} Uhr. Aktualisieren hat gerade nicht geklappt.`; cm.timer = setTimeout(loadCommute, 2 * 6e4); }
    else { cmOff('Verkehrsdaten gerade nicht erreichbar', 'In ein paar Minuten gibt es automatisch einen neuen Versuch.'); cm.timer = setTimeout(loadCommute, 3 * 6e4); }
  }
}
function renderCommute() {
  const R = cm.res;
  if (!R) return;
  cmPane('live');
  const tt = R.tt && !R.tt.error ? R.tt : null;
  const items = [...(tt ? tt.secs : []), ...R.ab.list].sort((x, y) => (ORDER[x.k] - ORDER[y.k]) || x.along - y.along);
  const abDelay = R.ab.list.filter(i => i.k !== 'works').reduce((s, i) => s + i.delay, 0);
  const mins = tt ? tt.time / 60 : R.route.duration / 60 + abDelay;
  const delay = tt ? tt.delay / 60 : abDelay;
  const km = (tt && tt.length ? tt.length : R.route.distance) / 1000;
  const rmins = Math.max(1, Math.round(mins));
  if (R.dir === 'home') cm.homeMins = rmins;
  $('#cm-time').textContent = rmins;
  $('#cm-time-lbl').textContent = `Min ${R.dir === 'home' ? 'nach Hause' : 'zur Arbeit'}${tt ? ', live' : ''}`;
  const now = new Date();
  const dl = [['Jetzt los', `an ${hm(new Date(now.getTime() + mins * 6e4))} Uhr`], ['Strecke', `${numDe(km, 1)} km${R.refs.length ? ' über ' + R.refs.join(', ') : ''}`], ['Verzögerung', delay >= 1 ? `+${Math.round(delay)} Min` : 'keine']];
  const wb = workBar();
  if (R.dir === 'home' && wb && !freeReason(wb, now) && now < at(now, wb.end)) dl.splice(1, 0, [`Ab ${wb.end}`, `an ${hm(new Date(at(now, wb.end).getTime() + mins * 6e4))} Uhr`]);
  $('#cm-dl').innerHTML = dl.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('');
  $('#cm-route').textContent = `${R.from.label || R.from.text} → ${R.to.label || R.to.text}`;
  const closures = items.filter(i => i.k === 'closure').length, works = items.filter(i => i.k === 'works').length;
  let v, lv;
  if (closures) { v = `Achtung, ${closures === 1 ? 'eine Sperrung' : closures + ' Sperrungen'} auf deiner Strecke.`; lv = 'bad'; }
  else if (delay >= 10) { v = `Stau auf der Strecke, plan etwa ${Math.round(delay)} Min mehr ein.`; lv = 'warn'; }
  else if (delay >= 3) { v = `Etwas zäh, etwa ${Math.round(delay)} Min länger als sonst.`; lv = 'warn'; }
  else { v = tt ? 'Freie Fahrt, kein Stau auf deiner Strecke.' : (R.refs.length ? 'Freie Fahrt, auf der Autobahn ist kein Stau gemeldet.' : 'Keine Meldungen. Deine Strecke läuft ohne Autobahn, Stadtverkehr zeigt Google Maps.'); lv = 'ok'; }
  if (works) v += ` ${works === 1 ? 'Eine Baustelle' : works + ' Baustellen'} unterwegs.`;
  const ve = $('#cm-verdict');
  ve.textContent = v;
  ve.dataset.lv = lv;
  const jam = items.filter(i => i.k === 'jam' || i.k === 'slow').length;
  $('#cm-ov').dataset.lv = lv;
  $('#cm-ov-t').textContent = closures ? (closures === 1 ? 'Sperrung auf der Strecke' : `${closures} Sperrungen`) : delay >= 1 ? `+${Math.round(delay)} Min durch Stau` : jam ? 'Leicht zäh' : 'Freie Fahrt';
  $('#cm-ov-s').textContent = `${rmins} Min · ${numDe(km, 1)} km · an ${hm(new Date(now.getTime() + mins * 6e4))}`;
  const LEG = [['jam', 'Stau', '--bad'], ['slow', 'Zähfließend', '--warn'], ['closure', 'Sperrung', '--bad', 'dash'], ['works', 'Baustelle', '--muted', 'dash']];
  $('#cm-legend').innerHTML = LEG.filter(([k]) => items.some(i => i.k === k || (k === 'slow' && i.k === 'warn'))).map(([, n, c, d]) => `<li><i class="${d || ''}" style="--c:var(${c})"></i>${n}</li>`).join('');

  const ul = $('#cm-inc');
  ul.textContent = '';
  const LIMIT = 6;
  const shown = cm.allInc ? items : items.slice(0, LIMIT);
  for (const it of shown) {
    const li = document.createElement('li');
    li.className = 'inc';
    li.dataset.k = it.k;
    li.innerHTML = `<span class="inc-type">${esc(it.label)}</span><div class="inc-main"><div class="inc-title"></div><div class="inc-sub"></div></div><span class="inc-delay">${it.delay ? '+' + it.delay + ' Min' : ''}</span>`;
    li.querySelector('.inc-title').textContent = it.title;
    li.querySelector('.inc-sub').textContent = [it.road, it.dir, `nach ${numDe(it.along / 1000, it.along < 10000 ? 1 : 0)} km`].filter(Boolean).join(' · ');
    if (it.desc.length) {
      const d = document.createElement('details');
      d.innerHTML = '<summary>Details</summary>';
      it.desc.forEach(line => { const p = document.createElement('p'); p.textContent = line; d.appendChild(p); });
      li.querySelector('.inc-main').appendChild(d);
    }
    ul.appendChild(li);
  }
  if (items.length > LIMIT) {
    const li = document.createElement('li');
    const more = document.createElement('button');
    more.type = 'button';
    more.className = 'more';
    more.textContent = cm.allInc ? 'Weniger anzeigen' : `${items.length - LIMIT} weitere Meldungen`;
    more.addEventListener('click', () => { cm.allInc = !cm.allInc; renderCommute(); });
    li.appendChild(more);
    ul.appendChild(li);
  }
  const hints = [];
  if (!tt) hints.push(R.tt && R.tt.error ? 'Der TomTom-Key funktioniert gerade nicht, deshalb ohne Live-Stadtverkehr.' : 'Fahrzeit = normale Fahrzeit plus gemeldete Autobahn-Staus. Stau in der Stadt zeigt Google Maps, oder du hinterlegst unter „Adressen“ einen TomTom-Key.');
  if (R.ab.failed) hints.push('Ein Teil der Autobahn-Meldungen fehlt gerade.');
  $('#cm-hint').textContent = hints.join(' ');
  $('#cm-hint').hidden = !hints.length;
  $('#cm-src').textContent = `Stand ${hm(new Date(R.at))} Uhr · Route: OpenStreetMap · Meldungen: Autobahn GmbH${tt ? ' · Live-Fahrzeit: TomTom' : ''}`;
  cm.items = items;
  cmMap(R, items, tt);
  tickTiles(new Date());
}
const ICO = {
  home: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 3.2 2.8 10.6a1 1 0 0 0 1.25 1.56L5 11.4V20a1 1 0 0 0 1 1h4.2v-5.6h3.6V21H18a1 1 0 0 0 1-1v-8.6l.95.76a1 1 0 1 0 1.25-1.56z"/></svg>',
  work: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M9 4.5A1.5 1.5 0 0 0 7.5 6v1H4.5A1.5 1.5 0 0 0 3 8.5v3.2h18V8.5A1.5 1.5 0 0 0 19.5 7h-3V6A1.5 1.5 0 0 0 15 4.5zm.5 2h5V7h-5zM3 13.2v5.3A1.5 1.5 0 0 0 4.5 20h15a1.5 1.5 0 0 0 1.5-1.5v-5.3h-7.5v1.3h-3v-1.3z"/></svg>',
  closure: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10" width="14" height="4" rx="1.2" fill="#fff"/></svg>',
  jam: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="10.5" y="4.5" width="3" height="10" rx="1.5" fill="#fff"/><circle cx="12" cy="18.4" r="1.9" fill="#fff"/></svg>',
  works: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10.4 3.5h3.2l4.7 14.5H5.7z" fill="#fff"/><path d="M8.3 12.2h7.4M9.4 8.4h5.2" style="stroke:var(--c);stroke-width:1.8"/><rect x="4" y="18" width="16" height="2.5" rx="1" fill="#fff"/></svg>'
};
const incColor = k => ({ closure: '--bad', jam: '--bad', slow: '--warn', warn: '--warn', works: '--muted' }[k]);
function refreshMapLook() {
  if (rd.base) rd.base.setUrl(esriUrl('Base'));
  if (rd.ref) rd.ref.setUrl(esriUrl('Reference'));
  if (rd.marker) rd.marker.setStyle({ fillColor: getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() });
  if (cm.base) cm.base.setUrl(esriUrl('Base'));
  if (cm.ref) cm.ref.setUrl(esriUrl('Reference'));
  if (cm.map && cm.res && cm.items) cmMap(cm.res, cm.items, cm.res.tt && !cm.res.tt.error ? cm.res.tt : null, true);
}
function cmFit(anim) {
  if (!cm.map || !cm.layer) return;
  // Karte auf einer anderen Seite: erst einpassen, wenn sie sichtbar wird
  if (!$('#cm-map').offsetWidth) { cm.needFit = true; return; }
  cm.needFit = false;
  cm.map.invalidateSize();
  const tl = $('#cm-ov').offsetHeight + 16;
  cm.map.fitBounds(cm.bounds || cm.layer.getBounds(), { paddingTopLeft: [28, Math.min(tl, 90)], paddingBottomRight: [56, 28], animate: !!anim && !reduceMotion });
}
async function cmMap(R, items, tt, keepView) {
  let L;
  try { L = await loadLeaflet(); } catch { $('#cm-wrap').hidden = true; return; }
  if (cm.res !== R) return;
  const css = getComputedStyle(document.documentElement), col = n => css.getPropertyValue(n).trim();
  if (!cm.map) {
    cm.map = L.map('cm-map', { scrollWheelZoom: false, zoomControl: false });
    L.control.zoom({ position: 'bottomright' }).addTo(cm.map);
    cm.map.createPane('labels');
    cm.map.getPane('labels').style.zIndex = 450;
    cm.map.getPane('labels').style.pointerEvents = 'none';
    cm.base = L.tileLayer(esriUrl('Base'), { maxNativeZoom: 16, maxZoom: 18, attribution: 'Karte &copy; Esri · Meldungen &copy; Autobahn GmbH' }).addTo(cm.map);
    cm.ref = L.tileLayer(esriUrl('Reference'), { pane: 'labels', maxNativeZoom: 16, maxZoom: 18 }).addTo(cm.map);
    $('#cm-full').hidden = !document.fullscreenEnabled;
    if (typeof ResizeObserver === 'function') new ResizeObserver(() => {
      if (!cm.map) return;
      cm.map.invalidateSize();
      if (cm.needFit && $('#cm-map').offsetWidth) cmFit(false);
    }).observe($('#cm-map'));
  }
  if (cm.layer) cm.map.removeLayer(cm.layer);
  const line = (tt && tt.points.length > 1 ? tt.points : R.route.geometry.coordinates).map(([lo, la]) => [la, lo]);
  const grp = L.featureGroup();
  const round = { lineCap: 'round', lineJoin: 'round', interactive: false };
  // Route: Schatten, Kontur, Linie, laufende Richtungspunkte
  L.polyline(line, { ...round, color: '#000', opacity: 0.16, weight: 13 }).addTo(grp);
  L.polyline(line, { ...round, color: col('--surface'), opacity: 1, weight: 10 }).addTo(grp);
  L.polyline(line, { ...round, color: col('--sea'), opacity: 1, weight: 6 }).addTo(grp);
  // Verkehr: betroffene Abschnitte farbig über der Route
  const order = ['works', 'warn', 'slow', 'jam', 'closure'];
  for (const it of [...items].sort((a, b) => order.indexOf(a.k) - order.indexOf(b.k))) {
    if (!it.seg || it.seg.length < 2) continue;
    const c = col(incColor(it.k)), dashed = it.k === 'works' || it.k === 'closure';
    if (dashed) L.polyline(it.seg, { ...round, color: col('--surface'), opacity: 1, weight: 7 }).addTo(grp);
    L.polyline(it.seg, { ...round, color: c, opacity: 1, weight: dashed ? 5 : 6, dashArray: dashed ? '2 9' : null }).addTo(grp);
  }
  if (!reduceMotion) L.polyline(line, { ...round, color: '#ffffff', opacity: 0.9, weight: 2.2, dashArray: '1 17', className: 'cm-flow' }).addTo(grp);
  // Start und Ziel
  const startIco = R.dir === 'home' ? ICO.work : ICO.home, endIco = R.dir === 'home' ? ICO.home : ICO.work;
  L.marker(line[0], { icon: L.divIcon({ className: 'pin', html: `<div class="pin-start">${startIco}</div>`, iconSize: [28, 28], iconAnchor: [14, 14] }), keyboard: false })
    .bindTooltip(esc(`Start: ${R.from.label || R.from.text}`), { direction: 'top', offset: [0, -14] }).addTo(grp);
  L.marker(line[line.length - 1], { icon: L.divIcon({ className: 'pin', html: `<div class="pin-end">${endIco}</div>`, iconSize: [34, 34], iconAnchor: [17, 41] }), keyboard: false, zIndexOffset: 500 })
    .bindTooltip(esc(`Ziel: ${R.to.label || R.to.text}`), { direction: 'top', offset: [0, -40] }).addTo(grp);
  // Meldungen als Symbole
  for (const it of items) {
    if (!Number.isFinite(it.lat) || !Number.isFinite(it.lon)) continue;
    const glyph = it.k === 'closure' ? ICO.closure : it.k === 'works' ? ICO.works : ICO.jam;
    L.marker([it.lat, it.lon], { icon: L.divIcon({ className: 'pin', html: `<div class="pin-inc" style="--c:var(${incColor(it.k)})">${glyph}</div>`, iconSize: [24, 24], iconAnchor: [12, 12] }), keyboard: false, zIndexOffset: it.k === 'closure' ? 300 : it.k === 'works' ? 0 : 200 })
      .bindTooltip(esc(`${it.label}${it.delay ? ` (+${it.delay} Min)` : ''}: ${it.title}`), { direction: 'top', offset: [0, -12] }).addTo(grp);
  }
  grp.addTo(cm.map);
  cm.layer = grp;
  cm.bounds = L.latLngBounds(line);
  if (!keepView) setTimeout(() => cmFit(false), 60);
}
$('#cm-fit').addEventListener('click', () => cmFit(true));
$('#cm-full').addEventListener('click', () => {
  const w = $('#cm-wrap');
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  else if (w.requestFullscreen) w.requestFullscreen().catch(() => {});
});
document.addEventListener('fullscreenchange', () => {
  const on = document.fullscreenElement === $('#cm-wrap');
  if (cm.map) { cm.map.scrollWheelZoom[on ? 'enable' : 'disable'](); setTimeout(() => cmFit(false), 120); }
});
function setDir(d) { if (cm.dir === d) return; cm.dir = d; cm.allInc = false; cm.res = null; loadCommute(); }
$('#cm-dir-home').addEventListener('click', () => setDir('home'));
$('#cm-dir-work').addEventListener('click', () => setDir('work'));
function openCmForm() {
  $('#cm-home').value = state.commute.home ? state.commute.home.text : '';
  $('#cm-work').value = state.commute.work ? state.commute.work.text : '';
  let key = '';
  try { key = localStorage.getItem(TT_KEY) || ''; } catch { key = ''; }
  $('#cm-key').value = key;
  $('#cm-err').hidden = true;
  $('#cm-form').hidden = false;
  $('#cm-home').focus();
}
$('#cm-set-btn').addEventListener('click', () => { if ($('#cm-form').hidden) openCmForm(); else $('#cm-form').hidden = true; });
$('#cm-empty-btn').addEventListener('click', openCmForm);
$('#cm-cancel').addEventListener('click', () => { $('#cm-form').hidden = true; });
$('#cm-form').addEventListener('submit', e => {
  e.preventDefault();
  const h = $('#cm-home').value.trim(), w = $('#cm-work').value.trim();
  if (!h || !w) { $('#cm-err').textContent = 'Trag beide Adressen ein, Zuhause und Arbeit.'; $('#cm-err').hidden = false; return; }
  const keep = (old, text) => old && old.text === text ? old : { text, label: '', lat: null, lon: null };
  state.commute = { home: keep(state.commute.home, h), work: keep(state.commute.work, w) };
  const k = $('#cm-key').value.trim();
  try { if (k) localStorage.setItem(TT_KEY, k); else localStorage.removeItem(TT_KEY); } catch { /* Browser speichert nicht */ }
  $('#cm-form').hidden = true;
  cm.res = null;
  cm.homeMins = null;
  commit();
  loadCommute();
});

defineWidget('commute', {});
