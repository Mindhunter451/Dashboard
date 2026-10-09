/* Kopf mit Himmel: Die Farben folgen dem echten Sonnenstand an deinem Ort, bei Wolken oder Regen werden sie grauer.
 * Der Bogen unten ist die Sonnenhöhe über den ganzen Tag (0 bis 24 Uhr), die Unterkante ist der Horizont.
 * Im Winter ist er flach, im Sommer hoch. Der Punkt ist die Sonne jetzt. Alles wird lokal berechnet, ohne Dienst. */
const sky = { key: '', day: null, minute: -1, w: 0 };
const RAD = Math.PI / 180;
/* Sonnenhöhe in Grad (vereinfachte NOAA-Formel, auf etwa ein halbes Grad genau) */
function sunAlt(date, lat, lon) {
  const d = date.getTime() / DAY + 2440587.5 - 2451545.0;
  const g = (357.529 + 0.98560028 * d) * RAD;
  const q = 280.459 + 0.98564736 * d;
  const L = (q + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g)) * RAD;
  const e = (23.439 - 0.00000036 * d) * RAD;
  const ra = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L));
  const dec = Math.asin(Math.sin(e) * Math.sin(L));
  const gmst = (18.697374558 + 24.06570982441908 * d) % 24;
  const ha = (gmst * 15 + lon) * RAD - ra;
  return Math.asin(Math.sin(lat * RAD) * Math.sin(dec) + Math.cos(lat * RAD) * Math.cos(dec) * Math.cos(ha)) / RAD;
}
function skyLoc() {
  if (wx.loc) return wx.loc;
  if (state.loc && state.loc.mode === 'fixed') return state.loc;
  return lsGet(GEO_KEY) || HH;
}
/* Tagesverlauf alle 10 Minuten, dazu Auf- und Untergang (Sonnenmitte 0,83 Grad unter dem Horizont) */
function sunDay(now, loc) {
  const t0 = sod(now), pts = [];
  for (let m = 0; m <= 1440; m += 10) pts.push([m, sunAlt(new Date(t0.getTime() + m * 6e4), +loc.lat, +loc.lon)]);
  const cross = up => {
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1][1] + 0.833, b = pts[i][1] + 0.833;
      if (up ? a < 0 && b >= 0 : a >= 0 && b < 0) {
        let lo = pts[i - 1][0], hi = pts[i][0];
        for (let k = 0; k < 12; k++) {
          const mid = (lo + hi) / 2, v = sunAlt(new Date(t0.getTime() + mid * 6e4), +loc.lat, +loc.lon) + 0.833;
          if ((v >= 0) === up) hi = mid; else lo = mid;
        }
        return new Date(t0.getTime() + Math.round(hi) * 6e4);
      }
    }
    return null;
  };
  let max = pts[0];
  for (const p of pts) if (p[1] > max[1]) max = p;
  return { pts, rise: cross(true), set: cross(false), noon: new Date(t0.getTime() + max[0] * 6e4), max: max[1] };
}

/* Farben des Himmels je Sonnenhöhe: oben, Mitte, Horizont. Abends wärmer als morgens. */
const SKY_AM = [
  [-90, '#03060F', '#060B19', '#0A1226'], [-18, '#050A18', '#0A1328', '#111D3A'], [-12, '#0A1430', '#18244A', '#2A3462'],
  [-6, '#132457', '#3A3C78', '#7A4E7E'], [-3, '#1D3672', '#5A5590', '#D27B78'], [0, '#2E4F8E', '#7C7FB4', '#F4A46A'],
  [3, '#3F6CB0', '#93A6D0', '#F6C690'], [8, '#3F7CC8', '#86B2E0', '#CFE0EE'], [20, '#2F76D2', '#6FA7E6', '#B4D6F2'], [90, '#2569CC', '#5E9DE6', '#A6CFF4']
];
const SKY_PM = [
  [-90, '#03060F', '#060B19', '#0A1226'], [-18, '#050A18', '#0A1328', '#111D3A'], [-12, '#0B1330', '#1C2148', '#33305E'],
  [-6, '#14214F', '#3E3470', '#8A4A6A'], [-3, '#1E3168', '#6A4C80', '#E0705A'], [0, '#30487F', '#8C6E98', '#F59048'],
  [3, '#3F64A6', '#A592B6', '#F7B46E'], [8, '#3F78C2', '#90AEDA', '#E8D6BE'], [20, '#2F76D2', '#6FA7E6', '#B4D6F2'], [90, '#2569CC', '#5E9DE6', '#A6CFF4']
];
const hex2rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const rgb2hex = c => '#' + c.map(x => Math.round(Math.max(0, Math.min(255, x))).toString(16).padStart(2, '0')).join('');
const mixRgb = (a, b, t) => a.map((x, i) => x + (b[i] - x) * t);
const lumOf = c => { const l = c.map(x => { x /= 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }); return 0.2126 * l[0] + 0.7152 * l[1] + 0.0722 * l[2]; };
/* Wie bedeckt ist es? 0 klar bis 0.8 Gewitter, aus dem aktuellen Wettercode */
function skyGrey() {
  const c = wx.data && wx.data.current ? wx.data.current.weather_code : null;
  if (c == null) return 0;
  if (c <= 1) return 0;
  if (c === 2) return 0.22;
  if (c === 3) return 0.55;
  if (c === 45 || c === 48) return 0.7;
  if (c >= 95) return 0.75;
  return 0.62;
}
function skyColors(alt, pm, grey) {
  const K = pm ? SKY_PM : SKY_AM;
  let i = 1;
  while (i < K.length - 1 && alt > K[i][0]) i++;
  const a = K[i - 1], b = K[i], t = Math.max(0, Math.min(1, (alt - a[0]) / (b[0] - a[0] || 1)));
  return [1, 2, 3].map(k => {
    let c = mixRgb(hex2rgb(a[k]), hex2rgb(b[k]), t);
    if (grey) {
      const y = Math.sqrt(lumOf(c)) * 255;
      c = mixRgb(c, [y * 0.94, y * 0.98, y * 1.04], grey);
    }
    return c;
  });
}
const ALT_MAX = 64;
/* Sterne einmal zufällig, aber immer gleich verteilt */
(() => {
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  let dots = '';
  for (let i = 0; i < 70; i++) dots += `<circle cx="${(rnd() * 1000).toFixed(1)}" cy="${(rnd() * 400).toFixed(1)}" r="${(0.5 + rnd() * rnd() * 1.4).toFixed(2)}" opacity="${(0.35 + rnd() * 0.65).toFixed(2)}"/>`;
  $('.sky-stars').style.backgroundImage = `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 400" preserveAspectRatio="xMidYMid slice"><g fill="#fff">${dots}</g></svg>`)}")`;
})();

function renderSky(now) {
  const el = $('#sky'), loc = skyLoc();
  const dk = `${ymd(now)}|${(+loc.lat).toFixed(2)}|${(+loc.lon).toFixed(2)}`;
  if (dk !== sky.key) { sky.key = dk; sky.day = sunDay(now, loc); sky.w = 0; }
  const D = sky.day, alt = sunAlt(now, +loc.lat, +loc.lon), pm = now > D.noon;
  const grey = skyGrey(), on = state.ui.sky;
  const [top, mid, low] = skyColors(alt, pm, grey);
  const inkHi = lumOf(mixRgb(top, mid, 0.5)) > 0.36 ? '#0F1B2B' : '#FFFFFF';
  const inkLo = lumOf(low) > 0.4 ? '#0F1B2B' : '#FFFFFF';
  const xNow = (now - sod(now)) / DAY;
  const sunUp = alt > -1, yNow = Math.max(0, alt) / ALT_MAX;
  const glowA = alt < -6 ? 0 : alt < 0 ? (alt + 6) / 6 * 0.5 : alt < 12 ? 0.5 : Math.max(0.22, 0.5 - (alt - 12) / 60);
  const glowC = alt < 10 ? '255,196,130' : '255,244,214';
  const stars = Math.max(0, Math.min(1, (-alt - 5) / 8)) * (1 - grey) ** 2;
  el.classList.toggle('plain', !on);
  const v = on ? {
    '--sky-top': rgb2hex(top), '--sky-mid': rgb2hex(mid), '--sky-low': rgb2hex(low),
    '--sky-ink': inkHi, '--sky-ink-low': inkLo,
    '--sky-glow': `rgba(${glowC},${(glowA * (1 - grey * 0.6)).toFixed(3)})`,
    '--sky-stars': stars.toFixed(2)
  } : {};
  for (const k of ['--sky-top', '--sky-mid', '--sky-low', '--sky-ink', '--sky-ink-low', '--sky-glow', '--sky-stars']) {
    if (v[k] !== undefined) el.style.setProperty(k, v[k]); else el.style.removeProperty(k);
  }
  el.style.setProperty('--sun-x', (xNow * 100).toFixed(2) + '%');
  el.style.setProperty('--sun-f', yNow.toFixed(3));
  el.dataset.night = alt < -6 ? '1' : '0';
  const tc = document.querySelector('meta[name="theme-color"]');
  if (tc && on) tc.content = rgb2hex(top);
  // Bogen
  const H = 100, toY = a => (H - Math.max(0, a) / ALT_MAX * (H - 6)).toFixed(1);
  const nowM = xNow * 1440;
  const line = list => list.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${toY(p[1])}`).join('');
  const P = D.pts, done = P.filter(p => p[0] <= nowM);
  if (done.length && done[done.length - 1][0] < nowM) done.push([nowM, alt]);
  $('#arc-rest').setAttribute('d', line(P));
  $('#arc-done').setAttribute('d', done.length > 1 ? line(done) : '');
  const sun = $('#arc-sun');
  sun.hidden = !sunUp;
  const lbl = (id, t, txt) => {
    const e = $(id);
    e.hidden = !t;
    if (!t) return;
    e.textContent = txt;
    e.style.left = ((t - sod(t)) / DAY * 100).toFixed(2) + '%';
  };
  lbl('#arc-rise', D.rise, D.rise ? hm(D.rise) : '');
  lbl('#arc-set', D.set, D.set ? hm(D.set) : '');
  // Text zur Sonne
  let st = '';
  if (D.rise && D.set) {
    if (now < D.rise) st = `Sonnenaufgang um ${hm(D.rise)}, in ${dur(D.rise - now)}`;
    else if (now < D.set) st = `Noch ${dur(D.set - now)} Tageslicht, Sonnenuntergang ${hm(D.set)}`;
    else {
      const tm = sunDay(addDays(sod(now), 1), loc);
      st = tm.rise ? `Sonnenaufgang morgen um ${hm(tm.rise)}` : 'Die Sonne ist untergegangen';
    }
  }
  $('#h-sun').textContent = st;
}
/* Wetterzeile im Kopf */
function renderSkyWx() {
  const e = $('#h-wx'), d = wx.data;
  if (!d || !d.current) { e.hidden = true; return; }
  const c = d.current, w = WMO[c.weather_code] || ['', 'cloud'];
  const hi = d.daily && d.daily.temperature_2m_max ? Math.round(d.daily.temperature_2m_max[0]) : null, lo = d.daily && d.daily.temperature_2m_min ? Math.round(d.daily.temperature_2m_min[0]) : null;
  e.innerHTML = `<b>${Number.isFinite(c.temperature_2m) ? Math.round(c.temperature_2m) + '°' : ''}</b> ${esc(w[0])}${hi != null ? `, heute ${lo}° bis ${hi}°` : ''}${wx.loc && wx.loc.name ? ` in ${esc(wx.loc.name)}` : ''}`;
  e.hidden = false;
}
function renderSkyNext() {
  const n = caNext(new Date()), e = $('#h-next');
  e.hidden = !n;
  if (n) e.innerHTML = `<b>${esc(n.label)}</b> <span>${esc(n.sub)}</span>`;
}
function skyTick(now) {
  const m = Math.floor(now.getTime() / 6e4);
  if (m === sky.minute) return;
  sky.minute = m;
  renderSky(now);
  renderSkyWx();
  renderSkyNext();
}
