'use strict';
// Office view, server side: the subagent screen (/api/agent/<id>/stream), the per-session "mode" flag and office.js.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { Harness, until } = require('./harness');

const SID = 'sess-office-1', SUB = 'abc123';
const now = () => new Date().toISOString();
const user = (sid, content) => ({ type: 'user', timestamp: now(), sessionId: sid, cwd: 'C:\\x', message: { role: 'user', content } });
const asst = (sid, content, extra = {}) => Object.assign({ type: 'assistant', timestamp: now(), sessionId: sid, cwd: 'C:\\x',
  message: { id: 'm' + Math.random(), model: 'claude-opus-5-5', role: 'assistant', stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 }, content } }, extra);
const cmdLine = name => user('s', `<command-message>${name.slice(1)}</command-message>\n<command-name>${name}</command-name>\n<command-args>SECRET-ARGS</command-args>`);

// main session + one subagent transcript; returns the subagent file path
function withSub(h, subLines) {
  h.transcript(SID, [user(SID, 'main prompt'), asst(SID, [{ type: 'text', text: 'main reply' }])]);
  const dir = path.join(h.projects, 'p', SID, 'subagents'); fs.mkdirSync(dir, { recursive: true });
  const fp = path.join(dir, `agent-${SUB}.jsonl`);
  fs.writeFileSync(fp, subLines.map(l => JSON.stringify(l) + '\n').join(''));
  fs.writeFileSync(fp.replace(/\.jsonl$/, '.meta.json'), JSON.stringify({ agentType: 'Explore', description: 'look around' }));
  return fp;
}
const agentUrl = (h, id = 'a-' + SUB, token = h.token) => '/api/agent/' + id + '/stream' + (token ? '?token=' + token : '');

test('agent stream: 403 without token or with a wrong one, 404 unknown agent, 405 wrong method', async () => {
  const h = new Harness();
  withSub(h, [user(SID, 'brief'), asst(SID, [{ type: 'text', text: 'hello' }])]);
  try {
    await h.start();
    const noTok = await h.req('GET', agentUrl(h, 'a-' + SUB, ''));
    assert.equal(noTok.status, 403);
    const bad = await h.req('GET', agentUrl(h, 'a-' + SUB, 'deadbeef'));
    assert.equal(bad.status, 403);
    const unknown = await h.req('GET', agentUrl(h, 'a-nonexistent'));
    assert.equal(unknown.status, 404);
    const post = await h.req('POST', agentUrl(h), { body: {} });
    assert.equal(post.status, 405);
    // method is checked before the token
    const postNoTok = await h.req('POST', agentUrl(h, 'a-' + SUB, ''), { body: {} });
    assert.equal(postNoTok.status, 405);
    // a token is required even for an unknown agent
    const unkNoTok = await h.req('GET', agentUrl(h, 'a-nonexistent', ''));
    assert.equal(unkNoTok.status, 403);
    // id without the a- prefix does not match the route
    const badId = await h.req('GET', agentUrl(h, 'xyz'));
    assert.equal(badId.status, 404);
  } finally { await h.stop(); }
});

test('agent stream init: own assistant text and tool name + summary only, never brief, thinking, tool input or output', async () => {
  const h = new Harness();
  withSub(h, [
    user(SID, 'BRIEF-MARKER do the secret thing'),
    asst(SID, [
      { type: 'thinking', thinking: 'THINKING-MARKER', signature: 'SIG-MARKER' },
      { type: 'text', text: 'OWN-TEXT-MARKER' },
      { type: 'tool_use', id: 'tu1', name: 'Bash', input: { command: 'echo SUMMARY-MARKER', timeout_extra: 'FULLINPUT-MARKER' } },
    ]),
    { type: 'user', timestamp: now(), sessionId: SID, message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'tu1', content: 'TOOLOUT-MARKER' }] }, toolUseResult: { stdout: 'TOOLOUT-MARKER' } },
    asst(SID, [{ type: 'text', text: 'SECOND-TEXT-MARKER' }]),
  ]);
  let s;
  try {
    await h.start();
    s = await h.stream(agentUrl(h));
    assert.ok(await until(() => s.events.length > 0, 4000), 'no init event');
    assert.equal(s.status, 200);
    const init = s.of('init')[0];
    assert.ok(init && Array.isArray(init.log) && init.meta);
    const raw = JSON.stringify(s.events);
    assert.ok(raw.includes('OWN-TEXT-MARKER'));
    assert.ok(raw.includes('SECOND-TEXT-MARKER'));
    assert.ok(raw.includes('SUMMARY-MARKER'));
    const tool = init.log.find(e => e.kind === 'tool');
    assert.ok(tool && tool.name === 'Bash', JSON.stringify(init.log));
    for (const bad of ['BRIEF-MARKER', 'THINKING-MARKER', 'SIG-MARKER', 'FULLINPUT-MARKER', 'TOOLOUT-MARKER'])
      assert.equal(raw.includes(bad), false, bad + ' leaked into the agent stream');
    for (const bad of ['BRIEF-MARKER', 'THINKING-MARKER', 'FULLINPUT-MARKER', 'TOOLOUT-MARKER'])
      assert.equal(h.bodies.some(b => b.includes(bad)), false, bad + ' leaked into a response body');
  } finally { if (s) s.close(); await h.stop(); }
});

test('agent stream: lines appended later arrive as an entry event, and still leak nothing', async () => {
  const h = new Harness();
  const fp = withSub(h, [user(SID, 'brief'), asst(SID, [{ type: 'text', text: 'first' }])]);
  let s;
  try {
    await h.start();
    s = await h.stream(agentUrl(h));
    assert.ok(await until(() => s.of('init').length, 4000), 'no init');
    h.append(fp, [
      user(SID, 'LATE-BRIEF-MARKER'),
      asst(SID, [{ type: 'thinking', thinking: 'LATE-THINK-MARKER' }, { type: 'text', text: 'LATE-TEXT-MARKER' }, { type: 'tool_use', id: 'tu9', name: 'Read', input: { file_path: 'C:\\late\\file.txt', extra: 'LATE-INPUT-MARKER' } }]),
      { type: 'user', timestamp: now(), sessionId: SID, message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'tu9', content: 'LATE-OUT-MARKER' }] } },
    ]);
    const got = await until(() => s.of('entry').length >= 2, 6000);
    assert.ok(got, 'no entry events: ' + JSON.stringify(s.events));
    const entries = s.of('entry');
    assert.ok(entries.some(e => e.kind === 'assistant' && e.text === 'LATE-TEXT-MARKER'));
    assert.ok(entries.some(e => e.kind === 'tool' && e.name === 'Read' && e.text.includes('file.txt')));
    const raw = JSON.stringify(s.events);
    for (const bad of ['LATE-BRIEF-MARKER', 'LATE-THINK-MARKER', 'LATE-INPUT-MARKER', 'LATE-OUT-MARKER'])
      assert.equal(raw.includes(bad), false, bad + ' leaked');
  } finally { if (s) s.close(); await h.stop(); }
});

const modeOf = async (lines) => {
  const h = new Harness();
  h.transcript('s-mode', lines);
  try { await h.start(); const t = await until(() => h.task('s-mode'), 6000); return { mode: t && t.mode, task: t, h, body: h.bodies.join('\n') }; }
  finally { await h.stop(); }
};
const skillUse = name => asst('s-mode', [{ type: 'tool_use', id: 'tk' + name, name: 'Skill', input: { skill: name } }], {});

test('state mode: brainstorm and cooler from the command line form', async () => {
  const b = await modeOf([cmdLine('/aico:brainstorm')]);
  assert.equal(b.mode, 'brainstorm');
  const c = await modeOf([cmdLine('/aico:cooler')]);
  assert.equal(c.mode, 'cooler');
});

test('state mode: brainstorm and cooler from a Skill tool_use', async () => {
  const b = await modeOf([user('s-mode', 'start'), skillUse('aico:brainstorm')]);
  assert.equal(b.mode, 'brainstorm');
  const c = await modeOf([user('s-mode', 'start'), skillUse('aico:cooler')]);
  assert.equal(c.mode, 'cooler');
});

test('state mode: null otherwise (plain session, other aico playbook, other skill, built-in command)', async () => {
  assert.equal((await modeOf([user('s-mode', 'hello'), asst('s-mode', [{ type: 'text', text: 'hi' }])])).mode, null);
  assert.equal((await modeOf([cmdLine('/aico:feature')])).mode, null);
  assert.equal((await modeOf([user('s-mode', 'x'), skillUse('aico:fix')])).mode, null);
  assert.equal((await modeOf([user('s-mode', 'x'), skillUse('superpowers:brainstorming')])).mode, null);
  assert.equal((await modeOf([cmdLine('/model')])).mode, null);
});

test('state mode: the newest aico playbook wins and another playbook clears it', async () => {
  assert.equal((await modeOf([cmdLine('/aico:brainstorm'), cmdLine('/aico:cooler')])).mode, 'cooler');
  assert.equal((await modeOf([cmdLine('/aico:cooler'), cmdLine('/aico:feature')])).mode, null);
});

test('state: message text and command args never appear in /api/state', async () => {
  // the first plain prompt is the session title (allowed, 60 chars), so lead with one; later text must not leak
  const r = await modeOf([
    user('s-mode', 'title prompt'),
    user('s-mode', '<command-message>aico:cooler</command-message>\n<command-name>/aico:cooler</command-name>\n<command-args>SECRET-ARGS-MARKER</command-args>'),
    asst('s-mode', [{ type: 'text', text: 'ASSISTANT-SECRET-MARKER' }]),
    user('s-mode', [{ type: 'text', text: 'USER-SECRET-MARKER' }]),
  ]);
  assert.equal(r.mode, 'cooler');
  for (const bad of ['SECRET-ARGS-MARKER', 'ASSISTANT-SECRET-MARKER', 'USER-SECRET-MARKER'])
    assert.equal(r.body.includes(bad), false, bad + ' leaked into /api/state');
});

// a subagent file with its .meta.json; old = make the meta file a minute old (written before the newest transcript lines)
function subFile(h, sid, id, meta, old) {
  const dir = path.join(h.projects, 'p', sid, 'subagents'); fs.mkdirSync(dir, { recursive: true });
  const fp = path.join(dir, `agent-${id}.jsonl`), mp = fp.replace(/\.jsonl$/, '.meta.json');
  fs.writeFileSync(fp, [user(sid, 'brief'), asst(sid, [{ type: 'text', text: 'working' }])].map(l => JSON.stringify(l) + '\n').join(''));
  fs.writeFileSync(mp, JSON.stringify(meta));
  if (old) { const t = new Date(Date.now() - 60e3); fs.utimesSync(mp, t, t); }
}

test('state: a nested subagent (spawnDepth 2) is a worker of its own with the subagent that sent it out as parent', async () => {
  const h = new Harness(), sid = 'sess-nest';
  h.transcript(sid, [user(sid, 'main prompt'), asst(sid, [{ type: 'text', text: 'main reply' }])]);
  subFile(h, sid, 'par1', { agentType: 'general-purpose', description: 'lead', spawnDepth: 1 });
  subFile(h, sid, 'kid2', { agentType: 'general-purpose', description: 'helper', spawnDepth: 2, parentAgentId: 'par1' });
  subFile(h, sid, 'orph3', { agentType: 'general-purpose', description: 'lost', spawnDepth: 2, parentAgentId: 'nope9' });
  try {
    await h.start();
    const t = await until(async () => { const x = await h.task(sid); return x && x.agents.length >= 4 ? x : null; }, 6000);
    const by = id => t.agents.find(a => a.id === id);
    assert.equal(by('a-par1').parentId, 's-' + sid); assert.equal(by('a-par1').depth, 1);
    assert.equal(by('a-kid2').parentId, 'a-par1'); assert.equal(by('a-kid2').depth, 2); assert.equal(by('a-kid2').kind, 'sub');
    assert.equal(by('a-orph3').parentId, 's-' + sid, 'an unknown parent falls back to the main agent');
  } finally { await h.stop(); }
});

test('state: a finished subagent that is resumed (new lines after its meta said finished) runs again', async () => {
  const h = new Harness(), sid = 'sess-resume';
  h.transcript(sid, [user(sid, 'main prompt'), asst(sid, [{ type: 'text', text: 'main reply' }])]);
  subFile(h, sid, 'res1', { agentType: 'general-purpose', description: 'resumed', spawnDepth: 1, finished: true }, true);
  subFile(h, sid, 'fin2', { agentType: 'general-purpose', description: 'finished', spawnDepth: 1, finished: true }, false);
  try {
    await h.start();
    const t = await until(async () => { const x = await h.task(sid); return x && x.agents.length >= 3 ? x : null; }, 6000);
    assert.equal(t.agents.find(a => a.id === 'a-res1').status, 'running');
    assert.equal(t.agents.find(a => a.id === 'a-fin2').status, 'done');
  } finally { await h.stop(); }
});

test('GET /office/index.js (the office scene) is served as javascript', async () => {
  const h = new Harness();
  try {
    await h.start();
    const res = await new Promise((resolve, reject) => require('http').get({ host: '127.0.0.1', port: h.port, path: '/office/index.js' }, r => {
      let b = ''; r.setEncoding('utf8'); r.on('data', d => { b += d; }); r.on('end', () => resolve({ status: r.statusCode, type: r.headers['content-type'], body: b }));
    }).on('error', reject));
    assert.equal(res.status, 200);
    assert.match(res.type, /javascript/);
    assert.ok(res.body.length > 0);
  } finally { await h.stop(); }
});
