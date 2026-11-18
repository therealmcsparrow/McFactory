'use strict';
// Shared test harness: a temp ~/.claude look-alike (projects/ + sessions/), a spawned server.js on a free port,
// fake live sessions (a sleeper child process for a real, killable pid) and a fake messaging pipe.
const fs = require('fs');
const path = require('path');
const os = require('os');
const net = require('net');
const http = require('http');
const crypto = require('crypto');
const { spawn } = require('child_process');

const SERVER = path.join(__dirname, '..', 'server.js');
const hex = n => crypto.randomBytes(n / 2).toString('hex');

function freePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer(); s.unref();
    s.on('error', reject);
    s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); });
  });
}
const wait = ms => new Promise(r => setTimeout(r, ms));
async function until(fn, ms = 4000, step = 100) {
  const end = Date.now() + ms; let last;
  while (Date.now() < end) { last = await fn(); if (last) return last; await wait(step); }
  return last;
}

class Harness {
  constructor() {
    this.dir = fs.mkdtempSync(path.join(os.tmpdir(), 'peer-chat-'));
    this.projects = path.join(this.dir, 'projects');
    this.sessions = path.join(this.dir, 'sessions');
    fs.mkdirSync(path.join(this.projects, 'p'), { recursive: true });
    fs.mkdirSync(this.sessions, { recursive: true });
    this.out = ''; this.bodies = []; this.sleepers = []; this.pipes = [];
  }
  // a transcript the server tracks as a task (main session) — create before start() to be scanned at once
  transcript(sid, lines) {
    const fp = path.join(this.projects, 'p', sid + '.jsonl');
    fs.writeFileSync(fp, lines.map(l => (typeof l === 'string' ? l : JSON.stringify(l)) + '\n').join(''));
    return fp;
  }
  append(fp, lines) { fs.appendFileSync(fp, lines.map(l => (typeof l === 'string' ? l : JSON.stringify(l)) + '\n').join('')); }
  async start(extra = [], { hook = false, env = {} } = {}) { // hook: leave the hook endpoints on (no --no-hook)
    this.port = await freePort();
    this.proc = spawn(process.execPath, [SERVER, '--port', String(this.port), '--root', this.projects, ...(hook ? [] : ['--no-hook']), ...extra], { stdio: ['ignore', 'pipe', 'pipe'], env: Object.assign({}, process.env, env) });
    this.proc.stdout.on('data', d => { this.out += d; });
    this.proc.stderr.on('data', d => { this.out += d; });
    const up = await until(() => /factory/.test(this.out), 8000);
    if (!up) throw new Error('server did not start: ' + this.out);
    const page = await this.req('GET', '/');
    this.token = /<meta name="chat-token" content="([0-9a-f]+)">/.exec(page.body)[1];
  }
  req(method, p, { headers = {}, body } = {}) {
    return new Promise((resolve, reject) => {
      const data = body === undefined ? null : Buffer.from(typeof body === 'string' ? body : JSON.stringify(body));
      const h = Object.assign({}, data ? { 'content-type': 'application/json', 'content-length': data.length } : {}, headers);
      const r = http.request({ host: '127.0.0.1', port: this.port, method, path: p, headers: h }, res => {
        let b = ''; res.setEncoding('utf8'); res.on('data', d => { b += d; });
        res.on('end', () => { this.bodies.push(b); let json = null; try { json = JSON.parse(b); } catch { } resolve({ status: res.statusCode, body: b, json }); });
      });
      r.on('error', reject); if (data) r.write(data); r.end();
    });
  }
  // SSE client: events = [{event, data}] in arrival order; status = HTTP status
  stream(p) {
    return new Promise((resolve, reject) => {
      const s = { events: [], status: 0, body: '' };
      const r = http.get({ host: '127.0.0.1', port: this.port, path: p }, res => {
        s.status = res.statusCode; res.setEncoding('utf8'); let buf = '';
        res.on('data', d => {
          if (res.statusCode !== 200) { s.body += d; return; }
          buf += d; let i;
          while ((i = buf.indexOf('\n\n')) >= 0) {
            const block = buf.slice(0, i); buf = buf.slice(i + 2);
            let ev = 'message', data = '';
            for (const l of block.split('\n')) { if (l.startsWith('event: ')) ev = l.slice(7); else if (l.startsWith('data: ')) data += l.slice(6); }
            if (data) { this.bodies.push(data); s.events.push({ event: ev, data: JSON.parse(data) }); }
          }
        });
        res.on('end', () => { if (s.body) this.bodies.push(s.body); });
        resolve(s);
      });
      r.on('error', reject);
      s.close = () => r.destroy();
      s.of = ev => s.events.filter(e => e.event === ev).map(e => e.data);
    });
  }
  peerStream(sid, token = this.token) { return this.stream('/api/peer/' + sid + '/stream' + (token ? '?token=' + token : '')); }
  send(sid, body, headers) { return this.req('POST', '/api/peer/' + sid + '/send', { headers: Object.assign({ 'x-chat-token': this.token }, headers || {}), body }); }
  async state() { const r = await this.req('GET', '/api/state?hours=24'); return r.json; }
  async task(sid) { const s = await this.state(); for (const p of s.projects) for (const t of p.tasks) if (t.id === sid) return t; return null; }
  pipePath() { return process.platform === 'win32' ? '\\\\.\\pipe\\LOCAL\\cc-msg-' + hex(32) : path.join(this.sessions, 'cc-msg-' + hex(8) + '.sock'); }
  // fake receiving end of a session pipe: collects parsed NDJSON lines per connection
  async pipe(p = this.pipePath()) {
    const got = [];
    const srv = net.createServer(sock => {
      let buf = ''; sock.setEncoding('utf8');
      sock.on('data', d => { buf += d; });
      sock.on('end', () => { for (const l of buf.split('\n')) if (l.trim()) got.push(JSON.parse(l)); sock.end(); });
      sock.on('error', () => { });
    });
    await new Promise((res, rej) => { srv.on('error', rej); srv.listen(p, res); });
    this.pipes.push(srv);
    return { path: p, got, close: () => new Promise(r => srv.close(r)) };
  }
  // fake live session: a sleeper process gives a real pid; writes <pid>.json and (unless key === null) <pid>.<64hex>.key
  session({ sid = crypto.randomUUID(), pipe, key = hex(32), status = 'idle', pid, entrypoint = 'cli', bridge } = {}) {
    let sleeper = null;
    if (!pid) { sleeper = spawn(process.execPath, ['-e', 'setInterval(()=>{},1e9)'], { stdio: 'ignore' }); this.sleepers.push(sleeper); pid = sleeper.pid; }
    const file = path.join(this.sessions, pid + '.json');
    fs.writeFileSync(file, JSON.stringify({ pid, sessionId: sid, cwd: this.dir, startedAt: Date.now(), kind: 'interactive', entrypoint, status, statusUpdatedAt: Date.now(), messagingSocketPath: pipe, bridgeSessionId: bridge }));
    let keyFile = null;
    if (key !== null) { keyFile = path.join(this.sessions, pid + '.' + hex(64) + '.key'); fs.writeFileSync(keyFile, JSON.stringify({ peerToken: key, procStartFt: 1, pidDomain: 'win' })); }
    return { sid, pid, key, file, keyFile, kill: () => { if (sleeper) sleeper.kill(); } };
  }
  async stop() {
    for (const s of this.sleepers) try { s.kill(); } catch { }
    for (const p of this.pipes) try { p.close(); } catch { }
    if (this.proc) { this.proc.kill(); await new Promise(r => this.proc.once('exit', r)); }
    try { fs.rmSync(this.dir, { recursive: true, force: true }); } catch { }
  }
}

module.exports = { Harness, wait, until, hex };
