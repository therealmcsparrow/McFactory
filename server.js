#!/usr/bin/env node
// Live Claude Code activity server for the robot-factory dashboard.
// Node built-ins only. Run: node server.js [--port 4545] [--hours 24] [--root <dir>] [--static <dir>]
// Reads ~/.claude/projects/**.jsonl incrementally and serves:
//   /                 index.html (+ live-data.js)
//   /api/state?hours= JSON snapshot
//   /api/stream?hours= SSE, pushes a snapshot when it changes (checked every ~1s)
//   /api/chat/*        chat with sessions THIS server started (see "owned chat sessions")
//   /hook/permission, /hook/pretool, /api/ext/*   answer terminal/desktop prompts through global http hooks (see "external prompts")
//   --install-hook [--with-ask] / --uninstall-hook [--settings <file>]   merge/remove only our entries in ~/.claude/settings.json
// PRIVACY: for every session the dashboard did not start, only the session title (first prompt, 60 chars)
// and subagent descriptions leave this process. No message text, tool inputs or tool outputs.
// Dashboard-owned sessions (started via POST /api/chat/start) additionally stream their own chat log
// (user/assistant text, tool names + short summary, results, cost) to this page.
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');
const net = require('net');
const crypto = require('crypto');
const { spawn } = require('child_process');

// ───────────── args
const argv = process.argv.slice(2);
const arg = (name, def) => { const i = argv.indexOf('--' + name); return i >= 0 && argv[i + 1] ? argv[i + 1] : def; };
const PORT = +arg('port', 4545);
const DEFAULT_HOURS = +arg('hours', 24);
const ROOT = path.resolve(arg('root', path.join(os.homedir(), '.claude', 'projects')));
const HERE = path.resolve(arg('static', __dirname)); // --static <dir>: where index.html, chat.js etc. live (the desktop sidecar passes its resource folder)
const HOUR = 3600e3;
const RUN_MS = 90e3, WAIT_MS = 10 * 60e3;
const MAX_HOURS = 24 * 31;

// ───────────── global hooks (answer terminal/desktop prompts from the dashboard)
// Claude Code http hooks POST here and block until we answer. Fail-open: server down = normal flow.
const HOOK_ON = !argv.includes('--no-hook');                                   // --no-hook: hook endpoints answer empty at once
const HOOK_ASK = argv.includes('--ask-hook') || process.env.AICO_DASH_ASK === '1'; // AskUserQuestion via PreToolUse: OFF until probed
const HOOK_TIMEOUT_S = 300, HOOK_HOLD_MS = +process.env.AICO_DASH_HOLD_MS || 280e3;                              // settings timeout, and when we give up first (empty 200)
const HOOK_URL_RE = /^http:\/\/127\.0\.0\.1:\d+\/hook\/(permission|pretool)$/;  // marks entries that are ours
function hookCli() {
  const install = argv.includes('--install-hook');
  const file = path.resolve(arg('settings', path.join(os.homedir(), '.claude', 'settings.json')));
  let cfg = {};
  try { cfg = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { if (e.code !== 'ENOENT') { console.error('cannot read/parse ' + file + ': ' + e.message + ' (not touched)'); process.exit(1); } }
  if (!cfg || typeof cfg !== 'object' || Array.isArray(cfg)) { console.error(file + ' is not a JSON object (not touched)'); process.exit(1); }
  const isOurs = h => h && h.type === 'http' && typeof h.url === 'string' && HOOK_URL_RE.test(h.url);
  let removed = 0;
  if (cfg.hooks && typeof cfg.hooks === 'object') {
    for (const ev of Object.keys(cfg.hooks)) {
      if (!Array.isArray(cfg.hooks[ev])) continue;
      const groups = [];
      for (const g of cfg.hooks[ev]) {
        if (!g || !Array.isArray(g.hooks)) { groups.push(g); continue; }
        const keep = g.hooks.filter(h => !isOurs(h)); removed += g.hooks.length - keep.length;
        if (keep.length) groups.push(keep.length === g.hooks.length ? g : Object.assign({}, g, { hooks: keep })); // a group that only held ours goes away
        else if (!g.hooks.length) groups.push(g);
      }
      if (groups.length) cfg.hooks[ev] = groups; else delete cfg.hooks[ev];
    }
    if (!Object.keys(cfg.hooks).length) delete cfg.hooks;
  }
  if (install) {
    const base = 'http://127.0.0.1:' + PORT + '/hook/';
    const add = (ev, entry) => { cfg.hooks = cfg.hooks && typeof cfg.hooks === 'object' ? cfg.hooks : {}; (cfg.hooks[ev] = Array.isArray(cfg.hooks[ev]) ? cfg.hooks[ev] : []).push(entry); };
    add('PermissionRequest', { hooks: [{ type: 'http', url: base + 'permission', timeout: HOOK_TIMEOUT_S }] });
    if (argv.includes('--with-ask')) add('PreToolUse', { matcher: 'AskUserQuestion', hooks: [{ type: 'http', url: base + 'pretool', timeout: HOOK_TIMEOUT_S }] });
  }
  const tmp = file + '.aico-tmp';
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(tmp, JSON.stringify(cfg, null, 2) + '\n'); fs.renameSync(tmp, file);
  console.log((install ? 'installed' : 'uninstalled') + ' in ' + file + ' (replaced/removed ' + removed + ' old entr' + (removed === 1 ? 'y' : 'ies') + ')');
  process.exit(0);
}
if (argv.includes('--install-hook') || argv.includes('--uninstall-hook')) hookCli();

// ───────────── pricing (USD per million tokens). Source: claude-api skill model table, cached 2026-11-03.
// cacheWrite = 1.25 × input (5-minute cache write). Unknown model → cost 0 and costKnown=false.
const PRICES = [
  [/^(fable|mythos)-5-2/, 8, 40, 0.20],
  [/^(fable|mythos)-5(-1)?$/, 10, 50, 1.0],
  [/^opus-5-5/, 4, 20, 0.20],
  [/^opus-(5|4-[5-9])$/, 5, 25, 0.5],
  [/^opus-(4|4-1|3)/, 15, 75, 1.5],
  [/^sonnet-5-5/, 2, 10, 0.10],
  [/^sonnet-5$/, 2, 10, 0.20],
  [/^sonnet-[34]/, 3, 15, 0.3],
  [/^haiku-5-5/, 0.10, 0.50, 0.01],
  [/^haiku-4-5/, 1, 5, 0.1],
  [/^haiku-3-5/, 0.8, 4, 0.08],
  [/^haiku-3/, 0.25, 1.25, 0.03],
];
const modelCache = new Map();
function modelInfo(id) {
  let m = modelCache.get(id); if (m) return m;
  const raw = String(id || 'unknown');
  const core = raw.replace(/\[.*?\]$/, '').replace(/^claude-/, '').replace(/-\d{8}$/, '');
  const mm = /^(opus|sonnet|haiku|fable|mythos)-(\d+)(?:-(\d{1,2}))?/.exec(core);
  const family = mm ? mm[1] : 'other';
  const version = mm ? mm[2] + (mm[3] ? '.' + mm[3] : '') : '';
  const label = mm ? family[0].toUpperCase() + family.slice(1) + ' ' + version : raw;
  let price = null; for (const [re, i, o, r] of PRICES) if (re.test(core)) { price = { inP: i, outP: o, crP: r, cwP: i * 1.25 }; break; }
  const old = /^(opus-(4|4-1|3)|sonnet-(3|4|4-5)|haiku-(3|4-5))/.test(core) && !/\[1m\]/.test(raw);
  m = { id: raw, family, version, label, price, ctxWindow: old ? 200e3 : 1e6 };
  modelCache.set(id, m); return m;
}

// ───────────── state
const files = new Map();   // path -> {path, kind, agent, offset, size, mtime, carry}
const agents = new Map();  // agentId -> agent record
const projects = new Map(); // dirName -> {id, cwd, name, branch}
let loadedSince = Date.now() - DEFAULT_HOURS * HOUR;
let version = 0;           // bumps when anything parsed changes
const dirtyFiles = new Set();
let pendingBytes = 0;

function projOf(dir) {
  let p = projects.get(dir);
  if (!p) { p = { id: dir, dir, cwd: null, name: decodeDir(dir), branch: '' }; projects.set(dir, p); }
  return p;
}
function decodeDir(d) { const parts = d.split(/-+/).filter(Boolean); return parts[parts.length - 1] || d; }
function baseName(cwd) { const s = String(cwd).replace(/[\\/]+$/, ''); const parts = s.split(/[\\/]/); return parts[parts.length - 1] || s; }

function agentOf(kind, projDir, sessionId, subId) {
  const id = kind === 'main' ? 's-' + sessionId : 'a-' + subId;
  let a = agents.get(id);
  if (!a) {
    a = { id, kind, projDir, sessionId, subId, role: kind === 'main' ? 'main' : 'agent', label: '', title: '', slug: '',
      model: null, effort: null, msgs: new Map(), tools: [], lastTool: '', firstTs: 0, lastTs: 0,
      lastAssistantErr: false, meta: null, metaPath: null, metaMtime: 0,
      // needs-human tracking (transcript side): unresolved tool_use blocks, end-of-turn state, permission mode
      pend: new Map(), turnEnd: false, turnEndTs: 0, pendingBg: 0, permMode: '',
      // aico project ID (P20261112.000001): latest from gitBranch/cwd, else first prompt (main) or meta description (sub)
      pid: '', pidTs: 0, pidText: '' };
    agents.set(id, a);
  }
  return a;
}

// ───────────── discovery
function track(fp, kind, projDir, sessionId, subId, st) {
  if (files.has(fp)) return;
  const agent = agentOf(kind, projDir, sessionId, subId);
  const f = { path: fp, kind, agent, offset: 0, size: st.size, mtime: st.mtimeMs, carry: null };
  files.set(fp, f); pendingBytes += st.size; dirtyFiles.add(fp);
  if (kind === 'sub') { agent.metaPath = fp.replace(/\.jsonl$/, '.meta.json'); readMeta(agent); }
}
function readMeta(a) {
  if (!a.metaPath) return;
  try {
    const st = fs.statSync(a.metaPath); if (st.mtimeMs === a.metaMtime) return; a.metaMtime = st.mtimeMs;
    const m = JSON.parse(fs.readFileSync(a.metaPath, 'utf8'));
    a.meta = { finished: m.finished === true, agentType: m.agentType || '', description: m.description || '', spawnDepth: m.spawnDepth || 1, pickedEffortModel: m.pickedEffortModel || '', error: !!(m.error || m.failed || m.status === 'failed') };
    if (a.meta.agentType) a.role = a.meta.agentType.replace(/^aico:/, '');
    a.label = String(a.meta.description).slice(0, 80);
    a.pidText = aicoId(a.meta.description);
    version++;
  } catch { /* meta not written yet */ }
}
function scanDirs() {
  let ents; try { ents = fs.readdirSync(ROOT, { withFileTypes: true }); } catch { return; }
  for (const d of ents) {
    if (!d.isDirectory()) continue;
    const pdir = path.join(ROOT, d.name); let inner; try { inner = fs.readdirSync(pdir, { withFileTypes: true }); } catch { continue; }
    for (const e of inner) {
      if (e.isFile() && e.name.endsWith('.jsonl')) {
        const fp = path.join(pdir, e.name); if (files.has(fp)) continue;
        let st; try { st = fs.statSync(fp); } catch { continue; }
        if (st.mtimeMs >= loadedSince) track(fp, 'main', d.name, e.name.slice(0, -6), null, st);
      } else if (e.isDirectory()) {
        const sdir = path.join(pdir, e.name, 'subagents'); let subs; try { subs = fs.readdirSync(sdir); } catch { continue; }
        for (const s of subs) {
          if (!s.endsWith('.jsonl')) continue; const fp = path.join(sdir, s); if (files.has(fp)) continue;
          let st; try { st = fs.statSync(fp); } catch { continue; }
          if (st.mtimeMs >= loadedSince) track(fp, 'sub', d.name, e.name, s.replace(/^agent-/, '').slice(0, -6), st);
        }
      }
    }
  }
}

// ───────────── incremental reading
const CHUNK = 8 << 20;
const TS_RE = /"timestamp":"([^"]+)"/;
function readFile(f, budget) {
  let st; try { st = fs.statSync(f.path); } catch { return 0; }
  if (st.size < f.offset) { f.offset = 0; f.carry = null; } // truncated/rewritten: start over
  f.size = st.size; f.mtime = st.mtimeMs;
  if (f.size === f.offset) return 0;
  let fd; try { fd = fs.openSync(f.path, 'r'); } catch { return 0; }
  let readTotal = 0;
  try {
    while (f.offset < f.size && readTotal < budget) {
      const len = Math.min(CHUNK, f.size - f.offset);
      const buf = Buffer.allocUnsafe(len); const n = fs.readSync(fd, buf, 0, len, f.offset);
      if (n <= 0) break;
      f.offset += n; readTotal += n; pendingBytes = Math.max(0, pendingBytes - n);
      let data = buf.subarray(0, n);
      if (f.carry) { data = Buffer.concat([f.carry, data]); f.carry = null; }
      let start = 0;
      for (;;) {
        const nl = data.indexOf(10, start); if (nl < 0) break;
        if (nl > start) handleLine(f, data.toString('utf8', start, nl));
        start = nl + 1;
      }
      if (start < data.length) f.carry = Buffer.from(data.subarray(start)); // partial last line
    }
  } finally { fs.closeSync(fd); }
  if (readTotal) version++;
  return readTotal;
}

function textOf(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) { const t = content.find(c => c && c.type === 'text'); return t ? t.text || '' : ''; }
  return '';
}
function handleLine(f, line) {
  const a = f.agent; a.nl = (a.nl || 0) + 1; // line counter: external prompts clear when the session writes more
  const isAssistant = line.includes('"type":"assistant"');
  const isUser = !isAssistant && line.includes('"type":"user"');
  let o = null;
  if (isAssistant || (isUser && (!a.title || line.length < 200000)) || line.length < 20000) { try { o = JSON.parse(line); } catch { o = null; } }
  let ts = 0;
  if (o) ts = o.timestamp ? Date.parse(o.timestamp) : 0;
  else { const m = TS_RE.exec(line.length > 4000 ? line.slice(-4000) : line) || TS_RE.exec(line); if (m) ts = Date.parse(m[1]); }
  if (ts) { if (!a.firstTs || ts < a.firstTs) a.firstTs = ts; if (ts > a.lastTs) a.lastTs = ts; }
  if (!o) { // huge unparsed line: still resolve any tool results it carries
    if (a.pend.size && line.includes('"tool_use_id"')) for (const m of line.matchAll(TUID_RE)) a.pend.delete(m[1]);
    return;
  }
  if (o.permissionMode) a.permMode = o.permissionMode;
  if (o.type === 'system' && o.subtype === 'turn_duration') { a.turnEnd = true; a.turnEndTs = ts || a.lastTs; a.pendingBg = +o.pendingBackgroundAgentCount || 0; }
  if (o.type === 'user' && o.message && !o.isMeta && !o.isCompactSummary) {
    const c = o.message.content; let results = false;
    if (Array.isArray(c)) for (const b of c) if (b && b.type === 'tool_result') { results = true; a.pend.delete(b.tool_use_id); }
    if (!results) { a.pend.clear(); a.turnEnd = false; } // a fresh prompt: whatever was pending before is gone
  }
  if (o.cwd || o.gitBranch) {
    const p = projOf(a.projDir);
    if (o.cwd && (!p.cwd || f.kind === 'main')) { p.cwd = o.cwd; p.name = baseName(o.cwd); }
    if (o.gitBranch) p.branch = o.gitBranch;
  }
  if (o.slug && !a.slug) a.slug = o.slug;
  { const id = aicoId(o.gitBranch) || aicoId(o.cwd); if (id && (ts || 1) >= a.pidTs) { a.pid = id; a.pidTs = ts || a.pidTs; } }
  if (o.type === 'user' && f.kind === 'main' && !a.title && !o.isMeta && !o.isSidechain && !o.isCompactSummary) {
    const t = textOf(o.message && o.message.content).trim();
    if (t && !t.startsWith('<') && !t.startsWith('[Request interrupted')) { a.title = t.replace(/\s+/g, ' ').slice(0, 60); a.pidText = aicoId(t); }
    else if (!a.cmdTitle && t.startsWith('<command-name>')) { const m = /<command-name>([^<]+)<\/command-name>/.exec(t); if (m && !/^\/(clear|compact|resume|exit|model|effort|config)\b/.test(m[1].trim())) a.cmdTitle = m[1].trim().slice(0, 60); }
  }
  if (o.type !== 'assistant' || !o.message) return;
  const msg = o.message;
  if (o.isApiErrorMessage || o.error || msg.model === '<synthetic>') {
    if (o.isApiErrorMessage || o.error) a.lastAssistantErr = true;
    return;
  }
  a.lastAssistantErr = false;
  if (msg.model) a.model = msg.model;
  const eff = o.effort || o.perTurnEffort; if (eff) a.effort = String(eff);
  const u = msg.usage || {};
  const key = msg.id || o.requestId || o.uuid;
  const prev = a.msgs.get(key);
  a.msgs.set(key, { ts: prev ? prev.ts : ts, model: msg.model || a.model, in: u.input_tokens || 0, out: u.output_tokens || 0, cw: u.cache_creation_input_tokens || 0, cr: u.cache_read_input_tokens || 0 });
  if (Array.isArray(msg.content)) for (const c of msg.content) if (c && c.type === 'tool_use') { a.tools.push(ts); a.lastTool = String(c.name || '').slice(0, 40); a.pend.set(c.id, { name: String(c.name || ''), ts }); a.turnEnd = false; }
  if (msg.stop_reason === 'end_turn' && !a.pend.size) { a.turnEnd = true; a.turnEndTs = ts; a.pendingBg = 0; }
  else if (msg.stop_reason && msg.stop_reason !== 'end_turn') a.turnEnd = false;
}
const TUID_RE = /"tool_use_id":"([^"]+)"/g;
// aico project ID: P + yyyymmdd + . + 6 digits (a step suffix like /05-fix is dropped). Only the ID leaves the server.
const AICO_ID_RE = /(?:^|[^A-Za-z0-9])(P20\d{6}\.\d{6})(?!\d)/;
function aicoId(s) { const m = s ? AICO_ID_RE.exec(String(s)) : null; return m ? m[1] : ''; }
// session project ID: newest branch/cwd hit over main + subagents, else first prompt, else subagent descriptions
function sessionPid(main, subs) {
  let best = main && main.pid ? main : null;
  for (const s of subs) if (s.pid && (!best || s.pidTs > best.pidTs)) best = s;
  if (best) return { id: best.pid, src: best === main ? 'branch/cwd' : 'subagent branch/cwd' };
  if (main && main.pidText) return { id: main.pidText, src: 'first prompt' };
  const c = new Map(); for (const s of subs) if (s.pidText) c.set(s.pidText, (c.get(s.pidText) || 0) + 1);
  let top = '', n = 0; for (const [k, v] of c) if (v > n) { top = k; n = v; }
  return top ? { id: top, src: 'subagent description' } : null;
}

// ───────────── pump: watch + interval fallback
let rescanAt = 0;
function pump() {
  const now = Date.now();
  if (now >= rescanAt) { scanDirs(); rescanAt = now + 10e3; }
  // fallback stat of tracked files (cheap); fs.watch makes this mostly redundant
  for (const f of files.values()) {
    if (f.offset < f.size || dirtyFiles.has(f.path)) continue;
    try { const st = fs.statSync(f.path); if (st.size !== f.offset) dirtyFiles.add(f.path); } catch { }
  }
  let budget = 96 << 20;
  for (const fp of [...dirtyFiles]) {
    const f = files.get(fp); if (!f) { dirtyFiles.delete(fp); continue; }
    budget -= readFile(f, budget);
    if (f.offset >= f.size) dirtyFiles.delete(fp);
    if (budget <= 0) break;
  }
  for (const a of agents.values()) if (a.kind === 'sub' && !(a.meta && a.meta.finished)) readMeta(a);
  readLive();
  extSweep();
}

// ───────────── live session state (~/.claude/sessions/<pid>.json, written by every running Claude Code)
// {sessionId, status: busy|idle|waiting, waitingFor: "permission prompt"|"input needed"|"sandbox request"|
//  "worker request"|"goal proposal"|"dialog open", statusUpdatedAt}. Authoritative when present; the
// transcript heuristics in needsOf() are the fallback when this folder is missing.
const SESS_DIR = path.join(path.dirname(ROOT), 'sessions');
let live = null, liveKey = '';           // live: Map sessionId -> {status, waitingFor, since} | null (folder unreadable)
let procs = new Set();                    // sessionIds a live Claude Code process holds (any status): the session is open
const OPEN_MS = 5 * 60e3;                 // fallback: transcript activity this recent keeps a session open
function alive(pid) { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } }
function readLive() {
  let names; try { names = fs.readdirSync(SESS_DIR).filter(n => /^\d+\.json$/.test(n)); } catch { if (live !== null) { live = null; procs = new Set(); liveKey = ''; version++; } return; }
  const m = new Map(), ps = new Set();
  for (const n of names) {
    let o; try { o = JSON.parse(fs.readFileSync(path.join(SESS_DIR, n), 'utf8')); } catch { continue; }
    if (!o || !o.sessionId || (o.pid && !alive(o.pid))) continue;
    ps.add(String(o.sessionId)); peerSeen(String(o.sessionId), o.pid, String(o.status || ''));
    if (!o.status) continue;
    const at = +o.statusUpdatedAt || +o.updatedAt || 0, prev = m.get(o.sessionId);
    if (!prev || at > prev.since) m.set(o.sessionId, { status: String(o.status), waitingFor: o.waitingFor ? String(o.waitingFor) : '', since: at });
  }
  const key = JSON.stringify([[...m], [...ps]]);
  if (key !== liveKey || live === null) { live = m; procs = ps; liveKey = key; version++; }
}

// needsHuman: which agent of a session the human is holding up, and why.
const REPLY_MS = 30 * 60e3, PERM_MS = 4e3, ASK_MS = 6 * HOUR;
const DELEGATE = new Set(['Agent', 'Task']); // a pending sync subagent call is the parent waiting on the child, not on you
const NO_PROMPT = new Set(['Read', 'Grep', 'Glob', 'LS', 'TodoWrite', 'TaskCreate', 'TaskUpdate', 'TaskList', 'TaskGet', 'TaskOutput', 'ToolSearch', 'Skill', 'SendMessage', 'Monitor', 'Agent', 'Task', 'WebSearch', 'LSP']);
const APPROVAL = new Set(['permission prompt', 'sandbox request', 'worker request', 'goal proposal']);
function latestPending(a, skip) { let best = null; for (const [, p] of a.pend) if (!skip.has(p.name) && (!best || p.ts >= best.ts)) best = p; return best; }
function needsOf(main, subs, now) { // -> Map agentId -> {reason, since}
  const out = new Map();
  const oc = chats.get(main.sessionId); // dashboard-owned session with a pending permission/question: authoritative
  if (oc && oc.alive && oc.pending.size) { const r = [...oc.pending.values()][0]; out.set(main.id, { reason: r.tool_name === 'AskUserQuestion' ? 'question' : 'approval', since: r.ts }); return out; }
  const ep = ext.get(main.sessionId); // terminal/desktop session the dashboard can answer through a hook
  if (ep && ep.size) { const r = [...ep.values()][0]; out.set(main.id, { reason: r.kind === 'ask' ? 'question' : 'approval', since: r.ts }); return out; }
  const ls = live && live.get(main.sessionId);
  if (live !== null) { // authoritative live state
    if (!ls) return out;
    if (ls.status === 'waiting' && ls.waitingFor !== 'dialog open') {
      const reason = APPROVAL.has(ls.waitingFor) ? 'approval' : ls.waitingFor === 'input needed' ? 'question' : 'input';
      // attribute to the agent with the newest unresolved, non-delegating tool call (a subagent's permission prompt)
      let who = main, best = latestPending(main, DELEGATE);
      for (const s of subs) { const p = latestPending(s, DELEGATE); if (p && (!best || p.ts > best.ts)) { best = p; who = s; } }
      if (reason === 'question' || !best) who = main; // questions are asked by the main session
      out.set(who.id, { reason, since: ls.since || (best && best.ts) || main.lastTs });
    } else if (ls.status === 'idle' && now - main.lastTs < REPLY_MS) out.set(main.id, { reason: 'your reply', since: ls.since || main.lastTs });
    return out;
  }
  // fallback: transcript only
  for (const a of [main, ...subs]) {
    const p = latestPending(a, DELEGATE); if (!p || now - p.ts > ASK_MS) continue;
    if (a === main && p.name === 'AskUserQuestion') { out.set(a.id, { reason: 'question', since: p.ts }); continue; }
    if (a === main && p.name === 'ExitPlanMode') { out.set(a.id, { reason: 'approval', since: p.ts }); continue; }
    // other tools: only when the permission mode can prompt, nothing was written since and it is not a no-prompt tool
    const mode = main.permMode || a.permMode;
    if (!NO_PROMPT.has(p.name) && now - p.ts > PERM_MS && a.lastTs <= p.ts + 1000 && !/^(bypassPermissions|dontAsk|auto)$/.test(mode)) out.set(a.id, { reason: 'approval', since: p.ts });
  }
  if (!out.size && main.turnEnd && !main.pend.size && !main.pendingBg && now - main.lastTs < REPLY_MS) out.set(main.id, { reason: 'your reply', since: main.turnEndTs || main.lastTs });
  return out;
}
try {
  fs.watch(ROOT, { recursive: true }, (ev, name) => {
    if (!name) return; const fp = path.join(ROOT, String(name));
    if (fp.endsWith('.jsonl')) { if (files.has(fp)) dirtyFiles.add(fp); else rescanAt = 0; }
  });
} catch (e) { console.warn('fs.watch unavailable, polling only:', e.message); }

// ───────────── snapshot
function statusOf(a, now) {
  const idle = now - a.lastTs;
  const finished = a.meta && a.meta.finished;
  if (a.lastAssistantErr && (finished || idle > RUN_MS)) return 'failed';
  if (a.meta && a.meta.error) return 'failed';
  if (finished) return 'done';
  if (idle < RUN_MS) return 'running';
  if (idle < WAIT_MS) return 'waiting';
  return 'done';
}
function buildSnapshot(hours) {
  const now = Date.now(), since = now - hours * HOUR;
  const out = { now, since, hours, startedAt: since, loading: pendingBytes > 0, pendingBytes, root: '~/.claude/projects', projects: [], events: [], history: [], models: {} };
  const byTask = new Map();
  const RATE_WIN = 60e3, H_N = 60, H_STEP = 10e3, hist = new Float64Array(H_N);
  const hStart = now - H_N * H_STEP;
  // needs-human per session (main + its unfinished subagents)
  const needs = new Map(), subsBy = new Map();
  for (const a of agents.values()) if (a.kind === 'sub' && !(a.meta && a.meta.finished) && a.lastTs >= since) { let l = subsBy.get(a.sessionId); if (!l) subsBy.set(a.sessionId, l = []); l.push(a); }
  for (const a of agents.values()) if (a.kind === 'main' && a.lastTs >= since) for (const [id, n] of needsOf(a, subsBy.get(a.sessionId) || [], now)) needs.set(id, n);
  for (const a of agents.values()) {
    if (!a.lastTs || a.lastTs < since) continue;
    let input = 0, output = 0, cw = 0, cr = 0, cost = 0, costKnown = true, recent = 0, lastCtx = 0, lastMsgTs = 0;
    for (const m of a.msgs.values()) {
      const tok = m.in + m.out + m.cw + m.cr;
      if (m.ts >= hStart) { const b = Math.floor((m.ts - hStart) / H_STEP); if (b >= 0 && b < H_N) hist[b] += tok; }
      if (m.ts >= lastMsgTs) { lastMsgTs = m.ts; lastCtx = m.in + m.cw + m.cr; }
      if (m.ts < since) continue;
      input += m.in; output += m.out; cw += m.cw; cr += m.cr;
      const mi = modelInfo(m.model);
      if (mi.price) cost += (m.in * mi.price.inP + m.out * mi.price.outP + m.cw * mi.price.cwP + m.cr * mi.price.crP) / 1e6;
      else if (tok) costKnown = false;
      if (m.ts >= now - RATE_WIN) recent += tok;
      const mm = out.models[mi.id] || (out.models[mi.id] = { id: mi.id, label: mi.label, family: mi.family, version: mi.version, priced: !!mi.price, ctxWindow: mi.ctxWindow });
    }
    const model = a.model || 'unknown'; const mi = modelInfo(model);
    if (!out.models[mi.id]) out.models[mi.id] = { id: mi.id, label: mi.label, family: mi.family, version: mi.version, priced: !!mi.price, ctxWindow: mi.ctxWindow };
    const need = needs.get(a.id);
    let status = statusOf(a, now);
    if (need && status !== 'failed') status = 'waiting'; // held up by you: not running, not done
    let toolCalls = 0; for (const t of a.tools) if (t >= since) toolCalls++;
    const main = agents.get('s-' + a.sessionId);
    const ag = {
      id: a.id, taskId: a.sessionId, projectId: a.projDir, kind: a.kind,
      role: a.role, label: a.kind === 'main' ? (a.title || a.cmdTitle || a.slug || 'session ' + a.sessionId.slice(0, 8)) : (a.label || a.role),
      model, effort: a.effort || 'default', status,
      startedAt: Math.max(a.firstTs, since) === a.firstTs ? a.firstTs : a.firstTs, endedAt: status === 'done' || status === 'failed' ? a.lastTs : null,
      lastActivity: a.lastTs, input, output, cacheWrite: cw, cacheRead: cr, cache: cw + cr, tokens: input + output + cw + cr,
      cost, costKnown, toolCalls, tool: a.lastTool || '—', rate: recent / (RATE_WIN / 1000),
      ctx: Math.min(1, lastCtx / mi.ctxWindow), progress: status === 'done' ? 1 : Math.min(1, lastCtx / mi.ctxWindow),
      parentId: a.kind === 'sub' && main ? main.id : null, depth: a.meta ? a.meta.spawnDepth : 0,
    };
    ag.needsHuman = !!(need && status !== 'failed');
    ag.needReason = ag.needsHuman ? need.reason : null; ag.needSince = ag.needsHuman ? need.since : null;
    ag.activity = ag.needsHuman ? 'needs you · ' + need.reason : status === 'running' ? (a.lastTool ? 'using ' + a.lastTool : 'thinking') : status === 'waiting' ? 'idle ' + Math.round((now - a.lastTs) / 60e3) + 'm' : status === 'failed' ? 'API error' : 'finished';
    let t = byTask.get(a.sessionId);
    if (!t) { t = { id: a.sessionId, projectId: a.projDir, title: '', status: 'done', startedAt: 0, endedAt: null, agents: [] }; byTask.set(a.sessionId, t); }
    t.agents.push(ag);
    // events
    if (a.firstTs >= since) out.events.push({ id: a.id + ':start', t: a.firstTs, type: 'start', agentId: a.id, projectId: a.projDir, level: 'ok', text: `${a.kind === 'main' ? 'Session' : ag.role} started · ${modelInfo(model).label}` });
    if (status === 'done' && a.kind === 'sub') out.events.push({ id: a.id + ':done', t: a.lastTs, type: 'done', agentId: a.id, projectId: a.projDir, level: 'ok', text: `${ag.role} finished · ${fmtTok(ag.tokens)}` });
    if (status === 'failed') out.events.push({ id: a.id + ':failed', t: a.lastTs, type: 'failed', agentId: a.id, projectId: a.projDir, level: 'error', text: `${ag.role} FAILED · API error` });
    if (ag.needsHuman) out.events.push({ id: a.id + ':needs:' + need.reason + ':' + need.since, t: need.since, type: 'needs', agentId: a.id, projectId: a.projDir, level: 'human', text: `${a.kind === 'main' ? 'Session' : ag.role} needs you · ${need.reason}` });
    else if (status === 'waiting') out.events.push({ id: a.id + ':wait:' + a.lastTs, t: a.lastTs + RUN_MS, type: 'wait', agentId: a.id, projectId: a.projDir, level: 'warn', text: `${ag.role} idle, waiting` });
  }
  const projMap = new Map();
  for (const t of byTask.values()) {
    const main = agents.get('s-' + t.id);
    t.title = main ? (main.title || main.cmdTitle || main.slug || 'session ' + t.id.slice(0, 8)) : 'session ' + t.id.slice(0, 8);
    { const subs = []; for (const x of t.agents) if (x.kind === 'sub') { const sa = agents.get(x.id); if (sa) subs.push(sa); }
      const pid = sessionPid(main, subs); t.aicoId = pid ? pid.id : null; t.aicoIdSource = pid ? pid.src : null; }
    // arm order: main first, then startedAt ascending (missing last), tie -> id
    t.agents.sort((x, y) => ((y.kind === 'main') - (x.kind === 'main')) || ((x.startedAt || Infinity) - (y.startedAt || Infinity)) || (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));
    const nh = t.agents.filter(x => x.needsHuman);
    t.needsHuman = nh.length > 0; t.needReason = nh.length ? nh[0].needReason : null; t.needSince = nh.length ? Math.min(...nh.map(x => x.needSince || now)) : null;
    t.startedAt = Math.min(...t.agents.map(x => x.startedAt || now));
    const st = t.agents.map(x => x.status);
    t.status = st.includes('running') ? 'running' : st.includes('waiting') ? 'waiting' : st.includes('failed') && t.agents[0].status === 'failed' ? 'failed' : 'done';
    t.endedAt = t.status === 'done' || t.status === 'failed' ? Math.max(...t.agents.map(x => x.lastActivity)) : null;
    t.lastActivity = Math.max(...t.agents.map(x => x.lastActivity));
    { const oc = chats.get(t.id); t.owned = !!oc; t.chat = oc ? { alive: oc.alive, busy: oc.busy, pending: oc.pending.size } : null; const ep = ext.get(t.id); t.ext = ep && ep.size ? { pending: ep.size } : null;
      const ps = peerState.get(t.id); t.peer = !oc && procs.has(t.id) ? { live: true, canSend: ps ? ps.canSend : true } : null; } // flags only, never text
    // open = a live Claude Code process holds the session (~/.claude/sessions/<pid>.json, pid alive), else recent transcript activity
    t.openBy = procs.has(t.id) ? 'process' : now - t.lastActivity < OPEN_MS ? 'recent' : null;
    t.closed = !t.openBy; if (t.closed) t.endedAt = t.lastActivity;
    const p = projOf(t.projectId);
    let pj = projMap.get(p.id);
    if (!pj) { pj = { id: p.id, name: p.name, cwd: p.cwd || '', branch: p.branch || '', tasks: [], lastActivity: 0, needsHuman: 0 }; projMap.set(p.id, pj); }
    pj.tasks.push(t); pj.lastActivity = Math.max(pj.lastActivity, t.lastActivity); if (t.needsHuman) pj.needsHuman++;
  }
  // disambiguate equal names
  const seen = new Map(); for (const p of projMap.values()) seen.set(p.name, (seen.get(p.name) || 0) + 1);
  for (const p of projMap.values()) if (seen.get(p.name) > 1 && p.cwd) { const parts = p.cwd.split(/[\\/]/).filter(Boolean); p.name = parts.slice(-2).join('/'); }
  out.projects = [...projMap.values()].sort((a, b) => b.lastActivity - a.lastActivity);
  for (const p of out.projects) p.tasks.sort((a, b) => a.startedAt - b.startedAt);
  out.events.sort((a, b) => b.t - a.t); out.events = out.events.slice(0, 80);
  out.history = [...hist].map((v, i) => ({ t: hStart + (i + 1) * H_STEP, rate: v / (H_STEP / 1000) }));
  return out;
}
function fmtTok(n) { return n >= 1e6 ? (n / 1e6).toFixed(2) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'k' : String(Math.round(n)); }

const snapCache = new Map(); // hours -> {ver, at, json, body}
function snapshot(hours) {
  hours = Math.max(0.05, Math.min(MAX_HOURS, +hours || DEFAULT_HOURS));
  const since = Date.now() - hours * HOUR;
  if (since < loadedSince) { loadedSince = since; rescanAt = 0; pump(); }
  const c = snapCache.get(hours);
  if (c && c.ver === version && Date.now() - c.at < 4000) return c;
  const s = buildSnapshot(hours);
  const { now, ...stable } = s; // eslint-disable-line no-unused-vars
  const body = JSON.stringify(stable);
  const json = JSON.stringify(s);
  const r = { ver: version, at: Date.now(), json, body };
  snapCache.set(hours, r); return r;
}

// ───────────── owned chat sessions
// Sessions this server spawns itself (claude -p, stream-json both ways, --permission-prompt-tool stdio).
// Only these get their message text sent to the browser. Terminal/desktop sessions stay title-only.
// No shell, and no user text in argv: the prompt and every message go over stdin; model/effort are whitelisted.
const TOKEN = crypto.randomBytes(24).toString('hex'); // per run; embedded in index.html at serve time
const chats = new Map();                              // sessionId -> chat
const MAX_LIVE = 8, MAX_DEAD = 20, MAX_LOG = 600, MAX_TEXT = 20000, STOP_MS = 4000, START_MS = 30e3;
const MODEL_RE = /^(haiku|sonnet|opus|claude-[a-z0-9][a-z0-9.-]{0,60})$/;
const EFFORTS = new Set(['low', 'medium', 'high', 'xhigh', 'max']);
const clip = (s, n) => { s = String(s == null ? '' : s); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
class HttpErr extends Error { constructor(code, msg) { super(msg); this.code = code; } }

function findClaude() {
  const exe = process.platform === 'win32' ? 'claude.exe' : 'claude';
  const isFile = p => { try { return fs.statSync(p).isFile(); } catch { return false; } };
  if (process.env.CLAUDE_BIN && isFile(process.env.CLAUDE_BIN)) return process.env.CLAUDE_BIN;
  for (const d of (process.env.PATH || '').split(path.delimiter)) { if (!d) continue; const p = path.join(d, exe); if (isFile(p)) return p; }
  return path.join(os.homedir(), '.local', 'bin', exe);
}
function validCwd(cwd) {
  if (typeof cwd !== 'string' || !cwd || cwd.length > 600 || cwd.includes('\0')) throw new HttpErr(400, 'cwd must be an absolute path');
  if (!path.isAbsolute(cwd) || /^[\\/]{2}/.test(cwd)) throw new HttpErr(400, 'cwd must be a local absolute path');
  const r = path.resolve(cwd);
  let st; try { st = fs.statSync(r); } catch { throw new HttpErr(400, 'cwd does not exist'); }
  if (!st.isDirectory()) throw new HttpErr(400, 'cwd is not a directory');
  return r;
}
function toolSummary(name, inp) {
  inp = inp && typeof inp === 'object' ? inp : {};
  if (name === 'AskUserQuestion') return clip(inp.questions && inp.questions[0] && inp.questions[0].question || '', 100);
  const v = inp.command || inp.file_path || inp.path || inp.pattern || inp.url || inp.query || inp.description || inp.prompt || '';
  return clip(String(v).replace(/\s+/g, ' '), 100);
}
function metaOf(c) {
  return { id: c.id, cwd: c.cwd, model: c.model || 'default', effort: c.effort || 'default', alive: c.alive, busy: c.busy, cost: c.cost, startedAt: c.startedAt,
    pending: [...c.pending.values()].map(r => ({ request_id: r.request_id, tool_name: r.tool_name, display_name: r.display_name, description: r.description, ts: r.ts,
      summary: toolSummary(r.tool_name, r.input), questions: r.tool_name === 'AskUserQuestion' ? r.input.questions : null,
      preview: r.tool_name === 'AskUserQuestion' ? '' : clip(JSON.stringify(r.input, null, 1), 1500) })) };
}
function sse(res, event, data) { try { res.write('event: ' + event + '\ndata: ' + JSON.stringify(data) + '\n\n'); } catch { } }
function emit(c, event, data) { for (const r of c.listeners) sse(r, event, data); }
function addEntry(c, e) {
  e.i = ++c.seq; e.ts = Date.now(); c.log.push(e); if (c.log.length > MAX_LOG) c.log.shift();
  emit(c, 'entry', e);
}
function touch(c) { version++; emit(c, 'meta', metaOf(c)); }

function chatWrite(c, obj) {
  if (!c.alive || !c.proc.stdin.writable) throw new HttpErr(409, 'session is not running');
  c.proc.stdin.write(JSON.stringify(obj) + '\n');
}
function onLine(c, line) {
  let o; try { o = JSON.parse(line); } catch { return; }
  if (!o || typeof o !== 'object') return;
  if (o.session_id && !c.id) { c.id = String(o.session_id); chats.set(c.id, c); if (c.onId) { c.onId(c); c.onId = null; } }
  if (o.type === 'system' && o.subtype === 'init') { if (o.model) c.model = String(o.model); touch(c); return; }
  if (o.type === 'assistant' && o.message && Array.isArray(o.message.content)) {
    for (const b of o.message.content) {
      if (!b) continue;
      if (b.type === 'text' && b.text && b.text.trim()) addEntry(c, { kind: 'assistant', text: clip(b.text, MAX_TEXT) });
      else if (b.type === 'tool_use') addEntry(c, { kind: 'tool', name: clip(b.name, 60), text: toolSummary(b.name, b.input) });
    }
    return;
  }
  if (o.type === 'result') {
    c.busy = false; if (typeof o.total_cost_usd === 'number') c.cost = o.total_cost_usd;
    addEntry(c, { kind: 'result', error: !!o.is_error, cost: c.cost, ms: +o.duration_ms || 0, text: o.is_error ? clip(o.result || o.subtype || 'error', 300) : '' });
    touch(c); return;
  }
  if (o.type === 'control_request' && o.request && o.request.subtype === 'can_use_tool' && o.request_id) {
    const q = o.request, input = q.input && typeof q.input === 'object' ? q.input : {};
    const r = { request_id: String(o.request_id), tool_name: String(q.tool_name || ''), display_name: String(q.display_name || q.tool_name || ''), description: clip(q.description || '', 600), input, ts: Date.now() };
    c.pending.set(r.request_id, r);
    addEntry(c, { kind: 'request', name: r.display_name, text: r.tool_name === 'AskUserQuestion' ? 'asks a question' : (r.description || toolSummary(r.tool_name, input)), request_id: r.request_id });
    touch(c); return;
  }
  if (o.type === 'control_cancel_request' && o.request_id) { if (c.pending.delete(String(o.request_id))) touch(c); return; }
}
function chatStart(b) {
  if (!b || typeof b !== 'object') throw new HttpErr(400, 'bad body');
  const cwd = validCwd(b.cwd);
  const model = b.model ? String(b.model) : '', effort = b.effort ? String(b.effort) : '';
  if (model && !MODEL_RE.test(model)) throw new HttpErr(400, 'bad model');
  if (effort && !EFFORTS.has(effort)) throw new HttpErr(400, 'bad effort');
  const prompt = typeof b.prompt === 'string' ? b.prompt.trim() : '';
  if (!prompt || prompt.length > 50000) throw new HttpErr(400, 'prompt required (max 50000 chars)');
  let live = 0; for (const c of chats.values()) if (c.alive) live++;
  if (live >= MAX_LIVE) throw new HttpErr(429, 'too many running sessions');
  const args = ['-p', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose', '--permission-prompt-tool', 'stdio'];
  if (model) args.push('--model', model);
  if (effort) args.push('--effort', effort);
  return new Promise((resolve, reject) => {
    const c = { id: '', cwd, model, effort, proc: null, alive: true, busy: true, cost: 0, startedAt: Date.now(), log: [], seq: 0, pending: new Map(), listeners: new Set(), buf: '', stopping: false, stopTimer: null, onId: null };
    let proc; try { proc = spawn(findClaude(), args, { cwd, shell: false, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] }); } catch (e) { return reject(new HttpErr(500, 'cannot start claude: ' + e.message)); }
    c.proc = proc;
    let settled = false, errTail = '';
    const fail = (m) => { if (settled) return; settled = true; clearTimeout(tm); killTree(c); reject(new HttpErr(502, m)); };
    const tm = setTimeout(() => fail('claude did not answer in time'), START_MS);
    c.onId = () => { if (settled) return; settled = true; clearTimeout(tm); resolve(c); };
    proc.stdin.on('error', () => { });
    proc.stdout.setEncoding('utf8');
    proc.stdout.on('data', d => { c.buf += d; let i; while ((i = c.buf.indexOf('\n')) >= 0) { const l = c.buf.slice(0, i); c.buf = c.buf.slice(i + 1); if (l.trim()) onLine(c, l); } });
    proc.stderr.on('data', d => { errTail = (errTail + d).slice(-300); });
    proc.on('error', e => fail('cannot start claude: ' + e.message));
    proc.on('exit', (code, sig) => {
      c.alive = false; c.busy = false; c.pending.clear(); clearTimeout(c.stopTimer);
      if (!settled) return fail('claude exited before it started (code ' + code + ')' + (errTail ? ': ' + errTail.trim() : ''));
      addEntry(c, { kind: 'system', text: c.stopping ? 'session stopped' : 'session ended (' + (sig || 'code ' + code) + ')' + (code && errTail ? ': ' + errTail.trim() : '') });
      touch(c); pruneDead();
    });
    const msg = { type: 'user', message: { role: 'user', content: prompt } };
    proc.stdin.write(JSON.stringify(msg) + '\n');
    c.log.push({ i: ++c.seq, ts: Date.now(), kind: 'user', text: clip(prompt, MAX_TEXT) });
  });
}
function killTree(c) {
  if (!c.proc || c.proc.exitCode !== null || c.proc.signalCode) return;
  if (process.platform === 'win32' && c.proc.pid) { try { spawn('taskkill', ['/PID', String(c.proc.pid), '/T', '/F'], { shell: false, windowsHide: true, stdio: 'ignore' }).on('error', () => { }); } catch { } }
  else try { c.proc.kill('SIGKILL'); } catch { }
}
function chatStop(c) { // clean end: close stdin, kill only if it lingers
  if (!c.alive || c.stopping) return; c.stopping = true;
  try { c.proc.stdin.end(); } catch { }
  c.stopTimer = setTimeout(() => killTree(c), STOP_MS);
}
function chatSend(c, text) {
  text = typeof text === 'string' ? text.trim() : '';
  if (!text || text.length > 50000) throw new HttpErr(400, 'text required (max 50000 chars)');
  chatWrite(c, { type: 'user', message: { role: 'user', content: text } });
  c.busy = true; addEntry(c, { kind: 'user', text: clip(text, MAX_TEXT) }); touch(c);
}
function validAnswers(input, a) {
  const qs = Array.isArray(input.questions) ? input.questions : [], known = new Set(qs.map(q => q.question));
  if (!a || typeof a !== 'object' || Array.isArray(a)) throw new HttpErr(400, 'answers required');
  const answers = {}; for (const k of Object.keys(a)) { if (!known.has(k) || typeof a[k] !== 'string' || a[k].length > 2000) throw new HttpErr(400, 'bad answers'); answers[k] = a[k]; }
  return answers;
}
function chatAnswer(c, b) {
  const r = c.pending.get(String(b.request_id || ''));
  if (!r) throw new HttpErr(404, 'no such pending request');
  let resp;
  if (b.behavior === 'allow') {
    let updatedInput = r.input;
    if (r.tool_name === 'AskUserQuestion') {
      updatedInput = Object.assign({}, r.input, { answers: validAnswers(r.input, b.answers) });
    }
    resp = { behavior: 'allow', updatedInput };
  } else if (b.behavior === 'deny') resp = { behavior: 'deny', message: clip(typeof b.message === 'string' && b.message.trim() ? b.message : 'Denied from the dashboard', 500) };
  else throw new HttpErr(400, 'behavior must be allow or deny');
  chatWrite(c, { type: 'control_response', response: { subtype: 'success', request_id: r.request_id, response: resp } });
  c.pending.delete(r.request_id);
  addEntry(c, { kind: 'answer', name: r.display_name, text: resp.behavior === 'allow' ? (r.tool_name === 'AskUserQuestion' ? 'answered' : 'allowed') : 'denied' });
  touch(c);
}
function pruneDead() { const dead = [...chats.values()].filter(c => !c.alive); while (dead.length > MAX_DEAD) { const c = dead.shift(); chats.delete(c.id); version++; } }
let shuttingDown = false;
function shutdown() {
  if (shuttingDown) return; shuttingDown = true;
  const live = [...chats.values()].filter(c => c.alive); for (const c of live) chatStop(c);
  const done = () => { for (const c of chats.values()) killTree(c); process.exit(0); };
  if (!live.length) return done();
  const t = setInterval(() => { if (![...chats.values()].some(c => c.alive)) { clearInterval(t); done(); } }, 100);
  setTimeout(done, STOP_MS + 800);
}
process.on('SIGINT', shutdown); process.on('SIGTERM', shutdown); process.on('SIGBREAK', shutdown);
process.on('exit', () => { for (const c of chats.values()) killTree(c); });

// request guards: Host/Origin must be loopback on our port (blocks DNS rebinding + cross-site), token for anything that acts or reads chat
const HOST_RE = new RegExp('^(127\\.0\\.0\\.1|localhost):' + PORT + '$');
const hostOk = req => HOST_RE.test(String(req.headers.host || ''));
const originOk = req => { const o = req.headers.origin; return o === undefined || (typeof o === 'string' && o.startsWith('http://') && HOST_RE.test(o.slice(7))); };
function tokenOk(t) {
  const a = Buffer.from(String(t || '')), b = Buffer.from(TOKEN);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
function readJson(req) {
  return new Promise((resolve, reject) => {
    if (!/^application\/json\b/i.test(String(req.headers['content-type'] || ''))) return reject(new HttpErr(415, 'content-type must be application/json'));
    let n = 0; const parts = [];
    req.on('data', d => { n += d.length; if (n > 256 * 1024) { reject(new HttpErr(413, 'body too large')); req.destroy(); } else parts.push(d); });
    req.on('end', () => { try { resolve(JSON.parse(Buffer.concat(parts).toString('utf8') || '{}')); } catch { reject(new HttpErr(400, 'bad json')); } });
    req.on('error', () => reject(new HttpErr(400, 'bad request')));
  });
}
const sendJson = (res, code, o) => { res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify(o)); };
async function chatRoute(req, res, u) {
  try {
    const m = /^\/api\/chat\/([\w-]{1,64})\/(send|answer|stop|stream)$/.exec(u.pathname);
    const isStart = u.pathname === '/api/chat/start';
    if (!isStart && !m) return sendJson(res, 404, { error: 'not found' });
    if (m && m[2] === 'stream') {
      if (req.method !== 'GET') return sendJson(res, 405, { error: 'GET only' });
      if (!tokenOk(u.searchParams.get('token'))) return sendJson(res, 403, { error: 'bad token' });
      const c = chats.get(m[1]); if (!c) return sendJson(res, 404, { error: 'not an owned session' });
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive', 'x-accel-buffering': 'no' });
      res.write('retry: 2000\n\n'); sse(res, 'init', { meta: metaOf(c), log: c.log });
      c.listeners.add(res); req.on('close', () => c.listeners.delete(res)); return;
    }
    if (req.method !== 'POST') return sendJson(res, 405, { error: 'POST only' });
    if (!tokenOk(req.headers['x-chat-token'])) return sendJson(res, 403, { error: 'bad token' });
    const body = await readJson(req);
    if (isStart) { const c = await chatStart(body); return sendJson(res, 200, { id: c.id, meta: metaOf(c) }); }
    const c = chats.get(m[1]); if (!c) return sendJson(res, 404, { error: 'not an owned session' });
    if (m[2] === 'send') chatSend(c, body.text);
    else if (m[2] === 'answer') chatAnswer(c, body);
    else chatStop(c);
    return sendJson(res, 200, { ok: true });
  } catch (e) {
    if (e instanceof HttpErr) return sendJson(res, e.code, { error: e.message });
    console.error('chat error', e); return sendJson(res, 500, { error: 'internal error' });
  }
}

// ───────────── external prompts (terminal/desktop sessions, answered through the global http hooks)
// POST /hook/permission (PermissionRequest) and POST /hook/pretool (PreToolUse, AskUserQuestion only, behind --ask-hook)
// register a pending prompt and hold the HTTP response open. First answer wins: the terminal dialog is shown at the same
// time, so the card clears (and the hook is released with an empty 200 = "no decision") when the session moves on.
// Anything uncertain answers empty: that only ever hands the decision back to the terminal.
const ext = new Map();           // sessionId -> Map(id -> prompt)
const extListeners = new Map();  // sessionId -> Set(res) (SSE for the detail card)
const MAX_EXT = 20, EXT_GRACE = 1500;
const SID_RE = /^[\w-]{1,64}$/;
const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
function extSummary(name, inp) {
  inp = inp && typeof inp === 'object' ? inp : {};
  const v = inp.command || inp.file_path || inp.notebook_path || inp.path || inp.pattern || inp.url || inp.query || inp.description || inp.prompt;
  return clip(String(v != null ? v : Object.keys(inp).slice(0, 6).join(', ')).replace(/\s+/g, ' '), 200);
}
function cleanQuestions(qs) {
  if (!Array.isArray(qs) || !qs.length || qs.length > 4) return null;
  const out = [];
  for (const q of qs) {
    if (!q || typeof q.question !== 'string' || !q.question || q.question.length > 500 || !Array.isArray(q.options) || q.options.length > 12) return null;
    out.push({ question: q.question, header: clip(q.header || '', 40), multiSelect: !!q.multiSelect,
      options: q.options.map(o => ({ label: clip(o && o.label, 200), description: clip(o && o.description, 300) })) });
  }
  return out;
}
function extMeta(sid) {
  const m = ext.get(sid);
  return { pending: m ? [...m.values()].map(p => ({ id: p.id, kind: p.kind, tool_name: p.tool_name, summary: p.summary, ts: p.ts, questions: p.kind === 'ask' ? p.questions : null })) : [] };
}
function extTouch(sid) { version++; const ls = extListeners.get(sid); if (ls) for (const r of ls) sse(r, 'meta', extMeta(sid)); }
function extFinish(p, out) { // out = hook JSON, or null for "no decision"
  if (p.done) return; p.done = true; clearTimeout(p.timer);
  const m = ext.get(p.sid); if (m) { m.delete(p.id); if (!m.size) ext.delete(p.sid); }
  const res = p.res;
  if (!res.writableEnded && !res.destroyed) { try { res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(out ? JSON.stringify(out) : ''); } catch { } }
  extTouch(p.sid);
}
function sessionLines(sid) { let n = 0; for (const a of agents.values()) if (a.sessionId === sid) n += a.nl || 0; return n; }
function extSweep() { // called every pump (1s): release prompts the terminal already settled
  if (!ext.size || process.env.AICO_DASH_NO_SWEEP) return; // NO_SWEEP: tests only
  const now = Date.now();
  for (const [sid, m] of [...ext]) for (const p of [...m.values()]) {
    const age = now - p.ts; if (age < EXT_GRACE) continue;
    const ls = live && live.get(sid);
    if (live !== null && !ls) { extFinish(p, null); continue; }                 // the Claude process is gone
    if (p.base === null) p.base = sessionLines(sid);
    if (ls && ls.status === 'waiting') p.sawWaiting = true;
    else if (ls && p.sawWaiting) { extFinish(p, null); continue; }              // was waiting, now busy/idle: answered elsewhere
    if (sessionLines(sid) > p.base) extFinish(p, null);                          // transcript moved on (tool result, new prompt)
  }
}
function extAnswer(sid, b) {
  const m = ext.get(sid), p = m && m.get(String(b.id || ''));
  if (!p) throw new HttpErr(404, 'no such pending prompt (already answered elsewhere?)');
  let out;
  if (b.behavior !== 'allow' && b.behavior !== 'deny') throw new HttpErr(400, 'behavior must be allow or deny');
  const msg = clip(typeof b.message === 'string' && b.message.trim() ? b.message : 'Denied from the dashboard', 500);
  if (p.kind === 'perm') out = { hookSpecificOutput: { hookEventName: 'PermissionRequest', decision: b.behavior === 'allow' ? { behavior: 'allow' } : { behavior: 'deny', message: msg } } };
  else if (b.behavior === 'allow') out = { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'allow', updatedInput: Object.assign({}, p.input, { answers: validAnswers(p.input, b.answers) }) } };
  else out = { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: typeof b.message === 'string' && b.message.trim() ? msg : 'The user declined to answer from the dashboard.' } };
  extFinish(p, out);
}
async function hookRoute(req, res, u) {
  const empty = () => { if (!res.writableEnded) { res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(''); } };
  try {
    if (req.method !== 'POST') return sendJson(res, 405, { error: 'POST only' });
    if (!LOOPBACK.has(req.socket.remoteAddress)) return sendJson(res, 403, { error: 'loopback only' });
    const pre = u.pathname === '/hook/pretool';
    const b = await readJson(req);
    const sid = typeof b.session_id === 'string' ? b.session_id : '', tool = typeof b.tool_name === 'string' ? b.tool_name.slice(0, 100) : '';
    // never interfere: switched off, odd body, dashboard-owned session (answered over stdio), too many open prompts
    if (!HOOK_ON || !SID_RE.test(sid) || !tool || chats.has(sid) || (ext.get(sid) || { size: 0 }).size >= 8 || [...ext.values()].reduce((n, m) => n + m.size, 0) >= MAX_EXT) return empty();
    const input = b.tool_input && typeof b.tool_input === 'object' ? b.tool_input : {};
    let kind = 'perm', questions = null;
    if (pre) { // AskUserQuestion only, and only when switched on
      if (!HOOK_ASK || tool !== 'AskUserQuestion') return empty();
      questions = cleanQuestions(input.questions); if (!questions) return empty(); kind = 'ask';
    } else if (tool === 'AskUserQuestion') return empty(); // a question is not an Allow/Deny prompt
    const p = { id: crypto.randomBytes(8).toString('hex'), sid, kind, tool_name: clip(tool, 100), summary: kind === 'ask' ? clip(questions[0].question, 200) : extSummary(tool, input),
      questions, input: null, ts: Date.now(), res, timer: null, done: false, base: null, sawWaiting: false };
    if (kind === 'ask') p.input = input; // the full input is needed to echo updatedInput; never sent to the browser
    p.timer = setTimeout(() => extFinish(p, null), HOOK_HOLD_MS);
    res.on('close', () => extFinish(p, null));  // hook gone (claude exited / hook timed out): drop the card
    let m = ext.get(sid); if (!m) ext.set(sid, m = new Map()); m.set(p.id, p);
    extTouch(sid);
  } catch (e) {
    if (e instanceof HttpErr) return sendJson(res, e.code, { error: e.message });
    console.error('hook error', e); return empty();
  }
}
async function extRoute(req, res, u) {
  try {
    const m = /^\/api\/ext\/([\w-]{1,64})\/(answer|stream)$/.exec(u.pathname);
    if (!m) return sendJson(res, 404, { error: 'not found' });
    if (m[2] === 'stream') {
      if (req.method !== 'GET') return sendJson(res, 405, { error: 'GET only' });
      if (!tokenOk(u.searchParams.get('token'))) return sendJson(res, 403, { error: 'bad token' });
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive', 'x-accel-buffering': 'no' });
      res.write('retry: 2000\n\n'); sse(res, 'meta', extMeta(m[1]));
      let ls = extListeners.get(m[1]); if (!ls) extListeners.set(m[1], ls = new Set()); ls.add(res);
      req.on('close', () => { ls.delete(res); if (!ls.size) extListeners.delete(m[1]); }); return;
    }
    if (req.method !== 'POST') return sendJson(res, 405, { error: 'POST only' });
    if (!tokenOk(req.headers['x-chat-token'])) return sendJson(res, 403, { error: 'bad token' });
    extAnswer(m[1], await readJson(req));
    return sendJson(res, 200, { ok: true });
  } catch (e) {
    if (e instanceof HttpErr) return sendJson(res, e.code, { error: e.message });
    console.error('ext error', e); return sendJson(res, 500, { error: 'internal error' });
  }
}

// ───────────── peer chat (terminal/desktop sessions, over their local messaging pipe)
// Every live Claude Code session listens on a pipe named in ~/.claude/sessions/<pid>.json (messagingSocketPath).
// We write NDJSON: {"type":"auth","token":<peerToken from <pid>.<64hex>.key>} then one {"type":"user",...} line.
// The session shows it as a message from another Claude session (a teammate, never the user's approval).
// The peer token is read per send and only ever written to that pipe: never logged, cached or sent to the page.
const PEER_PIPE_RE = /^\\\\\.\\pipe\\LOCAL\\cc-msg-[0-9a-f]{32}$/;
const PEER_TOKEN_RE = /^[0-9a-f]{32}$/;
const PEER_MAX_TEXT = 50000, PEER_SEND_MS = 5000, PEER_RATE_MS = 1000, PEER_SENT = 50;
const peerState = new Map(); // sessionId -> {canSend, lastSend, sentTexts, seen}
function peerOf(sid) { let s = peerState.get(sid); if (!s) peerState.set(sid, s = { canSend: true, lastSend: 0, sentTexts: [], seen: '' }); return s; }
function peerPipeOk(p) {
  if (typeof p !== 'string' || !p) return false;
  if (process.platform === 'win32') return PEER_PIPE_RE.test(p);
  const r = path.resolve(p); return path.dirname(r) === SESS_DIR && /^cc-msg-[\w.-]{1,80}$/.test(path.basename(r));
}
function peerTarget(sid) { // -> {pid, pipe, cwd, entrypoint, status} | null: a live session with a valid pipe, read fresh
  let names; try { names = fs.readdirSync(SESS_DIR).filter(n => /^\d+\.json$/.test(n)); } catch { return null; }
  let best = null;
  for (const n of names) {
    let o; try { o = JSON.parse(fs.readFileSync(path.join(SESS_DIR, n), 'utf8')); } catch { continue; }
    if (!o || String(o.sessionId) !== sid || !Number.isInteger(o.pid) || o.pid <= 0 || !alive(o.pid) || !peerPipeOk(o.messagingSocketPath)) continue;
    const at = +o.startedAt || 0;
    if (!best || at > best.at) best = { pid: o.pid, pipe: o.messagingSocketPath, cwd: String(o.cwd || ''), entrypoint: String(o.entrypoint || ''), status: String(o.status || ''), at };
  }
  if (best) delete best.at;
  return best;
}
function peerKey(pid) { // -> peerToken | null. Newest <pid>.<64hex>.key; never cached
  const re = new RegExp('^' + pid + '\\.[0-9a-f]{64}\\.key$');
  let names; try { names = fs.readdirSync(SESS_DIR).filter(n => re.test(n)); } catch { return null; }
  let best = null, at = -1;
  for (const n of names) { try { const m = fs.statSync(path.join(SESS_DIR, n)).mtimeMs; if (m > at) { at = m; best = n; } } catch { } }
  if (!best) return null;
  try { const k = JSON.parse(fs.readFileSync(path.join(SESS_DIR, best), 'utf8')); return k && typeof k.peerToken === 'string' && PEER_TOKEN_RE.test(k.peerToken) ? k.peerToken : null; } catch { return null; }
}
function peerSend(target, text, priority) { // resolves when the session closed the pipe cleanly; rejects HttpErr(502)
  return new Promise((resolve, reject) => {
    const tk = peerKey(target.pid);
    if (!tk) return reject(new HttpErr(502, 'session key unavailable'));
    const payload = JSON.stringify({ type: 'auth', token: tk }) + '\n' + JSON.stringify({ type: 'user', message: { role: 'user', content: text }, priority }) + '\n';
    let done = false, timer = null;
    const sock = net.connect(target.pipe, () => { sock.end(payload); });
    const finish = why => { if (done) return; done = true; clearTimeout(timer); if (why) { sock.destroy(); reject(new HttpErr(502, why)); } else resolve(); };
    timer = setTimeout(() => finish('session did not take the message in time'), PEER_SEND_MS);
    sock.on('data', () => { }); // nothing is expected back
    sock.on('error', e => finish('session pipe refused the message (' + (e.code || 'error') + ')'));
    sock.on('close', hadErr => finish(hadErr ? 'session pipe closed with an error' : null));
  });
}
function peerSeen(sid, pid, status) { // from readLive: a session that changed state may accept messages again
  const s = peerState.get(sid); if (!s) return;
  const k = pid + ':' + status; if (s.seen !== k) { s.seen = k; if (!s.canSend) { s.canSend = true; version++; } }
}
// conversation stream: one tail per session while at least one chat panel listens; read from the transcript.
// Only user text, peer messages, assistant text and tool name + short summary. No tool input beyond that, no tool output.
const PEER_LOG = 200, PEER_LINE_MAX = 1 << 20, PEER_INIT_BYTES = 16 << 20, PEER_CHUNK = 8 << 20;
const PEER_HEAD = 'Another Claude session sent a message:\n', PEER_TAIL = '\n\nThis came from another Claude session';
const peerTails = new Map(); // sessionId -> {sid, fp, offset, carry, skip, log, seq, listeners, meta, live}
function peerText(content) { // user text blocks only (tool_result blocks are skipped)
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content.filter(b => b && b.type === 'text' && typeof b.text === 'string').map(b => b.text).join('\n');
}
function peerEntries(line, sent) { // one transcript line -> entries (no i/ts yet)
  if (typeof line !== 'string' || line.length > PEER_LINE_MAX) return [];
  let o; try { o = JSON.parse(line); } catch { return []; }
  if (!o || typeof o !== 'object' || !o.message || o.isSidechain) return [];
  const at = Date.parse(o.timestamp) || Date.now(), out = [];
  if (o.type === 'user') {
    let text = peerText(o.message.content);
    if (o.isMeta) {
      if (!o.origin || o.origin.kind !== 'peer' || !text) return [];
      if (text.startsWith(PEER_HEAD)) { text = text.slice(PEER_HEAD.length); const k = text.lastIndexOf(PEER_TAIL); if (k >= 0) text = text.slice(0, k); }
      const mine = Array.isArray(sent) && sent.some(s => s === text || s.trim() === text.trim());
      out.push({ kind: 'peer', via: mine ? 'dashboard' : 'session', text: clip(text, MAX_TEXT), at });
    } else if (text.trim() && !text.trimStart().startsWith('<') && !o.isCompactSummary) out.push({ kind: 'user', text: clip(text, MAX_TEXT), at });
  } else if (o.type === 'assistant' && Array.isArray(o.message.content)) {
    for (const b of o.message.content) {
      if (!b) continue;
      if (b.type === 'text' && typeof b.text === 'string' && b.text.trim()) out.push({ kind: 'assistant', text: clip(b.text, MAX_TEXT), at });
      else if (b.type === 'tool_use') out.push({ kind: 'tool', name: clip(b.name, 60), text: toolSummary(b.name, b.input), at });
    }
  }
  return out;
}
function peerFile(sid) { // the session's main transcript: tracked file first, else ROOT/*/<sid>.jsonl
  for (const f of files.values()) if (f.kind === 'main' && f.agent.sessionId === sid) return f.path;
  let ds; try { ds = fs.readdirSync(ROOT, { withFileTypes: true }); } catch { return null; }
  for (const d of ds) { if (!d.isDirectory()) continue; const fp = path.join(ROOT, d.name, sid + '.jsonl'); try { if (fs.statSync(fp).isFile()) return fp; } catch { } }
  return null;
}
function tailRead(t) { // new complete lines since t.offset -> entries; lines over PEER_LINE_MAX are skipped unparsed
  let st; try { st = fs.statSync(t.fp); } catch { return []; }
  if (st.size < t.offset) { t.offset = 0; t.carry = null; t.skip = false; } // replaced or truncated
  if (st.size === t.offset) return [];
  const len = Math.min(st.size - t.offset, PEER_CHUNK), buf = Buffer.alloc(len);
  let fd = null; try { fd = fs.openSync(t.fp, 'r'); fs.readSync(fd, buf, 0, len, t.offset); } catch { return []; } finally { if (fd !== null) try { fs.closeSync(fd); } catch { } }
  t.offset += len;
  const out = [], sent = (peerState.get(t.sid) || {}).sentTexts;
  let start = 0, nl;
  while ((nl = buf.indexOf(10, start)) !== -1) {
    const part = buf.subarray(start, nl); start = nl + 1;
    if (t.skip) { t.skip = false; t.carry = null; continue; }
    const line = t.carry ? Buffer.concat([t.carry, part]) : part; t.carry = null;
    if (line.length <= PEER_LINE_MAX) for (const e of peerEntries(line.toString('utf8'), sent)) out.push(e);
  }
  if (start < buf.length && !t.skip) {
    const rest = t.carry ? Buffer.concat([t.carry, buf.subarray(start)]) : Buffer.from(buf.subarray(start));
    if (rest.length > PEER_LINE_MAX) { t.skip = true; t.carry = null; } else t.carry = rest;
  }
  return out;
}
function tailAdd(t, e) { e.i = ++t.seq; e.ts = e.at; delete e.at; t.log.push(e); if (t.log.length > PEER_LOG) t.log.shift(); return e; }
function tailMeta(t) {
  const target = peerTarget(t.sid), ps = peerState.get(t.sid), lv = live && live.get(t.sid);
  return { live: !!target || procs.has(t.sid), canSend: !!target && (ps ? ps.canSend : true), status: lv ? lv.status : target ? target.status : '', entrypoint: target ? target.entrypoint : '' };
}
function tailOpen(sid) {
  const t = { sid, fp: peerFile(sid), offset: 0, carry: null, skip: false, log: [], seq: 0, listeners: new Set(), meta: null, live: false };
  if (t.fp) {
    try { const size = fs.statSync(t.fp).size; if (size > PEER_INIT_BYTES) { t.offset = size - PEER_INIT_BYTES; t.skip = true; } } catch { }
    for (let n = 0; n < 8; n++) { const es = tailRead(t); for (const e of es) tailAdd(t, e); if (!es.length && !t.carry) break; }
  }
  t.meta = tailMeta(t); t.live = t.meta.live;
  peerTails.set(sid, t); return t;
}
function peerTick() { // every second: new transcript lines and state changes to the open panels
  for (const t of peerTails.values()) {
    if (!t.fp) t.fp = peerFile(t.sid);
    if (t.fp) for (const e of tailRead(t)) { tailAdd(t, e); for (const r of t.listeners) sse(r, 'entry', e); }
    const m = tailMeta(t);
    if (JSON.stringify(m) !== JSON.stringify(t.meta)) {
      t.meta = m; for (const r of t.listeners) sse(r, 'meta', m);
      if (t.live && !m.live) { const e = tailAdd(t, { kind: 'system', text: 'Session closed', at: Date.now() }); for (const r of t.listeners) sse(r, 'entry', e); }
      t.live = m.live;
    }
  }
}
async function peerRoute(req, res, u) {
  try {
    const m = /^\/api\/peer\/([\w-]{1,64})\/(send|stream)$/.exec(u.pathname);
    if (!m) return sendJson(res, 404, { error: 'not found' });
    const sid = m[1];
    if (m[2] === 'stream') {
      if (req.method !== 'GET') return sendJson(res, 405, { error: 'GET only' });
      if (!tokenOk(u.searchParams.get('token'))) return sendJson(res, 403, { error: 'bad token' });
      if (chats.has(sid)) return sendJson(res, 404, { error: 'owned session: use /api/chat' });
      let t = peerTails.get(sid);
      if (!t && !peerTarget(sid) && !peerFile(sid)) return sendJson(res, 404, { error: 'no terminal or desktop session with this id' });
      if (!t) t = tailOpen(sid);
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive', 'x-accel-buffering': 'no' });
      res.write('retry: 2000\n\n'); sse(res, 'init', { meta: t.meta, log: t.log });
      t.listeners.add(res);
      req.on('close', () => { t.listeners.delete(res); if (!t.listeners.size && peerTails.get(sid) === t) peerTails.delete(sid); });
      return;
    }
    if (req.method !== 'POST') return sendJson(res, 405, { error: 'POST only' });
    if (!tokenOk(req.headers['x-chat-token'])) return sendJson(res, 403, { error: 'bad token' });
    const body = await readJson(req) || {};
    const text = body.text, priority = body.priority === undefined ? 'next' : body.priority;
    if (typeof text !== 'string' || !text.length || text.length > PEER_MAX_TEXT) throw new HttpErr(400, 'text must be 1-' + PEER_MAX_TEXT + ' characters');
    if (priority !== 'next' && priority !== 'now') throw new HttpErr(400, 'priority must be "next" or "now"');
    if (chats.has(sid)) throw new HttpErr(404, 'owned session: use /api/chat');
    const target = peerTarget(sid); if (!target) throw new HttpErr(404, 'no live terminal or desktop session with this id');
    const st = peerOf(sid), now = Date.now();
    if (now - st.lastSend < PEER_RATE_MS) throw new HttpErr(429, 'one message per second');
    st.lastSend = now; st.seen = target.pid + ':' + target.status;
    try { await peerSend(target, text, priority); } catch (e) { if (st.canSend) { st.canSend = false; version++; } throw e; }
    if (!st.canSend) { st.canSend = true; version++; }
    st.sentTexts.push(text); if (st.sentTexts.length > PEER_SENT) st.sentTexts.shift();
    return sendJson(res, 200, { ok: true });
  } catch (e) {
    if (e instanceof HttpErr) return sendJson(res, e.code, { error: e.message });
    console.error('peer error:', e && e.message); return sendJson(res, 500, { error: 'internal error' });
  }
}

// ───────────── http
const MIME ={ '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.md': 'text/plain; charset=utf-8' };
const STATIC = new Set(['index.html', 'live-data.js', 'chat.js', 'chat.css']);
const clients = new Set();
const server = http.createServer((req, res) => {
  if (!hostOk(req) || !originOk(req)) { res.writeHead(403, { 'content-type': 'text/plain' }); res.end('forbidden'); return; }
  const u = new URL(req.url, 'http://localhost');
  if (u.pathname.startsWith('/api/chat/')) { chatRoute(req, res, u); return; }
  if (u.pathname.startsWith('/api/ext/')) { extRoute(req, res, u); return; }
  if (u.pathname.startsWith('/api/peer/')) { peerRoute(req, res, u); return; }
  if (u.pathname === '/hook/permission' || u.pathname === '/hook/pretool') { hookRoute(req, res, u); return; }
  const hours = u.searchParams.get('hours') || DEFAULT_HOURS;
  if (u.pathname === '/api/state') {
    const s = snapshot(hours);
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(s.json); return;
  }
  if (u.pathname === '/api/stream') {
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive', 'x-accel-buffering': 'no' });
    res.write('retry: 2000\n\n');
    const c = { res, hours: +hours, last: '' }; clients.add(c); push(c);
    req.on('close', () => clients.delete(c));
    return;
  }
  if (u.pathname === '/favicon.ico') { res.writeHead(204); res.end(); return; }
  const name = u.pathname === '/' ? 'index.html' : u.pathname.slice(1);
  if (STATIC.has(name)) {
    fs.readFile(path.join(HERE, name), (err, buf) => {
      if (err) { res.writeHead(404); res.end('not found'); return; }
      if (name === 'index.html') buf = Buffer.from(buf.toString('utf8').replace('</head>', `<meta name="chat-token" content="${TOKEN}">\n</head>`));
      res.writeHead(200, { 'content-type': MIME[path.extname(name)] || 'application/octet-stream', 'cache-control': 'no-store' }); res.end(buf);
    });
    return;
  }
  res.writeHead(404, { 'content-type': 'text/plain' }); res.end('not found');
});
function push(c) {
  const s = snapshot(c.hours);
  if (s.body === c.last) return;
  c.last = s.body; c.res.write('data: ' + s.json + '\n\n');
}

// initial scan, then tick
scanDirs();
const t0 = Date.now(); while (dirtyFiles.size && Date.now() - t0 < 1500) pump();
let beat = 0;
setInterval(() => {
  pump();
  peerTick();
  for (const c of clients) { try { push(c); } catch { clients.delete(c); } }
  if (++beat % 15 === 0) { for (const c of clients) c.res.write(': ping\n\n'); for (const ch of [...chats.values(), ...peerTails.values()]) for (const r of ch.listeners) try { r.write(': ping\n\n'); } catch { } }
}, 1000);

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Claude Code factory → http://127.0.0.1:${PORT}/  (window ${DEFAULT_HOURS}h, ${files.size} transcripts tracked, ${(pendingBytes / 1e6).toFixed(1)} MB still to read)`);
  console.log(`source: ${ROOT}`);
});
