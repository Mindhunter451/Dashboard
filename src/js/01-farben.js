/* Farben: Akzent aus einer Grundfarbe ableiten, in Hell und Dunkel mit genug Kontrast.
 * Gerechnet wird in OKLCH (Helligkeit, Buntheit, Farbton), damit alle Töne gleich kräftig wirken.
 * Aus einer Farbe entstehen: --accent (Flächen, Balken), --accent-ink (Text auf Karten), --on-accent (Text auf der Fläche).
 * Bei Verläufen kommt --accent-2 dazu, --accent-fill ist dann der Verlauf. Der Chip-Hintergrund mischt CSS selbst. */
const RAD_OK = Math.PI / 180;
const acc = { sunHex: '' };
const okLin = c => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const okGam = c => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
const okHexRgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255);
const okRgbHex = c => '#' + c.map(x => Math.round(Math.max(0, Math.min(1, x)) * 255).toString(16).padStart(2, '0')).join('').toUpperCase();
const okValidHex = h => typeof h === 'string' && /^#[0-9a-f]{6}$/i.test(h);
function okLab(hex) {
  const [r, g, b] = okHexRgb(hex).map(okLin);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s, 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s];
}
function okLabRgb(L, a, b) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.2914855480 * b) ** 3;
  return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s];
}
function okLch(hex) {
  const [L, a, b] = okLab(hex);
  return [L, Math.hypot(a, b), (Math.atan2(b, a) / RAD_OK + 360) % 360];
}
/* OKLCH nach Hex. Liegt die Farbe außerhalb von sRGB, wird nur die Buntheit verringert, Helligkeit und Farbton bleiben. */
function okHex(L, C, H) {
  const rgb = c => okLabRgb(L, c * Math.cos(H * RAD_OK), c * Math.sin(H * RAD_OK));
  const inGamut = c => rgb(c).every(x => x >= -1e-4 && x <= 1 + 1e-4);
  let c = C;
  if (!inGamut(c)) {
    let lo = 0, hi = C;
    for (let i = 0; i < 18; i++) { const mid = (lo + hi) / 2; if (inGamut(mid)) lo = mid; else hi = mid; }
    c = lo;
  }
  return okRgbHex(rgb(c).map(okGam));
}
function okLum(hex) { const [r, g, b] = okHexRgb(hex).map(okLin); return 0.2126 * r + 0.7152 * g + 0.0722 * b; }
function okContrast(a, b) { const x = okLum(a), y = okLum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }
const okClamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

/* Flächen, auf denen Akzent-Text steht. Die Werte stehen auch in 00-base.css. */
const SURF = { light: '#FFFFFF', graphite: '#1A1918', oled: '#0E0E0E' };
/* Aus einer Grundfarbe die Akzentwerte für ein Design ('light', 'graphite', 'oled') */
function accentFor(hex, mode) {
  const [L, C, H] = okLch(hex), mono = C < 0.035, dark = mode !== 'light', surf = SURF[mode] || SURF.light;
  let a, ink;
  if (!dark) {
    a = mono ? okHex(0.33, 0.004, H) : okHex(okClamp(L, 0.55, 0.84), C, H);
    let li = mono ? 0.33 : Math.min(L - 0.1, 0.56);
    ink = okHex(li, Math.min(C, 0.17), H);
    while (okContrast(ink, surf) < 4.8 && li > 0.2) { li -= 0.02; ink = okHex(li, Math.min(C, 0.17), H); }
  } else {
    a = mono ? okHex(0.9, 0.004, H) : okHex(okClamp(L + 0.08, 0.72, 0.88), C * 0.96, H);
    let li = mono ? 0.9 : Math.max(L + 0.12, 0.8);
    ink = okHex(li, Math.min(C * 0.75, 0.14), H);
    while (okContrast(ink, surf) < 7 && li < 0.96) { li += 0.02; ink = okHex(li, Math.min(C * 0.75, 0.14), H); }
  }
  return { a, ink, H, C: mono ? 0 : C };
}
/* Schrift auf der Akzentfläche: hell oder dunkel, je nachdem, was auf allen Farben des Verlaufs besser lesbar ist */
function onAccent(list, H, C) {
  const darkInk = okHex(0.2, Math.min(C, 0.045), H);
  const worst = ink => Math.min(...list.map(x => okContrast(x, ink)));
  return worst('#FFFFFF') >= worst(darkInk) ? '#FFFFFF' : darkInk;
}

/* Einfarbige Akzente, im Kreis der Farbtöne sortiert. Die Grundfarbe ist der Ton im hellen Design. */
const ACCENTS = {
  amber:    { name: 'Bernstein', hex: '#E8A126' },
  coral:    { name: 'Koralle', hex: '#E5654B' },
  pink:     { name: 'Pink', hex: '#D9488A' },
  violet:   { name: 'Violett', hex: '#8A5CD8' },
  indigo:   { name: 'Indigo', hex: '#5B63E0' },
  blue:     { name: 'Blau', hex: '#3D7BE0' },
  teal:     { name: 'Petrol', hex: '#1A9AA0' },
  green:    { name: 'Grün', hex: '#2FA36B' },
  lime:     { name: 'Limette', hex: '#86B42A' },
  graphite: { name: 'Graphit', hex: '#45464A' }
};
/* Verläufe aus zwei Tönen */
const GRADS = {
  'g-glut':     { name: 'Glut', a: '#E8A126', b: '#E5654B' },
  'g-abend':    { name: 'Abendrot', a: '#EE7A4E', b: '#D9488A' },
  'g-lavendel': { name: 'Lavendel', a: '#D9488A', b: '#8A5CD8' },
  'g-lagune':   { name: 'Lagune', a: '#1A9AA0', b: '#3D7BE0' },
  'g-nordlicht': { name: 'Nordlicht', a: '#2FA36B', b: '#5B63E0' },
  'g-zitrus':   { name: 'Zitrus', a: '#86B42A', b: '#E8A126' }
};
const ACCENT_KEYS = () => [...Object.keys(ACCENTS), ...Object.keys(GRADS), 'custom', 'sun'];

/* Akzent „Mit dem Tag“: nachts Violett, in der Dämmerung Pink und Koralle, morgens Bernstein, mittags Petrol und Blau.
 * Unter dem Horizont zählt die Sonnenhöhe in Grad, darüber der Anteil an der höchsten Höhe des Tages.
 * Zwischen zwei Tönen läuft der Farbton auf dem kürzeren Weg um den Kreis, Helligkeit und Buntheit gleiten mit. */
const SUN_KEYS = {
  am: [[-90, '#8A5CD8'], [-12, '#8A5CD8'], [-5, '#D9488A'], [0, '#E5654B'], [0.3, '#E8A126'], [0.5, '#1A9AA0'], [1, '#3D7BE0']],
  pm: [[-90, '#8A5CD8'], [-11, '#8A5CD8'], [-4, '#D9488A'], [0.02, '#E5654B'], [0.35, '#E8A126'], [0.55, '#1A9AA0'], [1, '#3D7BE0']]
};
function sunAccentHex(alt, pm, max) {
  const x = alt < 0 ? alt : alt / Math.max(4, max || 1);
  const K = SUN_KEYS[pm ? 'pm' : 'am'];
  let i = 1;
  while (i < K.length - 1 && x > K[i][0]) i++;
  const [x0, c0] = K[i - 1], [x1, c1] = K[i], t = okClamp((x - x0) / (x1 - x0 || 1), 0, 1);
  const A = okLch(c0), B = okLch(c1);
  let dh = B[2] - A[2];
  if (dh > 180) dh -= 360;
  if (dh < -180) dh += 360;
  return okHex(A[0] + (B[0] - A[0]) * t, Math.max(0.1, A[1] + (B[1] - A[1]) * t), (A[2] + dh * t + 360) % 360);
}
/* Die Grundfarben des gewählten Akzents: eine oder zwei */
function accentBase(u) {
  if (GRADS[u.accent]) return [GRADS[u.accent].a, GRADS[u.accent].b];
  if (u.accent === 'custom' && okValidHex(u.accentHex)) return [u.accentHex];
  if (u.accent === 'sun') return [acc.sunHex || ACCENTS.amber.hex];
  return [(ACCENTS[u.accent] || ACCENTS.amber).hex];
}
/* CSS-Variablen für ein Design */
function accentVars(base, mode) {
  const sets = base.map(h => accentFor(h, mode)), s0 = sets[0];
  const on = onAccent(sets.map(s => s.a), s0.H, s0.C);
  let v = `--accent:${s0.a};--accent-ink:${s0.ink};--on-accent:${on};`;
  if (sets[1]) {
    v += `--accent-2:${sets[1].a};--accent-fill:linear-gradient(120deg,${s0.a},${sets[1].a});`;
  } else v += `--accent-2:${s0.a};--accent-fill:${s0.a};`;
  return v;
}
/* Stylesheet mit den Akzentwerten für Hell, Graphit und Schwarz */
function accentCss(u) {
  const base = accentBase(u), dk = state.ui.dark === 'oled' ? 'oled' : 'graphite';
  const d = accentVars(base, dk);
  let css = `:root{${accentVars(base, 'light')}}@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){${d}}}:root[data-theme="dark"]{${d}}`;
  // Verläufe in OKLCH gemischt, wo der Browser das kann: kräftiger in der Mitte, kein Grau
  if (base[1]) css += '@supports (background:linear-gradient(in oklch,red,blue)){:root{--accent-fill:linear-gradient(in oklch 120deg,var(--accent),var(--accent-2))}}';
  return css;
}
/* Kleiner Kreis für die Auswahl: Farbe im aktuellen Design */
function accentSwatch(key, dark) {
  const mode = dark ? (state.ui.dark === 'oled' ? 'oled' : 'graphite') : 'light';
  if (GRADS[key]) return `linear-gradient(135deg,${accentFor(GRADS[key].a, mode).a},${accentFor(GRADS[key].b, mode).a})`;
  if (key === 'custom') return okValidHex(state.ui.accentHex) ? accentFor(state.ui.accentHex, mode).a : '#888888';
  return accentFor((ACCENTS[key] || ACCENTS.amber).hex, mode).a;
}
