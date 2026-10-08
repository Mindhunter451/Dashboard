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
    else setTile('#t-fa', `in ${dur(e - now, true)}`, `um ${wb.end} Uhr${wb.example ? ' (Beispielzeit)' : ''}${cm.homeMins ? `, Heimweg ca. ${cm.homeMins} Min` : ''}`, now >= s ? 'hot' : null);
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
    setTile('#t-ur', inDays(dayDiff(t, f)), `${upcoming.label || 'Urlaub'}${upcoming.example ? ' (Beispiel)' : ''}, ab ${WD[f.getDay()]} ${dm(f)}`, 'hot');
  } else setTile('#t-ur', 'Nix geplant', 'Trag deinen nächsten Urlaub ein');
  // Eigene Countdowns
  for (const el of document.querySelectorAll('[data-cd]')) {
    const c = state.ui.countdowns.find(x => x.id === el.dataset.cd);
    if (!c) continue;
    const day = parseYmd(c.date), n = dayDiff(t, day), target = c.time ? at(day, c.time) : day;
    const sub = `${WDL[day.getDay()]}, ${dm(day)}${day.getFullYear() !== t.getFullYear() ? day.getFullYear() : ''}${c.time ? ` um ${c.time} Uhr` : ''}`;
    if (n > 1 && !(c.time && target - now < 36e5 * 36)) setTile(el, `in ${n} Tagen`, sub, n <= 7 ? 'hot' : null);
    else if (c.time && target > now) setTile(el, `in ${dur(target - now, true)}`, sub, 'hot');
    else if (n === 1) setTile(el, 'Morgen', sub, 'hot');
    else if (n === 0) setTile(el, c.time ? 'Läuft' : 'Heute', sub, 'good');
    else setTile(el, `vor ${-n} ${n === -1 ? 'Tag' : 'Tagen'}`, sub);
  }
}
function renderTiles() {
  const box = $('#tiles');
  for (const k of Object.keys(TILES)) $('#t-' + k).hidden = !state.ui.tiles[k];
  box.querySelectorAll('[data-cd]').forEach(el => el.remove());
  for (const c of state.ui.countdowns) {
    const el = document.createElement('div');
    el.className = 'tile';
    el.id = 'cd-' + c.id;
    el.dataset.cd = c.id;
    el.innerHTML = '<p class="t-label"></p><p class="t-val">&nbsp;</p><p class="t-sub">&nbsp;</p>';
    el.querySelector('.t-label').textContent = c.name;
    box.appendChild(el);
  }
  box.hidden = !curPage().tiles || !box.querySelector('.tile:not([hidden])');
}

function tickHeader(now) {
  $('#h-time').innerHTML = state.ui.seconds ? `${hm(now)}<span class="sec">:${pad(now.getSeconds())}</span>` : hm(now);
  $('#h-date').textContent = `${WDL[now.getDay()]}, ${now.getDate()}. ${ML[now.getMonth()]} ${now.getFullYear()}`;
  $('#h-kw').textContent = pad(isoWeek(now));
}

const themeStyle = document.createElement('style');
document.head.appendChild(themeStyle);
let lastLook = '';
function applyUi() {
  const u = state.ui, root = document.documentElement;
  if (u.theme === 'auto') root.removeAttribute('data-theme'); else root.setAttribute('data-theme', u.theme);
  const p = ACCENTS[u.accent] || ACCENTS.amber;
  const vars = a => `--accent:${a[0]};--accent-ink:${a[1]};--chip-bg:${a[2]};--on-accent:${a[3]};`;
  themeStyle.textContent = `:root{${vars(p.l)}}@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){${vars(p.d)}}}:root[data-theme="dark"]{${vars(p.d)}}`;
  $('#h-greet').textContent = u.greet.trim() || 'Moin';
  $('#foot-region').textContent = `Feiertage: ${REGIONS[u.region]}`;
  const look = `${isDark()}|${u.accent}`;
  if (look !== lastLook) { lastLook = look; refreshMapLook(); }
}
