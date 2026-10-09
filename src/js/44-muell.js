/* Müllabfuhr (gibt es nur einmal). Termine pro Tonne kommen aus der ICS-Datei des Entsorgers
 * (ein Mal im Jahr neu laden) oder aus einem festen Rhythmus, z. B. alle 2 Wochen ab einem Dienstag.
 * Am Vorabend erinnert das Cockpit mit einem Hinweis, auf Wunsch auch als Mitteilung, wenn es offen ist.
 * Die Daten stehen in state.waste und damit in der Sicherung. */
const WS_NOTE = 'jere-cockpit-muell-hinweis';
const WS_AUTO = [[/rest|grau|schwarz/i, '#6B7280'], [/bio|braun|kompost|grüne/i, '#8B5E34'], [/papier|pappe|blau|ppk/i, '#2B6CC4'],
  [/gelb|wertstoff|verpack|lvp|plastik/i, '#E2B007'], [/glas/i, '#2F8458'], [/sperr/i, '#8A5CD8'], [/schadstoff|problem|sonder/i, '#C2410C'], [/baum|tanne|weihnacht/i, '#1C6B45']];
const ws = { draft: null, file: undefined };
const wsCfg = () => state.widgets.waste.cfg;
function wsAutoColor(name, used) {
  const hit = WS_AUTO.find(([re]) => re.test(name));
  if (hit && !used.has(hit[1])) return hit[1];
  return WS_COLORS.find(c => !used.has(c)) || WS_COLORS[0];
}
/* Alle Abholtage einer Tonne zwischen from und to (beide als Tagesbeginn), als YYYY-MM-DD */
function wsDates(b, from, to) {
  const a = ymd(from), z = ymd(to), out = new Set(b.dates.filter(x => x >= a && x <= z));
  if (b.every && b.start) {
    const s = parseYmd(b.start), step = b.every * 7;
    const k = Math.max(0, Math.ceil(dayDiff(s, from) / step));
    for (let d = addDays(s, k * step), n = 0; d <= to && n < 60; d = addDays(d, step), n++) out.add(ymd(d));
  }
  return [...out].sort();
}
/* Pro Tonne der nächste und übernächste Termin, sortiert nach dem nächsten */
function wsUpcoming(bins, now) {
  const t0 = sod(now), t1 = addDays(t0, 120);
  return bins.map(b => { const ds = wsDates(b, t0, t1); return { b, next: ds[0] ? parseYmd(ds[0]) : null, after: ds[1] ? parseYmd(ds[1]) : null }; })
    .filter(x => x.next).sort((x, y) => x.next - y.next || x.b.name.localeCompare(y.b.name, 'de'));
}
const wsOn = (bins, d) => bins.filter(b => wsDates(b, d, d).length);
const wsNames = list => list.map(b => b.name).join(', ').replace(/, ([^,]*)$/, ' und $1');
const wsDay = (d, today) => { const n = dayDiff(today, d); return n === 0 ? 'Heute' : n === 1 ? 'Morgen' : n < 7 ? WDL[d.getDay()] : `${WD[d.getDay()]} ${d.getDate()}. ${MS[d.getMonth()]}`; };
/* Termine aus Dateien, die bald ausgehen: Hinweis, die neue Datei zu laden */
function wsRunsOut(bins, now) {
  const fileOnly = bins.filter(b => !b.every && b.dates.length);
  if (!fileOnly.length) return null;
  const last = fileOnly.map(b => b.dates[b.dates.length - 1]).sort().pop();
  return dayDiff(now, parseYmd(last)) < 21 ? parseYmd(last) : null;
}

function renderWaste() {
  const W = state.waste, c = wsCfg(), now = new Date(), today = sod(now);
  const formOpen = !$('#ws-form').hidden;
  $('#ws-setup').hidden = formOpen || W.bins.length > 0;
  $('#ws-live').hidden = formOpen || !W.bins.length;
  if (formOpen || !W.bins.length) { $('#ws-src').textContent = ''; return; }
  const up = wsUpcoming(W.bins, now);
  const tom = wsOn(W.bins, addDays(today, 1)), tod = wsOn(W.bins, today);
  const late = now >= at(now, c.at);
  const ban = $('#ws-banner');
  if (tom.length) {
    ban.hidden = false;
    ban.className = `ws-banner${late ? ' due' : ''}`;
    ban.innerHTML = `<b>${late ? 'Heute Abend rausstellen' : 'Morgen wird abgeholt'}</b><span>${tom.map(b => `<i style="--c:${b.color}">${esc(b.name)}</i>`).join('')}</span>`;
  } else if (tod.length && now.getHours() < 12) {
    ban.hidden = false;
    ban.className = 'ws-banner due';
    ban.innerHTML = `<b>Heute wird abgeholt</b><span>${tod.map(b => `<i style="--c:${b.color}">${esc(b.name)}</i>`).join('')}</span>`;
  } else ban.hidden = true;
  $('#ws-list').innerHTML = up.length ? up.map(x => {
    const n = dayDiff(today, x.next);
    const sub = [n >= 2 ? `in ${n} Tagen` : '', x.after ? `danach ${WD[x.after.getDay()]} ${x.after.getDate()}. ${MS[x.after.getMonth()]}` : ''].filter(Boolean).join(' · ');
    return `<li class="ws-row" style="--c:${x.b.color}"><span class="ws-dot" aria-hidden="true"></span><span class="ws-main"><b>${esc(x.b.name)}</b>${sub ? `<small>${esc(sub)}</small>` : ''}</span><span class="ws-when${n <= 1 ? ' soon' : ''}">${wsDay(x.next, today)}</span></li>`;
  }).join('') : '<li class="empty">Keine Termine in den nächsten Monaten. Lad die neue Datei deines Entsorgers.</li>';
  const out = wsRunsOut(W.bins, now);
  $('#ws-src').innerHTML = out ? `<span class="ws-warn">Die Termine aus der Datei reichen nur bis ${dm(out)}${out.getFullYear()}. Lad die neue Datei deines Entsorgers.</span>`
    : esc(W.file ? `Termine aus ${W.file.name}${c.remind ? `, Erinnerung am Vorabend ab ${c.at} Uhr` : ''}` : c.remind ? `Erinnerung am Vorabend ab ${c.at} Uhr` : '');
}
/* Für den Spiegel: was heute oder morgen abgeholt wird */
function wsMirror(now) {
  const bins = state.waste.bins, today = sod(now), out = [];
  if (!bins.length) return out;
  const tod = wsOn(bins, today), tom = wsOn(bins, addDays(today, 1));
  if (tod.length && now.getHours() < 12) out.push({ t: `Heute Abholung: ${wsNames(tod)}`, c: tod[0].color });
  if (tom.length) out.push({ t: `Morgen Abholung: ${wsNames(tom)}${now >= at(now, wsCfg().at) ? ', heute Abend rausstellen' : ''}`, c: tom[0].color });
  return out;
}
/* Einmal pro Minute: ab der eingestellten Uhrzeit am Vorabend einmal erinnern */
function wsTick(now) {
  if (now.getSeconds() !== 20) return;
  if (views.has('waste') && !views.get('waste').el.hidden && now.getMinutes() % 5 === 0) renderWaste();
  const c = wsCfg(), bins = state.waste.bins;
  if (!c.remind || !bins.length || now < at(now, c.at)) return;
  const tomorrow = addDays(sod(now), 1), key = ymd(tomorrow), tom = wsOn(bins, tomorrow);
  if (!tom.length || lsGet(WS_NOTE) === key) return;
  lsSet(WS_NOTE, key);
  const body = `Morgen wird abgeholt: ${wsNames(tom)}.`;
  toast(`${body} Denk dran, heute Abend rauszustellen.`, null, { ms: 30000 });
  if ('Notification' in window && Notification.permission === 'granted') {
    try { new Notification('Müll rausstellen', { body, tag: 'cockpit-muell-' + key }); } catch { /* manche Browser wollen das nur über den Service Worker */ }
  }
  if (views.has('waste')) renderWaste();
}

/* Einrichten mit Entwurf: erst „Speichern“ übernimmt Datei, Rhythmen, Namen und Farben */
function wsOpenForm() {
  const c = wsCfg();
  ws.draft = JSON.parse(JSON.stringify(state.waste.bins));
  ws.file = undefined;
  $('#ws-remind').checked = c.remind;
  $('#ws-at').value = c.at;
  $('#ws-name').value = '';
  $('#ws-start').value = '';
  $('#ws-every').value = '2';
  $('#ws-ferr').hidden = true;
  $('#ws-import-msg').hidden = true;
  wsRenderDraft();
  $('#ws-form').hidden = false;
  renderWaste();
  layoutNow();
}
const wsCount = n => `${n} ${n === 1 ? 'Termin' : 'Termine'} aus der Datei`;
function wsRenderDraft() {
  const ul = $('#ws-bins'), now = new Date();
  ul.innerHTML = ws.draft.map((b, i) => {
    const ds = wsDates(b, sod(now), addDays(sod(now), 400));
    const info = [b.every ? `alle ${b.every === 1 ? 'Woche' : `${b.every} Wochen`} ab ${dm(parseYmd(b.start))}` : '', b.dates.length ? wsCount(ds.filter(d => b.dates.includes(d)).length) : ''].filter(Boolean).join(', ');
    return `<li><button type="button" class="ca-dot" data-wscol="${i}" style="--c:${b.color}" aria-label="Farbe von ${esc(b.name)} ändern" title="Farbe ändern"></button><div class="tx"><input type="text" maxlength="40" value="${esc(b.name)}" data-wsname="${i}" aria-label="Name der Tonne"><span>${esc(info || 'keine Termine')}</span></div><button type="button" class="icon-btn" data-wsdel="${i}" aria-label="${esc(b.name)} entfernen">${TRASH}</button></li>`;
  }).join('');
  ul.hidden = !ws.draft.length;
  const N = 'Notification' in window;
  $('#ws-notify').hidden = !N || Notification.permission !== 'default';
  $('#ws-notify-on').hidden = !N || Notification.permission !== 'granted';
}
function wsAddDraft() {
  const fail = m => { $('#ws-ferr').textContent = m; $('#ws-ferr').hidden = false; return false; };
  const name = $('#ws-name').value.trim().slice(0, 40), start = $('#ws-start').value;
  if (!name && !start) return true;
  if (!name) return fail('Wie heißt die Tonne? Zum Beispiel Restmüll oder Papier.');
  if (!validYmd(start)) return fail('Wann wird sie das nächste Mal abgeholt? Trag das Datum ein.');
  const every = +$('#ws-every').value || 2;
  const old = ws.draft.find(b => b.name.toLowerCase() === name.toLowerCase());
  if (old) Object.assign(old, { every, start });
  else {
    if (ws.draft.length >= 12) return fail('Mehr als 12 Tonnen gehen nicht.');
    ws.draft.push({ id: uid(), name, color: wsAutoColor(name, new Set(ws.draft.map(b => b.color))), dates: [], every, start });
  }
  $('#ws-name').value = '';
  $('#ws-start').value = '';
  $('#ws-ferr').hidden = true;
  wsRenderDraft();
  return true;
}
/* ICS des Entsorgers: Termine eines Jahres, pro Titel eine Tonne. Bestehende Tonnen mit gleichem Namen bekommen die neuen Termine. */
const wsKind = t => String(t).replace(/^(abfuhr|leerung|abholung|entleerung|termin)\s*[:-]?\s*/i, '').replace(/\s+/g, ' ').trim().slice(0, 40) || 'Abfuhr';
async function wsImport(text, fileName) {
  const ICAL = await caLoadLib();
  if (!/BEGIN:VCALENDAR/i.test(text)) return { err: 'Das ist keine Kalenderdatei. Nimm die ICS-Datei deines Entsorgers.' };
  const from = sod(new Date()), to = addDays(from, 400);
  let evs;
  try { evs = caExpand(ICAL, text, { id: 'ws' }, addDays(from, -1), to); } catch { return { err: 'Die Datei konnte nicht gelesen werden.' }; }
  const byKind = new Map();
  for (const e of evs) {
    const k = wsKind(e.t), d = ymd(new Date(e.s));
    if (!byKind.has(k)) byKind.set(k, new Set());
    byKind.get(k).add(d);
  }
  if (!byKind.size) return { err: 'In der Datei stehen keine Termine ab heute. Vielleicht ist sie vom letzten Jahr?' };
  const kinds = [...byKind.entries()].sort((a, b) => b[1].size - a[1].size).slice(0, 12);
  const a = ymd(from);
  let n = 0;
  for (const [name, set] of kinds) {
    const dates = [...set].sort();
    n += dates.length;
    const old = ws.draft.find(b => b.name.toLowerCase() === name.toLowerCase());
    if (old) old.dates = [...new Set([...old.dates.filter(x => x < a), ...dates])].sort().slice(-500);
    else if (ws.draft.length < 12) ws.draft.push({ id: uid(), name, color: wsAutoColor(name, new Set(ws.draft.map(b => b.color))), dates, every: 0, start: '' });
  }
  ws.file = { name: String(fileName || 'Datei').slice(0, 80), at: new Date().toISOString() };
  const last = kinds.flatMap(([, s]) => [...s]).sort().pop();
  return { kinds: kinds.length, n, last };
}
$('#ws-setup-btn').addEventListener('click', wsOpenForm);
$('#ws-set-btn').addEventListener('click', () => { if ($('#ws-form').hidden) wsOpenForm(); else { $('#ws-form').hidden = true; ws.draft = null; renderWaste(); layoutNow(); } });
$('#ws-add').addEventListener('click', () => { if (wsAddDraft()) $('#ws-name').focus(); });
for (const id of ['#ws-name', '#ws-start']) $(id).addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); wsAddDraft(); } });
$('#ws-bins').addEventListener('click', e => {
  const d = e.target.closest('[data-wsdel]'), c = e.target.closest('[data-wscol]');
  if (d) { ws.draft.splice(+d.dataset.wsdel, 1); wsRenderDraft(); layoutNow(); }
  if (c) { const b = ws.draft[+c.dataset.wscol]; b.color = WS_COLORS[(WS_COLORS.indexOf(b.color) + 1) % WS_COLORS.length]; wsRenderDraft(); }
});
$('#ws-bins').addEventListener('input', e => {
  const i = e.target.dataset.wsname;
  if (i != null && ws.draft[+i]) ws.draft[+i].name = e.target.value.slice(0, 40);
});
$('#ws-import').addEventListener('click', () => { $('#ws-file').value = ''; $('#ws-file').click(); });
$('#ws-file').addEventListener('change', async e => {
  const f = e.target.files && e.target.files[0], msg = $('#ws-import-msg');
  if (!f) return;
  msg.hidden = false;
  msg.textContent = 'Datei wird gelesen …';
  if (f.size > 5e6) { msg.textContent = 'Die Datei ist zu groß für einen Abfuhrkalender.'; return; }
  let r;
  try { r = await wsImport(await f.text(), f.name); } catch { r = { err: 'Der Kalender-Leser konnte nicht geladen werden. Prüf die Verbindung und versuch es nochmal.' }; }
  msg.textContent = r.err || `${r.n} Termine für ${r.kinds} ${r.kinds === 1 ? 'Tonne' : 'Tonnen'} gefunden, bis ${dm(parseYmd(r.last))}${r.last.slice(0, 4)}. Prüf die Namen und klick auf Speichern.`;
  wsRenderDraft();
  layoutNow();
});
$('#ws-notify').addEventListener('click', () => {
  try { Promise.resolve(Notification.requestPermission()).then(wsRenderDraft, wsRenderDraft); } catch { wsRenderDraft(); }
});
$('#ws-cancel').addEventListener('click', () => { $('#ws-form').hidden = true; ws.draft = null; renderWaste(); layoutNow(); });
$('#ws-form').addEventListener('submit', e => {
  e.preventDefault();
  const fail = m => { $('#ws-ferr').textContent = m; $('#ws-ferr').hidden = false; };
  if (($('#ws-name').value.trim() || $('#ws-start').value) && !wsAddDraft()) return;
  if (ws.draft.some(b => !b.name.trim())) return fail('Jede Tonne braucht einen Namen.');
  const at2 = $('#ws-at').value;
  if (!validHm(at2)) return fail('Die Uhrzeit für die Erinnerung bitte als HH:MM.');
  const old = { bins: state.waste.bins, file: state.waste.file };
  state.waste = normWaste({ bins: ws.draft.map(b => ({ ...b, name: b.name.trim() })), file: ws.file === undefined ? old.file : ws.file });
  if (!state.waste.bins.length) state.waste.file = null;
  const c = wsCfg();
  c.remind = $('#ws-remind').checked;
  c.at = at2;
  $('#ws-form').hidden = true;
  ws.draft = null;
  commit();
  layoutNow();
});

defineWidget('waste', { render: renderWaste });
