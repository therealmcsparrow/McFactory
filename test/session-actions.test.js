'use strict';
// Session actions on terminal/desktop sessions: Remote Control link, Close (ends the process), Continue with
// Remote Control (refusals only: success would open a real terminal window), Dismiss. And Continue here is gone.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Harness } = require('./harness');

const h = new Harness();
const act = (sid, what, token = h.token) => h.req('POST', '/api/peer/' + sid + '/' + what, { headers: token ? { 'x-chat-token': token } : {}, body: {} });
const line = (sid, extra = {}) => Object.assign({ type: 'user', sessionId: sid, cwd: h.dir, timestamp: new Date().toISOString(), message: { role: 'user', content: 'hello' } }, extra);
const wait = ms => new Promise(r => setTimeout(r, ms));
async function until(fn, ms = 5000) { const end = Date.now() + ms; let v; while (Date.now() < end) { v = await fn(); if (v) return v; await wait(100); } return v; }
const alive = pid => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };
before(() => h.start());
after(() => h.stop());

test('Continue here is removed: /api/chat/start with resume is refused', async () => {
  const r = await h.req('POST', '/api/chat/start', { headers: { 'x-chat-token': h.token }, body: { resume: crypto.randomUUID(), prompt: 'x' } });
  assert.equal(r.status, 400); assert.match(r.json.error, /Remote Control/);
});

test('Remote Control: the link goes out on the peer stream only, the snapshot has a flag', async () => {
  const sid = crypto.randomUUID(), bridge = 'session_01AXYtKWx9sKxWKdnD4uxDYR';
  h.transcript(sid, [line(sid)]);
  const p = await h.pipe(); h.session({ sid, pipe: p.path, bridge });
  const t = await until(async () => { const x = await h.task(sid); return x && x.peer && x.peer.rc ? x : null; });
  assert.ok(t, 'state flag rc'); assert.equal(t.peer.rc, true);
  assert.ok(!JSON.stringify(await h.state()).includes(bridge), 'the link is not in /api/state');
  const s = await h.peerStream(sid);
  const init = await until(() => s.of('init')[0]); s.close();
  assert.equal(init.meta.rc, 'https://claude.ai/code/' + bridge);
  assert.equal(init.meta.canClose, true);
});

test('Remote Control: a bad bridge id gives no link; open without one is refused', async () => {
  const sid = crypto.randomUUID();
  h.transcript(sid, [line(sid)]);
  h.session({ sid, bridge: 'javascript:alert(1)' });
  const s = await h.peerStream(sid);
  const init = await until(() => s.of('init')[0]); s.close();
  assert.equal(init.meta.rc, null);
  const r = await act(sid, 'open');
  assert.equal(r.status, 404); assert.match(r.json.error, /\/rc/);
});

test('Close ends the process that holds the session (token required)', async () => {
  const sid = crypto.randomUUID();
  h.transcript(sid, [line(sid)]);
  const sess = h.session({ sid });
  assert.equal((await act(sid, 'close', '')).status, 403);
  assert.ok(alive(sess.pid));
  const r = await act(sid, 'close');
  assert.equal(r.status, 200, r.body);
  assert.ok(await until(() => !alive(sess.pid)), 'process stopped');
  assert.equal((await act(crypto.randomUUID(), 'close')).status, 404);
});

test('Continue with Remote Control: refusals', async () => {
  const open = crypto.randomUUID();
  h.transcript(open, [line(open)]); h.session({ sid: open });
  let r = await act(open, 'rc'); assert.equal(r.status, 409); assert.match(r.json.error, /\/rc/);
  assert.equal((await act(crypto.randomUUID(), 'rc')).status, 404);
  const nof = crypto.randomUUID();
  h.transcript(nof, [{ type: 'user', sessionId: nof, timestamp: new Date().toISOString(), message: { role: 'user', content: 'hi' } }]);
  r = await act(nof, 'rc'); assert.equal(r.status, 409); assert.match(r.json.error, /folder/);
  assert.equal((await act(open, 'rc', '')).status, 403);
});

test('Dismiss hides a finished session until it has new activity, and is saved', async () => {
  const sid = crypto.randomUUID();
  const fp = h.transcript(sid, [line(sid, { timestamp: new Date(Date.now() - 60e3).toISOString() })]);
  const sess = h.session({ sid });
  assert.ok(await until(() => h.task(sid)));
  assert.equal((await act(sid, 'dismiss')).status, 409, 'running: refused');
  sess.kill(); fs.rmSync(sess.file);
  assert.ok(await until(async () => (await act(sid, 'dismiss')).status === 200));
  assert.ok(await until(async () => !(await h.task(sid))), 'hidden');
  const saved = JSON.parse(fs.readFileSync(path.join(h.dir, 'crate-works-dismissed.json'), 'utf8'));
  assert.ok(saved[sid] > 0);
  await wait(50); h.append(fp, [line(sid, { message: { role: 'user', content: 'again' } })]);
  assert.ok(await until(() => h.task(sid)), 'back after new activity');
});
