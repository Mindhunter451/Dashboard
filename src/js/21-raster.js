/* Raster: Spaltenzahl aus der Fensterbreite, Karten wandern in die jeweils kürzeste Spalte */
const lay = { raf: 0, cols: 0, first: true, still: false };
function schedLayout() { if (!lay.raf) lay.raf = requestAnimationFrame(layout); }
/* Nach einem Seitenwechsel ohne Gleit-Animation neu anordnen */
function layoutNow() {
  const board = $('#board');
  board.classList.remove('anim');
  cancelAnimationFrame(lay.raf);
  layout();
  if (!lay.first) setTimeout(() => board.classList.add('anim'), 60);
}
function layout() {
  lay.raf = 0;
  const board = $('#board');
  const cards = [...board.children].filter(el => el.classList.contains('card') && !el.hidden);
  const W = board.clientWidth;
  if (!W) return;
  const gap = parseFloat(getComputedStyle(board).rowGap) || 20;
  const minW = SIZES[state.ui.size] || 380;
  const spanOf = el => Math.max(1, +el.dataset.span || 1);
  const units = cards.reduce((s, el) => s + spanOf(el), 0) || 1;
  const cols = Math.max(1, Math.min(Math.floor((W + gap) / (minW + gap)), units, 8));
  lay.cols = cols;
  if (cols === 1) {
    board.classList.add('flow');
    board.style.height = '';
    cards.forEach(el => { el.style.width = ''; el.style.transform = ''; });
    fitNotes();
    return;
  }
  board.classList.remove('flow');
  const colW = (W - gap * (cols - 1)) / cols;
  for (const el of cards) { const s = Math.min(spanOf(el), cols); el.style.width = (colW * s + gap * (s - 1)).toFixed(2) + 'px'; }
  fitNotes(); // Notizfelder erst messen, wenn die Kartenbreite feststeht
  const heights = new Array(cols).fill(0);
  const holes = []; // Lücken unter breiten Karten, die schmale Karten später füllen dürfen
  // Ganze Pixel, sonst zeigen Karten (Leaflet) feine Linien zwischen den Kacheln
  const place = (el, c, top) => { el.style.transform = `translate(${Math.round(c * (colW + gap))}px,${Math.round(top)}px)`; };
  for (const el of cards) {
    const s = Math.min(spanOf(el), cols);
    const h = el.offsetHeight;
    let best = 0, bestTop = Infinity, bestWaste = Infinity;
    for (let i = 0; i + s <= cols; i++) {
      const seg = heights.slice(i, i + s), top = Math.max(...seg);
      const waste = seg.reduce((w, x) => w + top - x, 0);
      if (top < bestTop - 1 || (Math.abs(top - bestTop) <= 1 && waste < bestWaste)) { bestTop = top; best = i; bestWaste = waste; }
    }
    if (s === 1) {
      let hi = -1;
      holes.forEach((ho, k) => { if (ho.bottom - ho.top >= h + gap - 0.5 && ho.top < bestTop - 1 && (hi < 0 || ho.top < holes[hi].top)) hi = k; });
      if (hi >= 0) { const ho = holes[hi]; place(el, ho.c, ho.top); ho.top += h + gap; continue; }
    }
    for (let i = best; i < best + s; i++) if (bestTop - heights[i] > 80) holes.push({ c: i, top: heights[i], bottom: bestTop });
    place(el, best, bestTop);
    for (let i = best; i < best + s; i++) heights[i] = bestTop + h + gap;
  }
  board.style.height = Math.max(0, Math.max(...heights) - gap) + 'px';
  if (lay.first) { lay.first = false; setTimeout(() => board.classList.add('anim'), 450); }
}
if (typeof ResizeObserver === 'function') {
  cardRO = new ResizeObserver(schedLayout);
  cardRO.observe($('#board'));
  cardRO.observe($('#add-tile'));
} else addEventListener('resize', schedLayout);
