/* Pomodoro (gibt es nur einmal). Der laufende Timer liegt extra im Browser, damit er Neuladen übersteht.
 * Die geschafften Runden pro Tag liegen in state.pomo.log und kommen mit in die Sicherung. */
const PO_KEY = 'jere-cockpit-pomodoro';
const PO_NAME = { focus: 'Fokus', short: 'Pause', long: 'Lange Pause' };
const PO_C = 2 * Math.PI * 52;
const BASE_TITLE = document.title;
const po = { mode: 'focus', running: false, endsAt: 0, left: 0, round: 1, task: '', taskId: '' };
function poLoad() {
  const r = lsGet(PO_KEY) || {};
  po.mode = PO_NAME[r.mode] ? r.mode : 'focus';
  po.running = !!r.running && Number.isFinite(+r.endsAt) && +r.endsAt > 0;
  po.endsAt = po.running ? +r.endsAt : 0;
  po.left = Number.isFinite(+r.left) && +r.left > 0 ? +r.left : 0;
  po.round = intIn(r.round, 1, 8, 1);
  po.task = typeof r.task === 'string' ? r.task.slice(0, 120) : '';
  po.taskId = typeof r.taskId === 'string' ? r.taskId.slice(0, 40) : '';
}
poLoad();
const poCfg = () => state.widgets.pomodoro.cfg;
const poLen = m => poCfg()[m] * 6e4;
const poSave = () => lsSet(PO_KEY, { ...po });
/* Restzeit: läuft, angehalten (left) oder frisch (volle Länge der Phase) */
const poRemain = t => po.running ? Math.max(0, po.endsAt - t) : Math.min(po.left || Infinity, poLen(po.mode));
const mmss = ms => { const s = Math.ceil(ms / 1000); return `${pad(Math.floor(s / 60))}:${pad(s % 60)}`; };

let poAudio = null;
function poUnlockAudio() {
  try {
    poAudio = poAudio || new (window.AudioContext || window.webkitAudioContext)();
    if (poAudio.state === 'suspended') poAudio.resume();
  } catch { poAudio = null; }
}
function poBeep() {
  if (!poCfg().sound) return;
  try {
    poUnlockAudio();
    const ctx = poAudio, t0 = ctx.currentTime + 0.02;
    [0, 0.3, 0.6].forEach((d, i) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = i === 2 ? 1046.5 : 880;
      g.gain.setValueAtTime(0.0001, t0 + d);
      g.gain.exponentialRampToValueAtTime(0.22, t0 + d + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + d + 0.26);
      o.connect(g).connect(ctx.destination);
      o.start(t0 + d);
      o.stop(t0 + d + 0.28);
    });
  } catch { /* Ton geht hier nicht */ }
}
function poNotify(title, body) {
  try {
    if ('Notification' in window && Notification.permission === 'granted' && document.visibilityState !== 'visible') new Notification(title, { body, tag: 'cockpit-pomodoro' });
  } catch { /* Benachrichtigung geht hier nicht */ }
}

/* Phase vorbei (counted) oder übersprungen: Runde zählen, nächste Phase vorbereiten */
function poFinish(t, counted) {
  // Läuft das Cockpit in zwei Tabs, beendet nur einer die Phase
  const cur = lsGet(PO_KEY);
  if (counted && cur && (cur.endsAt !== po.endsAt || cur.mode !== po.mode)) { poLoad(); renderPomo(); return; }
  const was = po.mode, c = poCfg();
  if (was === 'focus' && counted) {
    const k = ymd(new Date(po.endsAt || t)), log = state.pomo.log;
    const e = log[k] || (log[k] = { n: 0, min: 0 });
    e.n++;
    e.min += c.focus;
    persist();
  }
  if (was === 'focus') po.mode = po.round >= c.every ? 'long' : 'short';
  else { po.mode = 'focus'; po.round = was === 'long' ? 1 : Math.min(c.every, po.round + 1); }
  po.left = 0;
  po.running = counted && c.auto;
  po.endsAt = po.running ? t + poLen(po.mode) : 0;
  poSave();
  if (counted) {
    poBeep();
    const msg = was === 'focus' ? `Fokus geschafft, jetzt ${po.mode === 'long' ? c.long : c.short} Min Pause.` : 'Pause vorbei, weiter geht’s.';
    poNotify(was === 'focus' ? 'Fokus geschafft' : 'Pause vorbei', msg);
    toast(msg);
  }
  renderPomo();
}
function tickPomo(now) {
  const t = now.getTime();
  if (po.running && t >= po.endsAt) poFinish(t, true);
  const want = po.running ? `${mmss(po.endsAt - t)} ${PO_NAME[po.mode]} · ${BASE_TITLE}` : BASE_TITLE;
  if (document.title !== want) document.title = want;
  const v = views.get('pomodoro');
  if (v && !v.el.hidden) poDraw(t);
}
function poDraw(t) {
  const rem = poRemain(t), len = poLen(po.mode), fresh = !po.running && rem >= len;
  $('#po-time').textContent = mmss(rem);
  $('#po-arc').style.strokeDashoffset = (PO_C * (1 - clamp01(rem / len))).toFixed(2);
  $('#po-ring').dataset.mode = po.mode;
  $('#po-mode').textContent = PO_NAME[po.mode] + (!po.running && !fresh ? ', angehalten' : '');
  $('#po-round').textContent = `Runde ${po.round} von ${poCfg().every}`;
  $('#po-start').textContent = po.running ? 'Anhalten' : fresh ? 'Start' : 'Weiter';
}
function poTasks() {
  const out = [], seen = new Set();
  for (const list of Object.values(tk.tasks)) for (const x of list || []) {
    const n = plain(x.content);
    if (n && !seen.has(x.id)) { seen.add(x.id); out.push({ id: x.id, name: n }); }
  }
  return out;
}
function renderPomo() {
  const c = poCfg(), now = new Date(), log = state.pomo.log, e = log[ymd(now)] || { n: 0, min: 0 };
  segSet($('#po-phase'), po.mode);
  const dots = $('#po-dots');
  dots.textContent = '';
  const slots = Math.max(c.every, Math.ceil((e.n + 1) / c.every) * c.every);
  for (let i = 0; i < Math.min(slots, 24); i++) { const d = document.createElement('i'); if (i >= e.n) d.className = 'e'; dots.appendChild(d); }
  let wk = 0;
  const mon = addDays(sod(now), -((now.getDay() + 6) % 7));
  for (let i = 0; i < 7; i++) { const x = log[ymd(addDays(mon, i))]; if (x) wk += x.n; }
  $('#po-today').textContent = (e.n ? `Heute ${e.n} ${e.n === 1 ? 'Runde' : 'Runden'}, ${hrsMin(e.min * 6e4)} Fokus.` : 'Heute noch keine Runde.') + (wk > e.n ? ` Diese Woche ${wk}.` : '');
  const tasks = poTasks(), dl = $('#po-tasks');
  dl.textContent = '';
  for (const x of tasks.slice(0, 60)) { const o = document.createElement('option'); o.value = x.name; dl.appendChild(o); }
  const inp = $('#po-task');
  if (document.activeElement !== inp) inp.value = po.task;
  $('#po-done').hidden = !(po.taskId && tasks.some(x => x.id === po.taskId));
  $('#po-notify-row').hidden = !('Notification' in window) || Notification.permission !== 'default';
  poDraw(now.getTime());
}

$('#po-start').addEventListener('click', () => {
  poUnlockAudio();
  const t = Date.now();
  if (po.running) { po.left = Math.max(1000, po.endsAt - t); po.running = false; po.endsAt = 0; }
  else { po.endsAt = t + poRemain(t); po.running = true; po.left = 0; }
  poSave();
  poDraw(t);
  tickPomo(new Date(t));
});
$('#po-reset').addEventListener('click', () => { po.running = false; po.endsAt = 0; po.left = 0; poSave(); renderPomo(); tickPomo(new Date()); });
$('#po-skip').addEventListener('click', () => poFinish(Date.now(), false));
$('#po-phase').addEventListener('click', e => {
  const b = e.target.closest('[data-v]');
  if (!b || !PO_NAME[b.dataset.v]) return;
  po.mode = b.dataset.v;
  po.running = false;
  po.endsAt = 0;
  po.left = 0;
  poSave();
  renderPomo();
  tickPomo(new Date());
});
$('#po-task').addEventListener('input', e => {
  po.task = e.target.value.slice(0, 120);
  const hit = poTasks().find(x => x.name === po.task.trim());
  po.taskId = hit ? hit.id : '';
  poSave();
  $('#po-done').hidden = !po.taskId;
});
$('#po-done').addEventListener('click', () => {
  if (!po.taskId) return;
  completeTask(po.taskId);
  po.task = '';
  po.taskId = '';
  poSave();
  renderPomo();
});
$('#po-notify').addEventListener('click', () => {
  try { Promise.resolve(Notification.requestPermission()).then(renderPomo, renderPomo); } catch { renderPomo(); }
});
$('#po-set-btn').addEventListener('click', () => {
  const f = $('#po-form');
  if (!f.hidden) { f.hidden = true; return; }
  const c = poCfg();
  $('#po-focus').value = c.focus;
  $('#po-short').value = c.short;
  $('#po-long').value = c.long;
  $('#po-every').value = c.every;
  $('#po-sound').checked = c.sound;
  $('#po-auto').checked = c.auto;
  $('#po-err').hidden = true;
  f.hidden = false;
  $('#po-focus').focus();
});
$('#po-cancel').addEventListener('click', () => { $('#po-form').hidden = true; });
$('#po-form').addEventListener('submit', e => {
  e.preventDefault();
  const num = (id, lo, hi) => { const n = Math.round(+$(id).value); return Number.isFinite(n) && n >= lo && n <= hi ? n : null; };
  const next = { focus: num('#po-focus', 1, 120), short: num('#po-short', 1, 60), long: num('#po-long', 1, 90), every: num('#po-every', 2, 8), sound: $('#po-sound').checked, auto: $('#po-auto').checked };
  if ([next.focus, next.short, next.long, next.every].includes(null)) { $('#po-err').textContent = 'Fokus 1 bis 120, Pausen 1 bis 60 bzw. 90 Minuten, lange Pause nach 2 bis 8 Runden.'; $('#po-err').hidden = false; return; }
  state.widgets.pomodoro.cfg = next;
  if (po.round > next.every) po.round = next.every;
  if (po.left > poLen(po.mode)) po.left = 0;
  poSave();
  $('#po-form').hidden = true;
  commit();
});
/* Anderer Tab hat den Timer geändert */
addEventListener('storage', e => { if (e.key === PO_KEY) { poLoad(); renderPomo(); } });

defineWidget('pomodoro', { render: renderPomo });
