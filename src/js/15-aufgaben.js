/* Aufgaben: direkt über die Todoist API mit deinem persönlichen Token.
 * Alle Aufgaben-Widgets teilen sich Verbindung und Datenstand, jedes zeigt nur die Projekte aus seiner Einstellung. */
const TK_TOKEN = 'jere-cockpit-todoist';
const TD_API = 'https://api.todoist.com/api/v1';
const tk = { proj: {}, projList: null, projAt: 0, tasks: {}, stamp: 0, pending: new Set(), open: {}, busy: null, again: false, memTok: '', msg: null, ask: null, askSeq: 0, retried: false };

/* Alle Projektnamen aus allen Aufgaben-Widgets, ohne Doppelte (Schlüssel klein geschrieben) */
function tkKeys() {
  const m = new Map();
  for (const [, w] of widgetsOf('tasks')) for (const n of w.cfg.projects) if (!m.has(n.toLowerCase())) m.set(n.toLowerCase(), n);
  return [...m];
}
function tkNamesTxt(keys) { const n = keys.map(([, t]) => `„${t}“`); return n.length > 1 ? `${n.slice(0, -1).join(', ')} oder ${n[n.length - 1]}` : n[0] || ''; }
function tkReset() { tk.proj = {}; tk.tasks = {}; tk.open = {}; tk.projList = null; tk.projAt = 0; tk.stamp = 0; }
function tasksReconfigure() { tk.projAt = 0; renderTasksAll(); if (tdToken()) tdLoad(); }
const renderTasksAll = () => viewsOf('tasks').forEach(renderTaskView);
function tkMsg(text, btnLabel, fn) { tk.msg = text ? { text, btnLabel, fn } : null; renderTasksAll(); }
function tdAsk(err) { tk.msg = null; tk.ask = { err: err || '', fail: '' }; tk.askSeq++; renderTasksAll(); }
function tdAskClose() { tk.ask = null; if (!tdToken()) tkIdle(); else renderTasksAll(); }
/* Ohne Token: kompakter Hinweis statt großem Formular. Das Formular kommt erst nach „Verbinden“. */
function tkIdle() {
  tkMsg('Noch nicht mit Todoist verbunden.', 'Verbinden', () => {
    tdAsk();
    const t = $('#board [data-type="tasks"]:not([hidden]) [data-r="token"]');
    if (t) t.focus();
  });
}

function tdToken() {
  try { return localStorage.getItem(TK_TOKEN) || tk.memTok; } catch { return tk.memTok; }
}
function tdSetToken(v) {
  tk.memTok = v || '';
  try { if (v) localStorage.setItem(TK_TOKEN, v); else localStorage.removeItem(TK_TOKEN); return true; } catch { return false; }
}
function tdErr(code, msg, extra) { const e = new Error(msg || code); e.code = code; Object.assign(e, extra || {}); return e; }
async function tdFetch(path, method, token, body) {
  const tok = token || tdToken();
  if (!tok) throw tdErr('no_token');
  let r;
  try {
    r = await fetch(TD_API + path, {
      method: method || 'GET',
      headers: body ? { Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' } : { Authorization: 'Bearer ' + tok },
      body: body ? JSON.stringify(body) : undefined,
      cache: 'no-store',
      signal: typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? AbortSignal.timeout(15000) : undefined
    });
  } catch (e) { throw tdErr('network', e && e.message); }
  if (r.status === 401) throw tdErr('bad_token', 'Unauthorized', { status: 401 });
  if (r.status === 429) {
    let wait = +r.headers.get('retry-after');
    if (!Number.isFinite(wait) || wait <= 0) wait = 30;
    throw tdErr('rate', 'Too many requests', { status: 429, retryAfter: Math.min(wait, 900) });
  }
  if (r.status === 404) throw tdErr('not_found', 'Not found', { status: 404 });
  if (!r.ok) {
    let m = '';
    try { const j = await r.json(); m = j && (j.error || j.error_tag) || ''; } catch { /* kein JSON */ }
    throw tdErr('http', m, { status: r.status });
  }
  const txt = await r.text();
  if (!txt) return null;
  try { return JSON.parse(txt); } catch { return null; }
}
async function tdAll(path, token) {
  const out = [];
  let cursor = null, pages = 0;
  do {
    const sep = path.includes('?') ? '&' : '?';
    const j = await tdFetch(`${path}${sep}limit=200${cursor ? '&cursor=' + encodeURIComponent(cursor) : ''}`, 'GET', token);
    if (j && Array.isArray(j.results)) out.push(...j.results);
    cursor = j && j.next_cursor;
    pages++;
  } while (cursor && pages < 10);
  return out;
}
const tdTask = t => ({
  id: String(t.id),
  content: t.content,
  priority: 'p' + (5 - Math.min(4, Math.max(1, Math.round(+t.priority) || 1))),
  parentId: t.parent_id ? String(t.parent_id) : null,
  checked: !!t.checked,
  due: t.due || null
});

const plain = s => String(s || '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/\*\*|__|`/g, '').trim();
function dueInfo(t) {
  const raw = t.dueDate || (t.due && (t.due.datetime || t.due.date)) || null;
  if (!raw) return null;
  const s = String(raw);
  let date, time = '';
  if (/Z$|[+-]\d\d:\d\d$/.test(s)) { const dt = new Date(s); date = sod(dt); time = hm(dt); }
  else { if (!validYmd(s.slice(0, 10))) return null; date = parseYmd(s.slice(0, 10)); if (s.length > 10) time = s.slice(11, 16); }
  const now = new Date(), dd = dayDiff(now, date);
  const over = dd < 0 || (dd === 0 && time && at(date, time) < now);
  let label = dd === 0 ? 'Heute' : dd === 1 ? 'Morgen' : dd === -1 ? 'Gestern' : dd > 1 && dd < 7 ? WDL[date.getDay()] : `${WD[date.getDay()]} ${dm(date)}`;
  if (time) label += ` ${time}`;
  return { label: over && dd < 0 ? `${label}, überfällig` : label, s: over ? 'over' : dd === 0 ? 'today' : 'later', key: (time ? at(date, time) : addDays(date, 1)).getTime() - 1 };
}

function tdLoad() {
  if (!tdToken()) return Promise.resolve();
  if (tk.busy) { tk.again = true; return tk.busy; }
  tk.busy = (async () => {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const keys = tkKeys();
        if (!keys.length) return;
        if (!tk.projList || Date.now() - tk.projAt > 30 * 6e4 || keys.some(([k]) => !(k in tk.proj))) {
          tk.projList = (await tdAll('/projects')).filter(p => p && !p.is_deleted && !p.is_archived);
          tk.projAt = Date.now();
        }
        const proj = {};
        for (const [k] of keys) proj[k] = tk.projList.find(p => String(p.name || '').trim().toLowerCase() === k) || null;
        tk.proj = proj;
        const next = {};
        for (const [k] of keys) {
          const p = proj[k];
          next[k] = p
            ? (await tdAll('/tasks?project_id=' + encodeURIComponent(p.id)))
                .filter(t => t && !t.checked && !t.is_deleted)
                .sort((a, b) => (+a.child_order || 0) - (+b.child_order || 0))
                .map(tdTask)
            : [];
        }
        tk.tasks = next;
        tk.stamp = Date.now();
        tk.retried = false;
        if (keys.every(([k]) => !proj[k])) tkMsg(`In deinem Todoist gibt es kein Projekt namens ${tkNamesTxt(keys)}.`, 'Nochmal', () => { tk.projAt = 0; return tdLoad(); });
        else tkMsg('');
        return;
      } catch (e) {
        if (e && e.code === 'not_found' && attempt === 0) { tk.projList = null; continue; }
        tdError(e);
        return;
      }
    }
  })().finally(() => { tk.busy = null; if (tk.again) { tk.again = false; tdLoad(); } });
  return tk.busy;
}
function tdError(e) {
  const c = e && e.code;
  if (c === 'no_token') return tdAsk();
  if (c === 'bad_token') {
    tk.tasks = {};
    tk.stamp = 0;
    return tdAsk('Todoist nimmt deinen Token nicht mehr an. Wahrscheinlich wurde er neu erzeugt. Füg den aktuellen hier ein.');
  }
  if (c === 'rate') {
    setTimeout(() => tdLoad(), e.retryAfter * 1000);
    return tkMsg('Todoist bremst gerade, weil zu viele Anfragen kamen. Das Cockpit versucht es gleich von selbst nochmal.');
  }
  const since = tk.stamp ? ` Du siehst den Stand von ${hm(new Date(tk.stamp))} Uhr.` : '';
  if (c === 'network') {
    if (!tk.retried) { tk.retried = true; setTimeout(() => tdLoad(), 5000 + Math.random() * 2000); }
    return tkMsg(`Todoist ist gerade nicht erreichbar.${since}`, 'Nochmal', () => tdLoad());
  }
  return tkMsg(`Todoist meldet einen Fehler${e && e.status ? ` (Status ${e.status})` : ''}.${since}`, 'Nochmal', () => tdLoad());
}
async function tdConnect(v) {
  const q = v.q, val = q('[data-r="token"]').value.replace(/\s+/g, '');
  const fail = m => { if (tk.ask) tk.ask.fail = m; renderTasksAll(); };
  if (!val) {
    if (tdToken() && !(tk.ask && tk.ask.err)) return tdAskClose();
    return fail('Füg zuerst deinen Token ein.');
  }
  const btn = q('[data-r="save"]');
  btn.disabled = true;
  btn.textContent = 'Prüfe …';
  try {
    await tdFetch('/projects?limit=1', 'GET', val);
    const saved = tdSetToken(val);
    tk.ask = null;
    tkReset();
    renderTasksAll();
    await tdLoad();
    if (!saved) tkMsg('Dein Browser speichert hier nichts dauerhaft, zum Beispiel im privaten Fenster. Der Token gilt deshalb nur, bis du die Seite schließt.');
  } catch (err) {
    const c = err && err.code;
    fail(c === 'bad_token' ? 'Der Token passt nicht. Kopier ihn nochmal komplett aus Todoist.'
      : c === 'network' ? 'Todoist ist gerade nicht erreichbar. Prüf deine Verbindung und versuch es nochmal.'
      : c === 'rate' ? 'Todoist bremst gerade. Versuch es in einer Minute nochmal.'
      : `Das hat nicht geklappt${err && err.status ? ` (Status ${err.status})` : ''}.`);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Verbinden';
  }
}

/* Neue Aufgabe über Quick Add: Datum, Uhrzeit, p1 bis p4 und @Labels versteht Todoist selbst, wie in der App */
const tkAddProjects = v => state.widgets[v.id].cfg.projects.map(n => [n.toLowerCase(), n]).filter(([k]) => tk.proj[k]);
function renderTaskAdd(v) {
  const f = v.q('[data-r="addform"]'), sel = v.q('[data-r="proj"]'), list = tkAddProjects(v);
  f.hidden = !tdToken() || !!tk.ask || !list.length;
  const sig = list.map(([k, n]) => `${k}|${n}`).join(',');
  if (sel.dataset.sig !== sig) {
    const cur = sel.value;
    sel.textContent = '';
    for (const [k, n] of list) sel.add(new Option(n, k));
    if (list.some(([k]) => k === cur)) sel.value = cur;
    sel.dataset.sig = sig;
  }
  sel.hidden = list.length < 2;
}
async function tdQuickAdd(v) {
  const inp = v.q('[data-r="new"]'), sel = v.q('[data-r="proj"]'), btn = v.q('[data-r="addbtn"]');
  const text = inp.value.trim();
  if (!text || btn.disabled) return;
  const key = sel.value || (tkAddProjects(v)[0] || [])[0];
  const proj = key && tk.proj[key];
  if (!proj) return;
  const ownProj = /(^|\s)#\S/.test(text);
  const full = ownProj ? text : `${text} #${String(proj.name).trim().replace(/ /g, '\\ ')}`;
  btn.disabled = true;
  inp.disabled = true;
  try {
    let t = await tdFetch('/tasks/quick', 'POST', null, { text: full });
    // Falls Todoist das Projekt im Text nicht erkannt hat, die Aufgabe ins richtige Projekt schieben
    if (t && t.id && !ownProj && String(t.project_id) !== String(proj.id)) {
      try { t = (await tdFetch(`/tasks/${encodeURIComponent(t.id)}/move`, 'POST', null, { project_id: proj.id })) || t; } catch { /* bleibt, wo Todoist sie angelegt hat */ }
    }
    inp.value = '';
    const name = t && t.content ? plain(t.content) : text;
    if (t && t.id && tk.tasks[key] && String(t.project_id) === String(proj.id)) tk.tasks[key] = [...tk.tasks[key], tdTask(t)];
    renderTasksAll();
    toast(`„${name}“ angelegt`, t && t.id ? async () => {
      try { await tdFetch(`/tasks/${encodeURIComponent(t.id)}`, 'DELETE'); } catch (err) { tdError(err); }
      tdLoad();
    } : null);
    tdLoad();
  } catch (err) {
    if (err && ['bad_token', 'rate'].includes(err.code)) tdError(err);
    else tkMsg(`Die Aufgabe konnte nicht angelegt werden.${err && err.code === 'network' ? ' Todoist ist gerade nicht erreichbar.' : ''}`);
  } finally {
    btn.disabled = false;
    inp.disabled = false;
    inp.focus();
  }
}

function renderTaskView(v) {
  const q = v.q, w = state.widgets[v.id];
  if (!w) return;
  const m = tk.msg;
  q('[data-r="state"]').hidden = !m;
  q('[data-r="state-text"]').textContent = m ? m.text : '';
  const act = q('[data-r="action"]');
  act.hidden = !(m && m.btnLabel);
  act.textContent = m && m.btnLabel ? m.btnLabel : '';
  const has = !!tdToken(), ask = tk.ask;
  q('[data-r="state"]').classList.toggle('setup', !has && !ask);
  q('[data-r="foot"]').hidden = !has;
  q('[data-r="form"]').hidden = !ask;
  if (ask) {
    if (v.askSeq !== tk.askSeq) { v.askSeq = tk.askSeq; q('[data-r="token"]').value = ''; }
    q('[data-r="token"]').placeholder = has && !ask.err ? 'Gespeichert. Für einen neuen hier einfügen' : 'Token aus Todoist einfügen';
    q('[data-r="cancel"]').hidden = has && !!ask.err;
    q('[data-r="forget"]').hidden = !has;
    const e = ask.fail || ask.err;
    q('[data-r="err"]').textContent = e;
    q('[data-r="err"]').hidden = !e;
  }
  const cols = q('[data-r="cols"]');
  cols.hidden = !has || !!(ask && ask.err);
  if (!cols.hidden) renderTaskCols(v, cols, w.cfg.projects);
  q('[data-r="src"]').textContent = tk.stamp ? `Stand ${hm(new Date(tk.stamp))} Uhr` : '';
  renderTaskAdd(v);
}
function renderTaskCols(v, wrap, projects) {
  wrap.textContent = '';
  for (const title of projects) {
    const key = title.toLowerCase(), okey = `${v.id}:${key}`;
    const col = document.createElement('div');
    col.className = 'tk-col';
    wrap.appendChild(col);
    const proj = tk.proj[key], list = tk.tasks[key];
    const h = document.createElement('h3');
    const a = document.createElement('a');
    a.textContent = title;
    a.href = proj ? `https://app.todoist.com/app/project/${encodeURIComponent(proj.id)}` : 'https://app.todoist.com/app';
    a.target = '_blank'; a.rel = 'noopener';
    h.appendChild(a);
    col.appendChild(h);
    const note = txt => { const p = document.createElement('p'); p.className = 'hint'; p.textContent = txt; col.appendChild(p); };
    if (list == null) {
      if (tdToken()) { const ul = document.createElement('ul'); ul.className = 'tasks'; ul.innerHTML = skelRows(3, 'Aufgaben werden geladen'); col.appendChild(ul); } else note('Noch nicht geladen.');
      continue;
    }
    const open = list.filter(t => t && !t.checked).map((t, i) => ({ t, i, due: dueInfo(t), id: t.id, parentId: t.parentId }));
    const ids = new Set(open.map(x => x.id));
    const kids = new Map(), tops = [];
    for (const x of open) {
      if (x.parentId && ids.has(x.parentId)) { if (!kids.has(x.parentId)) kids.set(x.parentId, []); kids.get(x.parentId).push(x); }
      else tops.push(x);
    }
    tops.sort((x, y) => ((x.due ? x.due.key : Infinity) - (y.due ? y.due.key : Infinity)) || x.i - y.i);
    const urgent = open.filter(x => x.due && x.due.s !== 'later').length;
    const cnt = document.createElement('span');
    cnt.textContent = String(open.length);
    h.appendChild(cnt);
    if (urgent) { const c = document.createElement('span'); c.className = 'chip'; c.textContent = `${urgent} heute`; h.appendChild(c); }
    if (!proj) { note(`Kein Projekt „${title}“ gefunden.`); continue; }
    if (!open.length) { note('Alles erledigt. Nice.'); continue; }
    const ul = document.createElement('ul');
    ul.className = 'tasks';
    const LIMIT = isNarrow() ? 5 : 7;
    const shown = tk.open[okey] ? tops : tops.slice(0, LIMIT);
    const add = (x, sub) => {
      const t = x.t, due = x.due;
      const li = document.createElement('li');
      li.className = 'task' + (sub ? ' sub' : '') + (tk.pending.has(t.id) ? ' done' : '');
      li.dataset.p = ['p1', 'p2', 'p3'].includes(t.priority) ? t.priority : 'p4';
      li.innerHTML = `<button type="button" class="check" data-done="${esc(t.id)}">${CHECK}</button><div class="t-body"><a class="t-title" target="_blank" rel="noopener"></a>${due ? `<span class="due" data-s="${due.s}">${esc(due.label)}</span>` : ''}</div>`;
      const link = li.querySelector('.t-title');
      link.textContent = plain(t.content) || 'Ohne Titel';
      link.href = `https://app.todoist.com/app/task/${encodeURIComponent(t.id)}`;
      li.querySelector('.check').setAttribute('aria-label', `„${plain(t.content)}“ erledigen`);
      ul.appendChild(li);
    };
    for (const t of shown) { add(t, false); (kids.get(t.id) || []).forEach(k => add(k, true)); }
    col.appendChild(ul);
    if (tops.length > LIMIT) {
      const more = document.createElement('button');
      more.type = 'button';
      more.className = 'more';
      more.dataset.more = key;
      more.textContent = tk.open[okey] ? 'Weniger anzeigen' : `${tops.length - LIMIT} weitere anzeigen`;
      col.appendChild(more);
    }
  }
}
function findTask(id) {
  for (const [key, list] of Object.entries(tk.tasks)) { const t = (list || []).find(x => x.id === id); if (t) return { key, t }; }
  return null;
}
async function completeTask(id) {
  if (tk.pending.has(id)) return;
  const hit = findTask(id);
  const name = hit ? plain(hit.t.content) : 'Aufgabe';
  const path = verb => `/tasks/${encodeURIComponent(id)}/${verb}`;
  tk.pending.add(id);
  renderTasksAll();
  try {
    await tdFetch(path('close'), 'POST');
    if (hit && tk.tasks[hit.key]) tk.tasks[hit.key] = tk.tasks[hit.key].filter(x => x.id !== id && x.parentId !== id);
    tk.pending.delete(id);
    renderTasksAll();
    toast(`„${name}“ erledigt`, async () => {
      try { await tdFetch(path('reopen'), 'POST'); } catch (err) { tdError(err); }
      tdLoad();
    });
  } catch (err) {
    tk.pending.delete(id);
    renderTasksAll();
    if (err && err.code === 'not_found') { tkMsg(`„${name}“ gibt es in Todoist nicht mehr.`); tdLoad(); }
    else if (err && ['bad_token', 'rate'].includes(err.code)) tdError(err);
    else tkMsg(`„${name}“ konnte nicht abgehakt werden.${err && err.code === 'network' ? ' Todoist ist gerade nicht erreichbar.' : ''}`, 'Liste neu laden', () => tdLoad());
  }
}
function initTasks() {
  setInterval(() => { if (document.visibilityState === 'visible' && tdToken() && tkKeys().length) tdLoad(); }, 120000);
  if (!tdToken()) return tkIdle();
  renderTasksAll();
  return tdLoad();
}

defineWidget('tasks', {
  mount(v) {
    const q = v.q;
    q('[data-r="action"]').addEventListener('click', e => {
      const m = tk.msg, b = e.currentTarget;
      if (!m || !m.fn) return;
      b.disabled = true;
      Promise.resolve(m.fn()).finally(() => { b.disabled = false; });
    });
    q('[data-r="conf"]').addEventListener('click', () => {
      if (!tk.ask) { tdAsk(); q('[data-r="token"]').focus(); }
      else tdAskClose();
    });
    q('[data-r="cancel"]').addEventListener('click', tdAskClose);
    q('[data-r="forget"]').addEventListener('click', () => { tdSetToken(''); tkReset(); tdAsk(); });
    q('[data-r="form"]').addEventListener('submit', e => { e.preventDefault(); tdConnect(v); });
    q('[data-r="addform"]').addEventListener('submit', e => { e.preventDefault(); tdQuickAdd(v); });
    q('[data-r="cols"]').addEventListener('click', e => {
      const more = e.target.closest('[data-more]');
      if (more) { const k = `${v.id}:${more.dataset.more}`; tk.open[k] = !tk.open[k]; renderTaskView(v); return; }
      const b = e.target.closest('[data-done]');
      if (b) completeTask(b.dataset.done);
    });
  },
  render: renderTaskView,
  settings: {
    render(box, w) {
      const all = tk.projList ? tk.projList.map(p => String(p.name || '').trim()).filter(Boolean) : null;
      if (all && all.length) {
        const low = s => s.toLowerCase(), chosen = w.cfg.projects;
        const names = [...chosen.filter(n => !all.some(a => low(a) === low(n))), ...all];
        box.innerHTML = `<p class="lbl" style="margin:0">Welche Todoist-Projekte soll dieses Widget zeigen? Höchstens 4.</p><div class="pick" role="group" aria-label="Projekte">${names.map(n => `<label class="check-row"><input type="checkbox" data-proj="${esc(n)}"${chosen.some(c => low(c) === low(n)) ? ' checked' : ''}> ${esc(n)}${all.some(a => low(a) === low(n)) ? '' : ' <small>nicht gefunden</small>'}</label>`).join('')}</div>`;
      } else {
        box.innerHTML = '<label class="field"><span class="lbl">Todoist-Projekte, mit Komma getrennt (höchstens 4)</span><input type="text" data-proj-text maxlength="160" autocomplete="off" placeholder="Arbeit, Privat"></label><p class="hint">Sobald Todoist verbunden ist, kannst du die Projekte hier einfach anhaken.</p>';
        box.querySelector('[data-proj-text]').value = w.cfg.projects.join(', ');
      }
    },
    save(box, w) {
      const low = s => s.toLowerCase();
      let list;
      const t = box.querySelector('[data-proj-text]');
      if (t) list = t.value.split(',');
      else {
        const checked = [...box.querySelectorAll('[data-proj]')].filter(c => c.checked).map(c => c.dataset.proj);
        list = [...w.cfg.projects.filter(n => checked.some(c => low(c) === low(n))), ...checked.filter(c => !w.cfg.projects.some(n => low(n) === low(c)))];
      }
      list = list.map(s => String(s).trim()).filter(Boolean);
      if (!list.length) return 'Wähl mindestens ein Projekt aus.';
      if (list.length > 4) return 'Höchstens 4 Projekte pro Widget.';
      const next = normProjects(list);
      if (next.join('|') !== w.cfg.projects.join('|')) { w.cfg.projects = next; queueMicrotask(tasksReconfigure); }
      return null;
    }
  }
});
