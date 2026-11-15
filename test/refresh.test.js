'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { Harness } = require('./harness');

const h = new Harness();
before(() => h.start());
after(() => h.stop());

const line = sid => ({ type: 'user', sessionId: sid, cwd: h.dir, timestamp: new Date().toISOString(), message: { role: 'user', content: 'hi' } });

test('refresh needs the chat token', async () => {
  assert.equal((await h.req('POST', '/api/refresh')).status, 403);
  assert.equal((await h.req('POST', '/api/refresh', { headers: { 'x-chat-token': 'nope' } })).status, 403);
  assert.equal((await h.req('POST', '/api/refresh', { headers: { 'x-chat-token': h.token, origin: 'http://evil' } })).status, 403);
});

test('refresh is POST only', async () => {
  assert.equal((await h.req('GET', '/api/refresh', { headers: { 'x-chat-token': h.token } })).status, 405);
});

test('refresh rescans at once: a transcript made after start shows up', async () => {
  const sid = crypto.randomUUID();
  await h.state();                       // the server has done its first scan
  h.transcript(sid, [line(sid)]);        // the periodic rescan runs only every 10 s
  const r = await h.req('POST', '/api/refresh', { headers: { 'x-chat-token': h.token } });
  assert.equal(r.status, 200, r.body);
  assert.deepEqual(r.json, { ok: true });
  assert.ok(await h.task(sid), 'task visible right after refresh');
});
