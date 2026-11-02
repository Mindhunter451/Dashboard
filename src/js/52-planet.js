/* Wetterplanet: eine kleine Low-Poly-Welt mit Häuschen, See und Bäumen, die dein echtes Wetter nachspielt.
 * Sonne und Mond laufen nach der echten Uhrzeit über den Planeten (Auf- und Untergang aus 40-himmel.js), der Mond mit
 * seiner echten Phase. Nachts kommen Sterne raus und im Häuschen geht das Licht an, an trüben Tagen auch schon tagsüber.
 * Wolken nach Bedeckung, Niesel, Regen, Schnee (der Planet wird weiß und bleibt es, solange Schnee liegt), Gewitter mit
 * Blitzen, Nebel, Wind in den Bäumen, Rauch aus dem Schornstein, wenn es kalt ist, Eis auf dem See bei Frost und
 * Laubbäume, die mit den Jahreszeiten die Farbe wechseln.
 * Gezeichnet mit WebGL2 ohne Fremd-Bibliothek: flach schattierte Dreiecke, Schatten über eine Shadow Map, Himmel, Sterne,
 * Regen und Schnee in eigenen Shadern. Gezeichnet wird nur, was gerade zu sehen ist, im Spiegel mit 30 Bildern pro Sekunde.
 * Daten: wie beim Wetter (wx.data) oder pro Widget ein eigener Ort über Open-Meteo. */
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
  tri(a, b, c, col, at, inside, sw) {
    let n = pnV.norm(pnV.cross(pnV.sub(b, a), pnV.sub(c, a)));
    if (inside) {
      const m = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3];
      if (pnV.dot(n, pnV.sub(m, inside)) < 0) { n = pnV.mul(n, -1); [b, c] = [c, b]; sw = sw && [sw[0], sw[2], sw[1]]; }
    }
    const r = Math.random();
    [a, b, c].forEach((v, i) => { this.p.push(...v); this.n.push(...n); this.c.push(...col); this.a.push(at[0], sw ? sw[i] : at[1], at[2], at[3] ?? r); });
  }
  get count() { return this.p.length / 3; }
}
/* Teile eines Objekts in eigenen Koordinaten (y nach oben, z nach vorn), später auf den Planeten gesetzt */
class PnPart {
  constructor() { this.t = []; }
  tri(a, b, c, col, s = 1, k = 0, inside = null) { this.t.push({ p: [a, b, c], col, s, k, inside }); }
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
  /* Klumpen aus einem Ikosaeder, etwas verbeult: Baumkronen, Büsche, Steine, Wolken */
  blob(cx, cy, cz, r, sy, cols, s, rng, sub = 1, flatY = null, k = 0) {
    const { V, F } = pnIco(sub), jit = V.map(() => 1 + (rng() - 0.5) * 0.22);
    const P = V.map((v, i) => { let y = cy + v[1] * r * sy * jit[i]; if (flatY !== null) y = Math.max(y, flatY); return [cx + v[0] * r * jit[i], y, cz + v[2] * r * jit[i]]; });
    const m = [cx, cy, cz];
    for (const [a, b, c] of F) this.tri(P[a], P[b], P[c], cols[Math.floor(rng() * cols.length)], s, k, m);
  }
}
/* Ein Teil auf den Planeten setzen. fr: { x, y, z, o } Achsen und Ursprung, sh: Höhe fürs Wiegen (0 = steht fest) */
function pnPut(M, part, fr, sh = 0) {
  const T = v => [fr.o[0] + fr.x[0] * v[0] + fr.y[0] * v[1] + fr.z[0] * v[2], fr.o[1] + fr.x[1] * v[0] + fr.y[1] * v[1] + fr.z[1] * v[2], fr.o[2] + fr.x[2] * v[0] + fr.y[2] * v[1] + fr.z[2] * v[2]];
  for (const t of part.t) {
    const sw = sh ? t.p.map(v => Math.min(1, Math.max(0, v[1] / sh)) ** 1.6) : null;
    M.tri(T(t.p[0]), T(t.p[1]), T(t.p[2]), t.col, [t.s, 0, t.k], t.inside ? T(t.inside) : null, sw);
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
function pnH(u) {
  let h = 1 + (pnFbm(u) - 0.5) * 0.11;
  const dh = pnAng(u, PN_HOUSE), dl = pnAng(u, PN_LAKE);
  h = h + (1.012 - h) * (1 - pnSmooth(0.24, 0.42, dh));
  h = h + (1.006 - h) * (1 - pnSmooth(PN_LR, PN_LR + 0.2, dl));
  if (dl < PN_LR) h -= 0.055 * pnSmooth(PN_LR, PN_LR * 0.35, dl);
  return h;
}
/* Jahreszeit für die Bäume, auf der Südhalbkugel ein halbes Jahr versetzt. bare: Anteil kahler Laubbäume */
function pnSeason(d, lat) {
  let n = Math.floor((d - new Date(d.getFullYear(), 0, 1)) / DAY);
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
  stone: '#A9A196', wood: '#9A6B43', water: '#2E86B8', cloud: ['#F7F9FB', '#EEF2F6', '#E6EBF0']
};

function pnBuildWorld(seed, season) {
  const M = new PnMesh(), rng = pnRng(seed), L = c => pnLin(c);
  const grass = hex2rgb(PN_COL.grass[season.k]);
  // Planet
  const { V, F } = pnIco(3), H = V.map(pnH), P = V.map((v, i) => pnV.mul(v, H[i]));
  for (const [a, b, c] of F) {
    const m = pnV.norm(pnV.add(pnV.add(V[a], V[b]), V[c])), h = (H[a] + H[b] + H[c]) / 3, dl = pnAng(m, PN_LAKE);
    const n = pnV.norm(pnV.cross(pnV.sub(P[b], P[a]), pnV.sub(P[c], P[a]))), slope = Math.abs(pnV.dot(n, m));
    let col, s = 1;
    if (h < PN_WL + 0.001 && dl < PN_LR + 0.05) { col = L(PN_COL.bed); s = 0.7; }
    else if (dl < PN_LR + 0.03 && h < 1.009) col = L(PN_COL.sand);
    else if (slope < 0.9 && h > 1.02) col = L(PN_COL.rock[Math.floor(rng() * 3)]);
    else {
      const j = 0.9 + rng() * 0.18, hue = (rng() - 0.5) * 14, up = Math.max(-0.12, (h - 1) * 2.4);
      col = L(grass.map((x, i) => x * (j + up) + (i === 0 ? hue : i === 2 ? -hue * 0.5 : 0)).map(x => Math.max(0, Math.min(255, x))));
    }
    M.tri(P[a], P[b], P[c], col, [s, 0, 0], [0, 0, 0]);
  }
  // See: Kappe aus Dreiecken knapp unter dem Ufer
  {
    const fr = pnFrame(PN_LAKE, 1, [0, 1, 0]), rings = 4, seg = 14, R = PN_LR + 0.06, pts = [];
    const at = (r, a) => pnV.mul(pnV.norm(pnV.add(fr.y, pnV.add(pnV.mul(fr.x, Math.cos(a) * r), pnV.mul(fr.z, Math.sin(a) * r)))), PN_WL);
    for (let i = 0; i <= rings; i++) pts.push(Array.from({ length: seg }, (_, k) => at(R * i / rings, k / seg * Math.PI * 2)));
    const wc = L(PN_COL.water);
    for (let i = 0; i < rings; i++) for (let k = 0; k < seg; k++) {
      const k2 = (k + 1) % seg;
      M.tri(pts[i][k], pts[i + 1][k], pts[i + 1][k2], wc, [0, 0, 2], [0, 0, 0]);
      if (i) M.tri(pts[i][k], pts[i + 1][k2], pts[i][k2], wc, [0, 0, 2], [0, 0, 0]);
    }
  }
  // Häuschen aus Backstein mit dunklem Dach, die Front schaut zum See
  const toLake = pnV.sub(PN_LAKE, PN_HOUSE), hf = pnFrame(PN_HOUSE, pnH(PN_HOUSE) - 0.004, pnV.add(pnV.mul(toLake, 0.35), [0, -0.2, 1]), 0, PN_HS);
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
    pnPut(M, T, hf);
  }
  const housePt = (x, y, z) => pnV.add(hf.o, pnV.add(pnV.add(pnV.mul(hf.x, x), pnV.mul(hf.y, y)), pnV.mul(hf.z, z)));
  const scene = {
    chimney: housePt(0.06, 0.115 + 0.085 + 0.045, -0.026),
    wins: [[-0.064, 0.05, 0.095], [0.064, 0.05, 0.095], [0.115, 0.05, 0], [-0.115, 0.05, 0], [0, 0.05, -0.095]].map(([x, y, z]) => housePt(x, y, z)),
    light: housePt(0, 0.06, 0.2)
  };
  // Trittsteine zum See und ein kleiner Steg
  const lakeEdge = pnV.norm(pnV.add(PN_LAKE, pnV.mul(pnV.norm(pnV.sub(pnV.add(PN_HOUSE, pnV.mul(hf.z, 0.25)), PN_LAKE)), PN_LR * 0.95)));
  const doorDir = pnV.norm(pnV.add(PN_HOUSE, pnV.mul(hf.z, 0.17)));
  const SS = 1.35;
  for (let i = 0; i < 4; i++) {
    const u = pnV.norm(pnV.mix(doorDir, lakeEdge, 0.08 + i * 0.24)), T = new PnPart();
    T.cone(0, 0, 0.026, 0.024, -0.01, 0.007, 6, L(PN_COL.stone), 1, rng() * 3);
    pnPut(M, T, pnFrame(u, pnH(u), null, 0, SS));
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
  // Bäume: Kiefern bleiben grün, Laubbäume wechseln mit der Jahreszeit
  const trees = [], spots = [];
  const okSpot = (u, gap) => pnAng(u, PN_HOUSE) > 0.44 && pnAng(u, PN_LAKE) > PN_LR + 0.14 && pnAng(u, doorDir) > 0.26 && spots.every(s => pnAng(u, s) > gap);
  // Ein paar feste Plätze rund ums Haus für ein schönes Bild, dann zufällig verteilt
  for (const [la, lo, kind] of [[66, -66, 'pine'], [34, -55, 'leaf'], [70, 14, 'leaf'], [48, 78, 'pine'], [2, -14, 'leaf'], [0, 62, 'pine'], [58, 140, 'pine'], [40, -112, 'leaf']]) {
    const u = pnV.norm(pnLL(la + (rng() - 0.5) * 4, lo + (rng() - 0.5) * 6));
    spots.push(u); trees.push([u, kind]);
  }
  for (let n = 0, tries = 0; n < 18 && tries < 900; tries++) {
    const z = rng() * 2 - 1, a = rng() * Math.PI * 2, r = Math.sqrt(1 - z * z), u = [r * Math.cos(a), z, r * Math.sin(a)];
    if (!okSpot(u, 0.34)) continue;
    spots.push(u); trees.push([u, rng() < 0.45 ? 'pine' : 'leaf']); n++;
  }
  const leaves = PN_COL.leaf[season.k].map(L), pines = PN_COL.pine.map(L), trunk = L(PN_COL.trunk);
  for (const [u, kind] of trees) {
    const T = new PnPart(), sc = 0.85 + rng() * 0.4, rot = rng() * 6.3;
    let hgt;
    if (kind === 'pine') {
      hgt = 0.27 * sc;
      T.cone(0, 0, 0.014 * sc, 0.011 * sc, -0.02, 0.05 * sc, 5, trunk, 0, rot);
      const layers = [[0.085, 0.04, 0.15], [0.068, 0.1, 0.2], [0.048, 0.155, 0.27]];
      layers.forEach(([r, y0, y1], i) => T.cone(0, 0, r * sc, 0, y0 * sc, y1 * sc, 7, pines[(i + Math.floor(rng() * 3)) % 3], 0.85, rot + i * 0.4, rng));
    } else {
      const bare = rng() < season.bare;
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
        const cols = season.k === 'autumn' ? [leaves[Math.floor(rng() * leaves.length)], leaves[Math.floor(rng() * leaves.length)]] : leaves.slice(0, 3);
        T.blob(0, 0.15 * sc, 0, 0.075 * sc, 0.92, cols, 0.7, rng, 1);
        if (rng() < 0.6) T.blob(0.04 * sc, 0.12 * sc, 0.025 * sc, 0.045 * sc, 0.9, cols, 0.7, rng, 0);
        if (season.k === 'spring' && rng() < 0.35) T.blob(-0.03 * sc, 0.19 * sc, 0.02 * sc, 0.03 * sc, 0.9, [leaves[3]], 0.7, rng, 0);
      }
    }
    pnPut(M, T, pnFrame(u, pnH(u) - 0.008, null, rot, PN_TS), hgt);
  }
  // Büsche ums Haus und Steine
  for (const [x, z] of [[-0.15, 0.065], [0.15, 0.07], [-0.135, -0.1], [0.145, -0.095]]) {
    const u = pnV.norm(housePt(x, 0, z)), T = new PnPart();
    T.blob(0, 0.012, 0, 0.034 + rng() * 0.01, 0.75, season.k === 'winter' ? [L('#6E7F52'), L('#5F7047')] : season.k === 'autumn' ? [L('#7E8F3C'), L('#A3772E')] : [L('#4F8F3A'), L('#5FA043')], 0.8, rng, 0, -0.01);
    pnPut(M, T, pnFrame(u, pnH(u) - 0.004, null, 0, 1.4), 0.06);
  }
  for (let n = 0, tries = 0; n < 9 && tries < 500; tries++) {
    const z = rng() * 2 - 1, a = rng() * Math.PI * 2, r = Math.sqrt(1 - z * z), u = [r * Math.cos(a), z, r * Math.sin(a)];
    if (!okSpot(u, 0.2)) continue;
    spots.push(u); n++;
    const T = new PnPart();
    T.blob(0, 0.005, 0, 0.026 + rng() * 0.022, 0.6, PN_COL.rock.map(L), 0.9, rng, 0);
    pnPut(M, T, pnFrame(u, pnH(u) - 0.01, null, rng() * 6, 1.3));
  }
  // Am See ein paar Steine
  for (const k of [0.55, 2.1, 3.6]) {
    const fr = pnFrame(PN_LAKE, 1, [0, 1, 0]), u = pnV.norm(pnV.add(fr.y, pnV.add(pnV.mul(fr.x, Math.cos(k) * PN_LR * 1.02), pnV.mul(fr.z, Math.sin(k) * PN_LR * 1.02))));
    const T = new PnPart();
    T.blob(0, 0, 0, 0.022 + rng() * 0.012, 0.6, PN_COL.rock.map(L), 0.9, rng, 0);
    pnPut(M, T, pnFrame(u, pnH(u) - 0.008, null, rng() * 6, 1.3));
  }
  return { M, scene };
}
/* Drei Wolkenformen aus mehreren Klumpen, unten flach */
function pnBuildClouds(seed) {
  const rng = pnRng(seed ^ 0x9e37), out = [];
  for (let v = 0; v < 3; v++) {
    const T = new PnPart(), M = new PnMesh(), cols = PN_COL.cloud.map(pnLin), n = 3 + v;
    for (let i = 0; i < n; i++) {
      const x = (i - (n - 1) / 2) * 0.075 + (rng() - 0.5) * 0.02, r = 0.06 + rng() * 0.035 + (i === Math.floor(n / 2) ? 0.025 : 0);
      T.blob(x, 0.01 + rng() * 0.02, (rng() - 0.5) * 0.05, r, 0.85, cols, 0, rng, 1, -0.02, 3);
    }
    pnPut(M, T, { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1], o: [0, 0, 0] });
    out.push(M);
  }
  return out;
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
const PN_VS_LIT = `#version 300 es
layout(location=0) in vec3 a_pos; layout(location=1) in vec3 a_nrm; layout(location=2) in vec3 a_col; layout(location=3) in vec4 a_at;
uniform mat4 u_vp, u_m;
out vec3 v_wp, v_n, v_c; out vec4 v_at;
${PN_SWAY}
void main() {
  vec4 w = u_m * vec4(sway(a_pos, a_at.y), 1.0);
  v_wp = w.xyz; v_n = mat3(u_m) * a_nrm; v_c = a_col; v_at = a_at;
  gl_Position = u_vp * w;
}`;
const PN_FS_LIT = `#version 300 es
precision highp float; precision highp sampler2DShadow;
in vec3 v_wp, v_n, v_c; in vec4 v_at;
uniform vec3 u_cam, u_l1d, u_l1c, u_l2d, u_l2c, u_ska, u_gna, u_tint, u_winp, u_winc, u_haze, u_rim, u_refl;
uniform float u_snow, u_wet, u_ice, u_win, u_flash, u_fog, u_t, u_shon, u_shl, u_exp;
uniform mat4 u_lvp; uniform sampler2DShadow u_shm;
out vec4 o;
float shadowAt(vec3 n, vec3 ld) {
  float nl = dot(n, ld);
  if (nl <= 0.0) return 0.0;
  vec4 lp = u_lvp * vec4(v_wp + n * 0.01, 1.0);
  vec3 s = lp.xyz / lp.w * 0.5 + 0.5;
  if (s.x < 0.0 || s.x > 1.0 || s.y < 0.0 || s.y > 1.0 || s.z > 1.0) return 1.0;
  vec2 ts = 1.0 / vec2(textureSize(u_shm, 0));
  float b = 0.0012 + 0.0025 * (1.0 - nl), sum = 0.0;
  for (int x = -1; x <= 1; x++) for (int y = -1; y <= 1; y++) sum += texture(u_shm, vec3(s.xy + vec2(x, y) * ts * 1.4, s.z - b));
  return sum / 9.0;
}
vec3 aces(vec3 x) { return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
void main() {
  vec3 n = normalize(v_n), up = normalize(v_wp), vd = normalize(u_cam - v_wp);
  float kind = v_at.z;
  bool water = kind > 1.5 && kind < 2.5, cloud = kind > 2.5;
  vec3 base = v_c * u_tint;
  if (water) {
    n = normalize(up + vec3(sin(v_wp.x * 70.0 + u_t * 1.6) + sin(v_wp.z * 53.0 - u_t * 1.2), 0.0, cos(v_wp.z * 61.0 + u_t * 1.4) + cos(v_wp.x * 47.0 - u_t)) * (0.025 + u_wet * 0.04) * (1.0 - u_ice));
    base = mix(base, vec3(0.62, 0.74, 0.8), u_ice);
  }
  // Schnee bleibt auf Flächen liegen, die nach oben zeigen, und wächst von dort nach und nach zu
  if (v_at.x > 0.0 && u_snow > 0.0) {
    float th = 0.12 + v_at.w * 0.55;
    float k = smoothstep(th, th + 0.1, u_snow * v_at.x * (0.55 + 0.75 * max(dot(n, up), 0.0)));
    base = mix(base, vec3(0.84, 0.88, 0.94), k);
  }
  if (!water && !cloud) base *= 1.0 - 0.28 * u_wet * v_at.x;
  float s1 = u_shl < 1.5 && u_shon > 0.5 ? shadowAt(n, u_l1d) : 1.0, s2 = u_shl > 1.5 && u_shon > 0.5 ? shadowAt(n, u_l2d) : 1.0;
  float d1 = max(dot(n, u_l1d), 0.0), d2 = max(dot(n, u_l2d), 0.0);
  vec3 amb = mix(u_gna, u_ska, dot(n, up) * 0.5 + 0.5);
  if (cloud) { amb = u_ska * 1.05 + u_gna * 0.3; d1 = d1 * 0.7 + 0.3; d2 = d2 * 0.6 + 0.15; }
  vec3 light = amb + u_l1c * d1 * s1 + u_l2c * d2 * s2 + vec3(0.5, 0.58, 0.95) * u_flash * (0.4 + 0.6 * max(dot(n, up), 0.0));
  if (u_win > 0.0) {
    vec3 dl = u_winp - v_wp; float dd = dot(dl, dl);
    light += u_winc * u_win * max(dot(n, normalize(dl)), 0.0) * 0.01 / (dd + 0.006);
  }
  vec3 col = base * light;
  if (water) {
    float f = pow(1.0 - max(dot(n, vd), 0.0), 3.0);
    col = mix(col, u_refl, clamp(f * 0.55 + 0.06, 0.0, 1.0) * (1.0 - u_ice * 0.6));
    float sp = mix(220.0, 30.0, u_ice);
    col += u_l1c * pow(max(dot(n, normalize(u_l1d + vd)), 0.0), sp) * 1.4 * s1 + u_l2c * pow(max(dot(n, normalize(u_l2d + vd)), 0.0), sp) * 2.0 * s2;
    if (u_win > 0.0) col += u_winc * u_win * pow(max(dot(n, normalize(normalize(u_winp - v_wp) + vd)), 0.0), 40.0) * 0.5;
  } else if (!cloud && u_wet > 0.0) {
    col += u_l1c * pow(max(dot(n, normalize(u_l1d + vd)), 0.0), 36.0) * 0.18 * u_wet * v_at.x * s1;
  }
  if (kind > 0.5 && kind < 1.5) col = mix(col, u_winc * 1.6, u_win);
  float fr = pow(1.0 - max(dot(n, vd), 0.0), 3.0);
  col += u_rim * fr * (cloud ? 0.08 : 0.18);
  col = mix(col, u_haze, u_fog);
  o = vec4(pow(aces(col * u_exp), vec3(1.0 / 2.2)), 1.0);
}`;
const PN_VS_DEP = `#version 300 es
layout(location=0) in vec3 a_pos; layout(location=3) in vec4 a_at;
uniform mat4 u_lvp, u_m;
${PN_SWAY}
void main() { gl_Position = u_lvp * (u_m * vec4(sway(a_pos, a_at.y), 1.0)); }`;
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
out vec4 o;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
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
  o = vec4(c * u_a + vec3(st), max(u_a, st));
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
  if (u_mode > 0.5) p += (tx * sin(u_t * 1.3 + a_s.x * 40.0) + ty * cos(u_t * 1.1 + a_s.y * 40.0)) * 0.014;
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

/* Eine Zeichenfläche mit eigenem WebGL-Kontext. mode: 'card' oder 'mirror' */
class PnView {
  constructor(id, host, mode) {
    this.id = id; this.mode = mode; this.ok = false; this.vis = false; this.last = 0; this.t = 0;
    this.yaw = 0; this.pitch = PN_PITCH; this.vyaw = 0; this.idle = 0; this.drag = null;
    this.snow = -1; this.ice = -1; this.win = 0; this.rain = 0; this.flash = 0; this.bolt = null; this.nextBolt = 0; this.wetA = 0; this.gloom = -1;
    this.env = null; this.envAt = 0; this.worldKey = '';
    this.cl = Array.from({ length: 12 }, () => ({ v: 0 }));
    this.cv = document.createElement('canvas');
    this.cv.className = 'pn-cv';
    if (mode === 'card') { this.cv.tabIndex = 0; this.cv.setAttribute('role', 'img'); }
    this.cv.setAttribute('aria-label', 'Wetterplanet');
    host.appendChild(this.cv);
    // Höchstens 60 Bilder pro Sekunde, auch auf 120-Hz-Schirmen, im Spiegel 30
    this.minDt = mode === 'mirror' ? 1000 / 30 - 3 : 1000 / 60 - 3;
    this.onLost = e => { e.preventDefault(); this.ok = false; };
    this.onRestore = () => { this.init(); pnWake(); };
    this.cv.addEventListener('webglcontextlost', this.onLost);
    this.cv.addEventListener('webglcontextrestored', this.onRestore);
    if (mode === 'card') this.bindInput();
    this.ro = new ResizeObserver(() => { this.sized = false; pnWake(); });
    this.ro.observe(this.cv);
    if (pn.io) pn.io.observe(this.cv);
    this.init();
  }
  init() {
    const gl = this.cv.getContext('webgl2', { antialias: true, alpha: true, premultipliedAlpha: true, powerPreference: 'low-power' });
    this.gl = gl;
    if (!gl) { this.fail('Dein Browser kann den Planeten hier nicht zeichnen (WebGL2 fehlt).'); return; }
    try {
      this.P = {
        lit: pnProg(gl, PN_VS_LIT, PN_FS_LIT), dep: pnProg(gl, PN_VS_DEP, PN_FS_DEP), bg: pnProg(gl, PN_VS_BG, PN_FS_BG),
        spr: pnProg(gl, PN_VS_SPR, PN_FS_SPR), drop: pnProg(gl, PN_VS_DROP, PN_FS_DROP), rib: pnProg(gl, PN_VS_RIB, PN_FS_RIB)
      };
    } catch (e) { this.fail('Der Planet ließ sich nicht starten.'); console.warn('Wetterplanet:', e); return; }
    // Viereck für Hintergrund und Leuchtpunkte
    this.quad = gl.createVertexArray();
    gl.bindVertexArray(this.quad);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
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
    gl.bindVertexArray(null);
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
    this.world = null; this.worldKey = ''; this.clouds = null;
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
    gl.bindVertexArray(null);
    return { vao, n: M.count, bufs };
  }
  free(m) { if (!m) return; const gl = this.gl; gl.deleteVertexArray(m.vao); for (const b of m.bufs) gl.deleteBuffer(b); }
  /* Gelände, Haus und Bäume neu bauen, wenn sich die Jahreszeit ändert */
  ensureWorld(now, lat) {
    const S = pnSeason(now, lat), k = `${S.k}|${S.bare.toFixed(2)}`;
    if (k === this.worldKey && this.world) return;
    const seed = pnHashStr(this.id);
    const W = pnBuildWorld(seed, S);
    this.free(this.world && this.world.mesh);
    this.world = { mesh: this.upload(W.M), scene: W.scene };
    if (!this.clouds) {
      this.clouds = pnBuildClouds(seed).map(M => this.upload(M));
      // Die ersten Wolken stehen gut verteilt, auch wenn es nur wenige gibt
      const rng = pnRng(seed ^ 0x51ed), lons = [62, -78, 170, 10, 120, -130, -30, 215, 85, -100, 35, 265];
      this.cl.forEach((c, i) => Object.assign(c, { lon: lons[i] + (rng() - 0.5) * 20, lat: (i < 3 ? 48 : 28) + rng() * (i < 3 ? 20 : 42), r: 1.38 + rng() * 0.13, var: i % 3, s: 0.85 + rng() * 0.45, spd: 0.7 + rng() * 0.6, rot: rng() * 6.28 }));
    }
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
      if (!d.touch) this.pitch = Math.max(-0.35, Math.min(1.25, this.pitch + dy * 0.007));
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
      // Kurz antippen: einmal herumdrehen
      if (e.type === 'pointerup' && d.moved < 6 && performance.now() - d.t0 < 400) this.vyaw = 16;
    };
    cv.addEventListener('pointerup', up);
    cv.addEventListener('pointercancel', up);
    cv.addEventListener('keydown', e => {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); this.vyaw = e.key === 'ArrowLeft' ? -2.6 : 2.6; this.idle = performance.now(); pnWake(); }
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.vyaw = 16; this.idle = performance.now(); pnWake(); }
    });
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
  /* Szene aus Wetter und Uhrzeit, zweimal pro Sekunde neu */
  computeEnv(now) {
    const D = pnData(this.id), loc = D ? D.loc : skyLoc(), c = D ? D.c : null;
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
    return {
      c, K, loc, alt, sunD, moonD, ph, ill, grey, temp, cover, n: Math.min(12, n), ws, wv: pnV.mul([-Math.sin(to), 0, -Math.cos(to)], ws),
      pm: A.sun > Math.PI / 2 && A.sun <= Math.PI * 1.5, snowT: Math.max(clamp01(snowD * 100 / 3), K.pk === 'snow' ? 0.92 : 0), snowing: K.pk === 'snow',
      iceT: temp <= -1.5 ? 1 : 0, smoke: temp < 12, lightOn: alt < 3.5 || (grey >= 0.6 && alt < 22) || grey >= 0.8, wet: K.pk === 'rain' || K.pk === 'drizzle' ? 1 : 0,
      name: D ? D.name : '', season: pnSeason(now, lat)
    };
  }
  frame(ts) {
    if (!this.ok) return;
    const gl = this.gl, E0 = this.env;
    let dt = this.lastTs ? (ts - this.lastTs) / 1000 : 0.016;
    this.lastTs = ts; this.last = ts;
    dt = Math.max(0, Math.min(0.1, dt));
    this.t += dt;
    const now = new Date();
    if (!E0 || ts - this.envAt > 500) { this.env = this.computeEnv(now); this.envAt = ts; }
    const E = this.env;
    this.ensureWorld(now, +E.loc.lat);
    if (!this.sized) {
      const dpr = Math.min(window.devicePixelRatio || 1, this.mode === 'mirror' ? 1.5 : 2);
      const w = Math.max(1, Math.round(this.cv.clientWidth * dpr)), h = Math.max(1, Math.round(this.cv.clientHeight * dpr));
      if (this.cv.width !== w || this.cv.height !== h) { this.cv.width = w; this.cv.height = h; }
      this.dpr = dpr; this.sized = true;
    }
    const W = this.cv.width, H = this.cv.height;
    if (W < 4 || H < 4) return;
    // Übergänge weich: Schnee, Eis, Licht, Regen, Wolken
    const ease = (cur, tgt, rate) => (cur < 0 ? tgt : cur + (tgt - cur) * (1 - Math.exp(-dt * rate)));
    this.snow = this.snow < 0 && E.snowing && E.snowT < 0.99 ? 0 : ease(this.snow, E.snowT, E.snowing ? 0.12 : 0.5);
    this.ice = ease(this.ice, E.iceT, 0.6);
    this.win = ease(this.win, E.lightOn ? 1 : 0, 1.4);
    this.rain = ease(this.rain, E.K.pi, 0.8);
    const gNow = ease(this.gloom, E.grey, 0.8);
    this.wetA = ease(this.wetA, E.wet, 0.4);
    // Ohne Daten noch nichts überblenden: Sobald das Wetter da ist, stehen Grau, Schnee und Eis gleich richtig.
    // Nur frisch fallender Schnee legt sich sichtbar nach und nach über den Planeten.
    if (E.c) this.gloom = gNow; else { this.gloom = -1; this.snow = -1; this.ice = -1; }
    this.cl.forEach((c, i) => { c.v += ((i < E.n ? 1 : 0) - c.v) * (1 - Math.exp(-dt * 0.9)); });
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
    const asp = W / H, fx = 2 * Math.atan(Math.tan(PN_FOV / 2) * asp), dist = (this.mode === 'mirror' ? 1.72 : PN_FIT) / Math.sin(Math.min(PN_FOV, fx) / 2);
    const tgt = [0, bob, 0], eye = [Math.sin(this.yaw) * Math.cos(this.pitch) * dist, Math.sin(this.pitch) * dist + bob, Math.cos(this.yaw) * Math.cos(this.pitch) * dist];
    const V = pnM.look(eye, tgt, [0, 1, 0]), Pm = pnM.persp(PN_FOV, asp, dist - 2.6, dist + 2.6), VP = pnM.mul(Pm, V);
    // Licht
    const g = gNow, alt = E.alt;
    const dayF = pnSmooth(-7, 7, alt), sunF = pnSmooth(-3, 5, alt);
    const warm = alt < 5 ? [1, 0.56, 0.32] : alt < 18 ? pnV.mix([1, 0.56, 0.32], [1, 0.86, 0.68], (alt - 5) / 13) : pnV.mix([1, 0.86, 0.68], [1, 0.96, 0.9], Math.min(1, (alt - 18) / 20));
    // Bei dichter Decke kaum direktes Licht, dafür mehr diffuses Grau
    const direct = 1 - 0.9 * pnSmooth(0.2, 0.75, g), sunC = pnV.mul(warm, 1.75 * sunF * direct);
    const moonUp = pnSmooth(-0.05, 0.12, E.moonD[1]), moonF = (1 - dayF) * moonUp;
    const moonC = pnV.mul([0.58, 0.64, 0.8], 0.6 * moonF * (0.2 + 0.8 * E.ill) * (1 - 0.8 * g));
    const dark = 1 - 0.38 * pnSmooth(0.7, 0.9, g);
    const [top, mid, low] = skyColors(alt, E.pm, Math.min(0.95, g * 1.05)).map(c => c.map(x => x * dark));
    const lt = pnLin(top), lm = pnLin(mid), ll = pnLin(low), gray = x => { const y = (x[0] + x[1] + x[2]) / 3; return pnV.mix(x, [y, y, y], 0.35); };
    const floor = pnV.mix([0.022, 0.03, 0.065], [0.03, 0.032, 0.04], g);
    const ska = pnV.add(pnV.mul(gray(pnV.mix(lt, lm, 0.6)), 0.62 + (1 - direct) * 0.45 * dayF), floor), gna = pnV.add(pnV.mul(gray(ll), 0.22), pnV.mul(floor, 0.6));
    const rim = pnV.mul(ll, 0.7 * (0.35 + 0.65 * dayF) + 0.05), refl = pnV.add(pnV.mul(lm, 0.9), [0.01, 0.015, 0.03]);
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
    const I = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
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
      gl.disable(gl.POLYGON_OFFSET_FILL);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }
    // 2. Himmel und Sterne
    gl.viewport(0, 0, W, H);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND);
    const bgA = this.mode === 'card' ? 1 : 0;
    {
      const B = this.P.bg, s = x => x.map(v => v / 255);
      gl.useProgram(B.p);
      gl.uniform3fv(B.u.u_top, s(top)); gl.uniform3fv(B.u.u_mid, s(mid)); gl.uniform3fv(B.u.u_low, s(low));
      gl.uniform1f(B.u.u_a, bgA);
      // Im Spiegel keine Sterne: Sie hätten an den Kanten der Zeichenfläche eine sichtbare Grenze
      gl.uniform1f(B.u.u_stars, bgA ? (1 - pnSmooth(-11, -4, alt)) * (1 - pnSmooth(0.2, 0.7, g)) : 0);
      gl.uniform1f(B.u.u_t, this.t); gl.uniform1f(B.u.u_flash, fl * bgA); gl.uniform1f(B.u.u_cell, 11 * this.dpr);
      gl.bindVertexArray(this.quad);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
    // 3. Planet und Wolken
    gl.enable(gl.DEPTH_TEST); gl.depthMask(true); gl.disable(gl.CULL_FACE);
    const U = this.P.lit.u;
    gl.useProgram(this.P.lit.p);
    gl.uniformMatrix4fv(U.u_vp, false, VP);
    gl.uniform3fv(U.u_cam, eye);
    gl.uniform3fv(U.u_l1d, E.sunD); gl.uniform3fv(U.u_l1c, sunC);
    gl.uniform3fv(U.u_l2d, E.moonD); gl.uniform3fv(U.u_l2c, moonC);
    gl.uniform3fv(U.u_ska, ska); gl.uniform3fv(U.u_gna, gna);
    gl.uniform3fv(U.u_rim, rim); gl.uniform3fv(U.u_refl, refl);
    gl.uniform3fv(U.u_haze, pnV.add(pnV.mul(pnV.mix(lm, ll, 0.5), 0.9), [0.02, 0.02, 0.025]));
    gl.uniform1f(U.u_fog, E.K.fog ? 0.32 : g * 0.06);
    gl.uniform1f(U.u_snow, Math.max(0, this.snow)); gl.uniform1f(U.u_ice, Math.max(0, this.ice)); gl.uniform1f(U.u_wet, this.wetA);
    gl.uniform1f(U.u_win, this.win); gl.uniform3fv(U.u_winp, this.world.scene.light); gl.uniform3fv(U.u_winc, [1, 0.66, 0.3]);
    gl.uniform1f(U.u_flash, fl); gl.uniform1f(U.u_t, this.t); gl.uniform1f(U.u_ws, E.ws); gl.uniform3fv(U.u_wv, E.wv);
    gl.uniform1f(U.u_exp, 0.95 * (0.75 + 0.25 * dark));
    gl.uniformMatrix4fv(U.u_lvp, false, LVP);
    gl.uniform1f(U.u_shon, shOn ? 1 : 0); gl.uniform1f(U.u_shl, useSun ? 1 : 2);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.shTex); gl.uniform1i(U.u_shm, 0);
    gl.uniformMatrix4fv(U.u_m, false, I);
    gl.uniform3fv(U.u_tint, [1, 1, 1]);
    gl.bindVertexArray(this.world.mesh.vao);
    gl.drawArrays(gl.TRIANGLES, 0, this.world.mesh.n);
    const ct = E.K.storm ? [0.42, 0.44, 0.48] : E.K.pk || E.K.fog ? pnV.mix([0.84, 0.86, 0.88], [0.58, 0.6, 0.63], Math.min(1, E.K.pi + 0.3)) : pnV.mix([1, 1, 1], [0.78, 0.8, 0.83], clamp01((E.cover - 50) / 50));
    gl.uniform3fv(U.u_tint, pnV.mul(ct, 1 - 0.38 * g));
    for (const c of clouds) { gl.uniformMatrix4fv(U.u_m, false, c.M); gl.bindVertexArray(c.mesh.vao); gl.drawArrays(gl.TRIANGLES, 0, c.mesh.n); }
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
    if (sunA > 0.01) spr(1, pnV.mul(E.sunD, PN_SUN_R), 0.66, [...pnV.mix([1, 0.55, 0.25], [1, 0.84, 0.45], pnSmooth(2, 25, alt)), sunA]);
    const moonA = moonUp * (1 - dayF * 0.85) * (1 - pnSmooth(0.3, 0.75, g) * 0.92);
    if (moonA > 0.01) {
      gl.uniform1f(S.u.u_ph, Math.cos(E.ph * Math.PI * 2)); gl.uniform1f(S.u.u_wax, E.ph < 0.5 ? 1 : 0); gl.uniform1f(S.u.u_ill, E.ill);
      spr(2, pnV.mul(E.moonD, PN_SUN_R), 0.5, [0.75, 0.82, 1, moonA]);
    }
    gl.blendFuncSeparate(gl.ONE, gl.ONE, gl.ONE, gl.ONE);
    if (this.win > 0.01) for (const w of this.world.scene.wins) spr(0, w, 0.07, [1, 0.72, 0.36, this.win * 0.85]);
    // Lichthof der Atmosphäre: ohne Tiefentest, damit der Rand des Planeten mitleuchtet
    gl.disable(gl.DEPTH_TEST);
    gl.uniform1f(S.u.u_r0, 1.0085);
    const halo = pnV.mix([0.35, 0.45, 0.85], pnV.mix(low.map(x => x / 255), [1, 1, 1], 0.25), dayF);
    spr(3, [0, 0, 0], 1.55, [...halo, (0.2 + 0.2 * dayF) * (bgA ? 1 : 0.85)]);
    gl.enable(gl.DEPTH_TEST);
    // Regenbogen bei Schauern, wenn die Sonne tief genug steht und durchkommt
    if (E.K.pk === 'rain' && !E.K.storm && alt > 3 && alt < 42 && E.cover < 88) spr(5, [0, 0, 0], 1.5, [1, 1, 1, 0.32 * sunVis * pnSmooth(3, 8, alt) * Math.min(1, this.rain * 1.5)]);
    // 5. Rauch aus dem Schornstein und Nebelschwaden
    gl.blendFuncSeparate(gl.ONE, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    const amb = pnV.add(pnV.mul(ska, 0.7), pnV.mul(pnV.add(sunC, moonC), 0.35)), toS = x => x.map(v => Math.min(1, v) ** (1 / 2.2));
    if (E.smoke) {
      const up = pnV.norm(this.world.scene.chimney), wt = pnV.sub(E.wv, pnV.mul(up, pnV.dot(E.wv, up)));
      const sc = toS(pnV.add(pnV.mul(amb, 0.8), pnV.mul([0.16, 0.15, 0.15], 1 - dayF * 0.6)));
      for (let i = 0; i < 7; i++) {
        const f = (this.t * 0.16 + i / 7) % 1;
        const pos = pnV.add(this.world.scene.chimney, pnV.add(pnV.mul(up, f * 0.2), pnV.mul(wt, f * f * 0.22 + f * 0.03)));
        spr(4, pos, 0.016 + f * 0.055, [...sc, 0.55 * (1 - f) * pnSmooth(0, 0.12, f)]);
      }
    }
    if (E.K.fog) {
      const fc = toS(pnV.mul(pnV.add(amb, [0.05, 0.05, 0.06]), 1.1));
      for (let i = 0; i < 9; i++) {
        const u = pnLL(10 + (i % 3) * 20, i * 40 + this.t * 2.2);
        spr(4, pnV.mul(u, 1.07), 0.42, [...fc, 0.32]);
      }
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
    }
    // 7. Blitz
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
    const pts = [], n = 8, r0 = c.r - 0.03, r1 = pnH(end);
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
  const key = `${(+P.lat).toFixed(3)}|${(+P.lon).toFixed(3)}`, e = pn.wx.get(key);
  if (!e || (!e.busy && Date.now() - e.at > 10 * 6e4 && Date.now() - (e.tried || 0) > 6e4)) pnFetch(P, key);
  return e && e.c ? { c: e.c, loc: P, name: P.name, at: e.at } : null;
}
async function pnFetch(P, key) {
  const e = pn.wx.get(key) || { at: 0 };
  e.busy = true; e.tried = Date.now();
  pn.wx.set(key, e);
  try {
    const j = await getJson(`https://api.open-meteo.com/v1/forecast?latitude=${(+P.lat).toFixed(4)}&longitude=${(+P.lon).toFixed(4)}&current=temperature_2m,precipitation,weather_code,cloud_cover,wind_speed_10m,wind_direction_10m,snow_depth&timezone=auto&wind_speed_unit=kmh`);
    if (j && j.current) { e.c = j.current; e.at = j.cachedAt || Date.now(); }
  } catch { /* nächster Versuch in einer Minute */ }
  e.busy = false;
  for (const v of viewsOf('planet')) renderPlanet(v);
  renderMirror();
}

/* Zeichnen nur, solange etwas zu sehen ist */
function pnLoop(ts) {
  pn.raf = 0;
  if (document.hidden) return;
  let any = false;
  for (const I of pn.inst.values()) {
    if (!I.vis || !I.ok) continue;
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
function pnMake(key, id, host, mode) {
  let I = pn.inst.get(key);
  if (I && I.id !== id) { I.destroy(); I = null; }
  if (!I) {
    I = new PnView(id, host, mode);
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
  if (I) I.cv.setAttribute('aria-label', cap ? `Wetterplanet${cap.place ? ` für ${cap.place}` : ''}: ${cap.temp.replace('°', ' Grad').replace('−', 'minus ')}, ${cap.desc}. Zum Drehen ziehen, antippen für eine Runde.` : 'Wetterplanet, das Wetter wird geladen');
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
/* Neu in 3.12: den Planeten neben das Wetter legen */
function pnShow() {
  let id = widgetsOf('planet').map(([i]) => i).find(i => pagesUsing(i).length);
  if (!id) {
    id = widgetsOf('planet').map(([i]) => i)[0] || newWidget('planet', {});
    const p = pagesUsing('weather')[0] || curPage(), i = p.items.findIndex(x => x.w === 'weather');
    p.items.splice(i >= 0 ? i + 1 : p.items.length, 0, { w: id, s: 1 });
    commit();
    layoutNow();
    toast(`Der Wetterplanet liegt jetzt auf „${p.name}“.`);
  }
  setTimeout(() => nwJump(id), 60);
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
    pnMake(v.id, v.id, v.q('[data-r="stage"]'), 'card');
  },
  unmount(v) { const I = pn.inst.get(v.id); if (I) I.destroy(); },
  render: renderPlanet,
  settings: {
    render(box, w) {
      box._place = w.cfg.place ? { ...w.cfg.place } : { how: 'wx' };
      box._fixed = box._place.how === 'fixed' ? box._place : null;
      const homeOff = !(state.commute.home && Number.isFinite(state.commute.home.lat)), workOff = !(state.commute.work && Number.isFinite(state.commute.work.lat));
      box.innerHTML = `<div class="field"><span class="lbl">Wetter von</span><div class="seg pn-how" role="group" aria-label="Ort">${Object.entries(PN_HOWS).map(([k, n]) => `<button type="button" data-how="${k}">${esc(n)}</button>`).join('')}</div>
        <p class="hint" data-s="info"></p></div>
        <div class="field pn-find"><label class="lbl" for="pn-q">Eigenen Ort suchen</label><div class="dp-search"><input id="pn-q" data-s="q" type="search" maxlength="60" autocomplete="off" placeholder="z. B. Lübeck"><button type="button" class="btn-ghost" data-s="go">Suchen</button></div><div class="pn-hits" data-s="hits"></div></div>
        <p class="hint">${homeOff || workOff ? 'Zuhause und Arbeit gehen, sobald deine Strecke im Pendeln-Widget eingetragen ist. ' : ''}Antippen dreht den Planeten einmal herum, ziehen dreht ihn frei.</p>`;
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
