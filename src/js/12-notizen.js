/* Notizen: jedes Notizen-Widget hat seinen eigenen Text, gespeichert kurz nach dem Tippen */
function sizeNotes(t) { t.style.height = 'auto'; t.style.height = Math.min(560, Math.max(150, t.scrollHeight + 2)) + 'px'; }
function saveNote(v) {
  clearTimeout(v.timer);
  v.timer = null;
  const w = state.widgets[v.id];
  if (!w) return;
  w.cfg.text = v.q('[data-r="text"]').value;
  commit();
  v.q('[data-r="state"]').textContent = `Gespeichert ${hm(new Date())} Uhr`;
}
defineWidget('notes', {
  mount(v) {
    const t = v.q('[data-r="text"]');
    t.addEventListener('input', () => {
      sizeNotes(t);
      v.q('[data-r="state"]').textContent = 'Wird gespeichert …';
      clearTimeout(v.timer);
      v.timer = setTimeout(() => saveNote(v), 700);
    });
  },
  unmount(v) { clearTimeout(v.timer); },
  render(v) {
    const t = v.q('[data-r="text"]'), w = state.widgets[v.id];
    t.setAttribute('aria-label', widgetTitle(v.id));
    if (document.activeElement !== t && !v.timer && t.value !== w.cfg.text) t.value = w.cfg.text;
  }
});
function fitNotes() { for (const v of viewsOf('notes')) if (!v.el.hidden) sizeNotes(v.q('[data-r="text"]')); }
/* Beim Schließen des Tabs nichts verlieren, was noch auf das Speichern wartet */
addEventListener('pagehide', () => { for (const v of viewsOf('notes')) if (v.timer) saveNote(v); });
