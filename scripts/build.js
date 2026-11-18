'use strict';
// Build the front end into dist/: tsc compiles src/**/*.ts (no bundler), then the static files are copied next to it.
// Node built-ins only. Usage: npm run build   (or: node scripts/build.js)
const fs = require('fs'), path = require('path'), { spawnSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..'), SRC = path.join(ROOT, 'src'), DIST = path.join(ROOT, 'dist');
const STATIC = ['index.html', 'app.css', 'chat.css']; // from src/, same path in dist/

fs.rmSync(DIST, { recursive: true, force: true }); // no stale files: the server serves whatever is in dist/
let tsc;
try { tsc = require.resolve('typescript/bin/tsc', { paths: [ROOT] }); }
catch { console.error('TypeScript is not installed. Run "npm install" once, then "npm run build".'); process.exit(1); }
const r = spawnSync(process.execPath, [tsc, '-p', path.join(ROOT, 'tsconfig.json'), '--pretty', 'false'], { stdio: ['ignore', 'pipe', 'inherit'], encoding: 'utf8' });
const errs = (r.stdout || '').split('\n').filter(l => l.includes('error TS'));
if (errs.length) console.error(errs.slice(0, 20).join('\n') + (errs.length > 20 ? `\n... ${errs.length - 20} more` : ''));
for (const f of STATIC) fs.copyFileSync(path.join(SRC, f), path.join(DIST, f));
// the version next to the title: the desktop app's version, bumped for every release
let version = '';
try { version = JSON.parse(fs.readFileSync(path.join(ROOT, 'desktop', 'src-tauri', 'tauri.conf.json'), 'utf8')).version || ''; } catch { }
const html = path.join(DIST, 'index.html');
fs.writeFileSync(html, fs.readFileSync(html, 'utf8').replace(/ <small class="ver">v__VERSION__<\/small>/, version ? ` <small class="ver">v${version}</small>` : ''));
if (r.status !== 0) { console.error('build: tsc failed' + (errs.length ? ` with ${errs.length} type error(s) (see above)` : '')); process.exit(r.status || 1); }
console.log('build: dist/ is ready');
