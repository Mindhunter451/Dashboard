/* Notizen: jedes Notizen-Widget hat seinen eigenen Text, gespeichert kurz nach dem Tippen.
 * Standard ist ein Markdown-Editor (CodeMirror 6, in die Datei eingebettet) mit Live-Vorschau wie in Obsidian:
 * Nur die Zeile mit dem Cursor zeigt die Zeichen, der Rest steht fertig da. Überschriften, fett, kursiv, durchgestrichen,
 * ==markiert==, Code, Links, Zitate, Listen, Trennlinien und Aufgaben, die sich per Klick abhaken lassen.
 * In den Einstellungen lässt sich auf das einfache Textfeld zurückschalten, das auch einspringt, falls CodeMirror fehlt. */
const noteMd = w => !!window.CM && !w.cfg.plain;

/* ---------- Schlichter Text aus Markdown, für Kurzzeilen, eingeklappte Karten und Anpassen ---------- */
function mdPlain(s) {
  return String(s || '')
    .replace(/^\s{0,3}(?:#{1,6}\s+|>\s?)+/, '')
    .replace(/^\s*(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s+)?/, '')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/(\*\*|__|~~|==|`)(.+?)\1/g, '$2')
    .replace(/(^|[^*\w])[*_](\S(?:.*?\S)?)[*_](?=[^*\w]|$)/g, '$1$2')
    .replace(/\\([\\`*_{}[\]()#+\-.!~=>])/g, '$1')
    .trim();
}
/* Zeilen mit Inhalt: ohne Code-Zäune, Trennlinien, Tabellenstriche und erledigte Aufgaben */
function noteLines(text) {
  return String(text || '').split('\n')
    .filter(l => !/^\s*(?:```|~~~)/.test(l) && !/^\s{0,3}([-*_])(?:\s*\1){2,}\s*$/.test(l) && !/^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(l) && !/^\s*(?:[-*+]|\d+[.)])\s+\[[xX]\]/.test(l))
    .map(mdPlain).filter(Boolean);
}

/* ---------- Markdown-Sprache: GFM (Tabellen, Aufgaben, Durchstreichen, nackte Links) plus ==Markieren== wie in Obsidian ---------- */
let mdKitCache = null;
function mdKit() {
  if (mdKitCache) return mdKitCache;
  const C = window.CM;
  const HL = { resolve: 'Highlight', mark: 'HighlightMark' };
  const punct = /[!-/:-@[-`{-~¡-¿‐-‧‰-⁞]/;
  const Highlight = {
    defineNodes: ['Highlight', 'HighlightMark'],
    parseInline: [{
      name: 'Highlight',
      parse(cx, next, pos) {
        if (next !== 61 || cx.char(pos + 1) !== 61 || cx.char(pos + 2) === 61) return -1;
        const before = cx.slice(pos - 1, pos), after = cx.slice(pos + 2, pos + 3);
        const sB = /\s|^$/.test(before), sA = /\s|^$/.test(after), pB = punct.test(before), pA = punct.test(after);
        return cx.addDelimiter(HL, pos, pos + 2, !sA && (!pA || sB || pB), !sB && (!pB || sA || pA));
      },
      after: 'Emphasis'
    }]
  };
  const lang = new C.LanguageSupport(new C.Language(C.defineLanguageFacet(), C.mdParser.configure([C.GFM, Highlight]), [], 'markdown'));
  class Bullet extends C.WidgetType {
    eq() { return true; }
    toDOM() { const s = document.createElement('span'); s.className = 'md-bullet'; s.setAttribute('aria-hidden', 'true'); return s; }
  }
  class Task extends C.WidgetType {
    constructor(on) { super(); this.on = on; }
    eq(o) { return o.on === this.on; }
    toDOM() {
      const s = document.createElement('span');
      s.className = 'md-task' + (this.on ? ' on' : '');
      s.setAttribute('role', 'checkbox');
      s.setAttribute('aria-checked', String(this.on));
      s.title = this.on ? 'Erledigt, Klick macht sie wieder offen' : 'Klick hakt ab';
      s.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
      return s;
    }
    ignoreEvent() { return false; }
  }
  const remote = C.Annotation.define();
  mdKitCache = { C, lang, Bullet, Task, remote, hide: C.Decoration.replace({}), bullet: C.Decoration.replace({ widget: new Bullet() }), taskOn: C.Decoration.replace({ widget: new Task(true) }), taskOff: C.Decoration.replace({ widget: new Task(false) }) };
  return mdKitCache;
}

/* ---------- Live-Vorschau: Dekorationen aus dem Syntaxbaum ---------- */
const mdHref = u => {
  const t = String(u || '').trim();
  if (/^(https?|mailto|tel|obsidian):/i.test(t)) return t;
  if (/^www\./i.test(t)) return 'https://' + t;
  if (/^[^\s@/]+@[^\s@]+\.[a-z]{2,}$/i.test(t)) return 'mailto:' + t;
  return /^[a-z][\w+.-]*:/i.test(t) ? '' : 'https://' + t; // javascript: und Co. fliegen raus
};
function mdDecos(view) {
  const K = mdKit(), C = K.C, st = view.state, doc = st.doc, out = [];
  // Aktive Zeilen zeigen die Zeichen. Ohne Fokus steht alles fertig da.
  const active = new Set();
  if (view.hasFocus) for (const r of st.selection.ranges) for (let n = doc.lineAt(r.from).number, e = doc.lineAt(r.to).number; n <= e; n++) active.add(n);
  const act = pos => active.has(doc.lineAt(pos).number);
  const cursorIn = (from, to) => view.hasFocus && st.selection.ranges.some(r => r.to >= from && r.from <= to);
  // Verstecken nie über ein Zeilenende hinweg (zum Beispiel ein Link, dessen Klammer erst in der nächsten Zeile zugeht)
  const hide = (from, to) => {
    while (from < to) {
      const l = doc.lineAt(from), e = Math.min(to, l.to);
      if (e > from) out.push(K.hide.range(from, e));
      from = l.to + 1;
    }
  };
  const mark = (cls, from, to, attrs) => { if (to > from) out.push(C.Decoration.mark(attrs ? { class: cls, attributes: attrs } : { class: cls }).range(from, to)); };
  const vr = view.visibleRanges, vFrom = vr.length ? vr[0].from : 0, vTo = vr.length ? vr[vr.length - 1].to : doc.length;
  const lines = (cls, from, to) => {
    for (let p = Math.max(from, vFrom); p <= Math.min(to, vTo);) {
      const l = doc.lineAt(p);
      out.push(C.Decoration.line({ class: cls }).range(l.from));
      p = l.to + 1;
    }
  };
  const sp = pos => (doc.sliceString(pos, pos + 1) === ' ' ? 1 : 0);
  const link = (n, first) => {
    const marks = [];
    let url = '';
    for (let c = n.node.firstChild; c; c = c.nextSibling) {
      if (c.name === 'LinkMark') marks.push(c);
      else if (c.name === 'URL') url = doc.sliceString(c.from, c.to);
    }
    if (marks.length < 2 || !url) return;
    const tf = marks[0].to, tt = marks[1].from, href = mdHref(url);
    if (act(n.from)) { mark('md-mk', n.from, tf); mark('md-mk', tt, n.to); mark('md-link', tf, tt); return; }
    hide(n.from, tf);
    hide(tt, n.to);
    mark(first === '!' ? 'md-link md-img' : 'md-link', tf, tt, href ? { 'data-href': href, title: href } : null);
  };
  C.syntaxTree(st).iterate({
    from: vFrom, to: vTo,
    enter(n) {
      const name = n.name;
      let m = /^ATXHeading(\d)$/.exec(name);
      if (m) { lines(`md-h md-h${m[1]}`, n.from, n.from); return; }
      if ((m = /^SetextHeading(\d)$/.exec(name))) { lines(`md-h md-h${m[1]}`, n.from, n.from); return; }
      switch (name) {
        case 'HeaderMark': {
          const p = n.node.parent && n.node.parent.name;
          if (act(n.from)) { mark('md-mk', n.from, n.to); return; }
          if (p && p.startsWith('Setext')) { hide(n.from, n.to); lines('md-setext', n.from, n.from); return; }
          // Öffnende Rauten samt Leerzeichen weg, schließende samt Leerzeichen davor
          if (n.from === doc.lineAt(n.from).from || /^\s*$/.test(doc.sliceString(doc.lineAt(n.from).from, n.from))) hide(n.from, n.to + sp(n.to));
          else hide(n.from - (doc.sliceString(n.from - 1, n.from) === ' ' ? 1 : 0), n.to);
          return;
        }
        case 'Emphasis': mark('md-em', n.from, n.to); return;
        case 'StrongEmphasis': mark('md-strong', n.from, n.to); return;
        case 'Strikethrough': mark('md-strike', n.from, n.to); return;
        case 'Highlight': mark('md-mark', n.from, n.to); return;
        case 'InlineCode': mark('md-code', n.from, n.to); return;
        case 'EmphasisMark': case 'StrikethroughMark': case 'HighlightMark':
          if (act(n.from)) mark('md-mk', n.from, n.to); else hide(n.from, n.to);
          return;
        case 'CodeMark':
          if (n.node.parent && n.node.parent.name === 'InlineCode') { if (act(n.from)) mark('md-mk', n.from, n.to); else hide(n.from, n.to); }
          return;
        case 'Escape':
          if (!act(n.from)) hide(n.from, n.from + 1);
          return;
        case 'Link': link(n, ''); return false;
        case 'Image': link(n, '!'); return false;
        case 'Autolink': {
          const u = n.node.getChild('URL');
          if (!u) return false;
          const href = mdHref(doc.sliceString(u.from, u.to));
          if (act(n.from)) { mark('md-mk', n.from, u.from); mark('md-mk', u.to, n.to); mark('md-link', u.from, u.to); return false; }
          hide(n.from, u.from);
          hide(u.to, n.to);
          mark('md-link', u.from, u.to, href ? { 'data-href': href, title: href } : null);
          return false;
        }
        case 'URL': {
          // Nackter Link mitten im Text (GFM)
          const href = mdHref(doc.sliceString(n.from, n.to));
          mark('md-link', n.from, n.to, !act(n.from) && href ? { 'data-href': href, title: href } : null);
          return;
        }
        case 'ListMark': {
          const item = n.node.parent, list = item && item.parent;
          const task = item && item.getChild('Task');
          if (act(n.from) && !task) { mark('md-mk', n.from, n.to); return; }
          if (task) { if (!act(n.from)) hide(n.from, n.to + sp(n.to)); else mark('md-mk', n.from, n.to); return; }
          if (list && list.name === 'BulletList') out.push(K.bullet.range(n.from, n.to));
          else mark('md-num', n.from, n.to);
          return;
        }
        case 'TaskMarker': {
          const on = /x/i.test(doc.sliceString(n.from, n.to));
          // Das Kästchen bleibt auch in der aktiven Zeile, nur mit dem Cursor direkt dran kommt „[ ]“ zum Vorschein
          if (!cursorIn(n.from, n.to)) out.push((on ? K.taskOn : K.taskOff).range(n.from, n.to));
          else mark('md-mk', n.from, n.to);
          const task = n.node.parent;
          if (on && task && task.to > n.to + 1) mark('md-done', n.to + 1, task.to);
          return;
        }
        case 'Blockquote': lines('md-quote', n.from, n.to); return;
        case 'QuoteMark':
          if (act(n.from)) mark('md-mk', n.from, n.to); else hide(n.from, n.to + sp(n.to));
          return;
        case 'FencedCode': {
          lines('md-pre', n.from, n.to);
          const first = doc.lineAt(n.from), last = doc.lineAt(n.to), closed = n.node.lastChild && n.node.lastChild.name === 'CodeMark' && n.node.lastChild.from > first.to;
          const fence = l => { lines('md-pre-fence', l.from, l.from); if (!active.has(l.number)) hide(l.from, l.to); else mark('md-mk', l.from, l.to); };
          if (first.from >= vFrom) fence(first);
          if (closed && last.number !== first.number && last.from <= vTo) fence(last);
          return false;
        }
        case 'CodeBlock': lines('md-pre', n.from, n.to); return false;
        case 'HorizontalRule':
          if (act(n.from)) mark('md-mk', n.from, n.to);
          else { hide(n.from, n.to); lines('md-hr', n.from, n.from); }
          return;
        case 'Table': lines('md-table', n.from, n.to); return false;
        case 'HTMLBlock': case 'CommentBlock': return false;
      }
    }
  });
  return C.Decoration.set(out, true);
}

/* ---------- Tasten und Befehle ---------- */
function mdInCode(st, pos) {
  for (let n = mdKit().C.syntaxTree(st).resolveInner(pos, -1); n; n = n.parent) if (n.name === 'FencedCode' || n.name === 'CodeBlock') return true;
  return false;
}
const MD_ITEM = /^(\s*)(?:([-*+])|(\d+)([.)]))(\s+)(\[[ xX]\]\s+)?/;
/* Enter setzt Listen, Aufgaben und Zitate fort. Auf einem leeren Punkt endet die Liste (eingerückt: eine Ebene raus). */
function mdEnter(view) {
  const st = view.state, r = st.selection.main;
  if (st.selection.ranges.length !== 1 || !r.empty || mdInCode(st, r.from)) return false;
  const line = st.doc.lineAt(r.from), text = line.text, before = r.from - line.from;
  const m = MD_ITEM.exec(text), q = /^(\s*>\s?)+/.exec(text);
  if (m && before >= m[0].length) {
    if (!text.slice(m[0].length).trim()) {
      const ind = m[1], out = ind.endsWith('\t') ? ind.slice(0, -1) : ind.replace(/ {1,4}$/, '');
      view.dispatch({ changes: { from: line.from, to: line.to, insert: ind ? out + text.slice(ind.length) : '' }, userEvent: 'delete' });
      return true;
    }
    const insert = `\n${m[1]}${m[2] || `${+m[3] + 1}${m[4]}`} ${m[6] ? '[ ] ' : ''}`;
    view.dispatch({ changes: { from: r.from, insert }, selection: { anchor: r.from + insert.length }, scrollIntoView: true, userEvent: 'input' });
    return true;
  }
  if (q && before >= q[0].length) {
    if (!text.slice(q[0].length).trim()) { view.dispatch({ changes: { from: line.from, to: line.to, insert: '' }, userEvent: 'delete' }); return true; }
    const insert = '\n' + q[0];
    view.dispatch({ changes: { from: r.from, insert }, selection: { anchor: r.from + insert.length }, scrollIntoView: true, userEvent: 'input' });
    return true;
  }
  return false;
}
/* Rücktaste direkt hinter einem Listenzeichen nimmt erst das Kästchen, dann das Zeichen weg */
function mdBack(view) {
  const st = view.state, r = st.selection.main;
  if (st.selection.ranges.length !== 1 || !r.empty) return false;
  const line = st.doc.lineAt(r.from), before = st.sliceDoc(line.from, r.from);
  const m = /^(\s*)(?:[-*+]|\d+[.)])\s(\[[ xX]\]\s)?$/.exec(before) || /^(\s*)>\s?()$/.exec(before);
  if (!m || mdInCode(st, r.from)) return false;
  const from = line.from + (m[2] ? before.length - m[2].length : m[1].length);
  view.dispatch({ changes: { from, to: r.from }, userEvent: 'delete.backward' });
  return true;
}
/* Strg+Enter: Zeile wird zur Aufgabe, eine Aufgabe wird abgehakt oder wieder geöffnet */
function mdToggleTask(view) {
  const st = view.state, changes = [], seen = new Set();
  for (const r of st.selection.ranges) {
    for (let n = st.doc.lineAt(r.from).number, e = st.doc.lineAt(r.to).number; n <= e; n++) {
      if (seen.has(n)) continue;
      seen.add(n);
      const l = st.doc.line(n), m = MD_ITEM.exec(l.text);
      if (m && m[6]) { const p = l.from + m[0].indexOf('[') + 1; changes.push({ from: p, to: p + 1, insert: /x/i.test(m[6]) ? ' ' : 'x' }); }
      else if (m) changes.push({ from: l.from + m[0].length, insert: '[ ] ' });
      else { const ind = /^\s*/.exec(l.text)[0].length; changes.push({ from: l.from + ind, insert: '- [ ] ' }); }
    }
  }
  view.dispatch({ changes, userEvent: 'input' });
  return true;
}
function mdToggleTaskAt(view, pos) {
  const s = view.state.sliceDoc(pos, pos + 3);
  if (!/^\[[ xX]\]$/.test(s)) return false;
  view.dispatch({ changes: { from: pos + 1, to: pos + 2, insert: /x/i.test(s) ? ' ' : 'x' }, userEvent: 'input' });
  return true;
}
/* Strg+B, Strg+I und Co.: Auswahl einpacken oder wieder auspacken */
function mdWrap(mk) {
  return view => {
    const K = mdKit(), st = view.state, n = mk.length;
    view.dispatch(st.changeByRange(r => {
      if (st.sliceDoc(r.from - n, r.from) === mk && st.sliceDoc(r.to, r.to + n) === mk) {
        return { changes: [{ from: r.from - n, to: r.from }, { from: r.to, to: r.to + n }], range: K.C.EditorSelection.range(r.from - n, r.to - n) };
      }
      return { changes: [{ from: r.from, insert: mk }, { from: r.to, insert: mk }], range: K.C.EditorSelection.range(r.from + n, r.to + n) };
    }), { userEvent: 'input' });
    return true;
  };
}
/* Strg+K: Link aus der Auswahl. Ist die Auswahl selbst ein Link, landet der Cursor im Text. */
function mdLinkCmd(view) {
  const K = mdKit(), st = view.state;
  view.dispatch(st.changeByRange(r => {
    const t = st.sliceDoc(r.from, r.to);
    if (/^(https?:\/\/|www\.)\S+$/i.test(t)) return { changes: { from: r.from, to: r.to, insert: `[](${t})` }, range: K.C.EditorSelection.cursor(r.from + 1) };
    return { changes: { from: r.from, to: r.to, insert: `[${t}]()` }, range: K.C.EditorSelection.cursor(r.from + t.length + 3) };
  }), { userEvent: 'input' });
  return true;
}

/* ---------- Editor anlegen ---------- */
let mdPluginCache = null;
function mdPlugin() {
  if (mdPluginCache) return mdPluginCache;
  const C = mdKit().C;
  mdPluginCache = C.ViewPlugin.fromClass(class {
    constructor(view) { this.decorations = mdDecos(view); }
    update(u) {
      if (u.docChanged || u.viewportChanged || u.selectionSet || u.focusChanged || C.syntaxTree(u.startState) !== C.syntaxTree(u.state)) this.decorations = mdDecos(u.view);
    }
  }, {
    decorations: p => p.decorations,
    eventHandlers: {
      mousedown(e, view) {
        if (e.button !== 0) return false;
        const box = e.target.closest && e.target.closest('.md-task');
        if (box) { e.preventDefault(); return mdToggleTaskAt(view, view.posAtDOM(box)); }
        const a = e.target.closest && e.target.closest('.md-link[data-href]');
        if (a) { e.preventDefault(); window.open(a.dataset.href, '_blank', 'noopener'); return true; }
        return false;
      },
      paste(e, view) {
        // URL auf markierten Text einfügen macht einen Link daraus
        const t = ((e.clipboardData && e.clipboardData.getData('text/plain')) || '').trim(), r = view.state.selection.main;
        if (r.empty || view.state.selection.ranges.length !== 1 || !/^https?:\/\/\S+$/i.test(t)) return false;
        e.preventDefault();
        view.dispatch({ changes: { from: r.from, to: r.to, insert: `[${view.state.sliceDoc(r.from, r.to)}](${t})` }, userEvent: 'input.paste' });
        return true;
      }
    }
  });
  return mdPluginCache;
}
function mdCreate(v) {
  const K = mdKit(), C = K.C, w = state.widgets[v.id], host = v.q('[data-r="md"]');
  host.hidden = false;
  v.q('[data-r="text"]').hidden = true;
  v.cm = new C.EditorView({
    parent: host,
    state: C.EditorState.create({
      doc: w.cfg.text,
      extensions: [
        C.history(),
        C.drawSelection(),
        C.EditorView.lineWrapping,
        K.lang,
        C.indentUnit.of('\t'),
        C.EditorState.tabSize.of(4),
        C.placeholder('Schreib los … # Überschrift, - Liste, - [ ] Aufgabe, **fett**'),
        C.keymap.of([
          { key: 'Enter', run: mdEnter },
          { key: 'Backspace', run: mdBack },
          { key: 'Mod-Enter', run: mdToggleTask },
          { key: 'Mod-b', run: mdWrap('**') },
          { key: 'Mod-i', run: mdWrap('*') },
          { key: 'Mod-Shift-x', run: mdWrap('~~') },
          { key: 'Mod-Shift-h', run: mdWrap('==') },
          { key: 'Mod-e', run: mdWrap('`') },
          { key: 'Mod-k', run: mdLinkCmd },
          { key: 'Tab', run: C.indentMore, shift: C.indentLess },
          ...C.historyKeymap,
          ...C.defaultKeymap
        ]),
        mdPlugin(),
        C.EditorState.transactionFilter.of(tr => {
          if (!tr.docChanged || tr.newDoc.length <= NOTE_MAX || tr.annotation(K.remote)) return tr;
          v.q('[data-r="state"]').textContent = 'Notiz ist voll';
          return [];
        }),
        C.EditorView.updateListener.of(u => { if (u.docChanged && !u.transactions.some(t => t.annotation(K.remote))) noteChanged(v); }),
        C.EditorView.contentAttributes.of({ spellcheck: 'true', autocorrect: 'on', autocapitalize: 'sentences', lang: 'de', 'aria-label': widgetTitle(v.id) || 'Notizen' })
      ]
    })
  });
}
function mdDrop(v) {
  if (!v.cm) return;
  v.cm.destroy();
  v.cm = null;
  v.q('[data-r="md"]').hidden = true;
  v.q('[data-r="text"]').hidden = false;
}

/* ---------- Widget ---------- */
function sizeNotes(t) { t.style.height = 'auto'; t.style.height = Math.min(560, Math.max(150, t.scrollHeight + 2)) + 'px'; }
const noteText = v => (v.cm ? v.cm.state.doc.toString() : v.q('[data-r="text"]').value);
function noteChanged(v) {
  v.q('[data-r="state"]').textContent = 'Wird gespeichert …';
  clearTimeout(v.timer);
  v.timer = setTimeout(() => saveNote(v), 700);
}
function saveNote(v) {
  clearTimeout(v.timer);
  v.timer = null;
  const w = state.widgets[v.id];
  if (!w) return;
  w.cfg.text = noteText(v);
  commit();
  v.q('[data-r="state"]').textContent = `Gespeichert ${hm(new Date())} Uhr`;
}
defineWidget('notes', {
  mount(v) {
    const t = v.q('[data-r="text"]');
    t.maxLength = NOTE_MAX;
    t.addEventListener('input', () => { sizeNotes(t); noteChanged(v); });
  },
  unmount(v) { clearTimeout(v.timer); if (v.cm) v.cm.destroy(); },
  render(v) {
    const w = state.widgets[v.id], t = v.q('[data-r="text"]');
    // Umschalten zwischen Editor und Textfeld, ohne Getipptes zu verlieren
    if (noteMd(w) !== !!v.cm) {
      if (v.timer) saveNote(v);
      if (v.cm) { mdDrop(v); t.value = w.cfg.text; sizeNotes(t); } else mdCreate(v);
    }
    t.setAttribute('aria-label', widgetTitle(v.id));
    if (v.cm) {
      // Text von außen (Sync, anderer Tab, Notieren) nur übernehmen, wenn hier gerade nicht getippt wird
      const C = mdKit().C, doc = v.cm.state.doc.toString();
      if (!v.cm.hasFocus && !v.timer && doc !== w.cfg.text) v.cm.dispatch({ changes: { from: 0, to: doc.length, insert: w.cfg.text }, annotations: [mdKit().remote.of(true), C.Transaction.addToHistory.of(false)] });
    } else if (document.activeElement !== t && !v.timer && t.value !== w.cfg.text) t.value = w.cfg.text;
  },
  settings: {
    render(box, w) {
      box.innerHTML = `<label class="check-row"><input type="checkbox" class="switch" data-s="md"${w.cfg.plain ? '' : ' checked'}${window.CM ? '' : ' disabled'}> Markdown mit Live-Vorschau</label><p class="hint">Wie in Obsidian: Nur die Zeile mit dem Cursor zeigt die Zeichen. Strg+B fett, Strg+I kursiv, Strg+K Link, Strg+Enter macht eine Aufgabe oder hakt sie ab, Tab rückt Listen ein, am Mac Cmd statt Strg. Aus heißt einfaches Textfeld.</p>`;
    },
    save(box, w) { w.cfg.plain = !box.querySelector('[data-s="md"]').checked; return null; }
  }
});
function fitNotes() {
  for (const v of viewsOf('notes')) {
    if (v.el.hidden) continue;
    if (v.cm) v.cm.requestMeasure();
    else sizeNotes(v.q('[data-r="text"]'));
  }
}
/* Beim Schließen des Tabs nichts verlieren, was noch auf das Speichern wartet */
addEventListener('pagehide', () => { for (const v of viewsOf('notes')) if (v.timer) saveNote(v); });
