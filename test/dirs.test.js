'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { Harness } = require('./harness');

const h = new Harness();
before(() => h.start());
after(() => h.stop());

const dirs = (p, headers) => h.req('GET', '/api/fs/dirs' + (p === undefined ? '' : '?path=' + encodeURIComponent(p)),
  { headers: Object.assign({ 'x-chat-token': h.token }, headers || {}) });

test('folder list needs the chat token', async () => {
  assert.equal((await h.req('GET', '/api/fs/dirs?path=' + encodeURIComponent(h.dir))).status, 403);
  assert.equal((await dirs(h.dir, { 'x-chat-token': 'nope' })).status, 403);
  assert.equal((await dirs(h.dir, { origin: 'http://evil' })).status, 403);
});

test('lists subfolders only, sorted, with the parent', async () => {
  const base = fs.mkdtempSync(path.join(h.dir, 'browse-'));
  for (const d of ['beta', 'Alpha', 'gamma']) fs.mkdirSync(path.join(base, d));
  fs.writeFileSync(path.join(base, 'file.txt'), 'x');
  const r = await dirs(base);
  assert.equal(r.status, 200, r.body);
  assert.equal(r.json.path, path.resolve(base));
  assert.equal(r.json.parent, path.dirname(path.resolve(base)));
  assert.deepEqual(r.json.dirs, ['Alpha', 'beta', 'gamma']);
});

test('no path lists the starting points', async () => {
  const r = await dirs();
  assert.equal(r.status, 200, r.body);
  assert.equal(r.json.path, '');
  assert.ok(Array.isArray(r.json.roots) && r.json.roots.length > 0);
  for (const x of r.json.roots) assert.ok(path.isAbsolute(x), x);
});

test('relative or missing paths are refused', async () => {
  assert.equal((await dirs('relative/dir')).status, 400);
  assert.equal((await dirs(path.join(h.dir, 'does-not-exist'))).status, 404);
  const f = path.join(h.dir, 'plain-file.txt'); fs.writeFileSync(f, 'x');
  assert.equal((await dirs(f)).status, 404);
});

test('folder list is GET only', async () => {
  assert.equal((await h.req('POST', '/api/fs/dirs', { headers: { 'x-chat-token': h.token } })).status, 405);
});
