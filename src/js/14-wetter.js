/* Wetter (gibt es nur einmal): Open-Meteo, Ortssuche, Regenradar mit Leaflet und RainViewer */
const HH = { name: 'Hamburg', lat: 53.5511, lon: 9.9937 };
const wx = { live: false, loc: null, data: null, at: 0, timer: null, retry: null, seq: 0 };
const WMO = { 0: ['Klar', 'sun'], 1: ['Überwiegend klar', 'partly'], 2: ['Teils bewölkt', 'partly'], 3: ['Bedeckt', 'cloud'], 45: ['Nebel', 'fog'], 48: ['Reifnebel', 'fog'], 51: ['Leichter Nieselregen', 'drizzle'], 53: ['Nieselregen', 'drizzle'], 55: ['Starker Nieselregen', 'drizzle'], 56: ['Gefrierender Niesel', 'drizzle'], 57: ['Gefrierender Niesel', 'drizzle'], 61: ['Leichter Regen', 'rain'], 63: ['Regen', 'rain'], 65: ['Starker Regen', 'rain'], 66: ['Gefrierender Regen', 'rain'], 67: ['Gefrierender Regen', 'rain'], 71: ['Leichter Schneefall', 'snow'], 73: ['Schneefall', 'snow'], 75: ['Starker Schneefall', 'snow'], 77: ['Schneegriesel', 'snow'], 80: ['Leichte Schauer', 'rain'], 81: ['Regenschauer', 'rain'], 82: ['Heftige Schauer', 'rain'], 85: ['Schneeschauer', 'snow'], 86: ['Starke Schneeschauer', 'snow'], 95: ['Gewitter', 'storm'], 96: ['Gewitter mit Hagel', 'storm'], 99: ['Gewitter mit Hagel', 'storm'] };
const CLOUD = 'M6.5 15.5h11a3.5 3.5 0 0 0 .3-6.99 5 5 0 0 0-9.6-1.3A4 4 0 0 0 6.5 15.5z';
function sunSvg(cx, cy, r) {
  let rays = '';
  for (let a = 0; a < 360; a += 45) {
    const rad = a * Math.PI / 180;
    rays += `<line x1="${(cx + Math.cos(rad) * (r + 2)).toFixed(1)}" y1="${(cy + Math.sin(rad) * (r + 2)).toFixed(1)}" x2="${(cx + Math.cos(rad) * (r + 3.8)).toFixed(1)}" y2="${(cy + Math.sin(rad) * (r + 3.8)).toFixed(1)}"/>`;
  }
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="var(--accent)"/><g stroke="var(--accent)" stroke-width="1.6" stroke-linecap="round">${rays}</g>`;
}
const moonSvg = (cx, cy, r) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="var(--muted)"/><circle cx="${cx + r * .55}" cy="${cy - r * .45}" r="${r * .85}" fill="var(--surface)"/>`;
const cloudSvg = (tx = 0, ty = 0) => `<path transform="translate(${tx} ${ty})" d="${CLOUD}" fill="var(--surface)" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>`;
function icon(kind, day) {
  let s = '';
  switch (kind) {
    case 'sun': s = day ? sunSvg(12, 12, 4.5) : moonSvg(12, 12, 6); break;
    case 'partly': s = (day ? sunSvg(8.5, 7.5, 3) : moonSvg(9, 7.5, 4)) + cloudSvg(1.5, 4.5); break;
    case 'cloud': s = cloudSvg(0, 3); break;
    case 'fog': s = '<g stroke="var(--muted)" stroke-width="1.8" stroke-linecap="round"><line x1="4" y1="8" x2="20" y2="8"/><line x1="6" y1="12" x2="18" y2="12"/><line x1="4" y1="16" x2="20" y2="16"/></g>'; break;
    case 'drizzle': s = cloudSvg() + '<g fill="var(--rain)"><circle cx="8.5" cy="19" r="1"/><circle cx="12.5" cy="20.5" r="1"/><circle cx="16.5" cy="19" r="1"/></g>'; break;
    case 'rain': s = cloudSvg() + '<g stroke="var(--rain)" stroke-width="1.8" stroke-linecap="round"><line x1="8.5" y1="18" x2="7.5" y2="21"/><line x1="12.5" y1="18" x2="11.5" y2="21"/><line x1="16.5" y1="18" x2="15.5" y2="21"/></g>'; break;
    case 'snow': s = cloudSvg() + '<g fill="var(--sea)"><circle cx="8.5" cy="19" r="1.2"/><circle cx="12.5" cy="21" r="1.2"/><circle cx="16.5" cy="19" r="1.2"/></g>'; break;
    case 'storm': s = cloudSvg() + '<polygon points="12.5,15.5 9.5,20 12,20 10.5,23.5 15.5,18 12.8,18 14.2,15.5" fill="var(--accent)"/>'; break;
    default: s = cloudSvg(0, 3);
  }
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${s}</svg>`;
}
function geo() {
  return new Promise(res => {
    if (!navigator.geolocation) return res(null);
    try { navigator.geolocation.getCurrentPosition(p => res(p.coords), () => res(null), { timeout: 10000, maximumAge: 15 * 6e4 }); }
    catch { res(null); }
  });
}
const fmtT = s => hm(new Date(s * 1000));
const near = (a, b) => Math.abs(a.lat - b.lat) < 0.02 && Math.abs(a.lon - b.lon) < 0.02;

async function startWeather() {
  clearTimeout(wx.retry);
  const fixed = state.loc && state.loc.mode === 'fixed';
  const first = fixed ? { name: state.loc.name, lat: state.loc.lat, lon: state.loc.lon, how: 'fixed' } : (lsGet(GEO_KEY) || { ...HH, how: 'default' });
  const seq = ++wx.seq;
  const ok = await loadWeather(first, seq);
  if (!ok || fixed || seq !== wx.seq) return;
  const c = await geo();
  if (!c || seq !== wx.seq) return;
  const g = { name: 'Dein Standort', lat: c.latitude, lon: c.longitude, how: 'geo' };
  if (first.how === 'geo' && near(first, g)) return;
  try {
    const r = await getJson(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${g.lat}&longitude=${g.lon}&localityLanguage=de`, 5000);
    g.name = r.city || r.locality || g.name;
  } catch {}
  lsSet(GEO_KEY, g);
  if (seq === wx.seq) loadWeather(g, seq);
}
async function loadWeather(loc, seq) {
  const q = `latitude=${(+loc.lat).toFixed(4)}&longitude=${(+loc.lon).toFixed(4)}`;
  const url = `https://api.open-meteo.com/v1/forecast?${q}&current=temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,weather_code,wind_speed_10m,wind_gusts_10m,is_day&minutely_15=precipitation&hourly=temperature_2m,precipitation_probability,weather_code,is_day&daily=sunrise,sunset,temperature_2m_max,temperature_2m_min&timezone=auto&timeformat=unixtime&forecast_days=2&wind_speed_unit=kmh`;
  try {
    const d = await getJson(url);
    if (seq !== undefined && seq !== wx.seq) return true;
    wx.live = true; wx.loc = loc; wx.data = d; wx.at = d.cachedAt || Date.now(); wx.offline = !!d.cachedAt;
    renderWeather();
    sky.minute = -1;
    skyTick(new Date());
    renderMirror();
    ensureRadar(loc);
    clearTimeout(wx.timer);
    wx.timer = setTimeout(() => loadWeather(wx.loc), (wx.offline ? 3 : 10) * 6e4);
    return true;
  } catch {
    if (!wx.live) showWxOff();
    else { $('#wx-src').textContent = `Stand ${hm(new Date(wx.at))}. Aktualisieren hat gerade nicht geklappt.`; clearTimeout(wx.timer); wx.timer = setTimeout(() => loadWeather(wx.loc), 3 * 6e4); }
    return false;
  }
}
function showWxOff() {
  $('#wx-live').hidden = true;
  $('#wx-off').hidden = false;
  $('#wx-off').classList.remove('is-loading');
  $('#wx-loc-btn').hidden = true;
  $('#wx-off-title').textContent = 'Wetterdienst gerade nicht erreichbar';
  $('#wx-off-text').textContent = 'Keine Verbindung zu den Wetterdaten. In ein paar Minuten gibt es automatisch einen neuen Versuch.';
  $('#wx-retry').hidden = false;
  clearTimeout(wx.retry);
  wx.retry = setTimeout(startWeather, 3 * 6e4);
  $('#wx-src').textContent = '';
}
$('#wx-retry').addEventListener('click', () => { $('#wx-off').classList.add('is-loading'); startWeather(); });

function renderWeather() {
  const d = wx.data, c = d.current || {}, loc = wx.loc;
  $('#wx-off').hidden = true;
  $('#wx-live').hidden = false;
  $('#wx-loc-btn').hidden = false;
  $('#wx-loc').textContent = loc.name;
  $('#lk-rv').href = `https://www.rainviewer.com/map.html?loc=${(+loc.lat).toFixed(4)},${(+loc.lon).toFixed(4)},8&layer=radar`;
  const w = WMO[c.weather_code] || ['Wetter', 'cloud'];
  $('#wx-icon').innerHTML = icon(w[1], c.is_day !== 0);
  $('#wx-temp').textContent = Number.isFinite(c.temperature_2m) ? `${Math.round(c.temperature_2m)}°` : '';
  $('#wx-desc').textContent = w[0];
  $('#wx-feel').textContent = Number.isFinite(c.apparent_temperature) ? `gefühlt ${Math.round(c.apparent_temperature)}°` : '';
  const dl = [];
  if (d.daily && d.daily.temperature_2m_max) dl.push(['Heute', `${Math.round(d.daily.temperature_2m_min[0])}° bis ${Math.round(d.daily.temperature_2m_max[0])}°`]);
  if (Number.isFinite(c.wind_speed_10m)) dl.push(['Wind', `${Math.round(c.wind_speed_10m)} km/h${Number.isFinite(c.wind_gusts_10m) ? `, Böen ${Math.round(c.wind_gusts_10m)}` : ''}`]);
  if (Number.isFinite(c.relative_humidity_2m)) dl.push(['Feuchte', `${Math.round(c.relative_humidity_2m)} %`]);
  if (d.daily && d.daily.sunrise) dl.push(['Sonne', `${fmtT(d.daily.sunrise[0])} bis ${fmtT(d.daily.sunset[0])}`]);
  $('#wx-dl').innerHTML = dl.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('');

  // Regen in den nächsten 2 Stunden (15-Minuten-Schritte)
  const m = d.minutely_15, now = Date.now();
  const bars = $('#wx-rainbars'), lbl = $('#wx-rainlbl');
  bars.textContent = ''; lbl.textContent = '';
  if (m && Array.isArray(m.time) && Array.isArray(m.precipitation)) {
    let i = m.time.findIndex(t => t * 1000 + 15 * 6e4 > now);
    if (i < 0) i = m.time.length;
    const slots = m.time.slice(i, i + 8).map((t, k) => ({ t: t * 1000, v: +(m.precipitation[i + k] || 0) }));
    const max = Math.max(0.6, ...slots.map(s => s.v));
    slots.forEach((s, k) => {
      const wet = s.v >= 0.05;
      const b = document.createElement('div');
      b.className = 'rb' + (wet ? ' wet' : '');
      b.style.setProperty('--h', wet ? Math.max(8, s.v / max * 100) + '%' : '2px');
      b.title = `${hm(new Date(s.t))} Uhr: ${numDe(s.v, 1)} mm`;
      bars.appendChild(b);
      const l = document.createElement('span');
      l.textContent = k % 2 === 0 ? (k === 0 ? 'jetzt' : hm(new Date(s.t))) : '';
      lbl.appendChild(l);
    });
    const wetIdx = slots.findIndex(s => s.v >= 0.05);
    let txt;
    if (!slots.length) txt = 'Keine Kurzfrist-Daten für diesen Ort.';
    else if (wetIdx < 0) txt = 'Bleibt trocken in den nächsten 2 Stunden.';
    else if (wetIdx === 0) {
      const dry = slots.findIndex(s => s.v < 0.05);
      txt = dry < 0 ? 'Regnet die nächsten 2 Stunden durch. Schirm einpacken.' : `Regnet gerade, trocken ab etwa ${hm(new Date(slots[dry].t))} Uhr.`;
    } else txt = `Regen ab etwa ${hm(new Date(slots[wetIdx].t))} Uhr.`;
    $('#wx-rain-txt').textContent = txt;
  } else $('#wx-rain-txt').textContent = 'Keine Kurzfrist-Daten für diesen Ort.';

  // Stundenleiste
  const h = d.hourly, hours = $('#wx-hours');
  hours.textContent = '';
  if (h && Array.isArray(h.time)) {
    let i = h.time.findIndex(t => t * 1000 + 36e5 > now);
    if (i < 0) i = 0;
    for (let k = i; k < Math.min(i + 12, h.time.length); k++) {
      const ww = WMO[h.weather_code[k]] || ['', 'cloud'];
      const el = document.createElement('div');
      el.className = 'hr';
      const pp = h.precipitation_probability ? h.precipitation_probability[k] : null;
      el.innerHTML = `<span>${k === i ? 'Jetzt' : new Date(h.time[k] * 1000).getHours() + ' Uhr'}</span>${icon(ww[1], h.is_day ? h.is_day[k] !== 0 : true)}<b>${Math.round(h.temperature_2m[k])}°</b><span class="pp">${pp == null ? '' : pp + ' %'}</span>`;
      el.title = ww[0];
      hours.appendChild(el);
    }
  }
  const wa = new Date(wx.at), old = dayDiff(wa, new Date());
  $('#wx-src').textContent = `Stand ${old ? `${dm(wa)} ` : ''}${hm(wa)} Uhr${wx.offline ? ', ohne Netz' : ''} · Wetterdaten: Open-Meteo · Radar: RainViewer`;
}

/* Ort ändern */
$('#wx-loc-btn').addEventListener('click', () => {
  const f = $('#wx-loc-form');
  f.hidden = !f.hidden;
  if (!f.hidden) { $('#loc-res').textContent = ''; $('#loc-err').hidden = true; $('#loc-q').value = ''; $('#loc-q').focus(); }
});
$('#loc-cancel').addEventListener('click', () => { $('#wx-loc-form').hidden = true; });
$('#wx-loc-form').addEventListener('submit', async e => {
  e.preventDefault();
  const q = $('#loc-q').value.trim();
  const res = $('#loc-res'), errEl = $('#loc-err');
  res.textContent = ''; errEl.hidden = true;
  if (q.length < 2) { errEl.textContent = 'Gib mindestens zwei Buchstaben ein.'; errEl.hidden = false; return; }
  try {
    const j = await getJson(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=6&language=de&format=json`);
    const list = (j && j.results) || [];
    if (!list.length) { errEl.textContent = `Kein Ort namens „${q}“ gefunden.`; errEl.hidden = false; return; }
    for (const r of list) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'btn-ghost';
      b.textContent = [r.name, r.admin1, r.country_code].filter(Boolean).join(', ');
      b.addEventListener('click', () => setLoc({ mode: 'fixed', name: r.name, lat: r.latitude, lon: r.longitude }));
      res.appendChild(b);
    }
  } catch { errEl.textContent = 'Ortssuche gerade nicht erreichbar.'; errEl.hidden = false; }
});
function setLoc(loc) { state.loc = loc; $('#wx-loc-form').hidden = true; commit(); startWeather(); }
$('#loc-hh').addEventListener('click', () => setLoc({ mode: 'fixed', ...HH }));
$('#loc-auto').addEventListener('click', () => setLoc({ mode: 'auto' }));

/* Regenradar (Leaflet + RainViewer), nur wenn externe Daten erreichbar sind */
const rd = { map: null, base: null, ref: null, marker: null, layers: [], times: [], idx: 0, timer: null, userPaused: false, loading: null };
function isDark() {
  const t = document.documentElement.getAttribute('data-theme');
  if (t === 'dark') return true;
  if (t === 'light') return false;
  return matchMedia('(prefers-color-scheme: dark)').matches;
}
const esriUrl = layer => `https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_${isDark() ? 'Dark' : 'Light'}_Gray_${layer}/MapServer/tile/{z}/{y}/{x}`;
function loadLeaflet() {
  if (window.L) return Promise.resolve(window.L);
  if (rd.loading) return rd.loading;
  rd.loading = new Promise((res, rej) => {
    const css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.css';
    css.integrity = 'sha512-Zcn6bjR/8RZbLEpLIeOwNtzREBAJnUKESxces60Mpoj+2okopSAcSUIUOseddDm0cxnGQzxIR7vJgsLZbdLE3w==';
    css.crossOrigin = 'anonymous';
    document.head.appendChild(css);
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.js';
    s.integrity = 'sha512-BwHfrr4c9kmRkLw6iXFdzcdWV/PGkVgiIyIWLLlTSXzWQzxuSg4DiQUCpauz/EWjgk5TYQqX/kvn9pG1NpYfqg==';
    s.crossOrigin = 'anonymous';
    s.onload = () => res(window.L);
    s.onerror = rej;
    document.head.appendChild(s);
  });
  return rd.loading;
}
async function ensureRadar(loc) {
  let L;
  try { L = await loadLeaflet(); } catch { radarMsg('Karte konnte nicht geladen werden.'); return; }
  const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#E8A126';
  if (!rd.map) {
    rd.map = L.map('radar', { scrollWheelZoom: false, minZoom: 4, maxZoom: 10, zoomControl: false });
    L.control.zoom({ position: 'bottomright' }).addTo(rd.map);
    rd.map.createPane('labels');
    rd.map.getPane('labels').style.zIndex = 450;
    rd.map.getPane('labels').style.pointerEvents = 'none';
    rd.base = L.tileLayer(esriUrl('Base'), { maxNativeZoom: 16, maxZoom: 19, attribution: 'Karte &copy; Esri' }).addTo(rd.map);
    rd.ref = L.tileLayer(esriUrl('Reference'), { pane: 'labels', maxNativeZoom: 16, maxZoom: 19, opacity: 0.85 }).addTo(rd.map);
    rd.marker = L.circleMarker([loc.lat, loc.lon], { radius: 6, weight: 2, color: '#ffffff', fillColor: accent, fillOpacity: 1, pane: 'markerPane' }).addTo(rd.map);
    if (typeof ResizeObserver === 'function') new ResizeObserver(() => {
      if (!rd.map) return;
      rd.map.invalidateSize();
      if (rd.pending && $('#radar').offsetWidth) { rd.map.setView(rd.pending, 7); rd.pending = null; }
    }).observe($('#radar'));
  }
  rd.marker.setLatLng([loc.lat, loc.lon]);
  // In einer versteckten Karte (andere Seite) erst zentrieren, wenn sie sichtbar wird
  if ($('#radar').offsetWidth) { rd.map.setView([loc.lat, loc.lon], 7); setTimeout(() => rd.map.invalidateSize(), 60); }
  else { rd.pending = [loc.lat, loc.lon]; rd.map.setView(rd.pending, 7); }
  await refreshRadar();
}
function radarMsg(t) { const el = $('#radar-msg'); el.textContent = t || ''; el.hidden = !t; }
async function refreshRadar() {
  const L = window.L;
  try {
    const j = await getJson('https://api.rainviewer.com/public/weather-maps.json');
    const past = (j.radar && j.radar.past) || [];
    if (!past.length) throw new Error('leer');
    rd.layers.forEach(l => rd.map.removeLayer(l));
    rd.layers = past.map(f => L.tileLayer(`${j.host}${f.path}/256/{z}/{x}/{y}/2/1_1.png`, { opacity: 0, zIndex: 5, maxNativeZoom: 7, maxZoom: 10, attribution: 'Radar &copy; RainViewer' }).addTo(rd.map));
    rd.times = past.map(f => f.time * 1000);
    $('#rd-slider').max = String(rd.layers.length - 1);
    showFrame(rd.layers.length - 1);
    radarMsg('');
    if (!reduceMotion && !rd.userPaused && radarShown()) play(); else stopPlay();
  } catch { radarMsg('Radarbilder gerade nicht erreichbar.'); }
}
function showFrame(i) {
  rd.idx = i;
  rd.layers.forEach((l, k) => l.setOpacity(k === i ? 0.8 : 0));
  $('#rd-slider').value = String(i);
  const t = rd.times[i];
  $('#rd-time').textContent = t ? `${hm(new Date(t))} Uhr${i === rd.layers.length - 1 ? ', neuestes' : ''}` : '';
}
function play() {
  clearInterval(rd.timer);
  let hold = 0;
  rd.timer = setInterval(() => {
    if (!rd.layers.length) return;
    if (rd.idx === rd.layers.length - 1 && hold < 3) { hold++; return; }
    hold = 0;
    showFrame((rd.idx + 1) % rd.layers.length);
  }, 550);
  $('#rd-play').textContent = 'Pause';
  $('#rd-play').setAttribute('aria-pressed', 'true');
}
function stopPlay() {
  clearInterval(rd.timer); rd.timer = null;
  $('#rd-play').textContent = 'Abspielen';
  $('#rd-play').setAttribute('aria-pressed', 'false');
}
/* Radar auf- und zuklappen. Auf dem Handy startet es zu, damit die Seite kürzer bleibt. Merkt sich jedes Gerät selbst. */
const RD_KEY = 'jere-cockpit-radar';
function radarOpen() { const v = lsGet(RD_KEY); return v == null ? !isNarrow() : !!v; }
const radarShown = () => radarOpen() && !$('#radar-box').hidden && !zu.has('weather');
function renderRadarTg() {
  const on = radarOpen();
  $('#rd-body').hidden = !on;
  $('#rd-tg').setAttribute('aria-expanded', String(on));
  if (!radarShown()) { if (rd.timer) stopPlay(); }
  else if (rd.layers.length && !rd.timer && !rd.userPaused && !reduceMotion) play();
}
$('#rd-tg').addEventListener('click', () => { lsSet(RD_KEY, radarOpen() ? 0 : 1); renderRadarTg(); schedLayout(); });
$('#rd-play').addEventListener('click', () => { if (rd.timer) { rd.userPaused = true; stopPlay(); } else { rd.userPaused = false; play(); } });
$('#rd-slider').addEventListener('input', e => { rd.userPaused = true; stopPlay(); showFrame(+e.target.value); });

defineWidget('weather', {
  render() {
    const c = state.widgets.weather.cfg;
    $('#wx-hours-box').hidden = !c.hours;
    $('#radar-box').hidden = !c.radar;
    renderRadarTg();
  },
  settings: {
    render(box, w) {
      box.innerHTML = `<label class="check-row"><input type="checkbox" data-s="hours"${w.cfg.hours ? ' checked' : ''}> Stundenleiste zeigen</label><label class="check-row"><input type="checkbox" data-s="radar"${w.cfg.radar ? ' checked' : ''}> Regenradar zeigen</label>`;
    },
    save(box, w) {
      w.cfg.hours = box.querySelector('[data-s="hours"]').checked;
      w.cfg.radar = box.querySelector('[data-s="radar"]').checked;
      if (w.cfg.radar && rd.map) setTimeout(() => rd.map.invalidateSize(), 80);
      return null;
    }
  }
});
