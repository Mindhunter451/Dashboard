// Baut aus den Dateien in src/ die eine index.html, die GitHub Pages ausliefert.
// Aufruf: node build.mjs   (Node 18 oder neuer, keine weiteren Pakete nötig)
//
// src/index.html  Grundgerüst mit Platzhaltern
//   <!--@include pfad-->  fügt eine Datei aus src/ ein (z. B. html/drawer.html)
//   <!--@css-->           alle Dateien aus src/css/ in Namensreihenfolge
//   <!--@js-->            alle Dateien aus src/js/ in Namensreihenfolge, in einem gemeinsamen Block
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const src = join(root, 'src');
const read = p => readFileSync(join(src, p), 'utf8');
const list = (dir, ext) => readdirSync(join(src, dir)).filter(f => f.endsWith(ext)).sort();

function include(html, depth = 0) {
  if (depth > 5) throw new Error('Includes sind zu tief verschachtelt');
  return html.replace(/<!--@include ([\w./-]+)-->/g, (_, p) => include(read(p).replace(/\s+$/, ''), depth + 1));
}

const css = list('css', '.css').map(f => `/* ${f} */\n${read('css/' + f).trim()}`).join('\n\n');
const js = list('js', '.js').map(f => `/* ${f} */\n${read('js/' + f).trim()}`).join('\n\n');

let out = include(read('index.html'));
out = out.replace('<!--@css-->', () => `<style>\n${css}\n</style>`);
out = out.replace('<!--@js-->', () => `<script>\n(() => {\n'use strict';\n${js}\n})();\n</script>`);
if (/<!--@/.test(out)) throw new Error('Unbekannter Platzhalter in src/index.html');

writeFileSync(join(root, 'index.html'), out);
console.log(`index.html gebaut, ${(Buffer.byteLength(out) / 1024).toFixed(0)} KB`);
