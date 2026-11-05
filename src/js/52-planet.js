/* Wetterplanet: eine kleine Low-Poly-Welt mit Häuschen, See und Bäumen, die dein echtes Wetter nachspielt.
 * Sonne und Mond laufen nach der echten Uhrzeit über den Planeten (Auf- und Untergang aus 40-himmel.js), der Mond mit
 * seiner echten Phase. Nachts kommen Sterne raus und im Häuschen geht das Licht an, an trüben Tagen auch schon tagsüber.
 * Wolken nach Bedeckung, Niesel, Regen, Schnee (der Planet wird weiß und bleibt es, solange Schnee liegt), Gewitter mit
 * Blitzen, Nebel, Wind in den Bäumen, Rauch aus dem Schornstein, wenn es kalt ist, Eis auf dem See bei Frost und
 * Laubbäume, die mit den Jahreszeiten die Farbe wechseln.
 * Gezeichnet mit WebGL2 ohne Fremd-Bibliothek: flach schattierte Dreiecke, Schatten über eine Shadow Map, Himmel, Sterne,
 * Regen und Schnee in eigenen Shadern. Gezeichnet wird nur, was gerade zu sehen ist, im Spiegel mit 30 Bildern pro Sekunde.
 * Daten: wie beim Wetter (wx.data) oder pro Widget ein eigener Ort über Open-Meteo.
 * Seit 3.13 dazu: Straße mit deinem Auto (fährt zur Pendelzeit), Windrad nach echtem Wind, Fähnchen bei Terminen, Flugzeug vor
 * dem Urlaub, Gewohnheitswald, Katze im Fenster bei Regen, Lichterkette, Kürbisse, Feuerwerk, Glühwürmchen, Polarlicht, ISS,
 * Sternschnuppen und Dunst bei schlechter Luft. Die Daten dafür kommen aus 53-planet-daten.js, Vollbild und Nachttisch aus
 * 54-planet-vollbild.js.
 * Seit 3.14: weichere Wolken mit Silberrand, Nächte mit Mondlicht und Fülllicht, Leuchten mit Lichthof, See mit Tiefe, Glitzern und
 * Ringen, weiche Schatten am Boden, Birken, Blumen, Grasbüschel, Pilze, Schilf, Seerosen, Raureif, Hitze, Frühnebel, Hagel und ein
 * Schneemann. Tiere, Blätter, Regenbogen und Sturm in 55-planet-tiere.js, das Infofeld in 56-planet-legende.js. */
const PN_FOV = 28 * Math.PI / 180, PN_FIT = 1.98, PN_SUN_R = 1.78, PN_PITCH = 0.36;
const PN_RAD = Math.PI / 180;
const pn = { inst: new Map(), raf: 0, io: null, wx: new Map() };

/* Vektoren als [x, y, z], Matrizen spaltenweise wie WebGL */
const pnV = {
  add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  mul: (a, s) => [a[0] * s, a[1] * s, a[2] * s],
  dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  norm: a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; },
  mix: (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
};
const pnM = {
  persp(fy, asp, n, f) { const t = 1 / Math.tan(fy / 2), nf = 1 / (n - f); return [t / asp, 0, 0, 0, 0, t, 0, 0, 0, 0, (f + n) * nf, -1, 0, 0, 2 * f * n * nf, 0]; },
  ortho(r, n, f) { return [1 / r, 0, 0, 0, 0, 1 / r, 0, 0, 0, 0, -2 / (f - n), 0, 0, 0, -(f + n) / (f - n), 1]; },
  look(e, c, up) {
    const z = pnV.norm(pnV.sub(e, c)), x = pnV.norm(pnV.cross(up, z)), y = pnV.cross(z, x);
    return [x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -pnV.dot(x, e), -pnV.dot(y, e), -pnV.dot(z, e), 1];
  },
  mul(a, b) {
    const o = new Array(16);
    for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
    return o;
  },
  /* Achsen x, y, z, Verschiebung p, gleichmäßige Größe s */
  frame(x, y, z, p, s) { return [x[0] * s, x[1] * s, x[2] * s, 0, y[0] * s, y[1] * s, y[2] * s, 0, z[0] * s, z[1] * s, z[2] * s, 0, p[0], p[1], p[2], 1]; }
};
const pnSmooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const pnLin = hex => { const c = typeof hex === 'string' ? hex2rgb(hex) : hex; return c.map(x => (x / 255) ** 2.2); };
const pnLL = (lat, lon) => [Math.cos(lat * PN_RAD) * Math.sin(lon * PN_RAD), Math.sin(lat * PN_RAD), Math.cos(lat * PN_RAD) * Math.cos(lon * PN_RAD)];
const pnAng = (a, b) => Math.acos(Math.max(-1, Math.min(1, pnV.dot(a, b))));
function pnRng(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const pnHashStr = s => { let h = 2166136261; for (const ch of String(s)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return h >>> 0; };
/* Glattes Rauschen für die Hügel */
function pnNoise(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), xf = x - xi, yf = y - yi, zf = z - zi;
  const h = (a, b, c) => { const s = Math.sin(a * 127.1 + b * 311.7 + c * 74.7) * 43758.5453; return s - Math.floor(s); };
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
  const l = (a, b, t) => a + (b - a) * t;
  return l(l(l(h(xi, yi, zi), h(xi + 1, yi, zi), u), l(h(xi, yi + 1, zi), h(xi + 1, yi + 1, zi), u), v),
    l(l(h(xi, yi, zi + 1), h(xi + 1, yi, zi + 1), u), l(h(xi, yi + 1, zi + 1), h(xi + 1, yi + 1, zi + 1), u), v), w);
}
const pnFbm = p => pnNoise(p[0] * 1.9 + 3.1, p[1] * 1.9, p[2] * 1.9) * 0.62 + pnNoise(p[0] * 4.1, p[1] * 4.1 + 7.3, p[2] * 4.1) * 0.28 + pnNoise(p[0] * 8.7, p[1] * 8.7, p[2] * 8.7 + 1.7) * 0.1;
function pnIco(sub) {
  const t = (1 + Math.sqrt(5)) / 2;
  const V = [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]].map(pnV.norm);
  let F = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8], [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];
  for (let s = 0; s < sub; s++) {
    const cache = new Map(), NF = [];
    const mid = (a, b) => {
      const k = a < b ? a * 1e5 + b : b * 1e5 + a;
      let i = cache.get(k);
      if (i === undefined) { i = V.length; V.push(pnV.norm(pnV.mix(V[a], V[b], 0.5))); cache.set(k, i); }
      return i;
    };
    for (const [a, b, c] of F) { const ab = mid(a, b), bc = mid(b, c), ca = mid(c, a); NF.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]); }
    F = NF;
  }
  return { V, F };
}

/* Szene: Dreiecke mit Farbe (linear) und Merkmalen. at = [Schnee möglich 0..1, Wiegen im Wind 0..1, Art, Zufall pro Fläche]
 * Art: 0 Boden und Dinge, 1 Fenster, 2 Wasser, 3 Wolke */
class PnMesh {
  constructor() { this.p = []; this.n = []; this.c = []; this.a = []; }
  /* sm: [Mitte, Anteil] macht die Fläche weicher (Normalen zur Mitte hin gebogen), vk: Helligkeit pro Ecke (Schatten am Boden) */
  tri(a, b, c, col, at, inside, sw, sm, vk) {
    let n = pnV.norm(pnV.cross(pnV.sub(b, a), pnV.sub(c, a)));
    if (inside) {
      const m = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3];
      if (pnV.dot(n, pnV.sub(m, inside)) < 0) { n = pnV.mul(n, -1); [b, c] = [c, b]; sw = sw && [sw[0], sw[2], sw[1]]; vk = vk && [vk[0], vk[2], vk[1]]; }
    }
    const r = Math.random();
    [a, b, c].forEach((v, i) => {
      const nn = sm ? pnV.norm(pnV.add(pnV.mul(n, 1 - sm[1]), pnV.mul(pnV.norm(pnV.sub(v, sm[0])), sm[1]))) : n, k = vk ? vk[i] : 1;
      this.p.push(...v); this.n.push(...nn); this.c.push(col[0] * k, col[1] * k, col[2] * k); this.a.push(at[0], sw ? sw[i] : at[1], at[2], at[3] ?? r);
    });
  }
  get count() { return this.p.length / 3; }
}
/* Teile eines Objekts in eigenen Koordinaten (y nach oben, z nach vorn), später auf den Planeten gesetzt */
class PnPart {
  constructor() { this.t = []; }
  tri(a, b, c, col, s = 1, k = 0, inside = null, sm = null) { this.t.push({ p: [a, b, c], col, s, k, inside, sm }); }
  quad(a, b, c, d, col, s, k, inside) { this.tri(a, b, c, col, s, k, inside); this.tri(a, c, d, col, s, k, inside); }
  box(x0, y0, z0, x1, y1, z1, col, s = 1, k = 0) {
    const P = (x, y, z) => [x ? x1 : x0, y ? y1 : y0, z ? z1 : z0], m = [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2];
    const f = [[P(0, 0, 1), P(1, 0, 1), P(1, 1, 1), P(0, 1, 1)], [P(1, 0, 0), P(0, 0, 0), P(0, 1, 0), P(1, 1, 0)], [P(1, 0, 1), P(1, 0, 0), P(1, 1, 0), P(1, 1, 1)],
      [P(0, 0, 0), P(0, 0, 1), P(0, 1, 1), P(0, 1, 0)], [P(0, 1, 1), P(1, 1, 1), P(1, 1, 0), P(0, 1, 0)]];
    for (const [a, b, c, d] of f) this.quad(a, b, c, d, col, s, k, m);
  }
  /* Prisma oder Kegel um die y-Achse: r0 unten, r1 oben */
  cone(cx, cz, r0, r1, y0, y1, n, col, s = 1, rot = 0, jit = null) {
    const ring = (r, y) => Array.from({ length: n }, (_, i) => { const a = rot + i / n * Math.PI * 2, j = jit ? 1 + (jit() - 0.5) * 0.16 : 1; return [cx + Math.cos(a) * r * j, y, cz + Math.sin(a) * r * j]; });
    const A = ring(r0, y0), B = r1 > 0 ? ring(r1, y1) : null, top = [cx, y1, cz], bot = [cx, y0, cz], m = [cx, (y0 + y1) / 2, cz];
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n, c = Array.isArray(col[0]) ? col[i % col.length] : col;
      if (B) { this.quad(A[i], A[j], B[j], B[i], c, s, 0, m); this.tri(B[i], B[j], top, c, s, 0, m); } else this.tri(A[i], A[j], top, c, s, 0, m);
      this.tri(A[j], A[i], bot, c, 0, 0, m);
    }
  }
  /* Klumpen aus einem Ikosaeder, etwas verbeult: Baumkronen, Büsche, Steine, Wolken. soft: wie weich er schattiert wird (0 kantig) */
  blob(cx, cy, cz, r, sy, cols, s, rng, sub = 1, flatY = null, k = 0, soft = 0) {
    this.ell(cx, cy, cz, r, r * sy, r, cols, s, rng, sub, flatY, k, soft);
  }
  /* Ellipsoid mit drei Radien, für Tiere und längliche Dinge */
  ell(cx, cy, cz, rx, ry, rz, cols, s, rng, sub = 1, flatY = null, k = 0, soft = 0, jit = 0.22) {
    const { V, F } = pnIco(sub), J = V.map(() => 1 + (rng() - 0.5) * jit);
    const P = V.map((v, i) => { let y = cy + v[1] * ry * J[i]; if (flatY !== null) y = Math.max(y, flatY); return [cx + v[0] * rx * J[i], y, cz + v[2] * rz * J[i]]; });
    const m = [cx, cy, cz], sm = soft ? [m, soft] : null;
    for (const [a, b, c] of F) this.tri(P[a], P[b], P[c], cols[Math.floor(rng() * cols.length)], s, k, m, sm);
  }
}
/* Ein Teil auf den Planeten setzen. fr: { x, y, z, o } Achsen und Ursprung, sh: Höhe fürs Wiegen (0 = steht fest) */
function pnPut(M, part, fr, sh = 0, ao = null) {
  const T = v => [fr.o[0] + fr.x[0] * v[0] + fr.y[0] * v[1] + fr.z[0] * v[2], fr.o[1] + fr.x[1] * v[0] + fr.y[1] * v[1] + fr.z[1] * v[2], fr.o[2] + fr.x[2] * v[0] + fr.y[2] * v[1] + fr.z[2] * v[2]];
  // ao: [Höhe, Helligkeit unten] dunkelt den Fuß ab, so steht alles fest auf dem Boden statt darauf zu schweben
  const K = ao ? v => ao[1] + (1 - ao[1]) * pnSmooth(-0.02, ao[0], v[1]) : null;
  for (const t of part.t) {
    const sw = sh ? t.p.map(v => Math.min(1, Math.max(0, v[1] / sh)) ** 1.6) : null;
    M.tri(T(t.p[0]), T(t.p[1]), T(t.p[2]), t.col, [t.s, 0, t.k], t.inside ? T(t.inside) : null, sw, t.sm ? [T(t.sm[0]), t.sm[1]] : null, K ? t.p.map(K) : null);
  }
}
/* Achsen an einer Stelle des Planeten: y zeigt nach außen, z in Richtung fwd (oder gedreht um rot) */
function pnFrame(u, h, fwd, rot = 0, sc = 1) {
  const y = pnV.norm(u);
  let f = fwd ? pnV.sub(fwd, pnV.mul(y, pnV.dot(fwd, y))) : pnV.cross([1, 0, 0], y);
  if (Math.hypot(...f) < 1e-3) f = pnV.cross([0, 0, 1], y);
  f = pnV.norm(f);
  const x0 = pnV.cross(y, f), c = Math.cos(rot), s = Math.sin(rot);
  const z = pnV.add(pnV.mul(f, c), pnV.mul(x0, s)), x = pnV.cross(y, z);
  return { x: pnV.mul(x, sc), y: pnV.mul(y, sc), z: pnV.mul(z, sc), o: pnV.mul(y, h) };
}

/* Gelände: Hügel aus Rauschen, flach am Haus und am See, der See als Mulde */
const PN_HOUSE = pnV.norm(pnLL(41, -26)), PN_LAKE = pnV.norm(pnLL(24, 33)), PN_LR = 0.34, PN_WL = 0.993, PN_HS = 1.6, PN_TS = 1.45;
const PN_MILL = pnV.norm(pnLL(50, 46)), PN_ROAD_A = pnV.norm(pnLL(23.15, -38.33)), PN_ROAD_B = pnV.norm(pnLL(5.11, 6.98));
function pnH0(u) {
  let h = 1 + (pnFbm(u) - 0.5) * 0.11;
  const dh = pnAng(u, PN_HOUSE), dl = pnAng(u, PN_LAKE);
  h = h + (1.012 - h) * (1 - pnSmooth(0.24, 0.42, dh));
  h = h + (1.006 - h) * (1 - pnSmooth(PN_LR, PN_LR + 0.2, dl));
  if (dl < PN_LR) h -= 0.055 * pnSmooth(PN_LR, PN_LR * 0.35, dl);
  return h;
}
/* Mit Straße (R) wird ein Band entlang der Straße auf deren geglättete Höhe gebracht, damit sie nicht in Hügeln verschwindet */
function pnH(u, R) {
  const h = pnH0(u);
  if (!R) return h;
  const i = pnRoadNear(R, u);
  return h + (R.hs[i] - h) * (1 - pnSmooth(0.12, 0.22, pnAng(u, R.P[i])));
}
/* Die Straße: eine geschlossene, leicht geschwungene Schleife um den Planeten, links am Haus vorbei. Dort parkt das Auto. */
let pnRoadMemo = null;
function pnRoad() {
  if (pnRoadMemo) return pnRoadMemo;
  const N = 220, c = pnV.norm(pnV.cross(PN_ROAD_A, PN_ROAD_B)), e2 = pnV.cross(c, PN_ROAD_A), P = [];
  for (let i = 0; i < N; i++) {
    const th = i / N * Math.PI * 2, al = Math.PI / 2 + 0.14 * Math.sin(2 * th) + 0.06 * Math.sin(5 * th);
    const b = pnV.add(pnV.mul(PN_ROAD_A, Math.cos(th)), pnV.mul(e2, Math.sin(th)));
    P.push(pnV.norm(pnV.add(pnV.mul(c, Math.cos(al)), pnV.mul(b, Math.sin(al)))));
  }
  const h0 = P.map(pnH0), hs = h0.map((_, i) => { let s = 0; for (let k = -8; k <= 8; k++) s += h0[(i + k + N) % N]; return s / 17 + 0.002; });
  const T = P.map((_, i) => pnV.norm(pnV.sub(P[(i + 1) % N], P[(i + N - 1) % N])));
  let park = 0;
  P.forEach((p, i) => { if (pnV.dot(p, PN_HOUSE) > pnV.dot(P[park], PN_HOUSE)) park = i; });
  pnRoadMemo = { P, hs, T, N, park };
  return pnRoadMemo;
}
function pnRoadNear(R, u) {
  let best = 0, bd = -2;
  for (let i = 0; i < R.N; i++) { const d = R.P[i][0] * u[0] + R.P[i][1] * u[1] + R.P[i][2] * u[2]; if (d > bd) { bd = d; best = i; } }
  return best;
}
/* Punkt und Richtung auf der Straße an einer Stelle s (in Abschnitten, darf über das Ende laufen) */
function pnRoadAt(R, s) {
  const N = R.N, i = ((Math.floor(s) % N) + N) % N, j = (i + 1) % N, f = s - Math.floor(s);
  const u = pnV.norm(pnV.mix(R.P[i], R.P[j], f));
  return { u, p: pnV.mul(u, R.hs[i] + (R.hs[j] - R.hs[i]) * f + 0.006), t: pnV.norm(pnV.mix(R.T[i], R.T[j], f)) };
}
/* Jahreszeit für die Bäume, auf der Südhalbkugel ein halbes Jahr versetzt, in den Tropen immer Sommer. bare: Anteil kahler Laubbäume */
function pnSeason(d, lat) {
  let n = Math.floor((d - new Date(d.getFullYear(), 0, 1)) / DAY);
  if (Math.abs(lat) < 23.5) return { k: 'summer', bare: 0 };
  if (lat < 0) n = (n + 182) % 365;
  if (n < 70 || n >= 338) return { k: 'winter', bare: 1 };
  if (n < 140) return { k: 'spring', bare: 0 };
  if (n < 258) return { k: 'summer', bare: 0 };
  return { k: 'autumn', bare: clamp01((n - 312) / 26) };
}
const PN_COL = {
  grass: { spring: '#6DB443', summer: '#5FA33E', autumn: '#6E9C3F', winter: '#76905A' },
  leaf: { spring: ['#8DC63F', '#9DD15A', '#7FBA3C', '#F2C4D6'], summer: ['#5C9C39', '#6CAD44', '#4E8B33'], autumn: ['#E39B2D', '#D8642A', '#E8B83A', '#C2502A', '#B9A23A'], winter: ['#8A7A5E'] },
  pine: ['#2F6B47', '#3A7A50', '#285E40'], trunk: '#7A5236', sand: '#D8C48A', bed: '#9C8B62', rock: ['#8F8B86', '#A39E97', '#7D7974'],
  wall: '#EDE2CB', wall2: '#E0D3B8', roof: '#B9503A', roof2: '#9E4230', chim: '#8C4A3A', frame: '#FFFFFF', glass: '#2C3E50', door: '#2F5D4E',
  stone: '#A9A196', wood: '#9A6B43', water: '#2E86B8', cloud: ['#F7F9FB', '#EEF2F6', '#E6EBF0'],
  road: '#6F6E6B', roadSide: '#7E7A63', line: '#ECE7D8', mill: '#EEF0F2', mill2: '#D3D8DE', pole: '#DADDE1', knob: '#C9A23A',
  cat: '#3E3936', cat2: '#26221F', pumpkin: ['#E47B1C', '#EE8A26', '#D86C14'], stem: '#5E6B2B', face: '#3A2208',
  carDark: '#2B2F36', carGlass: '#33475B', tyre: '#1E1F22', head: '#F4EFD8', tail: '#C0262B', plane: '#F2F4F7', plane2: '#C9D0D8', fin: '#3D7BE0',
  palmTrunk: '#9B7650', palm: ['#3E9B48', '#4CAE52', '#368A40'], coco: '#6B4A2A', beachGrass: '#9CBF57', lagoon: '#1FB0C4', beachSand: '#E8D7A2'
};
const PN_HABIT_MAX = 90;

/* Die Welt. X: theme ('home' oder 'beach' für den Urlaubsplaneten), cockpit (Straße, Windrad, Fahnenmast, Katze),
 * habit (Alter der Gewohnheitsbäume in Tagen), xmas (Lichterkette), pumpkins (Kürbisse).
 * Zurück kommen das Netz der Welt, wichtige Punkte (scene) und zwei kleine Netze, die nur manchmal gezeichnet werden:
 * die Katze im Fenster und das Tuch der Fahne. */
function pnBuildWorld(seed, season, X = {}) {
  const M = new PnMesh(), rng = pnRng(seed), L = c => pnLin(c), beach = X.theme === 'beach', R = X.cockpit ? pnRoad() : null;
  const H = u => pnH(u, R);
  const grass = hex2rgb(beach ? PN_COL.beachGrass : PN_COL.grass[season.k]);
  // Planet
  const { V, F } = pnIco(3), HV = V.map(H), P = V.map((v, i) => pnV.mul(v, HV[i]));
  for (const [a, b, c] of F) {
    const m = pnV.norm(pnV.add(pnV.add(V[a], V[b]), V[c])), h = (HV[a] + HV[b] + HV[c]) / 3, dl = pnAng(m, PN_LAKE);
    const n = pnV.norm(pnV.cross(pnV.sub(P[b], P[a]), pnV.sub(P[c], P[a]))), slope = Math.abs(pnV.dot(n, m));
    let col, s = 1;
    if (h < PN_WL + 0.001 && dl < PN_LR + 0.05) { col = L(PN_COL.bed); s = 0.7; }
    else if (beach ? dl < PN_LR + 0.16 && h < 1.016 : dl < PN_LR + 0.03 && h < 1.009) col = L(beach ? PN_COL.beachSand : PN_COL.sand);
    else if (slope < 0.9 && h > 1.02) col = L(PN_COL.rock[Math.floor(rng() * 3)]);
    else {
      const j = 0.9 + rng() * 0.18, hue = (rng() - 0.5) * 14, up = Math.max(-0.12, (h - 1) * 2.4);
      col = L(grass.map((x, i) => x * (j + up) + (i === 0 ? hue : i === 2 ? -hue * 0.5 : 0)).map(x => Math.max(0, Math.min(255, x))));
    }
    M.tri(P[a], P[b], P[c], col, [s, 0, 0], [0, 0, 0]);
  }
  // Bis hier das Gelände. Was darauf steht, merkt sich occ, später wird der Boden darunter etwas dunkler (weicher Schatten).
  const nT = M.count, occ = [];
  // See: Kappe aus Dreiecken knapp unter dem Ufer
  {
    const fr = pnFrame(PN_LAKE, 1, [0, 1, 0]), rings = 4, seg = 14, Rr = PN_LR + 0.06, pts = [];
    const at = (r, a) => pnV.mul(pnV.norm(pnV.add(fr.y, pnV.add(pnV.mul(fr.x, Math.cos(a) * r), pnV.mul(fr.z, Math.sin(a) * r)))), PN_WL);
    for (let i = 0; i <= rings; i++) pts.push(Array.from({ length: seg }, (_, k) => at(Rr * i / rings, k / seg * Math.PI * 2)));
    const wc = L(beach ? PN_COL.lagoon : PN_COL.water);
    for (let i = 0; i < rings; i++) for (let k = 0; k < seg; k++) {
      const k2 = (k + 1) % seg;
      M.tri(pts[i][k], pts[i + 1][k], pts[i + 1][k2], wc, [0, 0, 2], [0, 0, 0]);
      if (i) M.tri(pts[i][k], pts[i + 1][k2], pts[i][k2], wc, [0, 0, 2], [0, 0, 0]);
    }
  }
  // Häuschen mit hellen Wänden und rotem Dach, die Front schaut zum See
  const toLake = pnV.sub(PN_LAKE, PN_HOUSE), hf = pnFrame(PN_HOUSE, H(PN_HOUSE) - 0.004, pnV.add(pnV.mul(toLake, 0.35), [0, -0.2, 1]), 0, PN_HS);
  const housePt = (x, y, z) => pnV.add(hf.o, pnV.add(pnV.add(pnV.mul(hf.x, x), pnV.mul(hf.y, y)), pnV.mul(hf.z, z)));
  const scene = { xmas: [], pumpkins: [], habit: [], ff: [], star: null, mill: null, flag: null, house: housePt(0, 0.1, 0), crowns: [], flowers: [], hare: null, deer: null, owl: null, lake: null };
  {
    const T = new PnPart(), w = 0.105, d = 0.08, hw = 0.115, rf = 0.085, ov = 0.018;
    const br = L(PN_COL.wall), br2 = L(PN_COL.wall2), roof = L(PN_COL.roof), roof2 = L(PN_COL.roof2);
    T.box(-w, -0.02, -d, w, hw, d, br, 0);
    // Giebel links und rechts
    T.tri([w, hw, -d], [w, hw, d], [w, hw + rf, 0], br2, 0, 0, [0, hw, 0]);
    T.tri([-w, hw, d], [-w, hw, -d], [-w, hw + rf, 0], br2, 0, 0, [0, hw, 0]);
    // Dach mit Überstand, der First läuft parallel zur Front
    const r0 = [-w - ov, hw - 0.012, d + ov], r1 = [w + ov, hw - 0.012, d + ov], r2 = [w + ov, hw + rf, 0], r3 = [-w - ov, hw + rf, 0];
    const r4 = [-w - ov, hw - 0.012, -d - ov], r5 = [w + ov, hw - 0.012, -d - ov];
    T.quad(r0, r1, r2, r3, roof, 1, 0, [0, hw, 0]);
    T.quad(r5, r4, r3, r2, roof2, 1, 0, [0, hw, 0]);
    // Dachkanten: vorn und hinten die Traufe, an den Seiten zu bis zum Giebel
    const th = 0.01, dn = v => pnV.add(v, [0, -th, 0]);
    T.quad(r0, r1, dn(r1), dn(r0), roof2, 0, 0, [0, hw, 0]);
    T.quad(r5, r4, dn(r4), dn(r5), roof2, 0, 0, [0, hw, 0]);
    T.tri(r0, r3, r4, roof2, 0, 0, [0, hw, 0]);
    T.tri(r1, r5, r2, roof2, 0, 0, [0, hw, 0]);
    // Schornstein
    T.box(0.045, hw + 0.02, -0.04, 0.075, hw + rf + 0.03, -0.012, L(PN_COL.chim), 1);
    T.box(0.041, hw + rf + 0.03, -0.044, 0.079, hw + rf + 0.038, -0.008, L('#5A4A44'), 1);
    // Tür, Fenster mit Rahmen (Art 1 leuchtet abends)
    const fz = d + 0.002, frc = L(PN_COL.frame);
    T.box(-0.022, -0.005, d - 0.002, 0.022, 0.075, fz + 0.004, L(PN_COL.door), 0);
    T.box(-0.026, 0.075, d - 0.002, 0.026, 0.083, fz + 0.006, frc, 0);
    const win = (cx, cy, face) => {
      const ww = 0.024, wh = 0.024;
      if (face === 'f' || face === 'b') {
        const z = face === 'f' ? fz : -fz, s = face === 'f' ? 1 : -1;
        T.box(cx - ww - 0.006, cy - wh - 0.006, z - 0.004 * s, cx + ww + 0.006, cy + wh + 0.006, z + 0.002 * s, frc, 0);
        T.quad([cx - ww, cy - wh, z + 0.004 * s], [cx + ww, cy - wh, z + 0.004 * s], [cx + ww, cy + wh, z + 0.004 * s], [cx - ww, cy + wh, z + 0.004 * s], L(PN_COL.glass), 0, 1, [cx, cy, z - s]);
      } else {
        const x = face === 'r' ? w + 0.002 : -w - 0.002, s = face === 'r' ? 1 : -1;
        T.box(x - 0.004 * s, cy - wh - 0.006, cx - ww - 0.006, x + 0.002 * s, cy + wh + 0.006, cx + ww + 0.006, frc, 0);
        T.quad([x + 0.004 * s, cy - wh, cx - ww], [x + 0.004 * s, cy - wh, cx + ww], [x + 0.004 * s, cy + wh, cx + ww], [x + 0.004 * s, cy + wh, cx - ww], L(PN_COL.glass), 0, 1, [x - s, cy, cx]);
      }
    };
    win(-0.064, 0.05, 'f'); win(0.064, 0.05, 'f'); win(0, 0.05, 'r'); win(0, 0.05, 'l'); win(0, 0.05, 'b');
    // Stufe vor der Tür
    T.box(-0.03, -0.02, d, 0.03, 0.006, d + 0.02, L(PN_COL.stone), 1);
    pnPut(M, T, hf, 0, [0.045, 0.6]);
    occ.push({ u: PN_HOUSE, r: 0.2, k: 0.42 });
    // Lichterkette an Traufe und Giebelkanten, die Lämpchen hängen ein Stück unter der Kante
    if (X.xmas) {
      const line = (a, b, n, skip) => { for (let i = skip ? 1 : 0; i <= n; i++) { const f = i / n; scene.xmas.push(housePt(a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f - th - 0.004, a[2] + (b[2] - a[2]) * f)); } };
      line(r0, r1, 12); line(r4, r5, 12); line(r0, r3, 5, 1); line(r3, r4, 5, 1); line(r1, r2, 5, 1); line(r2, r5, 5, 1);
    }
  }
  scene.chimney = housePt(0.06, 0.115 + 0.085 + 0.045, -0.026);
  scene.wins = [[-0.064, 0.05, 0.095], [0.064, 0.05, 0.095], [0.115, 0.05, 0], [-0.115, 0.05, 0], [0, 0.05, -0.095]].map(([x, y, z]) => housePt(x, y, z));
  scene.light = housePt(0, 0.06, 0.2);
  // Fahnenmast rechts vor dem Haus. Das Tuch ist ein eigenes Netz und geht nur hoch, wenn heute noch ein Termin ansteht.
  let flag = null, cat = null;
  if (X.cockpit) {
    const T = new PnPart(), fu = pnV.norm(housePt(0.2, 0, 0.16)), ff = pnFrame(fu, H(fu) - 0.004, hf.z, 0, 1);
    T.cone(0, 0, 0.0065, 0.0045, -0.01, 0.34, 6, L(PN_COL.pole), 0.4);
    T.blob(0, 0.344, 0, 0.0085, 1, [L(PN_COL.knob)], 0, rng, 0);
    pnPut(M, T, ff);
    const fw = 0.13, fh = 0.078, cols = 6, top = 0.332, F2 = new PnMesh();
    const fp = (x, y) => pnV.add(ff.o, pnV.add(pnV.mul(ff.x, -x), pnV.mul(ff.y, y)));
    const sw = x => Math.min(1, (x / fw) ** 1.1 * 1.6);
    for (let i = 0; i < cols; i++) {
      const x0 = i / cols * fw, x1 = (i + 1) / cols * fw;
      F2.tri(fp(x0, top), fp(x1, top), fp(x1, top - fh), [1, 1, 1], [0, 0, 0, 0.5], null, [sw(x0), sw(x1), sw(x1)]);
      F2.tri(fp(x0, top), fp(x1, top - fh), fp(x0, top - fh), [1, 1, 1], [0, 0, 0, 0.5], null, [sw(x0), sw(x1), sw(x0)]);
    }
    flag = F2;
    scene.flag = fp(fw * 0.5, top - fh * 0.5);
    // Die Katze sitzt innen am linken Fenster vorn, also knapp vor der Scheibe
    const C = new PnPart(), c1 = L(PN_COL.cat), c2 = L(PN_COL.cat2), x = -0.07, y = 0.027, z = 0.0925;
    C.blob(x, y + 0.01, z, 0.0105, 1.05, [c1, c1, c2], 0, rng, 1);
    C.blob(x + 0.002, y + 0.026, z + 0.002, 0.0074, 0.95, [c1], 0, rng, 1);
    C.tri([x - 0.004, y + 0.03, z + 0.002], [x + 0.0005, y + 0.032, z + 0.002], [x - 0.0035, y + 0.0395, z + 0.002], c2, 0, 0, [x, y + 0.026, z - 0.01]);
    C.tri([x + 0.0035, y + 0.032, z + 0.002], [x + 0.008, y + 0.03, z + 0.002], [x + 0.0075, y + 0.0395, z + 0.002], c2, 0, 0, [x, y + 0.026, z - 0.01]);
    // Schwanz hängt über die Fensterbank
    C.box(x + 0.008, y - 0.013, z + 0.001, x + 0.0115, y + 0.005, z + 0.0045, c2, 0);
    cat = new PnMesh();
    pnPut(cat, C, hf);
  }
  // Kürbisse neben der Tür, das Gesicht leuchtet abends wie die Fenster
  if (X.pumpkins) {
    for (const [px, pz, r] of [[-0.052, 0.127, 0.018], [0.05, 0.12, 0.015], [0.074, 0.142, 0.011]]) {
      const T = new PnPart(), pc = PN_COL.pumpkin.map(L), fc = L(PN_COL.face), q = r * 1.13, cy = r * 0.78;
      T.blob(0, cy, 0, r, 0.78, pc, 0.6, rng, 1);
      T.box(-0.0016, cy + r * 0.62, -0.0016, 0.0016, cy + r * 0.62 + 0.006, 0.0016, L(PN_COL.stem), 0);
      const ins = [0, cy, 0];
      T.tri([-r * 0.55, cy + r * 0.12, q * 0.94], [-r * 0.12, cy + r * 0.12, q * 0.97], [-r * 0.34, cy + r * 0.45, q * 0.9], fc, 0, 1, ins);
      T.tri([r * 0.12, cy + r * 0.12, q * 0.97], [r * 0.55, cy + r * 0.12, q * 0.94], [r * 0.34, cy + r * 0.45, q * 0.9], fc, 0, 1, ins);
      T.quad([-r * 0.55, cy - r * 0.38, q * 0.92], [r * 0.55, cy - r * 0.38, q * 0.92], [r * 0.45, cy - r * 0.12, q * 0.97], [-r * 0.45, cy - r * 0.12, q * 0.97], fc, 0, 1, ins);
      const u = pnV.norm(housePt(px, 0, pz)), fr = pnFrame(u, H(u) - 0.003, hf.z, (px - 0.01) * -4, 1.6);
      pnPut(M, T, fr);
      scene.pumpkins.push(pnV.add(fr.o, pnV.add(pnV.mul(fr.y, cy), pnV.mul(fr.z, r * 0.5))));
    }
  }
  // Trittsteine zum See und ein kleiner Steg
  const lakeEdge = pnV.norm(pnV.add(PN_LAKE, pnV.mul(pnV.norm(pnV.sub(pnV.add(PN_HOUSE, pnV.mul(hf.z, 0.25)), PN_LAKE)), PN_LR * 0.95)));
  const doorDir = pnV.norm(pnV.add(PN_HOUSE, pnV.mul(hf.z, 0.17)));
  const SS = 1.35;
  for (let i = 0; i < 4; i++) {
    const u = pnV.norm(pnV.mix(doorDir, lakeEdge, 0.08 + i * 0.24)), T = new PnPart();
    T.cone(0, 0, 0.026, 0.024, -0.01, 0.007, 6, L(PN_COL.stone), 1, rng() * 3);
    pnPut(M, T, pnFrame(u, H(u), null, 0, SS));
  }
  {
    const T = new PnPart(), wood = L(PN_COL.wood), dark = L('#7C5434');
    T.box(-0.026, 0.004, -0.02, 0.026, 0.012, 0.15, wood, 1);
    for (let i = 0; i < 4; i++) T.box(-0.028, 0.012, 0.01 + i * 0.038, 0.028, 0.0135, 0.016 + i * 0.038, dark, 1);
    for (const z of [0.07, 0.14]) for (const x of [-0.022, 0.022]) T.box(x - 0.005, -0.05, z - 0.005, x + 0.005, 0.012, z + 0.005, dark, 0);
    const u = pnV.norm(pnV.mix(lakeEdge, PN_LAKE, 0.02));
    const fr = pnFrame(u, PN_WL + 0.002, pnV.sub(PN_LAKE, u), 0, SS);
    pnPut(M, T, fr);
  }
  // Straße: Fahrbahn mit Mittelstreifen und kleinen Böschungen an den Seiten
  if (R) {
    const rc = L(PN_COL.road), sc = L(PN_COL.roadSide), lc = L(PN_COL.line), w = 0.026, top = 0.006, bot = -0.012;
    const side = i => pnV.norm(pnV.cross(R.P[i], R.T[i]));
    const at = (i, o, dh) => pnV.mul(pnV.norm(pnV.add(R.P[i], pnV.mul(side(i), o))), R.hs[i] + dh);
    for (let i = 0; i < R.N; i++) {
      const j = (i + 1) % R.N, jit = 0.95 + rng() * 0.08, c = rc.map(x => x * jit), mid = pnV.mul(R.P[i], R.hs[i] - 0.06);
      M.tri(at(i, -w, top), at(i, w, top), at(j, w, top), c, [0.75, 0, 0], mid);
      M.tri(at(i, -w, top), at(j, w, top), at(j, -w, top), c, [0.75, 0, 0], mid);
      for (const s of [-1, 1]) {
        M.tri(at(i, s * w, top), at(j, s * w, top), at(j, s * (w + 0.01), bot), sc, [0.8, 0, 0], mid);
        M.tri(at(i, s * w, top), at(j, s * (w + 0.01), bot), at(i, s * (w + 0.01), bot), sc, [0.8, 0, 0], mid);
      }
      if (i % 4 < 2) {
        M.tri(at(i, -0.0022, top + 0.0007), at(i, 0.0022, top + 0.0007), at(j, 0.0022, top + 0.0007), lc, [0.75, 0, 0], mid);
        M.tri(at(i, -0.0022, top + 0.0007), at(j, 0.0022, top + 0.0007), at(j, -0.0022, top + 0.0007), lc, [0.75, 0, 0], mid);
      }
    }
  }
  // Windrad auf dem Hügel rechts. Der Rotor ist ein eigenes Netz und dreht sich nach dem echten Wind.
  if (X.cockpit) {
    const T = new PnPart(), wc = L(PN_COL.mill), wc2 = L(PN_COL.mill2);
    T.cone(0, 0, 0.013, 0.0068, -0.02, 0.3, 8, [wc, wc2], 0.25);
    T.box(-0.0085, 0.296, -0.024, 0.0085, 0.313, 0.012, wc, 0.6);
    const fr = pnFrame(PN_MILL, H(PN_MILL) - 0.006, [0, 0.35, 1], 0, 1.15), n = v => pnV.norm(v);
    scene.mill = { hub: pnV.add(fr.o, pnV.add(pnV.mul(fr.y, 0.3045), pnV.mul(fr.z, 0.0165))), x: n(fr.x), y: n(fr.y), z: n(fr.z), s: 1.15 };
    pnPut(M, T, fr, 0, [0.04, 0.6]);
    occ.push({ u: PN_MILL, r: 0.05, k: 0.3 });
  }
  // Bäume: Kiefern bleiben grün, Laubbäume wechseln mit der Jahreszeit, am Strand stehen Palmen
  const trees = [], spots = [], pinesAt = [];
  const offRoad = (u, gap) => !R || pnAng(u, R.P[pnRoadNear(R, u)]) > gap;
  const okSpot = (u, gap) => pnAng(u, PN_HOUSE) > 0.44 && pnAng(u, PN_LAKE) > PN_LR + 0.14 && pnAng(u, doorDir) > 0.26 && spots.every(s => pnAng(u, s) > gap) && offRoad(u, 0.1) && (!X.cockpit || pnAng(u, PN_MILL) > 0.16);
  if (X.cockpit) spots.push(PN_MILL);
  // Ein paar feste Plätze rund ums Haus für ein schönes Bild, dann zufällig verteilt
  for (const [la, lo, kind] of [[66, -66, 'pine'], [34, -55, 'leaf'], [70, 14, 'leaf'], [48, 78, 'pine'], [2, -14, 'leaf'], [0, 62, 'pine'], [58, 140, 'pine'], [40, -112, 'leaf']]) {
    const u = pnV.norm(pnLL(la + (rng() - 0.5) * 4, lo + (rng() - 0.5) * 6));
    if (!offRoad(u, 0.1)) continue;
    spots.push(u); trees.push([u, kind]);
  }
  for (let n = 0, tries = 0; n < 18 && tries < 900; tries++) {
    const z = rng() * 2 - 1, a = rng() * Math.PI * 2, r = Math.sqrt(1 - z * z), u = [r * Math.cos(a), z, r * Math.sin(a)];
    if (!okSpot(u, 0.34)) continue;
    spots.push(u); trees.push([u, rng() < 0.45 ? 'pine' : 'leaf']); n++;
  }
  const leaves = PN_COL.leaf[season.k].map(L), pines = PN_COL.pine.map(L), trunk = L(PN_COL.trunk), palms = PN_COL.palm.map(L), ptrunk = L(PN_COL.palmTrunk);
  const tree = (u, kind, sc, rot, r, g = 1) => {
    const T = new PnPart();
    let hgt, blossom = false, bare = false;
    sc *= g;
    if (beach) kind = 'palm';
    if (kind === 'birch') {
      // Birke: schlanker weißer Stamm mit dunklen Ringen, kleine helle Krone, im Herbst gelb
      hgt = 0.26 * sc;
      bare = season.k === 'winter' || r() < season.bare;
      const bw = L('#ECE8DF'), bd = L('#3B3733');
      for (let k = 0; k < 6; k++) T.cone(0, 0, (0.0105 - k * 0.0009) * sc, (0.0096 - k * 0.0009) * sc, -0.02 + k * 0.036 * sc, -0.02 + (k + 1) * 0.036 * sc, 5, k % 2 ? bw : [bw, bw, bd, bw, bw], 0.3, rot + k);
      const bc = season.k === 'autumn' ? [L('#E8C547'), L('#D9B23A'), L('#EFD36A')] : season.k === 'spring' ? [L('#9CCB55'), L('#AED465')] : [L('#7FB146'), L('#8DBB4E'), L('#74A63F')];
      if (bare) {
        for (let i = 0; i < 4; i++) {
          const a = rot + i * 1.6, d = [Math.cos(a), Math.sin(a)], b0 = [d[0] * 0.004 * sc, (0.1 + i * 0.03) * sc, d[1] * 0.004 * sc], b1 = [d[0] * 0.045 * sc, (0.17 + i * 0.03) * sc, d[1] * 0.045 * sc];
          const sd = pnV.mul(pnV.norm([-d[1], 0, d[0]]), 0.004 * sc);
          T.quad(pnV.sub(b0, sd), pnV.add(b0, sd), pnV.add(b1, sd), pnV.sub(b1, sd), bw, 0.6, 0, pnV.add(pnV.mix(b0, b1, 0.5), [0, -1, 0]));
        }
      } else {
        T.ell(0, 0.19 * sc, 0, 0.05 * sc, 0.075 * sc, 0.05 * sc, bc, 0.7, r, 1, null, 0, 0.35);
        T.ell(0.028 * sc, 0.14 * sc, 0.012 * sc, 0.032 * sc, 0.045 * sc, 0.032 * sc, bc, 0.7, r, 0, null, 0, 0.3);
      }
    } else if (kind === 'pine') {
      hgt = 0.27 * sc;
      T.cone(0, 0, 0.014 * sc, 0.011 * sc, -0.02, 0.05 * sc, 5, trunk, 0, rot);
      const layers = [[0.085, 0.04, 0.15], [0.068, 0.1, 0.2], [0.048, 0.155, 0.27]];
      layers.forEach(([rr, y0, y1], i) => T.cone(0, 0, rr * sc, 0, y0 * sc, y1 * sc, 7, pines[(i + Math.floor(r() * 3)) % 3], 0.85, rot + i * 0.4, r));
    } else if (kind === 'palm') {
      hgt = 0.26 * sc;
      // Gebogener Stamm aus versetzten Stücken, oben ein Schopf aus Wedeln, die nach außen hängen
      const bend = (0.03 + r() * 0.04) * sc, top = 0.22 * sc, segs = 6, n = 6;
      const ring = k => { const f = k / segs, c = [bend * f * f, -0.02 + f * (top + 0.02), 0], rr = 0.017 * sc * (1 - f * 0.45); return Array.from({ length: n }, (_, i) => { const a = rot + i / n * Math.PI * 2; return [c[0] + Math.cos(a) * rr, c[1], c[2] + Math.sin(a) * rr]; }); };
      for (let k = 0; k < segs; k++) {
        const A = ring(k), B = ring(k + 1), col = k % 2 ? ptrunk : ptrunk.map(x => x * 0.82), mid = [bend * ((k + 0.5) / segs) ** 2, -0.02 + (k + 0.5) / segs * (top + 0.02), 0];
        for (let i = 0; i < n; i++) { const j = (i + 1) % n; T.quad(A[i], A[j], B[j], B[i], col, 0.2, 0, mid); }
      }
      const c0 = [bend, top, 0];
      for (let k = 0; k < 7; k++) {
        const a = rot + k / 7 * Math.PI * 2, d = [Math.cos(a), 0, Math.sin(a)], s2 = [-d[2], 0, d[0]], w = 0.02 * sc, col = palms[k % 3];
        const mid = pnV.add(c0, [d[0] * 0.06 * sc, 0.022 * sc, d[2] * 0.06 * sc]), tip = pnV.add(c0, [d[0] * 0.125 * sc, -0.03 * sc, d[2] * 0.125 * sc]);
        const ml = pnV.add(mid, pnV.mul(s2, w)), mr = pnV.sub(mid, pnV.mul(s2, w)), dn = pnV.add(mid, [0, -1, 0]);
        T.tri(c0, ml, mid, col, 0.5, 0, dn); T.tri(c0, mid, mr, col, 0.5, 0, dn);
        T.tri(mid, ml, tip, col, 0.5, 0, dn); T.tri(mid, tip, mr, col, 0.5, 0, dn);
      }
      T.blob(bend + 0.008 * sc, top - 0.012 * sc, 0.006 * sc, 0.009 * sc, 1, [L(PN_COL.coco)], 0, r, 0);
    } else {
      bare = r() < season.bare;
      hgt = 0.22 * sc;
      T.cone(0, 0, 0.016 * sc, 0.011 * sc, -0.02, (bare ? 0.17 : 0.1) * sc, 5, trunk, 0.3, rot);
      if (bare) {
        for (let i = 0; i < 3; i++) {
          const a = rot + i * 2.1, T2 = [Math.cos(a), Math.sin(a)];
          const b0 = [T2[0] * 0.006 * sc, 0.08 * sc + i * 0.02 * sc, T2[1] * 0.006 * sc], b1 = [T2[0] * 0.06 * sc, 0.15 * sc + i * 0.015 * sc, T2[1] * 0.06 * sc];
          const side = pnV.mul(pnV.norm([-T2[1], 0, T2[0]]), 0.005 * sc);
          T.quad(pnV.sub(b0, side), pnV.add(b0, side), pnV.add(b1, side), pnV.sub(b1, side), trunk, 0.6, 0, pnV.add(pnV.mix(b0, b1, 0.5), [0, -1, 0]));
        }
      } else {
        const cols = season.k === 'autumn' ? [leaves[Math.floor(r() * leaves.length)], leaves[Math.floor(r() * leaves.length)]] : leaves.slice(0, 3);
        T.blob(0, 0.15 * sc, 0, 0.075 * sc, 0.92, cols, 0.7, r, 1, null, 0, 0.38);
        if (r() < 0.6) T.blob(0.04 * sc, 0.12 * sc, 0.025 * sc, 0.045 * sc, 0.9, cols, 0.7, r, 0, null, 0, 0.3);
        if (season.k === 'spring' && r() < 0.5) {
          // Blüte: rosa und weiße Tupfen auf der Krone
          for (const [x, y, z] of [[-0.045, 0.19, 0.03], [0.05, 0.165, -0.035], [0.004, 0.21, -0.03], [0.03, 0.15, 0.055]]) T.blob(x * sc, y * sc, z * sc, 0.03 * sc, 0.9, [leaves[3], L('#F7DCE6'), L('#FFFFFF')], 0.7, r, 0, null, 0, 0.3);
          blossom = true;
        }
      }
    }
    const fr = pnFrame(u, H(u) - 0.008, null, rot, PN_TS);
    pnPut(M, T, fr, hgt, [0.05, 0.55]);
    occ.push({ u: pnV.norm(u), r: (kind === 'palm' ? 0.06 : 0.1) * sc, k: kind === 'pine' ? 0.42 : 0.36 });
    const t = { fr, sc, hgt, kind, u: pnV.norm(u), bare, blossom };
    // Krone für fallende Blätter und Blüten, Spitze für die Eule
    if (kind !== 'pine' && kind !== 'palm' && !bare) scene.crowns.push({ p: pnV.add(fr.o, pnV.mul(pnV.norm(fr.y), (kind === 'birch' ? 0.18 : 0.15) * sc * PN_TS)), r: 0.07 * sc * PN_TS, blossom, birch: kind === 'birch' });
    return t;
  };
  const baseTrees = [];
  trees.forEach(([u, kind], i) => {
    const t = tree(u, kind === 'leaf' && i % 3 === 1 ? 'birch' : kind, 0.85 + rng() * 0.4, rng() * 6.3, rng);
    if (t.kind === 'pine') pinesAt.push(t);
    baseTrees.push(t);
  });
  // Büsche ums Haus und Steine (mit eigenem Zufall, damit sie nicht mit den Jahreszeiten wandern)
  for (const [x, z] of [[-0.15, 0.065], [0.15, 0.07], [-0.135, -0.1], [0.145, -0.095]]) {
    const u = pnV.norm(housePt(x, 0, z)), T = new PnPart();
    if (!offRoad(u, 0.075)) continue;
    T.blob(0, 0.012, 0, 0.034 + rng() * 0.01, 0.75, season.k === 'winter' ? [L('#6E7F52'), L('#5F7047')] : season.k === 'autumn' ? [L('#7E8F3C'), L('#A3772E')] : [L('#4F8F3A'), L('#5FA043')], 0.8, rng, 0, -0.01, 0, 0.4);
    pnPut(M, T, pnFrame(u, H(u) - 0.004, null, 0, 1.4), 0.06, [0.03, 0.6]);
    occ.push({ u, r: 0.07, k: 0.3 });
  }
  const rr = pnRng(seed ^ 0x51ab);
  for (let n = 0, tries = 0; n < 9 && tries < 500; tries++) {
    const z = rr() * 2 - 1, a = rr() * Math.PI * 2, r = Math.sqrt(1 - z * z), u = [r * Math.cos(a), z, r * Math.sin(a)];
    if (!okSpot(u, 0.2)) continue;
    spots.push(u); n++;
    const T = new PnPart();
    T.blob(0, 0.005, 0, 0.026 + rr() * 0.022, 0.6, PN_COL.rock.map(L), 0.9, rr, 0);
    pnPut(M, T, pnFrame(u, H(u) - 0.01, null, rr() * 6, 1.3), 0, [0.02, 0.62]);
    occ.push({ u, r: 0.06, k: 0.25 });
  }
  // Am See ein paar Steine
  for (const k of [0.55, 2.1, 3.6]) {
    const fr = pnFrame(PN_LAKE, 1, [0, 1, 0]), u = pnV.norm(pnV.add(fr.y, pnV.add(pnV.mul(fr.x, Math.cos(k) * PN_LR * 1.02), pnV.mul(fr.z, Math.sin(k) * PN_LR * 1.02))));
    const T = new PnPart();
    T.blob(0, 0, 0, 0.022 + rr() * 0.012, 0.6, PN_COL.rock.map(L), 0.9, rr, 0);
    pnPut(M, T, pnFrame(u, H(u) - 0.008, null, rr() * 6, 1.3), 0, [0.02, 0.62]);
  }
  // 3.14: Plätze für Blumenwiesen, Hase und Reh. Immer reserviert (auch im Winter), damit der Gewohnheitswald an seinem Platz bleibt.
  // Eigene Zufallsfolgen, so bleiben Bäume und Steine von früher, wo sie waren.
  const rndU = r => { const z = r() * 2 - 1, a = r() * Math.PI * 2, q = Math.sqrt(1 - z * z); return [q * Math.cos(a), z, q * Math.sin(a)]; };
  {
    const pr = pnRng(seed ^ 0x2545f491), patches = [];
    for (let tries = 0; patches.length < 7 && tries < 1500; tries++) { const u = rndU(pr); if (okSpot(u, patches.length < 3 ? 0.17 : 0.15)) { patches.push(u); spots.push(u); } }
    scene.patches = patches;
    // Reh und Hase: auf einer Wiese am Waldrand, möglichst vorn (da schaut die Kamera meistens hin)
    const cand = [];
    for (let tries = 0; cand.length < 40 && tries < 3000; tries++) {
      const u = rndU(pr);
      if (!okSpot(u, 0.13)) continue;
      const near = baseTrees.reduce((m, t) => Math.min(m, pnAng(u, t.u)), 9);
      cand.push({ u, k: pnV.dot(u, pnV.norm([0.15, 0.45, 1])) - Math.abs(near - 0.2) * 1.5 });
    }
    cand.sort((a, b) => b.k - a.k);
    if (cand[0]) { scene.deer = { u: cand[0].u, rot: pr() * 6.3 }; spots.push(cand[0].u); }
    const h = cand.find(c => scene.deer && pnAng(c.u, scene.deer.u) > 0.3);
    if (h) { scene.hare = { u: h.u, r: 0.075 }; spots.push(h.u); }
  }
  // Gewohnheitswald: jeder geschaffte Tag ein Baum, junge Bäume sind noch klein. Plätze und Form hängen nur von der Nummer ab,
  // so bleibt jeder Baum dort stehen, wo er gepflanzt wurde.
  if (X.habit && X.habit.length) {
    const hr = pnRng(seed ^ 0x7a11c3);
    for (let n = 0, tries = 0; n < X.habit.length && tries < 6000; tries++) {
      const z = hr() * 2 - 1, a = hr() * Math.PI * 2, r = Math.sqrt(1 - z * z), u = [r * Math.cos(a), z, r * Math.sin(a)];
      if (!okSpot(u, 0.15)) continue;
      spots.push(u);
      const tr = pnRng((seed ^ Math.imul(n + 1, 0x9E3779B1)) >>> 0), kind = tr() < 0.42 ? 'pine' : 'leaf';
      const t = tree(u, kind, 0.7 + tr() * 0.3, tr() * 6.3, tr, 0.3 + 0.7 * pnSmooth(0, 14, X.habit[n]));
      scene.habit.push(pnV.add(t.fr.o, pnV.mul(pnV.norm(t.fr.y), t.hgt * PN_TS * 0.55)));
      n++;
    }
  }
  // Weihnachten: die Kiefer, die dem Haus am nächsten steht, bekommt Lichter und einen Stern
  if (X.xmas && pinesAt.length) {
    const t = pinesAt.reduce((a, b) => (pnV.dot(pnV.norm(b.fr.o), PN_HOUSE) > pnV.dot(pnV.norm(a.fr.o), PN_HOUSE) ? b : a));
    const pt = (x, y, z) => pnV.add(t.fr.o, pnV.add(pnV.add(pnV.mul(t.fr.x, x), pnV.mul(t.fr.y, y)), pnV.mul(t.fr.z, z)));
    for (let k = 0; k < 22; k++) {
      const f = k / 22, y = (0.05 + f * 0.19) * t.sc, r = 0.09 * (1 - f * 0.8) * t.sc, a = k * 2.35;
      scene.xmas.push(pt(Math.cos(a) * r, y, Math.sin(a) * r));
    }
    scene.star = pt(0, 0.28 * t.sc, 0);
  }
  // Eule: sitzt nachts oben auf dem Laubbaum (oder der Kiefer), der dem Haus am nächsten steht
  {
    const t = baseTrees.filter(x => x.kind !== 'palm').sort((a, b) => pnAng(a.u, PN_HOUSE) - pnAng(b.u, PN_HOUSE))[0];
    if (t) { const top = (t.kind === 'pine' ? 0.255 : t.kind === 'birch' ? 0.245 : 0.218) * t.sc * PN_TS; scene.owl = { p: pnV.add(t.fr.o, pnV.mul(pnV.norm(t.fr.y), top - 0.012)), y: pnV.norm(t.fr.y), pine: t.kind === 'pine' }; }
  }
  // Der See in eigenen Achsen (für Enten, Fische, Seerosen und Schilf), dazu die Richtung zum Steg
  {
    const fr = pnFrame(PN_LAKE, 1, [0, 1, 0]), d = pnV.sub(lakeEdge, PN_LAKE), dk = pnV.norm([pnV.dot(d, fr.x), pnV.dot(d, fr.z)].concat(0));
    scene.lake = { x: fr.x, y: fr.y, z: fr.z, dock: [dk[0], dk[1]] };
  }
  const lakeAt = (r, a, h) => pnV.mul(pnV.norm(pnV.add(scene.lake.y, pnV.add(pnV.mul(scene.lake.x, Math.cos(a) * r), pnV.mul(scene.lake.z, Math.sin(a) * r)))), h);
  const dockA = Math.atan2(scene.lake.dock[1], scene.lake.dock[0]);
  const dr = pnRng(seed ^ 0x3c6ef372), G = (k, x) => L(grass.map(v => Math.max(0, Math.min(255, v * k + x))));
  const meadow = (u, gap = 0.06) => pnAng(u, PN_LAKE) > PN_LR + 0.07 && pnAng(u, PN_HOUSE) > 0.3 && pnAng(u, doorDir) > 0.12 && offRoad(u, gap) && (!X.cockpit || pnAng(u, PN_MILL) > 0.08);
  // Grasbüschel überall auf den Wiesen, sie wiegen sich im Wind
  for (let n = 0, tries = 0; n < 150 && tries < 2000; tries++) {
    const u = rndU(dr);
    if (!meadow(u, 0.045) || H(u) > 1.03) continue;
    n++;
    const T = new PnPart(), k = 0.72 + dr() * 0.3, c = G(k, season.k === 'winter' ? 8 : 0), c2 = G(k * 1.12, 6);
    for (let b = 0; b < 4; b++) {
      const a = dr() * 6.28, ox = Math.cos(a) * 0.005, oz = Math.sin(a) * 0.005, h = 0.016 + dr() * 0.014, la = dr() * 6.28, w = 0.0034;
      T.tri([ox - w, 0, oz], [ox + w, 0, oz], [ox + Math.cos(la) * 0.006, h, oz + Math.sin(la) * 0.006], b % 2 ? c : c2, 0.5, 0, [ox, 0.006, oz - 1]);
    }
    pnPut(M, T, pnFrame(u, H(u) - 0.003, null, dr() * 6.3, 1.3), 0.02);
  }
  // Blumenwiesen im Frühling und Sommer, im Herbst nur noch ein paar späte. Hier flattern die Schmetterlinge.
  const fcols = beach ? ['#E8443A', '#F28DB2', '#F4C430'] : { spring: ['#F4D03F', '#FFFFFF', '#B784D8', '#F28DB2', '#F7E07A'], summer: ['#E8443A', '#4F7FD6', '#FFFFFF', '#F4C430', '#D85FA8'], autumn: ['#B784D8', '#F2B33D'], winter: [] }[season.k];
  const np = beach ? 3 : { spring: 7, summer: 6, autumn: 2, winter: 0 }[season.k];
  (scene.patches || []).slice(0, np).forEach((c, pi) => {
    scene.flowers.push(c);
    const fr = pnFrame(c, 1), n = 9 + Math.floor(dr() * 5);
    for (let i = 0; i < n; i++) {
      const a = dr() * 6.28, rr = Math.sqrt(dr()) * 0.065, u = pnV.norm(pnV.add(c, pnV.add(pnV.mul(fr.x, Math.cos(a) * rr), pnV.mul(fr.z, Math.sin(a) * rr))));
      if (!meadow(u, 0.04)) continue;
      const T = new PnPart(), h = 0.012 + dr() * 0.012, col = L(fcols[(i + pi) % fcols.length]), r0 = 0.0068 + dr() * 0.0024;
      T.box(-0.001, -0.004, -0.001, 0.001, h, 0.001, L('#4F8A34'), 0.3);
      T.cone(0, 0, r0, 0, h, h + 0.0024, 5, col, 0.4, dr() * 6);
      T.blob(0, h + 0.0024, 0, 0.0022, 0.8, [L(fcols[(i + pi) % fcols.length] === '#F4D03F' ? '#E39B2D' : '#F2C230')], 0.3, dr, 0);
      pnPut(M, T, pnFrame(u, H(u) - 0.002, null, 0, 1.3), h * 0.9);
    }
  });
  // Pilze im Herbst unter den Bäumen
  if (season.k === 'autumn' && !beach) {
    baseTrees.filter(t => t.kind !== 'pine').slice(0, 6).forEach((t, i) => {
      const fr = pnFrame(t.u, 1), a = dr() * 6.28;
      for (let k = 0; k < 2 + (i % 2); k++) {
        const b = a + k * 0.5, u = pnV.norm(pnV.add(t.u, pnV.add(pnV.mul(fr.x, Math.cos(b) * 0.06), pnV.mul(fr.z, Math.sin(b) * 0.06))));
        if (!meadow(u, 0.04)) continue;
        const T = new PnPart(), s2 = 1.4 + dr() * 0.8, cap = i % 3 === 2 ? L('#8A5A34') : L('#C9372C');
        T.cone(0, 0, 0.0028 * s2, 0.0024 * s2, -0.003, 0.008 * s2, 5, L('#F1EADB'), 0.2);
        T.blob(0, 0.0085 * s2, 0, 0.0075 * s2, 0.62, [cap], 0.6, dr, 1, 0.0075 * s2, 0, 0.45);
        pnPut(M, T, pnFrame(u, H(u) - 0.002, null, 0, 1.3), 0, [0.008, 0.7]);
      }
    });
  }
  // Schilf am Ufer, auf der Seite gegenüber vom Steg. Wiegt sich im Wind, im Herbst und Winter strohfarben.
  if (!beach) {
    const rc = season.k === 'summer' || season.k === 'spring' ? [L('#5E8C3A'), L('#6F9A45'), L('#557F35')] : season.k === 'autumn' ? [L('#A89A55'), L('#8F8A4A')] : [L('#B8A877'), L('#A99A6A')];
    for (const off of [-1.15, -0.1, 0.95]) {
      for (let i = 0; i < 8; i++) {
        const a = dockA + Math.PI + off + (dr() - 0.5) * 0.45, rr = 0.255 + dr() * 0.04, u = pnV.norm(lakeAt(rr, a, 1));
        const T = new PnPart(), h = 0.05 + dr() * 0.045, la = (dr() - 0.5) * 0.014, w = 0.003, c = rc[i % rc.length];
        T.tri([-w, -0.01, 0], [w, -0.01, 0], [la, h, 0], c, 0.3, 0, [0, h / 2, -1]);
        T.tri([0, -0.01, -w], [0, -0.01, w], [la, h * 0.92, 0], c, 0.3, 0, [-1, h / 2, 0]);
        if (i % 3 === 0) T.box(la - 0.0018, h * 0.72, -0.0018, la + 0.0018, h * 0.72 + 0.011, 0.0018, L('#6B4A2A'), 0.3);
        pnPut(M, T, pnFrame(u, Math.max(PN_WL, H(u)) - 0.004, null, dr() * 6.3, 1.2), h * 1.1);
      }
    }
  }
  // Seerosen im Frühling und Sommer, nicht am Steg
  if (!beach && (season.k === 'spring' || season.k === 'summer')) {
    for (let i = 0; i < 6; i++) {
      const a = dockA + 0.75 + i * 0.8 + (dr() - 0.5) * 0.3, rr = 0.1 + dr() * 0.1, u = pnV.norm(lakeAt(rr, a, 1));
      const T = new PnPart(), r0 = 0.016 + dr() * 0.008, seg = 9, pc = i % 2 ? L('#4E8F3A') : L('#5FA043'), rot = dr() * 6.3;
      for (let k = 0; k < seg - 1; k++) { const a0 = rot + k / seg * 6.283, a1 = rot + (k + 1) / seg * 6.283; T.tri([0, 0, 0], [Math.cos(a0) * r0, 0, Math.sin(a0) * r0], [Math.cos(a1) * r0, 0, Math.sin(a1) * r0], pc, 0, 0, [0, -1, 0]); }
      if (i % 3 === 1) { T.cone(0.003, 0.001, 0.0068, 0, 0.0005, 0.0075, 6, L('#F5B8CF'), 0, 0.3); T.blob(0.003, 0.0045, 0.001, 0.0024, 1, [L('#F4D03F')], 0, dr, 0); }
      pnPut(M, T, pnFrame(u, PN_WL + 0.0014, null, 0, 1.2));
    }
  }
  // Plätze für Glühwürmchen: über Wiesen, nicht über dem See
  const fr2 = pnRng(seed ^ 0xf1f1);
  for (let tries = 0; scene.ff.length < 40 && tries < 900; tries++) {
    const z = fr2() * 2 - 1, a = fr2() * Math.PI * 2, r = Math.sqrt(1 - z * z), u = [r * Math.cos(a), z, r * Math.sin(a)];
    if (pnAng(u, PN_LAKE) < PN_LR * 0.9 || pnAng(u, PN_HOUSE) < 0.2) continue;
    scene.ff.push({ u, h: H(u), ph: fr2() * 6.3, sp: 0.5 + fr2() * 0.8, s: fr2() });
  }
  // Schneemann vorn links vom Haus. Eigenes Netz, gezeichnet nur, solange Schnee liegt.
  let snowman = null;
  if (!beach) {
    const T = new PnPart(), w = L('#F4F7FB'), w2 = L('#E4EAF2'), coal = L('#26262A'), wood = L('#6B4A2A'), red = L('#C9372C');
    T.blob(0, 0.016, 0, 0.019, 0.92, [w, w2], 0, dr, 1, null, 0, 0.6);
    T.blob(0, 0.044, 0, 0.0135, 0.95, [w, w2], 0, dr, 1, null, 0, 0.6);
    T.blob(0, 0.0645, 0, 0.0098, 0.98, [w, w2], 0, dr, 1, null, 0, 0.6);
    const nb = [[0.0022, 0.0662], [-0.0022, 0.0662], [0, 0.0625]];
    for (let i = 0; i < 3; i++) { const a = nb[i], b = nb[(i + 1) % 3]; T.tri([a[0], a[1], 0.0085], [b[0], b[1], 0.0085], [0, 0.0645, 0.0215], L('#EE7F1E'), 0, 0, [0, 0.0645, 0]); }
    for (const x of [-0.0036, 0.0036]) T.box(x - 0.0013, 0.0678, 0.0078, x + 0.0013, 0.0704, 0.0094, coal, 0);
    for (const [y, z] of [[0.048, 0.0128], [0.0405, 0.0134], [0.024, 0.0185]]) T.box(-0.0014, y - 0.0014, z - 0.0012, 0.0014, y + 0.0014, z + 0.0012, coal, 0);
    T.box(-0.0102, 0.0532, -0.0102, 0.0102, 0.0578, 0.0102, red, 0);
    T.box(0.0035, 0.0425, 0.0095, 0.0085, 0.0555, 0.0118, red, 0);
    T.box(-0.0098, 0.0722, -0.0098, 0.0098, 0.0738, 0.0098, coal, 0.6);
    T.box(-0.0068, 0.0738, -0.0068, 0.0068, 0.0872, 0.0068, coal, 0.6);
    const stick = (a, b, wd) => { const sd = pnV.mul(pnV.norm(pnV.cross(pnV.sub(b, a), [0, 0, 1])), wd), up = [0, 0, wd]; T.quad(pnV.sub(a, sd), pnV.add(a, sd), pnV.add(b, sd), pnV.sub(b, sd), wood, 0, 0, null); T.quad(pnV.sub(a, up), pnV.add(a, up), pnV.add(b, up), pnV.sub(b, up), wood, 0, 0, null); };
    stick([0.011, 0.047, 0], [0.032, 0.062, 0.003], 0.0011); stick([0.026, 0.058, 0.002], [0.031, 0.068, 0.002], 0.0008);
    stick([-0.011, 0.047, 0], [-0.031, 0.059, 0.004], 0.0011);
    const u = pnV.norm(housePt(-0.135, 0, 0.215));
    snowman = new PnMesh();
    pnPut(snowman, T, pnFrame(u, H(u) - 0.004, hf.z, 0.35, 1.9), 0, [0.02, 0.75]);
    scene.snowman = pnV.mul(u, H(u) + 0.08);
  }
  // Weiche Schatten: der Boden unter Haus, Bäumen, Büschen und Steinen wird etwas dunkler
  for (let i = 0; i < nT; i++) {
    const x = M.p[i * 3], y = M.p[i * 3 + 1], z = M.p[i * 3 + 2], l = Math.hypot(x, y, z);
    let f = 1;
    for (const o of occ) {
      const c = (x * o.u[0] + y * o.u[1] + z * o.u[2]) / l;
      if (c < Math.cos(o.r * 2.6)) continue;
      const a = Math.acos(Math.min(1, c)) / o.r;
      f *= 1 - o.k * Math.exp(-a * a);
    }
    M.c[i * 3] *= f; M.c[i * 3 + 1] *= f; M.c[i * 3 + 2] *= f;
  }
  return { M, scene, cat, flag, R, snowman };
}
/* Drei Wolkenformen aus mehreren Klumpen, unten flach, oben aufgetürmt. Weich schattiert, damit sie nach Watte aussehen und nicht nach Stein. */
function pnBuildClouds(seed) {
  const rng = pnRng(seed ^ 0x9e37), out = [];
  for (let v = 0; v < 3; v++) {
    const T = new PnPart(), M = new PnMesh(), cols = PN_COL.cloud.map(pnLin), n = 3 + v;
    for (let i = 0; i < n; i++) {
      const x = (i - (n - 1) / 2) * 0.075 + (rng() - 0.5) * 0.02, r = 0.06 + rng() * 0.035 + (i === Math.floor(n / 2) ? 0.025 : 0);
      T.blob(x, 0.01 + rng() * 0.02, (rng() - 0.5) * 0.05, r, 0.85, cols, 0, rng, 1, -0.02, 3, 0.72);
    }
    // Ein, zwei Türmchen obendrauf
    for (let i = 0; i < 1 + (v > 0 ? 1 : 0); i++) {
      const x = (i - (v > 0 ? 0.5 : 0)) * 0.07 + (rng() - 0.5) * 0.03;
      T.blob(x, 0.07 + rng() * 0.015, (rng() - 0.5) * 0.03, 0.045 + rng() * 0.015, 0.9, cols, 0, rng, 1, -0.01, 3, 0.72);
    }
    pnPut(M, T, { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1], o: [0, 0, 0] });
    out.push(M);
  }
  return out;
}
/* Kleine Dinge, die sich bewegen, in eigenen Koordinaten. Gezeichnet mit einer eigenen Lage pro Bild. */
const PN_ID = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1], o: [0, 0, 0] };
/* Rotor des Windrads: Nabe vorn, drei Blätter in der x-y-Ebene, Achse z */
function pnBuildRotor() {
  const T = new PnPart(), M = new PnMesh(), c = pnLin(PN_COL.mill), c2 = pnLin(PN_COL.mill2), rng = pnRng(7);
  T.blob(0, 0, 0.004, 0.0062, 1.1, [c, c2], 0, rng, 0);
  for (let k = 0; k < 3; k++) {
    const a = k / 3 * Math.PI * 2 + Math.PI / 2, d = [Math.cos(a), Math.sin(a)], s = [-Math.sin(a), Math.cos(a)];
    const p = (r, w, z) => [d[0] * r + s[0] * w, d[1] * r + s[1] * w, z];
    T.quad(p(0.004, -0.0035, 0.0035), p(0.004, 0.0065, 0.0035), p(0.135, 0.0012, 0.0015), p(0.135, -0.0015, 0.0015), c, 0, 0, [0, 0, -1]);
    T.quad(p(0.004, -0.0035, 0.0025), p(0.135, -0.0015, 0.0005), p(0.135, 0.0012, 0.0005), p(0.004, 0.0065, 0.0025), c2, 0, 0, [0, 0, 1]);
  }
  pnPut(M, T, PN_ID);
  return M;
}
/* Dein Auto in der Akzentfarbe, vorn ist +z */
function pnBuildCar(hex) {
  const T = new PnPart(), M = new PnMesh(), body = pnLin(hex), glass = pnLin(PN_COL.carGlass), tyre = pnLin(PN_COL.tyre);
  T.box(-0.012, 0.0045, -0.024, 0.012, 0.0135, 0.024, body, 0);
  T.box(-0.0104, 0.0135, -0.013, 0.0104, 0.0215, 0.0095, glass, 0);
  T.box(-0.0108, 0.0215, -0.0138, 0.0108, 0.0232, 0.0103, body, 0);
  for (const [x, z] of [[-0.0118, -0.0145], [0.0118, -0.0145], [-0.0118, 0.0145], [0.0118, 0.0145]]) T.box(x - 0.0026, 0, z - 0.0056, x + 0.0026, 0.0088, z + 0.0056, tyre, 0);
  // Scheinwerfer (Art 1 leuchtet abends) und Rücklichter
  for (const x of [-0.0075, 0.0075]) {
    T.box(x - 0.0028, 0.0085, 0.0238, x + 0.0028, 0.0115, 0.0252, pnLin(PN_COL.head), 0, 1);
    T.box(x - 0.0028, 0.0085, -0.0252, x + 0.0028, 0.011, -0.0238, pnLin(PN_COL.tail), 0);
  }
  pnPut(M, T, PN_ID);
  return M;
}
/* Kleines Flugzeug, vorn ist +z, oben +y */
function pnBuildPlane() {
  const T = new PnPart(), M = new PnMesh(), w = pnLin(PN_COL.plane), g = pnLin(PN_COL.plane2), f = pnLin(PN_COL.fin), gl = pnLin(PN_COL.carGlass);
  T.box(-0.0048, -0.0048, -0.03, 0.0048, 0.0048, 0.028, w, 0);
  T.box(-0.0034, -0.0034, 0.028, 0.0034, 0.0034, 0.035, w, 0);
  T.box(-0.0035, 0.0012, 0.026, 0.0035, 0.0046, 0.0305, gl, 0);
  T.box(-0.038, -0.0011, -0.006, 0.038, 0.0011, 0.008, g, 0);
  T.box(-0.014, -0.0009, -0.031, 0.014, 0.0009, -0.023, g, 0);
  T.box(-0.0009, 0.0048, -0.031, 0.0009, 0.016, -0.022, f, 0);
  for (const x of [-0.017, 0.017]) T.box(x - 0.0025, -0.0072, -0.002, x + 0.0025, -0.002, 0.009, g, 0);
  pnPut(M, T, PN_ID);
  return M;
}

/* Shader */
const PN_SWAY = `uniform float u_t, u_ws; uniform vec3 u_wv;
vec3 sway(vec3 p, float w) {
  if (w <= 0.0) return p;
  vec3 n = normalize(p), wt = u_wv - n * dot(u_wv, n);
  float ph = dot(p, vec3(17.0, 23.0, 19.0));
  float s = sin(u_t * (1.3 + u_ws * 1.8) + ph) * (0.2 + u_ws) * 0.012;
  vec3 side = normalize(cross(n, vec3(0.3, 1.0, 0.2)));
  return p + (wt * (s + u_ws * 0.008) + side * sin(u_t * 1.1 + ph * 1.3) * 0.003) * w;
}`;
/* Lage pro Instanz (a_m0 bis a_m3) und Farbe (a_ti): so zeichnet ein Aufruf alle Vögel eines Schwarms. Ohne Instanzen stehen
 * dort feste Werte (Einheitsmatrix, Weiß), dann gilt nur u_m. */
const PN_INST = `layout(location=4) in vec4 a_m0; layout(location=5) in vec4 a_m1; layout(location=6) in vec4 a_m2; layout(location=7) in vec4 a_m3; layout(location=8) in vec3 a_ti;`;
const PN_VS_LIT = `#version 300 es
layout(location=0) in vec3 a_pos; layout(location=1) in vec3 a_nrm; layout(location=2) in vec3 a_col; layout(location=3) in vec4 a_at;
${PN_INST}
uniform mat4 u_vp, u_m;
out vec3 v_wp, v_n, v_c; out vec4 v_at;
${PN_SWAY}
void main() {
  mat4 M = u_m * mat4(a_m0, a_m1, a_m2, a_m3);
  vec4 w = M * vec4(sway(a_pos, a_at.y), 1.0);
  v_wp = w.xyz; v_n = mat3(M) * a_nrm; v_c = a_col * a_ti; v_at = a_at;
  gl_Position = u_vp * w;
}`;
const PN_FS_LIT = `#version 300 es
precision highp float; precision highp sampler2DShadow;
in vec3 v_wp, v_n, v_c; in vec4 v_at;
uniform vec3 u_cam, u_l1d, u_l1c, u_l2d, u_l2c, u_l3d, u_l3c, u_ska, u_gna, u_tint, u_winp, u_winc, u_haze, u_rim, u_refl, u_lx, u_lz, u_lc;
uniform float u_snow, u_wet, u_ice, u_win, u_flash, u_fog, u_t, u_shon, u_shl, u_exp, u_frost, u_dry, u_rip;
uniform vec4 u_spl[2];
uniform mat4 u_lvp; uniform sampler2DShadow u_shm;
out vec4 o;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float shadowAt(vec3 n, vec3 ld) {
  float nl = dot(n, ld);
  if (nl <= 0.0) return 0.0;
  vec4 lp = u_lvp * vec4(v_wp + n * 0.01, 1.0);
  vec3 s = lp.xyz / lp.w * 0.5 + 0.5;
  if (s.x < 0.0 || s.x > 1.0 || s.y < 0.0 || s.y > 1.0 || s.z > 1.0) return 1.0;
  vec2 ts = 1.0 / vec2(textureSize(u_shm, 0));
  float b = 0.0012 + 0.0025 * (1.0 - nl), sum = 0.0;
  for (int x = -1; x <= 1; x++) for (int y = -1; y <= 1; y++) sum += texture(u_shm, vec3(s.xy + vec2(x, y) * ts * 1.7, s.z - b));
  return sum / 9.0;
}
vec3 aces(vec3 x) { return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
void main() {
  vec3 n = normalize(v_n), up = normalize(v_wp), vd = normalize(u_cam - v_wp);
  float kind = v_at.z;
  bool water = kind > 1.5 && kind < 2.5, cloud = kind > 2.5;
  vec3 base = v_c * u_tint;
  float ring = 0.0, glint = 0.0;
  if (water) {
    // Koordinaten auf dem See: Mitte tiefer und dunkler, zum Ufer hin flach und heller
    vec2 q = vec2(dot(v_wp - u_lc, u_lx), dot(v_wp - u_lc, u_lz));
    float dc = length(q) / 0.3;
    vec3 wn = vec3(sin(v_wp.x * 70.0 + u_t * 1.6) + sin(v_wp.z * 53.0 - u_t * 1.2), 0.0, cos(v_wp.z * 61.0 + u_t * 1.4) + cos(v_wp.x * 47.0 - u_t)) * (0.025 + u_wet * 0.04);
    // Ringe von Regentropfen und von springenden Fischen
    if (u_rip > 0.0) {
      vec2 g = q * 34.0, id = floor(g), f = fract(g) - 0.5;
      float h = hash(id), ph = fract(u_t * 0.85 + h * 7.0), d = length(f - (vec2(hash(id + 1.7), hash(id + 3.1)) - 0.5) * 0.5);
      ring += smoothstep(0.06, 0.0, abs(d - ph * 0.42)) * (1.0 - ph) * step(0.35, h) * u_rip;
    }
    for (int i = 0; i < 2; i++) if (u_spl[i].w > 0.0) {
      float d = length(q - u_spl[i].xy), rr = u_spl[i].z;
      ring += (smoothstep(0.0035, 0.0, abs(d - rr)) + smoothstep(0.003, 0.0, abs(d - rr * 0.55)) * 0.6) * u_spl[i].w;
    }
    ring *= 1.0 - u_ice;
    n = normalize(up + wn * (1.0 - u_ice));
    base = mix(base * 0.58, base * 1.1 + vec3(0.0, 0.05, 0.045), smoothstep(0.25, 1.05, dc));
    base = mix(base, vec3(0.62, 0.74, 0.8), u_ice);
    // Glitzern: viele kleine Wellen, die das Licht kurz zurückwerfen
    vec3 nh = normalize(up + vec3(sin(v_wp.x * 310.0 + u_t * 3.1) * sin(v_wp.y * 170.0 - u_t * 1.7), 0.0, cos(v_wp.z * 290.0 - u_t * 2.7) * sin(v_wp.x * 150.0 + u_t)) * 0.09);
    glint = pow(max(dot(nh, normalize(u_l1d + vd)), 0.0), 1400.0) * 2.4 * (1.0 - u_ice);
  }
  // Schnee bleibt auf Flächen liegen, die nach oben zeigen, und wächst von dort nach und nach zu
  float upf = max(dot(n, up), 0.0);
  if (v_at.x > 0.0 && u_snow > 0.0) {
    float th = 0.12 + v_at.w * 0.55;
    float k = smoothstep(th, th + 0.1, u_snow * v_at.x * (0.55 + 0.75 * upf));
    base = mix(base, vec3(0.84, 0.88, 0.94), k);
  }
  // Raureif: ein feiner, bläulich weißer Hauch auf Gras und Bäumen
  float frost = 0.0;
  if (v_at.x > 0.0 && u_frost > 0.0 && !water) {
    frost = u_frost * v_at.x * upf * upf * (0.45 + 0.55 * v_at.w);
    base = mix(base, vec3(0.72, 0.79, 0.86), frost * 0.42);
  }
  // Hitze: grünes Gras wird strohig
  if (u_dry > 0.0 && !water && !cloud && base.g > base.r * 1.12 && base.g > base.b * 1.25) base = mix(base, vec3(base.g * 0.98, base.g * 0.84, base.g * 0.42), u_dry * v_at.x * 0.5);
  if (!water && !cloud) base *= 1.0 - 0.28 * u_wet * v_at.x;
  float s1 = u_shl < 1.5 && u_shon > 0.5 ? shadowAt(n, u_l1d) : 1.0, s2 = u_shl > 1.5 && u_shon > 0.5 ? shadowAt(n, u_l2d) : 1.0;
  float d1 = max(dot(n, u_l1d), 0.0), d2 = max(dot(n, u_l2d), 0.0), d3 = max(dot(n, u_l3d), 0.0) * 0.8 + 0.2;
  vec3 amb = mix(u_gna, u_ska, dot(n, up) * 0.5 + 0.5);
  if (cloud) { amb = u_ska * 1.05 + u_gna * 0.3; d1 = d1 * 0.7 + 0.3; d2 = d2 * 0.6 + 0.15; }
  vec3 light = amb + u_l1c * d1 * s1 + u_l2c * d2 * s2 + u_l3c * d3 + vec3(0.5, 0.58, 0.95) * u_flash * (0.4 + 0.6 * max(dot(n, up), 0.0));
  if (u_win > 0.0) {
    vec3 dl = u_winp - v_wp; float dd = dot(dl, dl);
    light += u_winc * u_win * max(dot(n, normalize(dl)), 0.0) * 0.014 / (dd + 0.008);
  }
  vec3 col = base * light;
  float fr = pow(1.0 - max(dot(n, vd), 0.0), 3.0);
  if (water) {
    float f = pow(1.0 - max(dot(n, vd), 0.0), 3.0);
    col = mix(col, u_refl, clamp(f * 0.55 + 0.06, 0.0, 1.0) * (1.0 - u_ice * 0.6));
    float sp = mix(220.0, 30.0, u_ice);
    col += u_l1c * pow(max(dot(n, normalize(u_l1d + vd)), 0.0), sp) * 1.4 * s1 + u_l2c * pow(max(dot(n, normalize(u_l2d + vd)), 0.0), sp * 0.25) * 2.4 * s2;
    col += u_l1c * glint * s1;
    col += (u_refl * 0.6 + u_ska * 0.5 + u_l1c * 0.15) * ring;
    if (u_win > 0.0) col += u_winc * u_win * pow(max(dot(n, normalize(normalize(u_winp - v_wp) + vd)), 0.0), 40.0) * 0.5;
  } else if (!cloud && u_wet > 0.0) {
    col += u_l1c * pow(max(dot(n, normalize(u_l1d + vd)), 0.0), 36.0) * 0.18 * u_wet * v_at.x * s1;
  }
  if (frost > 0.0) col += (u_l1c + u_l2c * 1.5 + vec3(0.04)) * step(0.992, hash(floor(v_wp.xz * 900.0) + floor(v_wp.y * 900.0))) * frost * (0.6 + 0.4 * sin(u_t * 3.0 + v_wp.x * 500.0));
  if (kind > 0.5 && kind < 1.5) col = mix(col, u_winc * 1.6, u_win);
  if (cloud) {
    // Silberrand: Gegenlicht leuchtet durch die Ränder, bei tiefer Sonne golden
    col += u_l1c * pow(max(dot(-vd, u_l1d), 0.0), 5.0) * fr * 1.6 + u_l2c * pow(max(dot(-vd, u_l2d), 0.0), 5.0) * fr * 1.2;
  }
  col += u_rim * fr * (cloud ? 0.1 : 0.2);
  col = mix(col, u_haze, u_fog);
  o = vec4(pow(aces(col * u_exp), vec3(1.0 / 2.2)), 1.0);
}`;
const PN_VS_DEP = `#version 300 es
layout(location=0) in vec3 a_pos; layout(location=3) in vec4 a_at;
${PN_INST}
uniform mat4 u_lvp, u_m;
${PN_SWAY}
void main() { gl_Position = u_lvp * (u_m * mat4(a_m0, a_m1, a_m2, a_m3) * vec4(sway(a_pos, a_at.y), 1.0)); }`;
const PN_FS_DEP = `#version 300 es
precision mediump float;
out vec4 o;
void main() { o = vec4(1.0); }`;
const PN_VS_BG = `#version 300 es
layout(location=0) in vec2 a_q;
out vec2 v_uv;
void main() { v_uv = a_q * 0.5 + 0.5; gl_Position = vec4(a_q, 0.0, 1.0); }`;
const PN_FS_BG = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform vec3 u_top, u_mid, u_low; uniform float u_a, u_stars, u_t, u_flash, u_cell;
uniform vec4 u_ma[3]; uniform vec2 u_mb[3];
out vec4 o;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
/* Sternschnuppe: Anfang und Weg in Pixeln (u_ma), Fortschritt und Stärke (u_mb). Der Kopf ist hell, der Schweif läuft aus. */
float meteor(int i) {
  if (u_mb[i].y <= 0.0) return 0.0;
  vec2 d = u_ma[i].zw; float L = length(d); vec2 dn = d / L;
  vec2 q = gl_FragCoord.xy - u_ma[i].xy;
  float al = dot(q, dn), pe = abs(dot(q, vec2(-dn.y, dn.x))), head = u_mb[i].x * L, tail = L * 0.4;
  if (al > head || al < head - tail) return 0.0;
  float k = 1.0 - (head - al) / tail;
  return smoothstep(u_cell * 0.16, 0.0, pe) * k * k * u_mb[i].y;
}
void main() {
  float y = v_uv.y;
  vec3 c = y > 0.5 ? mix(u_mid, u_top, (y - 0.5) * 2.0) : mix(u_low, u_mid, pow(y * 2.0, 0.8));
  c += vec3(0.7, 0.76, 1.0) * u_flash * 0.32;
  float st = 0.0;
  if (u_stars > 0.01) {
    vec2 g = gl_FragCoord.xy / u_cell, id = floor(g), f = fract(g) - 0.5;
    float h = hash(id);
    if (h > 0.9) {
      vec2 off = vec2(hash(id + 3.1), hash(id + 7.7)) - 0.5;
      float d = length(f - off * 0.6), sz = 0.05 + 0.11 * hash(id + 1.3) * hash(id + 2.9);
      float tw = 0.6 + 0.4 * sin(u_t * (0.8 + 2.4 * hash(id + 5.2)) + h * 50.0);
      st = smoothstep(sz, 0.0, d) * tw * (0.35 + 0.65 * hash(id + 9.9)) * smoothstep(0.05, 0.35, y);
    }
  }
  st *= u_stars;
  float m = meteor(0) + meteor(1) + meteor(2);
  st += m * 1.4;
  o = vec4(c * u_a + vec3(st) * vec3(1.0, 0.98, 0.93), max(u_a, min(1.0, st)));
}`;
/* Leuchtpunkte in einem Rutsch: Lichterkette, Glühwürmchen, Feuerwerk, Lichter an Auto, Flugzeug und Windrad, ISS.
 * Pro Punkt Mitte und Größe (a_p), Farbe und Stärke (a_c), immer zur Kamera gedreht und addiert. */
const PN_VS_PTS = `#version 300 es
layout(location=0) in vec2 a_q; layout(location=1) in vec4 a_p; layout(location=2) in vec4 a_c;
uniform mat4 u_v, u_p;
out vec2 v_q; out vec4 v_c;
void main() { vec4 vc = u_v * vec4(a_p.xyz, 1.0); vc.xy += a_q * a_p.w * 1.82; v_q = a_q; v_c = a_c; gl_Position = u_p * vc; }`;
const PN_FS_PTS = `#version 300 es
precision highp float;
in vec2 v_q; in vec4 v_c;
out vec4 o;
/* Innen der Kern wie bisher (auf 55 % der Fläche), außen ein schwacher, weiter Lichthof wie bei einer Kamera */
void main() {
  float r = length(v_q);
  if (r > 1.0) discard;
  float q = r / 0.55, core = q < 1.0 ? (exp(-q * q * 7.0) * 0.7 + smoothstep(0.32, 0.0, q) * 0.7) * (1.0 - q) : 0.0;
  float a = (core + exp(-r * r * 4.5) * (1.0 - r) * 0.16) * v_c.a;
  o = vec4(v_c.rgb * a, a);
}`;
/* Polarlicht: Vorhänge als Band um den Nordpol des Planeten, unten grün, oben violett, mit wandernden Strahlen */
const PN_VS_AUR = `#version 300 es
layout(location=0) in vec2 a_uv;
uniform mat4 u_vp; uniform float u_t;
out vec2 v_uv;
void main() {
  float a = a_uv.x * 6.2832;
  float lat = radians(57.0) + 0.075 * sin(a * 3.0 + u_t * 0.13) + 0.035 * sin(a * 7.0 - u_t * 0.21);
  float r = 1.12 + a_uv.y * 0.5 * (0.75 + 0.25 * sin(a * 5.0 + u_t * 0.3));
  vec3 p = vec3(cos(lat) * sin(a), sin(lat), cos(lat) * cos(a)) * r;
  v_uv = a_uv; gl_Position = u_vp * vec4(p, 1.0);
}`;
const PN_FS_AUR = `#version 300 es
precision highp float;
in vec2 v_uv; uniform float u_a, u_t;
out vec4 o;
void main() {
  float u = v_uv.x, v = v_uv.y;
  float rays = 0.55 + 0.45 * sin(u * 230.0 + sin(u * 37.0 + u_t * 0.7) * 4.0 + u_t * 0.9) * sin(u * 97.0 - u_t * 0.5);
  float band = 0.55 + 0.45 * sin(u * 18.0 + u_t * 0.25);
  float prof = smoothstep(0.0, 0.07, v) * pow(1.0 - v, 1.7);
  vec3 c = mix(vec3(0.18, 1.0, 0.5), vec3(0.72, 0.28, 0.92), smoothstep(0.35, 0.95, v));
  float a = prof * (0.3 + 0.7 * rays) * band * u_a;
  o = vec4(c * a, a);
}`;
const PN_VS_SPR = `#version 300 es
layout(location=0) in vec2 a_q;
uniform mat4 u_v, u_p; uniform vec3 u_c; uniform float u_s;
out vec2 v_q;
void main() { vec4 vc = u_v * vec4(u_c, 1.0); vc.xy += a_q * u_s; v_q = a_q; gl_Position = u_p * vc; }`;
/* Arten: 0 weiches Leuchten, 1 Sonne, 2 Mond mit Phase, 3 Lichthof um den Planeten, 4 Rauch oder Nebel, 5 Regenbogen */
const PN_FS_SPR = `#version 300 es
precision highp float;
in vec2 v_q;
uniform int u_k; uniform vec4 u_col; uniform float u_ph, u_wax, u_ill, u_s, u_r0;
out vec4 o;
void main() {
  float r = length(v_q);
  if (r > 1.0) discard;
  vec3 c = vec3(0.0); float a = 0.0;
  if (u_k == 0) { a = exp(-r * r * 5.0) * (1.0 - r); c = u_col.rgb * a; }
  else if (u_k == 1) {
    float disc = smoothstep(0.235, 0.215, r);
    float g = (exp(-r * 4.2) * 0.5 + exp(-r * 11.0) * 0.55) * (1.0 - r);
    c = u_col.rgb * g * 1.3 + mix(u_col.rgb, vec3(1.0, 0.97, 0.86), 0.35) * disc; a = disc;
  } else if (u_k == 2) {
    vec2 q = v_q / 0.2; float rr = length(q);
    float disc = smoothstep(1.0, 0.92, rr);
    float t = sqrt(max(1.0 - q.y * q.y, 0.0)), e = u_wax > 0.5 ? q.x - u_ph * t : -u_ph * t - q.x;
    float lit = smoothstep(-0.08, 0.08, e);
    float mare = 0.86 + 0.14 * sin(q.x * 6.0 + 1.3) * sin(q.y * 5.0 - 0.4);
    vec3 mc = mix(vec3(0.1, 0.12, 0.17), vec3(0.93, 0.94, 0.98) * mare, lit) * disc;
    float g = exp(-r * 3.4) * (1.0 - r) * 0.55 * u_ill;
    c = mc + u_col.rgb * g; a = max(disc, g);
  } else if (u_k == 5) {
    float pr = r * u_s / u_r0, t = (pr - 1.2) / 0.16;
    a = smoothstep(0.0, 0.18, t) * smoothstep(1.0, 0.82, t) * smoothstep(-0.15, 0.45, v_q.y / max(r, 1e-3));
    c = (0.5 + 0.5 * cos(6.2832 * (vec3(0.0, 0.33, 0.67) - t * 0.82 + 0.05))) * a;
  } else if (u_k == 3) {
    float pr = r * u_s / u_r0;
    a = pr > 1.0 ? exp(-(pr - 1.0) * 9.0) * (1.0 - smoothstep(0.75, 1.0, r)) : smoothstep(0.82, 1.0, pr) * 0.28;
    c = u_col.rgb * a;
  } else {
    a = smoothstep(1.0, 0.25, r) * u_col.a; c = u_col.rgb * a;
    o = vec4(c, a); return;
  }
  o = vec4(c * u_col.a, clamp(a * u_col.a, 0.0, 1.0));
}`;
/* Regen als Striche, Schnee als Flocken. Jeder Tropfen gehört zu einer Wolke und fällt von dort zum Boden. */
const PN_VS_DROP = `#version 300 es
layout(location=0) in vec2 a_q; layout(location=1) in vec4 a_s;
uniform mat4 u_vp; uniform vec4 u_cl[12]; uniform int u_ncl; uniform float u_t, u_mode, u_len, u_w, u_spd; uniform vec3 u_wv; uniform vec2 u_px;
out float v_a; out vec2 v_q;
void main() {
  vec4 c = u_cl[gl_InstanceID % max(u_ncl, 1)];
  vec3 n = normalize(c.xyz);
  vec3 tx = normalize(cross(abs(n.y) > 0.9 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0), n)), ty = cross(n, tx);
  float ang = a_s.x * 6.2832, rad = sqrt(a_s.y) * c.w;
  vec3 dir = normalize(n + (tx * cos(ang) * 1.3 + ty * sin(ang) * 0.7) * rad);
  float f = fract(u_t * u_spd * (0.8 + a_s.z * 0.4) + a_s.w);
  float r = mix(length(c.xyz) - 0.04, 0.985, f);
  vec3 wt = u_wv - dir * dot(u_wv, dir);
  vec3 p = dir * r + wt * f * 0.1;
  if (u_mode > 0.5 && u_mode < 1.5) p += (tx * sin(u_t * 1.3 + a_s.x * 40.0) + ty * cos(u_t * 1.1 + a_s.y * 40.0)) * 0.014;
  vec4 c0 = u_vp * vec4(p, 1.0);
  v_q = vec2(a_q.x, a_q.y * 2.0 - 1.0);
  if (u_mode < 0.5) {
    vec4 c1 = u_vp * vec4(p + normalize(dir - wt * 0.1) * u_len, 1.0);
    vec2 d = (c1.xy / c1.w - c0.xy / c0.w) / u_px;
    d = length(d) > 1e-4 ? normalize(d) : vec2(0.0, 1.0);
    vec4 cc = mix(c0, c1, a_q.y);
    cc.xy += vec2(-d.y, d.x) * a_q.x * u_w * u_px * cc.w;
    gl_Position = cc;
  } else {
    c0.xy += v_q * u_w * u_px * c0.w;
    gl_Position = c0;
  }
  v_a = smoothstep(0.0, 0.1, f) * (1.0 - smoothstep(0.88, 1.0, f));
}`;
const PN_FS_DROP = `#version 300 es
precision highp float;
in float v_a; in vec2 v_q;
uniform vec4 u_col; uniform float u_mode;
out vec4 o;
void main() {
  float a = u_mode < 0.5 ? (1.0 - abs(v_q.x)) * smoothstep(-1.0, 0.2, v_q.y) : smoothstep(1.0, 0.3, length(v_q));
  a *= v_a * u_col.a;
  o = vec4(u_col.rgb * a, a);
}`;
const PN_VS_RIB = `#version 300 es
layout(location=0) in vec3 a_a; layout(location=1) in vec3 a_b; layout(location=2) in vec2 a_q;
uniform mat4 u_vp; uniform vec2 u_px; uniform float u_w;
out float v_s;
void main() {
  vec4 ca = u_vp * vec4(a_a, 1.0), cb = u_vp * vec4(a_b, 1.0);
  vec2 d = (cb.xy / cb.w - ca.xy / ca.w) / u_px;
  d = length(d) > 1e-4 ? normalize(d) : vec2(0.0, 1.0);
  vec4 c = a_q.y < 0.5 ? ca : cb;
  c.xy += vec2(-d.y, d.x) * a_q.x * u_w * u_px * c.w;
  v_s = a_q.x; gl_Position = c;
}`;
const PN_FS_RIB = `#version 300 es
precision highp float;
in float v_s; uniform vec4 u_col;
out vec4 o;
void main() { float a = pow(1.0 - abs(v_s), 1.6) * u_col.a; o = vec4(u_col.rgb * a, a); }`;

function pnProg(gl, vs, fs) {
  const sh = (t, src) => {
    const s = gl.createShader(t);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS) && !gl.isContextLost()) throw new Error(gl.getShaderInfoLog(s) || 'Shader');
    return s;
  };
  const p = gl.createProgram();
  gl.attachShader(p, sh(gl.VERTEX_SHADER, vs));
  gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS) && !gl.isContextLost()) throw new Error(gl.getProgramInfoLog(p) || 'Programm');
  const u = {}, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS) || 0;
  for (let i = 0; i < n; i++) { const a = gl.getActiveUniform(p, i); u[a.name.replace(/\[0\]$/, '')] = gl.getUniformLocation(p, a.name); }
  return { p, u };
}

/* Was das Wetter für die Szene bedeutet: Grau, Niederschlag, Gewitter, Nebel */
function pnWeatherKind(code) {
  const c = +code;
  if (!Number.isFinite(c)) return { grey: 0.2, pk: '', pi: 0, storm: false, fog: false };
  const g = { 0: 0, 1: 0.06, 2: 0.22, 3: 0.58, 45: 0.62, 48: 0.62 };
  if (c in g) return { grey: g[c], pk: '', pi: 0, storm: false, fog: c >= 45 };
  const tbl = { 51: ['drizzle', 0.3], 53: ['drizzle', 0.45], 55: ['drizzle', 0.6], 56: ['drizzle', 0.4], 57: ['drizzle', 0.55], 61: ['rain', 0.45], 63: ['rain', 0.7], 65: ['rain', 1], 66: ['rain', 0.5], 67: ['rain', 0.8], 80: ['rain', 0.45], 81: ['rain', 0.7], 82: ['rain', 1], 71: ['snow', 0.45], 73: ['snow', 0.7], 75: ['snow', 1], 77: ['snow', 0.35], 85: ['snow', 0.55], 86: ['snow', 0.9], 95: ['rain', 0.9], 96: ['rain', 1], 99: ['rain', 1] };
  const [pk, pi] = tbl[c] || ['', 0];
  return { grey: c >= 95 ? 0.85 : pk === 'snow' ? 0.6 : pk === 'drizzle' ? 0.68 : 0.74, pk, pi, storm: c >= 95, fog: false };
}
/* Mondphase: 0 Neumond, 0.5 Vollmond (synodischer Monat ab einem bekannten Neumond) */
const pnMoonPhase = d => { const x = ((d.getTime() / DAY + 2440587.5) - 2451550.1) / 29.530588853; return x - Math.floor(x); };
const pnSunCache = new Map();
function pnSunDay(d, loc) {
  const k = `${ymd(d)}|${(+loc.lat).toFixed(2)}|${(+loc.lon).toFixed(2)}`;
  let v = pnSunCache.get(k);
  if (!v) { v = sunDay(d, loc); pnSunCache.set(k, v); if (pnSunCache.size > 24) pnSunCache.delete(pnSunCache.keys().next().value); }
  return v;
}
/* Wo Sonne und Mond auf ihrem Bogen stehen: 0 links am Horizont (Aufgang), π rechts (Untergang) */
function pnArcs(now, loc) {
  const today = pnSunDay(now, loc), t = +now;
  const day = D => (D.rise && D.set ? D : null);
  const T = day(today), Y = day(pnSunDay(addDays(sod(now), -1), loc)), N = day(pnSunDay(addDays(sod(now), 1), loc));
  let sun, moon = -1;
  if (T && t >= +T.rise && t <= +T.set) sun = Math.PI * (t - T.rise) / (T.set - T.rise);
  else if (T && t > +T.set && N) { const f = (t - T.set) / (N.rise - T.set); sun = Math.PI * (1 + f); moon = Math.PI * f; }
  else if (T && t < +T.rise && Y) { const f = (t - Y.set) / (T.rise - Y.set); sun = Math.PI * (1 + f); moon = Math.PI * f; }
  else {
    // Polartag oder Polarnacht: einfach nach der Uhr
    const f = ((t - sod(now)) / DAY + 0.75) % 1;
    sun = f * Math.PI * 2;
    moon = sun - Math.PI;
  }
  return { sun, moon, max: today.max };
}
function pnArcDir(th, hv) { return pnV.norm([-Math.cos(th), Math.sin(th) * hv, Math.sin(th) * 0.36]); }

/* Wo die ISS am Himmel des Planeten steht: Osten links wie beim Sonnenaufgang, Süden vorn, Höhe nach oben */
function pnIssDir(az, el) {
  const a = az * PN_RAD, e = el * PN_RAD;
  return pnV.norm([-Math.sin(a) * Math.cos(e), Math.sin(e) * 0.95 + 0.22, -Math.cos(a) * Math.cos(e) * 0.4]);
}
const PN_PLANE_AX = pnV.norm([0.3, 1, -0.45]), PN_PLANE_E1 = pnV.norm(pnV.cross(PN_PLANE_AX, [0, 0, 1]));
const PN_FW_COLS = [[1, 0.32, 0.25], [1, 0.8, 0.32], [0.38, 1, 0.48], [0.42, 0.62, 1], [0.86, 0.42, 1], [1, 0.97, 0.9]];
const PN_XMAS_COLS = [[1, 0.28, 0.22], [1, 0.78, 0.28], [0.32, 1, 0.42], [0.38, 0.58, 1], [1, 0.9, 0.72]];
const PN_PTS_MAX = 1600, PN_INST_MAX = 48;
/* Liegt p von der Kamera aus hinter dem Planeten? */
function pnHidden(eye, p) {
  const d = pnV.sub(p, eye), a = pnV.dot(d, d), b = 2 * pnV.dot(eye, d), c = pnV.dot(eye, eye) - 0.97 * 0.97, q = b * b - 4 * a * c;
  if (q < 0) return false;
  const t = (-b - Math.sqrt(q)) / (2 * a);
  return t > 0 && t < 0.995;
}

/* Regenbogen: die Sonne steht tiefer als 42°, kommt durch, und es regnet gerade oder hat eben erst geregnet (bis 45 Minuten).
 * Das Eben-geregnet merkt sich das Cockpit pro Ort, im Vollbild mit Regler zählt die Stunde davor. Zurück kommt die Stärke 0..1. */
function pnRainbow(I, K, c, loc, now, alt, cover, wetNow) {
  if (alt < 1 || alt > 42 || K.storm || K.fog || K.pk === 'snow' || cover > 92) return 0;
  const k = pnKey(loc), real = !I.ovr;
  if (wetNow && real) pnx.rainAt.set(k, Date.now());
  let since = wetNow ? 0 : real ? (Date.now() - (pnx.rainAt.get(k) || -1e12)) / 6e4 : 99;
  if (!wetNow && c && c.precipitation > 0.05) since = Math.min(since, 10);
  if (!wetNow && I.ovr && I.ovr.k === 'h') { const h = pnx.hourly.get(k), x = h && h.h && pnAtHour(h.h, +now - 36e5); if (x && x.precipitation > 0.05) since = Math.min(since, 20); }
  if (since > 45) return 0;
  const sun = pnSmooth(1, 5, alt) * (1 - pnSmooth(36, 42, alt)) * (1 - pnSmooth(78, 92, cover));
  return sun * (wetNow ? Math.min(1, 0.4 + K.pi) : 1 - since / 45);
}
/* Eine Zeichenfläche mit eigenem WebGL-Kontext.
 * mode: 'card' (Karte), 'full' (Vollbild), 'trip' (kleiner Urlaubsplanet im Vollbild), 'mirror' (MirrorOS ohne Hintergrund).
 * opts: place (fester Ort statt der Widget-Einstellung), seed, theme ('beach'), trip (ohne Straße, Auto und Co.) */
class PnView {
  constructor(id, host, mode, opts = {}) {
    this.id = id; this.opts = opts; this.ok = false; this.vis = false; this.last = 0; this.t = 0;
    this.yaw = 0; this.pitch = PN_PITCH; this.vyaw = 0; this.idle = 0; this.drag = null;
    this.snow = -1; this.ice = -1; this.win = 0; this.rain = 0; this.flash = 0; this.bolt = null; this.nextBolt = 0; this.wetA = 0; this.gloom = -1;
    this.env = null; this.envAt = 0; this.worldKey = ''; this.ovr = null; this.onPick = null; this.hits = []; this.VP = null; this.eye = null;
    this.rotA = 0; this.rotW = 0; this.fw = []; this.fwNext = 0; this.met = [null, null, null]; this.metNext = 0; this.aurA = 0;
    this.frost = -1; this.dry = -1; this.mist = -1; this.rbow = 0; this.life = null;
    this.cl = Array.from({ length: 12 }, () => ({ v: 0 }));
    this.cv = document.createElement('canvas');
    this.cv.className = 'pn-cv';
    if (mode !== 'mirror') { this.cv.tabIndex = 0; this.cv.setAttribute('role', 'img'); }
    this.cv.setAttribute('aria-label', 'Wetterplanet');
    host.appendChild(this.cv);
    this.setMode(mode);
    this.onLost = e => { e.preventDefault(); this.ok = false; };
    this.onRestore = () => { this.init(); pnWake(); };
    this.cv.addEventListener('webglcontextlost', this.onLost);
    this.cv.addEventListener('webglcontextrestored', this.onRestore);
    if (mode !== 'mirror') this.bindInput();
    this.ro = new ResizeObserver(() => { this.sized = false; pnWake(); });
    this.ro.observe(this.cv);
    if (pn.io) pn.io.observe(this.cv);
    this.init();
  }
  /* Höchstens 60 Bilder pro Sekunde, auch auf 120-Hz-Schirmen, im Spiegel und beim kleinen Urlaubsplaneten 30 */
  setMode(m) { this.mode = m; this.sized = false; this.minDt = m === 'mirror' || m === 'trip' || m === 'night' ? 1000 / 30 - 3 : 1000 / 60 - 3; }
  /* Die Uhrzeit der Szene: jetzt oder, im Vollbild mit Regler, eine andere Stunde oder ein anderer Tag im Jahr */
  now() {
    const o = this.ovr;
    if (!o) return new Date();
    if (o.k === 'h') return new Date(o.t);
    const n = new Date();
    return new Date(n.getFullYear(), 0, 1 + o.doy, n.getHours(), n.getMinutes(), n.getSeconds());
  }
  init() {
    const gl = this.cv.getContext('webgl2', { antialias: true, alpha: true, premultipliedAlpha: true, powerPreference: 'low-power' });
    this.gl = gl;
    if (!gl) { this.fail('Dein Browser kann den Planeten hier nicht zeichnen (WebGL2 fehlt).'); return; }
    try {
      this.P = {
        lit: pnProg(gl, PN_VS_LIT, PN_FS_LIT), dep: pnProg(gl, PN_VS_DEP, PN_FS_DEP), bg: pnProg(gl, PN_VS_BG, PN_FS_BG),
        spr: pnProg(gl, PN_VS_SPR, PN_FS_SPR), drop: pnProg(gl, PN_VS_DROP, PN_FS_DROP), rib: pnProg(gl, PN_VS_RIB, PN_FS_RIB),
        pts: pnProg(gl, PN_VS_PTS, PN_FS_PTS), aur: pnProg(gl, PN_VS_AUR, PN_FS_AUR)
      };
    } catch (e) { this.fail('Der Planet ließ sich nicht starten.'); console.warn('Wetterplanet:', e); return; }
    // Viereck für Hintergrund und Leuchtpunkte
    this.quad = gl.createVertexArray();
    gl.bindVertexArray(this.quad);
    this.quadBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    // Regen und Schnee: ein Viereck pro Tropfen, Zufallswerte pro Tropfen
    this.drops = gl.createVertexArray();
    gl.bindVertexArray(this.drops);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, 0, 1, 0, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    const rng = pnRng(99), seeds = new Float32Array(1400 * 4);
    for (let i = 0; i < seeds.length; i++) seeds[i] = rng();
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, seeds, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 0, 0);
    gl.vertexAttribDivisor(1, 1);
    // Blitz: Bänder, jedes Frame neu gefüllt
    this.rib = gl.createVertexArray();
    gl.bindVertexArray(this.rib);
    this.ribBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.ribBuf);
    gl.bufferData(gl.ARRAY_BUFFER, 64 * 6 * 8 * 4, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 32, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 32, 12);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 2, gl.FLOAT, false, 32, 24);
    // Leuchtpunkte: das Viereck plus pro Punkt Lage, Größe und Farbe
    this.pts = gl.createVertexArray();
    gl.bindVertexArray(this.pts);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuf);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    this.ptsBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.ptsBuf);
    gl.bufferData(gl.ARRAY_BUFFER, PN_PTS_MAX * 32, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 32, 0); gl.vertexAttribDivisor(1, 1);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 32, 16); gl.vertexAttribDivisor(2, 1);
    this.ptsArr = new Float32Array(PN_PTS_MAX * 8); this.ptsN = 0;
    // Polarlicht: ein Band aus 160 Stücken rund um den Pol
    this.aur = gl.createVertexArray();
    gl.bindVertexArray(this.aur);
    const NA = 160, av = new Float32Array((NA + 1) * 4);
    for (let i = 0; i <= NA; i++) av.set([i / NA, 0, i / NA, 1], i * 4);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, av, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    this.aurN = (NA + 1) * 2;
    gl.bindVertexArray(null);
    // Instanzen: ein gemeinsamer Puffer, jedes Netz kennt ihn (siehe upload), benutzt wird er nur beim Zeichnen vieler gleicher Dinge
    this.instBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instBuf);
    gl.bufferData(gl.ARRAY_BUFFER, PN_INST_MAX * 76, gl.DYNAMIC_DRAW);
    this.instArr = new Float32Array(PN_INST_MAX * 19);
    gl.vertexAttrib4f(4, 1, 0, 0, 0); gl.vertexAttrib4f(5, 0, 1, 0, 0); gl.vertexAttrib4f(6, 0, 0, 1, 0); gl.vertexAttrib4f(7, 0, 0, 0, 1); gl.vertexAttrib4f(8, 1, 1, 1, 1);
    // Schatten
    this.shs = 1024;
    this.shTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.shTex);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.DEPTH_COMPONENT24, this.shs, this.shs);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL);
    this.shFb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.shFb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, this.shTex, 0);
    gl.drawBuffers([gl.NONE]);
    gl.readBuffer(gl.NONE);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.world = null; this.worldKey = ''; this.clouds = null; this.obj = null; this.life = null;
    this.sized = false;
    this.ok = true;
    this.msg('');
  }
  fail(text) { this.ok = false; this.msg(text); }
  msg(text) { const v = views.get(this.id), m = this.mode === 'card' && v && v.q('[data-r="msg"]'); if (m) { m.textContent = text; m.hidden = !text; } }
  upload(M) {
    const gl = this.gl, vao = gl.createVertexArray(), bufs = [];
    gl.bindVertexArray(vao);
    [[M.p, 3], [M.n, 3], [M.c, 3], [M.a, 4]].forEach(([arr, n], i) => {
      const b = gl.createBuffer();
      bufs.push(b);
      gl.bindBuffer(gl.ARRAY_BUFFER, b);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(arr), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(i);
      gl.vertexAttribPointer(i, n, gl.FLOAT, false, 0, 0);
    });
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instBuf);
    for (let i = 0; i < 5; i++) { gl.vertexAttribPointer(4 + i, i < 4 ? 4 : 3, gl.FLOAT, false, 76, i * 16); gl.vertexAttribDivisor(4 + i, 1); }
    gl.bindVertexArray(null);
    return { vao, n: M.count, bufs };
  }
  free(m) { if (!m) return; const gl = this.gl; gl.deleteVertexArray(m.vao); for (const b of m.bufs) gl.deleteBuffer(b); }
  /* Gelände, Haus und Bäume neu bauen, wenn sich Jahreszeit, Gewohnheitswald oder Deko ändern */
  ensureWorld(now, lat, X) {
    const S = pnSeason(now, lat), k = `${S.k}|${S.bare.toFixed(2)}|${X.key}`;
    if (k === this.worldKey && this.world) return;
    const seed = this.opts.seed ?? pnHashStr(this.id);
    const W = pnBuildWorld(seed, S, X);
    if (this.world) { this.free(this.world.mesh); this.free(this.world.cat); this.free(this.world.flag); this.free(this.world.snowman); }
    this.world = { mesh: this.upload(W.M), scene: W.scene, cat: W.cat ? this.upload(W.cat) : null, flag: W.flag ? this.upload(W.flag) : null, snowman: W.snowman ? this.upload(W.snowman) : null, R: W.R, season: S };
    if (!this.clouds) {
      this.clouds = pnBuildClouds(seed).map(M => this.upload(M));
      // Die ersten Wolken stehen gut verteilt, auch wenn es nur wenige gibt
      const rng = pnRng(seed ^ 0x51ed), lons = [62, -78, 170, 10, 120, -130, -30, 215, 85, -100, 35, 265];
      this.cl.forEach((c, i) => Object.assign(c, { lon: lons[i] + (rng() - 0.5) * 20, lat: (i < 3 ? 48 : 28) + rng() * (i < 3 ? 20 : 42), r: 1.38 + rng() * 0.13, var: i % 3, s: 0.85 + rng() * 0.45, spd: 0.7 + rng() * 0.6, rot: rng() * 6.28 }));
    }
    if (!this.obj && X.cockpit) this.obj = { rotor: this.upload(pnBuildRotor()), plane: this.upload(pnBuildPlane()), car: null, carHex: '' };
    this.worldKey = k;
  }
  bindInput() {
    const cv = this.cv;
    cv.addEventListener('pointerdown', e => {
      if (e.button > 0) return;
      this.drag = { x: e.clientX, y: e.clientY, t0: performance.now(), t: performance.now(), moved: 0, touch: e.pointerType === 'touch' };
      this.vyaw = 0;
      try { cv.setPointerCapture(e.pointerId); } catch { /* egal */ }
      pnWake();
    });
    cv.addEventListener('pointermove', e => {
      const d = this.drag;
      if (!d) return;
      const now = performance.now(), dx = e.clientX - d.x, dy = e.clientY - d.y, dt = Math.max(8, now - d.t) / 1000;
      this.yaw -= dx * 0.009;
      // In der Karte scrollt ein Wischen nach oben oder unten die Seite, im Vollbild kippt es den Planeten
      if (!d.touch || this.mode === 'full' || this.mode === 'night') this.pitch = Math.max(-0.35, Math.min(1.25, this.pitch + dy * 0.007));
      this.vyaw = this.vyaw * 0.5 + (-dx * 0.009 / dt) * 0.5;
      d.moved += Math.abs(dx) + Math.abs(dy); d.x = e.clientX; d.y = e.clientY; d.t = now;
    });
    const up = e => {
      const d = this.drag;
      if (!d) return;
      this.drag = null;
      this.idle = performance.now();
      try { cv.releasePointerCapture(e.pointerId); } catch { /* egal */ }
      if (performance.now() - d.t > 90) this.vyaw = 0;
      // Kurz antippen: erst schauen, ob etwas getroffen wurde (Auto, Haus, Sonne ...), sonst einmal herumdrehen
      if (e.type === 'pointerup' && d.moved < 6 && performance.now() - d.t0 < 550) {
        if (this.onPick && this.onPick(this.pick(e.clientX, e.clientY), e)) return;
        this.vyaw = 16;
      }
    };
    cv.addEventListener('pointerup', up);
    cv.addEventListener('pointercancel', up);
    cv.addEventListener('keydown', e => {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); this.vyaw = e.key === 'ArrowLeft' ? -2.6 : 2.6; this.idle = performance.now(); pnWake(); }
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.vyaw = 16; this.idle = performance.now(); pnWake(); }
    });
  }
  /* Was liegt unter dem Finger? Treffer werden beim Zeichnen gesammelt (this.hits), verdeckte zählen nicht. */
  pick(cx, cy) {
    if (!this.VP || !this.eye) return null;
    const rc = this.cv.getBoundingClientRect(), x = cx - rc.left, y = cy - rc.top, VP = this.VP;
    let best = null;
    for (const h of this.hits) {
      const p = h.p, w = VP[3] * p[0] + VP[7] * p[1] + VP[11] * p[2] + VP[15];
      if (w <= 0) continue;
      const sx = ((VP[0] * p[0] + VP[4] * p[1] + VP[8] * p[2] + VP[12]) / w * 0.5 + 0.5) * rc.width;
      const sy = (0.5 - (VP[1] * p[0] + VP[5] * p[1] + VP[9] * p[2] + VP[13]) / w * 0.5) * rc.height;
      const d = Math.hypot(sx - x, sy - y);
      if (d > h.r || pnHidden(this.eye, p)) continue;
      const score = d / h.r + (h.pri || 0);
      if (!best || score < best.score) best = { ...h, score, sx, sy };
    }
    return best;
  }
  destroy() {
    pn.inst.delete(this.key);
    this.ro.disconnect();
    if (pn.io) pn.io.unobserve(this.cv);
    this.cv.removeEventListener('webglcontextlost', this.onLost);
    this.cv.removeEventListener('webglcontextrestored', this.onRestore);
    const ext = this.gl && this.gl.getExtension('WEBGL_lose_context');
    if (ext) ext.loseContext();
    this.cv.remove();
    this.ok = false;
  }
  /* Dinge zeichnen: gleiche Netze (etwa alle Vögel) zusammen in einem Aufruf, einzelne wie bisher */
  drawObjs(list, U, tint) {
    const gl = this.gl, I4 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1], G = new Map();
    for (const o of list) { const g = G.get(o.mesh); if (g) g.push(o); else G.set(o.mesh, [o]); }
    for (const [mesh, arr] of G) {
      gl.bindVertexArray(mesh.vao);
      if (arr.length === 1) {
        if (tint) gl.uniform3fv(U.u_tint, arr[0].tint || [1, 1, 1]);
        gl.uniformMatrix4fv(U.u_m, false, arr[0].M);
        gl.drawArrays(gl.TRIANGLES, 0, mesh.n);
        continue;
      }
      const A = this.instArr, n = Math.min(arr.length, PN_INST_MAX);
      for (let i = 0; i < n; i++) { A.set(arr[i].M, i * 19); A.set(arr[i].tint || [1, 1, 1], i * 19 + 16); }
      gl.bindBuffer(gl.ARRAY_BUFFER, this.instBuf);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, A, 0, n * 19);
      if (tint) gl.uniform3fv(U.u_tint, [1, 1, 1]);
      gl.uniformMatrix4fv(U.u_m, false, I4);
      for (let i = 4; i < 9; i++) gl.enableVertexAttribArray(i);
      gl.drawArraysInstanced(gl.TRIANGLES, 0, mesh.n, n);
      for (let i = 4; i < 9; i++) gl.disableVertexAttribArray(i);
    }
  }
  pt(p, s, r, g, b, a) {
    if (this.ptsN >= PN_PTS_MAX || a < 0.004) return;
    this.ptsArr.set([p[0], p[1], p[2], s, r, g, b, a], this.ptsN * 8);
    this.ptsN++;
  }
  /* Szene aus Wetter und Uhrzeit, zweimal pro Sekunde neu */
  computeEnv(now) {
    const D = pnDataOf(this), loc = D ? D.loc : skyLoc();
    let c = D ? D.c : null;
    // Im Vollbild mit Stundenregler: das Wetter dieser Stunde, sobald die Stundenwerte da sind
    if (c && this.ovr && this.ovr.k === 'h') { const h = pnHourly(loc), x = h && pnAtHour(h, +now); if (x) c = x; }
    const K = pnWeatherKind(c ? c.weather_code : NaN);
    const cover = c && Number.isFinite(c.cloud_cover) ? c.cloud_cover : c ? ({ 0: 5, 1: 20, 2: 50, 3: 95 }[c.weather_code] ?? 90) : 25;
    const lat = +loc.lat, lon = +loc.lon, alt = sunAlt(now, lat, lon), A = pnArcs(now, loc);
    const hv = 0.62 + 0.62 * clamp01((A.max || 30) / 62);
    const sunD = pnArcDir(A.sun, hv), moonD = A.moon >= 0 ? pnArcDir(A.moon, hv * 0.92) : [0, -1, 0];
    const ph = pnMoonPhase(now), ill = (1 - Math.cos(ph * Math.PI * 2)) / 2;
    const grey = Math.max(K.grey, cover / 100 * 0.62);
    const temp = c && Number.isFinite(c.temperature_2m) ? c.temperature_2m : 10;
    const wind = c && Number.isFinite(c.wind_speed_10m) ? c.wind_speed_10m : 8, wdir = c && Number.isFinite(c.wind_direction_10m) ? c.wind_direction_10m : 250;
    const snowD = c && Number.isFinite(c.snow_depth) ? c.snow_depth : 0;
    const to = (wdir + 180) * PN_RAD, ws = Math.min(1.3, wind / 40);
    let n = Math.round(cover / 100 * 11);
    if (K.pk) n = Math.max(n, K.storm ? 11 : 8);
    if (K.fog) n = Math.max(n, 6);
    const season = pnSeason(now, lat), cockpit = !this.opts.trip;
    // Was auf dem Planeten steht: Gewohnheitswald, Lichterkette, Kürbisse
    const X = { theme: this.opts.theme || 'home', cockpit, habit: null, xmas: false, pumpkins: false };
    let hb = null;
    if (cockpit) { const F = pnFest(now); hb = pnHabitTrees(now); X.habit = hb.ages; X.xmas = F.xmas; X.pumpkins = F.pumpkins; }
    X.key = `${X.theme}|${cockpit ? 1 : 0}|${hb ? hb.key : ''}|${X.xmas ? 1 : 0}|${X.pumpkins ? 1 : 0}`;
    // Luft, Polarlicht und ISS
    const air = pnAir(loc), aqi = air && Number.isFinite(air.european_aqi) ? air.european_aqi : 0, dust = air && Number.isFinite(air.dust) ? air.dust : 0;
    let aur = 0, kp = null;
    if (alt < -9 && cover < 75 && !K.pk) {
      const gm = Math.abs(pnGeomag(lat, lon));
      if (gm > 40) { kp = pnKp(); if (Number.isFinite(kp)) { aur = clamp01((gm - (66 - 2.1 * kp) + 3) / 6); if (aur < 0.12) aur = 0; } }
    }
    const iss = alt < -6 && cover < 80 && !this.ovr ? pnIssAt(loc, +now) : null;
    const trip = cockpit ? pnTrip(now) : null;
    // 3.14: Raureif, Hitze, Frühnebel, Hagel, Sturm und Regenbogen
    const snowT = Math.max(clamp01(snowD * 100 / 3), K.pk === 'snow' ? 0.92 : 0), wetNow = K.pk === 'rain' || K.pk === 'drizzle';
    const hum = c && Number.isFinite(c.relative_humidity_2m) ? c.relative_humidity_2m : NaN;
    const frost = temp <= 0.5 && !K.pk && snowT < 0.35 && (cover < 75 || temp < -3) && alt < 25 ? clamp01((0.5 - temp) / 2.5 + 0.35) : 0;
    const dry = season.k === 'summer' && !wetNow ? clamp01((temp - 26) / 6) : 0;
    const dawn = alt > -4 && alt < 9 && wind < 10 && cover < 70 && !K.pk && (Number.isFinite(hum) ? hum >= 90 : season.k === 'autumn' && temp < 12);
    const mist = K.fog ? 1 : dawn ? 0.6 : 0;
    const rb = pnRainbow(this, K, c, loc, now, alt, cover, wetNow);
    const tk = c ? +c.weather_code : 0;
    return {
      c, K, loc, alt, sunD, moonD, ph, ill, grey, temp, cover, n: Math.min(12, n), ws, wind, wdir, wv: pnV.mul([-Math.sin(to), 0, -Math.cos(to)], ws),
      pm: A.sun > Math.PI / 2 && A.sun <= Math.PI * 1.5, snowT: Math.max(clamp01(snowD * 100 / 3), K.pk === 'snow' ? 0.92 : 0), snowing: K.pk === 'snow',
      iceT: temp <= -1.5 ? 1 : 0, smoke: temp < 12, snowLie: snowT, lightOn: alt < 3.5 || (grey >= 0.6 && alt < 22) || grey >= 0.8, wet: K.pk === 'rain' || K.pk === 'drizzle' ? 1 : 0,
      name: D ? D.name : '', season, X, haze: clamp01((aqi - 40) / 60), dust: clamp01((dust - 30) / 150), aqi, dustV: dust, aur, kp, iss,
      ffly: cockpit && season.k === 'summer' && temp >= 13 && alt < -1 && !K.pk && wind < 22,
      car: cockpit ? pnCarState(now) : null, trip, plane: !!(trip && (trip.now || trip.days <= 30)), flag: cockpit && pnFlagUp(now),
      fw: cockpit ? pnFireworks(now) : 0, met: pnMeteorRate(now), habitN: hb ? hb.n : 0,
      frost, dry, mist, hum, rainbow: rb, hail: tk === 96 || tk === 99, gale: clamp01((wind - 36) / 26), now
    };
  }
  frame(ts) {
    if (!this.ok) return;
    const gl = this.gl, E0 = this.env;
    let dt = this.lastTs ? (ts - this.lastTs) / 1000 : 0.016;
    this.lastTs = ts; this.last = ts;
    dt = Math.max(0, Math.min(0.1, dt));
    this.t += dt;
    const now = this.now();
    if (!E0 || ts - this.envAt > 500) { this.env = this.computeEnv(now); this.envAt = ts; }
    const E = this.env;
    this.ensureWorld(now, +E.loc.lat, E.X);
    if (!this.sized) {
      const cw = this.cv.clientWidth, ch = this.cv.clientHeight;
      let dpr = Math.min(window.devicePixelRatio || 1, this.mode === 'card' ? 2 : 1.5);
      // Im Vollbild höchstens rund 2,6 Millionen Pixel, sonst wird es auf großen Schirmen zäh
      if (this.mode === 'full' || this.mode === 'night') dpr = Math.min(dpr, Math.sqrt(2.6e6 / Math.max(1, cw * ch)));
      const w = Math.max(1, Math.round(cw * dpr)), h = Math.max(1, Math.round(ch * dpr));
      if (this.cv.width !== w || this.cv.height !== h) { this.cv.width = w; this.cv.height = h; }
      this.dpr = dpr; this.sized = true;
    }
    const W = this.cv.width, H = this.cv.height;
    if (W < 4 || H < 4) return;
    this.hits = []; this.ptsN = 0;
    const S0 = this.world.scene;
    // Übergänge weich: Schnee, Eis, Licht, Regen, Wolken. Beim Blättern durch die Zeit schneller.
    const fast = this.ovr ? 6 : 1;
    const ease = (cur, tgt, rate) => (cur < 0 ? tgt : cur + (tgt - cur) * (1 - Math.exp(-dt * rate * fast)));
    this.snow = this.snow < 0 && E.snowing && E.snowT < 0.99 ? 0 : ease(this.snow, E.snowT, E.snowing ? 0.12 : 0.5);
    this.ice = ease(this.ice, E.iceT, 0.6);
    this.win = ease(this.win, E.lightOn ? 1 : 0, 1.4);
    this.rain = ease(this.rain, E.K.pi, 0.8);
    const gNow = ease(this.gloom, E.grey, 0.8);
    this.wetA = ease(this.wetA, E.wet, 0.4);
    this.aurA = ease(this.aurA, E.aur, 0.5);
    this.frost = ease(this.frost, E.frost, 0.25);
    this.dry = ease(this.dry, E.dry, 0.3);
    this.mist = ease(this.mist, E.mist, 0.35);
    this.rbow = ease(this.rbow, E.rainbow, 0.5);
    // Ohne Daten noch nichts überblenden: Sobald das Wetter da ist, stehen Grau, Schnee und Eis gleich richtig.
    // Nur frisch fallender Schnee legt sich sichtbar nach und nach über den Planeten.
    if (E.c) this.gloom = gNow; else { this.gloom = -1; this.snow = -1; this.ice = -1; this.frost = -1; this.dry = -1; this.mist = -1; }
    this.cl.forEach((c, i) => { c.v += ((i < E.n ? 1 : 0) - c.v) * (1 - Math.exp(-dt * 0.9 * fast)); });
    // Kamera: ziehen, nachschwingen, nach ein paar Sekunden zurück zur Hausansicht
    const still = reduceMotion;
    if (!this.drag) {
      this.yaw += this.vyaw * dt;
      this.vyaw *= Math.exp(-dt * 2.6);
      if (performance.now() - this.idle > 5000 && Math.abs(this.vyaw) < 0.08) {
        const home = Math.round(this.yaw / (Math.PI * 2)) * Math.PI * 2 + (still ? 0 : Math.sin(this.t * 0.11) * 0.13);
        const k = 1 - Math.exp(-dt * 0.9);
        this.yaw += (home - this.yaw) * k;
        this.pitch += (PN_PITCH - this.pitch) * k;
      }
    }
    const bob = still ? 0 : Math.sin(this.t * 0.55) * 0.03;
    // Im Spiegel darf der Planet größer sein, Sonne und Mond laufen dort auch mal knapp am Rand
    const fit = this.mode === 'mirror' || this.mode === 'night' ? 1.72 : this.mode === 'full' ? 1.86 : PN_FIT;
    const asp = W / H, fx = 2 * Math.atan(Math.tan(PN_FOV / 2) * asp), dist = fit / Math.sin(Math.min(PN_FOV, fx) / 2);
    const tgt = [0, bob, 0], eye = [Math.sin(this.yaw) * Math.cos(this.pitch) * dist, Math.sin(this.pitch) * dist + bob, Math.cos(this.yaw) * Math.cos(this.pitch) * dist];
    const V = pnM.look(eye, tgt, [0, 1, 0]), Pm = pnM.persp(PN_FOV, asp, dist - 2.6, dist + 2.6), VP = pnM.mul(Pm, V);
    this.VP = VP; this.eye = eye;
    // Licht
    const g = gNow, alt = E.alt;
    const dayF = pnSmooth(-7, 7, alt), sunF = pnSmooth(-3, 5, alt);
    const warm = alt < 5 ? [1, 0.56, 0.32] : alt < 18 ? pnV.mix([1, 0.56, 0.32], [1, 0.86, 0.68], (alt - 5) / 13) : pnV.mix([1, 0.86, 0.68], [1, 0.96, 0.9], Math.min(1, (alt - 18) / 20));
    // Bei dichter Decke kaum direktes Licht, dafür mehr diffuses Grau. Staub in der Luft macht die Sonne wärmer.
    const direct = 1 - 0.9 * pnSmooth(0.2, 0.75, g), sunC = pnV.mul(pnV.mix(warm, [1, 0.7, 0.45], E.dust * 0.5), 1.75 * sunF * direct * (1 - E.dust * 0.25));
    const moonUp = pnSmooth(-0.05, 0.12, E.moonD[1]), moonF = (1 - dayF) * moonUp;
    const moonC = pnV.mul([0.58, 0.64, 0.8], 0.64 * moonF * (0.35 + 0.65 * E.ill) * (1 - 0.8 * g));
    const dark = 1 - 0.38 * pnSmooth(0.7, 0.9, g);
    let [top, mid, low] = skyColors(alt, E.pm, Math.min(0.95, g * 1.05)).map(c => c.map(x => x * dark));
    // Dunst bei schlechter Luft, gelblich bei Saharastaub: der Himmel wird am Horizont milchig
    const hz = Math.max(E.haze * 0.55, E.dust * 0.85) * (0.4 + 0.6 * dayF);
    if (hz > 0.01) {
      const hc = (E.dust > E.haze ? [232, 172, 104] : [198, 194, 184]).map(x => x * (0.35 + 0.65 * dayF));
      low = mixRgb(low, hc, hz * 0.72); mid = mixRgb(mid, hc, hz * 0.46); top = mixRgb(top, hc, hz * 0.22);
    }
    const lt = pnLin(top), lm = pnLin(mid), ll = pnLin(low), gray = x => { const y = (x[0] + x[1] + x[2]) / 3; return pnV.mix(x, [y, y, y], 0.35); };
    const floor = pnV.mix([0.022, 0.03, 0.065], [0.03, 0.032, 0.04], g);
    const ska = pnV.add(pnV.mul(gray(pnV.mix(lt, lm, 0.6)), 0.62 + (1 - direct) * 0.45 * dayF), floor), gna = pnV.add(pnV.mul(gray(ll), 0.22), pnV.mul(floor, 0.6));
    // Nachts ein kühler Rand und ein schwaches Fülllicht von vorn oben (aus Sicht der Kamera), damit der Planet Form behält
    const nightF = (1 - dayF) * (1 - 0.45 * g);
    const rim = pnV.add(pnV.mul(ll, 0.7 * (0.35 + 0.65 * dayF) + 0.05), pnV.mul([0.11, 0.15, 0.34], nightF)), refl = pnV.add(pnV.mul(lm, 0.9), pnV.add([0.01, 0.015, 0.03], pnV.mul([0.02, 0.03, 0.06], nightF)));
    const vdir = pnV.norm(eye), rightV = pnV.norm(pnV.cross([0, 1, 0], vdir)), upV = pnV.cross(vdir, rightV);
    const l3d = pnV.norm(pnV.add(pnV.add(pnV.mul(vdir, 0.55), pnV.mul(upV, 0.75)), pnV.mul(rightV, -0.35))), l3c = pnV.mul([0.075, 0.1, 0.19], nightF);
    // Blitz
    if (E.K.storm) {
      if (!this.nextBolt) this.nextBolt = this.t + 1.5;
      if (this.t > this.nextBolt) this.nextBolt = this.t + (this.strike() ? 2.5 + Math.random() * 6 : 0.5);
    } else this.nextBolt = 0;
    let fl = 0;
    if (this.bolt) {
      const a = this.t - this.bolt.t0;
      fl = a < 0.07 ? 1 : a < 0.12 ? 0.25 : a < 0.24 ? 0.9 : Math.max(0, 0.9 - (a - 0.24) * 4);
      if (a > 0.5) this.bolt = null;
    }
    this.flash = fl;
    // Schattenlicht: die Sonne, nachts der Mond
    const useSun = sunF >= moonF, Ld = useSun ? E.sunD : E.moonD, shOn = (useSun ? sunF : moonF) > 0.03 && Ld[1] > -0.2;
    const Lup = Math.abs(Ld[1]) > 0.95 ? [1, 0, 0] : [0, 1, 0];
    const LVP = pnM.mul(pnM.ortho(1.62, 0.5, 6.5), pnM.look(pnV.mul(Ld, 3.4), [0, 0, 0], Lup));
    const clouds = this.cl.map(c => {
      if (c.v < 0.01) return null;
      const u = pnLL(c.lat, this.clLon(c)), fr = pnFrame(u, 1, null, c.rot), s = c.s * (0.35 + 0.65 * c.v) * (E.K.storm ? 1.3 : E.K.pk ? 1.18 : 1) * (1 + clamp01((E.cover - 60) / 40) * 0.22);
      return { M: pnM.frame(fr.x, fr.y, fr.z, pnV.mul(u, c.r - (1 - c.v) * 0.08), s), u, r: c.r, s, mesh: this.clouds[c.var], v: c.v };
    }).filter(Boolean);
    for (const c of clouds) if (c.v > 0.5) this.hits.push({ k: 'cloud', p: pnV.mul(c.u, c.r), r: 34 });
    const I = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    // Dinge, die sich bewegen oder nur manchmal da sind: Rotor, Auto, Flugzeug, Katze, Fahne
    const objs = [], night = 1 - dayF;
    if (this.obj) {
      // Windrad: dreht nach dem echten Wind, ab Sturm (über 90 km/h) steht es aus Sicherheitsgründen still
      if (S0.mill) {
        const tw = still ? 0.15 : E.wind > 90 ? 0 : 0.3 + E.wind * 0.075, m = S0.mill;
        this.rotW += (tw - this.rotW) * (1 - Math.exp(-dt * 0.8));
        this.rotA += this.rotW * dt;
        const ca = Math.cos(this.rotA), sa = Math.sin(this.rotA);
        objs.push({ mesh: this.obj.rotor, M: pnM.frame(pnV.add(pnV.mul(m.x, ca), pnV.mul(m.y, sa)), pnV.sub(pnV.mul(m.y, ca), pnV.mul(m.x, sa)), m.z, m.hub, m.s) });
        this.hits.push({ k: 'mill', p: m.hub, r: 30 });
        if (night > 0.4 && this.t % 2 < 0.35) this.pt(pnV.add(m.hub, pnV.mul(m.y, 0.016)), 0.04, 1, 0.12, 0.08, 1);
      }
      // Dein Auto: steht am Haus, fährt zur Pendelzeit los und ist während der Arbeit weg
      const R = this.world.R, C = E.car;
      if (C && C.st !== 'away' && R) {
        const vs = R.N / 40, tms = +now;
        let s = R.park, k = 1;
        if (C.st === 'drive') {
          s = C.dir === 'work' ? R.park + vs * (tms - C.a) / 1000 : R.park - vs * (C.b - tms) / 1000;
          if (C.dir === 'work') k = Math.min(1, (C.b - tms) / 4000);
        }
        const A = pnRoadAt(R, s), y = A.u, z = pnV.norm(pnV.sub(A.t, pnV.mul(y, pnV.dot(A.t, y)))), x = pnV.cross(y, z);
        const hex = accentBase(state.ui)[0];
        if (this.obj.carHex !== hex) { this.free(this.obj.car); this.obj.car = this.upload(pnBuildCar(hex)); this.obj.carHex = hex; }
        if (k > 0.02) {
          const p = C.st === 'drive' ? A.p : pnV.add(A.p, pnV.mul(x, -0.007)), sc = 1.9 * k;
          objs.push({ mesh: this.obj.car, M: pnM.frame(x, y, z, p, sc) });
          this.hits.push({ k: 'car', p: pnV.add(p, pnV.mul(y, 0.02)), r: 24, pri: -0.3 });
          if (C.st === 'drive' && (night > 0.35 || g > 0.7)) for (const sx of [-0.0075, 0.0075]) this.pt(pnV.add(p, pnV.add(pnV.add(pnV.mul(x, sx * sc), pnV.mul(y, 0.01 * sc)), pnV.mul(z, 0.028 * sc))), 0.04, 1, 0.93, 0.76, 0.95);
        }
      }
      // Flugzeug vor dem Urlaub, mit Kondensstreifen und nachts mit Positionslichtern
      if (E.plane) {
        const e1 = PN_PLANE_E1, e2 = pnV.cross(PN_PLANE_AX, e1), r = 1.34, th = this.t * 0.18 + 1.2;
        const pos = a => pnV.add(pnV.mul(e1, Math.cos(a) * r), pnV.mul(e2, Math.sin(a) * r));
        const p = pos(th), y = pnV.norm(p), z = pnV.norm(pnV.sub(pos(th + 0.01), p)), x = pnV.cross(y, z), sc = 1.25;
        objs.push({ mesh: this.obj.plane, M: pnM.frame(x, y, z, p, sc) });
        this.hits.push({ k: 'plane', p, r: 26, pri: -0.3 });
        const cA = (0.12 + 0.22 * dayF) * (1 - g * 0.6);
        for (let k = 1; k <= 26; k++) this.pt(pos(th - 0.02 - 0.018 * k), 0.016 + k * 0.0011, 1, 1, 1, cA * (1 - k / 27) ** 1.4);
        if (night > 0.3) {
          this.pt(pnV.add(p, pnV.mul(x, 0.038 * sc)), 0.03, 1, 0.15, 0.12, 1);
          this.pt(pnV.add(p, pnV.mul(x, -0.038 * sc)), 0.03, 0.2, 1, 0.35, 1);
          if (this.t % 1.3 < 0.09) this.pt(pnV.add(p, pnV.mul(z, -0.031 * sc)), 0.06, 1, 1, 1, 1);
        }
      }
    }
    if (this.world.cat && E.wet) objs.push({ mesh: this.world.cat, M: I });
    if (this.world.flag && E.flag) {
      objs.push({ mesh: this.world.flag, M: I, tint: pnLin(accentBase(state.ui)[0]) });
      this.hits.push({ k: 'flag', p: S0.flag, r: 22, pri: -0.2 });
    }
    this.hits.push({ k: 'house', p: S0.house, r: 40 });
    for (const p of S0.habit) this.hits.push({ k: 'tree', p, r: 16 });
    // Schneemann, solange Schnee liegt
    if (this.world.snowman && this.snow > 0.55 && E.snowLie > 0.3) { objs.push({ mesh: this.world.snowman, M: I }); this.hits.push({ k: 'snowman', p: S0.snowman, r: 22, pri: -0.2 }); }
    // Tiere, fallende Blätter, Regenbogen und Sturmschlieren (55-planet-tiere.js)
    pnLife(this, E, dt, now, objs, { dayF, night, g, alt, eye, sunC, moonC, ska, W, H });
    // 1. Schatten
    if (shOn) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.shFb);
      gl.viewport(0, 0, this.shs, this.shs);
      gl.clear(gl.DEPTH_BUFFER_BIT);
      gl.enable(gl.DEPTH_TEST); gl.disable(gl.BLEND); gl.disable(gl.CULL_FACE);
      gl.enable(gl.POLYGON_OFFSET_FILL); gl.polygonOffset(1.6, 3);
      const Q = this.P.dep;
      gl.useProgram(Q.p);
      gl.uniformMatrix4fv(Q.u.u_lvp, false, LVP);
      gl.uniform1f(Q.u.u_t, this.t); gl.uniform1f(Q.u.u_ws, E.ws); gl.uniform3fv(Q.u.u_wv, E.wv);
      gl.uniformMatrix4fv(Q.u.u_m, false, I);
      gl.bindVertexArray(this.world.mesh.vao);
      gl.drawArrays(gl.TRIANGLES, 0, this.world.mesh.n);
      for (const c of clouds) { gl.uniformMatrix4fv(Q.u.u_m, false, c.M); gl.bindVertexArray(c.mesh.vao); gl.drawArrays(gl.TRIANGLES, 0, c.mesh.n); }
      this.drawObjs(objs.filter(o => !o.ns), Q.u, false);
      gl.disable(gl.POLYGON_OFFSET_FILL);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }
    // 2. Himmel, Sterne und Sternschnuppen
    gl.viewport(0, 0, W, H);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND);
    // Im Spiegel und auf dem Nachttisch steht der Planet ohne Himmel auf Schwarz. Sterne gibt es dort keine,
    // sie hätten an den Kanten der Zeichenfläche eine sichtbare Grenze.
    const bgA = this.mode === 'mirror' || this.mode === 'night' ? 0 : 1;
    const starsF = bgA ? (1 - pnSmooth(-11, -4, alt)) * (1 - pnSmooth(0.2, 0.7, g)) : 0;
    const ma = new Float32Array(12), mb = new Float32Array(6);
    if (starsF > 0.2 && !still) {
      if (this.t > this.metNext) {
        const i = this.met.findIndex(m => !m);
        if (i >= 0) {
          const a = -Math.PI / 2 + (Math.random() < 0.5 ? -1 : 1) * (0.35 + Math.random() * 0.7), L = (0.16 + Math.random() * 0.2) * Math.min(W, H);
          this.met[i] = { x: W * (0.08 + Math.random() * 0.84), y: H * (0.74 + Math.random() * 0.23), dx: Math.cos(a) * L, dy: Math.sin(a) * L, t0: this.t, d: 0.45 + Math.random() * 0.5 };
        }
        this.metNext = this.t - Math.log(Math.random() || 0.5) / Math.max(1e-4, E.met);
      }
    } else if (this.t > this.metNext) this.metNext = this.t + 3;
    this.met.forEach((m, i) => {
      if (!m) return;
      const f = (this.t - m.t0) / m.d;
      if (f > 1) { this.met[i] = null; return; }
      ma.set([m.x, m.y, m.dx, m.dy], i * 4); mb.set([f, Math.sin(Math.PI * f) * starsF], i * 2);
    });
    {
      const B = this.P.bg, s = x => x.map(v => v / 255);
      gl.useProgram(B.p);
      gl.uniform3fv(B.u.u_top, s(top)); gl.uniform3fv(B.u.u_mid, s(mid)); gl.uniform3fv(B.u.u_low, s(low));
      gl.uniform1f(B.u.u_a, bgA);
      gl.uniform1f(B.u.u_stars, starsF);
      gl.uniform1f(B.u.u_t, this.t); gl.uniform1f(B.u.u_flash, fl * bgA); gl.uniform1f(B.u.u_cell, 11 * this.dpr);
      gl.uniform4fv(B.u.u_ma, ma); gl.uniform2fv(B.u.u_mb, mb);
      gl.bindVertexArray(this.quad);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
    // 3. Planet, Dinge und Wolken
    gl.enable(gl.DEPTH_TEST); gl.depthMask(true); gl.disable(gl.CULL_FACE);
    const U = this.P.lit.u;
    gl.useProgram(this.P.lit.p);
    gl.uniformMatrix4fv(U.u_vp, false, VP);
    gl.uniform3fv(U.u_cam, eye);
    gl.uniform3fv(U.u_l1d, E.sunD); gl.uniform3fv(U.u_l1c, sunC);
    gl.uniform3fv(U.u_l2d, E.moonD); gl.uniform3fv(U.u_l2c, moonC);
    gl.uniform3fv(U.u_l3d, l3d); gl.uniform3fv(U.u_l3c, l3c);
    const LK = S0.lake;
    if (LK) { gl.uniform3fv(U.u_lc, pnV.mul(PN_LAKE, PN_WL)); gl.uniform3fv(U.u_lx, LK.x); gl.uniform3fv(U.u_lz, LK.z); }
    gl.uniform1f(U.u_frost, Math.max(0, this.frost)); gl.uniform1f(U.u_dry, Math.max(0, this.dry));
    gl.uniform1f(U.u_rip, E.K.pk === 'rain' || E.K.pk === 'drizzle' ? Math.min(1, this.rain * 1.4) : 0);
    gl.uniform4fv(U.u_spl, this.life ? this.life.spl : new Float32Array(8));
    gl.uniform3fv(U.u_ska, ska); gl.uniform3fv(U.u_gna, gna);
    gl.uniform3fv(U.u_rim, rim); gl.uniform3fv(U.u_refl, refl);
    gl.uniform3fv(U.u_haze, pnV.add(pnV.mul(pnV.mix(lm, ll, 0.5), 0.9), [0.02, 0.02, 0.025]));
    gl.uniform1f(U.u_fog, E.K.fog ? 0.32 : g * 0.06 + hz * 0.22);
    gl.uniform1f(U.u_snow, Math.max(0, this.snow)); gl.uniform1f(U.u_ice, Math.max(0, this.ice)); gl.uniform1f(U.u_wet, this.wetA);
    gl.uniform1f(U.u_win, this.win); gl.uniform3fv(U.u_winp, S0.light); gl.uniform3fv(U.u_winc, [1, 0.66, 0.3]);
    gl.uniform1f(U.u_flash, fl); gl.uniform1f(U.u_t, this.t); gl.uniform1f(U.u_ws, E.ws); gl.uniform3fv(U.u_wv, E.wv);
    gl.uniform1f(U.u_exp, 0.95 * (0.75 + 0.25 * dark));
    gl.uniformMatrix4fv(U.u_lvp, false, LVP);
    gl.uniform1f(U.u_shon, shOn ? 1 : 0); gl.uniform1f(U.u_shl, useSun ? 1 : 2);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.shTex); gl.uniform1i(U.u_shm, 0);
    gl.uniformMatrix4fv(U.u_m, false, I);
    gl.uniform3fv(U.u_tint, [1, 1, 1]);
    gl.bindVertexArray(this.world.mesh.vao);
    gl.drawArrays(gl.TRIANGLES, 0, this.world.mesh.n);
    this.drawObjs(objs, U, true);
    const ct = E.K.storm ? [0.42, 0.44, 0.48] : E.K.pk || E.K.fog ? pnV.mix([0.84, 0.86, 0.88], [0.58, 0.6, 0.63], Math.min(1, E.K.pi + 0.3)) : pnV.mix([1, 1, 1], [0.78, 0.8, 0.83], clamp01((E.cover - 50) / 50));
    gl.uniform3fv(U.u_tint, pnV.mul(ct, 1 - 0.38 * g));
    for (const c of clouds) { gl.uniformMatrix4fv(U.u_m, false, c.M); gl.bindVertexArray(c.mesh.vao); gl.drawArrays(gl.TRIANGLES, 0, c.mesh.n); }
    // Regenbogen, Blätter und Blüten, Sturmschlieren
    pnLifeDraw(this, VP, V, Pm);
    // 4. Sonne, Mond und Fensterlicht als Leuchtpunkte
    gl.enable(gl.BLEND); gl.blendFuncSeparate(gl.ONE, gl.ONE, gl.ONE, gl.ONE); gl.depthMask(false);
    const S = this.P.spr;
    gl.useProgram(S.p);
    gl.uniformMatrix4fv(S.u.u_v, false, V); gl.uniformMatrix4fv(S.u.u_p, false, Pm);
    gl.bindVertexArray(this.quad);
    const spr = (k, c, size, col) => { gl.uniform1i(S.u.u_k, k); gl.uniform3fv(S.u.u_c, c); gl.uniform1f(S.u.u_s, size); gl.uniform4fv(S.u.u_col, col); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); };
    const sunVis = pnSmooth(-0.1, 0.06, E.sunD[1]);
    gl.blendFuncSeparate(gl.ONE, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    const sunA = sunVis * (1 - pnSmooth(0.3, 0.75, g) * 0.88) * (1 - pnSmooth(70, 100, E.cover) * 0.8);
    if (sunA > 0.01) {
      spr(1, pnV.mul(E.sunD, PN_SUN_R), 0.66, [...pnV.mix(pnV.mix([1, 0.55, 0.25], [1, 0.84, 0.45], pnSmooth(2, 25, alt)), [1, 0.62, 0.35], E.dust * 0.6), sunA]);
      this.hits.push({ k: 'sun', p: pnV.mul(E.sunD, PN_SUN_R), r: 36 });
    }
    const moonA = moonUp * (1 - dayF * 0.85) * (1 - pnSmooth(0.3, 0.75, g) * 0.92) * pnSmooth(0.015, 0.08, E.ill);
    if (moonA > 0.01) {
      gl.uniform1f(S.u.u_ph, Math.cos(E.ph * Math.PI * 2)); gl.uniform1f(S.u.u_wax, E.ph < 0.5 ? 1 : 0); gl.uniform1f(S.u.u_ill, E.ill);
      spr(2, pnV.mul(E.moonD, PN_SUN_R), 0.5, [0.75, 0.82, 1, moonA]);
      this.hits.push({ k: 'moon', p: pnV.mul(E.moonD, PN_SUN_R), r: 30 });
    }
    gl.blendFuncSeparate(gl.ONE, gl.ONE, gl.ONE, gl.ONE);
    if (this.win > 0.01) for (const w of S0.wins) spr(0, w, 0.07, [1, 0.72, 0.36, this.win * 0.85]);
    // Lichthof der Atmosphäre: ohne Tiefentest, damit der Rand des Planeten mitleuchtet
    gl.disable(gl.DEPTH_TEST);
    gl.uniform1f(S.u.u_r0, 1.0085);
    const halo = pnV.mix([0.35, 0.45, 0.85], pnV.mix(low.map(x => x / 255), [1, 1, 1], 0.25), dayF);
    spr(3, [0, 0, 0], 1.55, [...halo, (0.2 + 0.2 * dayF) * (bgA ? 1 : 0.85)]);
    gl.enable(gl.DEPTH_TEST);
    // 5. Rauch aus dem Schornstein und Nebelschwaden
    gl.blendFuncSeparate(gl.ONE, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    const amb = pnV.add(pnV.mul(ska, 0.7), pnV.mul(pnV.add(sunC, moonC), 0.35)), toS = x => x.map(v => Math.min(1, v) ** (1 / 2.2));
    if (E.smoke) {
      const up = pnV.norm(S0.chimney), wt = pnV.sub(E.wv, pnV.mul(up, pnV.dot(E.wv, up)));
      const sc = toS(pnV.add(pnV.mul(amb, 0.8), pnV.mul([0.16, 0.15, 0.15], 1 - dayF * 0.6)));
      for (let i = 0; i < 7; i++) {
        const f = (this.t * 0.16 + i / 7) % 1;
        const pos = pnV.add(S0.chimney, pnV.add(pnV.mul(up, f * 0.2), pnV.mul(wt, f * f * 0.22 + f * 0.03)));
        spr(4, pos, 0.016 + f * 0.055, [...sc, 0.55 * (1 - f) * pnSmooth(0, 0.12, f)]);
      }
    }
    // Nebel und Frühnebel: Schwaden, die tief über Wiese und See ziehen, bei Nebel dazu dicke Bänke weiter oben
    if (this.mist > 0.01) {
      const fc = toS(pnV.mul(pnV.add(amb, [0.05, 0.05, 0.06]), 1.1)), m = this.mist, mc = pnV.mix(fc, [0.92, 0.94, 0.97].map(x => x * (0.45 + 0.55 * dayF)), 0.4);
      for (let i = 0; i < 18; i++) {
        const la = [12, 30, 48, 24, 38, 4][i % 6] + Math.sin(i * 2.3) * 6, u = pnLL(la, i * 20 + this.t * (1.2 + (i % 3) * 0.5) + Math.sin(i) * 9);
        spr(4, pnV.mul(u, 1.05 + (i % 2) * 0.012), 0.26 + (i % 3) * 0.06, [...mc, 0.5 * m]);
      }
      if (m > 0.8) for (let i = 0; i < 9; i++) spr(4, pnV.mul(pnLL(10 + (i % 3) * 20, i * 40 + this.t * 2.2), 1.07), 0.42, [...fc, 0.32]);
    }
    // 6. Regen und Schnee
    if (this.rain > 0.01 && clouds.length) {
      const D2 = this.P.drop, snow = E.K.pk === 'snow', drizzle = E.K.pk === 'drizzle';
      gl.useProgram(D2.p);
      gl.uniformMatrix4fv(D2.u.u_vp, false, VP);
      const arr = new Float32Array(48);
      clouds.slice(0, 12).forEach((c, i) => { arr.set([...pnV.mul(c.u, c.r), 0.12 * c.s * c.v], i * 4); });
      gl.uniform4fv(D2.u.u_cl, arr);
      gl.uniform1i(D2.u.u_ncl, Math.min(12, clouds.length));
      gl.uniform1f(D2.u.u_t, this.t); gl.uniform1f(D2.u.u_mode, snow ? 1 : 0);
      gl.uniform1f(D2.u.u_len, drizzle ? 0.04 : 0.075); gl.uniform1f(D2.u.u_w, (snow ? 2.1 : drizzle ? 0.95 : 1.1) * this.dpr);
      gl.uniform1f(D2.u.u_spd, snow ? 0.22 : drizzle ? 0.9 : 1.5);
      gl.uniform3fv(D2.u.u_wv, E.wv);
      gl.uniform2fv(D2.u.u_px, [2 / W, 2 / H]);
      const dc = snow ? [0.95, 0.97, 1] : [0.72, 0.8, 0.95], lum = 0.62 + 0.38 * dayF;
      gl.uniform4fv(D2.u.u_col, [dc[0] * lum, dc[1] * lum, dc[2] * lum, snow ? 0.95 : drizzle ? 0.7 : 0.75]);
      gl.bindVertexArray(this.drops);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, Math.round(this.rain * (snow ? 700 : drizzle ? 1150 : 1400)));
      // Hagel: dicke weiße Körner, die schnell fallen
      if (E.hail && !snow) {
        gl.uniform1f(D2.u.u_mode, 2); gl.uniform1f(D2.u.u_spd, 1.25); gl.uniform1f(D2.u.u_w, 2.6 * this.dpr);
        gl.uniform4fv(D2.u.u_col, [0.95 * lum, 0.97 * lum, lum, 0.95]);
        gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, Math.round(this.rain * 260));
      }
    }
    // 7. Polarlicht über dem Nordpol des Planeten
    if (this.aurA > 0.01) {
      const Q = this.P.aur;
      gl.useProgram(Q.p);
      gl.blendFuncSeparate(gl.ONE, gl.ONE, gl.ONE, gl.ONE);
      gl.uniformMatrix4fv(Q.u.u_vp, false, VP);
      gl.uniform1f(Q.u.u_t, still ? 0 : this.t); gl.uniform1f(Q.u.u_a, this.aurA * 1.25);
      gl.bindVertexArray(this.aur);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, this.aurN);
      this.hits.push({ k: 'aurora', p: [0, 1.3, 0], r: 70 });
    }
    // 8. Leuchtpunkte
    this.lights(E, now, dayF, alt);
    if (this.ptsN) {
      const Q = this.P.pts;
      gl.useProgram(Q.p);
      gl.blendFuncSeparate(gl.ONE, gl.ONE, gl.ONE, gl.ONE);
      gl.uniformMatrix4fv(Q.u.u_v, false, V); gl.uniformMatrix4fv(Q.u.u_p, false, Pm);
      gl.bindVertexArray(this.pts);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.ptsBuf);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.ptsArr, 0, this.ptsN * 8);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, this.ptsN);
    }
    // 9. Blitz
    if (this.bolt && fl > 0.2) {
      const R = this.P.rib;
      gl.useProgram(R.p);
      gl.blendFuncSeparate(gl.ONE, gl.ONE, gl.ONE, gl.ONE);
      gl.uniformMatrix4fv(R.u.u_vp, false, VP);
      gl.uniform2fv(R.u.u_px, [2 / W, 2 / H]);
      gl.bindVertexArray(this.rib);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.ribBuf);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.bolt.buf);
      gl.uniform1f(R.u.u_w, 9 * this.dpr); gl.uniform4fv(R.u.u_col, [0.45, 0.55, 1, 0.4 * fl]);
      gl.drawArrays(gl.TRIANGLES, 0, this.bolt.n);
      gl.uniform1f(R.u.u_w, 2.3 * this.dpr); gl.uniform4fv(R.u.u_col, [0.95, 0.97, 1, fl]);
      gl.drawArrays(gl.TRIANGLES, 0, this.bolt.n);
    }
    gl.depthMask(true); gl.disable(gl.BLEND);
    gl.bindVertexArray(null);
  }
  /* Alles, was als Leuchtpunkt gezeichnet wird: Lichterkette, Kürbisse, Glühwürmchen, ISS, Feuerwerk */
  lights(E, now, dayF, alt) {
    const S0 = this.world.scene, t = this.t, still = reduceMotion, night = 1 - dayF;
    // Lichterkette: nachts hell, tagsüber nur ein Schimmer
    if (S0.xmas.length) {
      const a = 0.3 + 0.7 * night;
      S0.xmas.forEach((p, i) => { const c = PN_XMAS_COLS[i % PN_XMAS_COLS.length], tw = still ? 1 : 0.65 + 0.35 * Math.sin(t * 2.1 + i * 1.7); this.pt(p, 0.042, c[0], c[1], c[2], a * tw); });
      if (S0.star) this.pt(S0.star, 0.07 + (still ? 0 : Math.sin(t * 1.6) * 0.008), 1, 0.85, 0.4, 0.6 + 0.4 * night);
    }
    // Kürbisse glimmen, sobald im Haus Licht an ist
    if (this.win > 0.05) S0.pumpkins.forEach((p, i) => this.pt(p, 0.065, 1, 0.5, 0.12, this.win * (0.45 + (still ? 0 : 0.12 * Math.sin(t * 9 + i * 2) * Math.sin(t * 5.3 + i)))));
    // Glühwürmchen an warmen Sommerabenden: schweben über den Wiesen und blinken
    if (E.ffly) {
      const fa = pnSmooth(-1, -5, alt);
      for (const f of S0.ff) {
        const tt = still ? f.ph : t * f.sp + f.ph, fr = pnFrame(f.u, 1);
        const off = pnV.add(pnV.mul(fr.x, Math.sin(tt * 0.7) * 0.035), pnV.mul(fr.z, Math.cos(tt * 0.53 + f.s * 4) * 0.035));
        const p = pnV.mul(pnV.norm(pnV.add(f.u, off)), f.h + 0.03 + 0.025 * (0.5 + 0.5 * Math.sin(tt * 1.3)));
        const b = Math.max(0, Math.sin(tt * 2.2 + f.s * 9)) ** 5;
        this.pt(p, 0.044, 0.75, 1, 0.32, fa * (0.35 + 0.65 * b));
      }
    }
    // ISS: ein heller Punkt, der langsam über den Himmel zieht
    if (E.iss) {
      const p = pnV.mul(pnIssDir(E.iss.az, E.iss.el), 1.66);
      this.pt(p, 0.055, 1, 1, 0.95, 1);
      // Kurzer Schweif in die Richtung, aus der sie kommt
      const pr = pnIssAt(E.loc, +now - 25000);
      if (pr) { const q = pnV.mul(pnIssDir(pr.az, pr.el), 1.66); for (let k = 1; k <= 6; k++) this.pt(pnV.mix(p, q, k / 6), 0.034 - k * 0.003, 0.85, 0.9, 1, 0.45 * (1 - k / 7)); }
      this.hits.push({ k: 'iss', p, r: 22, pri: -0.4 });
    }
    // Feuerwerk an Silvester
    if (E.fw > 0 && !still && this.t > this.fwNext) { this.fwSpawn(); this.fwNext = this.t - Math.log(Math.random() || 0.5) / E.fw; }
    this.fw = this.fw.filter(b => this.t - b.t0 < 3.2);
    for (const b of this.fw) {
      const a = this.t - b.t0;
      if (a < 0.75) {
        const f = a / 0.75, q = 1 - (1 - f) * (1 - f);
        this.pt(pnV.mix(b.g, b.top, q), 0.032, 1, 0.85, 0.6, 1);
        this.pt(pnV.mix(b.g, b.top, Math.max(0, q - 0.06)), 0.024, 1, 0.65, 0.35, 0.5);
        continue;
      }
      const e = a - 0.75, k = Math.max(0, 1 - e / 2.3), dn = pnV.norm(b.top), rr = b.spd * (1 - Math.exp(-e * 2.4));
      if (e < 0.3) this.pt(b.top, 0.26, b.col[0], b.col[1], b.col[2], 0.6 * (1 - e / 0.3));
      b.dirs.forEach((d, i) => {
        const c = b.col2 && i % 2 ? b.col2 : b.col, p = pnV.sub(pnV.add(b.top, pnV.mul(d, rr)), pnV.mul(dn, 0.035 * e * e));
        this.pt(p, 0.034, c[0], c[1], c[2], k ** 1.3 * (0.75 + 0.25 * Math.sin(e * 40 + i)) * (e < 0.1 ? 1.5 : 1));
      });
    }
  }
  /* Eine Rakete: startet am Rand des Planeten (von der Kamera aus gesehen), damit sie vor dem Himmel aufgeht */
  fwSpawn() {
    const vd = pnV.norm(this.eye || [0, 0.35, 1]), right = pnV.norm(pnV.cross([0, 1, 0], vd)), upc = pnV.cross(vd, right);
    const ph = Math.PI * (0.12 + Math.random() * 0.76), side = pnV.add(pnV.mul(right, Math.cos(ph)), pnV.mul(upc, Math.sin(ph)));
    const base = pnV.norm(pnV.add(pnV.mul(vd, 0.25), side)), rnd = () => Math.random() - 0.5;
    const top = pnV.mul(pnV.norm(pnV.add(base, [rnd() * 0.2, 0.08, rnd() * 0.2])), 1.48 + Math.random() * 0.28);
    const col = PN_FW_COLS[Math.floor(Math.random() * PN_FW_COLS.length)], n = 34 + Math.floor(Math.random() * 18);
    this.fw.push({ t0: this.t, g: pnV.mul(base, 1.03), top, col, col2: Math.random() < 0.35 ? PN_FW_COLS[Math.floor(Math.random() * PN_FW_COLS.length)] : null, dirs: Array.from({ length: n }, () => pnV.norm([rnd(), rnd(), rnd()])), spd: 0.22 + Math.random() * 0.12 });
  }
  /* Wolken ziehen mit dem Wind um den Planeten */
  clLon(c) { const E = this.env; return c.lon + this.t * c.spd * (1.2 + E.ws * 9) * (E.wv[0] > 0 ? -1 : 1) * 0.6; }
  /* Ein Blitz aus einer Wolke vorn zum Boden, mit Zacken und einem Seitenast */
  strike() {
    const vis = this.cl.filter(c => c.v > 0.5);
    if (!vis.length) return false;
    // Am schönsten von der Seite: eine Wolke nahe am Rand des Planeten, nicht direkt vor der Kamera
    const vd = [Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), Math.cos(this.yaw) * Math.cos(this.pitch)];
    const score = u => -Math.abs(pnV.dot(u, vd) - 0.2) + Math.random() * 0.35;
    const best = vis.map(c => { const u = pnLL(c.lat, this.clLon(c)); return { c, u, k: score(u) }; }).sort((a, b) => b.k - a.k)[0];
    const c = best.c, u = best.u, fr = pnFrame(u, 1);
    const end = pnV.norm(pnV.add(u, pnV.add(pnV.mul(fr.x, (Math.random() - 0.5) * 0.12), pnV.mul(fr.z, (Math.random() - 0.5) * 0.12))));
    const pts = [], n = 8, r0 = c.r - 0.03, r1 = pnH(end, this.world && this.world.R);
    for (let i = 0; i <= n; i++) {
      const f = i / n, j = i && i < n ? (Math.random() - 0.5) * 0.05 * (1 - f * 0.4) : 0, k = i && i < n ? (Math.random() - 0.5) * 0.05 : 0;
      pts.push(pnV.mul(pnV.norm(pnV.add(pnV.mix(u, end, f), pnV.add(pnV.mul(fr.x, j), pnV.mul(fr.z, k)))), r0 + (r1 - r0) * f));
    }
    const segs = [];
    for (let i = 0; i < n; i++) segs.push([pts[i], pts[i + 1]]);
    // Ast
    const b0 = pts[3];
    let prev = b0;
    for (let i = 1; i <= 3; i++) { const q = pnV.add(b0, pnV.add(pnV.mul(fr.x, 0.03 * i), pnV.mul(pnV.norm(b0), -0.04 * i))); segs.push([prev, q]); prev = q; }
    const buf = new Float32Array(segs.length * 6 * 8);
    let o = 0;
    for (const [a, b] of segs) for (const [s, e] of [[-1, 0], [1, 0], [1, 1], [-1, 0], [1, 1], [-1, 1]]) { buf.set([...a, ...b, s, e], o); o += 8; }
    this.bolt = { t0: this.t, buf, n: segs.length * 6 };
    pnSndThunder(this);
    return true;
  }
}

/* Daten für ein Widget: wie beim Wetter oder ein eigener Ort */
const PN_HOWS = { wx: 'Wie beim Wetter', home: 'Zuhause', work: 'Arbeit', fixed: 'Eigener Ort' };
function pnPlace(cfg) {
  const P = cfg.place || { how: 'wx' };
  if (P.how === 'home' || P.how === 'work') {
    const C = state.commute[P.how];
    if (C && Number.isFinite(C.lat) && Number.isFinite(C.lon)) return { how: P.how, lat: C.lat, lon: C.lon, name: C.label || (P.how === 'home' ? 'Zuhause' : 'Arbeit') };
    return { how: 'wx' };
  }
  if (P.how === 'fixed' && Number.isFinite(P.lat)) return P;
  return { how: 'wx' };
}
function pnData(id) {
  const w = state.widgets[id];
  if (!w) return null;
  const P = pnPlace(w.cfg);
  if (P.how === 'wx') return wx.data && wx.data.current && wx.loc ? { c: wx.data.current, loc: wx.loc, name: wx.loc.name, at: wx.at } : null;
  return pnFixedData(P);
}
/* Wetter für einen festen Ort, alle zehn Minuten neu */
function pnFixedData(P) {
  const key = `${(+P.lat).toFixed(3)}|${(+P.lon).toFixed(3)}`, e = pn.wx.get(key);
  if (!e || (!e.busy && Date.now() - e.at > 10 * 6e4 && Date.now() - (e.tried || 0) > 6e4)) pnFetch(P, key);
  return e && e.c ? { c: e.c, loc: P, name: P.name, at: e.at } : null;
}
/* Eine Zeichenfläche mit festem Ort (Urlaubsplanet) nimmt ihren Ort, alle anderen den aus dem Widget */
const pnDataOf = I => (I.opts.place ? pnFixedData(I.opts.place) : pnData(I.id));
async function pnFetch(P, key) {
  const e = pn.wx.get(key) || { at: 0 };
  e.busy = true; e.tried = Date.now();
  pn.wx.set(key, e);
  try {
    const j = await getJson(`https://api.open-meteo.com/v1/forecast?latitude=${(+P.lat).toFixed(4)}&longitude=${(+P.lon).toFixed(4)}&current=temperature_2m,relative_humidity_2m,precipitation,weather_code,cloud_cover,wind_speed_10m,wind_direction_10m,wind_gusts_10m,snow_depth&timezone=auto&wind_speed_unit=kmh`);
    if (j && j.current) { e.c = j.current; e.at = j.cachedAt || Date.now(); }
  } catch { /* nächster Versuch in einer Minute */ }
  e.busy = false;
  for (const v of viewsOf('planet')) renderPlanet(v);
  renderMirror();
  pnxDirty();
}

/* Zeichnen nur, solange etwas zu sehen ist. Ist das Vollbild offen, ruhen die anderen Planeten. */
function pnLoop(ts) {
  pn.raf = 0;
  if (document.hidden) return;
  let any = false;
  for (const I of pn.inst.values()) {
    if (!I.vis || !I.ok) continue;
    if (pnFs.open && I !== pnFs.I && I !== pnFs.trip) continue;
    any = true;
    if (ts - I.last >= I.minDt) {
      try { I.frame(ts); } catch (e) { console.warn('Wetterplanet:', e); I.fail('Beim Zeichnen ist etwas schiefgegangen.'); }
    }
  }
  if (any) pn.raf = requestAnimationFrame(pnLoop);
}
function pnWake() { if (!pn.raf && !document.hidden) pn.raf = requestAnimationFrame(pnLoop); }
pn.io = typeof IntersectionObserver === 'function' ? new IntersectionObserver(list => {
  for (const e of list) for (const I of pn.inst.values()) if (I.cv === e.target) { I.vis = e.isIntersecting; if (I.vis) { I.sized = false; I.lastTs = 0; } }
  pnWake();
}, { rootMargin: '80px' }) : null;
document.addEventListener('visibilitychange', () => { for (const I of pn.inst.values()) I.lastTs = 0; pnWake(); });
function pnMake(key, id, host, mode, opts) {
  let I = pn.inst.get(key);
  if (I && I.id !== id) { I.destroy(); I = null; }
  if (!I) {
    I = new PnView(id, host, mode, opts);
    I.key = key;
    pn.inst.set(key, I);
    if (!pn.io) I.vis = true;
  } else if (I.cv.parentNode !== host) host.appendChild(I.cv);
  pnWake();
  return I;
}

/* Karte: Temperatur, Wetter und Ort unten auf dem Bild */
function pnCaption(id) {
  const D = pnData(id);
  if (!D) return null;
  const c = D.c, w = WMO[c.weather_code] || ['', ''];
  // Echtes Minuszeichen, der Bindestrich steht in großer Schrift zu weit weg
  return { temp: Number.isFinite(c.temperature_2m) ? `${Math.round(c.temperature_2m)}°`.replace('-', '\u2212') : '', desc: w[0], place: D.name || '' };
}
function renderPlanet(v) {
  const cap = pnCaption(v.id), I = pn.inst.get(v.id);
  v.q('[data-r="temp"]').textContent = cap ? cap.temp : '';
  v.q('[data-r="desc"]').textContent = cap ? cap.desc : 'Wetter wird geladen';
  v.q('[data-r="place"]').textContent = cap ? cap.place : '';
  // Schrift unten hell oder dunkel, je nach Himmel am Horizont
  const D = pnData(v.id), loc = D ? D.loc : skyLoc(), now = new Date(), alt = sunAlt(now, +loc.lat, +loc.lon);
  const g = D ? pnWeatherKind(D.c.weather_code).grey : 0.2, low = skyColors(alt, now.getHours() >= 12, g)[2];
  v.q('[data-r="stage"]').dataset.ink = lumOf(low) > 0.42 ? 'dark' : 'light';
  if (I) I.cv.setAttribute('aria-label', cap ? `Wetterplanet${cap.place ? ` für ${cap.place}` : ''}: ${cap.temp.replace('°', ' Grad').replace('−', 'minus ')}, ${cap.desc}. Zum Drehen ziehen, antippen für eine Runde. Mehr im Vollbild über den Knopf oben, was er alles zeigt, über den Knopf mit dem i.` : 'Wetterplanet, das Wetter wird geladen');
}
/* Antippen in der Karte: das Auto führt zum Pendeln, das Flugzeug zum Urlaub, Haus und Fähnchen bei Terminen zum Kalender.
 * Alles andere dreht den Planeten einmal herum. */
function pnCardPick(id) {
  return hit => {
    const I = pn.inst.get(id), E = I && I.env;
    if (!hit || !E) return false;
    const go = hit.k === 'car' ? 'commute' : hit.k === 'plane' ? 'vacation' : (hit.k === 'flag' || hit.k === 'house') && E.flag ? 'cal' : '';
    if (!go || !pagesUsing(go).length) return false;
    nwJump(go);
    return true;
  };
}
/* MirrorOS: der Planet ohne Hintergrund, die Zeichenfläche wandert beim Neuzeichnen einfach in den neuen Platzhalter */
function pnMosHtml(id, pv) {
  const cap = pnCaption(id);
  return `<div class="m-pl" data-pl="${esc(id)}" data-pv="${pv ? 1 : 0}"></div>${cap ? `<p class="m-pl-cap"><b>${esc(cap.temp)}</b> ${esc(cap.desc)}</p>` : ''}`;
}
function pnMosAttach(root, pv) {
  const pre = pv ? 'mp:' : 'm:', seen = new Set();
  for (const slot of root.querySelectorAll('.m-pl[data-pl]')) {
    const id = slot.dataset.pl;
    if (!state.widgets[id]) continue;
    seen.add(pre + id);
    pnMake(pre + id, id, slot, 'mirror');
  }
  for (const [k, I] of [...pn.inst]) if (k.startsWith(pre) && !seen.has(k)) I.destroy();
}
/* Neu in 3.12: den Planeten neben das Wetter legen. Mit full geht danach gleich das Vollbild auf (Neuigkeit in 3.13). */
function pnShow(full) {
  let id = widgetsOf('planet').map(([i]) => i).find(i => pagesUsing(i).length);
  if (!id) {
    id = widgetsOf('planet').map(([i]) => i)[0] || newWidget('planet', {});
    const p = pagesUsing('weather')[0] || curPage(), i = p.items.findIndex(x => x.w === 'weather');
    p.items.splice(i >= 0 ? i + 1 : p.items.length, 0, { w: id, s: 1 });
    commit();
    layoutNow();
    toast(`Der Wetterplanet liegt jetzt auf „${p.name}“.`);
  }
  setTimeout(() => (full ? pnFsOpen(id) : nwJump(id)), 60);
}

function pnSetInfo(box) {
  const P = box._place, el = box.querySelector('[data-s="info"]');
  const C = h => state.commute[h] && Number.isFinite(state.commute[h].lat);
  for (const b of box.querySelectorAll('[data-how]')) {
    b.setAttribute('aria-pressed', String(b.dataset.how === (P.how || 'wx')));
    if (b.dataset.how === 'home' || b.dataset.how === 'work') b.disabled = !C(b.dataset.how);
  }
  el.innerHTML = P.how === 'fixed' ? `Gewählt: <b>${esc(P.name)}</b>` : P.how === 'home' || P.how === 'work' ? `Dein ${P.how === 'home' ? 'Zuhause' : 'Arbeitsort'} aus dem Pendeln.` : 'Derselbe Ort wie im Wetter-Widget, also dein Standort oder dein fester Ort.';
}
defineWidget('planet', {
  mount(v) {
    v.q('[data-r="set"]').addEventListener('click', () => openWidgetDialog(v.id));
    v.q('[data-r="full"]').addEventListener('click', () => pnFsOpen(v.id));
    v.q('[data-r="legend"]').addEventListener('click', e => pnLegOpen(v.q('[data-r="stage"]'), pn.inst.get(v.id), e.currentTarget));
    const I = pnMake(v.id, v.id, v.q('[data-r="stage"]'), 'card');
    I.onPick = pnCardPick(v.id);
  },
  unmount(v) { if (pnFs.open && pnFs.id === v.id) pnFsClose(); const I = pn.inst.get(v.id); if (pnLeg.V && pnLeg.V === I) pnLegClose(); if (I) I.destroy(); },
  render: renderPlanet,
  settings: {
    render(box, w) {
      box._place = w.cfg.place ? { ...w.cfg.place } : { how: 'wx' };
      box._fixed = box._place.how === 'fixed' ? box._place : null;
      const homeOff = !(state.commute.home && Number.isFinite(state.commute.home.lat)), workOff = !(state.commute.work && Number.isFinite(state.commute.work.lat));
      box.innerHTML = `<div class="field"><span class="lbl">Wetter von</span><div class="seg pn-how" role="group" aria-label="Ort">${Object.entries(PN_HOWS).map(([k, n]) => `<button type="button" data-how="${k}">${esc(n)}</button>`).join('')}</div>
        <p class="hint" data-s="info"></p></div>
        <div class="field pn-find"><label class="lbl" for="pn-q">Eigenen Ort suchen</label><div class="dp-search"><input id="pn-q" data-s="q" type="search" maxlength="60" autocomplete="off" placeholder="z. B. Lübeck"><button type="button" class="btn-ghost" data-s="go">Suchen</button></div><div class="pn-hits" data-s="hits"></div></div>
        <p class="hint">${homeOff || workOff ? 'Zuhause und Arbeit gehen, sobald deine Strecke im Pendeln-Widget eingetragen ist. ' : ''}Antippen dreht den Planeten einmal herum, ziehen dreht ihn frei. Was er alles zeigen kann, steht im Widget unter dem i.</p>`;
      pnSetInfo(box);
      box.querySelector('.pn-how').addEventListener('click', e => {
        const b = e.target.closest('[data-how]');
        if (!b || b.disabled) return;
        if (b.dataset.how === 'fixed') {
          // Ein schon gesuchter Ort kommt zurück, sonst erst suchen
          if (!box._fixed) { box.querySelector('[data-s="q"]').focus(); return; }
          box._place = box._fixed;
        } else box._place = { how: b.dataset.how };
        pnSetInfo(box);
      });
      const search = async () => {
        const q = box.querySelector('[data-s="q"]').value.trim(), hits = box.querySelector('[data-s="hits"]');
        hits.textContent = '';
        if (q.length < 2) { hits.innerHTML = '<p class="hint">Gib mindestens zwei Buchstaben ein.</p>'; return; }
        try {
          const j = await getJson(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=6&language=de&format=json`);
          const list = (j && j.results) || [];
          if (!list.length) { hits.innerHTML = `<p class="hint">Kein Ort namens „${esc(q)}“ gefunden.</p>`; return; }
          for (const r of list) {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'btn-ghost';
            b.textContent = [r.name, r.admin1, r.country_code].filter(Boolean).join(', ');
            b.addEventListener('click', () => { box._place = box._fixed = { how: 'fixed', name: r.name, lat: r.latitude, lon: r.longitude }; for (const x of hits.children) x.classList.toggle('on', x === b); pnSetInfo(box); });
            hits.appendChild(b);
          }
        } catch { hits.innerHTML = '<p class="hint">Ortssuche gerade nicht erreichbar.</p>'; }
      };
      box.querySelector('[data-s="go"]').addEventListener('click', search);
      box.querySelector('[data-s="q"]').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); search(); } });
    },
    save(box, w) {
      w.cfg.place = box._place.how === 'wx' ? null : box._place;
      for (const I of pn.inst.values()) if (I.id === wd.id) I.envAt = 0;
      return null;
    }
  }
});
