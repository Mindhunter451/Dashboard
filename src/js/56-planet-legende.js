/* Wetterplanet, Teil 5 (seit 3.14): das Infofeld „Was der Planet zeigt“.
 * Alles, was auf dem Planeten passieren kann, mit dem Wann dazu. Was gerade zu sehen ist, bekommt einen Punkt in der Akzentfarbe
 * und steht oben unter „Gerade zu sehen“. In der Karte über den Knopf mit dem i, im Vollbild genauso. Solange es offen ist,
 * wird es alle zwei Sekunden aufgefrischt. */
const PN_LEG = [
  ['Himmel', [
    ['sun', 'Sonne und Mond', 'Laufen nach der echten Uhrzeit, der Mond mit seiner echten Phase.', (I, E) => E.alt > -1 || E.moonD[1] > 0],
    ['stars', 'Sterne', 'In klaren Nächten.', (I, E) => E.alt < -6 && E.cover < 60],
    ['meteors', 'Sternschnuppen', (I, E) => `Nachts bei klarem Himmel ab und zu, in den Nächten der großen Ströme viel öfter. ${pnLegShower(E.now)}`, (I, E) => E.alt < -9 && E.cover < 60],
    ['aurora', 'Polarlicht', 'Wenn der Kp-Index hoch genug ist und der Himmel klar.', I => I.aurA > 0.05],
    ['iss', 'ISS', 'Wenn sie wirklich gerade über dich fliegt und du sie sehen könntest.', (I, E) => !!E.iss],
    ['rainbow', 'Regenbogen', 'Wenn die Sonne tief steht und es gerade regnet oder eben geregnet hat.', I => I.rbow > 0.05]
  ]],
  ['Wetter', [
    ['clouds', 'Wolken, Regen und Schnee', 'Nach dem echten Wetter. Schnee bleibt liegen, solange er draußen liegt.', (I, E) => E.n > 0 || !!E.K.pk],
    ['storm', 'Gewitter', 'Mit Blitzen, im Vollbild auf Wunsch mit Donner.', (I, E) => E.K.storm],
    ['hail', 'Hagel', 'Bei Gewitter mit Hagel.', (I, E) => E.hail],
    ['fog', 'Nebel und Frühnebel', 'Bei Nebel, an ruhigen, feuchten Morgen auch Schwaden über Wiese und See.', I => I.mist > 0.05],
    ['frost', 'Raureif', 'In klaren Frostnächten bis zum Vormittag.', I => I.frost > 0.05],
    ['ice', 'Eis auf dem See', 'Ab etwa −2 Grad.', I => I.ice > 0.3],
    ['snowman', 'Schneemann', 'Steht vor dem Haus, solange Schnee liegt.', I => I.life && I.life.on.snowman],
    ['gale', 'Sturmschlieren', 'Ab etwa 40 km/h Wind.', (I, E) => E.gale > 0.01],
    ['heat', 'Hitze', 'Ab etwa 27 Grad wird das Gras strohig.', I => I.dry > 0.05],
    ['haze', 'Dunst und Saharastaub', 'Bei schlechter Luft wird es milchig, bei Staub aus der Sahara gelblich.', (I, E) => E.haze > 0.05 || E.dust > 0.05],
    ['mill', 'Windrad', 'Dreht nach dem echten Wind, bei Sturm steht es still.', (I, E) => E.X.cockpit],
    ['smoke', 'Rauch aus dem Schornstein', 'Wenn es kälter als 12 Grad ist.', (I, E) => E.smoke]
  ]],
  ['Tiere', [
    ['birds', 'Vögel', 'Tagsüber bei ruhigem Wetter, am Strand Möwen.', I => I.life && I.life.on.birds],
    ['geese', 'Zugvögel', 'Gänse im V, Ende Februar bis April und Mitte September bis November.', I => I.life && I.life.on.geese],
    ['ducks', 'Enten', 'Auf dem See, von Mitte April bis Juli mit Küken. Bei Eis und Sturm verstecken sie sich.', I => I.life && I.life.on.ducks],
    ['fish', 'Fische', 'Springen ab und zu aus dem See, solange er nicht gefroren ist.', I => I.life && I.life.on.fishOk],
    ['butterflies', 'Schmetterlinge', 'An warmen, ruhigen Tagen von April bis September über den Blumen.', I => I.life && I.life.on.butterflies],
    ['hare', 'Hase', 'Hoppelt tagsüber und in der Dämmerung über seine Wiese.', I => I.life && I.life.on.hare],
    ['deer', 'Reh', 'In der Morgen- und Abenddämmerung am Waldrand, bei Nebel auch tagsüber.', I => I.life && I.life.on.deer],
    ['owl', 'Eule', 'Nachts oben im Baum am Haus, mit leuchtenden Augen.', I => I.life && I.life.on.owl],
    ['bats', 'Fledermäuse', 'In warmen Sommernächten ums Haus.', I => I.life && I.life.on.bats],
    ['ffly', 'Glühwürmchen', 'In warmen Sommernächten über den Wiesen.', (I, E) => E.ffly],
    ['cat', 'Katze', 'Sitzt bei Regen im Fenster.', (I, E) => !!(E.wet && E.X.cockpit)]
  ]],
  ['Jahreszeiten und Feste', [
    ['season', 'Bäume und Wiese', 'Wechseln mit den Jahreszeiten. Blumen im Frühling und Sommer, Pilze im Herbst.', () => true],
    ['leaves', 'Fallende Blätter', 'Im Herbst, bei Wind mehr.', I => I.life && I.life.on.leaves],
    ['petals', 'Blütenblätter', 'Im Frühling, wenn die Bäume blühen.', I => I.life && I.life.on.petals],
    ['pumpkins', 'Kürbisse', '20. Oktober bis 2. November, abends leuchten sie.', (I, E) => E.X.pumpkins],
    ['xmas', 'Lichterkette', '1. Dezember bis 6. Januar, am Haus und an der Kiefer.', (I, E) => E.X.xmas],
    ['fw', 'Feuerwerk', 'An Silvester ab 18 Uhr, um Mitternacht richtig viel.', (I, E) => E.fw > 0]
  ]],
  ['Dein Cockpit', [
    ['car', 'Dein Auto', 'Fährt zur Pendelzeit los. Antippen öffnet das Pendeln.', (I, E) => !!E.car && E.car.st !== 'away'],
    ['flag', 'Fähnchen', 'Weht, solange heute noch ein Termin ansteht.', (I, E) => E.flag],
    ['habit', 'Gewohnheitswald', (I, E) => `Ein Baum für jeden geschafften Gewohnheitstag${E.habitN ? `, gerade ${E.habitN}` : ''}.`, (I, E) => E.habitN > 0],
    ['plane', 'Flugzeug', 'In den 30 Tagen vor dem Urlaub.', (I, E) => E.plane],
    ['trip', 'Urlaubsplanet', 'Im Vollbild, sobald beim Urlaub ein Reiseziel eingetragen ist.', (I, E) => !!(E.trip && E.trip.place)]
  ]]
];
/* Diese Dinge sind fast immer da und tauchen deshalb nicht unter „Gerade zu sehen“ auf */
const PN_LEG_QUIET = new Set(['sun', 'season', 'mill', 'clouds', 'smoke']);
function pnLegShower(now) {
  const t = +sod(now || new Date());
  let best = null;
  for (const [m, d, , name] of PN_SHOWERS) for (const y of [now.getFullYear(), now.getFullYear() + 1]) {
    const at = +new Date(y, m - 1, d);
    if (at >= t - DAY && (!best || at < best.at)) best = { at, name };
  }
  if (!best) return '';
  const n = Math.round((best.at - t) / DAY), dd = new Date(best.at);
  return n <= 0 ? `Heute Nacht: ${best.name}.` : n === 1 ? `Morgen Nacht: ${best.name}.` : `Nächster Strom: ${best.name} am ${dd.getDate()}. ${ML[dd.getMonth()]}.`;
}
/* Inhalt für eine Zeichenfläche: oben das Jetzt, darunter alles nach Gruppen */
function pnLegHtml(I) {
  const E = I && I.env;
  if (!E) return '<p class="pn-leg-sub">Der Planet lädt noch.</p>';
  const on = [], groups = PN_LEG.map(([g, items]) => {
    const rows = items.map(([k, name, when, act]) => {
      let a = false;
      try { a = !!act(I, E); } catch { a = false; }
      if (a && !PN_LEG_QUIET.has(k)) on.push(name);
      const w = typeof when === 'function' ? when(I, E) : when;
      return `<li class="${a ? 'on' : ''}"><i aria-hidden="true"></i><span><b>${esc(name)}</b>${a ? '<em>gerade zu sehen</em>' : ''}<small>${esc(w)}</small></span></li>`;
    }).join('');
    return `<section><h4>${esc(g)}</h4><ul>${rows}</ul></section>`;
  }).join('');
  const now = on.length ? `<p class="pn-leg-now"><b>Gerade zu sehen:</b> ${on.map(esc).join(', ')}</p>` : '<p class="pn-leg-now">Gerade ist es ruhig auf dem Planeten.</p>';
  return `${now}${groups}<p class="pn-leg-sub">Alles hängt am echten Wetter, an der Uhrzeit und an deinem Cockpit. Im Vollbild kannst du vieles antippen.</p>`;
}
/* Öffnen und Schließen. host: wohin das Feld kommt (Bühne der Karte oder das Vollbild), V: welcher Planet gemeint ist */
const pnLeg = { el: null, V: null, T: 0, btn: null };
function pnLegOpen(host, V, btn) {
  if (pnLeg.el) { const same = pnLeg.btn === btn; pnLegClose(); if (same) return; }
  const el = document.createElement('div');
  el.className = host.classList.contains('pnf') ? 'pn-leg pnf-leg' : 'pn-leg';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', 'Was der Planet zeigt');
  el.innerHTML = `<div class="pn-leg-head"><h3>Was der Planet zeigt</h3><button type="button" class="pn-leg-x" aria-label="Schließen" title="Schließen">${PN_ICO.close}</button></div><div class="pn-leg-body" tabindex="0"></div>`;
  host.appendChild(el);
  Object.assign(pnLeg, { el, V, btn });
  if (btn) btn.setAttribute('aria-expanded', 'true');
  el.querySelector('.pn-leg-x').addEventListener('click', e => { e.stopPropagation(); pnLegClose(true); });
  el.addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); pnLegClose(true); } });
  // Ziehen und Tippen im Feld sollen den Planeten nicht drehen
  for (const t of ['pointerdown', 'click', 'wheel']) el.addEventListener(t, e => e.stopPropagation(), { passive: true });
  pnLegFill();
  pnLeg.T = setInterval(pnLegFill, 2000);
  el.querySelector('.pn-leg-x').focus({ preventScroll: true });
}
function pnLegFill() {
  const el = pnLeg.el;
  if (!el || !el.isConnected) { pnLegClose(); return; }
  const body = el.querySelector('.pn-leg-body'), html = pnLegHtml(pnLeg.V);
  if (body.dataset.html !== html) { const st = body.scrollTop; body.innerHTML = html; body.dataset.html = html; body.scrollTop = st; }
}
/* Neuigkeit in 3.14: zum Planeten springen (oder ihn neben das Wetter legen) und das Feld gleich öffnen */
function pnLegShow() {
  pnShow(false);
  setTimeout(() => {
    const id = widgetsOf('planet').map(([i]) => i).find(i => pagesUsing(i).length), v = id && views.get(id);
    if (v) pnLegOpen(v.q('[data-r="stage"]'), pn.inst.get(id), v.q('[data-r="legend"]'));
  }, 520);
}
function pnLegClose(focus) {
  clearInterval(pnLeg.T);
  if (pnLeg.el) pnLeg.el.remove();
  if (pnLeg.btn) { pnLeg.btn.setAttribute('aria-expanded', 'false'); if (focus && pnLeg.btn.isConnected) pnLeg.btn.focus({ preventScroll: true }); }
  Object.assign(pnLeg, { el: null, V: null, btn: null, T: 0 });
}
