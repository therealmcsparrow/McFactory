'use strict';
// carry.ts: the loads in transit (crates, drives) handed from one view to the next across the view-switch reload.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const load = () => import('data:text/javascript,' + encodeURIComponent(fs.readFileSync(path.join(__dirname, '..', 'dist', 'app', 'carry.js'), 'utf8')));

test('loads survive the round trip per project, in order', async () => {
  const { encodeCarry, decodeCarry } = await load();
  const m = new Map([['proj-a', ['#ff0000', '#00ff00']], ['proj-b', ['#0000ff']]]);
  const back = decodeCarry(encodeCarry(m, 1000), 2000);
  assert.deepEqual([...back], [...m]);
});

test('stale, future, other-version and broken texts give no loads', async () => {
  const { encodeCarry, decodeCarry } = await load();
  const s = encodeCarry(new Map([['p', ['#123456']]]), 1000);
  assert.equal(decodeCarry(s, 1000 + 61e3).size, 0, 'older than a minute');
  assert.equal(decodeCarry(s, 1000 - 6e3).size, 0, 'from the future');
  assert.equal(decodeCarry(s.replace('"v":1', '"v":2'), 1000).size, 0);
  for (const raw of [null, '', 'nope', '{}', '[]', '{"v":1,"at":1000,"p":{}}']) assert.equal(decodeCarry(raw, 1000).size, 0, String(raw));
});

test('bad entries are left out and each project is capped', async () => {
  const { encodeCarry, decodeCarry } = await load();
  const raw = JSON.stringify({ v: 1, at: 0, p: [['ok', ['#abcdef', 'red', 5, '#12345', '#ABCDEF']], ['', ['#000000']], [7, ['#000000']], ['none', ['x']], 'junk'] });
  assert.deepEqual([...decodeCarry(raw, 0)], [['ok', ['#abcdef', '#ABCDEF']]]);
  const many = decodeCarry(encodeCarry(new Map([['p', Array(500).fill('#010203')]]), 0), 0);
  assert.equal(many.get('p').length, 120);
});
