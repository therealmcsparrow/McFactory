'use strict';
// Continue here: POST /api/chat/start {resume} reopens a terminal session in the dashboard (claude --resume),
// but only once it is closed there. These tests cover the refusals; nothing here starts a real claude.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { Harness } = require('./harness');

const h = new Harness();
const start = body => h.req('POST', '/api/chat/start', { headers: { 'x-chat-token': h.token }, body });
before(() => h.start());
after(() => h.stop());

test('still open in the terminal: refused with a clear message', async () => {
  const sid = crypto.randomUUID();
  h.transcript(sid, [{ type: 'user', sessionId: sid, cwd: h.dir, timestamp: new Date().toISOString(), message: { role: 'user', content: 'hello' } }]);
  const p = await h.pipe(); h.session({ sid, pipe: p.path });
  const r = await start({ resume: sid, prompt: 'go on' });
  assert.equal(r.status, 409, r.body);
  assert.match(r.json.error, /close it there first/);
});

test('no transcript, bad id, no prompt, no token', async () => {
  assert.equal((await start({ resume: crypto.randomUUID(), prompt: 'x' })).status, 404);
  assert.equal((await start({ resume: '../etc', prompt: 'x' })).status, 400);
  const sid = crypto.randomUUID();
  h.transcript(sid, [{ type: 'user', sessionId: sid, cwd: h.dir, timestamp: new Date().toISOString(), message: { role: 'user', content: 'hello' } }]);
  assert.equal((await start({ resume: sid, prompt: '' })).status, 400);
  const r = await h.req('POST', '/api/chat/start', { body: { resume: sid, prompt: 'x' } });
  assert.equal(r.status, 403);
});

test('a transcript without a folder is refused', async () => {
  const sid = crypto.randomUUID();
  h.transcript(sid, [{ type: 'user', sessionId: sid, timestamp: new Date().toISOString(), message: { role: 'user', content: 'hello' } }]);
  const r = await start({ resume: sid, prompt: 'x' });
  assert.equal(r.status, 409); assert.match(r.json.error, /folder/);
});
