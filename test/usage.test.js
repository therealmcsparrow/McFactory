'use strict';
// Usage view: token/cost buckets from transcripts, plan limits captured by our status line, and the status line install.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { Harness, until } = require('./harness');

const SERVER = path.join(__dirname, '..', 'server.js');
const HOUR = 3600e3;
const asst = (id, at, model, usage) => ({ type: 'assistant', timestamp: new Date(at).toISOString(), sessionId: 's-usage', cwd: 'C:\\x',
  message: { id, model, role: 'assistant', stop_reason: 'end_turn', usage, content: [{ type: 'text', text: 'SECRET-TEXT' }] } });
const settingsOf = h => JSON.parse(fs.readFileSync(path.join(h.dir, 'settings.json'), 'utf8'));
const statusline = (h, input) => spawnSync(process.execPath, [SERVER, '--statusline', '--root', h.projects], { input: JSON.stringify(input), encoding: 'utf8', timeout: 10000 });
const limitsInput = (five, week) => ({ session_id: 'SECRET-SID', cwd: 'C:\\secret\\cwd', transcript_path: 'C:\\secret\\t.jsonl', model: { id: 'claude-opus-5-5', display_name: 'Opus 5.5' },
  rate_limits: { five_hour: { used_percentage: five, resets_at: Math.floor(Date.now() / 1000) + 3600 }, seven_day: { used_percentage: week, resets_at: new Date(Date.now() + 3 * 86400e3).toISOString() } } });

test('usage buckets tokens and cost per hour and model', async () => {
  const h = new Harness();
  const now = Date.now();
  h.transcript('s-usage', [
    { type: 'user', timestamp: new Date(now - 30 * HOUR).toISOString(), sessionId: 's-usage', cwd: 'C:\\x', message: { role: 'user', content: 'hi' } },
    asst('m1', now - 26 * HOUR, 'claude-haiku-5-5', { input_tokens: 100, output_tokens: 50, cache_creation_input_tokens: 0, cache_read_input_tokens: 850 }),
    asst('m2', now - 2 * HOUR, 'claude-opus-5-5', { input_tokens: 1000, output_tokens: 2000, cache_creation_input_tokens: 0, cache_read_input_tokens: 7000 }),
  ]);
  try {
    await h.start();
    const r = await until(async () => { const x = await h.req('GET', '/api/usage?days=7'); return x.json && x.json.hours.length >= 2 ? x : null; }, 6000);
    assert.ok(r, 'usage never filled');
    assert.equal(r.json.bucketMs, HOUR);
    const all = r.json.hours.flatMap(b => Object.entries(b.m).map(([k, v]) => [k, b.t, v]));
    const opus = all.find(x => x[0] === 'Opus 5.5'), haiku = all.find(x => x[0] === 'Haiku 5.5');
    assert.ok(opus && haiku, JSON.stringify(all));
    assert.equal(opus[2][0], 10000); assert.equal(opus[2][1], 2000); assert.ok(opus[2][2] > 0);
    assert.equal(haiku[2][0], 1000);
    assert.deepEqual(r.json.models['Opus 5.5'], { family: 'opus', version: '5.5' });
    assert.ok(opus[1] <= now - 2 * HOUR && opus[1] > now - 3 * HOUR);
    assert.equal(r.body.includes('SECRET-TEXT'), false);
  } finally { await h.stop(); }
});

test('status line saves only the limit numbers and prints them', async () => {
  const h = new Harness();
  try {
    const r = statusline(h, limitsInput(23, 41));
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /5h 23%/); assert.match(r.stdout, /week 41%/);
    const raw = fs.readFileSync(path.join(h.dir, 'crate-works-limits.json'), 'utf8');
    for (const s of ['SECRET-SID', 'secret', 'Opus']) assert.equal(raw.includes(s), false, s);
    const lim = JSON.parse(raw);
    assert.equal(lim.windows.five_hour.pct, 23); assert.equal(lim.windows.seven_day.pct, 41);
    assert.ok(lim.windows.five_hour.resetsAt > Date.now() && lim.windows.seven_day.resetsAt > Date.now() + 2 * 86400e3);
    statusline(h, limitsInput(23, 41)); // unchanged: no new history line
    statusline(h, limitsInput(25, 42));
    const hist = fs.readFileSync(path.join(h.dir, 'crate-works-limits.jsonl'), 'utf8').trim().split('\n').map(l => JSON.parse(l));
    assert.deepEqual(hist.map(x => x.w.seven_day), [41, 42]);
  } finally { await h.stop(); }
});

test('status line without limits still prints and saves nothing', async () => {
  const h = new Harness();
  try {
    const r = statusline(h, { model: { display_name: 'Opus 5.5' } });
    assert.equal(r.status, 0); assert.match(r.stdout, /Opus 5\.5/);
    assert.equal(fs.existsSync(path.join(h.dir, 'crate-works-limits.json')), false);
  } finally { await h.stop(); }
});

test('server installs its status line when none is set, and serves the limits', async () => {
  const h = new Harness();
  fs.writeFileSync(path.join(h.dir, 'settings.json'), JSON.stringify({ model: 'opus', hooks: { Stop: [] } }));
  try {
    await h.start();
    const s = settingsOf(h);
    assert.equal(s.model, 'opus'); assert.deepEqual(s.hooks, { Stop: [] });
    assert.equal(s.statusLine.type, 'command'); assert.match(s.statusLine.command, /--statusline/);
    statusline(h, limitsInput(10, 20));
    const r = await h.req('GET', '/api/usage?days=1');
    assert.equal(r.json.statusline, 'ours');
    assert.equal(r.json.limits.windows.seven_day.pct, 20);
    assert.deepEqual(r.json.history.map(x => x.w.seven_day), [20]);
  } finally { await h.stop(); }
});

test('a status line of your own is left alone', async () => {
  const h = new Harness();
  const mine = { statusLine: { type: 'command', command: 'echo mine' } };
  fs.writeFileSync(path.join(h.dir, 'settings.json'), JSON.stringify(mine));
  try {
    await h.start();
    assert.deepEqual(settingsOf(h), mine);
    assert.equal((await h.req('GET', '/api/usage?days=1')).json.statusline, 'foreign');
  } finally { await h.stop(); }
});

test('--no-statusline installs nothing', async () => {
  const h = new Harness();
  try {
    await h.start(['--no-statusline']);
    assert.equal(fs.existsSync(path.join(h.dir, 'settings.json')), false);
    assert.equal((await h.req('GET', '/api/usage?days=1')).json.statusline, 'off');
  } finally { await h.stop(); }
});

test('--uninstall-statusline removes only ours', async () => {
  const h = new Harness();
  const uninstall = () => spawnSync(process.execPath, [SERVER, '--uninstall-statusline', '--root', h.projects], { encoding: 'utf8', timeout: 10000 });
  try {
    fs.writeFileSync(path.join(h.dir, 'settings.json'), JSON.stringify({ model: 'x', statusLine: { type: 'command', command: '"node" "server.js" --statusline' } }));
    assert.equal(uninstall().status, 0);
    assert.deepEqual(settingsOf(h), { model: 'x' });
    const mine = { statusLine: { type: 'command', command: 'echo mine' } };
    fs.writeFileSync(path.join(h.dir, 'settings.json'), JSON.stringify(mine));
    uninstall();
    assert.deepEqual(settingsOf(h), mine);
  } finally { await h.stop(); }
});

test('usage rejects bad input', async () => {
  const h = new Harness();
  try {
    await h.start();
    assert.equal((await h.req('POST', '/api/usage')).status, 405);
    assert.equal((await h.req('GET', '/api/usage?days=abc')).status, 200);
    assert.equal((await h.req('GET', '/api/usage', { headers: { origin: 'http://evil.example' } })).status, 403);
  } finally { await h.stop(); }
});
