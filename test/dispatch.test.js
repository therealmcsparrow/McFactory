'use strict';
// A subagent is shown the moment the main agent dispatches it (Agent/Task tool_use), before its own transcript exists.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { Harness, until } = require('./harness');

const SID = 'sess-disp-1';
const iso = (ago = 0) => new Date(Date.now() - ago).toISOString();
const user = (content, ago = 0) => ({ type: 'user', timestamp: iso(ago), sessionId: SID, cwd: 'C:\\x', message: { role: 'user', content } });
const asst = (content, ago = 0) => ({ type: 'assistant', timestamp: iso(ago), sessionId: SID, cwd: 'C:\\x',
  message: { id: 'm' + Math.random(), model: 'claude-opus-5-5', role: 'assistant', stop_reason: 'tool_use', usage: { input_tokens: 5, output_tokens: 5 }, content } });
const dispatch = (id, type, desc, ago = 0, name = 'Agent') => asst([{ type: 'tool_use', id, name, input: { subagent_type: type, description: desc, prompt: 'PROMPT-SECRET-MARKER ' + id } }], ago);
const result = (id, ago = 0) => user([{ type: 'tool_result', tool_use_id: id, content: 'RESULT-SECRET-MARKER' }], ago);

function sub(h, subId, meta, lines) {
  const dir = path.join(h.projects, 'p', SID, 'subagents'); fs.mkdirSync(dir, { recursive: true });
  const fp = path.join(dir, `agent-${subId}.jsonl`);
  fs.writeFileSync(fp, (lines || [user('brief')]).map(l => JSON.stringify(l) + '\n').join(''));
  if (meta) fs.writeFileSync(fp.replace(/\.jsonl$/, '.meta.json'), JSON.stringify(meta));
  return fp;
}
const agentsOf = async h => { const t = await h.task(SID); return t ? t.agents : []; };
const pendingOf = async h => (await agentsOf(h)).filter(a => a.pending);

test('dispatch: an unanswered Agent tool_use shows as a pending running agent, names only', async () => {
  const h = new Harness();
  h.transcript(SID, [user('title'), dispatch('toolu_A', 'aico:backend-engineer', 'Build the thing', 3000)]);
  try {
    await h.start();
    const p = await until(async () => (await pendingOf(h))[0], 6000);
    assert.ok(p, 'no pending agent');
    assert.equal(p.id, 'p-toolu_A');
    assert.equal(p.kind, 'sub');
    assert.equal(p.role, 'backend-engineer');
    assert.equal(p.label, 'Build the thing');
    assert.equal(p.status, 'running');
    assert.equal(p.pending, true);
    assert.equal(p.tokens, 0); assert.equal(p.cost, 0);
    assert.equal(p.model, 'unknown'); assert.equal(p.effort, 'default');
    assert.ok(Math.abs(p.lastActivity - (Date.now() - 3000)) < 4000);
    const t = await h.task(SID);
    assert.equal(p.parentId, 's-' + SID); assert.equal(p.taskId, SID);
    assert.equal(t.agents.filter(a => a.kind === 'main').length, 1);
    assert.equal(h.bodies.some(b => b.includes('PROMPT-SECRET-MARKER')), false, 'dispatch prompt leaked');
  } finally { await h.stop(); }
});

test('dispatch: the older Task name and a missing subagent_type work too', async () => {
  const h = new Harness();
  h.transcript(SID, [user('title'), dispatch('toolu_T', undefined, 'old style', 1000, 'Task')]);
  try {
    await h.start();
    const p = await until(async () => (await pendingOf(h))[0], 6000);
    assert.ok(p); assert.equal(p.id, 'p-toolu_T'); assert.equal(p.role, 'general-purpose');
  } finally { await h.stop(); }
});

test('dispatch: gone once the tool_result arrives', async () => {
  const h = new Harness();
  const fp = h.transcript(SID, [user('title'), dispatch('toolu_B', 'Explore', 'look', 1000)]);
  try {
    await h.start();
    assert.ok(await until(async () => (await pendingOf(h)).length === 1, 6000));
    h.append(fp, [result('toolu_B')]);
    assert.ok(await until(async () => (await pendingOf(h)).length === 0, 6000), 'still pending after result');
  } finally { await h.stop(); }
});

test('dispatch: a result that is already in the transcript means never pending', async () => {
  const h = new Harness();
  h.transcript(SID, [user('title'), dispatch('toolu_C', 'Explore', 'look', 2000), result('toolu_C', 1000)]);
  try {
    await h.start();
    assert.ok(await h.task(SID) || await until(() => h.task(SID), 6000));
    assert.equal((await pendingOf(h)).length, 0);
  } finally { await h.stop(); }
});

test('dispatch: hard link through meta.toolUseId replaces the pending and sets dispatch on the real agent', async () => {
  const h = new Harness();
  h.transcript(SID, [user('title'), dispatch('toolu_D', 'Explore', 'look around', 1000), dispatch('toolu_E', 'Explore', 'other', 900)]);
  try {
    await h.start();
    assert.ok(await until(async () => (await pendingOf(h)).length === 2, 6000));
    sub(h, 'real1', { agentType: 'Explore', description: 'other', toolUseId: 'toolu_E' });
    const ok = await until(async () => { const ag = await agentsOf(h); return ag.some(a => a.id === 'a-real1') && ag.filter(a => a.pending).length === 1; }, 8000);
    assert.ok(ok, JSON.stringify(await agentsOf(h)));
    const ag = await agentsOf(h);
    assert.equal(ag.find(a => a.id === 'a-real1').dispatch, 'toolu_E');
    assert.deepEqual(ag.filter(a => a.pending).map(a => a.id), ['p-toolu_D']); // the link is by id, not by order
  } finally { await h.stop(); }
});

test('dispatch: without a hard link, first-in-first-out on the same subagent type', async () => {
  const h = new Harness();
  h.transcript(SID, [user('title'), dispatch('toolu_F1', 'Explore', 'one', 2000), dispatch('toolu_G', 'Plan', 'plan', 1900), dispatch('toolu_F2', 'Explore', 'two', 1800)]);
  try {
    await h.start();
    assert.ok(await until(async () => (await pendingOf(h)).length === 3, 6000));
    sub(h, 'real2', { agentType: 'Explore', description: 'one' }); // no toolUseId (older Claude Code)
    assert.ok(await until(async () => (await agentsOf(h)).some(a => a.id === 'a-real2'), 8000));
    const ids = (await pendingOf(h)).map(a => a.id).sort();
    assert.deepEqual(ids, ['p-toolu_F2', 'p-toolu_G']);
    assert.equal((await agentsOf(h)).find(a => a.id === 'a-real2').dispatch, undefined);
  } finally { await h.stop(); }
});

test('dispatch: gives up after 90 seconds', async () => {
  const h = new Harness();
  h.transcript(SID, [user('title'), dispatch('toolu_OLD', 'Explore', 'stale', 120e3), dispatch('toolu_NEW', 'Explore', 'fresh', 5e3)]);
  try {
    await h.start();
    assert.ok(await until(async () => (await pendingOf(h)).length === 1, 6000));
    assert.equal((await pendingOf(h))[0].id, 'p-toolu_NEW');
  } finally { await h.stop(); }
});

test('dispatch: p- ids are not routable and totals are not double counted', async () => {
  const h = new Harness();
  h.transcript(SID, [user('title'), dispatch('toolu_R', 'Explore', 'look', 1000)]);
  try {
    await h.start();
    assert.ok(await until(async () => (await pendingOf(h)).length === 1, 6000));
    const r = await h.req('GET', '/api/agent/p-toolu_R/stream?token=' + h.token);
    assert.equal(r.status, 404);
    const s = await h.state();
    const all = s.projects.flatMap(p => p.tasks.flatMap(t => t.agents));
    assert.equal(all.filter(a => a.id === 'p-toolu_R').length, 1);
    assert.equal(s.events.some(e => String(e.agentId).startsWith('p-')), false);
    assert.equal(all.reduce((n, a) => n + (a.pending ? a.tokens : 0), 0), 0);
  } finally { await h.stop(); }
});

test('dispatch: latency from an appended main-transcript line to /api/state', async () => {
  const h = new Harness();
  const fp = h.transcript(SID, [user('title')]);
  try {
    await h.start();
    assert.ok(await until(() => h.task(SID), 6000));
    const t0 = Date.now();
    h.append(fp, [dispatch('toolu_L', 'Explore', 'timing', 0)]);
    assert.ok(await until(async () => (await pendingOf(h)).length === 1, 6000, 20));
    const ms = Date.now() - t0;
    console.log('dispatch latency ms:', ms);
    assert.ok(ms < 2500);
  } finally { await h.stop(); }
});

test('dispatch: an open page gets the change well before the one-second tick', async () => {
  const h = new Harness();
  const fp = h.transcript(SID, [user('title')]);
  const http = require('http'); let req;
  try {
    await h.start();
    assert.ok(await until(() => h.task(SID), 6000));
    let buf = '', seen = null;
    await new Promise((ok, bad) => { req = http.get({ host: '127.0.0.1', port: h.port, path: '/api/stream?hours=24' }, res => { res.on('data', c => { buf += c; if (!seen && buf.includes('p-toolu_S')) seen = Date.now(); }); ok(); }); req.on('error', bad); });
    await until(() => buf.includes('data: '), 4000, 20);
    const lat = [];
    for (let i = 0; i < 3; i++) { // three tries: the first may still share a tick with the stream's opening snapshot
      await new Promise(r => setTimeout(r, 1200)); seen = null; buf = '';
      const t0 = Date.now(); h.append(fp, [dispatch('toolu_S', 'Explore', 'timing ' + i, 0), result('toolu_S', 0)].slice(0, 1));
      assert.ok(await until(() => seen, 4000, 10)); lat.push(seen - t0);
      h.append(fp, [result('toolu_S', 0)]);
    }
    console.log('stream latency ms:', lat.join(', '));
    assert.equal(buf.includes('PROMPT-SECRET-MARKER'), false, 'dispatch prompt leaked into the stream');
    assert.ok(Math.min(...lat) < 700, 'no faster than the tick: ' + lat);
  } finally { if (req) req.destroy(); await h.stop(); }
});
