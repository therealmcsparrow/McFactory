'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { Harness, wait, until } = require('./harness');

const h = new Harness();
const STATE_SID = crypto.randomUUID(); // has a transcript from the start, so it is a task in /api/state
const keys = [];                       // every peer token used in this run (for the leak check)
const sess = o => { const s = h.session(o); if (s.key) keys.push(s.key); return s; };

before(async () => {
  h.transcript(STATE_SID, [{ type: 'user', sessionId: STATE_SID, cwd: h.dir, timestamp: new Date().toISOString(), message: { role: 'user', content: 'hello' } }]);
  await h.start();
});
after(() => h.stop());

// ───────────── Task 1: send
test('send delivers auth then user line', async () => {
  const p = await h.pipe(); const s = sess({ pipe: p.path });
  const r = await h.send(s.sid, { text: 'hi' });
  assert.equal(r.status, 200, r.body); assert.deepEqual(r.json, { ok: true });
  await until(() => p.got.length >= 2, 2000);
  assert.deepEqual(p.got, [
    { type: 'auth', token: s.key },
    { type: 'user', message: { role: 'user', content: 'hi' }, priority: 'next' },
  ]);
});

test('send now', async () => {
  const p = await h.pipe(); const s = sess({ pipe: p.path });
  const r = await h.send(s.sid, { text: 'x', priority: 'now' });
  assert.equal(r.status, 200, r.body);
  await until(() => p.got.length >= 2, 2000);
  assert.equal(p.got[1].priority, 'now');
  const s2 = sess({ pipe: p.path });
  const bad = await h.send(s2.sid, { text: 'x', priority: 'later2' });
  assert.equal(bad.status, 400);
});

test('empty or too long text is refused', async () => {
  const p = await h.pipe(); const s = sess({ pipe: p.path });
  assert.equal((await h.send(s.sid, { text: '' })).status, 400);
  assert.equal((await h.send(s.sid, { text: 'x'.repeat(50001) })).status, 400);
  assert.equal(p.got.length, 0);
});

test('no token', async () => {
  const p = await h.pipe(); const s = sess({ pipe: p.path });
  const r = await h.req('POST', '/api/peer/' + s.sid + '/send', { body: { text: 'hi' } });
  assert.equal(r.status, 403);
  const r2 = await h.send(s.sid, { text: 'hi' }, { 'x-chat-token': 'nope' });
  assert.equal(r2.status, 403);
  assert.equal(p.got.length, 0);
});

test('bad origin', async () => {
  const p = await h.pipe(); const s = sess({ pipe: p.path });
  const r = await h.send(s.sid, { text: 'hi' }, { origin: 'http://evil' });
  assert.equal(r.status, 403);
  assert.equal(p.got.length, 0);
});

test('unknown session', async () => {
  const r = await h.send(crypto.randomUUID(), { text: 'hi' });
  assert.equal(r.status, 404);
});

test('dead pid', async () => {
  const p = await h.pipe(); const s = sess({ pipe: p.path, pid: 999999 });
  const r = await h.send(s.sid, { text: 'hi' });
  assert.equal(r.status, 404);
  assert.equal(p.got.length, 0);
});

test('bad pipe path', async () => {
  const s = sess({ pipe: process.platform === 'win32' ? '\\\\.\\pipe\\other' : '/tmp/other.sock' });
  const r = await h.send(s.sid, { text: 'hi' });
  assert.equal(r.status, 404);
});

test('missing key file', async () => {
  const p = await h.pipe(); const s = sess({ pipe: p.path, key: null });
  const r = await h.send(s.sid, { text: 'hi' });
  assert.equal(r.status, 502);
  assert.match(r.json.error, /key/);
  assert.equal(p.got.length, 0);
});

test('malformed key file', async () => {
  const p = await h.pipe(); const s = sess({ pipe: p.path, key: 'not-hex' });
  const r = await h.send(s.sid, { text: 'hi' });
  assert.equal(r.status, 502);
  assert.match(r.json.error, /key/);
});

test('pipe not listening', async () => {
  const s = sess({ sid: STATE_SID, pipe: h.pipePath() });
  const live = await until(async () => { const t = await h.task(STATE_SID); return t && t.peer && t.peer.live ? t : null; });
  assert.ok(live, 'task has peer.live');
  assert.equal(live.peer.canSend, true);
  const r = await h.send(s.sid, { text: 'hi' });
  assert.equal(r.status, 502);
  const t = await until(async () => { const x = await h.task(STATE_SID); return x && x.peer && x.peer.canSend === false ? x : null; });
  assert.ok(t, 'peer.canSend false after a failed send');
  assert.equal(JSON.stringify(t).includes('hi"'), false);
});

test('rate limit', async () => {
  const p = await h.pipe(); const s = sess({ pipe: p.path });
  const a = await h.send(s.sid, { text: 'one' });
  const b = await h.send(s.sid, { text: 'two' });
  assert.equal(a.status, 200, a.body);
  assert.equal(b.status, 429);
  await wait(1100);
  assert.equal((await h.send(s.sid, { text: 'three' })).status, 200);
});

test('malformed session id is refused', async () => {
  // no owned sessions exist in tests (they spawn claude); the route must still not accept non-live ids
  const r = await h.send('../../etc', { text: 'hi' });
  assert.equal(r.status, 404);
});

test('token never leaks', async () => {
  await h.state();
  const all = h.out + '\n' + h.bodies.join('\n');
  for (const k of keys) assert.equal(all.includes(k), false, 'peer token found in output');
});
