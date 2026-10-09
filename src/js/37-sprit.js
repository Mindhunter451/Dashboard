/* Spritpreise über Tankerkönig (Daten der Markttransparenzstelle, Lizenz CC BY 4.0). Braucht einen eigenen kostenlosen Key.
 * Tankerkönig bittet um höchstens eine Abfrage pro Minute und keine Abfragen ohne Anlass. Deshalb wird nur geladen,
 * wenn das Widget sichtbar ist und die Daten älter als 10 Minuten sind, oder auf Knopfdruck.
 * Eine einzige Umkreissuche um die Streckenmitte deckt die ganze Pendelstrecke ab. */
const FU_KEY = 'jere-cockpit-tankerkoenig', FU_CACHE = 'jere-cockpit-sprit';
const TKG = 'https://creativecommons.tankerkoenig.de/json';
const FU_TYPE = { e5: 'Super E5', e10: 'Super E10', diesel: 'Diesel' };
const fu = { busy: false, err: '', last: 0, data: lsGet(FU_CACHE), here: null, wait: null };
const fuKey = () => { try { return localStorage.getItem(FU_KEY) || ''; } catch { return ''; } };
const fuCfg = () => state.widgets.fuel.cfg;
const fuHasRoute = () => !!(state.commute.home && state.commute.work);
const fuPrice = p => { const s = p.toFixed(3); return `${s.slice(0, -1).replace('.', ',')}<sup>${s.slice(-1)}</sup>`; };
const fuNice = s => { const t = String(s || '').trim(); return t.length > 3 && t === t.toUpperCase() ? t.toLowerCase().replace(/(^|[\s\-/.(])(\p{L})/gu, (m, a, b) => a + b.toUpperCase()) : t; };

/* Suchgebiet je nach Modus */
function fuArea(mode) {
  if (mode === 'route') {
    const R = cm.res;
    if (!R || !R.route || !R.route.geometry) return null;
    const coords = R.route.geometry.coordinates, g = prepRoute(coords), total = g.cum[g.cum.length - 1];
    let i = g.cum.findIndex(x => x >= total / 2);
    if (i < 0) i = Math.floor(coords.length / 2);
    return { lat: coords[i][1], lon: coords[i][0], rad: Math.min(25, Math.max(3, total / 2000 + 2)), g, total, dir: R.dir };
  }
  if (mode === 'home') {
    const h = state.commute.home;
    if (h && h.lat != null) return { lat: h.lat, lon: h.lon, rad: 5 };
    return wx.loc ? { lat: +wx.loc.lat, lon: +wx.loc.lon, rad: 5 } : null;
  }
  return fu.here ? { lat: fu.here.lat, lon: fu.here.lon, rad: 4 } : null;
}
async function fuLoad(manual) {
  const key = fuKey(), c = fuCfg();
  if (!key || fu.busy) return;
  // Automatisch nur, wenn die Daten wirklich fehlen oder alt sind
  if (!manual && fu.data && fu.data.mode === c.mode && Date.now() - fu.data.at < 10 * 6e4) return;
  const since = Date.now() - fu.last;
  if (since < 61e3) {
    // Erst nach einer Minute wieder fragen, dann automatisch
    clearTimeout(fu.wait);
    fu.wait = setTimeout(() => fuLoad(), 61e3 - since + 500);
    if (manual) toast(`Tankerkönig erlaubt nur eine Abfrage pro Minute. Das Cockpit fragt in ${Math.ceil((61e3 - since) / 1000)} Sekunden von selbst.`);
    return;
  }
  if (c.mode === 'here' && !fu.here) {
    fu.busy = true;
    renderFuel();
    const p = await geo();
    fu.busy = false;
    if (!p) { fu.err = 'Dein Standort ist gerade nicht verfügbar. Erlaub den Zugriff im Browser oder nimm „Rund um Zuhause“.'; renderFuel(); return; }
    fu.here = { lat: p.latitude, lon: p.longitude };
  }
  const A = fuArea(c.mode);
  if (!A) { fu.err = c.mode === 'route' ? '' : 'Dafür fehlt deine Heimadresse. Trag sie im Pendeln-Widget über die Regler oben rechts ein.'; renderFuel(); return; }
  fu.busy = true;
  fu.last = Date.now();
  renderFuel();
  try {
    const j = await getJson(`${TKG}/list.php?lat=${A.lat.toFixed(5)}&lng=${A.lon.toFixed(5)}&rad=${A.rad.toFixed(1)}&sort=dist&type=all&apikey=${encodeURIComponent(key)}`, 15000);
    if (!j || j.ok === false) throw Object.assign(new Error((j && j.message) || 'Unbekannter Fehler'), { api: true });
    const prev = {};
    for (const s of (fu.data && fu.data.stations) || []) prev[s.id] = { e5: s.e5, e10: s.e10, diesel: s.diesel, at: fu.data.at };
    fu.data = {
      at: Date.now(), mode: c.mode, rad: A.rad,
      stations: (j.stations || []).slice(0, 500).map(s => ({ id: String(s.id), name: s.name, brand: s.brand, street: s.street, nr: s.houseNumber, place: s.place, lat: +s.lat, lng: +s.lng, dist: +s.dist, e5: s.e5, e10: s.e10, diesel: s.diesel, open: !!s.isOpen })),
      prev
    };
    lsSet(FU_CACHE, fu.data);
    fu.err = '';
  } catch (e) {
    fu.err = e && e.api ? (/key|schl/i.test(e.message) ? 'Tankerkönig kennt diesen Key nicht. Prüf ihn über die Regler oben rechts.' : `Tankerkönig meldet: ${e.message}`) : 'Tankerkönig ist gerade nicht erreichbar. Versuch es gleich nochmal.';
  } finally {
    fu.busy = false;
    renderFuel();
  }
}
/* Tankstellen für die gewählte Sorte, bei der Strecke nur die, die höchstens 1,5 km daneben liegen */
function fuRows() {
  const c = fuCfg(), D = fu.data;
  if (!D || D.mode !== c.mode) return null;
  let list = D.stations.map(s => ({ ...s, price: typeof s[c.type] === 'number' && s[c.type] > 0.5 ? s[c.type] : null })).filter(s => s.price);
  let A = null;
  if (D.mode === 'route') {
    A = fuArea('route');
    if (!A) return null;
    list = list.map(s => { const n = nearestOn(A.g, s.lng, s.lat); return { ...s, off: n.d, along: n.along }; }).filter(s => s.off <= 1500);
  }
  list.sort((a, b) => (b.open - a.open) || (a.price - b.price) || ((a.off ?? a.dist * 1000) - (b.off ?? b.dist * 1000)));
  return { list, A };
}
function fuWhere(s, A) {
  if (A) {
    const det = s.off < 300 ? 'direkt an der Strecke' : `ca. ${numDe(s.off * 2 / 1000, 1)} km Umweg`;
    return s.along < 500 ? `${det}, gleich am Start` : `${det}, nach ${numDe(s.along / 1000, s.along < 10000 ? 1 : 0)} km`;
  }
  return `${numDe(s.dist, 1)} km entfernt`;
}
function fuDiff(s, type) {
  const p = fu.data.prev[s.id], pv = p && p[type];
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
  $('#fu-mode [data-v="route"]').disabled = !fuHasRoute();
  $('#fu-mode [data-v="route"]').title = fuHasRoute() ? '' : 'Trag zuerst deine Adressen im Pendeln-Widget ein';
  $('#fu-setup').hidden = !!key || !$('#fu-form').hidden;
  $('#fu-live').hidden = !key;
  $('#fu-foot').hidden = !key;
  $('#fu-type').hidden = !key;
  if (!key) { $('#fu-src').textContent = ''; return; }
  // Strecke gewählt, aber keine Adressen: auf Zuhause ausweichen
  if (c.mode === 'route' && !fuHasRoute()) { c.mode = 'home'; persist(); segSet($('#fu-mode'), c.mode); }
  const R = fuRows(), best = $('#fu-best'), ul = $('#fu-list'), hint = $('#fu-hint');
  // Automatisch laden: sichtbar, Daten fehlen oder sind älter als 10 Minuten, kein Fehler offen
  const stale = !fu.data || fu.data.mode !== c.mode || Date.now() - fu.data.at > 10 * 6e4;
  if (stale && !fu.busy && !fu.err && !v.el.hidden && document.visibilityState === 'visible' && Date.now() - fu.last > 61e3 && (c.mode !== 'route' || fuArea('route'))) {
    setTimeout(() => fuLoad(), 400 + Math.random() * 1600);
  }
  $('#fu-refresh').disabled = fu.busy;
  $('#fu-refresh').classList.toggle('spin', fu.busy);
  if (!R) {
    best.innerHTML = '';
    ul.textContent = '';
    hint.textContent = fu.err || (c.mode === 'route' && !fuArea('route') ? 'Die Pendelstrecke wird noch berechnet, danach kommen die Preise.' : fu.busy ? 'Preise werden geladen …' : 'Preise werden gleich geladen.');
    $('#fu-src').textContent = '';
    return;
  }
  const { list, A } = R, open = list.filter(s => s.open);
  if (!list.length) {
    best.innerHTML = '';
    ul.textContent = '';
    hint.textContent = fu.err || `Keine Tankstelle mit ${FU_TYPE[c.type]} ${A ? 'direkt an deiner Strecke' : 'im Umkreis'} gefunden.`;
  } else {
    const b = open[0] || list[0];
    const avg = open.length > 2 ? open.reduce((s, x) => s + x.price, 0) / open.length : null;
    const save = avg ? Math.round((avg - b.price) * 100) : 0;
    best.setAttribute('href', fuMaps(b));
    best.innerHTML = `<div><b>${esc(fuNice(b.brand || b.name))}</b><small>${esc(fuNice(`${b.street || ''} ${b.nr || ''}`.trim()))}, ${esc(fuNice(b.place))}</small><small>${esc(fuWhere(b, A))}${b.open ? '' : ', gerade geschlossen'}${save >= 2 ? `, ${save} Cent unter dem Schnitt` : ''}</small></div><span class="pr">${fuPrice(b.price)}</span>`;
    ul.innerHTML = list.filter(s => s !== b).slice(0, 7).map(s => `<li><a class="fu-row${s.open ? '' : ' closed'}" href="${esc(fuMaps(s))}" target="_blank" rel="noopener"><b>${esc(fuNice(s.brand || s.name))}</b><small>${esc(fuNice(s.place))} · ${esc(fuWhere(s, A))}${s.open ? '' : ' · geschlossen'}</small><span class="pr">${fuPrice(s.price)}${fuDiff(s, c.type)}</span></a></li>`).join('');
    const min = open.length ? Math.min(...open.map(s => s.price)) : null, max = open.length ? Math.max(...open.map(s => s.price)) : null;
    hint.textContent = (fu.err ? fu.err + ' ' : '') + (open.length > 1 ? `${open.length} offene Tankstellen ${A ? 'an deiner Strecke' : 'im Umkreis'}, ${FU_TYPE[c.type]} zwischen ${numDe(min, 3)} und ${numDe(max, 3)} €.` : '');
  }
  $('#fu-src').innerHTML = `Stand ${hm(new Date(fu.data.at))} Uhr · Preise: <a href="https://www.tankerkoenig.de" target="_blank" rel="noopener">Tankerkönig</a>, Daten der MTS-K, CC BY 4.0`;
}

function fuOpenForm() {
  const has = !!fuKey();
  $('#fu-key').value = '';
  $('#fu-key').placeholder = has ? 'Gespeichert. Für einen neuen hier einfügen' : 'z. B. 1234abcd-…';
  $('#fu-forget').hidden = !has;
  $('#fu-err').hidden = true;
  $('#fu-form').hidden = false;
  $('#fu-setup').hidden = true;
  $('#fu-key').focus();
}
$('#fu-setup-btn').addEventListener('click', fuOpenForm);
$('#fu-key-btn').addEventListener('click', () => { if ($('#fu-form').hidden) fuOpenForm(); else { $('#fu-form').hidden = true; renderFuel(); } });
$('#fu-cancel').addEventListener('click', () => { $('#fu-form').hidden = true; renderFuel(); });
$('#fu-forget').addEventListener('click', () => {
  try { localStorage.removeItem(FU_KEY); } catch { /* egal */ }
  fu.data = null;
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
$('#fu-refresh').addEventListener('click', () => { fu.err = ''; fuLoad(true); });
$('#fu-type').addEventListener('click', e => {
  const b = e.target.closest('[data-v]');
  if (!b || !FU_TYPE[b.dataset.v]) return;
  fuCfg().type = b.dataset.v;
  commit();
});
$('#fu-mode').addEventListener('click', e => {
  const b = e.target.closest('[data-v]');
  if (!b || b.disabled || fuCfg().mode === b.dataset.v) return;
  fuCfg().mode = b.dataset.v;
  fu.err = '';
  commit();
  fuLoad(true);
});

defineWidget('fuel', { render: renderFuel });
