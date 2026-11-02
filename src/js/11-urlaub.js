/* Urlaub (gibt es nur einmal, Markup steht fest im HTML) */
function vacCalc(now) {
  const y = now.getFullYear(), tk = ymd(now);
  let taken = 0, planned = 0;
  const rows = [];
  for (const e of [...state.vacation.entries].sort((a, b) => a.from.localeCompare(b.from))) {
    const from = parseYmd(e.from), to = parseYmd(e.to);
    let days = 0, inYear = 0;
    const halves = [];
    for (let d = from; d <= to; d = addDays(d, 1)) {
      const w = vacWeight(d, e.half);
      if (!w) continue;
      days += w;
      if (w === 0.5 && !e.half) halves.push(dm(d));
      if (d.getFullYear() === y) { inYear += w; if (ymd(d) <= tk) taken += w; else planned += w; }
    }
    const status = e.to < tk ? 'genommen' : e.from <= tk ? 'läuft' : 'geplant';
    if (to.getFullYear() >= y) rows.push({ e, days, inYear, status, from, to, halves });
  }
  const total = state.vacation.allowance + state.vacation.carry;
  return { y, taken, planned, total, free: total - taken - planned, rows };
}
let vacDayKey = '';
function renderVacation() {
  const now = new Date();
  vacDayKey = ymd(now);
  const v = vacCalc(now);
  $('#va-year').textContent = v.y;
  $('#vac-free').textContent = numDe(v.free, v.free % 1 ? 1 : 0);
  $('#vac-free-lbl').textContent = v.free < 0 ? 'Tage zu viel verplant' : v.free === 1 ? 'Tag noch frei zu verplanen' : 'Tage noch frei zu verplanen';
  $('#vac-big').toggleAttribute('data-over', v.free < 0);
  $('#vac-taken').textContent = numTxt(v.taken);
  $('#vac-planned').textContent = numTxt(v.planned);
  $('#vac-total').textContent = numTxt(v.total);
  const base = Math.max(v.total, v.taken + v.planned, 1);
  $('#seg-t').style.width = (v.taken / base * 100) + '%';
  $('#seg-p').style.width = (v.planned / base * 100) + '%';
  $('#vac-stack').setAttribute('aria-label', `${numTxt(v.taken)} genommen, ${numTxt(v.planned)} geplant, ${numTxt(v.free)} frei von ${numTxt(v.total)} Tagen`);
  $('#vac-ex-hint').hidden = !state.vacation.allowanceExample;
  $('#vac-rule').textContent = `Gezählt werden Montag bis Freitag, Feiertage in ${REGIONS[state.ui.region]} sind schon abgezogen.${state.vacation.halfXmas ? ' Der 24.12. und der 31.12. zählen jeweils als halber Tag.' : ''}`;

  const ul = $('#vac-list');
  ul.textContent = '';
  if (!v.rows.length) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.style.display = 'block';
    li.textContent = 'Noch kein Urlaub eingetragen.';
    ul.appendChild(li);
  }
  for (const r of v.rows) {
    const li = document.createElement('li');
    const same = r.e.from === r.e.to;
    const dates = same ? `${WD[r.from.getDay()]} ${dm(r.from)}${r.from.getFullYear() !== v.y ? r.from.getFullYear() : ''}` : `${WD[r.from.getDay()]} ${dm(r.from)} bis ${WD[r.to.getDay()]} ${dm(r.to)}${r.to.getFullYear() !== v.y ? r.to.getFullYear() : ''}`;
    const dayStr = r.inYear !== r.days ? `${numTxt(r.inYear)} von ${numTxt(r.days)}` : daysTxt(r.days);
    const halfTxt = !r.e.half && r.halves.length ? `${r.halves.join(' und ')} halb` : '';
    li.innerHTML = `<div class="v-label"><span class="lab"></span>${r.e.example ? '<span class="chip">Beispiel</span>' : ''}<span class="status" data-s="${r.status}">${r.status}</span></div><div class="v-dates">${esc(dates)}${halfTxt ? ` · <span class="v-half">${esc(halfTxt)}</span>` : ''}</div><div class="v-days">${esc(dayStr)}</div><button type="button" class="icon-btn" data-vedit="${esc(r.e.id)}">${PENCIL}</button><button type="button" class="icon-btn" data-del="${esc(r.e.id)}">${TRASH}</button>`;
    li.querySelector('.lab').textContent = r.e.label || 'Urlaub';
    li.querySelector('[data-vedit]').setAttribute('aria-label', `${r.e.label || 'Urlaub'} bearbeiten`);
    li.querySelector('[data-del]').setAttribute('aria-label', `${r.e.label || 'Urlaub'} löschen`);
    if (editingVac === r.e.id && !$('#vac-form').hidden) li.classList.add('editing');
    ul.appendChild(li);
  }
}
function deleteVac(id) {
  const i = state.vacation.entries.findIndex(x => x.id === id);
  if (i < 0) return;
  const [removed] = state.vacation.entries.splice(i, 1);
  if (editingVac === id) closeVacForm();
  commit();
  toast(`„${removed.label || 'Urlaub'}“ gelöscht`, () => { state.vacation.entries.push(removed); commit(); });
}
$('#vac-list').addEventListener('click', e => {
  const del = e.target.closest('[data-del]');
  if (del) return deleteVac(del.dataset.del);
  const ed = e.target.closest('[data-vedit]');
  if (!ed) return;
  const entry = state.vacation.entries.find(x => x.id === ed.dataset.vedit);
  if (entry) openVacForm(entry);
});
$('#vac-set-btn').addEventListener('click', () => {
  $('#vs-allow').value = state.vacation.allowance;
  $('#vs-carry').value = state.vacation.carry;
  $('#vs-xmas').checked = state.vacation.halfXmas;
  closeVacForm();
  $('#vac-set').hidden = false;
  $('#vs-allow').focus();
});
$('#vs-cancel').addEventListener('click', () => { $('#vac-set').hidden = true; });
$('#vac-set').addEventListener('submit', e => {
  e.preventDefault();
  const a = parseFloat(String($('#vs-allow').value).replace(',', '.'));
  const c = parseFloat(String($('#vs-carry').value).replace(',', '.'));
  state.vacation.allowance = Number.isFinite(a) && a >= 0 ? Math.min(a, 99) : state.vacation.allowance;
  state.vacation.carry = Number.isFinite(c) && c >= 0 ? Math.min(c, 99) : 0;
  state.vacation.allowanceExample = false;
  state.vacation.halfXmas = $('#vs-xmas').checked;
  $('#vac-set').hidden = true;
  commit();
});
let editingVac = null;
function vfSingle() {
  const f = $('#vf-from').value, t = $('#vf-to').value || f;
  return validYmd(f) && f === t && isWorkday(parseYmd(f)) && !(state.vacation.halfXmas && isXmasHalf(parseYmd(f)));
}
function vfPreview() {
  const f = $('#vf-from').value, t = $('#vf-to').value || f;
  const single = vfSingle();
  $('#vf-half-row').hidden = !single;
  if (!validYmd(f) || t < f) { $('#vf-preview').textContent = ''; return; }
  const { n, halves } = vacDays(parseYmd(f), parseYmd(t), single && $('#vf-half').checked);
  const why = halves.length ? `, der ${halves.join(' und der ')} ${halves.length === 1 ? 'zählt' : 'zählen'} halb` : '';
  let txt;
  if (!n) txt = 'In dem Zeitraum liegt kein Arbeitstag.';
  else if (n === 0.5) txt = `Das ist ein halber Urlaubstag${why ? `, der ${halves[0]} zählt halb` : ''}.`;
  else txt = `Das sind ${numTxt(n)} ${n === 1 ? 'Urlaubstag' : 'Urlaubstage'}${why}.`;
  $('#vf-preview').textContent = txt;
}
/* Reiseziel für den Wetterplanet: Ortssuche bei Open-Meteo, der erste Treffer zählt und wird angezeigt */
const vfp = { q: '', hit: null, timer: 0, seq: 0 };
function vfPlaceShow() {
  const el = $('#vf-place-hit'), q = $('#vf-place').value.trim();
  el.textContent = !q ? '' : vfp.q !== q ? 'Suche …' : vfp.hit ? `Gefunden: ${[vfp.hit.name, vfp.hit.admin, vfp.hit.country].filter(Boolean).join(', ')}` : 'Kein Ort mit diesem Namen gefunden.';
}
async function vfPlaceLookup() {
  const q = $('#vf-place').value.trim(), seq = ++vfp.seq;
  if (!q) { vfp.q = ''; vfp.hit = null; vfPlaceShow(); return null; }
  if (vfp.q === q) return vfp.hit;
  vfPlaceShow();
  let hit = null;
  try {
    const j = await getJson(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=1&language=de&format=json`);
    const r = j && j.results && j.results[0];
    if (r) hit = { name: r.name, admin: r.admin1 || '', country: r.country || '', lat: r.latitude, lon: r.longitude };
  } catch { if (seq === vfp.seq) $('#vf-place-hit').textContent = 'Ortssuche gerade nicht erreichbar.'; return undefined; }
  if (seq !== vfp.seq) return undefined;
  vfp.q = q; vfp.hit = hit;
  vfPlaceShow();
  return hit;
}
$('#vf-place').addEventListener('input', () => { clearTimeout(vfp.timer); vfPlaceShow(); vfp.timer = setTimeout(vfPlaceLookup, 500); });
function openVacForm(entry, focusPlace) {
  editingVac = entry ? entry.id : null;
  const P = entry && entry.place;
  $('#vf-place').value = P ? P.q || P.name : '';
  Object.assign(vfp, P ? { q: P.q || P.name, hit: { name: P.name, admin: P.admin || '', country: P.country || '', lat: P.lat, lon: P.lon } } : { q: '', hit: null });
  vfPlaceShow();
  if (entry) {
    $('#vf-from').value = entry.from;
    $('#vf-to').value = entry.to;
    $('#vf-label').value = entry.label || '';
    $('#vf-half').checked = !!entry.half;
  } else {
    const t = sod(new Date());
    const mon = addDays(t, ((8 - t.getDay()) % 7) || 7);
    $('#vf-from').value = ymd(mon);
    $('#vf-to').value = ymd(addDays(mon, 4));
    $('#vf-label').value = '';
    $('#vf-half').checked = false;
  }
  $('#vf-title').textContent = entry ? `${entry.label || 'Urlaub'} bearbeiten` : 'Urlaub eintragen';
  $('#vf-submit').textContent = entry ? 'Speichern' : 'Eintragen';
  $('#vf-del').hidden = !entry;
  $('#vf-err').hidden = true;
  $('#vac-set').hidden = true;
  $('#vac-form').hidden = false;
  vfPreview();
  renderVacation();
  $('#vac-form').scrollIntoView({ block: 'nearest', behavior: reduceMotion ? 'auto' : 'smooth' });
  $(focusPlace ? '#vf-place' : '#vf-from').focus({ preventScroll: true });
}
function closeVacForm() {
  $('#vac-form').hidden = true;
  if (editingVac) { editingVac = null; renderVacation(); }
}
$('#vac-add').addEventListener('click', () => openVacForm(null));
$('#vf-from').addEventListener('input', () => {
  if ($('#vf-to').value && $('#vf-to').value < $('#vf-from').value) $('#vf-to').value = $('#vf-from').value;
  vfPreview();
});
$('#vf-to').addEventListener('input', vfPreview);
$('#vf-half').addEventListener('change', vfPreview);
$('#vf-cancel').addEventListener('click', closeVacForm);
$('#vf-del').addEventListener('click', () => { if (editingVac) deleteVac(editingVac); });
$('#vac-form').addEventListener('submit', async e => {
  e.preventDefault();
  const err = msg => { $('#vf-err').textContent = msg; $('#vf-err').hidden = false; };
  const f = $('#vf-from').value, t = $('#vf-to').value || f;
  if (!validYmd(f)) return err('Trag den ersten Urlaubstag ein.');
  if (t < f) return err('Der letzte Tag liegt vor dem ersten.');
  if (dayDiff(parseYmd(f), parseYmd(t)) > 366) return err('Maximal ein Jahr am Stück.');
  const entry = { id: editingVac || uid(), from: f, to: t, label: $('#vf-label').value.trim(), half: vfSingle() && $('#vf-half').checked };
  const pq = $('#vf-place').value.trim();
  if (pq) {
    clearTimeout(vfp.timer);
    const hit = await vfPlaceLookup();
    if (hit === undefined) return err('Das Reiseziel ließ sich gerade nicht suchen. Versuch es gleich noch mal oder lass das Feld leer.');
    if (!hit) return err(`Kein Ort namens „${pq}“ gefunden. Versuch es mit einer Stadt in der Nähe.`);
    entry.place = { q: pq, name: hit.name, admin: hit.admin, country: hit.country, lat: hit.lat, lon: hit.lon };
  }
  const clash = state.vacation.entries.find(x => x.id !== entry.id && x.from <= t && f <= x.to);
  if (clash) return err(`Überschneidet sich mit „${clash.label || 'Urlaub'}“ (${dm(parseYmd(clash.from))} bis ${dm(parseYmd(clash.to))}).`);
  const i = state.vacation.entries.findIndex(x => x.id === entry.id);
  const before = i >= 0 ? state.vacation.entries[i] : null;
  if (i >= 0) state.vacation.entries[i] = entry; else state.vacation.entries.push(entry);
  editingVac = null;
  $('#vac-form').hidden = true;
  commit();
  if (before) toast(`„${entry.label || 'Urlaub'}“ geändert`, () => { const k = state.vacation.entries.findIndex(x => x.id === entry.id); if (k >= 0) { state.vacation.entries[k] = before; commit(); } });
});

defineWidget('vacation', { render: renderVacation });
