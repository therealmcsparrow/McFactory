'use strict';
// AskUserQuestion through the PreToolUse hook: on by default. Taken only while a dashboard is open (any page on /api/stream
// or a panel of that session), then held until it is answered in the dashboard: closing the page or the panel does not
// hand it back. It clears when the hook request goes away (the session interrupted the tool) or the process ends.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const { spawnSync } = require('child_process');
const { Harness, wait, until } = require('./harness');

const SERVER = path.join(__dirname, '..', 'server.js');
const QS = [{ question: 'Which colour?', header: 'Colour', multiSelect: false, options: [{ label: 'Red', description: '' }, { label: 'Blue', description: '' }] }];
const ENV = { AICO_DASH_NO_SWEEP: '1' };
const settle = (p, ms) => Promise.race([p, wait(ms).then(() => 'pending')]);

function setup(h) {
  const sid = crypto.randomUUID();
  h.transcript(sid, [{ type: 'user', sessionId: sid, cwd: h.dir, timestamp: new Date().toISOString(), message: { role: 'user', content: 'hello' } }]);
  return sid;
}
const body = sid => ({ session_id: sid, hook_event_name: 'PreToolUse', tool_name: 'AskUserQuestion', tool_input: { questions: QS } });
const ask = (h, sid) => h.req('POST', '/hook/pretool', { body: body(sid) });
const pendingOf = async (h, sid) => { const t = await h.task(sid); return t && t.ext ? t.ext.pending : 0; };
const dashboard = h => h.stream('/api/stream?hours=24'); // the main page's live stream
async function answer(h, sid, label) {
  const ex = await h.stream('/api/ext/' + sid + '/stream?token=' + h.token);
  const meta = await until(() => ex.of('meta').find(m => m.pending.length), 2000);
  ex.close();
  const p = meta.pending[0];
  assert.equal(p.kind, 'ask'); assert.deepEqual(p.questions.map(q => q.question), ['Which colour?']);
  return h.req('POST', '/api/ext/' + sid + '/answer', { headers: { 'x-chat-token': h.token }, body: { id: p.id, behavior: 'allow', answers: { 'Which colour?': label } } });
}

const h = new Harness();
let SID;
before(async () => { SID = setup(h); await h.start([], { hook: true, env: ENV }); });
after(() => h.stop());

test('no dashboard open: the question goes back to the terminal at once', async () => {
  const r = await settle(ask(h, SID), 1500);
  assert.notEqual(r, 'pending', 'the hook must not hold the question');
  assert.equal(r.status, 200); assert.equal(r.body, '');
});

test('dashboard open, panel not: the question is held and answered from the dashboard', async () => {
  const d = await dashboard(h); await until(() => d.events.length, 3000);
  const hook = ask(h, SID);
  assert.ok(await until(async () => (await pendingOf(h, SID)) === 1, 3000), 'the question shows as a pending prompt');
  const a = await answer(h, SID, 'Blue');
  assert.equal(a.status, 200, a.body);
  const r = await settle(hook, 2000);
  assert.notEqual(r, 'pending');
  const out = JSON.parse(r.body).hookSpecificOutput;
  assert.equal(out.hookEventName, 'PreToolUse'); assert.equal(out.permissionDecision, 'allow');
  assert.deepEqual(out.updatedInput.answers, { 'Which colour?': 'Blue' });
  d.close(); await wait(300);
});

test('panel and dashboard close while a question waits: it stays until answered', async () => {
  const d = await dashboard(h); await until(() => d.events.length, 3000);
  const s = await h.peerStream(SID); await until(() => s.of('init').length, 2000);
  const hook = ask(h, SID);
  assert.ok(await until(async () => (await pendingOf(h, SID)) === 1, 3000));
  s.close(); d.close();
  assert.equal(await settle(hook, 4000), 'pending', 'not handed back to the terminal');
  assert.equal(await pendingOf(h, SID), 1, 'still shown');
  const a = await answer(h, SID, 'Red'); assert.equal(a.status, 200, a.body);
  const r = await settle(hook, 2000);
  assert.deepEqual(JSON.parse(r.body).hookSpecificOutput.updatedInput.answers, { 'Which colour?': 'Red' });
});

test('the session interrupts the tool (hook request closes): the card clears', async () => {
  const d = await dashboard(h); await until(() => d.events.length, 3000);
  const req = http.request({ host: '127.0.0.1', port: h.port, method: 'POST', path: '/hook/pretool', headers: { 'content-type': 'application/json' } });
  req.on('error', () => { }); req.end(JSON.stringify(body(SID)));
  assert.ok(await until(async () => (await pendingOf(h, SID)) === 1, 3000));
  req.destroy();
  assert.ok(await until(async () => (await pendingOf(h, SID)) === 0, 3000), 'the card clears');
  d.close();
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

test('--install-hook: the question hook waits 24 hours, the permission hook 300 seconds', () => {
  const dir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'hook-inst-')), file = path.join(dir, 'settings.json');
  try {
    fs.writeFileSync(file, JSON.stringify({ hooks: { PreToolUse: [{ matcher: 'AskUserQuestion', hooks: [{ type: 'http', url: 'http://127.0.0.1:4545/hook/pretool', timeout: 300 }] }] } }));
    const r = spawnSync(process.execPath, [SERVER, '--install-hook', '--settings', file], { encoding: 'utf8', timeout: 10000 });
    assert.equal(r.status, 0, r.stderr);
    const cfg = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.equal(cfg.hooks.PreToolUse.length, 1, 'the old entry is replaced');
    assert.equal(cfg.hooks.PreToolUse[0].hooks[0].timeout, 86400);
    assert.equal(cfg.hooks.PermissionRequest[0].hooks[0].timeout, 300);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
