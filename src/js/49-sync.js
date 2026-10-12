/* Sync zwischen Geräten: Der Stand liegt in einer eigenen kleinen Ablage (Cloudflare Worker mit KV), erreichbar nur mit deinem Passwort.
 * Adresse und Passwort bleiben nur in diesem Browser (jere-cockpit-sync) und kommen nicht in die Sicherung.
 * Eigene Änderungen gehen nach ein paar Sekunden hoch, sonst fragt das Cockpit regelmäßig nach.
 * Ändern zwei Geräte gleichzeitig etwas, gilt der spätere Stand. Der verdrängte bleibt als Kopie liegen (jere-cockpit-vor-sync).
 * Pro Gerät bleiben Seite, Design und Kartengröße, außerdem alles, was in einem eigenen Schlüssel liegt (Tokens, Keys, Kalender-Links, Timer). */
const SY_KEY = 'jere-cockpit-sync', SY_BACKUP = 'jere-cockpit-vor-sync';
const SY_WORKER = /*@sync-worker*/'';
const sy = { on: false, busy: false, again: false, waiting: false, said: false, seen: '', touch: 0, noteT: null, pushT: null, last: 0, err: '', errKind: '', told: '', choice: null };

/* Gespeicherte Zugangsdaten und Zählerstand: { url, pass, rev, dirty, localAt, lastOk } */
function syCfg() {
  const c = lsGet(SY_KEY);
  return c && typeof c.url === 'string' && c.url && typeof c.pass === 'string' && c.pass ? c : null;
}
const sySave = c => lsSet(SY_KEY, c);

/* Was zwischen Geräten wandert: alles außer der offenen Seite, den Merkzetteln dieses Browsers und Design und Größe */
function syView(s) {
  const v = { ...s, ui: { ...s.ui } };
  delete v.page;
  delete v.meta;
  delete v.ui.theme;
  delete v.ui.size;
  return v;
}
const syCanon = v => Array.isArray(v) ? `[${v.map(syCanon).join(',')}]`
  : v && typeof v === 'object' ? `{${Object.keys(v).filter(k => v[k] !== undefined).sort().map(k => `${JSON.stringify(k)}:${syCanon(v[k])}`).join(',')}}`
  : JSON.stringify(v);
function syHashStr(str) {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}
const syHash = () => syHashStr(syCanon(syView(state)));
/* Läuft auf einem anderen Gerät schon eine neuere Version, würde diese hier Felder verlieren */
const syNewer = r => !!r.ver && verNum(r.ver) > verNum(VERSION);
const syErr = (kind, msg) => Object.assign(new Error(msg), { kind });
const SY_OLD = 'Auf einem anderen Gerät läuft eine neuere Version. Lad dieses Cockpit neu (Strg+F5, am Mac Cmd+Shift+R).';

/* Ein Aufruf beim Worker. Gibt die Antwort zurück, bei Konflikt (409) mit conflict: true. */
async function syCall(url, pass, method, body, keepalive) {
  let res;
  try {
    res = await fetch(url, {
      method, body, cache: 'no-store', keepalive: !!keepalive && !!body && body.length < 6e4,
      headers: { Authorization: `Bearer ${pass}`, ...(body ? { 'Content-Type': 'text/plain;charset=UTF-8' } : {}) }
    });
  } catch { throw syErr('net', 'Der Worker ist nicht erreichbar. Prüf die Adresse und deine Verbindung.'); }
  let j = null;
  try { j = await res.json(); } catch { /* keine Antwort im erwarteten Format */ }
  if (res.ok) {
    if (!j || typeof j !== 'object' || typeof j.rev !== 'number') throw syErr('bad', 'Unter dieser Adresse antwortet kein Cockpit-Worker.');
    return j;
  }
  if (res.status === 401) throw syErr('auth', 'Das Passwort stimmt nicht mit dem im Worker überein.');
  if (res.status === 409 && j && typeof j.rev === 'number') return { ...j, conflict: true };
  if (res.status === 500 && j && j.error === 'setup') {
    const was = { SYNC_KV: 'die Ablage (SYNC_KV)', SYNC_SECRET: 'das Passwort (SYNC_SECRET)' };
    throw syErr('setup', `Dem Worker fehlt noch ${(Array.isArray(j.missing) ? j.missing : []).map(k => was[k] || k).join(' und ') || 'etwas'}. Schau in die Schritte oben.`);
  }
  if (res.status === 413) throw syErr('size', 'Dein Stand ist zu groß für die Ablage.');
  if (res.status === 503 && j && j.error === 'kv') throw syErr('kv', 'Die Ablage nimmt gerade nichts an, vielleicht ist das Tageslimit erreicht. Später klappt es wieder.');
  throw syErr('http', `Der Worker antwortet mit Fehler ${res.status}.`);
}

/* Prüft eine Antwort der Ablage, bevor man sie übernimmt */
function syCheckRemote(r) {
  if (syNewer(r)) throw syErr('old', SY_OLD);
  if (r.rev && (!r.state || typeof r.state !== 'object' || Array.isArray(r.state))) throw syErr('bad', 'Die Ablage enthält keinen gültigen Stand.');
}
/* Den Stand aus der Ablage übernehmen. how: 'pull' (hier war nichts Neues), 'conflict' (ein anderes Gerät war schneller) oder 'connect' (Cloud-Stand beim Verbinden).
 * Gibt false zurück, wenn gerade getippt oder bearbeitet wird, dann klappt es beim nächsten Abgleich.
 * Bei 'conflict' und 'connect' wird der verdrängte eigene Stand als Kopie aufgehoben und lässt sich über den Toast zurückholen. */
function syApply(r, how) {
  const a = document.activeElement;
  if (edit.on || (a && a.matches && a.matches('input:not([type=button]), textarea, select, [contenteditable="true"]'))) return false;
  const old = state, hb = syHash();
  if (how !== 'pull') lsSet(SY_BACKUP, state);
  state = normalize({ ...r.state, ui: { ...(r.state.ui || {}), theme: old.ui.theme, size: old.ui.size }, page: old.page, meta: old.meta });
  persist();
  sy.seen = syHash();
  renderAll();
  afterStateSwap(old);
  layoutNow();
  if (dr.open) renderDrawer();
  const changed = sy.seen !== hb;
  sy.said = how === 'connect' || changed;
  if (how === 'pull') { if (changed) toast('Stand von deinem anderen Gerät übernommen.', null, { ms: 3500 }); }
  else if (!changed) { if (how === 'connect') toast('Verbunden.'); }
  else toast(how === 'connect' ? 'Verbunden. Der Stand aus der Cloud ist jetzt hier, deinen bisherigen kannst du zurückholen.'
    : 'Ein anderes Gerät war schneller. Sein Stand ist jetzt hier, deine letzten Änderungen kannst du zurückholen.', () => syRestore(old), { label: 'Zurückholen', ms: 20000 });
  return true;
}
function syRestore(prev) {
  const cur = state;
  state = prev;
  commit();
  afterStateSwap(cur);
  layoutNow();
  if (dr.open) renderDrawer();
}

async function syPull(c) {
  const r = await syCall(c.url, c.pass, 'GET');
  syCheckRemote(r);
  if (!r.rev) {
    // Die Ablage ist leer, zum Beispiel weil sie geleert wurde: dieser Stand ist die Quelle
    if (c.rev) { c.rev = 0; c.dirty = true; c.localAt = c.localAt || new Date().toISOString(); sySave(c); }
    return '';
  }
  if (r.rev === c.rev) return '';
  if (!syApply(r, 'pull')) return 'wait';
  const cur = syCfg() || c;
  cur.rev = r.rev;
  cur.dirty = false;
  sySave(cur);
  return '';
}
async function syPush(c, force, keepalive) {
  const body = JSON.stringify({ base: c.rev, at: c.localAt || new Date().toISOString(), ver: VERSION, force: !!force, state: syView(state) });
  const h = syHash();
  const r = await syCall(c.url, c.pass, 'PUT', body, keepalive);
  if (!r.conflict) {
    const cur = syCfg() || c;
    cur.rev = r.rev;
    if (syHash() === h) cur.dirty = false;
    sySave(cur);
    return '';
  }
  syCheckRemote(r);
  // Ein anderes Gerät war schneller. Der spätere Stand gewinnt, bei Gleichstand dieses Gerät.
  if (r.rev && Date.parse(r.at) > (Date.parse(c.localAt || '') || Date.now())) {
    if (!syApply(r, 'conflict')) return 'wait';
    const cur = syCfg() || c;
    cur.rev = r.rev;
    cur.dirty = false;
    sySave(cur);
    return '';
  }
  c.rev = r.rev || 0;
  sySave(c);
  return syPush(c, true, keepalive);
}

/* Ein Abgleich: erst hochladen, was hier neu ist, sonst nachsehen, ob drüben etwas neu ist */
async function syRun(why, opts = {}) {
  if (!sy.on) return;
  if (sy.busy) { sy.again = true; return; }
  clearTimeout(sy.noteT);
  syCheck();
  clearTimeout(sy.pushT);
  const c = syCfg();
  if (!c) return;
  sy.busy = true;
  syShow();
  const run = async () => {
    try {
      const wait = c.dirty ? await syPush(c, false, opts.keepalive) : await syPull(c);
      sy.waiting = !!wait;
      sy.err = '';
      sy.errKind = '';
      sy.told = '';
      if (!wait) { const cur = syCfg(); if (cur) { cur.lastOk = new Date().toISOString(); sySave(cur); } }
    } catch (e) {
      sy.err = e.message || 'Der Abgleich hat nicht geklappt.';
      sy.errKind = e.kind || 'x';
      // Fehler, die sich nicht von selbst lösen, einmal melden
      if (['auth', 'setup', 'old'].includes(sy.errKind) && sy.told !== sy.errKind) { sy.told = sy.errKind; toast(sy.err, null, { ms: 9000 }); }
    }
  };
  try {
    if (navigator.locks && !opts.keepalive) await navigator.locks.request('jere-cockpit-sync', { ifAvailable: true }, lock => lock ? run() : undefined);
    else await run();
  } finally {
    sy.busy = false;
    // Wurde nichts übernommen, weil gerade getippt wird, fragt das Cockpit schon in einer halben Minute wieder nach
    sy.last = Date.now() - (sy.waiting ? 100000 : 0);
    sy.waiting = false;
    syShow();
  }
  if (sy.again) { sy.again = false; syRun('again'); }
}

/* Jedes Speichern meldet sich hier. Nach einer kurzen Pause wird geprüft, ob sich wirklich etwas Mitzunehmendes geändert hat. */
function syNote() {
  if (!sy.on) return;
  sy.touch = Date.now();
  clearTimeout(sy.noteT);
  sy.noteT = setTimeout(syCheck, 2500);
}
function syCheck() {
  const c = sy.on && syCfg();
  if (!c) return;
  const h = syHash();
  if (h === sy.seen) return;
  sy.seen = h;
  c.dirty = true;
  c.localAt = new Date(sy.touch || Date.now()).toISOString();
  sySave(c);
  clearTimeout(sy.pushT);
  sy.pushT = setTimeout(() => syRun('push'), 6000);
  syShow();
}
/* Ein anderer Tab hat etwas geändert und gesichert: das ist dann keine eigene Änderung dieses Tabs */
function syRebase() { if (sy.on) sy.seen = syHash(); }

/* Fußzeile und Anzeige im Anpassen-Fenster */
function syMode() {
  if (!sy.on) return 'local';
  if (sy.busy) return 'cloudbusy';
  if (sy.err) return 'clouderr';
  const c = syCfg();
  return c && c.dirty ? 'cloudwait' : 'cloud';
}
function syShow() {
  setSync(lsOk ? syMode() : 'none');
  renderSyncState();
}
function renderSyncState() {
  const c = syCfg(), el = $('#sy-state');
  if (!c) return;
  const t = c.lastOk ? new Date(c.lastOk) : null;
  el.dataset.s = sy.err && !sy.busy ? 'err' : 'ok';
  el.textContent = sy.busy ? 'Gleicht gerade ab …'
    : sy.err ? sy.err
    : c.dirty ? 'Änderungen warten auf den Abgleich.'
    : t ? `Verbunden. Letzter Abgleich ${dayDiff(t, new Date()) === 0 ? 'heute' : `am ${dmy(t)}`} um ${hm(t)} Uhr.` : 'Verbunden.';
}
function renderSyncChoice() {
  const ch = sy.choice;
  $('#sy-choice').hidden = !ch;
  $('#sy-form').hidden = !!ch;
  if (ch) {
    const d = new Date(ch.r.at);
    $('#sy-choice-txt').textContent = `In deiner Cloud liegt schon ein Stand, zuletzt geändert am ${dmy(d)} um ${hm(d)} Uhr.`;
  }
}
function renderSync() {
  const c = syCfg();
  $('#sy-on').hidden = !c;
  $('#sy-setup').hidden = !!c;
  $('#sy-pass-view').hidden = true;
  if (c) $('#sy-addr').textContent = c.url.replace(/^https?:\/\//, '').replace(/\/$/, '');
  else { $('#sy-code').textContent = SY_WORKER; renderSyncChoice(); }
  renderSyncState();
}

/* Verbinden: erst ausprobieren, dann entscheiden, wessen Stand gilt */
const syNormUrl = raw => {
  let s = String(raw || '').trim();
  if (!s) return null;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(s) && !/^https?:\/\//i.test(s)) return null;
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
  try {
    const x = new URL(s);
    if (x.protocol !== 'https:' && !['localhost', '127.0.0.1', '[::1]'].includes(x.hostname)) return null;
    x.search = '';
    x.hash = '';
    return x.href;
  } catch { return null; }
};
function syGenPass() {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'; // 56 Zeichen ohne verwechselbare
  let out = '';
  while (out.length < 32) for (const b of crypto.getRandomValues(new Uint8Array(48))) if (b < 224 && out.length < 32) out += A[b % 56];
  return out;
}
async function syCopy(text, ok, fallback) {
  try { await navigator.clipboard.writeText(text); toast(ok); }
  catch { if (fallback) fallback(); else toast('Kopieren hat nicht geklappt. Markier den Text und kopier ihn von Hand.'); }
}
/* mode: 'up' lädt diesen Stand hoch, 'down' übernimmt den der Cloud, 'new' heißt: die Cloud ist leer */
async function syStart(url, pass, r, mode) {
  const c = { url, pass, rev: r.rev, dirty: mode !== 'down', localAt: new Date().toISOString(), lastOk: null };
  sy.choice = null;
  if (mode === 'down') {
    if (!syApply(r, 'connect')) { toast('Klick erst aus dem Feld, in dem du gerade tippst, und versuch es nochmal.'); return false; }
    c.dirty = false;
    c.lastOk = new Date().toISOString();
  }
  sySave(c);
  sy.on = true;
  sy.err = '';
  sy.errKind = '';
  sy.told = '';
  sy.seen = syHash();
  sy.last = 0;
  renderSync();
  syShow();
  if (mode !== 'down') {
    await syRun('connect');
    if (!sy.err) toast('Verbunden. Dein Stand liegt jetzt in der Cloud.');
  }
  return true;
}
$('#sy-form').addEventListener('submit', async e => {
  e.preventDefault();
  const fail = m => { $('#sy-err').textContent = m; $('#sy-err').hidden = false; };
  $('#sy-err').hidden = true;
  const url = syNormUrl($('#sy-url').value), pass = $('#sy-pass').value.trim();
  if (!url) return fail('Die Adresse braucht https:// am Anfang, zum Beispiel https://cockpit-sync.dein-name.workers.dev');
  if (pass.length < 16) return fail('Das Passwort ist zu kurz. Mit „Erzeugen“ bekommst du ein langes.');
  if (!lsOk) return fail('Dein Browser speichert hier nichts, zum Beispiel im privaten Fenster.');
  const btn = $('#sy-go');
  btn.disabled = true;
  btn.textContent = 'Verbinde …';
  try {
    const r = await syCall(url, pass, 'GET');
    syCheckRemote(r);
    if (!r.rev) await syStart(url, pass, r, 'new');
    else { sy.choice = { url, pass, r }; renderSyncChoice(); }
  } catch (err) { fail(err.message); }
  btn.disabled = false;
  btn.textContent = 'Verbinden';
});
$('#sy-take-cloud').addEventListener('click', () => { const ch = sy.choice; if (ch) syStart(ch.url, ch.pass, ch.r, 'down'); });
$('#sy-take-mine').addEventListener('click', () => { const ch = sy.choice; if (ch) syStart(ch.url, ch.pass, ch.r, 'up'); });
$('#sy-choice-cancel').addEventListener('click', () => { sy.choice = null; renderSyncChoice(); });
$('#sy-gen').addEventListener('click', () => {
  $('#sy-pass').value = syGenPass();
  $('#sy-pass').type = 'text';
  $('#sy-show').textContent = 'Verbergen';
  toast('Passwort erzeugt. Kopier es jetzt, du brauchst es gleich im Worker.');
});
$('#sy-show').addEventListener('click', () => {
  const p = $('#sy-pass'), hide = p.type === 'text';
  p.type = hide ? 'password' : 'text';
  $('#sy-show').textContent = hide ? 'Anzeigen' : 'Verbergen';
});
$('#sy-pass-copy').addEventListener('click', () => { if ($('#sy-pass').value) syCopy($('#sy-pass').value, 'Passwort kopiert'); });
$('#sy-copy').addEventListener('click', () => syCopy(SY_WORKER, 'Worker-Code kopiert', () => {
  const r = document.createRange();
  r.selectNodeContents($('#sy-code'));
  const s = getSelection();
  s.removeAllRanges();
  s.addRange(r);
  toast('Code ist markiert, kopier ihn mit Strg+C oder Cmd+C');
}));

/* Verbunden: abgleichen, Adresse und Passwort für ein weiteres Gerät kopieren, trennen */
$('#sy-now').addEventListener('click', async () => {
  sy.last = 0;
  sy.said = false;
  await syRun('manual');
  if (!sy.err && !sy.said) toast('Abgeglichen.');
});
$('#sy-addr-copy').addEventListener('click', () => { const c = syCfg(); if (c) syCopy(c.url, 'Adresse kopiert'); });
$('#sy-pass-copy2').addEventListener('click', () => {
  const c = syCfg();
  if (c) syCopy(c.pass, 'Passwort kopiert', () => { $('#sy-pass-view').textContent = c.pass; $('#sy-pass-view').hidden = false; });
});
$('#sy-off').addEventListener('click', () => {
  try { localStorage.removeItem(SY_KEY); } catch { /* egal */ }
  clearTimeout(sy.noteT);
  clearTimeout(sy.pushT);
  sy.on = false;
  sy.err = '';
  sy.errKind = '';
  sy.told = '';
  renderSync();
  syShow();
  toast('Sync getrennt. Dein Stand bleibt in diesem Browser, in der Cloud bleibt er auch liegen.');
});

/* Start, regelmäßiges Nachfragen und Hochladen beim Verlassen */
function syInit() {
  sy.on = !!syCfg();
  if (!sy.on) return;
  sy.seen = syHash();
  syShow();
  syRun('start');
}
setInterval(() => {
  if (!sy.on || sy.busy || document.visibilityState !== 'visible' || navigator.onLine === false) return;
  const c = syCfg();
  if (!c) return;
  if (c.dirty) { if (sy.err && Date.now() - sy.last > 60000) syRun('retry'); }
  else if (Date.now() - sy.last > 120000) syRun('poll');
}, 15000);
document.addEventListener('visibilitychange', () => {
  if (!sy.on) return;
  if (document.visibilityState === 'hidden') {
    syCheck();
    const c = syCfg();
    if (c && c.dirty) syRun('hide', { keepalive: true });
  } else if (Date.now() - sy.last > 20000) syRun('visible');
});
addEventListener('online', () => { if (sy.on) syRun('online'); });
addEventListener('pagehide', syCheck);
/* Adresse oder Passwort wurden in einem anderen Tab geändert oder gelöscht */
addEventListener('storage', e => { if (e.key === SY_KEY) { sy.on = !!syCfg(); if (sy.on) syRebase(); syShow(); if (dr.open) renderSync(); } });
syncHook = syNote;
syncMode = syMode;
