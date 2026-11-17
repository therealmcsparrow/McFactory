'use strict';
// The built front end: npm run build writes dist/ (pretest runs it), server.js serves only the files it finds there
// (an allowlist walked at start-up), and the desktop app bundles exactly those files.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const http = require('http');
const { spawn } = require('child_process');
const { Harness, until } = require('./harness');

const ROOT = path.join(__dirname, '..'), DIST = path.join(ROOT, 'dist');
const walk = (d, r = '') => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name), r + e.name + '/') : [r + e.name]);

test('the build writes the page, the entry module and both scenes', () => {
  for (const f of ['index.html', 'app.css', 'chat.css', 'live-data.js', 'chat.js', 'usage.js', 'settings.js', 'app/main.js', 'factory/index.js', 'office/index.js',
    'factory/vehicles/agv.js', 'factory/vehicles/tow-truck.js', 'office/vehicles/sports-car.js', 'office/vehicles/armoured-car.js', 'office/vehicles/patrol-car.js', 'office/vehicles/swat-van.js', 'office/vehicles/bandit-van.js'])
    assert.ok(fs.existsSync(path.join(DIST, f)), 'dist/' + f + ' is missing; run npm run build');
  assert.ok(!fs.existsSync(path.join(DIST, 'office.js')), 'the old single-file office.js is gone');
  const html = fs.readFileSync(path.join(DIST, 'index.html'), 'utf8');
  assert.match(html, /"three": "https:\/\/cdn\.jsdelivr\.net\/npm\/three@0\.160\.0\//, 'three stays pinned to 0.160.0 in the import map');
  assert.match(html, /<script type="module" src="app\/main\.js"><\/script>/);
});

test('settings: shops and shoppers is an office toggle, on by default', () => {
  const js = fs.readFileSync(path.join(DIST, 'settings.js'), 'utf8');
  assert.match(js, /DEF = \{[^}]*\bshops: true\b/, 'shops defaults to on');
  assert.match(js, /\['office', 'Office', \[[^\n]*\['shops', 'Shops and shoppers'\]/, 'the Office group of the dialog has the Shops and shoppers row');
  assert.ok(fs.existsSync(path.join(DIST, 'office', 'shoppers.js')), 'dist/office/shoppers.js is missing; run npm run build');
  assert.match(js, /NUM[^=]*= \{ shopWalkers: \[0, 30, 12\], shopCars: \[0, 20, 20\], officeMax: \[12, 100, 50\], patrols: \[0, 4, 2\][,}]/, 'shopWalkers 0..30 (12), shopCars 0..20 (20), officeMax 12..100 (50) and patrols 0..4 (2)');
  assert.match(js, /\['patrols', 'Patrol cars', 0, 4\]/, 'the Office group has the Patrol cars slider');
  assert.match(js, /dogWalkers: \[0, 20, 6\]/, 'dogWalkers 0..20 (6)');
  assert.match(js, /\['dogWalkers', 'Dog walkers, at most', 0, 20\]/, 'the Office group has the Dog walkers slider');
  assert.match(js, /kids: \[0, 16, 12\]/, 'kids 0..16 (12)');
  assert.match(js, /\['kids', 'Kids in the park, at most', 0, 16\]/, 'the Office group has the Kids slider');
  assert.match(js, /\['officeMax', 'Offices in town, at most', 12, 100\]/, 'the Office group has the Offices in town slider');
  assert.match(js, /\['shopWalkers', 'Shoppers on foot, at most', 0, 30\]/, 'the Office group has the Shoppers on foot slider');
  assert.match(js, /\['shopCars', 'Shop vehicles \(cars and motorcycles\), at most', 0, 20\]/, 'the Office group has the Shop vehicles slider');
  assert.match(js, /type="range"[^`]*min=/, 'numbers are range inputs');
  assert.match(js, /<label for="cf-\$\{r\[0\]\}">/, 'each slider has a visible label tied to it');
  assert.match(js, /<output id="cf-\$\{r\[0\]\}-v"/, 'each slider shows its current value');
});

test('settings: CWFun keeps numbers in range, with typed defaults, and saves them', () => {
  const js = fs.readFileSync(path.join(DIST, 'settings.js'), 'utf8');
  const store = new Map(), events = [], classes = new Set();
  const win = { addEventListener() {}, dispatchEvent(e) { events.push(e.detail); return true; } };
  const ctx = vm.createContext({
    window: win, console,
    localStorage: { getItem: k => store.has(k) ? store.get(k) : null, setItem: (k, v) => store.set(k, String(v)) },
    document: { addEventListener() {}, documentElement: { classList: { toggle: (c, on) => on ? classes.add(c) : classes.delete(c) } } },
    CustomEvent: class { constructor(type, o) { this.type = type; this.detail = o.detail; } },
  });
  store.set('cw.fun', JSON.stringify({ shopWalkers: 99, robbery: false }));
  vm.runInContext(js, ctx);
  const F = win.CWFun, seen = [];
  assert.equal(F.get('shopWalkers'), 30, 'a stored value above the range reads as the top');
  assert.equal(F.get('shopCars'), 20, 'default: the number of spots');
  assert.equal(F.get('officeMax'), 50, 'default: 50 offices');
  F.set('officeMax', 500); assert.equal(F.get('officeMax'), 100, 'at most the cells in the grid'); F.set('officeMax', 50);
  assert.equal(F.get('shops'), true); assert.equal(F.get('robbery'), false); assert.equal(F.get('nope'), true, 'unknown toggles read as true');
  F.on((k, v) => seen.push([k, v]));
  F.set('shopCars', 7.4); assert.equal(F.get('shopCars'), 7);
  F.set('shopWalkers', -3); assert.equal(F.get('shopWalkers'), 0, '0 means none');
  F.set('shopCars', 7); // no change: no event
  assert.deepEqual(seen.filter(s => s[0] !== 'officeMax'), [['shopCars', 7], ['shopWalkers', 0]]);
  assert.deepEqual(JSON.parse(JSON.stringify(events.slice(-2))), [{ key: 'shopCars', value: 7 }, { key: 'shopWalkers', value: 0 }], 'the cw-fun event carries numbers too');
  const saved = JSON.parse(store.get('cw.fun')); assert.equal(saved.patrols, 2, 'patrols saved too');
  assert.deepEqual(Object.fromEntries(Object.entries(saved).filter(([k]) => k !== 'patrols' && k !== 'dogWalkers' && k !== 'kids')), { breakdowns: true, robbery: false, shops: true, shopWalkers: 0, shopCars: 7, officeMax: 50 }, 'saved in this browser');
  assert.equal(F.get('patrols'), 2, 'default: two patrol cars'); F.set('patrols', 9); assert.equal(F.get('patrols'), 4, 'at most four');
  assert.equal(F.get('dogWalkers'), 6, 'default: six dog walkers'); F.set('dogWalkers', 50); assert.equal(F.get('dogWalkers'), 20, 'at most twenty');
  assert.equal(F.get('kids'), 12, 'default: twelve kids'); F.set('kids', 40); assert.equal(F.get('kids'), 16, 'at most sixteen'); F.set('kids', -1); assert.equal(F.get('kids'), 0, '0: an empty playground');
  assert.ok(classes.has('fun-off-robbery') && ![...classes].some(c => /shop(Walkers|Cars)/.test(c)), 'CSS hooks for toggles only');
});

test('server serves dist/ files only, by exact path', async () => {
  const h = new Harness(); await h.start();
  try {
    const page = await h.req('GET', '/');
    assert.equal(page.status, 200); assert.match(page.body, /<meta name="chat-token" content="[0-9a-f]+">/);
    for (const p of ['/app/main.js', '/office/index.js', '/factory/index.js', '/chat.css']) assert.equal((await h.req('GET', p)).status, 200, p);
    for (const p of ['/server.js', '/package.json', '/src/app/main.ts', '/office.js', '/../server.js', '/%2e%2e/server.js', '/dist/index.html', '/app/', '/app'])
      assert.equal((await h.req('GET', p)).status, 404, p);
  } finally { await h.stop(); }
});

test('without a build the page says to run npm run build', async () => {
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'cw-nobuild-')), h = new Harness();
  const port = await new Promise(r => { const s = require('net').createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });
  const proc = spawn(process.execPath, [path.join(ROOT, 'server.js'), '--port', String(port), '--root', h.projects, '--no-hook', '--static', empty], { stdio: ['ignore', 'pipe', 'pipe'] });
  let out = ''; proc.stdout.on('data', d => { out += d; }); proc.stderr.on('data', d => { out += d; });
  try {
    assert.ok(await until(() => /factory/.test(out), 8000), 'server did not start: ' + out);
    assert.match(out, /Run "npm run build"/);
    const r = await new Promise((res, rej) => http.get({ host: '127.0.0.1', port, path: '/' }, s => { let b = ''; s.on('data', d => { b += d; }); s.on('end', () => res({ status: s.statusCode, body: b })); }).on('error', rej));
    assert.equal(r.status, 503); assert.match(r.body, /npm run build/);
  } finally { proc.kill(); await new Promise(r => proc.once('exit', r)); await h.stop(); fs.rmSync(empty, { recursive: true, force: true }); }
});

test('the desktop app bundles exactly the built files', () => {
  const res = JSON.parse(fs.readFileSync(path.join(ROOT, 'desktop', 'src-tauri', 'tauri.conf.json'), 'utf8')).bundle.resources;
  const want = walk(DIST).filter(f => !f.endsWith('.map')).sort();
  assert.deepEqual(Object.keys(res).sort(), want.map(f => '../../dist/' + f), 'tauri.conf.json bundle.resources must list every file in dist/ (no .map files)');
  for (const [from, to] of Object.entries(res)) assert.equal(to, 'web/' + from.slice('../../dist/'.length));
});
