/* live-data.js — DashSim-shaped adapter fed by the local server's SSE stream.
 * window.DashSim = { state, MODELS, ROLES, EFFORTS, history, subscribe, totals, byModel, byProject,
 *                    byRole, agents, fmt, roleColor, modelColor, effortColor, setHours, hours, conn }
 * subscribe(fn): fn(state, newEvents) now (if data is in) and on every pushed snapshot.
 * MODELS is dynamic: any model id the server reports gets an entry {id,label,color,speed,family,priced}.
 */
(function () {
  'use strict';
  // ── palettes (validated with dataviz validate_palette.js, dark mode, surface #1a1a19)
  // Roles: categorical, fixed order for known roles, stable hash for the rest. "main" = neutral ivory.
  const ROLE_PAL = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#0ca30c', '#9085e9', '#e66767', '#1f9fb0', '#b8702e'];
  const ROLE_ORDER = ['frontend-engineer', 'backend-engineer', 'qa', 'code-reviewer', 'architect', 'devops', 'ui-ux-designer', 'security', 'writer', 'general-purpose'];
  const ROLE_FIXED = { main: '#d8d3c8', Explore: '#1f9fb0', Plan: '#9085e9', fork: '#8f8a80' };
  // Models: one hue per family (validated set), version shifts lightness a little.
  const FAMILY = { opus: '#d8604b', sonnet: '#4f8fe6', haiku: '#2e9e68', fable: '#9a7cf0', mythos: '#d55181', other: '#7d8590' };
  const SPEED = { haiku: 1.5, sonnet: 1.2, opus: 1, fable: .9, mythos: .85, other: 1 };
  // Effort: sequential single hue (signal yellow), dim -> bright, in fixed order.
  const EFFORTS = [
    { id: 'low', label: 'Low', color: '#6b5c22' },
    { id: 'medium', label: 'Medium', color: '#a38a24' },
    { id: 'high', label: 'High', color: '#d6b425' },
    { id: 'xhigh', label: 'X-high', color: '#f3d54a' },
    { id: 'max', label: 'Max', color: '#fff1a8' },
  ];
  const EFFORT_DEFAULT = { id: 'default', label: 'Default', color: '#8a8679' };

  const hash = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
  const ROLES = {};
  function roleColor(role) {
    role = role || 'agent';
    if (ROLES[role]) return ROLES[role].color;
    let c = ROLE_FIXED[role];
    if (!c) { const i = ROLE_ORDER.indexOf(role); c = ROLE_PAL[i >= 0 ? i : hash(role) % ROLE_PAL.length]; }
    ROLES[role] = { id: role, label: role, color: c }; return c;
  }
  const effortInfo = e => EFFORTS.find(x => x.id === String(e || '').toLowerCase()) || Object.assign({}, EFFORT_DEFAULT, e && e !== 'default' ? { id: e, label: e } : {});
  const effortColor = e => effortInfo(e).color;
  function shade(hex, k) { // k>0 lighter, k<0 darker
    const n = parseInt(hex.slice(1), 16); let r = n >> 16, g = n >> 8 & 255, b = n & 255;
    const t = k > 0 ? 255 : 0, f = Math.abs(k); r = Math.round(r + (t - r) * f); g = Math.round(g + (t - g) * f); b = Math.round(b + (t - b) * f);
    return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
  }
  const MODELS = {};
  function ensureModel(id, info) {
    if (MODELS[id]) return MODELS[id];
    info = info || {}; const fam = info.family || 'other';
    const v = parseFloat(info.version) || 0;
    // newer version = slightly lighter; keeps family hue
    const k = fam === 'other' ? 0 : Math.max(-.18, Math.min(.12, (v - 5) * .12));
    MODELS[id] = { id, label: info.label || id, family: fam, color: shade(FAMILY[fam] || FAMILY.other, k), speed: SPEED[fam] || 1, priced: info.priced !== false, ctxWindow: info.ctxWindow || 1e6 };
    return MODELS[id];
  }
  const modelColor = id => ensureModel(id).color;
  const PROJ_PAL = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#0ca30c', '#9085e9', '#e66767', '#1f9fb0', '#b8702e'];

  // ── state
  const state = { projects: [], events: [], now: Date.now(), startedAt: Date.now(), hours: 24, loading: true, ready: false };
  const history = [];
  const subs = new Set();
  const seenEv = new Set();
  let flat = [];
  const conn = { status: 'connecting', lastAt: 0 };
  let es = null;
  let hours = +(new URLSearchParams(location.search).get('hours')) || +(safeGet('factory.hours')) || 24;
  function safeGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
  function safeSet(k, v) { try { localStorage.setItem(k, v); } catch { } }

  function ingest(s) {
    for (const id in s.models) ensureModel(id, s.models[id]);
    const projects = s.projects.map(p => {
      const color = PROJ_PAL[hash(p.id) % PROJ_PAL.length];
      return Object.assign({}, p, { color, tasks: p.tasks.map(t => Object.assign({}, t, { agents: t.agents.map(a => { ensureModel(a.model); roleColor(a.role); return a; }) })) });
    });
    state.projects = projects; state.now = s.now; state.startedAt = s.since; state.hours = s.hours; state.loading = !!s.loading; state.ready = true;
    state.events = s.events;
    flat = projects.flatMap(p => p.tasks.flatMap(t => t.agents));
    const fresh = []; for (const e of s.events) if (!seenEv.has(e.id)) { seenEv.add(e.id); fresh.push(e); }
    history.length = 0; let running = 0; for (const a of flat) if (a.status === 'running') running++;
    for (const h of s.history) history.push({ t: h.t, rate: h.rate, tokens: 0, running });
    conn.status = 'live'; conn.lastAt = Date.now();
    for (const fn of subs) { try { fn(state, fresh); } catch (e) { console.error(e); } }
  }
  function connect() {
    if (es) es.close();
    conn.status = 'connecting'; seenEv.clear();
    es = new EventSource('/api/stream?hours=' + encodeURIComponent(hours));
    es.onmessage = e => { try { ingest(JSON.parse(e.data)); } catch (err) { console.error('bad snapshot', err); } };
    es.onerror = () => { conn.status = es.readyState === 2 ? 'offline' : 'reconnecting'; for (const fn of connSubs) fn(conn); };
    es.onopen = () => { conn.status = 'live'; for (const fn of connSubs) fn(conn); };
  }
  const connSubs = new Set();

  // ── aggregations (same shapes as DashSim)
  const agents = () => flat;
  function totals() {
    const T = { tokens: 0, input: 0, output: 0, cache: 0, cacheWrite: 0, cacheRead: 0, cost: 0, costKnown: true, running: 0, queued: 0, waiting: 0, done: 0, failed: 0, agents: 0, tasks: 0, projects: state.projects.length, toolCalls: 0, needs: 0, needReasons: {} };
    for (const p of state.projects) T.tasks += p.tasks.length;
    for (const a of flat) {
      T.tokens += a.tokens; T.input += a.input; T.output += a.output; T.cache += a.cache; T.cacheWrite += a.cacheWrite; T.cacheRead += a.cacheRead;
      T.cost += a.cost; if (!a.costKnown) T.costKnown = false; T.toolCalls += a.toolCalls; T.agents++; T[a.status] = (T[a.status] || 0) + 1;
      if (a.needsHuman) { T.needs++; T.needReasons[a.needReason] = (T.needReasons[a.needReason] || 0) + 1; }
    }
    return T;
  }
  function group(keyOf, make) {
    const m = new Map();
    for (const a of flat) {
      const k = keyOf(a); let g = m.get(k); if (!g) { g = make(k, a); g.tokens = 0; g.cost = 0; g.running = 0; g.agents = 0; g.costKnown = true; m.set(k, g); }
      g.tokens += a.tokens; g.cost += a.cost; g.agents++; if (a.status === 'running') g.running++; if (!a.costKnown) g.costKnown = false;
    }
    return [...m.values()].sort((x, y) => y.tokens - x.tokens);
  }
  const byModel = () => group(a => a.model, k => { const M = ensureModel(k); return { model: k, label: M.label, color: M.color }; });
  const byRole = () => group(a => a.role, k => ({ role: k, label: k, color: roleColor(k) }));
  function byProject() {
    return state.projects.map(p => {
      const as = p.tasks.flatMap(t => t.agents);
      return { id: p.id, name: p.name, color: p.color, branch: p.branch, cwd: p.cwd, lastActivity: p.lastActivity,
        tokens: as.reduce((n, a) => n + a.tokens, 0), cost: as.reduce((n, a) => n + a.cost, 0), costKnown: as.every(a => a.costKnown),
        running: as.filter(a => a.status === 'running').length, waiting: as.filter(a => a.status === 'waiting').length, needs: as.filter(a => a.needsHuman).length,
        tasks: p.tasks.length, agents: as.length };
    });
  }

  const fmt = {
    tokens(n) { n = +n || 0; const a = Math.abs(n); return a >= 1e9 ? (n / 1e9).toFixed(2) + 'B' : a >= 1e6 ? (n / 1e6).toFixed(a >= 1e8 ? 0 : a >= 1e7 ? 1 : 2) + 'M' : a >= 1e3 ? (n / 1e3).toFixed(a >= 1e5 ? 0 : 1) + 'k' : String(Math.round(n)); },
    cost(n) { n = +n || 0; if (n > 0 && n < 0.01) return '<$0.01'; return n >= 1000 ? '$' + Math.round(n).toLocaleString('en-US') : n >= 100 ? '$' + n.toFixed(0) : '$' + n.toFixed(2); },
    dur(ms) { ms = Math.max(0, ms | 0); const s = Math.floor(ms / 1000), h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60); return h ? `${h}h ${String(m).padStart(2, '0')}m` : m ? `${m}m ${String(s % 60).padStart(2, '0')}s` : `${s}s`; },
    ago(ts) { const s = Math.max(0, (Date.now() - ts) / 1000); return s < 60 ? Math.round(s) + 's ago' : s < 3600 ? Math.round(s / 60) + 'm ago' : s < 86400 ? (s / 3600).toFixed(1) + 'h ago' : (s / 86400).toFixed(1) + 'd ago'; },
  };

  window.DashSim = {
    state, MODELS, ROLES, EFFORTS, EFFORT_DEFAULT, history, conn, fmt,
    subscribe(fn) { subs.add(fn); if (state.ready) fn(state, []); return () => subs.delete(fn); },
    onConn(fn) { connSubs.add(fn); fn(conn); return () => connSubs.delete(fn); },
    totals, byModel, byProject, byRole, agents, roleColor, modelColor, effortColor, effortInfo, ensureModel,
    get hours() { return hours; },
    setHours(h) { h = +h; if (!h || h === hours) return; hours = h; safeSet('factory.hours', String(h)); state.ready = false; connect(); },
    tick() { },
  };
  connect();
})();
