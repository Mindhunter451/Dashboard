/* Wetterplanet, Teil 4 (seit 3.14): Leben auf dem Planeten.
 * Tiere: ein Vogelschwarm am Tag (am Strand Möwen), Zugvögel im V im Frühling und Herbst, Enten auf dem See (im Frühsommer mit
 * Küken), Fische, die ab und zu springen, Schmetterlinge über den Blumenwiesen, ein Hase, ein Reh in der Dämmerung, nachts eine
 * Eule im Baum am Haus und in Sommernächten Fledermäuse. Dazu fallende Herbstblätter und Blütenblätter, ein Regenbogen nach dem
 * Regen und Schlieren bei Sturm.
 * Alles hängt am echten Wetter und an der Uhrzeit, gezeichnet mit demselben Licht wie der Rest der Welt. Was gerade zu sehen ist,
 * steht in I.life.on (für die Liste im Widget, 56-planet-legende.js). */

/* Kleine Netze. Alle in eigenen Koordinaten: y oben, z vorn, Flügel zeigen nach +x (der linke wird gespiegelt). */
function pnMk(fn) { const T = new PnPart(), M = new PnMesh(); fn(T, pnRng(23), pnLin); pnPut(M, T, PN_ID); return M; }
/* Spitze aus drei Dreiecken, etwa ein Schnabel oder eine Nase: Grundfläche um b, Spitze bei e */
function pnBeak(T, b, e, w, col) {
  const d = pnV.norm(pnV.sub(e, b)), s = pnV.norm(pnV.cross(d, Math.abs(d[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0])), u = pnV.cross(s, d);
  const P = [0, 2.09, 4.19].map(a => pnV.add(b, pnV.add(pnV.mul(s, Math.cos(a) * w), pnV.mul(u, Math.sin(a) * w))));
  for (let i = 0; i < 3; i++) T.tri(P[i], P[(i + 1) % 3], e, col, 0, 0, b);
}
const pnBuildBird = (c1, c2, bk) => pnMk((T, r, L) => {
  T.ell(0, 0, 0, 0.0042, 0.0037, 0.0088, [L(c1)], 0, r, 1, null, 0, 0.55, 0.1);
  T.ell(0, -0.0011, 0.0012, 0.0035, 0.0027, 0.0066, [L(c2)], 0, r, 1, null, 0, 0.55, 0.1);
  T.ell(0, 0.0022, 0.0079, 0.0031, 0.0031, 0.0033, [L(c1)], 0, r, 1, null, 0, 0.55, 0.1);
  pnBeak(T, [0, 0.0019, 0.0104], [0, 0.0015, 0.0142], 0.0011, L(bk));
  T.tri([-0.0032, 0.0006, -0.0068], [0.0032, 0.0006, -0.0068], [0, 0.0009, -0.0148], L(c1), 0, 0, [0, -1, -0.01]);
});
const pnBuildWing = (span, ch, c1, c2) => pnMk((T, r, L) => {
  const rf = [0.0012, 0, ch * 0.55], rb = [0.0012, 0, -ch * 0.45], mf = [span * 0.55, 0, ch * 0.4], mb = [span * 0.55, 0, -ch * 0.55], tip = [span, 0, -ch * 0.35];
  const dn = [span * 0.4, -1, 0];
  T.tri(rf, mf, mb, L(c1), 0, 0, dn); T.tri(rf, mb, rb, L(c1), 0, 0, dn); T.tri(mf, tip, mb, L(c2), 0, 0, dn);
});
/* Graugans mit langem schwarzem Hals und weißer Wange */
const pnBuildGoose = () => pnMk((T, r, L) => {
  T.ell(0, 0, 0, 0.0058, 0.005, 0.013, [L('#8A7F72'), L('#7C7266')], 0, r, 1, null, 0, 0.5, 0.1);
  T.ell(0, -0.0015, 0.001, 0.0048, 0.0036, 0.0098, [L('#CFC6B8')], 0, r, 1, null, 0, 0.5, 0.1);
  T.ell(0, 0.0016, 0.0132, 0.0019, 0.0019, 0.0055, [L('#2A2A2A')], 0, r, 1, null, 0, 0.5, 0.1);
  T.ell(0, 0.0022, 0.0192, 0.0026, 0.0026, 0.0034, [L('#2A2A2A')], 0, r, 1, null, 0, 0.5, 0.1);
  T.ell(0, 0.0016, 0.0197, 0.0027, 0.0012, 0.0018, [L('#F2F0EA')], 0, r, 0, null, 0, 0.5, 0.1);
  pnBeak(T, [0, 0.0019, 0.0222], [0, 0.0015, 0.0262], 0.0012, L('#E39B2D'));
  T.tri([-0.0042, 0.0008, -0.011], [0.0042, 0.0008, -0.011], [0, 0.0012, -0.018], L('#2E2B28'), 0, 0, [0, -1, -0.012]);
});
/* Stockente: Erpel mit grünem Kopf und weißem Halsring, Ente braun gefleckt, Küken gelb */
const pnBuildDuck = hen => pnMk((T, r, L) => {
  const b = hen ? [L('#8A6A48'), L('#9A7A55'), L('#7A5A3A')] : [L('#A69C91'), L('#9A9086')], head = hen ? [L('#7E6045')] : [L('#2E6B3E'), L('#357A47')];
  T.ell(0, 0.0045, 0, 0.0068, 0.0052, 0.0118, b, 0, r, 1, -0.0004, 0, 0.5, 0.12);
  if (!hen) T.ell(0, 0.0072, -0.003, 0.0058, 0.0028, 0.008, [L('#5E5246')], 0, r, 1, null, 0, 0.5, 0.1);
  T.tri([-0.003, 0.006, -0.0105], [0.003, 0.006, -0.0105], [0, 0.0098, -0.0152], hen ? b[2] : L('#F2F0EA'), 0, 0, [0, 0, -0.01]);
  if (!hen) T.ell(0, 0.0098, 0.0085, 0.0038, 0.0012, 0.0036, [L('#F2F0EA')], 0, r, 0, null, 0, 0.4, 0.05);
  T.ell(0, 0.0128, 0.0098, 0.0042, 0.0042, 0.0046, head, 0, r, 1, null, 0, 0.55, 0.1);
  T.box(-0.0018, 0.0112, 0.0132, 0.0018, 0.0124, 0.0175, L(hen ? '#D9873A' : '#E8C23A'), 0);
  for (const x of [-0.0028, 0.0028]) T.box(x - 0.0006, 0.0136, 0.0117, x + 0.0006, 0.0146, 0.0125, L('#151515'), 0);
});
const pnBuildChick = () => pnMk((T, r, L) => {
  T.ell(0, 0.0028, 0, 0.0034, 0.003, 0.0048, [L('#F2D45C'), L('#E9C64A')], 0, r, 1, -0.0002, 0, 0.6, 0.1);
  T.ell(0, 0.0062, 0.0036, 0.0024, 0.0024, 0.0025, [L('#F4DA6A')], 0, r, 0, null, 0, 0.6, 0.1);
  T.box(-0.0008, 0.0056, 0.0058, 0.0008, 0.0063, 0.0076, L('#E39B2D'), 0);
});
const pnBuildFish = (c1, c2) => pnMk((T, r, L) => {
  T.ell(0, 0, 0, 0.0021, 0.0034, 0.0088, [L(c1)], 0, r, 1, null, 0, 0.55, 0.08);
  T.ell(0, 0.0012, -0.001, 0.0016, 0.002, 0.0068, [L(c2)], 0, r, 1, null, 0, 0.5, 0.08);
  T.tri([0, 0, -0.0078], [0, 0.0042, -0.0128], [0, -0.0042, -0.0128], L(c2), 0, 0, [1, 0, -0.01]);
  T.tri([0, 0.0028, 0.002], [0, 0.0028, -0.003], [0, 0.0052, -0.0022], L(c2), 0, 0, [1, 0.003, 0]);
});
const pnBuildFlyBody = () => pnMk((T, r, L) => {
  T.ell(0, 0, 0, 0.0009, 0.0009, 0.0042, [L('#2A2420')], 0, r, 0, null, 0, 0.4, 0.05);
  T.tri([-0.0004, 0.0004, 0.0038], [-0.0016, 0.0024, 0.0062], [-0.0010, 0.0004, 0.0036], L('#2A2420'), 0, 0, [0, -1, 0]);
  T.tri([0.0004, 0.0004, 0.0038], [0.0016, 0.0024, 0.0062], [0.0010, 0.0004, 0.0036], L('#2A2420'), 0, 0, [0, -1, 0]);
});
/* Schmetterlingsflügel: weiß mit dunkler Spitze, die Farbe kommt beim Zeichnen dazu */
const pnBuildFlyWing = () => pnMk((T, r, L) => {
  const w = L('#FFFFFF'), d = L('#2A2420'), dn = [0.004, -1, 0];
  T.tri([0.0005, 0, 0.0012], [0.0072, 0, 0.0078], [0.0084, 0, 0.0012], w, 0, 0, dn);
  T.tri([0.0072, 0, 0.0078], [0.0096, 0, 0.0062], [0.0084, 0, 0.0012], d, 0, 0, dn);
  T.tri([0.0005, 0, -0.0004], [0.0078, 0, -0.0002], [0.0052, 0, -0.0068], w, 0, 0, dn);
});
const pnBuildHare = () => pnMk((T, r, L) => {
  const fur = [L('#8E7357'), L('#7E6449'), L('#96795C')];
  T.ell(0, 0.0105, -0.001, 0.0074, 0.0082, 0.0118, fur, 0, r, 1, 0, 0, 0.5, 0.12);
  T.ell(0, 0.0175, 0.0108, 0.005, 0.0052, 0.0064, fur, 0, r, 1, null, 0, 0.5, 0.1);
  for (const x of [-1, 1]) {
    const b0 = [x * 0.0018, 0.0215, 0.0092], tip = [x * 0.0036, 0.0372, 0.0035], s = [0, 0, 0.0016];
    T.quad(pnV.sub(b0, s), pnV.add(b0, s), pnV.add(tip, [0, 0, 0.0008]), pnV.sub(tip, [0, 0, 0.0008]), fur[1], 0, 0, [x * 0.01, 0.028, 0.006]);
    T.box(x * 0.0044 - 0.0006, 0.0185, 0.0136, x * 0.0044 + 0.0006, 0.0197, 0.0146, L('#1A1612'), 0);
  }
  T.blob(0, 0.0122, -0.0128, 0.0032, 1, [L('#F1ECE4')], 0, r, 0, null, 0, 0.5);
  T.box(-0.0011, 0.0158, 0.0168, 0.0011, 0.0172, 0.0176, L('#3A2A22'), 0);
});
const pnBuildOwl = () => pnMk((T, r, L) => {
  T.ell(0, 0.0118, -0.0008, 0.0084, 0.0122, 0.0078, [L('#7A5A3C'), L('#6E5035')], 0, r, 1, 0, 0, 0.5, 0.1);
  T.ell(0, 0.0105, 0.0026, 0.0066, 0.0092, 0.0058, [L('#C9AE86'), L('#BFA27A')], 0, r, 1, null, 0, 0.5, 0.1);
  for (const x of [-0.003, 0.003]) T.box(x - 0.0016, -0.0005, 0.002, x + 0.0016, 0.0012, 0.0058, L('#C9922E'), 0);
  T.tri([-0.004, 0.006, -0.006], [0.004, 0.006, -0.006], [0, -0.002, -0.0102], L('#5E4430'), 0, 0, [0, 0.004, 0]);
});
const pnBuildOwlHead = () => pnMk((T, r, L) => {
  T.ell(0, 0.0072, 0, 0.0082, 0.0071, 0.0071, [L('#7A5A3C')], 0, r, 1, null, 0, 0.5, 0.1);
  T.ell(0, 0.0068, 0.0049, 0.0068, 0.0056, 0.0026, [L('#D8C3A0')], 0, r, 1, null, 0, 0.45, 0.05);
  for (const x of [-1, 1]) {
    T.tri([x * 0.0028, 0.0128, 0.001], [x * 0.0062, 0.0122, -0.001], [x * 0.0062, 0.0175, 0.0005], L('#6E5035'), 0, 0, [0, 0.01, -1]);
    T.box(x * 0.0031 - 0.0015, 0.0074, 0.0068, x * 0.0031 + 0.0015, 0.0091, 0.0078, L('#E8B530'), 0, 1);
    T.box(x * 0.0031 - 0.0007, 0.0078, 0.0077, x * 0.0031 + 0.0007, 0.0087, 0.0081, L('#151515'), 0);
  }
  pnBeak(T, [0, 0.0062, 0.0074], [0, 0.0045, 0.0094], 0.0009, L('#4A3A2A'));
});
const pnBuildBat = () => pnMk((T, r, L) => {
  T.ell(0, 0, 0, 0.0022, 0.0021, 0.0042, [L('#2A2420')], 0, r, 0, null, 0, 0.4, 0.08);
  for (const x of [-1, 1]) T.tri([x * 0.0008, 0.0016, 0.003], [x * 0.0022, 0.0016, 0.0028], [x * 0.0016, 0.0042, 0.0034], L('#2A2420'), 0, 0, [0, 0, -1]);
});
const pnBuildBatWing = () => pnMk((T, r, L) => {
  const c = L('#3A302A'), dn = [0.006, -1, 0], R0 = [0.001, 0, 0.0026], R1 = [0.001, 0, -0.0026];
  const P = [[0.0068, 0, 0.004], [0.0142, 0, 0.0012], [0.011, 0, -0.0026], [0.0062, 0, -0.0022]];
  T.tri(R0, P[0], P[3], c, 0, 0, dn); T.tri(P[0], P[1], P[2], c, 0, 0, dn); T.tri(P[0], P[2], P[3], c, 0, 0, dn); T.tri(R0, P[3], R1, c, 0, 0, dn);
});
/* Reh: Körper mit Beinen, Kopf mit Hals als eigenes Netz, das sich zum Grasen neigt (Drehpunkt am Halsansatz) */
const pnBuildDeer = () => pnMk((T, r, L) => {
  const f = [L('#9A6A3E'), L('#8C5E35')];
  T.ell(0, 0.044, 0, 0.0128, 0.0118, 0.025, f, 0, r, 1, null, 0, 0.5, 0.1);
  T.ell(0, 0.039, 0.002, 0.0098, 0.0072, 0.019, [L('#B88A5C')], 0, r, 1, null, 0, 0.5, 0.08);
  for (const [x, z] of [[-0.0072, 0.016], [0.0072, 0.016], [-0.0072, -0.016], [0.0072, -0.016]]) T.box(x - 0.0017, -0.002, z - 0.0017, x + 0.0017, 0.038, z + 0.0017, L('#7A5230'), 0);
  T.blob(0, 0.05, -0.0255, 0.0042, 1, [L('#F1ECE4')], 0, r, 0, null, 0, 0.5);
});
const pnBuildDeerHead = () => pnMk((T, r, L) => {
  const f = [L('#9A6A3E'), L('#8C5E35')];
  T.ell(0, 0.011, 0.0035, 0.0052, 0.0135, 0.0062, f, 0, r, 1, null, 0, 0.5, 0.08);
  T.ell(0, 0.0245, 0.0102, 0.0056, 0.0058, 0.0108, f, 0, r, 1, null, 0, 0.5, 0.08);
  T.box(-0.002, 0.0222, 0.0198, 0.002, 0.0252, 0.0218, L('#2A2420'), 0);
  for (const x of [-1, 1]) {
    T.tri([x * 0.0022, 0.0292, 0.0062], [x * 0.0038, 0.0292, 0.0048], [x * 0.0078, 0.0372, 0.0042], f[1], 0, 0, [0, 0.03, -1]);
    T.box(x * 0.0052 - 0.0006, 0.0262, 0.0128, x * 0.0052 + 0.0006, 0.0274, 0.0138, L('#151515'), 0);
  }
});

/* Teilchen (Blätter, Blüten, Tropfen) und Bänder (Regenbogen, Sturmschlieren) mit eigenen kleinen Shadern */
const PN_VS_PAR = `#version 300 es
layout(location=0) in vec2 a_q; layout(location=1) in vec4 a_p; layout(location=2) in vec4 a_u; layout(location=3) in vec4 a_v; layout(location=4) in vec4 a_c;
uniform mat4 u_vp;
out vec2 v_q; out vec4 v_c; out float v_k;
void main() { vec3 p = a_p.xyz + (a_u.xyz * a_q.x + a_v.xyz * a_q.y) * a_p.w; v_q = a_q; v_c = vec4(a_c.rgb, a_v.w); v_k = a_u.w; gl_Position = u_vp * vec4(p, 1.0); }`;
const PN_FS_PAR = `#version 300 es
precision highp float;
in vec2 v_q; in vec4 v_c; in float v_k;
out vec4 o;
void main() {
  float a; vec3 c = v_c.rgb;
  if (v_k < 0.5) a = smoothstep(1.0, 0.6, length(v_q));
  else if (v_k < 1.5) { float e = abs(v_q.x) - 0.56 * (1.0 - v_q.y * v_q.y); a = smoothstep(0.06, -0.06, e); c *= 1.0 - 0.28 * smoothstep(0.09, 0.0, abs(v_q.x)) * step(v_q.y, 0.8); }
  else a = smoothstep(1.0, 0.82, length(vec2(v_q.x / 0.62, v_q.y)));
  a *= v_c.a;
  if (a < 0.01) discard;
  o = vec4(c * a, a);
}`;
const PN_VS_BAND = `#version 300 es
layout(location=0) in vec3 a_p; layout(location=1) in vec2 a_uv;
uniform mat4 u_vp;
out vec2 v_uv;
void main() { v_uv = a_uv; gl_Position = u_vp * vec4(a_p, 1.0); }`;
/* Regenbogen in sechs klaren Streifen wie der Rest der Welt, außen rot. Der Nebenbogen ist umgedreht und blasser. */
const PN_FS_BAND = `#version 300 es
precision highp float;
in vec2 v_uv; uniform int u_k; uniform float u_a;
out vec4 o;
const vec3 RB[7] = vec3[7](vec3(0.93, 0.25, 0.22), vec3(0.98, 0.56, 0.18), vec3(0.99, 0.86, 0.3), vec3(0.4, 0.78, 0.36), vec3(0.27, 0.58, 0.9), vec3(0.52, 0.38, 0.84), vec3(0.52, 0.38, 0.84));
void main() {
  float a; vec3 c;
  if (u_k < 2) {
    float x = clamp(v_uv.y, 0.0, 0.999) * 6.0; int i = int(floor(x)); float e = fract(x);
    if (u_k == 1) { i = 5 - i; e = 1.0 - e; }
    c = mix(RB[i], RB[min(i + 1, 6)], smoothstep(0.82, 1.0, e) * (u_k == 1 ? 0.0 : 1.0));
    a = smoothstep(0.0, 0.12, v_uv.y) * smoothstep(1.0, 0.86, v_uv.y) * smoothstep(0.0, 0.2, v_uv.x) * smoothstep(1.0, 0.8, v_uv.x) * u_a;
  } else {
    c = vec3(1.0);
    a = pow(1.0 - abs(v_uv.y * 2.0 - 1.0), 1.6) * smoothstep(0.0, 0.55, v_uv.x) * smoothstep(1.0, 0.9, v_uv.x) * u_a;
  }
  o = vec4(c * a, a);
}`;
const PN_PAR_MAX = 180, PN_BAND_MAX = 900;

function pnLifeInit(I) {
  const gl = I.gl, up = M => I.upload(M);
  const m = {
    bird: up(pnBuildBird('#3B3F46', '#C8BBA6', '#2A2A2A')), wing: up(pnBuildWing(0.019, 0.0082, '#4A4F57', '#2A2D33')),
    gull: up(pnBuildBird('#F4F6F8', '#FFFFFF', '#E8B530')), gwing: up(pnBuildWing(0.026, 0.009, '#C9D1D8', '#2B2D30')),
    goose: up(pnBuildGoose()), xwing: up(pnBuildWing(0.03, 0.012, '#7E7468', '#3A3530')),
    drake: up(pnBuildDuck(false)), hen: up(pnBuildDuck(true)), chick: up(pnBuildChick()),
    fish: up(pnBuildFish('#B9C8D4', '#5E7686')), tfish: up(pnBuildFish('#F2A33A', '#2E6FB7')),
    fly: up(pnBuildFlyBody()), fwing: up(pnBuildFlyWing()), hare: up(pnBuildHare()),
    owl: up(pnBuildOwl()), owlHead: up(pnBuildOwlHead()), bat: up(pnBuildBat()), bwing: up(pnBuildBatWing()),
    deer: up(pnBuildDeer()), deerHead: up(pnBuildDeerHead())
  };
  const P = { par: pnProg(gl, PN_VS_PAR, PN_FS_PAR), band: pnProg(gl, PN_VS_BAND, PN_FS_BAND) };
  const parVao = gl.createVertexArray();
  gl.bindVertexArray(parVao);
  gl.bindBuffer(gl.ARRAY_BUFFER, I.quadBuf);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  const parBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, parBuf);
  gl.bufferData(gl.ARRAY_BUFFER, PN_PAR_MAX * 64, gl.DYNAMIC_DRAW);
  for (let i = 1; i <= 4; i++) { gl.enableVertexAttribArray(i); gl.vertexAttribPointer(i, 4, gl.FLOAT, false, 64, (i - 1) * 16); gl.vertexAttribDivisor(i, 1); }
  const bandVao = gl.createVertexArray();
  gl.bindVertexArray(bandVao);
  const bandBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, bandBuf);
  gl.bufferData(gl.ARRAY_BUFFER, PN_BAND_MAX * 20, gl.DYNAMIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 20, 0);
  gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 20, 12);
  gl.bindVertexArray(null);
  return {
    m, P, parVao, parBuf, bandVao, bandBuf, parArr: new Float32Array(PN_PAR_MAX * 16), bandArr: new Float32Array(PN_BAND_MAX * 5),
    par: [], parN: 0, bands: [], bandN: 0, parAcc: 0, duckA: Math.random() * 6, fish: null, fishNext: 4, splash: [], spl: new Float32Array(8), on: {}, gh: new Map()
  };
}

/* Licht für Teilchen (Blätter und Co.): wie im großen Shader, nur vereinfacht und auf der CPU */
const pnAces = x => Math.max(0, Math.min(1, (x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14)));
const pnShade = (c, l) => c.map((v, i) => pnAces(v * l[i] * 0.95) ** (1 / 2.2));
/* Lage eines Tiers: oben ist weg vom Planeten, vorn die Richtung, in die es läuft oder fliegt */
function pnOrient(p, fwd) {
  const y = pnV.norm(p), z = pnV.norm(pnV.sub(fwd, pnV.mul(y, pnV.dot(fwd, y)))), x = pnV.cross(y, z);
  return { x, y, z };
}
const pnFrameO = (o, p, s) => pnM.frame(o.x, o.y, o.z, p, s);
/* Ein Tier mit zwei Flügeln, die um die Längsachse schlagen. Kleine Flieger werfen keinen Schatten (ns). */
function pnFlyer(objs, body, wing, o, p, s, flap, tint, lift = 0.0016) {
  const c = Math.cos(flap), sn = Math.sin(flap), wp = pnV.add(p, pnV.mul(o.y, lift * s));
  objs.push({ mesh: body, M: pnM.frame(o.x, o.y, o.z, p, s), tint, ns: 1 });
  objs.push({ mesh: wing, M: pnM.frame(pnV.add(pnV.mul(o.x, c), pnV.mul(o.y, sn)), pnV.sub(pnV.mul(o.y, c), pnV.mul(o.x, sn)), o.z, wp, s), tint, ns: 1 });
  objs.push({ mesh: wing, M: pnM.frame(pnV.add(pnV.mul(o.x, -c), pnV.mul(o.y, sn)), pnV.add(pnV.mul(o.y, c), pnV.mul(o.x, sn)), o.z, wp, s), tint, ns: 1 });
}
/* Kalender fürs Tierleben (Nordhalbkugel, auf der Südhalbkugel ein halbes Jahr versetzt) */
function pnMonthDay(now, lat) {
  let m = now.getMonth() + 1;
  if (lat < 0) m = ((m + 5) % 12) + 1;
  return m * 100 + now.getDate();
}

/* Jedes Bild: wer gerade unterwegs ist, wo er ist und was er tut. Hängt Netze an objs, Treffer an I.hits, Lichter an I.pt. */
function pnLife(I, E, dt, now, objs, C) {
  if (!I.life) I.life = pnLifeInit(I);
  const Lf = I.life, m = Lf.m, S0 = I.world.scene, R = I.world.R, season = I.world.season || E.season, still = reduceMotion;
  const t = still ? 0 : I.t, alt = C.alt, K = E.K, beach = E.X.theme === 'beach', md = pnMonthDay(now, +E.loc.lat), on = Lf.on = {};
  const groundH = u => pnH(u, R);
  if (I.world.snowman && I.snow > 0.55 && E.snowLie > 0.3) on.snowman = true;
  const calm = !K.pk || K.pk === 'drizzle';
  // Vogelschwarm (am Strand Möwen): tagsüber bei ruhigem Wetter, kreist in einer langsam kippenden Bahn um den Planeten
  if (alt > -1 && calm && !K.storm && E.wind < 55) {
    on.birds = true;
    const n = beach ? 4 : 6, A = pnV.norm([Math.sin(I.t * 0.031) * 0.45, 1, 0.35 + Math.cos(I.t * 0.027) * 0.3]);
    const e1 = pnV.norm(pnV.cross(A, [0, 0, 1])), e2 = pnV.cross(A, e1);
    for (let i = 0; i < n; i++) {
      const th = t * 0.2 + i * 0.1 + Math.sin(i * 2.7) * 0.05, rr = 1.2 + (i % 3) * 0.03 + Math.sin(t * 0.7 + i) * 0.012;
      const side = Math.sin(i * 1.9) * 0.07 + Math.sin(t * 0.5 + i) * 0.015;
      const p = pnV.add(pnV.mul(pnV.add(pnV.mul(e1, Math.cos(th)), pnV.mul(e2, Math.sin(th))), rr), pnV.mul(A, side));
      const f = pnV.add(pnV.mul(e1, -Math.sin(th)), pnV.mul(e2, Math.cos(th)));
      const ph = (t * 0.55 + i * 0.37) % 1, flap = still ? 0.2 : ph < 0.62 ? 0.25 + 0.75 * Math.sin(t * 15 + i * 1.7) : 0.1;
      pnFlyer(objs, beach ? m.gull : m.bird, beach ? m.gwing : m.wing, pnOrient(p, f), p, beach ? 3.1 : 2.9, flap);
      if (i === 0) I.hits.push({ k: 'birds', p, r: 26, pri: -0.1 });
    }
  }
  // Zugvögel: Graugänse im V, im Frühling und Herbst ein paarmal pro Minute quer vorbei
  const mig = (md >= 225 && md <= 420) || (md >= 915 && md <= 1120);
  if (!beach && mig && alt > 2 && calm && !K.storm && E.wind < 45) {
    const per = 52, k = Math.floor(I.t / per), f = (I.t % per) / 16;
    if (f < 1) {
      on.geese = true;
      const mid = pnV.norm([0.12 + Math.sin(k * 1.7) * 0.15, 0.5 + Math.sin(k * 2.3) * 0.12, 1]), d0 = pnV.norm(pnV.cross([0.2, 1, 0.1], mid)), dir = md < 700 ? -1 : 1;
      const th = (f - 0.5) * 2.4 * dir, rr = 1.33;
      const pos = a => pnV.mul(pnV.add(pnV.mul(mid, Math.cos(a)), pnV.mul(d0, Math.sin(a))), rr);
      const p0 = pos(th), fw = pnV.mul(pnV.sub(pos(th + 0.01 * dir), p0), 1), o = pnOrient(p0, fw);
      for (let i = 0; i < 9; i++) {
        const rank = Math.ceil(i / 2), sd = i === 0 ? 0 : i % 2 ? 1 : -1;
        const p = pnV.add(p0, pnV.add(pnV.mul(o.z, -rank * 0.058), pnV.add(pnV.mul(o.x, sd * rank * 0.052), pnV.mul(o.y, Math.sin(t * 1.3 + i) * 0.004))));
        pnFlyer(objs, m.goose, m.xwing, o, p, 2.2, still ? 0.2 : 0.15 + 0.6 * Math.sin(t * 7 + i * 0.6), null, 0.0022);
      }
      I.hits.push({ k: 'geese', p: p0, r: 40, pri: -0.1 });
    }
  }
  // Enten: ziehen langsam Kreise auf der Seeseite gegenüber vom Steg, nachts kaum. Bei Eis und Sturm verstecken sie sich.
  const LK = S0.lake;
  if (LK && !beach && I.ice < 0.4 && !K.storm) {
    on.ducks = true;
    Lf.duckA += dt * (still ? 0 : C.night > 0.6 ? 0.015 : 0.065);
    const kids = md >= 420 && md <= 731, cx = -LK.dock[0] * 0.07, cz = -LK.dock[1] * 0.07, rad = 0.1;
    const at = (a, r2) => { const q = [cx + Math.cos(a) * r2, cz + Math.sin(a) * r2]; return pnV.norm(pnV.add(LK.y, pnV.add(pnV.mul(LK.x, q[0]), pnV.mul(LK.z, q[1])))); };
    const list = kids ? [[m.hen, 0, 1], [m.chick, 0.6, 1], [m.chick, 0.86, 1], [m.chick, 1.12, 1], [m.chick, 1.38, 1]] : [[m.drake, 0, 1], [m.hen, 0.75, 1]];
    list.forEach(([mesh, back, s], i) => {
      const a = Lf.duckA - back, r2 = rad + Math.sin(a * 3 + i) * 0.006, u = at(a, r2), u2 = at(a + 0.02, r2);
      const p = pnV.mul(u, PN_WL + 0.0005 + Math.sin(t * 2.1 + i * 1.3) * 0.0012);
      objs.push({ mesh, M: pnFrameO(pnOrient(p, pnV.sub(u2, u)), p, mesh === m.chick ? 2.3 : 2.5 * s) });
      if (i === 0) I.hits.push({ k: 'ducks', p, r: 24, pri: -0.15 });
    });
  }
  // Fische: springen ab und zu aus dem See, mit Ringen auf dem Wasser und ein paar Spritzern
  if (LK && I.ice < 0.4 && E.temp > 5 && !K.storm && !still) {
    on.fishOk = true;
    if (!Lf.fish && I.t > Lf.fishNext) {
      for (let tries = 0; tries < 8; tries++) {
        const a = Math.random() * 6.283, r2 = 0.03 + Math.random() * 0.14, q = [Math.cos(a) * r2, Math.sin(a) * r2];
        if (q[0] * LK.dock[0] + q[1] * LK.dock[1] > 0.04) continue;
        const d = Math.random() * 6.283;
        Lf.fish = { q, d: [Math.cos(d), Math.sin(d)], t0: I.t };
        Lf.splash.push({ q, t0: I.t });
        pnSplashDrops(Lf, LK, q, I.t);
        break;
      }
      Lf.fishNext = I.t + 6 + Math.random() * 11;
    }
    if (Lf.fish) {
      const F = Lf.fish, f = (I.t - F.t0) / 0.95;
      if (f >= 1) { const q2 = [F.q[0] + F.d[0] * 0.05, F.q[1] + F.d[1] * 0.05]; Lf.splash.push({ q: q2, t0: I.t }); pnSplashDrops(Lf, LK, q2, I.t); Lf.fish = null; }
      else {
        const q = [F.q[0] + F.d[0] * 0.05 * f, F.q[1] + F.d[1] * 0.05 * f], u = pnV.norm(pnV.add(LK.y, pnV.add(pnV.mul(LK.x, q[0]), pnV.mul(LK.z, q[1]))));
        const h = PN_WL - 0.006 + 0.085 * Math.sin(Math.PI * f), hd = pnV.add(pnV.mul(LK.x, F.d[0]), pnV.mul(LK.z, F.d[1]));
        const p = pnV.mul(u, h), fwd = pnV.add(pnV.mul(hd, 0.05), pnV.mul(u, 0.085 * Math.PI * Math.cos(Math.PI * f)));
        const z = pnV.norm(fwd), y0 = pnV.norm(pnV.sub(u, pnV.mul(z, pnV.dot(u, z)))), x = pnV.cross(y0, z);
        objs.push({ mesh: beach ? m.tfish : m.fish, M: pnM.frame(x, y0, z, p, 2.6), ns: 1 });
        on.fish = true;
        I.hits.push({ k: 'fish', p, r: 24, pri: -0.3 });
      }
    }
  }
  Lf.splash = Lf.splash.filter(s => I.t - s.t0 < 1.4);
  Lf.spl.fill(0);
  Lf.splash.slice(-2).forEach((s, i) => { const a = (I.t - s.t0) / 1.4; Lf.spl.set([s.q[0], s.q[1], 0.004 + a * 0.05, (1 - a) * 0.9], i * 4); });
  // Schmetterlinge: an warmen, ruhigen Tagen über den Blumenwiesen
  if (S0.flowers.length && alt > 6 && E.temp >= 14 && !K.pk && E.wind < 25 && (beach || (md >= 410 && md <= 930))) {
    on.butterflies = true;
    const tints = [[1, 1, 1], pnLin('#F4D03F'), pnLin('#F28C28'), pnLin('#6E9BF2')];
    for (let i = 0; i < 4; i++) {
      const c = S0.flowers[i % S0.flowers.length], fr = pnFrame(c, 1), ph = i * 2.1, sp = 0.8 + i * 0.13;
      let gh = Lf.gh.get(c);
      if (gh === undefined) { gh = groundH(c); Lf.gh.set(c, gh); }
      const pos = tt => { const a = tt * 0.6 * sp + ph + Math.sin(tt * 1.3 + ph) * 0.8, rd = 0.05 + 0.025 * Math.sin(tt * 0.9 + ph); return pnV.mul(pnV.norm(pnV.add(c, pnV.add(pnV.mul(fr.x, Math.cos(a) * rd), pnV.mul(fr.z, Math.sin(a) * rd)))), gh + 0.035 + 0.03 * Math.abs(Math.sin(tt * 1.7 + ph))); };
      const p = pos(t), p2 = pos(t + 0.05), o = pnOrient(p, pnV.sub(p2, p));
      pnFlyer(objs, m.fly, m.fwing, o, p, 2.7, still ? 0.6 : 0.55 + 0.75 * Math.sin(t * 23 + ph), tints[i], 0.0004);
      if (i === 0) I.hits.push({ k: 'butterfly', p, r: 22, pri: -0.2 });
    }
  }
  // Hase: hoppelt tagsüber und in der Dämmerung eine Runde über seine Wiese, macht zwischendurch Pause
  if (S0.hare && !beach && alt > -5 && !K.storm && K.pi < 0.7) {
    on.hare = true;
    const H0 = S0.hare, fr = pnFrame(H0.u, 1), cyc = t % 7, hop = cyc < 3.5, th = (Math.floor(t / 7) * 3.5 + Math.min(cyc, 3.5)) * 0.4;
    const u = pnV.norm(pnV.add(H0.u, pnV.add(pnV.mul(fr.x, Math.cos(th) * H0.r), pnV.mul(fr.z, Math.sin(th) * H0.r))));
    const dir = pnV.add(pnV.mul(fr.x, -Math.sin(th)), pnV.mul(fr.z, Math.cos(th)));
    const p = pnV.mul(u, groundH(u) - 0.001 + (hop ? 0.018 * Math.abs(Math.sin(Math.PI * ((t % 0.5) / 0.5))) : 0));
    objs.push({ mesh: m.hare, M: pnFrameO(pnOrient(p, dir), p, 2.1) });
    I.hits.push({ k: 'hare', p: pnV.mul(u, groundH(u) + 0.03), r: 24, pri: -0.2 });
  }
  // Reh: in der Morgen- und Abenddämmerung am Waldrand, bei Nebel auch tagsüber. Grast, hebt ab und zu den Kopf.
  if (S0.deer && !beach && alt > -8 && (alt < 12 || I.mist > 0.3) && !K.storm && K.pi < 0.75) {
    on.deer = true;
    const D = S0.deer, fr = pnFrame(D.u, 1, null, D.rot), gh = groundH(D.u) - 0.003, p = pnV.mul(D.u, gh), o = { x: pnV.norm(fr.x), y: pnV.norm(fr.y), z: pnV.norm(fr.z) }, s = 1.9;
    const cyc = t % 11, graze = cyc < 7.5, k = graze ? pnSmooth(0, 0.8, cyc) * (1 - pnSmooth(6.7, 7.5, cyc)) : 0;
    const pitch = 1.5 * k + (graze ? Math.sin(t * 5) * 0.06 * k : 0), yaw = graze ? 0 : Math.sin((cyc - 7.5) * 1.8) * 0.35;
    objs.push({ mesh: m.deer, M: pnM.frame(o.x, o.y, o.z, p, s) });
    // Kopf: erst um die Hochachse (umschauen), dann nach vorn unten (grasen), Drehpunkt am Halsansatz
    const cy = Math.cos(yaw), sy = Math.sin(yaw), z1 = pnV.add(pnV.mul(o.z, cy), pnV.mul(o.x, sy)), x1 = pnV.cross(o.y, z1);
    const cp = Math.cos(pitch), sp = Math.sin(pitch), z2 = pnV.sub(pnV.mul(z1, cp), pnV.mul(o.y, sp)), y2 = pnV.add(pnV.mul(o.y, cp), pnV.mul(z1, sp));
    const piv = pnV.add(p, pnV.add(pnV.mul(o.y, 0.05 * s), pnV.mul(o.z, 0.019 * s)));
    objs.push({ mesh: m.deerHead, M: pnM.frame(x1, y2, z2, piv, s) });
    I.hits.push({ k: 'deer', p: pnV.add(p, pnV.mul(o.y, 0.08)), r: 30, pri: -0.2 });
  }
  // Eule: nachts oben im Baum am Haus, schaut sich um, die Augen leuchten und blinzeln
  if (S0.owl && !beach && alt < -5 && !K.storm) {
    on.owl = true;
    const O = S0.owl, toCam = pnV.sub(C.eye, O.p), o = pnOrient(O.p, toCam), s = 3.1;
    const yaw = Math.sin(t * 0.35) * 0.55 + (t % 13 < 0.6 ? Math.sin(t * 9) * 0.4 : 0), cy = Math.cos(yaw), sy = Math.sin(yaw);
    const zh = pnV.add(pnV.mul(o.z, cy), pnV.mul(o.x, sy)), xh = pnV.cross(o.y, zh), hp = pnV.add(O.p, pnV.mul(o.y, 0.0215 * s));
    objs.push({ mesh: m.owl, M: pnM.frame(o.x, o.y, o.z, O.p, s) }, { mesh: m.owlHead, M: pnM.frame(xh, o.y, zh, hp, s) });
    if (C.night > 0.5 && (t % 5.3) > 0.16) for (const ex of [-0.0031, 0.0031]) I.pt(pnV.add(hp, pnV.add(pnV.mul(xh, ex * s), pnV.add(pnV.mul(o.y, 0.0083 * s), pnV.mul(zh, 0.0085 * s)))), 0.013, 1, 0.78, 0.25, 0.9);
    I.hits.push({ k: 'owl', p: hp, r: 22, pri: -0.3 });
  }
  // Fledermäuse: in warmen Sommernächten im Zickzack ums Haus
  if (alt < -3 && E.temp >= 10 && !K.pk && E.wind < 30 && md >= 501 && md <= 930) {
    on.bats = true;
    const c = PN_HOUSE, fr = pnFrame(c, 1);
    for (let i = 0; i < 3; i++) {
      const ph = i * 2.1, pos = tt => { const a = tt * 1.5 + ph + Math.sin(tt * 2.3 + ph) * 0.7, rd = 0.2 + 0.08 * Math.sin(tt * 1.1 + ph); return pnV.mul(pnV.norm(pnV.add(c, pnV.add(pnV.mul(fr.x, Math.cos(a) * rd), pnV.mul(fr.z, Math.sin(a) * rd)))), 1.2 + 0.07 * Math.sin(tt * 1.9 + ph)); };
      const p = pos(t), p2 = pos(t + 0.03);
      pnFlyer(objs, m.bat, m.bwing, pnOrient(p, pnV.sub(p2, p)), p, 3.1, still ? 0.3 : Math.sin(t * 24 + ph) * 0.85, null, 0.0008);
      if (i === 0) I.hits.push({ k: 'bats', p, r: 24, pri: -0.2 });
    }
  }
  pnParticles(I, E, dt, C, season);
  pnBands(I, E, C);
}
/* Spritzer, wenn ein Fisch ein- oder auftaucht */
function pnSplashDrops(Lf, LK, q, t0) {
  const u = pnV.norm(pnV.add(LK.y, pnV.add(pnV.mul(LK.x, q[0]), pnV.mul(LK.z, q[1])))), p = pnV.mul(u, PN_WL + 0.002);
  for (let i = 0; i < 7; i++) {
    const a = Math.random() * 6.283, h = pnV.add(pnV.mul(LK.x, Math.cos(a)), pnV.mul(LK.z, Math.sin(a)));
    Lf.par.push({ k: 0, p: p.slice(), v: pnV.add(pnV.mul(h, 0.04 + Math.random() * 0.04), pnV.mul(u, 0.12 + Math.random() * 0.07)), t0, life: 0.9, s: 0.0055, col: [0.85, 0.92, 1], drop: true });
  }
}

/* Blätter im Herbst, Blüten im Frühling: lösen sich aus den Kronen, trudeln mit dem Wind nach unten und bleiben kurz liegen */
function pnParticles(I, E, dt, C, season) {
  const Lf = I.life, S0 = I.world.scene, still = reduceMotion;
  const crowns = S0.crowns, autumn = season.k === 'autumn' && crowns.length, spring = season.k === 'spring' && crowns.some(c => c.blossom);
  let rate = 0;
  if (autumn) rate = (0.9 + 2.4 * Math.min(1, E.ws) + 0.8 * season.bare) * (E.K.storm ? 1.5 : 1);
  else if (spring) rate = 0.8 + 1.4 * Math.min(1, E.ws);
  if (rate && !still) {
    Lf.on[autumn ? 'leaves' : 'petals'] = true;
    Lf.parAcc += dt * rate;
    const pool = autumn ? crowns : crowns.filter(c => c.blossom), cols = autumn ? PN_COL.leaf.autumn.map(pnLin) : ['#F7D2E0', '#FFFFFF', '#F2C4D6', '#F9E3EC'].map(pnLin);
    while (Lf.parAcc >= 1) {
      Lf.parAcc -= 1;
      if (Lf.par.length >= PN_PAR_MAX - 12) break;
      const c = pool[Math.floor(Math.random() * pool.length)], fr = pnFrame(pnV.norm(c.p), 1), a = Math.random() * 6.283, rr = Math.random() * c.r * 0.8;
      const p = pnV.add(c.p, pnV.add(pnV.mul(fr.x, Math.cos(a) * rr), pnV.add(pnV.mul(fr.z, Math.sin(a) * rr), pnV.mul(fr.y, (Math.random() - 0.6) * c.r))));
      Lf.par.push({ k: autumn ? 1 : 2, p, t0: I.t, life: 12, s: autumn ? 0.021 + Math.random() * 0.007 : 0.013 + Math.random() * 0.004, col: cols[Math.floor(Math.random() * cols.length)], ph: Math.random() * 6.3, w1: 1.5 + Math.random() * 2.5, w2: 2 + Math.random() * 3, g: pnH(pnV.norm(p), I.world.R), fall: autumn ? 0.016 + Math.random() * 0.008 : 0.01 + Math.random() * 0.006 });
    }
  } else Lf.parAcc = 0;
  // Bewegen und für die GPU einpacken
  const light = pnV.add(pnV.add(pnV.mul(C.ska, 1.05), pnV.mul(C.sunC, 0.72)), pnV.add(pnV.mul(C.moonC, 0.7), [0.02, 0.025, 0.04]));
  const A = Lf.parArr;
  let n = 0;
  Lf.par = Lf.par.filter(q => I.t - q.t0 < q.life);
  for (const q of Lf.par) {
    const age = I.t - q.t0, up = pnV.norm(q.p);
    let u = null, v = null, a = 1;
    if (q.drop) {
      q.v = pnV.sub(q.v, pnV.mul(up, 0.42 * dt));
      q.p = pnV.add(q.p, pnV.mul(q.v, dt));
      if (pnV.dot(q.p, up) < PN_WL) { q.life = 0; continue; }
      const fr = pnFrame(up, 1); u = pnV.norm(fr.x); v = pnV.norm(fr.z); a = 0.85 * (1 - age / q.life);
    } else {
      const fr = pnFrame(up, 1), t1 = pnV.norm(fr.x), t2 = pnV.norm(fr.z);
      if (!q.land) {
        const wt = pnV.sub(E.wv, pnV.mul(up, pnV.dot(E.wv, up))), fl = Math.sin(age * 2.2 + q.ph);
        q.p = pnV.add(q.p, pnV.mul(pnV.add(pnV.add(pnV.mul(up, -q.fall), pnV.mul(wt, 0.05)), pnV.add(pnV.mul(t1, fl * 0.012), pnV.mul(t2, Math.cos(age * 1.7 + q.ph) * 0.008))), dt));
        if (Math.hypot(...q.p) <= q.g + 0.003) { q.land = I.t; q.life = Math.min(q.life, age + 4); q.p = pnV.mul(pnV.norm(q.p), q.g + 0.003); }
        const a1 = age * q.w1 + q.ph, a2 = age * q.w2;
        u = pnV.add(pnV.mul(t1, Math.cos(a1)), pnV.mul(t2, Math.sin(a1)));
        v = pnV.norm(pnV.add(pnV.mul(up, Math.cos(a2)), pnV.mul(pnV.cross(u, up), Math.sin(a2))));
      } else {
        const a1 = q.ph;
        u = pnV.add(pnV.mul(t1, Math.cos(a1)), pnV.mul(t2, Math.sin(a1))); v = pnV.cross(up, u);
      }
      a = Math.min(1, age / 0.4) * Math.min(1, (q.life - age) / 1.2);
    }
    if (n >= PN_PAR_MAX) break;
    const c = q.drop ? q.col : pnShade(q.col, light);
    A.set([q.p[0], q.p[1], q.p[2], q.s, u[0], u[1], u[2], q.k, v[0], v[1], v[2], a, c[0], c[1], c[2], 0], n * 16);
    n++;
  }
  Lf.parN = n;
}

/* Regenbogen und Sturmschlieren als Bänder (Dreiecksstreifen), jedes Bild neu berechnet */
function pnBands(I, E, C) {
  const Lf = I.life, B = Lf.bandArr, bands = Lf.bands = [];
  let o = 0;
  const vd = pnV.norm(C.eye), right = pnV.norm(pnV.cross([0, 1, 0], vd)), upc = pnV.cross(vd, right);
  const strip = (k, a, pts) => {
    if (o + pts.length > PN_BAND_MAX) return;
    bands.push({ k, a, first: o, n: pts.length });
    for (const [p, uv] of pts) { B.set([p[0], p[1], p[2], uv[0], uv[1]], o * 5); o++; }
  };
  // Regenbogen: gegenüber der Sonne hinter dem Planeten, je tiefer die Sonne, desto höher der Bogen. Er schaut immer zu dir.
  if (I.rbow > 0.01) {
    Lf.on.rainbow = true;
    // Im Spiegel, auf dem Nachttisch und im kleinen Urlaubsplaneten etwas kleiner, damit er nicht an der Kante abgeschnitten wird
    const sx = pnV.dot(E.sunD, right), sy = pnV.dot(E.sunD, upc), tight = I.mode !== 'card' && I.mode !== 'full', R1 = tight ? 1.3 : 1.5, lim = tight ? 0.26 : 0.5;
    const cx = Math.max(-lim, Math.min(lim, -sx * 0.6)), cy = Math.max(-0.8, Math.min(-0.25, -0.3 - Math.max(0, sy) * 0.55));
    const Cc = pnV.add(pnV.add(pnV.mul(right, cx), pnV.mul(upc, cy)), pnV.mul(vd, -0.55));
    for (const [k, R0, w, a] of [[0, R1, 0.11, 0.7], [1, R1 * 1.19, 0.075, 0.28]]) {
      const pts = [], N = 56, a0 = 0.02 * Math.PI, a1 = 0.98 * Math.PI;
      for (let i = 0; i <= N; i++) {
        const f = i / N, an = a0 + (a1 - a0) * f, d = pnV.add(pnV.mul(right, Math.cos(an)), pnV.mul(upc, Math.sin(an)));
        pts.push([pnV.add(Cc, pnV.mul(d, R0)), [f, 0]], [pnV.add(Cc, pnV.mul(d, R0 - w)), [f, 1]]);
      }
      strip(k, I.rbow * a, pts);
    }
    I.hits.push({ k: 'rainbow', p: pnV.add(Cc, pnV.mul(upc, R1 - 0.05)), r: 46, pri: 0.3 });
  }
  // Sturm: weiße Schlieren ziehen in Windrichtung um den Planeten
  if (E.gale > 0.01 && !reduceMotion) {
    Lf.on.gale = true;
    const wd = Math.hypot(E.wv[0], E.wv[2]) > 1e-3 ? pnV.norm(E.wv) : [1, 0, 0];
    for (let i = 0; i < 6; i++) {
      const tilt = (i - 2.5) * 0.17, A = pnV.norm(pnV.cross([0, 1, 0], wd));
      const ax = pnV.norm(pnV.add(A, [0, tilt, 0])), e1 = pnV.norm(pnV.cross(ax, [0.31, 0.2, 0.93])), e2 = pnV.cross(ax, e1);
      const rr = 1.08 + (i % 3) * 0.05, head = I.t * (0.55 + (i % 2) * 0.2) + i * 1.9, len = 0.75, pts = [];
      for (let k = 0; k <= 22; k++) {
        const f = k / 22, th = head - len * (1 - f), p = pnV.mul(pnV.add(pnV.mul(e1, Math.cos(th)), pnV.mul(e2, Math.sin(th))), rr + Math.sin(th * 3 + i) * 0.015);
        const tg = pnV.add(pnV.mul(e1, -Math.sin(th)), pnV.mul(e2, Math.cos(th))), side = pnV.mul(pnV.norm(pnV.cross(tg, pnV.sub(C.eye, p))), 0.009 * (0.4 + 0.6 * f));
        pts.push([pnV.add(p, side), [f, 0]], [pnV.sub(p, side), [f, 1]]);
      }
      strip(2, 0.32 + 0.4 * E.gale, pts);
    }
  }
  Lf.bandN = o;
}

/* Zeichnen nach den Wolken: Regenbogen (hinter dem Planeten), Blätter und Tropfen, Schlieren */
function pnLifeDraw(I, VP) {
  const Lf = I.life, gl = I.gl;
  if (!Lf || (!Lf.parN && !Lf.bandN)) return;
  gl.enable(gl.BLEND); gl.blendFuncSeparate(gl.ONE, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  gl.enable(gl.DEPTH_TEST); gl.depthMask(false);
  if (Lf.bandN) {
    const Q = Lf.P.band;
    gl.useProgram(Q.p);
    gl.uniformMatrix4fv(Q.u.u_vp, false, VP);
    gl.bindVertexArray(Lf.bandVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, Lf.bandBuf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, Lf.bandArr, 0, Lf.bandN * 5);
    for (const b of Lf.bands) { gl.uniform1i(Q.u.u_k, b.k); gl.uniform1f(Q.u.u_a, b.a); gl.drawArrays(gl.TRIANGLE_STRIP, b.first, b.n); }
  }
  if (Lf.parN) {
    const Q = Lf.P.par;
    gl.useProgram(Q.p);
    gl.uniformMatrix4fv(Q.u.u_vp, false, VP);
    gl.bindVertexArray(Lf.parVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, Lf.parBuf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, Lf.parArr, 0, Lf.parN * 16);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, Lf.parN);
  }
  gl.depthMask(true); gl.disable(gl.BLEND);
}
