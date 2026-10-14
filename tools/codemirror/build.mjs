// Baut CodeMirror 6 für die Notizen in eine Datei: src/vendor/codemirror.js (global CM).
// Nur nötig, wenn die Versionen in package.json geändert werden. Aufruf in diesem Ordner:
//   npm ci && node build.mjs
// Danach im Hauptordner wie immer node build.mjs, das die Datei in index.html einbettet.
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, '..', '..', 'src', 'vendor', 'codemirror.js');
const pkg = JSON.parse(readFileSync(join(here, 'package.json'), 'utf8'));
const versions = Object.entries(pkg.devDependencies).filter(([n]) => n !== 'esbuild').map(([n, v]) => `${n} ${v}`).join(', ');

const r = await build({
  entryPoints: [join(here, 'entry.js')],
  bundle: true,
  minify: true,
  format: 'iife',
  globalName: 'CM',
  target: 'es2020',
  legalComments: 'none',
  write: false
});
const banner = `/*! CodeMirror 6 für die Notizen, gebaut mit tools/codemirror/build.mjs aus: ${versions}.
 * CodeMirror und Lezer: MIT-Lizenz, Copyright (C) 2018-2021 Marijn Haverbeke <marijn@haverbeke.berlin> und andere,
 * https://github.com/codemirror/dev/blob/main/LICENSE */\n`;
mkdirSync(dirname(out), { recursive: true });
const code = banner + r.outputFiles[0].text;
writeFileSync(out, code);
console.log(`src/vendor/codemirror.js geschrieben, ${(Buffer.byteLength(code) / 1024).toFixed(0)} KB`);
