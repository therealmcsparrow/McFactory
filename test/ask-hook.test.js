'use strict';
// AskUserQuestion through the PreToolUse hook: on by default, held only while a dashboard panel shows that session,
// handed back to the terminal (empty 200) as soon as nobody looks.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { Harness, wait, until } = require('./harness');

const QS = [{ question: 'Which colour?', header: 'Colour', multiSelect: false, options: [{ label: 'Red', description: '' }, { label: 'Blue', description: '' }] }];
const ENV = { AICO_DASH_NO_SWEEP: '1', AICO_DASH_UNWATCH_MS: '200' };
const settle = (p, ms) => Promise.race([p, wait(ms).then(() => 'pending')]);

function setup(h) {
  const sid = crypto.randomUUID();
  h.transcript(sid, [{ type: 'user', sessionId: sid, cwd: h.dir, timestamp: new Date().toISOString(), message: { role: 'user', content: 'hello' } }]);
  return sid;
}
const ask = (h, sid) => h.req('POST', '/hook/pretool', { body: { session_id: sid, hook_event_name: 'PreToolUse', tool_name: 'AskUserQuestion', tool_input: { questions: QS } } });
const pendingOf = async (h, sid) => { const t = await h.task(sid); return t && t.ext ? t.ext.pending : 0; };

const h = new Harness();
let SID;
before(async () => { SID = setup(h); await h.start([], { hook: true, env: ENV }); });
after(() => h.stop());

test('nobody watching: the question goes back to the terminal at once', async () => {
  const r = await settle(ask(h, SID), 1500);
  assert.notEqual(r, 'pending', 'the hook must not hold the question');
  assert.equal(r.status, 200); assert.equal(r.body, '');
});

test('panel open: the question is held and answered from the dashboard', async () => {
  const s = await h.peerStream(SID);
  await until(() => s.of('init').length, 2000);
  const hook = ask(h, SID);
  assert.ok(await until(async () => (await pendingOf(h, SID)) === 1, 3000), 'the question shows as a pending prompt');
  const ex = await h.stream('/api/ext/' + SID + '/stream?token=' + h.token);
  const meta = await until(() => ex.of('meta').find(m => m.pending.length), 2000);
  const p = meta.pending[0];
  assert.equal(p.kind, 'ask'); assert.deepEqual(p.questions.map(q => q.question), ['Which colour?']);
  const a = await h.req('POST', '/api/ext/' + SID + '/answer', { headers: { 'x-chat-token': h.token }, body: { id: p.id, behavior: 'allow', answers: { 'Which colour?': 'Blue' } } });
  assert.equal(a.status, 200, a.body);
  const r = await settle(hook, 2000);
  assert.notEqual(r, 'pending');
  const out = JSON.parse(r.body).hookSpecificOutput;
  assert.equal(out.hookEventName, 'PreToolUse'); assert.equal(out.permissionDecision, 'allow');
  assert.deepEqual(out.updatedInput.answers, { 'Which colour?': 'Blue' });
  ex.close(); s.close(); await wait(400);
});

test('panel closes while a question waits: it goes back to the terminal', async () => {
  const s = await h.peerStream(SID);
  await until(() => s.of('init').length, 2000);
  const hook = ask(h, SID);
  assert.ok(await until(async () => (await pendingOf(h, SID)) === 1, 3000));
  s.close();
  const r = await settle(hook, 2500);
  assert.notEqual(r, 'pending', 'released after the panel closed');
  assert.equal(r.status, 200); assert.equal(r.body, '');
  assert.ok(await until(async () => (await pendingOf(h, SID)) === 0, 2000), 'the card clears');
});

test('--no-ask-hook: never held, even with the panel open', async () => {
  const h2 = new Harness();
  try {
    const sid = setup(h2); await h2.start(['--no-ask-hook'], { hook: true, env: ENV });
    const s = await h2.peerStream(sid); await until(() => s.of('init').length, 2000);
    const r = await settle(ask(h2, sid), 1500);
    assert.notEqual(r, 'pending'); assert.equal(r.body, '');
    s.close();
  } finally { await h2.stop(); }
});
