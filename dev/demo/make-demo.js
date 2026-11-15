'use strict';
// Writes a made-up ~/.claude look-alike (projects, subagents, plan limits) for screenshots and demos.
// Usage: node dev/demo/make-demo.js <out dir>   then   node server.js --root <out dir>/.claude/projects
// Every name, prompt and number here is invented.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const OUT = path.resolve(process.argv[2] || path.join(__dirname, 'out'));
const CL = path.join(OUT, '.claude'), PR = path.join(CL, 'projects');
fs.rmSync(CL, { recursive: true, force: true }); fs.mkdirSync(PR, { recursive: true });

let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const pick = a => a[Math.floor(rnd() * a.length)];
const uuid = () => crypto.randomUUID();
const now = Date.now(), MIN = 6e4, H = 36e5, D = 864e5;
const iso = t => new Date(t).toISOString();

const MODELS = ['claude-opus-5-5', 'claude-opus-5-5', 'claude-sonnet-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5', 'claude-opus-4-8'];
const TOOLS = ['Read', 'Edit', 'Bash', 'Grep', 'Write', 'Glob', 'WebSearch'];
const ROLES = [['aico:backend-engineer', 'Build the orders API'], ['aico:frontend-engineer', 'Checkout page and cart drawer'], ['aico:qa', 'Contract tests for payments'],
  ['aico:code-reviewer', 'Review the branch diff'], ['aico:architect', 'Module map and contracts'], ['aico:security', 'Audit auth and session handling'],
  ['general-purpose', 'Find where invoices are rendered'], ['Explore', 'Map the sync code paths'], ['aico:senior-engineer', 'Ruleset check on the diff']];
const PROJECTS = [
  { dir: 'C--dev-harbor-shop', cwd: 'C:\\dev\\harbor-shop', branch: 'feat/checkout', sessions: ['Add a one-page checkout with saved addresses', 'Fix the flaky cart total test'] },
  { dir: 'C--dev-ledger-api', cwd: 'C:\\dev\\ledger-api', branch: 'main', sessions: ['Add invoice PDFs to the billing service'] },
  { dir: 'C--dev-tidepool-app', cwd: 'C:\\dev\\tidepool-app', branch: 'aico/P20261114.000003-offline-sync', sessions: ['Offline sync for the mobile app', 'Dark mode for settings'] },
  { dir: 'C--dev-lighthouse-docs', cwd: 'C:\\dev\\lighthouse-docs', branch: 'main', sessions: ['Rewrite the getting started guide'] },
  { dir: 'C--dev-gull-pipeline', cwd: 'C:\\dev\\gull-pipeline', branch: 'perf/batching', sessions: ['Batch the nightly import, it takes 3 hours'] },
];

function line(o) { return JSON.stringify(o) + '\n'; }
function assistant(t, model, cwd, branch, sid, toolName, end) {
  const id = 'msg_' + crypto.randomBytes(8).toString('hex'), tu = 'toolu_' + crypto.randomBytes(8).toString('hex');
  const big = model.includes('opus') ? 1.6 : model.includes('haiku') ? .5 : 1;
  const usage = { input_tokens: Math.round((20 + rnd() * 400) * big), output_tokens: Math.round((150 + rnd() * 2600) * big),
    cache_creation_input_tokens: Math.round((800 + rnd() * 9000) * big), cache_read_input_tokens: Math.round((20000 + rnd() * 140000) * big) };
  const content = end ? [{ type: 'text', text: 'Done.' }] : [{ type: 'tool_use', id: tu, name: toolName, input: {} }];
  return { tu, text: line({ type: 'assistant', timestamp: iso(t), cwd, gitBranch: branch, sessionId: sid, uuid: uuid(), effort: pick(['high', 'xhigh', 'medium', 'max']),
    message: { id, model, role: 'assistant', content, stop_reason: end ? 'end_turn' : 'tool_use', usage } }) };
}
function result(t, tu, cwd, sid) { return line({ type: 'user', timestamp: iso(t), cwd, sessionId: sid, uuid: uuid(), message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: tu, content: 'ok' }] } }); }
// a run of turns from t0 to t1; live = still working (ends on a tool result); ask = ends on an open tool call (waits for approval)
function turns(t0, t1, model, cwd, branch, sid, live, ask) {
  let s = '', t = t0; const n = Math.max(3, Math.round((t1 - t0) / (2.5 * MIN)));
  for (let i = 0; i < n; i++) { t = t0 + (t1 - t0) * (i / (n - 1)); const last = i === n - 1;
    const a = assistant(t, model, cwd, branch, sid, pick(TOOLS), last && !live); s += a.text;
    if (!last || (live && !ask)) s += result(last ? now : t + 2000, a.tu, cwd, sid); }
  return s;
}
const userMsg = (t, text, cwd, branch, sid) => line({ type: 'user', timestamp: iso(t), cwd, gitBranch: branch, sessionId: sid, uuid: uuid(), message: { role: 'user', content: text } });

let pi = 0;
for (const P of PROJECTS) {
  const pdir = path.join(PR, P.dir); fs.mkdirSync(pdir);
  P.sessions.forEach((title, si) => {
    const sid = uuid(), live = pi < 3 && si === 0, model = pick(MODELS.slice(0, 4));
    // history: a session or two per day over the last 14 days (for the Usage charts), then today's work
    let txt = userMsg(now - 14 * D, title, P.cwd, P.branch, sid);
    for (let d = 13; d >= 1; d--) { if (rnd() < .3) continue; const st = now - d * D + (9 + rnd() * 8) * H; txt += turns(st, st + (20 + rnd() * 90) * MIN, pick(MODELS), P.cwd, P.branch, sid, false); }
    const st = now - (live ? 40 : 200 + rnd() * 300) * MIN; txt += userMsg(st, 'Carry on with the next step', P.cwd, P.branch, sid);
    txt += turns(st, now - (live ? .2 : 150) * MIN, model, P.cwd, P.branch, sid, live, live && pi === 0);
    fs.writeFileSync(path.join(pdir, sid + '.jsonl'), txt);
    // subagents
    const sdir = path.join(pdir, sid, 'subagents'); fs.mkdirSync(sdir, { recursive: true });
    const nSub = live ? 3 + Math.floor(rnd() * 3) : 2;
    for (let k = 0; k < nSub; k++) { const [type, desc] = pick(ROLES), aid = crypto.randomBytes(8).toString('hex'), run = live && k < 2;
      const a0 = now - (run ? 8 + rnd() * 20 : 60 + rnd() * 200) * MIN, a1 = run ? now - .1 * MIN : a0 + (5 + rnd() * 25) * MIN, m = pick(MODELS);
      fs.writeFileSync(path.join(sdir, 'agent-' + aid + '.jsonl'), userMsg(a0, desc, P.cwd, P.branch, sid) + turns(a0, a1, m, P.cwd, P.branch, sid, run));
      fs.writeFileSync(path.join(sdir, 'agent-' + aid + '.meta.json'), JSON.stringify({ agentType: type, description: desc, finished: !run, spawnDepth: 1 })); }
  });
  pi++;
}

// plan limits, as the status line would have written them
fs.writeFileSync(path.join(CL, 'crate-works-limits.json'), JSON.stringify({ at: now, windows: { five_hour: { pct: 38, resetsAt: now + 2.4 * H }, seven_day: { pct: 61, resetsAt: now + 2.6 * D } } }));
let hist = '', w = 0;
for (let t = now - 14 * D; t < now; t += H) { const day = Math.floor((t - (now - 14 * D)) / D);
  if (day % 7 === 4 && w > 0 && (t - (now - 14 * D)) % D < H) w = 0; w = Math.min(100, w + rnd() * .8);
  const f = Math.round(((t / H) % 10) * (4 + 3 * Math.sin(t / D)) + rnd() * 3); hist += JSON.stringify({ t, w: { five_hour: Math.min(100, f), seven_day: Math.round(w * 10) / 10 } }) + '\n'; }
fs.writeFileSync(path.join(CL, 'crate-works-limits.jsonl'), hist);
fs.writeFileSync(path.join(CL, 'settings.json'), '{}\n');
console.log('demo data in ' + CL);
