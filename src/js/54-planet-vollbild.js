/* Wetterplanet, Teil 3: Vollbild und Nachttisch.
 * Vollbild: dieselbe Zeichenfläche wandert aus der Karte in eine Ebene über dem ganzen Cockpit (kein zweiter WebGL-Kontext).
 * Unten ein Regler für die Stunden (gestern bis übermorgen, mit dem Wetter aus den Stundenwerten) oder fürs Jahr (Jahreszeiten,
 * Sonnenbahn, Deko), dazu die letzten 24 Stunden im Zeitraffer. Antippen von Sonne, Mond, Wolken, Haus, Auto, Flugzeug, Windrad,
 * Bäumen, ISS oder Polarlicht zeigt kurz, was dahintersteckt. Steht ein Urlaub mit Reiseziel an, dreht sich oben rechts ein zweiter
 * Planet mit dem Wetter dort. Antippen tauscht die beiden.
 * Nachttisch: der Planet groß mit Uhr, nachts gedimmt, der Bildschirm bleibt an (Wake Lock), auf Wunsch leise Geräusche zum Wetter
 * (Regen, Wind, Grillen, Donner), alles mit WebAudio erzeugt, ohne Dateien. Die Geräusche sind am Anfang aus. */
const pnFs = { open: false, id: '', I: null, trip: null, tripKey: '', el: null, mode: 'h', val: 0, rp: 0, night: false, wake: null, tick: 0, idleT: 0, infoT: 0, back: null, swap: false };
const PN_SND_KEY = 'jere-cockpit-planet-ton';
const pnSvg = (d, fill) => `<svg viewBox="0 0 24 24" ${fill ? 'fill="currentColor" stroke="none"' : 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"'} aria-hidden="true">${d}</svg>`;
const PN_ICO = {
  close: pnSvg('<path d="M6 6l12 12M18 6L6 18"/>'),
  night: pnSvg('<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>'),
  sound: pnSvg('<path d="M4 9.5h3.5L12 6v12l-4.5-3.5H4z"/><path d="M15.5 9a4.2 4.2 0 0 1 0 6M18 6.5a7.8 7.8 0 0 1 0 11"/>'),
  mute: pnSvg('<path d="M4 9.5h3.5L12 6v12l-4.5-3.5H4z"/><path d="M16 9.5l5 5M21 9.5l-5 5"/>'),
  play: pnSvg('<path d="M8 5.5v13l10.5-6.5z"/>', true),
  stop: pnSvg('<rect x="7" y="7" width="10" height="10" rx="1.5"/>', true),
  info: pnSvg('<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 7.6v.1"/>')
};
const pnDeg = x => `${Math.round(x)}°`.replace('-', '−');
const pnDoy = d => Math.round((sod(d) - new Date(d.getFullYear(), 0, 1)) / DAY);
const pnDirName = deg => ['Nord', 'Nordost', 'Ost', 'Südost', 'Süd', 'Südwest', 'West', 'Nordwest'][Math.round(((deg % 360) + 360) % 360 / 45) % 8];
const pnMoonName = p => p < 0.03 || p > 0.97 ? 'Neumond' : p < 0.22 ? 'Zunehmende Sichel' : p < 0.28 ? 'Zunehmender Halbmond' : p < 0.47 ? 'Zunehmender Mond' : p < 0.53 ? 'Vollmond' : p < 0.72 ? 'Abnehmender Mond' : p < 0.78 ? 'Abnehmender Halbmond' : 'Abnehmende Sichel';
/* Der große Planet: normalerweise deiner, nach dem Tauschen der Urlaubsplanet */
const pnFsBig = () => (pnFs.swap && pnFs.trip ? pnFs.trip : pnFs.I);
const pnFsQ = s => pnFs.el.querySelector(s);

function pnFsOpen(id) {
  if (pnFs.open) pnFsClose();
  if (pnLeg.el) pnLegClose();
  const v = views.get(id), I = pn.inst.get(id);
  if (!v || !I || !I.ok) return;
  const el = document.createElement('div');
  el.className = 'pnf';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-label', 'Wetterplanet im Vollbild');
  el.innerHTML = `<div class="pnf-stage" data-r="stage"></div>
    <div class="pnf-top">
      <p class="pnf-cap"><b data-r="temp"></b><span data-r="desc"></span><span class="pnf-place" data-r="place"></span></p>
      <div class="pnf-btns">
        <button type="button" class="pnf-btn pnf-btn-leg" data-a="legend" aria-expanded="false" aria-label="Was der Planet zeigt" title="Was der Planet zeigt">${PN_ICO.info}</button>
        <button type="button" class="pnf-btn" data-a="sound" aria-pressed="false" aria-label="Geräusche zum Wetter" title="Geräusche zum Wetter">${PN_ICO.mute}</button>
        <button type="button" class="pnf-btn" data-a="night" aria-pressed="false" aria-label="Nachttisch Modus" title="Nachttisch Modus">${PN_ICO.night}</button>
        <button type="button" class="pnf-btn" data-a="close" aria-label="Vollbild schließen" title="Schließen (Esc)">${PN_ICO.close}</button>
      </div>
    </div>
    <div class="pnf-trip" data-r="trip" hidden><div class="pnf-trip-st" data-r="tripst"></div><p class="pnf-trip-cap" data-r="tripcap"></p></div>
    <div class="pnf-hint" data-r="hint" hidden></div>
    <div class="pnf-info" data-r="info" role="status" hidden></div>
    <div class="pnf-clock" aria-hidden="true"><b data-r="time"></b><span data-r="date"></span><span data-r="wx"></span></div>
    <div class="pnf-bar">
      <div class="seg pnf-seg" role="group" aria-label="Regler"><button type="button" data-m="h" aria-pressed="true">Stunden</button><button type="button" data-m="y" aria-pressed="false">Jahr</button></div>
      <div class="pnf-range"><input type="range" data-r="range" aria-label="Zeitpunkt"><output data-r="when">Jetzt</output></div>
      <div class="pnf-acts"><button type="button" class="pnf-pill" data-a="now">Jetzt</button><button type="button" class="pnf-pill" data-a="replay">${PN_ICO.play}<span>24 h Zeitraffer</span></button></div>
    </div>`;
  document.body.appendChild(el);
  Object.assign(pnFs, { el, open: true, id, I, back: document.activeElement, swap: false, tripKey: '', mode: 'h', val: 0, night: false });
  document.documentElement.classList.add('pnf-lock');
  I.setMode('full');
  pnFsQ('[data-r="stage"]').appendChild(I.cv);
  I.vis = true; I.lastTs = 0; I.idle = performance.now();
  I.onPick = pnFsPickFor(I);
  // Knöpfe
  el.addEventListener('click', e => {
    const a = e.target.closest('[data-a]'), m = e.target.closest('[data-m]'), go = e.target.closest('[data-go]');
    if (go) { const g = go.dataset.go; pnFsClose(); nwJump(g); return; }
    if (m) { pnFsReplayStop(); pnFsSetMode(m.dataset.m); return; }
    if (!a) return;
    if (a.dataset.a === 'close') pnFsClose();
    else if (a.dataset.a === 'night') pnFsNight(!pnFs.night);
    else if (a.dataset.a === 'sound') pnSndSet(!pnSnd.on);
    else if (a.dataset.a === 'now') { pnFsReplayStop(); pnFsSetMode('h'); }
    else if (a.dataset.a === 'replay') pnFsReplay();
    else if (a.dataset.a === 'tripform') pnFsTripForm();
    else if (a.dataset.a === 'legend') { pnFsInfoHide(); pnLegOpen(pnFs.el, pnFsBig(), a); }
  });
  pnFsQ('[data-r="range"]').addEventListener('input', e => { pnFsReplayStop(); pnFs.val = +e.target.value; pnFsApply(); });
  el.addEventListener('keydown', pnFsKey);
  for (const t of ['pointermove', 'pointerdown', 'keydown']) el.addEventListener(t, pnFsIdle, { passive: true });
  pnFsSetMode('h');
  pnFsTrip();
  pnSndSet(!!lsGet(PN_SND_KEY), true);
  pnFs.tick = setInterval(pnFsTick, 1000);
  pnFsTick();
  pnFsQ('[data-a="close"]').focus({ preventScroll: true });
  pnWake();
}
function pnFsClose() {
  if (!pnFs.open) return;
  if (pnLeg.el) pnLegClose();
  pnFsReplayStop();
  pnSndStop();
  if (pnFs.night) pnFsNight(false);
  clearInterval(pnFs.tick); clearTimeout(pnFs.idleT); clearTimeout(pnFs.infoT);
  if (pnFs.trip) { pnFs.trip.destroy(); pnFs.trip = null; }
  const I = pnFs.I, v = views.get(pnFs.id);
  if (I) {
    I.ovr = null; I.envAt = 0;
    I.onPick = pnCardPick(pnFs.id);
    I.setMode('card');
    if (v) v.q('[data-r="stage"]').appendChild(I.cv);
    I.vis = true; I.lastTs = 0;
  }
  pnFs.el.remove();
  Object.assign(pnFs, { el: null, open: false, I: null, swap: false, tripKey: '' });
  document.documentElement.classList.remove('pnf-lock');
  if (pnFs.back && pnFs.back.isConnected && pnFs.back.focus) pnFs.back.focus({ preventScroll: true });
  pnWake();
}
function pnFsKey(e) {
  // Tastenkürzel des Cockpits (Seiten, Suche, Spiegel) gelten im Vollbild nicht
  e.stopPropagation();
  if (e.key === 'Escape') {
    e.preventDefault();
    if (!pnFsQ('[data-r="info"]').hidden) pnFsInfoHide();
    else if (pnFs.night) pnFsNight(false);
    else pnFsClose();
    return;
  }
  // Fokus bleibt im Vollbild
  if (e.key === 'Tab') {
    const f = [...pnFs.el.querySelectorAll('button, input, canvas[tabindex]')].filter(x => x.offsetParent !== null && !x.disabled);
    if (!f.length) return;
    const i = f.indexOf(document.activeElement), n = e.shiftKey ? (i <= 0 ? f.length - 1 : i - 1) : (i < 0 || i === f.length - 1 ? 0 : i + 1);
    e.preventDefault();
    f[n].focus();
  }
}

/* Regler: Stunden von gestern bis übermorgen in Viertelstunden, oder das Jahr in Tagen */
function pnFsSetMode(m) {
  pnFs.mode = m;
  const r = pnFsQ('[data-r="range"]');
  for (const b of pnFs.el.querySelectorAll('[data-m]')) b.setAttribute('aria-pressed', String(b.dataset.m === m));
  if (m === 'h') { r.min = -24; r.max = 48; r.step = 0.25; pnFs.val = 0; }
  else { r.min = 0; r.max = 364; r.step = 1; pnFs.val = pnDoy(new Date()); }
  r.value = pnFs.val;
  pnFsApply();
}
function pnFsApply() {
  let ovr = null;
  if (pnFs.mode === 'h' && Math.abs(pnFs.val) > 0.01) ovr = { k: 'h', t: Date.now() + pnFs.val * 36e5 };
  if (pnFs.mode === 'y' && pnFs.val !== pnDoy(new Date())) ovr = { k: 'y', doy: pnFs.val };
  for (const V of [pnFs.I, pnFs.trip]) if (V) { V.ovr = ovr; V.envAt = 0; if (ovr && ovr.k === 'h') { const D = pnDataOf(V); if (D) pnHourly(D.loc); } }
  pnFsQ('[data-a="now"]').disabled = !ovr;
  pnFsLabel();
  pnFsCaption();
  pnWake();
}
function pnFsLabel() {
  const out = pnFsQ('[data-r="when"]'), V = pnFsBig(), D = pnDataOf(V), t = V.now();
  if (pnFs.mode === 'h') {
    if (!V.ovr) { out.textContent = 'Jetzt'; return; }
    const n = dayDiff(new Date(), t), day = n === 0 ? 'Heute' : n === 1 ? 'Morgen' : n === -1 ? 'Gestern' : WDL[t.getDay()];
    const h = D && pnHourly(D.loc), x = h && pnAtHour(h, +t);
    const e = D && pnx.hourly.get(pnKey(D.loc)), wait = e && (e.busy || !e.tried) ? ' · Stundenwerte laden …' : ' · ohne Stundenwerte, das Wetter bleibt wie jetzt';
    out.textContent = `${day} ${hm(t)} Uhr${x ? ` · ${pnDeg(x.temperature_2m)} ${(WMO[x.weather_code] || [''])[0]}` : D && !h ? wait : ''}`;
  } else {
    const S = sunDay(t, D ? D.loc : skyLoc());
    out.textContent = `${t.getDate()}. ${ML[t.getMonth()]}${S.rise && S.set ? ` · Sonne ${hm(S.rise)} bis ${hm(S.set)}` : ''}`;
  }
}
/* 24 Stunden in 20 Sekunden, danach wieder jetzt */
function pnFsReplay() {
  if (pnFs.rp) { pnFsReplayStop(); return; }
  pnFsSetMode('h');
  const t0 = performance.now(), r = pnFsQ('[data-r="range"]'), b = pnFsQ('[data-a="replay"]');
  b.innerHTML = `${PN_ICO.stop}<span>Stopp</span>`;
  pnFs.rp = setInterval(() => {
    const f = Math.min(1, (performance.now() - t0) / 20000);
    pnFs.val = -24 + 24 * f;
    r.value = pnFs.val;
    pnFsApply();
    if (f >= 1) { pnFsReplayStop(); pnFsSetMode('h'); }
  }, 50);
}
function pnFsReplayStop() {
  if (!pnFs.rp) return;
  clearInterval(pnFs.rp);
  pnFs.rp = 0;
  if (pnFs.el) pnFsQ('[data-a="replay"]').innerHTML = `${PN_ICO.play}<span>24 h Zeitraffer</span>`;
}

/* Beschriftung oben: Temperatur, Wetter, Ort des großen Planeten, passend zur gewählten Zeit */
function pnFsCapOf(V) {
  const E = V && V.env, D = V && pnDataOf(V), c = E && E.c ? E.c : D && D.c;
  return c ? { temp: Number.isFinite(c.temperature_2m) ? pnDeg(c.temperature_2m) : '', desc: (WMO[c.weather_code] || [''])[0], place: V.opts.place ? V.opts.place.name : D ? D.name : '' } : null;
}
function pnFsCaption() {
  const cap = pnFsCapOf(pnFsBig());
  pnFsQ('[data-r="temp"]').textContent = cap ? cap.temp : '';
  pnFsQ('[data-r="desc"]').textContent = cap ? cap.desc : 'Wetter wird geladen';
  pnFsQ('[data-r="place"]').textContent = cap ? cap.place : '';
}
function pnFsRefresh() { if (!pnFs.open) return; pnFsLabel(); pnFsCaption(); pnFsTripCap(); }

/* Urlaubsplanet: steht ein Urlaub mit Reiseziel an, dreht er sich oben rechts. Ohne Ziel gibt es bis 60 Tage vorher einen Hinweis. */
function pnFsTrip() {
  const box = pnFsQ('[data-r="trip"]'), hint = pnFsQ('[data-r="hint"]'), T = pnTrip(new Date());
  const key = T && T.place ? `trip:${T.e.id}:${pnKey(T.place)}` : '';
  if (key !== pnFs.tripKey) {
    if (pnFs.swap) pnFsSwap();
    if (pnFs.trip) { pnFs.trip.destroy(); pnFs.trip = null; }
    pnFs.tripKey = key;
    if (key) {
      const P = { how: 'fixed', name: T.place.name, lat: +T.place.lat, lon: +T.place.lon };
      const V = pnMake(key, pnFs.id, pnFsQ('[data-r="tripst"]'), 'trip', { place: P, seed: pnHashStr(key), theme: Math.abs(P.lat) < 42.5 ? 'beach' : 'home', trip: true });
      V.onPick = pnFsPickFor(V);
      V.vis = true;
      V.ovr = pnFs.I.ovr;
      V.cv.setAttribute('aria-label', `Urlaubsplanet für ${P.name}, antippen zum Tauschen`);
      pnFs.trip = V;
    }
  }
  box.hidden = !pnFs.trip;
  const want = T && !T.place && T.days <= 60;
  hint.hidden = !want;
  const html = want ? `<p><b>${esc(T.e.label || 'Urlaub')}</b> ${T.now ? 'läuft gerade' : T.days === 0 ? 'geht heute los' : T.days === 1 ? 'geht morgen los' : `in ${T.days} Tagen`}. Mit einem Reiseziel dreht sich hier ein zweiter Planet mit dem Wetter dort.</p><button type="button" class="pnf-pill" data-a="tripform">Reiseziel eintragen</button>` : '';
  if (hint.dataset.html !== html) { hint.innerHTML = html; hint.dataset.html = html; }
  pnFsTripCap();
}
function pnFsTripCap() {
  const el = pnFs.el && pnFsQ('[data-r="tripcap"]'), T = pnTrip(new Date());
  if (!el || !pnFs.trip || !T) return;
  // Im kleinen Fenster steht, was dort gerade zu sehen ist
  const small = pnFs.swap ? pnFs.I : pnFs.trip, cap = pnFsCapOf(small);
  const when = T.now ? 'Urlaub läuft' : T.days === 0 ? 'heute geht’s los' : T.days === 1 ? 'morgen geht’s los' : `noch ${T.days} Tage`;
  el.innerHTML = pnFs.swap ? `<b>${esc(cap ? cap.place || 'Zuhause' : 'Zuhause')}</b>${cap ? ` ${esc(cap.temp)}` : ''}` : `<b>${esc(T.place.name)}</b> ${esc(when)}${cap ? ` · ${esc(cap.temp)} ${esc(cap.desc)}` : ''}`;
}
function pnFsSwap() {
  if (!pnFs.trip) return;
  pnFs.swap = !pnFs.swap;
  const big = pnFsBig(), small = pnFs.swap ? pnFs.I : pnFs.trip;
  pnFsQ('[data-r="stage"]').appendChild(big.cv);
  pnFsQ('[data-r="tripst"]').appendChild(small.cv);
  big.setMode('full'); small.setMode('trip');
  big.vis = small.vis = true;
  big.cv.focus({ preventScroll: true });
  big.idle = small.idle = performance.now();
  pnFsInfoHide();
  if (pnLeg.el) pnLeg.V = big;
  pnFsRefresh();
  pnSndUpdate();
}
function pnFsTripForm() {
  const T = pnTrip(new Date());
  pnFsClose();
  if (!T || !pagesUsing('vacation').length) return;
  nwJump('vacation');
  setTimeout(() => openVacForm(T.e, true), 350);
}

/* Antippen: der kleine Planet tauscht, sonst Infos zum Getroffenen oder (daneben) eine Runde drehen */
function pnFsPickFor(V) {
  return hit => {
    const small = pnFs.swap ? V === pnFs.I : V === pnFs.trip;
    if (small) { pnFsSwap(); return true; }
    if (!hit) { pnFsInfoHide(); return false; }
    const html = pnFsInfoHtml(hit, V);
    if (!html) { pnFsInfoHide(); return false; }
    pnFsInfoShow(html, V, hit);
    return true;
  };
}
function pnFsInfoHtml(hit, V) {
  const E = V.env, now = V.now();
  if (!E) return '';
  const box = (t, ...lines) => `<b>${esc(t)}</b>${lines.filter(Boolean).map(l => `<span>${l}</span>`).join('')}`;
  const btn = (go, label) => (pagesUsing(go).length ? `<button type="button" class="pnf-pill" data-go="${go}">${esc(label)}</button>` : '');
  const wind = `Wind ${Math.round(E.wind)} km/h aus ${pnDirName(E.wdir)}`;
  switch (hit.k) {
    case 'sun': {
      const S = sunDay(now, E.loc);
      if (!S.rise || !S.set) return box('Sonne', S.max > 0 ? 'Geht heute gar nicht unter' : 'Geht heute gar nicht auf');
      return box('Sonne', `Aufgang ${hm(S.rise)}, Untergang ${hm(S.set)} Uhr`, `${hrsMin(S.set - S.rise)} Tageslicht, mittags ${Math.round(S.max)}° hoch`);
    }
    case 'moon': return box('Mond', pnMoonName(E.ph), `${Math.round(E.ill * 100)} % beleuchtet`);
    case 'cloud': return box('Wolken', `${Math.round(E.cover)} % bedeckt${E.c ? `, ${esc((WMO[E.c.weather_code] || [''])[0])}` : ''}`, wind);
    case 'mill': return box('Windrad', wind, E.wind > 90 ? 'Bei Sturm steht es still, wie echte Windräder auch.' : 'Dreht so schnell, wie es draußen weht.');
    case 'house': case 'flag': {
      const A = pnAgenda(now), ev = e => `${e.a ? 'ganztags' : hm(new Date(e.s))} ${esc(e.t)}`;
      if (!A) return box('Termine', 'Noch kein Kalender verbunden.', btn('cal', 'Zum Kalender'));
      const t = A.today.slice(0, 3).map(ev), m = A.tomorrow.slice(0, 2).map(ev);
      return box('Termine', t.length ? `Heute: ${t.join(' · ')}` : 'Heute keine mehr', m.length ? `Morgen: ${m.join(' · ')}` : 'Morgen nichts', btn('cal', 'Zum Kalender'));
    }
    case 'car': {
      const C = E.car, s = cm.sum;
      if (!C) return '';
      const st = C.st === 'drive' ? (C.dir === 'work' ? 'Unterwegs zur Arbeit' : 'Auf dem Heimweg') : C.st === 'away' ? `Steht bei der Arbeit${C.back ? `, Feierabend ${hm(new Date(C.back))} Uhr` : ''}` : 'Steht zu Hause';
      const live = s ? `${s.mins} Min ${s.dir === 'home' ? 'nach Hause' : 'zur Arbeit'}${s.delay >= 1 ? `, ${Math.round(s.delay)} Min Verzögerung` : ', freie Fahrt'}` : '';
      return box('Dein Auto', st, live, btn('commute', 'Zum Pendeln'));
    }
    case 'plane': {
      const T = E.trip;
      if (!T) return '';
      const lab = esc(T.e.label || 'Urlaub'), a = parseYmd(T.e.from), b = parseYmd(T.e.to);
      return box('Urlaub', T.now ? `${lab} läuft gerade` : `${lab} ${T.days === 0 ? 'geht heute los' : T.days === 1 ? 'geht morgen los' : `in ${T.days} Tagen`}`, `${WD[a.getDay()]} ${dm(a)} bis ${WD[b.getDay()]} ${dm(b)}`, T.place ? `Ziel: ${esc(T.place.name)}` : '', btn('vacation', 'Zum Urlaub'));
    }
    case 'tree': {
      const hb = pnHabitTrees(new Date());
      return box('Gewohnheitswald', `${hb.n} ${hb.n === 1 ? 'Baum' : 'Bäume'}, einer für jeden geschafften Tag`, hb.today ? 'Heute ist schon einer dazugekommen.' : 'Hak heute alles ab, dann kommt noch einer dazu.', btn(widgetsOf('habits').map(([i]) => i).find(i => pagesUsing(i).length) || 'habits', 'Zu den Gewohnheiten'));
    }
    case 'iss': return E.iss ? box('ISS', 'Fliegt gerade über dich hinweg', `rund ${Math.round(E.iss.h)} km hoch, ${Math.round(E.iss.el)}° über dem Horizont`, 'Draußen ein heller, ruhiger Punkt am Himmel.') : '';
    case 'aurora': return box('Polarlicht', Number.isFinite(E.kp) ? `Kp ${numDe(E.kp, 1)}` : '', 'Bei klarem Himmel lohnt ein Blick nach Norden, am besten weg vom Stadtlicht.');
    case 'birds': return box(E.X.theme === 'beach' ? 'Möwen' : 'Vögel', 'Fliegen tagsüber, wenn es ruhig ist.', 'Bei Regen und Sturm bleiben sie am Boden.');
    case 'geese': return box('Zugvögel', now.getMonth() < 6 ? 'Graugänse auf dem Weg zurück in den Norden.' : 'Graugänse auf dem Weg in den Süden.', 'Im V sparen sie Kraft, jede fliegt im Aufwind der vorderen.');
    case 'ducks': return box('Enten', V.life && V.life.on && V.life.on.ducks && now.getMonth() >= 3 && now.getMonth() <= 6 ? 'Eine Mutter mit ihren Küken.' : 'Ein Stockentenpaar, er mit grünem Kopf.', E.alt < -3 ? 'Nachts dösen sie und treiben nur langsam.' : 'Bei Eis und Sturm verstecken sie sich im Schilf.');
    case 'fish': return box('Fisch', 'Springt ab und zu aus dem See.', `Das Wasser hat gerade etwa ${pnDeg(Math.max(4, E.temp * 0.8))}.`);
    case 'butterfly': return box('Schmetterlinge', 'Flattern an warmen, ruhigen Tagen über den Blumen.', `Gerade ${pnDeg(E.temp)} und ${Math.round(E.wind)} km/h Wind.`);
    case 'hare': return box('Hase', 'Hoppelt über seine Wiese und macht zwischendurch Pause.');
    case 'deer': return box('Reh', 'Grast in der Dämmerung am Waldrand.', 'Morgens und abends sind Rehe am aktivsten.');
    case 'owl': return box('Eule', 'Sitzt nachts oben im Baum am Haus und hält Ausschau.');
    case 'bats': return box('Fledermäuse', 'Jagen in warmen Sommernächten Insekten ums Haus.');
    case 'snowman': return box('Schneemann', E.c && Number.isFinite(E.c.snow_depth) ? `Draußen liegen ${Math.round(E.c.snow_depth * 100)} cm Schnee.` : 'Draußen liegt Schnee.', 'Er bleibt, bis der Schnee weg ist.');
    case 'rainbow': return box('Regenbogen', 'Die Sonne steht tief und hinter dir regnet es noch.', 'Draußen lohnt ein Blick: Er steht immer gegenüber der Sonne.');
    default: return '';
  }
}
function pnFsInfoShow(html, V, hit) {
  const el = pnFsQ('[data-r="info"]'), rc = V.cv.getBoundingClientRect(), orc = pnFs.el.getBoundingClientRect();
  el.innerHTML = html;
  el.hidden = false;
  const w = el.offsetWidth, h = el.offsetHeight, x = rc.left - orc.left + hit.sx, y = rc.top - orc.top + hit.sy;
  el.style.left = `${Math.max(12, Math.min(orc.width - w - 12, x - w / 2))}px`;
  el.style.top = `${y + 22 + h > orc.height - 110 ? Math.max(12, y - h - 22) : y + 22}px`;
  clearTimeout(pnFs.infoT);
  pnFs.infoT = setTimeout(pnFsInfoHide, 9000);
}
function pnFsInfoHide() { if (pnFs.el) pnFsQ('[data-r="info"]').hidden = true; }

/* Nachttisch: groß, mit Uhr, ohne Regler. Wo es geht im echten Vollbild und mit wachem Bildschirm. */
async function pnFsNight(on) {
  if (!pnFs.el) return;
  pnFs.night = on;
  pnFs.el.classList.toggle('night', on);
  pnFsQ('[data-a="night"]').setAttribute('aria-pressed', String(on));
  pnFsQ('[data-a="night"]').setAttribute('aria-label', on ? 'Nachttisch Modus beenden' : 'Nachttisch Modus');
  if (on) {
    pnFsReplayStop();
    pnFsInfoHide();
    if (pnLeg.el) pnLegClose();
    if (pnFs.swap) pnFsSwap();
    pnFsSetMode('h');
    try { if (pnFs.el.requestFullscreen && !document.fullscreenElement) await pnFs.el.requestFullscreen({ navigationUI: 'hide' }); } catch { /* geht nicht überall, etwa auf dem iPhone */ }
    pnFsWake();
    pnFsIdle();
  } else {
    if (pnFs.wake) { pnFs.wake.release().catch(() => {}); pnFs.wake = null; }
    if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {});
    pnFs.el.classList.remove('idle');
  }
  pnFsBig().setMode(on ? 'night' : 'full');
  pnFsTick();
  pnSndUpdate();
}
async function pnFsWake() {
  if (!navigator.wakeLock || pnFs.wake) return;
  try {
    pnFs.wake = await navigator.wakeLock.request('screen');
    pnFs.wake.addEventListener('release', () => { pnFs.wake = null; });
  } catch { /* ohne Wake Lock geht der Bildschirm wie gewohnt aus */ }
}
document.addEventListener('visibilitychange', () => { if (!document.hidden && pnFs.open && pnFs.night) pnFsWake(); });
/* Liegt der Fokus nicht im Vollbild (etwa nach dem Tauschen), gelten Esc und Co. trotzdem fürs Vollbild */
window.addEventListener('keydown', e => { if (pnFs.open && !pnFs.el.contains(e.target)) pnFsKey(e); }, true);
/* Im Nachttisch blenden sich die Knöpfe nach vier Sekunden ohne Bewegung aus */
function pnFsIdle() {
  if (!pnFs.el) return;
  pnFs.el.classList.remove('idle');
  clearTimeout(pnFs.idleT);
  if (pnFs.night) pnFs.idleT = setTimeout(() => { if (pnFs.el && pnFs.night) pnFs.el.classList.add('idle'); }, 4000);
}
/* Jede Sekunde: Uhr, Dimmen bei Nacht, Beschriftung, Urlaubsplanet, Geräusche */
function pnFsTick() {
  if (!pnFs.open) return;
  const now = new Date(), V = pnFsBig(), D = pnDataOf(V), loc = D ? D.loc : skyLoc();
  if (pnFs.night) {
    pnFsQ('[data-r="time"]').textContent = hm(now);
    pnFsQ('[data-r="date"]').textContent = `${WDL[now.getDay()]}, ${now.getDate()}. ${ML[now.getMonth()]}`;
    const cap = pnFsCapOf(V);
    pnFsQ('[data-r="wx"]').textContent = cap ? `${cap.temp} ${cap.desc}${cap.place ? ` · ${cap.place}` : ''}` : '';
    pnFs.el.dataset.dim = sunAlt(now, +loc.lat, +loc.lon) < -4 ? '1' : '';
  } else delete pnFs.el.dataset.dim;
  // Läuft die Zeit am Regler mit, bleibt die Beschriftung aktuell
  if (pnFs.mode === 'h' && !pnFs.rp && pnFs.I.ovr) { pnFs.I.ovr.t = Date.now() + pnFs.val * 36e5; if (pnFs.trip) pnFs.trip.ovr = pnFs.I.ovr; }
  pnFsTrip();
  pnFsRefresh();
  pnSndUpdate();
}

/* Geräusche zum Wetter: weißes Rauschen als Quelle, daraus Regen (Bandpass) und Wind (Tiefpass, der langsam atmet),
 * Grillen als kurze hohe Töne in warmen Sommernächten, Donner als tiefes Grollen nach dem Blitz. */
const pnSnd = { ctx: null, n: null, on: false, crOn: false, crT: 0 };
function pnSndSet(on, quiet) {
  pnSnd.on = on;
  if (!quiet) lsSet(PN_SND_KEY, on);
  if (pnFs.el) {
    const b = pnFsQ('[data-a="sound"]');
    b.setAttribute('aria-pressed', String(on));
    b.innerHTML = on ? PN_ICO.sound : PN_ICO.mute;
    b.setAttribute('aria-label', on ? 'Geräusche aus' : 'Geräusche zum Wetter an');
  }
  if (on) pnSndStart(); else pnSndStop();
}
function pnSndStart() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  try {
    if (!pnSnd.ctx) pnSnd.ctx = new AC();
    const ctx = pnSnd.ctx;
    ctx.resume().catch(() => {});
    if (pnSnd.n) { pnSndUpdate(); return; }
    const len = ctx.sampleRate * 2, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf; src.loop = true;
    const master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);
    const rainF = ctx.createBiquadFilter(), rainG = ctx.createGain();
    rainF.type = 'bandpass'; rainF.frequency.value = 2400; rainF.Q.value = 0.5; rainG.gain.value = 0;
    src.connect(rainF); rainF.connect(rainG); rainG.connect(master);
    const windF = ctx.createBiquadFilter(), windG = ctx.createGain();
    windF.type = 'lowpass'; windF.frequency.value = 420; windF.Q.value = 1.2; windG.gain.value = 0;
    src.connect(windF); windF.connect(windG); windG.connect(master);
    const lfo = ctx.createOscillator(), lfoG = ctx.createGain(), lfo2 = ctx.createOscillator(), lfo2G = ctx.createGain();
    lfo.frequency.value = 0.08; lfoG.gain.value = 160; lfo.connect(lfoG); lfoG.connect(windF.frequency); lfo.start();
    lfo2.frequency.value = 0.13; lfo2G.gain.value = 0; lfo2.connect(lfo2G); lfo2G.connect(windG.gain); lfo2.start();
    const cr = ctx.createOscillator(), crG = ctx.createGain();
    cr.frequency.value = 4300; crG.gain.value = 0; cr.connect(crG); crG.connect(master); cr.start();
    src.start();
    pnSnd.n = { src, master, rainF, rainG, windF, windG, lfo, lfo2, lfo2G, cr, crG };
    pnSnd.crT = setInterval(pnSndChirp, 900);
    pnSndUpdate();
  } catch (e) { console.warn('Wetterplanet, Ton:', e); }
}
function pnSndStop() {
  clearInterval(pnSnd.crT);
  pnSnd.crT = 0;
  const ctx = pnSnd.ctx, n = pnSnd.n;
  if (!ctx || !n) return;
  pnSnd.n = null;
  n.master.gain.setTargetAtTime(0, ctx.currentTime, 0.25);
  setTimeout(() => {
    try { n.src.stop(); n.cr.stop(); n.lfo.stop(); n.lfo2.stop(); n.master.disconnect(); } catch { /* schon aus */ }
    if (!pnSnd.n) ctx.suspend().catch(() => {});
  }, 900);
}
/* Lautstärken aus der Szene des großen Planeten */
function pnSndUpdate() {
  const S = pnSnd, V = pnFs.open && pnFsBig(), E = V && V.env;
  if (!S.n || !E) return;
  const t = S.ctx.currentTime, n = S.n, drizzle = E.K.pk === 'drizzle', rain = E.K.pk === 'rain' ? E.K.pi : drizzle ? E.K.pi * 0.6 : 0, w = Math.min(1.3, E.wind / 40);
  n.rainG.gain.setTargetAtTime(rain ? 0.05 + rain * 0.32 : 0, t, 1.2);
  n.rainF.frequency.setTargetAtTime(drizzle ? 3600 : 2400, t, 1);
  n.windG.gain.setTargetAtTime(0.015 + w * 0.2, t, 2);
  n.lfo2G.gain.setTargetAtTime(w * 0.07, t, 2);
  n.windF.frequency.setTargetAtTime(280 + w * 420, t, 2);
  S.crOn = E.season.k === 'summer' && E.temp >= 14 && E.alt < -2 && !E.K.pk && E.wind < 25;
  n.master.gain.setTargetAtTime(pnFs.night ? 0.3 : 0.45, t, 1.5);
}
function pnSndChirp() {
  const S = pnSnd;
  if (!S.n || !S.crOn || Math.random() < 0.25) return;
  const t = S.ctx.currentTime + Math.random() * 0.3, g = S.n.crG.gain;
  S.n.cr.frequency.setValueAtTime(4100 + Math.random() * 500, t);
  for (let k = 0; k < 3; k++) { const a = t + k * 0.075; g.setValueAtTime(0, a); g.linearRampToValueAtTime(0.035, a + 0.012); g.linearRampToValueAtTime(0, a + 0.05); }
}
/* Donner ein bis drei Sekunden nach dem Blitz: braunes Rauschen durch einen Tiefpass, das langsam ausrollt */
function pnSndThunder(V) {
  const S = pnSnd;
  if (!S.n || !pnFs.open || V !== pnFsBig()) return;
  try {
    const ctx = S.ctx, t = ctx.currentTime + 0.8 + Math.random() * 2.2, len = Math.floor(ctx.sampleRate * 3.5), buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = last * 3.5; }
    const src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    src.buffer = buf; f.type = 'lowpass'; f.frequency.value = 160;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.9, t + 0.08); g.gain.exponentialRampToValueAtTime(0.001, t + 3.4);
    src.connect(f); f.connect(g); g.connect(S.n.master);
    src.start(t); src.stop(t + 3.5);
  } catch { /* egal */ }
}
