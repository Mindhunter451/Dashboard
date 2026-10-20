/* Kopfzeile, Kacheln oben und Aussehen */
function setTile(id, val, sub, mode) {
  const el = typeof id === 'string' ? $(id) : id;
  el.querySelector('.t-val').textContent = val;
  el.querySelector('.t-sub').textContent = sub;
  el.toggleAttribute('data-hot', mode === 'hot');
  el.toggleAttribute('data-good', mode === 'good');
}
function tickTiles(now) {
  const t = sod(now), wb = workBar();
  // Feierabend
  if (!wb) setTile('#t-fa', 'Keine Arbeitszeit', 'Leg einen Arbeitstag-Balken an');
  else {
    const why = freeReason(wb, now);
    const s = at(now, wb.start), e = at(now, wb.end);
    if (why) setTile('#t-fa', 'Heute frei', why === 'Kein Arbeitstag' ? 'Kein Arbeitstag laut Balken' : why, 'good');
    else if (now >= e) setTile('#t-fa', 'Geschafft', `seit ${wb.end} Uhr`, 'good');
    else setTile('#t-fa', `in ${dur(e - now, true)}`, `um ${wb.end} Uhr${wb.example ? ' (Beispielzeit)' : ''}${cm.homeMins && !ptMode() ? `, Heimweg ca. ${cm.homeMins} Min` : ''}`, now >= s ? 'hot' : null);
  }
  // Wochenende
  const mon = addDays(t, -((now.getDay() + 6) % 7));
  const wStart = wb ? at(addDays(mon, 4), wb.end) : addDays(mon, 5);
  const wEnd = addDays(mon, 7);
  if (now >= wStart && now < wEnd) setTile('#t-we', 'Jetzt', `noch ${dur(wEnd - now)} bis Montag`, 'good');
  else setTile('#t-we', `in ${dur(wStart - now, true)}`, `ab Freitag ${hm(wStart)} Uhr`);
  // Feiertag
  let next = null;
  for (const yy of [t.getFullYear(), t.getFullYear() + 1]) {
    for (const h of holidays(yy).list) if (h[0] >= t) { next = h; break; }
    if (next) break;
  }
  if (next) {
    const n = dayDiff(t, next[0]), wknd = next[0].getDay() === 0 || next[0].getDay() === 6;
    setTile('#t-ft', inDays(n), `${next[1]}, ${WD[next[0].getDay()]} ${dm(next[0])}${wknd ? ' (fällt aufs Wochenende)' : ''}`, n === 0 ? 'good' : null);
  }
  // Urlaub
  const tk = ymd(t);
  const running = vacationOn(t);
  const upcoming = state.vacation.entries.filter(e => e.from > tk).sort((a, b) => a.from.localeCompare(b.from))[0];
  if (running) setTile('#t-ur', 'Läuft gerade', `${running.label || 'Urlaub'} bis ${WD[parseYmd(running.to).getDay()]} ${dm(parseYmd(running.to))}`, 'good');
  else if (upcoming) {
    const f = parseYmd(upcoming.from);
    const n = dayDiff(t, f);
    setTile('#t-ur', inDays(n), `${upcoming.label || 'Urlaub'}${upcoming.example ? ' (Beispiel)' : ''}, ab ${WD[f.getDay()]} ${dm(f)}`, n <= 1 ? 'hot' : null);
  } else setTile('#t-ur', 'Nix geplant', 'Trag deinen nächsten Urlaub ein');
  // Nächster Termin aus dem Kalender
  const sec = caSec();
  if (!sec.feeds.length) setTile('#t-cal', 'Kein Kalender', 'Richte das Kalender-Widget ein');
  else if (!ca.data) setTile('#t-cal', 'Kommt gleich', 'Termine werden geladen');
  else {
    const t0 = +now, evs = ca.data.events.filter(e => !e.a && sec.feeds.some(f => f.id === e.f));
    const run = evs.find(e => e.s <= t0 && e.e > t0), nx = evs.find(e => e.s > t0);
    if (run) setTile('#t-cal', 'Läuft gerade', `${run.t}, bis ${hm(new Date(run.e))} Uhr`, 'good');
    else if (nx) {
      const s = new Date(nx.s), n = dayDiff(t, sod(s));
      setTile('#t-cal', n === 0 ? `in ${dur(nx.s - t0, true)}` : inDays(n), `${nx.t}, ${n === 0 ? '' : n === 1 ? 'morgen ' : WD[s.getDay()] + ' ' + dm(s) + ' '}${hm(s)} Uhr`, nx.s - t0 < 36e5 ? 'hot' : null);
    } else setTile('#t-cal', 'Nichts geplant', 'In den nächsten Tagen keine Termine');
  }
  // Sonne: der nächste Auf- oder Untergang
  const D = sky.day, sl = $('#t-sun .t-label');
  if (D && D.rise && D.set && now < D.set) {
    const rise = now < D.rise;
    sl.textContent = rise ? 'Sonnenaufgang' : 'Sonnenuntergang';
    setTile('#t-sun', `in ${dur((rise ? D.rise : D.set) - now, true)}`, `um ${hm(rise ? D.rise : D.set)} Uhr${rise ? '' : `, ${hrsMin(D.set - D.rise)} Tageslicht`}`, !rise && D.set - now < 36e5 ? 'hot' : null);
  } else {
    const T = sunMorrow(now);
    sl.textContent = 'Sonnenaufgang';
    if (T && T.rise) setTile('#t-sun', `in ${dur(T.rise - now, true)}`, `morgen um ${hm(T.rise)} Uhr`);
    else setTile('#t-sun', 'Heute nicht', 'Kein Auf- oder Untergang an deinem Ort');
  }
  // Eigene Countdowns
  for (const el of document.querySelectorAll('[data-cd]')) {
    const c = state.ui.countdowns.find(x => x.id === el.dataset.cd);
    if (!c) continue;
    const day = parseYmd(c.date), n = dayDiff(t, day), target = c.time ? at(day, c.time) : day;
    const sub = `${WDL[day.getDay()]}, ${dm(day)}${day.getFullYear() !== t.getFullYear() ? day.getFullYear() : ''}${c.time ? ` um ${c.time} Uhr` : ''}`;
    if (n > 1 && !(c.time && target - now < 36e5 * 36)) setTile(el, `in ${n} Tagen`, sub, null);
    else if (c.time && target > now) setTile(el, `in ${dur(target - now, true)}`, sub, 'hot');
    else if (n === 1) setTile(el, 'Morgen', sub, 'hot');
    else if (n === 0) setTile(el, c.time ? 'Läuft' : 'Heute', sub, 'good');
    else setTile(el, `vor ${-n} ${n === -1 ? 'Tag' : 'Tagen'}`, sub);
  }
}
/* Morgen früh: Sonnenaufgang für die Sonnen-Kachel, einmal pro Tag gerechnet */
let sunMo = { key: '', day: null };
function sunMorrow(now) {
  const k = ymd(now);
  if (sunMo.key !== k) sunMo = { key: k, day: sunDay(addDays(sod(now), 1), skyLoc()) };
  return sunMo.day;
}
/* Kacheln in der eingestellten Reihenfolge. Im Bearbeiten-Modus lassen sie sich direkt hier oben verschieben. */
function renderTiles() {
  const box = $('#tiles'), u = state.ui, els = {}, end = $('#tiles-edit');
  for (const k of Object.keys(TILES)) { els[k] = $('#t-' + k); els[k].hidden = !u.tiles[k]; }
  box.querySelectorAll('[data-cd]').forEach(el => el.remove());
  for (const c of u.countdowns) {
    const el = document.createElement('div');
    el.className = 'tile';
    el.id = 'cd-' + c.id;
    el.dataset.cd = c.id;
    el.dataset.key = 'cd:' + c.id;
    el.innerHTML = '<p class="t-label"></p><p class="t-val">&nbsp;</p><p class="t-sub">&nbsp;</p>';
    el.querySelector('.t-label').textContent = c.name;
    els['cd:' + c.id] = el;
  }
  for (const k of normOrder(u.order, u.countdowns)) if (els[k]) box.insertBefore(els[k], end);
  for (const el of box.querySelectorAll('.tile')) {
    if (edit.on) { el.tabIndex = 0; el.setAttribute('aria-label', `${el.querySelector('.t-label').textContent}, mit Pfeiltasten oder Ziehen verschieben`); }
    else { el.removeAttribute('tabindex'); el.removeAttribute('aria-label'); }
  }
  end.hidden = !edit.on;
  box.classList.toggle('sortable', edit.on);
  box.hidden = !curPage().tiles || !box.querySelector('.tile:not([hidden])');
}
sortable($('#tiles'), { item: '.tile', handle: '.tile', when: () => edit.on, done: keys => { state.ui.order = normOrder(keys, state.ui.countdowns); commit(); } });
$('#tiles-edit').addEventListener('click', () => { openDrawer('head'); setTimeout(() => { const g = $('#dr-tiles'); if (g) g.scrollIntoView({ block: 'start', behavior: reduceMotion ? 'auto' : 'smooth' }); }, 80); });

let headKey = '';
function tickHeader(now) {
  const k = `${hm(now)}|${state.ui.seconds}`;
  if (k !== headKey) {
    headKey = k;
    $('#h-time').innerHTML = `${pad(now.getHours())}<span class="colon">:</span>${pad(now.getMinutes())}${state.ui.seconds ? '<span class="sec"></span>' : ''}`;
    $('#h-day').textContent = WDL[now.getDay()];
    $('#h-date').textContent = `${now.getDate()}. ${ML[now.getMonth()]} ${now.getFullYear()}`;
    $('#h-kw').textContent = isoWeek(now);
    $('#mb-time').textContent = hm(now);
  }
  const s = $('#h-time .sec');
  if (s) s.textContent = pad(now.getSeconds());
}

const themeStyle = document.createElement('style');
document.head.appendChild(themeStyle);
let lastLook = '';
/* Akzent neu setzen, nur wenn sich etwas geändert hat (bei „Mit dem Tag“ jede Minute geprüft) */
function applyAccent() {
  const css = accentCss(state.ui);
  if (css !== themeStyle.textContent) themeStyle.textContent = css;
}
function applyUi() {
  const u = state.ui, root = document.documentElement;
  if (u.theme === 'auto') root.removeAttribute('data-theme'); else root.setAttribute('data-theme', u.theme);
  if (u.dark === 'oled') root.setAttribute('data-dark', 'oled'); else root.removeAttribute('data-dark');
  if (u.density === 'normal') root.removeAttribute('data-density'); else root.setAttribute('data-density', u.density);
  root.style.setProperty('--r', u.radius + 'px');
  applyAccent();
  // Kopf: Stil, Größe und Stärke der Uhr, was neben der Uhr steht
  const h = u.head;
  root.dataset.head = h.style;
  root.style.setProperty('--clock-k', String(h.size / 100));
  root.style.setProperty('--clock-w', String(h.weight));
  $('#h-greet').classList.toggle('vh', !h.greet);
  $('#h-day').hidden = !h.date;
  $('#h-date').hidden = !h.date;
  $('#sky-kw').hidden = !h.kw;
  $('#sky-date').hidden = !h.date && !h.kw;
  $('#h-greet').textContent = u.greet.trim() || 'Moin';
  $('#foot-region').textContent = `Feiertage: ${REGIONS[u.region]}`;
  headKey = '';
  sky.minute = -1;
  const look = `${isDark()}|${u.accent}|${u.accentHex}|${u.dark}`;
  if (look !== lastLook) { lastLook = look; refreshMapLook(); }
}
