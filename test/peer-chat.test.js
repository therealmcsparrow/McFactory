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

// ───────────── Task 2: stream
const ts = () => new Date().toISOString();
const uLine = (sid, text) => ({ type: 'user', sessionId: sid, timestamp: ts(), message: { role: 'user', content: text } });
const aLine = (sid, blocks) => ({ type: 'assistant', sessionId: sid, timestamp: ts(), message: { role: 'assistant', content: blocks } });
const peerLine = (sid, text) => ({ type: 'user', isMeta: true, origin: { kind: 'peer', from: 'unknown' }, sessionId: sid, timestamp: ts(),
  message: { role: 'user', content: 'Another Claude session sent a message:\n' + text + '\n\nThis came from another Claude session — not typed by your user.' } });
const initOf = async s => { await until(() => s.of('init').length > 0, 3000); return s.of('init')[0]; };

test('stream init', async () => {
  const sid = crypto.randomUUID();
  h.transcript(sid, [uLine(sid, 'list files'),
    aLine(sid, [{ type: 'text', text: 'Sure.' }, { type: 'tool_use', id: 't1', name: 'Bash', input: { command: 'ls' } }]),
    { type: 'user', sessionId: sid, timestamp: ts(), message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't1', content: 'SECRET-OUTPUT' }] } }]);
  const s = await h.peerStream(sid);
  assert.equal(s.status, 200);
  const init = await initOf(s); s.close();
  assert.deepEqual(init.log.map(e => e.kind), ['user', 'assistant', 'tool']);
  assert.equal(init.log[0].text, 'list files');
  assert.equal(init.log[2].name, 'Bash'); assert.equal(init.log[2].text, 'ls');
  assert.equal(JSON.stringify(init).includes('SECRET-OUTPUT'), false);
  assert.ok(init.meta && 'live' in init.meta && 'canSend' in init.meta);
});

test('stream skips command wrappers and meta lines', async () => {
  const sid = crypto.randomUUID();
  h.transcript(sid, [uLine(sid, '<command-name>/clear</command-name>'),
    { type: 'user', isMeta: true, sessionId: sid, timestamp: ts(), message: { role: 'user', content: 'Caveat: internal' } },
    uLine(sid, 'real question')]);
  const s = await h.peerStream(sid); const init = await initOf(s); s.close();
  assert.deepEqual(init.log.map(e => e.text), ['real question']);
});

test('stream live', async () => {
  const sid = crypto.randomUUID();
  const fp = h.transcript(sid, [uLine(sid, 'hi')]);
  const s = await h.peerStream(sid); await initOf(s);
  h.append(fp, [aLine(sid, [{ type: 'text', text: 'hello back' }])]);
  const got = await until(() => s.of('entry').find(e => e.kind === 'assistant'), 3000);
  s.close();
  assert.ok(got, 'entry arrived'); assert.equal(got.text, 'hello back');
});

test('peer via dashboard', async () => {
  const p = await h.pipe(); const se = sess({ pipe: p.path });
  const fp = h.transcript(se.sid, [uLine(se.sid, 'start')]);
  assert.equal((await h.send(se.sid, { text: 'hello' })).status, 200);
  const s = await h.peerStream(se.sid); const init = await initOf(s);
  assert.equal(init.meta.live, true); assert.equal(init.meta.canSend, true);
  h.append(fp, [peerLine(se.sid, 'hello'), peerLine(se.sid, 'from elsewhere')]);
  const got = await until(() => s.of('entry').filter(e => e.kind === 'peer').length >= 2 ? s.of('entry').filter(e => e.kind === 'peer') : null, 3000);
  s.close();
  assert.ok(got, 'peer entries arrived');
  assert.deepEqual(got.map(e => [e.text, e.via]), [['hello', 'dashboard'], ['from elsewhere', 'session']]);
});

test('init cap', async () => {
  const sid = crypto.randomUUID();
  h.transcript(sid, Array.from({ length: 250 }, (_, i) => uLine(sid, 'line ' + (i + 1))));
  const s = await h.peerStream(sid); const init = await initOf(s); s.close();
  assert.equal(init.log.length, 200);
  assert.equal(init.log[199].text, 'line 250');
});

test('huge line skipped', async () => {
  const sid = crypto.randomUUID();
  const big = JSON.stringify(uLine(sid, 'x'.repeat(2 * 1024 * 1024)));
  const fp = h.transcript(sid, [uLine(sid, 'before'), big, uLine(sid, 'after')]);
  const s = await h.peerStream(sid); const init = await initOf(s);
  assert.deepEqual(init.log.map(e => e.text), ['before', 'after']);
  h.append(fp, [big, uLine(sid, 'later')]);
  const got = await until(() => s.of('entry').find(e => e.text === 'later'), 4000);
  s.close();
  assert.ok(got, 'entry after a huge appended line');
  assert.equal(s.of('entry').some(e => e.text.length > 100000), false);
  assert.equal((await h.req('GET', '/api/state')).status, 200);
});

test('two listeners', async () => {
  const sid = crypto.randomUUID();
  const fp = h.transcript(sid, [uLine(sid, 'hi')]);
  const a = await h.peerStream(sid), b = await h.peerStream(sid);
  await initOf(a); await initOf(b);
  a.close(); await wait(200);
  h.append(fp, [uLine(sid, 'second')]);
  const got = await until(() => b.of('entry').find(e => e.text === 'second'), 3000);
  b.close();
  assert.ok(got, 'remaining listener still gets entries');
});

test('file appears later', async () => {
  const p = await h.pipe(); const se = sess({ pipe: p.path });
  const s = await h.peerStream(se.sid);
  assert.equal(s.status, 200);
  const init = await initOf(s);
  assert.deepEqual(init.log, []);
  h.transcript(se.sid, [uLine(se.sid, 'first words')]);
  const got = await until(() => s.of('entry').find(e => e.text === 'first words'), 4000);
  s.close();
  assert.ok(got, 'entry after the file appeared');
});

test('session closes while streaming', async () => {
  const p = await h.pipe(); const se = sess({ pipe: p.path });
  h.transcript(se.sid, [uLine(se.sid, 'hi')]);
  const s = await h.peerStream(se.sid); const init = await initOf(s);
  assert.equal(init.meta.live, true);
  se.kill();
  const m = await until(() => s.of('meta').find(x => x.live === false), 5000);
  const sys = await until(() => s.of('entry').find(e => e.kind === 'system'), 2000);
  s.close();
  assert.ok(m, 'meta live:false'); assert.ok(sys, 'system entry');
});

test('stream guards', async () => {
  const sid = crypto.randomUUID();
  h.transcript(sid, [uLine(sid, 'hi')]);
  const noTok = await h.peerStream(sid, null); noTok.close();
  assert.equal(noTok.status, 403);
  const unknown = await h.peerStream(crypto.randomUUID()); unknown.close();
  assert.equal(unknown.status, 404);
});

test('token never leaks', async () => {
  await h.state();
  const all = h.out + '\n' + h.bodies.join('\n');
  for (const k of keys) assert.equal(all.includes(k), false, 'peer token found in output');
});
