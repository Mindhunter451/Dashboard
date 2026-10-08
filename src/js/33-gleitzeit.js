/* Gleitzeit (gibt es nur einmal). Regeln in state.widgets.flex.cfg, gestempelte Tage in state.flex.days:
 * { 'JJJJ-MM-TT': { in: 'HH:MM', out: 'HH:MM' oder leer, pause: Minuten, kind: '' | 'school' | 'sick' | 'flexday' } }
 * Nicht gestempelte Arbeitstage zählen nicht ins Saldo, sie werden nur als fehlend angezeigt. */
const fxCfg = () => state.widgets.flex.cfg;
const fx = { week: 0, editing: null };
const FX_KIND = { school: 'Berufsschule', sick: 'Krank', flexday: 'Gleittag' };
const toMin = s => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };
const fmtDur = (min, sign) => { const a = Math.abs(Math.round(min)); return `${min < 0 && a ? '-' : sign && a ? '+' : ''}${Math.floor(a / 60)}:${pad(a % 60)}`; };
const nowMin = d => d.getHours() * 60 + d.getMinutes();
/* "8", "8:00", "7,5" oder "-1:15" in Minuten. Leer: 0. Unlesbar: null */
function parseDur(str) {
  const s = String(str || '').trim().replace(/\s/g, '').replace(/[−–]/g, '-');
  if (!s) return 0;
  let m = s.match(/^([+-]?)(\d{1,3}):(\d{2})$/);
  if (m) return +m[3] > 59 ? null : (m[1] === '-' ? -1 : 1) * (+m[2] * 60 + +m[3]);
  m = s.match(/^([+-]?)(\d{1,3})(?:[.,](\d{1,2}))?$/);
  if (m) return (m[1] === '-' ? -1 : 1) * Math.round(parseFloat(`${m[2]}.${m[3] || 0}`) * 60);
  return null;
}
/* Gesetzliche Pause: über 6 Std mindestens 30 Min, über 9 Std mindestens 45 Min. Nie unter die Grenze rutschen. */
function legalNet(work, pause) {
  if (work <= 360) return work;
  let net = Math.max(360, work - Math.max(0, 30 - pause));
  if (net > 540) net = Math.max(540, work - Math.max(0, 45 - pause));
  return net;
}
/* Soll eines Tages: 0 an freien Tagen, Feiertagen und im Urlaub. Halbe Urlaubstage und 24.12./31.12. halbieren. */
function fxSoll(d) {
  const c = fxCfg();
  if (!c.days.includes(d.getDay()) || holidayName(d)) return 0;
  const xmas = state.vacation.halfXmas && isXmasHalf(d), v = vacationOn(d);
  if (v) return v.half && !xmas ? Math.round(c.soll / 2) : 0;
  return xmas ? Math.round(c.soll / 2) : c.soll;
}
/* Ist eines Tages in Minuten. upTo: aktuelle Minute, falls heute noch eingestempelt */
function fxIst(k, e, upTo) {
  if (!e) return null;
  if (e.kind === 'school' || e.kind === 'sick') return fxSoll(parseYmd(k));
  if (e.kind === 'flexday') return 0;
  if (!e.in) return null;
  const end = e.out ? toMin(e.out) : upTo;
  if (end == null) return null;
  const work = Math.max(0, end - toMin(e.in) - e.pause);
  return fxCfg().autoBreak ? legalNet(work, e.pause) : work;
}
/* Wie lange man arbeiten muss (ohne gestempelte Pause), damit das Netto das Soll erreicht */
function fxWorkFor(soll, pause) {
  if (!fxCfg().autoBreak || soll <= 360) return soll;
  return soll > 540 ? soll + Math.max(0, 45 - pause) : soll + Math.max(0, 30 - pause);
}
/* Für Kacheln, Arbeitstag-Balken und Startseite: heute eingestempelt? Start und (voraussichtliches) Ende */
function flexToday(now) {
  const k = ymd(now), e = state.flex.days[k];
  if (!e || e.kind || !e.in) return null;
  const base = sod(now).getTime(), start = toMin(e.in);
  if (e.out) return { running: false, start: new Date(base + start * 6e4), end: new Date(base + toMin(e.out) * 6e4) };
  const soll = fxSoll(now);
  return { running: true, start: new Date(base + start * 6e4), end: new Date(base + (start + e.pause + fxWorkFor(soll, e.pause)) * 6e4) };
}
function fxBalance(now) {
  const c = fxCfg(), today = ymd(now), mon = ymd(weekStart(now));
  let bal = c.carry, week = 0;
  for (const [k, e] of Object.entries(state.flex.days)) {
    if (k < c.from || k > today) continue;
    if (k === today && e.in && !e.out && !e.kind) continue; // laufender Tag zählt erst nach dem Ausstempeln
    const ist = fxIst(k, e, null);
    if (ist == null) continue;
    const diff = ist - fxSoll(parseYmd(k));
    bal += diff;
    if (k >= mon) week += diff;
  }
  return { bal, week };
}
function fxMissing(now) {
  const c = fxCfg(), out = [];
  for (let i = 14; i >= 1; i--) {
    const d = addDays(sod(now), -i), k = ymd(d);
    if (k < c.from || state.flex.days[k]) continue;
    if (fxSoll(d) > 0) out.push(d);
  }
  return out;
}
function fxStamp() {
  const now = new Date(), k = ymd(now), t = hm(now), e = state.flex.days[k];
  if (!e || e.kind || !e.in) state.flex.days[k] = { in: t, out: '', pause: 0, kind: '' };
  else if (!e.out) {
    if (toMin(t) <= toMin(e.in)) return;
    e.out = t;
    const ist = fxIst(k, e, null), soll = fxSoll(now);
    toast(`Ausgestempelt. Heute ${fmtDur(ist)} Std, das sind ${fmtDur(ist - soll, true)}.`);
  } else {
    // wieder da: die Zeit dazwischen zählt als Pause
    e.pause = Math.min(600, e.pause + Math.max(0, toMin(t) - toMin(e.out)));
    e.out = '';
  }
  commit();
}
function fxDayLine(d, k, e, now) {
  const today = k === ymd(now), soll = fxSoll(d), h = holidayName(d), v = vacationOn(d);
  if (e && e.kind) return { t: FX_KIND[e.kind] + (e.kind === 'flexday' ? '' : ', zählt wie Soll'), i: fmtDur(fxIst(k, e, null)), x: fxIst(k, e, null) - soll };
  if (e && e.in) {
    const run = !e.out, ist = fxIst(k, e, run && today ? nowMin(now) : null);
    const t = `${e.in} bis ${e.out || (today ? 'jetzt' : '?')}${e.pause ? `, ${e.pause} Min Pause` : ''}`;
    if (ist == null) return { t, i: '', x: null };
    return { t, i: fmtDur(ist), x: run ? null : ist - soll };
  }
  if (h) return { t: h, i: '', x: null, off: true };
  if (v) return { t: soll ? 'Halber Urlaubstag' : 'Urlaub', i: '', x: null, off: true };
  if (!soll) return { t: 'Frei', i: '', x: null, off: true };
  if (d > sod(now) || today) return { t: `Soll ${fmtDur(soll)}`, i: '', x: null };
  return { t: k < fxCfg().from ? 'vor dem Start' : 'nicht erfasst', i: '', x: null, miss: k >= fxCfg().from };
}
function renderFlex() {
  const c = fxCfg(), now = new Date(), k = ymd(now), e = state.flex.days[k], soll = fxSoll(now);
  const { bal, week } = fxBalance(now);
  $('#fx-saldo').textContent = fmtDur(bal, true);
  $('#fx-big').dataset.s = bal > 0 ? 'plus' : bal < 0 ? 'minus' : '';
  const todayIst = e ? fxIst(k, e, nowMin(now)) : null;
  $('#fx-dl').innerHTML = [
    ['Diese Woche', fmtDur(week, true)],
    ['Heute', todayIst == null ? `0:00 von ${fmtDur(soll)}` : `${fmtDur(todayIst)} von ${fmtDur(soll)}`],
    ['Soll pro Tag', fmtDur(c.soll)]
  ].map(([a, b]) => `<dt>${esc(a)}</dt><dd>${esc(b)}</dd>`).join('');

  // Jetzt-Zeile mit Stempel-Knopf
  const box = $('#fx-now'), txt = $('#fx-now-txt'), btn = $('#fx-stamp');
  const ft = flexToday(now);
  let s = 'none';
  if (e && e.kind) txt.innerHTML = `<b>Heute: ${esc(FX_KIND[e.kind])}.</b> ${e.kind === 'flexday' ? `Das Soll von ${fmtDur(soll)} geht vom Saldo ab.` : `Zählt wie ${fmtDur(soll)} Std.`}`;
  else if (ft && ft.running) {
    s = 'in';
    const reached = now >= ft.end;
    txt.innerHTML = `<b>Eingestempelt seit ${esc(e.in)}.</b> Bisher ${fmtDur(todayIst)} Std${soll ? (reached ? `, Soll erreicht um ${hm(ft.end)}. Alles ab jetzt ist Plus: ${fmtDur(todayIst - soll, true)}.` : `, Soll voll um <b>${hm(ft.end)}</b>.`) : ', heute ist eigentlich frei.'}`;
  } else if (ft) {
    s = 'out';
    txt.innerHTML = `<b>Heute ${fmtDur(todayIst)} Std, ${fmtDur(todayIst - soll, true)}.</b> Ausgestempelt um ${esc(e.out)}${e.pause ? `, ${e.pause} Min Pause` : ''}.`;
  } else {
    const h = holidayName(now), v = vacationOn(now);
    txt.innerHTML = soll ? `<b>Noch nicht eingestempelt.</b> Heute sind ${fmtDur(soll)} Std Soll.` : `<b>${esc(h ? `Heute ist ${h}.` : v ? 'Heute hast du Urlaub.' : 'Heute ist kein Arbeitstag.')}</b> Stempeln geht trotzdem.`;
  }
  box.dataset.s = s;
  btn.textContent = s === 'in' ? 'Gehen' : 'Kommen';
  btn.setAttribute('aria-label', s === 'in' ? `Ausstempeln, ${hm(now)} Uhr` : `Einstempeln, ${hm(now)} Uhr`);

  const miss = fxMissing(now);
  $('#fx-missing').hidden = !miss.length;
  $('#fx-missing').textContent = miss.length ? `${miss.length === 1 ? 'Ein Arbeitstag ist' : `${miss.length} Arbeitstage sind`} noch nicht erfasst: ${miss.slice(-4).map(d => `${WD[d.getDay()]} ${dm(d)}`).join(', ')}${miss.length > 4 ? ' …' : ''}. Tipp auf den Tag in der Woche, um ihn nachzutragen.` : '';

  // Woche
  const mon = addDays(weekStart(now), 7 * fx.week), sun = addDays(mon, 6);
  $('#fx-week-lbl').textContent = `KW ${isoWeek(mon)} · ${dm(mon)} bis ${dm(sun)}`;
  $('#fx-prev').innerHTML = LEFT;
  $('#fx-next').innerHTML = RIGHT;
  $('#fx-next').disabled = fx.week >= 0;
  const ul = $('#fx-week');
  ul.textContent = '';
  for (let i = 0; i < 7; i++) {
    const d = addDays(mon, i), dk = ymd(d), de = state.flex.days[dk];
    if (!c.days.includes(d.getDay()) && !de) continue;
    const L = fxDayLine(d, dk, de, now);
    const li = document.createElement('li');
    li.innerHTML = `<button type="button" class="fx-row${dk === k ? ' today' : ''}${L.off ? ' off' : ''}" data-fxd="${dk}"><span class="d">${WD[d.getDay()]} ${dm(d)}</span><span class="t"></span><span class="i">${esc(L.i)}</span><span class="x"${L.x == null ? '' : ` data-s="${L.x > 0 ? 'plus' : L.x < 0 ? 'minus' : ''}"`}>${L.x == null ? '' : esc(fmtDur(L.x, true))}</span></button>`;
    li.querySelector('.t').textContent = L.t;
    if (L.miss) li.querySelector('.t').style.color = 'var(--bad)';
    li.querySelector('button').setAttribute('aria-label', `${WDL[d.getDay()]}, ${dm(d)}: ${L.t}${L.i ? `, ${L.i} Std` : ''}. Bearbeiten`);
    ul.appendChild(li);
  }
}
function fxTick(now) {
  // Jede neue Minute auffrischen (auch wenn der Browser den Takt im Hintergrund drosselt)
  const v = views.get('flex'), mk = Math.floor(now.getTime() / 6e4);
  if (!v || v.el.hidden || mk === fx.minute) return;
  const first = fx.minute === undefined;
  fx.minute = mk;
  if (!first) renderFlex();
}

/* Tag eintragen oder ändern */
function fxPreview() {
  const k = $('#fx-d-date').value, kind = $('#fx-d-kind').value, inT = $('#fx-d-in').value, outT = $('#fx-d-out').value, p = Math.max(0, Math.round(+$('#fx-d-pause').value || 0));
  $('#fx-d-times').hidden = !!kind;
  if (!validYmd(k)) { $('#fx-d-prev').textContent = ''; return; }
  const soll = fxSoll(parseYmd(k));
  if (kind) { const ist = fxIst(k, { kind }, null); $('#fx-d-prev').textContent = `Soll ${fmtDur(soll)}, zählt ${fmtDur(ist)}, also ${fmtDur(ist - soll, true)}.`; return; }
  if (!validHm(inT) || !validHm(outT) || toMin(outT) <= toMin(inT)) { $('#fx-d-prev').textContent = soll ? `Soll an dem Tag: ${fmtDur(soll)} Std.` : 'An dem Tag ist kein Soll.'; return; }
  const ist = fxIst(k, { in: inT, out: outT, pause: p, kind: '' }, null);
  const gross = toMin(outT) - toMin(inT) - p;
  $('#fx-d-prev').textContent = `Das sind ${fmtDur(ist)} Std${ist < gross ? ` (${gross - ist} Min Pause automatisch abgezogen)` : ''}, Soll ${fmtDur(soll)}, also ${fmtDur(ist - soll, true)}.`;
}
function openFxDay(k) {
  const e = state.flex.days[k];
  fx.editing = k;
  $('#fx-set').hidden = true;
  $('#fx-day-title').textContent = e ? `${WDL[parseYmd(k).getDay()]}, ${dm(parseYmd(k))} bearbeiten` : `${WDL[parseYmd(k).getDay()]}, ${dm(parseYmd(k))} eintragen`;
  $('#fx-d-date').value = k;
  $('#fx-d-kind').value = e ? e.kind : '';
  $('#fx-d-in').value = e ? e.in : '';
  $('#fx-d-out').value = e ? e.out : '';
  $('#fx-d-pause').value = e ? e.pause : 0;
  $('#fx-d-del').hidden = !e;
  $('#fx-d-err').hidden = true;
  $('#fx-day').hidden = false;
  fxPreview();
  $('#fx-day').scrollIntoView({ block: 'nearest', behavior: reduceMotion ? 'auto' : 'smooth' });
  $('#fx-d-in').focus({ preventScroll: true });
}
$('#fx-stamp').addEventListener('click', fxStamp);
$('#fx-add-btn').addEventListener('click', () => { if ($('#fx-day').hidden) openFxDay(ymd(new Date())); else $('#fx-day').hidden = true; });
$('#fx-week').addEventListener('click', e => { const b = e.target.closest('[data-fxd]'); if (b) openFxDay(b.dataset.fxd); });
$('#fx-prev').addEventListener('click', () => { fx.week = Math.max(-104, fx.week - 1); renderFlex(); });
$('#fx-next').addEventListener('click', () => { fx.week = Math.min(0, fx.week + 1); renderFlex(); });
for (const id of ['#fx-d-date', '#fx-d-kind', '#fx-d-in', '#fx-d-out', '#fx-d-pause']) $(id).addEventListener('input', fxPreview);
$('#fx-d-date').addEventListener('change', () => {
  const k = $('#fx-d-date').value, e = validYmd(k) && state.flex.days[k];
  if (e && k !== fx.editing) { fx.editing = k; $('#fx-d-kind').value = e.kind; $('#fx-d-in').value = e.in; $('#fx-d-out').value = e.out; $('#fx-d-pause').value = e.pause; $('#fx-d-del').hidden = false; fxPreview(); }
});
$('#fx-d-cancel').addEventListener('click', () => { $('#fx-day').hidden = true; fx.editing = null; });
$('#fx-day').addEventListener('submit', ev => {
  ev.preventDefault();
  const fail = m => { $('#fx-d-err').textContent = m; $('#fx-d-err').hidden = false; };
  const k = $('#fx-d-date').value, kind = $('#fx-d-kind').value, inT = $('#fx-d-in').value, outT = $('#fx-d-out').value;
  const p = Math.round(+$('#fx-d-pause').value || 0);
  if (!validYmd(k)) return fail('Wähl ein Datum.');
  if (k > ymd(new Date())) return fail('Tage in der Zukunft kannst du noch nicht eintragen. Für Urlaub nimm das Urlaub-Widget.');
  let entry;
  if (kind) entry = { in: '', out: '', pause: 0, kind };
  else {
    if (!validHm(inT)) return fail('Trag ein, wann du gekommen bist.');
    if (outT && toMin(outT) <= toMin(inT)) return fail('Gehen muss nach Kommen liegen.');
    if (!(p >= 0 && p <= 600)) return fail('Pause geht von 0 bis 600 Minuten.');
    if (!outT && k !== ymd(new Date())) return fail('Für vergangene Tage brauchst du auch die Zeit fürs Gehen.');
    entry = { in: inT, out: validHm(outT) ? outT : '', pause: p, kind: '' };
  }
  const before = state.flex.days[k] ? { ...state.flex.days[k] } : null;
  if (fx.editing && fx.editing !== k && state.flex.days[fx.editing] && !before) delete state.flex.days[fx.editing];
  state.flex.days[k] = entry;
  const c = fxCfg(), moved = k < c.from;
  if (moved) c.from = k;
  $('#fx-day').hidden = true;
  fx.editing = null;
  commit();
  if (moved) toast(`Gezählt wird jetzt ab ${dm(parseYmd(k))}, fehlende Arbeitstage dazwischen siehst du in der Wochenliste.`);
  else if (before) toast(`${dm(parseYmd(k))} geändert`, () => { state.flex.days[k] = before; commit(); });
});
$('#fx-d-del').addEventListener('click', () => {
  const k = fx.editing, old = k && state.flex.days[k];
  if (!old) return;
  delete state.flex.days[k];
  $('#fx-day').hidden = true;
  fx.editing = null;
  commit();
  toast(`Eintrag vom ${dm(parseYmd(k))} gelöscht`, () => { state.flex.days[k] = old; commit(); });
});

/* Regeln */
$('#fx-set-btn').addEventListener('click', () => {
  const f = $('#fx-set');
  if (!f.hidden) { f.hidden = true; return; }
  const c = fxCfg();
  $('#fx-day').hidden = true;
  $('#fx-soll').value = fmtDur(c.soll);
  $('#fx-carry').value = fmtDur(c.carry, true);
  document.querySelectorAll('[data-fxday]').forEach(cb => { cb.checked = c.days.includes(+cb.dataset.fxday); });
  $('#fx-from').value = c.from;
  $('#fx-break').checked = c.autoBreak;
  $('#fx-set-err').hidden = true;
  f.hidden = false;
  $('#fx-soll').focus();
});
$('#fx-set-cancel').addEventListener('click', () => { $('#fx-set').hidden = true; });
$('#fx-set').addEventListener('submit', e => {
  e.preventDefault();
  const fail = m => { $('#fx-set-err').textContent = m; $('#fx-set-err').hidden = false; };
  const soll = parseDur($('#fx-soll').value), carry = parseDur($('#fx-carry').value);
  if (soll == null || soll <= 0 || soll > 720) return fail('Soll bitte als Stunden angeben, zum Beispiel 8:00 oder 7,8.');
  if (carry == null || Math.abs(carry) > 60000) return fail('Den Startsaldo bitte als Stunden angeben, zum Beispiel 3:30 oder -1:15.');
  const days = [...document.querySelectorAll('[data-fxday]')].filter(cb => cb.checked).map(cb => +cb.dataset.fxday);
  if (!days.length) return fail('Wähl mindestens einen Arbeitstag.');
  const from = $('#fx-from').value;
  if (!validYmd(from)) return fail('Wähl ein Datum, ab dem gezählt wird.');
  state.widgets.flex.cfg = { soll, carry, days, from, autoBreak: $('#fx-break').checked };
  $('#fx-set').hidden = true;
  commit();
});

defineWidget('flex', { render: renderFlex });
