/* Streckenband fürs Pendeln: deine Orte unterwegs (state.commute.via) als Kontrollpunkte auf der Strecke, mit Uhrzeit pro Ort.
 * Die Normalstrecke kommt von OSRM, also ohne Verkehr. Dort findet das Cockpit deine Orte über Straßennamen, Nummern (A 23)
 * und Ausfahrten (Hamburg-Stellingen), sonst über die Kartensuche. Was auf einer Richtung nicht liegt, lässt das Band dort weg.
 * Mit TomTom-Key zeigt das Band die gerade schnellste Route. Liegt ein Ort nicht mehr darauf, ist das eine Umleitung:
 * Dann nennt das Band die Straße, über die es stattdessen geht, und fragt TomTom einmal, wie lange die Normalstrecke
 * gerade dauern würde. So steht da, was die Umleitung spart. */
const cbNorm = s => String(s || '').toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').replace(/[^a-z0-9]/g, '');
const cbRoad = n => /^[ab]\d{1,3}$/.test(n);
/* Was jemand als Start oder Ziel mit in die Liste schreibt, steht ohnehin im Band */
const CB_SKIP = new Set(['home', 'zuhause', 'daheim', 'arbeit', 'work', 'buero', 'start', 'ziel']);
function cbParse(txt) {
  const old = new Map((state.commute.via || []).map(v => [cbNorm(v.text), v]));
  return normVia(String(txt || '').split(/[,;\n]+/).map(s => s.trim()).filter(s => s && !CB_SKIP.has(cbNorm(s))).map(s => old.get(cbNorm(s)) || { text: s }));
}
/* Punkt und Zeit an einer Stelle der Strecke (Meter ab Start) */
function cbPointAt(g, coords, s) {
  const c = g.cum, n = c.length;
  if (s <= 0) return coords[0];
  if (s >= c[n - 1]) return coords[n - 1];
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (c[m] <= s) lo = m; else hi = m; }
  const f = (s - c[lo]) / ((c[hi] - c[lo]) || 1);
  return [coords[lo][0] + (coords[hi][0] - coords[lo][0]) * f, coords[lo][1] + (coords[hi][1] - coords[lo][1]) * f];
}
function cbInterp(tbl, s) {
  if (!tbl.length) return 0;
  if (s <= tbl[0][0]) return tbl[0][1];
  for (let i = 1; i < tbl.length; i++) {
    if (s <= tbl[i][0]) { const [a, ta] = tbl[i - 1], [b, tb] = tbl[i]; return ta + (tb - ta) * ((s - a) / ((b - a) || 1)); }
  }
  return tbl[tbl.length - 1][1];
}
/* Fahrzeit ohne Verkehr bis zu jedem Punkt der OSRM-Route: aus den Zeiten pro Abschnitt, sonst aus den Fahranweisungen */
function cbOsrmTimes(route, g) {
  const d = (route.legs || []).flatMap(l => (l.annotation && Array.isArray(l.annotation.duration) ? l.annotation.duration : []));
  if (d.length === g.cum.length - 1) {
    const tbl = [[0, 0]];
    let t = 0;
    d.forEach((x, i) => { t += +x || 0; tbl.push([g.cum[i + 1], t]); });
    return tbl;
  }
  const steps = (route.legs || []).flatMap(l => l.steps || []), sum = steps.reduce((a, s) => a + (+s.distance || 0), 0) || 1, k = g.cum[g.cum.length - 1] / sum;
  const tbl = [[0, 0]];
  let a = 0, t = 0;
  for (const s of steps) { a += (+s.distance || 0) * k; t += +s.duration || 0; tbl.push([a, t]); }
  return tbl;
}
/* Was du an einem Ort tust, kurz: auffahren, abfahren, abbiegen */
function cbVerb(x) {
  if (!x) return '';
  if (x.type === 'on ramp') return 'auffahren';
  if (x.type === 'off ramp') return 'abfahren';
  if (x.type === 'turn' || x.type === 'end of road') {
    if (/left/.test(x.mod)) return 'links abbiegen';
    if (/right/.test(x.mod)) return 'rechts abbiegen';
  }
  return '';
}

/* Orte auf der Normalstrecke suchen, in Fahrtrichtung. Ergebnis pro Ort: on (liegt darauf), a (Meter ab Start),
 * p (Punkt dort), samples (Punkte auf den nächsten Metern, um ihn auf einer anderen Route wiederzufinden), verb, t (Sekunden ohne Verkehr) */
function cbMatch(route, g, dir) {
  const via = state.commute.via || [];
  if (!via.length) return [];
  const list = dir === 'home' ? [...via].reverse() : via;
  const coords = route.geometry.coordinates, total = g.cum[g.cum.length - 1];
  const steps = (route.legs || []).flatMap(l => l.steps || []), sum = steps.reduce((a, s) => a + (+s.distance || 0), 0) || 1, k = total / sum;
  let acc = 0;
  const st = steps.map(s => {
    const a = acc * k;
    acc += +s.distance || 0;
    const m = s.maneuver || {};
    return { a, b: acc * k, type: m.type || '', mod: m.modifier || '', name: cbNorm(s.name), refs: String(s.ref || '').split(';').map(cbNorm).filter(Boolean), dest: String(s.destinations || '').split(/[,:;]/).map(cbNorm).filter(Boolean) };
  });
  const T = cbOsrmTimes(route, g);
  let from = 0;
  return list.map(v => {
    const n = cbNorm(v.text), road = cbRoad(n);
    const named = x => x.name === n || (n.length >= 5 && (x.name.includes(n) || x.dest.some(d => d.includes(n))));
    // Straßennummern zuerst als Nummer des Abschnitts, dann als Ziel auf einem Schild
    const tests = road ? [x => x.refs.includes(n), x => x.dest.includes(n)] : [named];
    let i = -1;
    for (const t of tests) {
      i = st.findIndex((x, j) => j >= from && t(x));
      if (i < 0) i = st.findIndex(t);
      if (i >= 0) break;
    }
    let a, a0, a1, verb = '';
    if (i >= 0) {
      const x = st[i], p = st[i - 1];
      a = a0 = x.a;
      a1 = a + Math.max(150, Math.min(600, x.b - x.a));
      verb = road ? '' : cbVerb(x);
      // Auf eine Autobahn: die Auffahrt davor gehört dazu
      if (road && p && p.type === 'on ramp' && x.a - p.a < 1500) { verb = 'auffahren'; a = a0 = p.a; }
      else if (road && x.type === 'on ramp') verb = 'auffahren';
      from = i + 1;
    } else {
      const f = cbGeo(v, g, coords);
      if (!f) return { text: v.text, on: false };
      a = f;
      a0 = Math.max(0, a - 150);
      a1 = Math.min(total, a + 150);
      const r = st.find(x => (x.type === 'on ramp' || x.type === 'off ramp') && x.a > a - 300 && x.a < a + 800);
      verb = cbVerb(r);
    }
    const samples = Array.from({ length: 6 }, (_, q) => cbPointAt(g, coords, a0 + (a1 - a0) * q / 5));
    return { text: v.text, on: true, a, p: cbPointAt(g, coords, a), samples, verb, t: cbInterp(T, a) };
  });
}
/* Ort aus der Kartensuche auf der Strecke: ein Stadtteil, wenn die Strecke hindurchführt. Eine Straße liegt als Punkt
 * auf sich selbst, die Strecke muss also fast genau darüber laufen (60 m), sonst zählt eine Parallelstraße mit. */
function cbGeo(v, g, coords) {
  if (v.lat === undefined) return null;
  if (v.ext) {
    const [w, nn, e, s] = v.ext, pad = 0.002;
    let best = -1, bd = Infinity;
    coords.forEach(([lo, la], i) => {
      if (lo < w - pad || lo > e + pad || la < s - pad || la > nn + pad) return;
      const d = Math.hypot((lo - v.lon) * g.kx, (la - v.lat) * g.ky);
      if (d < bd) { bd = d; best = i; }
    });
    return best >= 0 ? g.cum[best] : null;
  }
  const r = nearestOn(g, v.lon, v.lat);
  return r.d <= 60 ? r.along : null;
}
/* Orte ohne Treffer bei den Straßennamen einmal in der Kartensuche nachschlagen, im Umkreis der Strecke */
async function cbFill(route, names) {
  if (cm.cbBusy) return false;
  const want = (state.commute.via || []).filter(v => names.includes(v.text) && v.lat === undefined && !v.nf && !cm.cbTried.has(v.text));
  if (!want.length) return false;
  cm.cbBusy = true;
  let changed = false;
  try {
    const cs = route.geometry.coordinates, lons = cs.map(c => c[0]), lats = cs.map(c => c[1]), pad = 0.08;
    const bbox = [Math.min(...lons) - pad, Math.min(...lats) - pad, Math.max(...lons) + pad, Math.max(...lats) + pad].map(x => x.toFixed(4)).join(',');
    for (const v of want) {
      cm.cbTried.add(v.text);
      let j = null;
      try { j = await getJson(`https://photon.komoot.io/api/?q=${encodeURIComponent(v.text)}&limit=1&lang=de&bbox=${bbox}`, 9000); } catch { continue; }
      const f = j && Array.isArray(j.features) ? j.features[0] : null, cur = state.commute.via.find(x => x.text === v.text);
      if (!cur) continue;
      if (f && f.geometry) {
        cur.lat = +f.geometry.coordinates[1];
        cur.lon = +f.geometry.coordinates[0];
        const p = f.properties || {};
        // Ausdehnung nur bei Flächen wie Stadtteilen, eine Straße ist besser als Punkt
        if (Array.isArray(p.extent) && p.osm_key === 'place') cur.ext = p.extent;
      } else cur.nf = true;
      changed = true;
    }
  } finally { cm.cbBusy = false; }
  if (changed) { state.commute.via = normVia(state.commute.via); persist(); }
  return changed;
}

/* Welche Orte liegen auf der TomTom-Route? Ein Ort fehlt erst, wenn die Route an seiner Stelle deutlich vorbeiführt.
 * Knapp daneben (andere Karte, andere Fahrbahn) zählt als drauf. */
function cbOnRoute(orte, tg) {
  return orte.filter(o => o.on).map(o => {
    const ds = o.samples.map(([lo, la]) => nearestOn(tg, lo, la).d);
    const close = ds.filter(d => d <= 60).length, far = ds.filter(d => d > 200).length;
    return close < 3 && far >= 2 ? null : nearestOn(tg, o.p[0], o.p[1]).along;
  });
}
/* Fahrzeit mit Verkehr bis zu einer Stelle der TomTom-Route: aus den Zeiten der Fahranweisungen */
function cbTtTable(tt, tg) {
  const n = tg.cum.length, tbl = [[0, 0]];
  for (const x of tt.ins || []) if (x.i > 0 && x.i < n && Number.isFinite(x.t)) tbl.push([tg.cum[x.i], x.t]);
  tbl.push([tg.cum[n - 1], tt.time]);
  return tbl.length > 2 ? tbl.sort((p, q) => p[0] - q[0]) : null;
}
/* Die Umleitung: welche Orte fehlen, zwischen welchen Stellen, und über welche Straßen es stattdessen geht */
function cbDetour(orte, along, tt, tg, route) {
  const on = orte.filter(o => o.on), miss = on.filter((o, i) => along[i] === null);
  if (!miss.length) return null;
  const i0 = on.indexOf(miss[0]), i1 = on.indexOf(miss[miss.length - 1]);
  let a = 0, b = tg.cum[tg.cum.length - 1];
  for (let i = i0 - 1; i >= 0; i--) if (along[i] !== null) { a = along[i]; break; }
  for (let i = i1 + 1; i < on.length; i++) if (along[i] !== null) { b = along[i]; break; }
  const usual = new Set((route.legs || []).flatMap(l => l.steps || []).map(s => cbNorm(s.name)).filter(Boolean));
  const ins = (tt.ins || []).filter(x => x.i >= 0 && x.i < tg.cum.length).sort((p, q) => p.i - q.i), len = new Map();
  ins.forEach((x, k) => {
    const s0 = tg.cum[x.i], s1 = k + 1 < ins.length ? tg.cum[ins[k + 1].i] : tg.cum[tg.cum.length - 1];
    const lo = Math.max(a, s0), hi = Math.min(b, s1), name = x.street || x.road;
    if (hi > lo && name && !usual.has(cbNorm(name))) len.set(name, (len.get(name) || 0) + hi - lo);
  });
  const top = [...len].filter(([, l]) => l >= 200).sort((p, q) => q[1] - p[1]);
  const via = top.slice(0, top[1] && top[1][1] >= top[0][1] * 0.5 ? 2 : 1).map(([nm]) => nm);
  return { miss: miss.map(o => o.text), via, a, b, save: null };
}
/* Normalstrecke mit dem Verkehr von jetzt: TomTom baut die OSRM-Route aus Stützpunkten nach. Höchstens alle 4 Minuten,
 * und nur, wenn die Antwort wirklich über deine Orte führt. Lehnt TomTom die Anfrage ab, bleibt es für diese Sitzung dabei. */
async function cbUsual(route, from, to, orte) {
  let key = null;
  try { key = localStorage.getItem(TT_KEY); } catch { key = null; }
  if (!key || cm.cbPostOff) return null;
  const sig = `${cm.dir}|${route.distance}|${orte.map(o => o.text).join(',')}`, old = cm.cbUsual;
  if (old && old.sig === sig && Date.now() - old.at < 4 * 6e4) return old.v;
  const cs = route.geometry.coordinates, step = Math.max(1, Math.ceil(cs.length / 300));
  const pts = cs.filter((_, i) => i % step === 0 || i === cs.length - 1).map(([lo, la]) => ({ latitude: la, longitude: lo }));
  const url = `https://api.tomtom.com/routing/1/calculateRoute/${from.lat},${from.lon}:${to.lat},${to.lon}/json?key=${encodeURIComponent(key)}&traffic=true&travelMode=car&routeType=fastest&computeTravelTimeFor=all`;
  let v = null;
  try {
    const j = await ttFetch(url, { supportingPoints: pts });
    const r = j && Array.isArray(j.routes) ? j.routes[0] : null, sm = r && r.summary;
    const points = r ? (r.legs || []).flatMap(l => (l.points || []).map(p => [+p.longitude, +p.latitude])) : [];
    if (sm && Number.isFinite(+sm.travelTimeInSeconds) && points.length > 1 && cbOnRoute(orte, prepRoute(points)).every(x => x !== null)) v = { time: +sm.travelTimeInSeconds };
  } catch (e) { if (e && (e.status === 400 || e.why === 'key')) cm.cbPostOff = true; }
  cm.cbUsual = { sig, at: Date.now(), v };
  return v;
}

/* Das Band zum Zeichnen: Zeilen (Start, Orte, Umleitung, Ziel) mit Uhrzeit und dem Verkehr auf dem Abschnitt davor */
const CB_WORST = ['closure', 'jam', 'slow', 'warn', 'works'];
const CB_LBL = { closure: 'Sperrung', jam: 'Stau', slow: 'Zähfließend', warn: 'Zähfließend', works: 'Baustelle' };
function cbBand(R, items, now) {
  const orte = R.orte || [];
  if (!orte.some(o => o.on)) return null;
  const tt = R.tt && !R.tt.error ? R.tt : null, B = R.cb || {}, t0 = +now;
  const total = tt ? tt.time : R.route.duration + R.ab.list.filter(i => i.k !== 'works').reduce((s, i) => s + i.delay * 60, 0);
  const L = B.tg ? B.tg.cum[B.tg.cum.length - 1] : R.g.cum[R.g.cum.length - 1];
  // Zeit bis zu einer Stelle: mit TomTom aus den Fahranweisungen, sonst ohne Verkehr plus die Staus davor
  const delayBefore = s => items.filter(i => i.k !== 'works' && i.along < s).reduce((x, i) => x + i.delay * 60, 0);
  const T = B.tbl || cbOsrmTimes(R.route, R.g);
  const k = tt && !B.tbl ? (tt.time - tt.delay) / (R.route.duration || 1) : 1;
  const timeAt = s => (B.tbl ? cbInterp(B.tbl, s) : cbInterp(T, s) * k + delayBefore(s));
  const home = R.dir === 'home';
  const rows = [{ k: 'start', n: home ? 'Arbeit' : 'Zuhause', s: 0, t: t0 }];
  const on = orte.filter(o => o.on), dev = B.dev;
  on.forEach((o, i) => {
    const s = tt ? B.along[i] : o.a;
    if (s === null) {
      if (dev && o.text === dev.miss[0]) rows.push({ k: 'via', n: dev.via.length ? `über ${dev.via.join(' und ')}` : 'andere Strecke', s: (dev.a + dev.b) / 2, t: 0 });
      rows.push({ k: 'skip', n: o.text, s: null });
      return;
    }
    rows.push({ k: 'ort', n: o.text, verb: o.verb, s, t: t0 + timeAt(s) * 1000 });
  });
  rows.push({ k: 'end', n: home ? 'Zuhause' : 'Arbeit', s: L, t: t0 + total * 1000 });
  // Abschnitte zwischen den Zeilen mit Position: das Schlimmste darauf und die Verzögerung
  let prev = rows[0];
  for (const r of rows.slice(1)) {
    if (r.s === null) continue;
    const on2 = items.filter(i => i.along >= prev.s && i.along < r.s), worst = CB_WORST.find(kk => on2.some(i => i.k === kk));
    const delay = on2.filter(i => i.k !== 'works').reduce((x, i) => x + i.delay, 0);
    r.lv = prev.k === 'via' || r.k === 'via' ? 'dev' : worst || 'ok';
    if (worst && r.lv !== 'dev') r.inc = `${CB_LBL[worst]}${delay >= 1 ? `, +${Math.round(delay)} Min` : ''}`;
    prev = r;
  }
  return { rows, dev };
}
/* HTML für Pendeln und Spiegel. Jede Zeile malt die Linie davor (--in) und danach (--out). */
function cbHtml(band) {
  if (!band) return '';
  const rows = band.rows, out = [];
  rows.forEach((r, i) => {
    const nx = rows.slice(i + 1).find(x => x.s !== null || x.k === 'skip');
    const inLv = i === 0 ? 'none' : r.k === 'skip' ? 'dev' : r.lv || 'ok';
    const outLv = !nx ? 'none' : nx.k === 'skip' ? 'dev' : nx.lv || 'ok';
    if (r.inc) out.push(`<li class="cb-inc" data-lv="${r.lv}" style="--in:var(--cb-${r.lv});--out:var(--cb-${r.lv})">${esc(r.inc)}</li>`);
    const sub = r.k === 'skip' ? 'heute nicht' : r.verb || '';
    out.push(`<li class="cb" data-k="${r.k}" style="--in:var(--cb-${inLv});--out:var(--cb-${outLv})"><span class="cb-n"><b>${esc(r.n)}</b>${sub ? ` <small>${esc(sub)}</small>` : ''}</span>${r.t ? `<time>${hm(new Date(r.t))}</time>` : '<time></time>'}</li>`);
  });
  return `<ol class="cm-band">${out.join('')}</ol>`;
}
/* Ein Satz zur Umleitung: wohin, wofür, und was es bringt */
function cbDevTxt(dev) {
  if (!dev) return '';
  const via = dev.via.length ? `über ${dev.via.join(' und ')}` : 'eine andere Strecke';
  const miss = dev.miss.length > 1 ? `${dev.miss.slice(0, -1).join(', ')} und ${dev.miss[dev.miss.length - 1]}` : dev.miss[0];
  return `Heute schneller ${via}, ohne ${miss}${dev.save >= 1 ? `. Spart etwa ${dev.save} Min` : ''}.`;
}
/* Band im Pendeln-Widget zeichnen. Die Uhrzeiten gelten „wenn du jetzt losfährst“, deshalb jede Minute neu. */
function cbRender(now) {
  const R = cm.res, box = $('#cm-band');
  cm.band = R && R.orte ? cbBand(R, cm.bandItems || [], now) : null;
  const html = cbHtml(cm.band);
  if (box.innerHTML !== html) box.innerHTML = html;
  box.hidden = !html;
  if (!$('#cm-form').hidden) cbFormRes();
}
let cbMin = -1;
function cbTick(now) {
  if (now.getMinutes() === cbMin || !cm.res || !views.has('commute')) return;
  cbMin = now.getMinutes();
  cbRender(now);
}
/* Unter dem Eingabefeld: was auf der Strecke liegt (in der Richtung, die gerade gezeigt wird) */
function cbFormRes() {
  const R = cm.res, out = $('#cm-via-res');
  if (!R || !R.orte || !R.orte.length || $('#cm-via').value.trim() !== (state.commute.via || []).map(v => v.text).join(', ')) { out.textContent = ''; return; }
  const on = R.orte.filter(o => o.on).map(o => o.text), off = R.orte.filter(o => !o.on).map(o => o.text);
  const dir = R.dir === 'home' ? 'auf dem Heimweg' : 'auf dem Weg zur Arbeit';
  out.textContent = [on.length ? `${dir} gefunden: ${on.join(', ')}` : '', off.length ? `${on.length ? 'Nicht' : `${dir[0].toUpperCase()}${dir.slice(1)} nicht`} dabei: ${off.join(', ')}` : ''].filter(Boolean).join('. ') + '.';
}
/* Kurz für den Spiegel, die fehlenden Orte zeigt dort das Band */
function cbDevShort(dev) {
  if (!dev) return '';
  return `Heute über ${dev.via[0] || 'eine andere Strecke'}${dev.save >= 1 ? `, spart ${dev.save} Min` : ''}`;
}
