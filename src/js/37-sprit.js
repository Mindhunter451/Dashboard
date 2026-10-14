/* Spritpreise über Tankerkönig (Daten der Markttransparenzstelle, Lizenz CC BY 4.0). Braucht einen eigenen kostenlosen Key.
 * Tankerkönig bittet um höchstens eine Abfrage pro Minute und keine Abfragen ohne Anlass. Deshalb wird nur geladen,
 * wenn das Widget sichtbar ist und die Daten älter als 10 Minuten sind, oder auf Knopfdruck.
 * Gesucht wird auf der Pendelstrecke (eine Umkreissuche um die Streckenmitte), rund um Zuhause oder an einem eigenen Ort:
 * gesucht über die Ortssuche, derselbe wie beim Wetter oder dein Standort. Jeder Ort hat seinen eigenen Zwischenspeicher,
 * so kostet das Hin- und Herschalten keine neue Abfrage. */
const FU_KEY = 'jere-cockpit-tankerkoenig', FU_CACHE = 'jere-cockpit-sprit';
const TKG = 'https://creativecommons.tankerkoenig.de/json';
const FU_TYPE = { e5: 'Super E5', e10: 'Super E10', diesel: 'Diesel' };
const FU_RADS = [3, 5, 10, 25];
const fu = { busy: false, err: '', note: '', last: 0, store: fuStoreLoad(), here: null, wait: null };
function fuStoreLoad() { const s = lsGet(FU_CACHE); return s && s.v === 2 && s.areas && typeof s.areas === 'object' ? s : { v: 2, areas: {} }; }
const fuKey = () => { try { return localStorage.getItem(FU_KEY) || ''; } catch { return ''; } };
const fuCfg = () => state.widgets.fuel.cfg;
const fuHasRoute = () => !!(state.commute.home && state.commute.work);
const fuIsGeo = c => c.mode === 'place' && c.place && c.place.how === 'geo';
const fuPrice = p => { const s = p.toFixed(3); return `${s.slice(0, -1).replace('.', ',')}<sup>${s.slice(-1)}</sup>`; };
const fuNice = s => { const t = String(s || '').trim(); return t.length > 3 && t === t.toUpperCase() ? t.toLowerCase().replace(/(^|[\s\-/.(])(\p{L})/gu, (m, a, b) => a + b.toUpperCase()) : t; };
/* Name des eigenen Orts, so wie ihn der Knopf und die Hinweise zeigen */
function fuPlaceName(P) {
  if (!P) return '';
  if (P.how === 'geo') return 'Hier';
  if (P.how === 'wx') return wx.loc ? wx.loc.name : 'Ort vom Wetter';
  return P.name;
}

/* Suchgebiet je nach Modus */
function fuArea(c = fuCfg()) {
  if (c.mode === 'route') {
    const R = cm.res;
    if (!R || !R.route || !R.route.geometry) return null;
    const coords = R.route.geometry.coordinates, g = prepRoute(coords), total = g.cum[g.cum.length - 1];
    let i = g.cum.findIndex(x => x >= total / 2);
    if (i < 0) i = Math.floor(coords.length / 2);
    return { key: 'route', lat: coords[i][1], lon: coords[i][0], rad: Math.min(25, Math.max(3, total / 2000 + 2)), g, total, dir: R.dir };
  }
  let p = null;
  if (c.mode === 'home') {
    const h = state.commute.home;
    p = h && h.lat != null ? h : wx.loc;
  } else if (c.place) {
    p = c.place.how === 'fixed' ? c.place : c.place.how === 'wx' ? wx.loc : fu.here;
  }
  if (!p || !Number.isFinite(+p.lat) || !Number.isFinite(+p.lon)) return null;
  const lat = +p.lat, lon = +p.lon;
  return { key: `${lat.toFixed(3)},${lon.toFixed(3)},${c.rad}`, lat, lon, rad: c.rad };
}
const fuDataOf = A => (A && fu.store.areas[A.key]) || null;
/* Zwischenspeicher: höchstens vier Orte, der älteste fliegt raus */
function fuStoreSave(key, entry) {
  fu.store.areas[key] = entry;
  const keys = Object.keys(fu.store.areas).sort((a, b) => fu.store.areas[b].at - fu.store.areas[a].at);
  for (const k of keys.slice(4)) delete fu.store.areas[k];
  lsSet(FU_CACHE, fu.store);
}
async function fuLoad(manual) {
  const key = fuKey(), c = fuCfg();
  if (!key || fu.busy) return;
  // Automatisch nur, wenn die Daten wirklich fehlen oder alt sind
  // manual: true holt immer neu (Knopf), 'soft' nur bei alten Daten, sagt aber Bescheid, wenn Tankerkönig noch warten lässt
  const force = manual === true, D0 = fuDataOf(fuArea(c));
  if (!force && D0 && Date.now() - D0.at < 10 * 6e4) { renderFuel(); return; }
  const since = Date.now() - fu.last;
  if (since < 61e3) {
    // Erst nach einer Minute wieder fragen, dann automatisch
    clearTimeout(fu.wait);
    fu.wait = setTimeout(() => { fu.note = ''; fuLoad(); }, 61e3 - since + 500);
    if (manual) { fu.note = `Tankerkönig erlaubt nur eine Abfrage pro Minute. Neue Preise kommen in ${Math.ceil((61e3 - since) / 1000)} Sekunden von selbst.`; renderFuel(); }
    return;
  }
  fu.note = '';
  if (fuIsGeo(c) && !fu.here) {
    fu.busy = true;
    renderFuel();
    const p = await geo();
    fu.busy = false;
    if (!p) { fu.err = 'Dein Standort ist gerade nicht verfügbar. Erlaub den Zugriff im Browser oder such dir einen Ort über die Regler oben rechts.'; renderFuel(); return; }
    fu.here = { lat: p.latitude, lon: p.longitude };
  }
  const A = fuArea(c);
  if (!A) {
    fu.err = c.mode === 'route' ? '' : c.mode === 'home' ? 'Dafür fehlt deine Heimadresse. Trag sie im Pendeln-Widget über die Regler oben rechts ein.' : c.place && c.place.how === 'wx' ? '' : 'Such dir zuerst einen Ort über die Regler oben rechts.';
    renderFuel();
    return;
  }
  const D = fuDataOf(A);
  if (!force && D && Date.now() - D.at < 10 * 6e4) { renderFuel(); return; }
  fu.busy = true;
  fu.last = Date.now();
  renderFuel();
  try {
    const j = await getJson(`${TKG}/list.php?lat=${A.lat.toFixed(5)}&lng=${A.lon.toFixed(5)}&rad=${A.rad.toFixed(1)}&sort=dist&type=all&apikey=${encodeURIComponent(key)}`, 15000);
    if (!j || j.ok === false) throw Object.assign(new Error((j && j.message) || 'Unbekannter Fehler'), { api: true });
    const prev = {}, old = fuDataOf(A);
    for (const s of (old && old.stations) || []) prev[s.id] = { e5: s.e5, e10: s.e10, diesel: s.diesel, at: old.at };
    fuStoreSave(A.key, {
      at: Date.now(), rad: A.rad,
      stations: (j.stations || []).slice(0, 500).map(s => ({ id: String(s.id), name: s.name, brand: s.brand, street: s.street, nr: s.houseNumber, place: s.place, lat: +s.lat, lng: +s.lng, dist: +s.dist, e5: s.e5, e10: s.e10, diesel: s.diesel, open: !!s.isOpen })),
      prev
    });
    fu.err = '';
  } catch (e) {
    fu.err = e && e.api ? (/key|schl/i.test(e.message) ? 'Tankerkönig kennt diesen Key nicht. Prüf ihn über die Regler oben rechts.' : `Tankerkönig meldet: ${e.message}`) : 'Tankerkönig ist gerade nicht erreichbar. Versuch es gleich nochmal.';
  } finally {
    fu.busy = false;
    renderFuel();
    mirrorDirty();
  }
}
/* Tankstellen für die gewählte Sorte, bei der Strecke nur die, die höchstens 1,5 km daneben liegen.
 * Sortiert nach Preis oder nach Entfernung (auf der Strecke: nach Umweg), offene immer zuerst. */
function fuRows() {
  const c = fuCfg(), A = fuArea(c), D = fuDataOf(A);
  if (!D) return null;
  let list = D.stations.map(s => ({ ...s, price: typeof s[c.type] === 'number' && s[c.type] > 0.5 ? s[c.type] : null })).filter(s => s.price);
  const route = A.key === 'route';
  if (route) list = list.map(s => { const n = nearestOn(A.g, s.lng, s.lat); return { ...s, off: n.d, along: n.along }; }).filter(s => s.off <= 1500);
  const far = s => s.off ?? s.dist * 1000;
  list.sort(c.sort === 'dist'
    ? (a, b) => (b.open - a.open) || (far(a) - far(b)) || (a.price - b.price)
    : (a, b) => (b.open - a.open) || (a.price - b.price) || (far(a) - far(b)));
  return { list, A: route ? A : null, D };
}
function fuWhere(s, A) {
  if (A) {
    const det = s.off < 300 ? 'direkt an der Strecke' : `ca. ${numDe(s.off * 2 / 1000, 1)} km Umweg`;
    return s.along < 500 ? `${det}, gleich am Start` : `${det}, nach ${numDe(s.along / 1000, s.along < 10000 ? 1 : 0)} km`;
  }
  return `${numDe(s.dist, 1)} km entfernt`;
}
/* Wo gerade gesucht wird, für den Hinweis unter der Liste */
function fuScope(c, A) {
  if (A) return 'an deiner Strecke';
  const r = `im Umkreis von ${c.rad} km`;
  if (c.mode === 'home') return `${r} um Zuhause`;
  if (fuIsGeo(c)) return `${r} um deinen Standort`;
  return `${r} um ${fuPlaceName(c.place)}`;
}
function fuDiff(s, type, D) {
  const p = D.prev[s.id], pv = p && p[type];
  if (typeof pv !== 'number' || pv <= 0.5) return '';
  const d = Math.round((s.price - pv) * 100);
  if (!d) return '';
  return `<span class="fu-diff" data-s="${d < 0 ? 'down' : 'up'}" title="seit ${hm(new Date(p.at))} Uhr">${d < 0 ? '▼' : '▲'} ${Math.abs(d)} ct</span>`;
}
const fuMaps = s => `https://www.google.com/maps/search/?api=1&query=${s.lat},${s.lng}`;
function renderFuel() {
  const v = views.get('fuel');
  if (!v) return;
  const c = fuCfg(), key = fuKey();
  segSet($('#fu-type'), c.type);
  segSet($('#fu-mode'), c.mode);
  segSet($('#fu-rad'), String(c.rad));
  segSet($('#fu-sort'), c.sort);
  $('#fu-mode [data-v="route"]').disabled = !fuHasRoute();
  $('#fu-mode [data-v="route"]').title = fuHasRoute() ? '' : 'Trag zuerst deine Adressen im Pendeln-Widget ein';
  $('#fu-place-name').textContent = c.place ? fuPlaceName(c.place) : 'Anderer Ort';
  $('#fu-mode [data-v="place"]').title = c.place ? (c.place.how === 'wx' ? 'Derselbe Ort wie beim Wetter' : c.place.how === 'geo' ? 'Rund um deinen Standort' : `Rund um ${c.place.name}`) : 'Eigenen Ort suchen';
  $('#fu-wx').textContent = wx.loc ? `Wie beim Wetter (${wx.loc.name})` : 'Wie beim Wetter';
  $('#fu-setup').hidden = !!key || !$('#fu-form').hidden;
  $('#fu-live').hidden = !key;
  $('#fu-foot').hidden = !key;
  $('#fu-type').hidden = !key;
  if (!key) { $('#fu-src').textContent = ''; return; }
  // Strecke gewählt, aber keine Adressen: auf Zuhause ausweichen
  if (c.mode === 'route' && !fuHasRoute()) { c.mode = 'home'; persist(); segSet($('#fu-mode'), c.mode); }
  const A = fuArea(c), R = fuRows(), best = $('#fu-best'), ul = $('#fu-list'), hint = $('#fu-hint');
  // Automatisch laden: sichtbar, Daten fehlen oder sind älter als 10 Minuten, kein Fehler offen
  const stale = !R || Date.now() - R.D.at > 10 * 6e4;
  if (stale && !fu.busy && !fu.err && !v.el.hidden && document.visibilityState === 'visible' && Date.now() - fu.last > 61e3 && (A || fuIsGeo(c))) {
    setTimeout(() => fuLoad(), 400 + Math.random() * 1600);
  }
  $('#fu-refresh').disabled = fu.busy;
  $('#fu-refresh').classList.toggle('spin', fu.busy);
  const note = [fu.err, fu.note].filter(Boolean).join(' ');
  if (!R) {
    best.innerHTML = '';
    ul.textContent = '';
    hint.textContent = note || (c.mode === 'route' && !A ? 'Die Pendelstrecke wird noch berechnet, danach kommen die Preise.'
      : c.mode === 'place' && c.place && c.place.how === 'wx' && !A ? 'Das Wetter sucht noch seinen Ort, danach kommen die Preise.'
      : fu.busy ? 'Preise werden geladen …' : 'Preise werden gleich geladen.');
    $('#fu-src').textContent = '';
    return;
  }
  const { list, D } = R, open = list.filter(s => s.open), scope = fuScope(c, R.A);
  if (!list.length) {
    best.innerHTML = '';
    ul.textContent = '';
    hint.textContent = note || `Keine Tankstelle mit ${FU_TYPE[c.type]} ${R.A ? 'direkt an deiner Strecke' : scope} gefunden.${R.A ? '' : ' Vielleicht mit einem größeren Umkreis?'}`;
  } else {
    const b = open[0] || list[0];
    const avg = open.length > 2 ? open.reduce((s, x) => s + x.price, 0) / open.length : null;
    const save = avg ? Math.round((avg - b.price) * 100) : 0;
    best.setAttribute('href', fuMaps(b));
    best.innerHTML = `<div><b>${esc(fuNice(b.brand || b.name))}</b><small>${esc(fuNice(`${b.street || ''} ${b.nr || ''}`.trim()))}, ${esc(fuNice(b.place))}</small><small>${esc(fuWhere(b, R.A))}${b.open ? '' : ', gerade geschlossen'}${save >= 2 ? `, ${save} Cent unter dem Schnitt` : ''}</small></div><span class="pr">${fuPrice(b.price)}</span>`;
    ul.innerHTML = list.filter(s => s !== b).slice(0, 7).map(s => `<li><a class="fu-row${s.open ? '' : ' closed'}" href="${esc(fuMaps(s))}" target="_blank" rel="noopener"><b>${esc(fuNice(s.brand || s.name))}</b><small>${esc(fuNice(s.place))} · ${esc(fuWhere(s, R.A))}${s.open ? '' : ' · geschlossen'}</small><span class="pr">${fuPrice(s.price)}${fuDiff(s, c.type, D)}</span></a></li>`).join('');
    const min = open.length ? Math.min(...open.map(s => s.price)) : null, max = open.length ? Math.max(...open.map(s => s.price)) : null;
    hint.textContent = (note ? note + ' ' : '') + (open.length > 1 ? `${open.length} offene Tankstellen ${scope}, ${FU_TYPE[c.type]} zwischen ${numDe(min, 3)} und ${numDe(max, 3)} €.` : '');
  }
  $('#fu-src').innerHTML = `Stand ${hm(new Date(D.at))} Uhr · Preise: <a href="https://www.tankerkoenig.de" target="_blank" rel="noopener">Tankerkönig</a>, Daten der MTS-K, CC BY 4.0`;
}

function fuOpenForm() {
  const has = !!fuKey();
  $('#fu-set').hidden = true;
  $('#fu-key').value = '';
  $('#fu-key').placeholder = has ? 'Gespeichert. Für einen neuen hier einfügen' : 'z. B. 1234abcd-…';
  $('#fu-forget').hidden = !has;
  $('#fu-err').hidden = true;
  $('#fu-form').hidden = false;
  $('#fu-setup').hidden = true;
  $('#fu-key').focus();
}
/* Einstellungen: Ort suchen, wie beim Wetter, eigener Standort, Umkreis und Sortierung */
function fuOpenSet(search) {
  $('#fu-form').hidden = true;
  $('#fu-res').textContent = '';
  $('#fu-qerr').hidden = true;
  $('#fu-q').value = '';
  $('#fu-set').hidden = false;
  renderFuel();
  if (search) $('#fu-q').focus();
}
function fuSetPlace(P) {
  const c = fuCfg();
  if (P.how === 'geo') fu.here = null;
  c.place = P;
  c.mode = 'place';
  fu.err = '';
  $('#fu-set').hidden = true;
  commit();
  fuLoad('soft');
}
$('#fu-setup-btn').addEventListener('click', fuOpenForm);
$('#fu-key-btn').addEventListener('click', () => {
  if (!fuKey()) { if ($('#fu-form').hidden) fuOpenForm(); else { $('#fu-form').hidden = true; renderFuel(); } return; }
  if (!$('#fu-form').hidden) { $('#fu-form').hidden = true; renderFuel(); return; }
  if ($('#fu-set').hidden) fuOpenSet(false); else $('#fu-set').hidden = true;
});
$('#fu-cancel').addEventListener('click', () => { $('#fu-form').hidden = true; renderFuel(); });
$('#fu-forget').addEventListener('click', () => {
  try { localStorage.removeItem(FU_KEY); } catch { /* egal */ }
  fu.store = { v: 2, areas: {} };
  try { localStorage.removeItem(FU_CACHE); } catch { /* egal */ }
  $('#fu-form').hidden = true;
  renderFuel();
});
$('#fu-form').addEventListener('submit', e => {
  e.preventDefault();
  const k = $('#fu-key').value.trim();
  const fail = m => { $('#fu-err').textContent = m; $('#fu-err').hidden = false; };
  if (!k) { if (fuKey()) { $('#fu-form').hidden = true; renderFuel(); return; } return fail('Füg zuerst deinen Key ein.'); }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(k)) return fail('Das sieht nicht nach einem Tankerkönig-Key aus. Er hat das Format 8-4-4-4-12 Zeichen.');
  try { localStorage.setItem(FU_KEY, k); } catch { return fail('Dein Browser speichert hier nichts, zum Beispiel im privaten Fenster.'); }
  $('#fu-form').hidden = true;
  fu.err = '';
  fu.last = 0;
  renderFuel();
  fuLoad(true);
});
$('#fu-set').addEventListener('submit', async e => {
  e.preventDefault();
  const q = $('#fu-q').value.trim(), res = $('#fu-res'), errEl = $('#fu-qerr');
  res.textContent = '';
  errEl.hidden = true;
  if (q.length < 2) { errEl.textContent = 'Gib mindestens zwei Buchstaben ein.'; errEl.hidden = false; return; }
  try {
    const j = await getJson(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=6&language=de&format=json`);
    const list = (j && j.results) || [];
    if (!list.length) { errEl.textContent = `Kein Ort namens „${q}“ gefunden.`; errEl.hidden = false; return; }
    for (const r of list) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn-ghost';
      b.textContent = [r.name, r.admin1, r.country_code].filter(Boolean).join(', ');
      b.addEventListener('click', () => fuSetPlace({ how: 'fixed', name: r.name, lat: r.latitude, lon: r.longitude }));
      res.appendChild(b);
    }
  } catch { errEl.textContent = 'Ortssuche gerade nicht erreichbar.'; errEl.hidden = false; }
});
$('#fu-wx').addEventListener('click', () => fuSetPlace({ how: 'wx' }));
$('#fu-geo').addEventListener('click', () => fuSetPlace({ how: 'geo' }));
$('#fu-set-done').addEventListener('click', () => { $('#fu-set').hidden = true; });
$('#fu-key-open').addEventListener('click', fuOpenForm);
$('#fu-rad').addEventListener('click', e => {
  const b = e.target.closest('[data-v]'), c = fuCfg();
  if (!b || !FU_RADS.includes(+b.dataset.v) || c.rad === +b.dataset.v) return;
  c.rad = +b.dataset.v;
  fu.err = '';
  commit();
  if (c.mode !== 'route') fuLoad('soft');
});
$('#fu-sort').addEventListener('click', e => {
  const b = e.target.closest('[data-v]');
  if (!b || !['price', 'dist'].includes(b.dataset.v)) return;
  fuCfg().sort = b.dataset.v;
  commit();
});
$('#fu-refresh').addEventListener('click', () => { fu.err = ''; fuLoad(true); });
$('#fu-type').addEventListener('click', e => {
  const b = e.target.closest('[data-v]');
  if (!b || !FU_TYPE[b.dataset.v]) return;
  fuCfg().type = b.dataset.v;
  commit();
});
$('#fu-mode').addEventListener('click', e => {
  const b = e.target.closest('[data-v]'), c = fuCfg();
  if (!b || b.disabled) return;
  // Eigener Ort: ohne Ort gleich die Suche öffnen, beim zweiten Tippen die Einstellungen
  if (b.dataset.v === 'place' && (!c.place || c.mode === 'place')) { if ($('#fu-set').hidden) fuOpenSet(!c.place); else $('#fu-set').hidden = true; return; }
  if (c.mode === b.dataset.v) return;
  c.mode = b.dataset.v;
  fu.err = '';
  commit();
  fuLoad('soft');
});

defineWidget('fuel', { render: renderFuel });
