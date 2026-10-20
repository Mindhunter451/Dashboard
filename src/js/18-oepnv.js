/* Öffis im Pendeln: Verbindungen von Tür zu Tür über Transitous (/plan), umschaltbar mit dem Auto.
 * Abgesprochen mit Transitous im Matrix-Raum (Oktober 2026): höchstens eine Anfrage alle 5 Minuten, nur solange die
 * Pendeln-Karte zu sehen ist oder der Spiegel sie zeigt, dazwischen aus dem Zwischenspeicher. Die Quellen sind verlinkt,
 * der Kontakt steht unten auf der Seite. Damit Transitous ihn findet, schicken die Abrufe die volle Seitenadresse als Referer.
 * Gefragt wird ohne Linienverläufe (detailedLegs=false), das hält die Antwort klein. */
const PT_CACHE = 'jere-cockpit-oepnv', PT_FRESH = 5 * 6e4, PT_GAP = 15e3;
const TRS_REF = { referrerPolicy: 'no-referrer-when-downgrade' };
const pt = { store: null, busy: false, last: 0, err: '', errAt: 0, sel: null };
const PT_ERR = {
  net: 'Die Fahrplanauskunft ist gerade nicht erreichbar. In zwei Minuten probiert es das Cockpit wieder.',
  busy: 'Die Fahrplanauskunft ist gerade überlastet. In zwei Minuten probiert es das Cockpit wieder.',
  svc: 'Mit deinen Adressen findet die Fahrplanauskunft gerade nichts. Prüf sie über die Regler oben.'
};
const PT_WALK = '<svg class="pt-wi" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="13.2" cy="4.3" r="1.9" fill="currentColor" stroke="none"/><path d="M12.6 9.2 11 15.6l3.1 2.6.9 3.4M11 15.6l-2.2 5.6M12.6 9.2l-3.4 1.6-.7 3.2M12.6 9.2l1.5 3 3 1.1"/></svg>';
const ptMode = () => !!(state.widgets.commute && state.widgets.commute.cfg.mode === 'pt');
const ptHm = ms => hm(new Date(ms));
const ptMin = ms => Math.max(1, Math.round(ms / 6e4));

/* Nach Hause vor Feierabend: Verbindungen ab Feierabend, sonst ab jetzt */
function ptWhen(now) {
  if (cm.dir !== 'home') return null;
  const wb = workBar();
  if (!wb || freeReason(wb, now)) return null;
  const end = at(now, wb.end);
  return +end - +now > 10 * 6e4 ? end : null;
}
function ptQuery(now) {
  const [a, b] = cmPlaces();
  if (!a || !b || a.lat == null || b.lat == null) return null;
  const t = ptWhen(now), r = x => (+x).toFixed(5);
  return { k: `${cm.dir}|${r(a.lat)},${r(a.lon)}|${r(b.lat)},${r(b.lon)}${t ? '|' + hm(t) : ''}`, a, b, t, r };
}

/* Zwischenspeicher: die jüngsten drei Abfragen (hin, zurück und ab Feierabend), übersteht das Neuladen */
function ptStore() {
  if (!pt.store) { const s = lsGet(PT_CACHE); pt.store = s && s.v === 1 && s.e && typeof s.e === 'object' ? s : { v: 1, e: {} }; }
  return pt.store;
}
function ptSave(k, entry) {
  const s = ptStore();
  s.e[k] = entry;
  for (const x of Object.keys(s.e).sort((p, q) => s.e[q].at - s.e[p].at).slice(3)) delete s.e[x];
  lsSet(PT_CACHE, s);
}

/* Nur behalten, was Karte, Spiegel und „Jetzt wichtig“ brauchen */
function ptStop(p, dep, rt, c) {
  const t = Date.parse(dep ? p.departure || p.scheduledDeparture : p.arrival || p.scheduledArrival);
  const s = Date.parse(dep ? p.scheduledDeparture || p.departure : p.scheduledArrival || p.arrival);
  return { n: String(p.name || '').replace(/^Hamburg,\s*/, '').trim().slice(0, 60), t, s: Number.isFinite(s) ? s : t, rt, c, tr: String(p.track || '').slice(0, 8), str: String(p.scheduledTrack || '').slice(0, 8), x: !!p.cancelled };
}
function ptAlerts(l) {
  const out = [], seen = new Set();
  for (const a of [...(l.alerts || []), ...((l.from && l.from.alerts) || []), ...((l.to && l.to.alerts) || [])]) {
    const h = String(a.headerText || '').trim(), d = String(a.descriptionText || '').trim(), k = (h || d).slice(0, 120);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push({ h: (h || d).slice(0, 200), d: h && d && d !== h ? d.slice(0, 800) : '' });
    if (out.length >= 2) break;
  }
  return out;
}
function ptSlimLeg(l) {
  const t0 = Date.parse(l.startTime), t1 = Date.parse(l.endTime);
  if (!Number.isFinite(t0) || !Number.isFinite(t1) || !l.from || !l.to) return null;
  if (/^(WALK|BIKE|CAR|RENTAL|FLEX|ODM)/.test(String(l.mode || ''))) return { w: 1, t0, t1 };
  const line = dpLine(l), cat = dpCat(l.mode, line), [bg, fg] = dpColor(l, cat), rt = !!l.realTime;
  const f = ptStop(l.from, true, rt, cat), a = ptStop(l.to, false, rt, cat);
  if (!Number.isFinite(f.t) || !Number.isFinite(a.t)) return null;
  return {
    line, cat, bg, fg, f, a, rt, x: !!(l.cancelled || f.x || a.x),
    hs: String(l.headsign || (l.tripTo && l.tripTo.name) || '').replace(/^Hamburg,\s*/, '').trim().slice(0, 60),
    ns: Array.isArray(l.intermediateStops) ? l.intermediateStops.length : -1, al: ptAlerts(l)
  };
}
function ptSlim(it) {
  const legs = (it.legs || []).map(ptSlimLeg).filter(Boolean), s = Date.parse(it.startTime), e = Date.parse(it.endTime);
  if (!legs.some(l => !l.w) || !Number.isFinite(s) || !Number.isFinite(e)) return null;
  return { s, e, n: legs.filter(l => !l.w).length - 1, legs };
}

/* Wann gefragt wird: Karte zu sehen (oder der Spiegel zeigt Pendeln), Antwort älter als 5 Minuten oder aufgebraucht */
function ptShown() {
  if (document.visibilityState !== 'visible') return false;
  if (mr.on) {
    const m = state.ui.mirror;
    if (m.layout === 'blocks') return m.blocks.some(b => b.k === 'cm' && b.on);
    return mosPage().items.some(it => state.widgets[it.w] && state.widgets[it.w].type === 'commute');
  }
  return viewsOf('commute').some(v => !v.el.hidden);
}
const ptUp = (E, t) => E.its.filter(i => i.s >= t - 6e4);
function ptNeed(now) {
  if (!ptMode() || pt.busy || !ptShown()) return;
  const q = ptQuery(now), t = +now;
  if (!q || t - pt.last < PT_GAP || (pt.err && t - pt.errAt < 2 * 6e4)) return;
  const E = ptStore().e[q.k], age = E ? t - E.at : Infinity;
  // Liegt die Abfrage über eine Stunde voraus (ab Feierabend), reicht alle 15 Minuten. Nachts zwischen 1 und 4 Uhr,
  // wenn der Spiegel durchläuft und eh kaum etwas fährt, alle 30 Minuten.
  const h = now.getHours(), min = h >= 1 && h < 4 ? 30 * 6e4 : PT_FRESH;
  const keep = q.t && +q.t - t > 36e5 ? 15 * 6e4 : min;
  if (age < min || (age < keep && ptUp(E, t).length)) return;
  ptLoad(q);
}
async function ptLoad(q) {
  pt.busy = true;
  pt.last = Date.now();
  const p = new URLSearchParams({ fromPlace: `${q.r(q.a.lat)},${q.r(q.a.lon)}`, toPlace: `${q.r(q.b.lat)},${q.r(q.b.lon)}`, language: 'de', detailedLegs: 'false', detailedTransfers: 'false' });
  if (q.t) p.set('time', q.t.toISOString());
  try {
    const j = await getJson(`${TRS}/v5/plan?${p}`, 20000, TRS_REF);
    if (!j || !Array.isArray(j.itineraries)) throw new Error('format');
    ptSave(q.k, { at: Date.now(), its: j.itineraries.map(ptSlim).filter(Boolean).sort((x, y) => x.s - y.s || x.e - y.e).slice(0, 8) });
    pt.err = '';
  } catch (e) {
    const m = String(e && e.message);
    pt.err = /HTTP (429|503)/.test(m) ? 'busy' : /HTTP 4\d\d/.test(m) ? 'svc' : 'net';
    pt.errAt = Date.now();
  }
  pt.busy = false;
  ptRender(new Date());
  if (mr.on) renderMirror();
  nowDirty();
}

/* Auswerten: welche Verbindung vorn steht, Verspätung, Ausfall */
const ptTr = l => l.filter(x => !x.w);
const ptId = i => `${i.s}|${ptTr(i.legs).map(l => l.line).join(',')}|${i.e}`;
const ptX = i => ptTr(i.legs).some(l => l.x);
const ptLate = s => (s && s.rt && Number.isFinite(s.t) && Number.isFinite(s.s) ? Math.round((s.t - s.s) / 6e4) : 0);
/* Die größte Verspätung unterwegs, mit der Linie dazu */
function ptWorst(i) {
  let best = { m: 0, l: null };
  for (const l of ptTr(i.legs)) for (const m of [ptLate(l.f), ptLate(l.a)]) if (m > best.m) best = { m, l };
  return best;
}
/* Vorn steht deine Wahl, sonst die nächste, die fährt und deren Anschlüsse halten */
function ptPick(list) { return list.find(i => ptId(i) === pt.sel) || list.find(i => !ptX(i) && !ptRisk(i)) || list.find(i => !ptX(i)) || list[0]; }
/* Für „Jetzt wichtig“ und den Spiegel: nur aus dem Speicher, höchstens 30 Minuten alt */
function ptSummary(now) {
  if (!ptMode()) return null;
  const q = ptQuery(now);
  if (!q) return null;
  const E = ptStore().e[q.k], t = +now;
  if (!E || t - E.at > 30 * 6e4) return null;
  const list = ptUp(E, t);
  if (!list.length) return null;
  const it = ptPick(list);
  return { dir: cm.dir, at: E.at, it, list, q, next: list.find(i => i !== it && i.s >= it.s && !ptX(i)) || null };
}
const ptLeave = (i, t) => {
  const m = Math.floor((i.s - t) / 6e4);
  return m < 1 ? 'jetzt los' : m >= 60 ? `los um ${ptHm(i.s)}` : `los in ${m} Min`;
};

/* Kette der Fahrten: Linien, auf Wunsch mit Fußwegen dazwischen */
function ptChain(i, walk) {
  const parts = [];
  for (const l of i.legs) {
    if (!l.w) { parts.push(dpBadge(l)); continue; }
    const m = ptMin(l.t1 - l.t0);
    if (walk && l.t1 - l.t0 >= 6e4) parts.push(`<span class="pt-w" title="${m} Min zu Fuß">${PT_WALK}<span aria-hidden="true">${m}</span><span class="vh">${m} Min zu Fuß</span></span>`);
  }
  return `<span class="pt-ch">${parts.join('<i class="pt-arr" aria-hidden="true">›</i>')}</span>`;
}

/* Der Weg als Band wie beim Auto: Haltestellen als Punkte, dazwischen die Linie in ihrer Farbe oder der Fußweg */
function ptBandRows(i, dir) {
  const rows = [{ k: 'start', n: dir === 'home' ? 'Arbeit' : 'Zuhause', t: i.s }];
  for (const l of i.legs) {
    if (l.w) { rows.push({ k: 'walk', m: ptMin(l.t1 - l.t0) }); continue; }
    const last = rows[rows.length - 1], prev = rows[rows.length - 2];
    // Umstieg an derselben Haltestelle: ein Punkt mit an und ab
    if (last.k === 'stop' && last.arr && last.n === l.f.n) { last.k = 'chg'; last.dep = l.f; }
    else if (last.k === 'walk' && prev && prev.k === 'stop' && prev.arr && prev.n === l.f.n) { rows.pop(); prev.k = 'chg'; prev.dep = l.f; prev.wm = last.m; }
    else rows.push({ k: 'stop', n: l.f.n, dep: l.f });
    rows.push({ k: 'leg', l });
    rows.push({ k: 'stop', n: l.a.n, arr: l.a });
  }
  rows.push({ k: 'end', n: dir === 'home' ? 'Zuhause' : 'Arbeit', t: i.e });
  return rows;
}
const ptTrack = s => (s && s.tr ? `<span class="${s.str && s.str !== s.tr ? 'dp-chg' : ''}">${DP_RAIL.has(s.c) ? 'Gl.' : 'Steig'} ${esc(s.tr)}</span>` : '');
const ptLateTag = s => { const m = ptLate(s); return m >= 1 ? `<span class="dp-late${m >= 5 ? ' big' : ''}">+${m}</span>` : ''; };
function ptBandHtml(i, dir) {
  const rows = ptBandRows(i, dir), col = r => (r.k === 'leg' ? r.l.bg : r.k === 'walk' ? 'var(--cb-walk)' : null);
  const out = rows.map((r, j) => {
    const c = col(r);
    if (r.k === 'walk') return `<li class="pt-seg" data-k="walk" style="--in:${c};--out:${c}">${r.m} Min zu Fuß</li>`;
    if (r.k === 'leg') {
      const l = r.l, n = l.ns >= 0 ? l.ns + 1 : 0;
      return `<li class="pt-seg" data-k="leg" style="--in:${c};--out:${c}">${dpBadge(l)}<span>${l.hs ? `Richtung ${esc(l.hs)}` : esc(l.a.n)}${n ? ` <small>${n} ${n === 1 ? 'Station' : 'Stationen'}</small>` : ''}${l.x ? ' <span class="dp-x">fällt aus</span>' : ''}</span></li>`;
    }
    const pc = j ? col(rows[j - 1]) : null, nc = j < rows.length - 1 ? col(rows[j + 1]) : null;
    const inC = j === 0 ? 'var(--cb-none)' : pc || 'var(--cb-walk)', outC = j === rows.length - 1 ? 'var(--cb-none)' : nc || 'var(--cb-walk)';
    let sub = [], time = r.t;
    const two = (a, b) => [a, b].filter(Boolean).join(' ');
    if (r.k === 'chg') sub = [two(`an ${ptHm(r.arr.t)}`, ptLateTag(r.arr)), r.wm ? `${r.wm} Min Weg` : 'umsteigen', two(ptTrack(r.dep), ptLateTag(r.dep))];
    else if (r.dep) sub = [two(ptTrack(r.dep), ptLateTag(r.dep))];
    else if (r.arr) sub = [ptLateTag(r.arr)];
    if (r.dep) time = r.dep.t;
    else if (r.arr) time = r.arr.t;
    sub = sub.filter(Boolean).join(', ');
    const k = r.k === 'chg' ? 'stop' : r.k;
    return `<li class="cb" data-k="${k}" style="--in:${inC};--out:${outC}"><span class="cb-n"><b>${esc(r.n)}</b>${sub ? ` <small>${sub}</small>` : ''}</span><time>${ptHm(time)}</time></li>`;
  });
  return `<ol class="cm-band pt-band">${out.join('')}</ol>`;
}
function ptRowHtml(i, on) {
  const w = ptWorst(i), x = ptX(i), n = i.n, dur = ptMin(i.e - i.s);
  const st = x ? '<span class="dp-x">fällt aus</span>' : ptRisk(i) ? '<span class="dp-x">knapp</span>' : w.m >= 1 ? `<span class="dp-late${w.m >= 5 ? ' big' : ''}">+${w.m}</span>` : '';
  return `<li><button type="button" class="pt-row${x ? ' x' : ''}" data-pt="${esc(ptId(i))}" aria-pressed="${on}"><span class="pt-hm"><b>${ptHm(i.s)}</b><small>an ${ptHm(i.e)}</small></span>`
    + `<span class="pt-mid">${ptChain(i, false)}<small>${dur} Min, ${n < 1 ? 'ohne Umstieg' : n === 1 ? '1 Umstieg' : `${n} Umstiege`}</small></span><span class="pt-st">${st}</span></button></li>`;
}
/* Wackelt ein Umstieg? Ankunft mit Verspätung plus Fußweg nach der Abfahrt der nächsten Fahrt */
function ptRisk(i) {
  let prev = null, walk = 0;
  for (const l of i.legs) {
    if (l.w) { walk += l.t1 - l.t0; continue; }
    if (prev && prev.a.t + walk > l.f.t) return { prev, next: l };
    prev = l;
    walk = 0;
  }
  return null;
}
/* Ein Satz zur Lage: Ausfall, Anschluss in Gefahr, Verspätung, pünktlich oder nur Fahrplan */
function ptVerdict(i) {
  const tr = ptTr(i.legs), w = ptWorst(i), x = tr.find(l => l.x), r = ptRisk(i);
  if (x) return [`${x.line} um ${ptHm(x.f.s)} fällt aus. Nimm lieber eine andere Verbindung.`, 'bad'];
  if (r) return [`Anschluss wackelt: ${r.prev.line} kommt erst um ${ptHm(r.prev.a.t)} in ${r.prev.a.n} an, ${r.next.line} fährt um ${ptHm(r.next.f.t)}.`, 'bad'];
  if (w.m >= 3) return [`${w.l.line} heute +${w.m} Min, du bist um ${ptHm(i.e)} da.`, 'warn'];
  if (tr.some(l => l.rt)) return [w.m >= 1 ? `Fast pünktlich, ${w.l.line} +${w.m} Min.` : 'Alles pünktlich laut Echtzeit.', 'ok'];
  return ['Zeiten laut Fahrplan, Echtzeit gibt es dafür gerade nicht.', 'plan'];
}
function ptPane(which) { $('#pt-off').hidden = which !== 'off'; $('#pt-live').hidden = which !== 'live'; }
function ptOff(title, text, busy) {
  ptPane('off');
  $('#pt-off-title').textContent = title;
  $('#pt-off-text').textContent = text;
  $('#pt-off').classList.toggle('busy', !!busy);
}
const ptSet = (sel, html) => { const el = $(sel); if (el.innerHTML !== html) el.innerHTML = html; };
function ptRender(now) {
  ptNeed(now);
  if (!ptMode()) return;
  const c = state.commute;
  if (!c.home || !c.work) { ptPane('none'); return; }
  const q = ptQuery(now), t = +now, dir = cm.dir;
  const gm = $('#pt-gmaps');
  gm.href = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent((dir === 'home' ? c.work : c.home).text)}&destination=${encodeURIComponent((dir === 'home' ? c.home : c.work).text)}&travelmode=transit`;
  if (!q) { ptOff('Strecke wird berechnet', 'Einen Moment, die Adressen werden gerade auf der Karte gesucht.', true); return; }
  const E = ptStore().e[q.k], list = E ? ptUp(E, t) : [];
  const src = E ? `Stand ${ptHm(E.at)} Uhr${pt.err ? ', gerade ohne Verbindung' : ''} · ` : '';
  ptSet('#pt-src', `${src}Daten: <a href="${DP_SRC}" target="_blank" rel="noopener">Transitous und offene Fahrplandaten</a>`);
  if (!list.length) {
    if (pt.err && (!E || t - E.at > PT_FRESH)) ptOff('Keine Verbindungen', PT_ERR[pt.err] || PT_ERR.net);
    else if (E && !E.its.length && !pt.busy) ptOff('Keine Verbindung gefunden', 'Zwischen deinen Adressen findet die Fahrplanauskunft gerade keine Fahrt mit Bus und Bahn. Nachts ist das normal.');
    else ptOff('Verbindungen werden gesucht', 'Einen Moment, die nächsten Fahrten mit Bus und Bahn kommen gleich.', true);
    return;
  }
  ptPane('live');
  const f = ptPick(list), m = Math.floor((f.s - t) / 6e4), dirTxt = dir === 'home' ? 'nach Hause' : 'zur Arbeit';
  $('#pt-time').textContent = m < 1 ? 'jetzt' : m >= 60 ? ptHm(f.s) : String(m);
  $('#pt-time').classList.toggle('word', m < 1);
  $('#pt-time-lbl').textContent = m < 1 ? `los, ${dirTxt}` : m >= 60 ? `Uhr los, ${dirTxt}` : `Min bis los, ${dirTxt}`;
  const first = ptTr(f.legs)[0], n = f.n;
  ptSet('#pt-dl', `<dt>Erste Fahrt</dt><dd>${dpBadge(first)} ${ptHm(first.f.t)}</dd><dt>Ankunft</dt><dd>${ptHm(f.e)} Uhr</dd><dt>Fahrzeit</dt><dd>${ptMin(f.e - f.s)} Min, ${n < 1 ? 'direkt' : n === 1 ? '1 Umstieg' : `${n} Umstiege`}</dd>`);
  ptSet('#pt-chain', ptChain(f, true));
  $('#pt-note').textContent = q.t ? `Verbindungen ab Feierabend um ${hm(q.t)} Uhr` : `Ab ${first.f.n}${first.f.tr ? `, ${DP_RAIL.has(first.cat) ? 'Gleis' : 'Steig'} ${first.f.tr}` : ''}`;
  const [v, lv] = ptVerdict(f), ve = $('#pt-verdict');
  ve.textContent = v;
  ve.dataset.lv = lv;
  ptSet('#pt-band', ptBandHtml(f, dir));
  // Hinweise der Verkehrsbetriebe zu den Fahrten dieser Verbindung, jeder nur einmal
  const al = [], seen = new Set();
  for (const l of ptTr(f.legs)) for (const a of l.al) {
    if (seen.has(a.h)) continue;
    seen.add(a.h);
    const head = `${dpBadge(l)} ${esc(a.h)}`;
    al.push(a.d ? `<details class="dp-alert"><summary>${head}</summary><p>${esc(a.d)}</p></details>` : `<p class="dp-alert">${head}</p>`);
  }
  ptSet('#pt-alerts', al.slice(0, 3).join(''));
  ptSet('#pt-list', list.slice(0, 6).map(i => ptRowHtml(i, i === f)).join(''));
  $('#pt-list-h').hidden = list.length < 2;
}
/* Jede Sekunde prüfen, ob eine Abfrage fällig ist (kostet nichts), alle 10 Sekunden die Minuten neu zeichnen */
function ptTick(now) {
  if (!ptMode()) return;
  if (now.getSeconds() % 10 === 5 && ptShown() && !mr.on) ptRender(now);
  else ptNeed(now);
}

/* Umschalter Auto und Öffis. Gilt für alle Geräte, auch für den Spiegel. */
function cmModeUi() {
  const p = ptMode(), ico = $('#commute .card-ico'), want = p ? TICON.dep : TICON.commute;
  $('#commute').dataset.mode = p ? 'pt' : 'car';
  if (ico && ico.dataset.m !== String(p)) { ico.innerHTML = want; ico.dataset.m = String(p); }
  $('#cm-mode-car').setAttribute('aria-pressed', String(!p));
  $('#cm-mode-pt').setAttribute('aria-pressed', String(p));
}
function cmSetMode(m) {
  const c = state.widgets.commute && state.widgets.commute.cfg;
  if (!c || c.mode === m) return;
  c.mode = m;
  cmx.open = false;
  commit();
  if (m === 'car' && cm.map) setTimeout(() => cmFit(false), 80);
}
$('#cm-mode-car').addEventListener('click', () => cmSetMode('car'));
$('#cm-mode-pt').addEventListener('click', () => cmSetMode('pt'));
$('#pt-list').addEventListener('click', e => {
  const b = e.target.closest('[data-pt]');
  if (!b) return;
  pt.sel = b.dataset.pt;
  ptRender(new Date());
  nowDirty();
});
$('#pt-more').addEventListener('click', () => {
  cmx.open = !cmx.open;
  cmCompactUi();
  schedLayout();
});
