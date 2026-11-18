import { $, reduced } from '../common/dom.js';
import { DS, fmt, costTxt, bandsHTML, projById, modelOf, effLabel, needTxt, agentIndex, taskById, pillOf, costCell, pillSm, armOrder, NEED_TXT, STATUS } from './data.js';
import { setText, esc, hhmmss, cut, clock } from '../common/text.js';
import { OFFICE, DUNES, WORD } from './view.js';
import { damp } from '../common/math.js';
import type { AppApi, DashEvent, Pick as PickT } from '../common/types.js';

/** One animated KPI number: eases cur toward tgt and writes f(cur) into el. */
interface Counter { el: Element; f: (v: number) => string; cur: number | null; tgt: number; last: string }
/** renderLegend keeps the last legend key on itself. */
type LegendFn = typeof renderLegend & { key?: string };
type KpiKey ='running' | 'waiting' | 'done' | 'failed' | 'needs';
interface ProjRow { el: HTMLButtonElement; name: Element | null; meta: Element | null; val: Element | null; cost: Element | null; bar: HTMLElement }
interface ModelRow { el: HTMLDivElement; meta: Element | null; val: Element | null; cost: Element | null; bar: HTMLElement }
interface RunRow { el: HTMLLIElement; btn: HTMLButtonElement; slot: Element; b: Element | null; proj: Element | null; small: Element | null; val: Element | null; bar: HTMLElement; key: string }

// ── window selector + connection
const WINDOWS: [number, string][] = [[1, '1h'], [6, '6h'], [24, '24h'], [168, '7d']];
for (const box of [$('#win')!, $('#win2')!]) {
  box.innerHTML = WINDOWS.map(([h, l]) => `<button type="button" data-h="${h}" aria-pressed="${DS.hours === h}">${l}</button>`).join('');
  box.addEventListener('click', e => { const b = (e.target as Element).closest('button'); if (!b) return; DS.setHours(+b.dataset.h!); syncWin(); window.__onWindow?.(); });
}
function syncWin() { document.querySelectorAll<HTMLElement>('.win button[data-h]').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.h! === DS.hours))); }
const winLabel = (h: number) => (WINDOWS.find(w => w[0] === h) || [h, h + 'h'])[1];
DS.onConn(c => { const el = $('#conn')!; el.dataset.s = c.status; setText(el.querySelector('span'), c.status); });

function renderLegend() {
  const roles = DS.byRole().slice(0, 9), models = DS.byModel();
  const key = roles.map(r => r.role).join() + '|' + models.map(m => m.model).join();
  if (key === (renderLegend as LegendFn).key) return; (renderLegend as LegendFn).key = key;
  const sw = (c: string, l: string) => `<span><i class="sw" style="--c:${c}"></i>${esc(l)}</span>`;
  if (DUNES) { $('#legend')!.innerHTML = `
    <div class="arm-key"><svg width="30" height="44" viewBox="0 0 30 44" aria-hidden="true"><rect x="9" y="12" width="8" height="30" rx="2" fill="#cfc6b6"/><rect x="8" y="28" width="10" height="5" fill="#d8604b"/><rect x="7" y="7" width="12" height="5" rx="2" fill="#d6b425"/><ellipse cx="13" cy="20" rx="7" ry="2" fill="none" stroke="#3987e5" stroke-width="2"/><circle cx="13" cy="5" r="2" fill="#36d07a"/><circle cx="25" cy="30" r="3" fill="#e2b08a"/><path d="M21 42l4-10 4 10z" fill="#d8604b"/></svg>
      <span class="note">Band and robe = role · tower cap = model · glow ring = effort · lamp = status · canisters = role color.</span></div>
    <div class="lg-band"><b>Band · robe · role</b><div class="lg-sw">${roles.map(r => sw(r.color, r.role)).join('') || '<span class="note">none yet</span>'}</div></div>
    <div class="lg-band"><b>Tower cap · model</b><div class="lg-sw">${models.map(m => sw(m.color, m.label)).join('') || '<span class="note">none yet</span>'}</div></div>
    <div class="lg-band"><b>Glow ring · effort</b><div><div class="lg-ramp">${DS.EFFORTS.map(e => `<span style="--c:${e.color}" title="${e.label}"></span>`).join('')}</div><div class="lg-ramp-l"><span>low</span><span>med</span><span>high</span><span>xhigh</span><span>max</span></div></div></div>
    <span class="note"><b style="color:var(--color-ink-2)">Farm = project · condenser row = session · tower and farmhand = agent · hover-sled = transport to the depot.</b></span>
    <span class="note">Spinning fins, green lamp = running · amber lamp = waiting · red strobe = failed · dim, farmhand sitting = done (main; finished subagents' towers sink and their farmhand walks home). Homestead beacon: blue flashing = needs you, amber = waiting, green = running. One canister ≈ 20,000 tokens; the depot pile is the window total. Wardens patrol the dunes and stand guard by a farm that needs you.</span>
    <span class="note"><b style="color:var(--color-human-ink)">Flashing blue beacon and lamp = needs you</b> (approval, question or your reply).</span>`; return; }
  if (OFFICE) { $('#legend')!.innerHTML = `
    <div class="arm-key"><svg width="30" height="44" viewBox="0 0 30 44" aria-hidden="true"><rect x="2" y="27" width="26" height="5" rx="1" fill="#d8604b"/><rect x="4" y="32" width="3" height="10" fill="#3a404b"/><rect x="23" y="32" width="3" height="10" fill="#3a404b"/><rect x="15" y="13" width="12" height="10" rx="1" fill="#d6b425"/><rect x="20" y="23" width="2" height="4" fill="#8b939b"/><circle cx="8" cy="9" r="4" fill="#e2b08a"/><rect x="4" y="14" width="8" height="13" rx="2" fill="#3987e5"/></svg>
      <span class="note">Clothes = role · desk = model · screen = effort · car and drives = role color.</span></div>
    <div class="lg-band"><b>Clothes · role</b><div class="lg-sw">${roles.map(r => sw(r.color, r.role)).join('') || '<span class="note">none yet</span>'}</div></div>
    <div class="lg-band"><b>Desk · model</b><div class="lg-sw">${models.map(m => sw(m.color, m.label)).join('') || '<span class="note">none yet</span>'}</div></div>
    <div class="lg-band"><b>Screen · effort</b><div><div class="lg-ramp">${DS.EFFORTS.map(e => `<span style="--c:${e.color}" title="${e.label}"></span>`).join('')}</div><div class="lg-ramp-l"><span>low</span><span>med</span><span>high</span><span>xhigh</span><span>max</span></div></div></div>
    <span class="note"><b style="color:var(--color-ink-2)">Building = project · desk row = session · person = agent · armoured car = transport to the bank.</b></span>
    <span class="note">Typing = running · coffee = waiting · red screen = failed · dim screen = done (main; finished subagents clock out and drive off). Lit windows = agents at work · roof siren: blue flashing = needs you, amber = waiting, green = running. Glass office = the main agents · meeting room = aico brainstorm · kitchen = aico cooler, a balloon while someone speaks. Blocks on the cable = data in the role color. One drive ≈ 20,000 tokens; the bank holds the window total.</span>
    <span class="note"><b style="color:var(--color-human-ink)">Blue windows, sign and screen = needs you</b> (approval, question or your reply).</span>`; return; }
  $('#legend')!.innerHTML = `
    <div class="arm-key"><svg width="30" height="44" viewBox="0 0 30 44" aria-hidden="true"><rect x="4" y="35" width="20" height="7" rx="2" fill="#3987e5"/><rect x="11" y="20" width="6" height="15" rx="2" fill="#d8604b"/><rect x="11" y="7" width="6" height="14" rx="2" fill="#d6b425" transform="rotate(32 14 21)"/><path d="M17 3h8M17 3v4M25 3v4" stroke="#8b939b" stroke-width="2" fill="none" stroke-linecap="round"/></svg>
      <span class="note">Base = role · lower arm = model · upper arm = effort · steel gripper · crates = role color.</span></div>
    <div class="lg-band"><b>Base · role</b><div class="lg-sw">${roles.map(r => sw(r.color, r.role)).join('') || '<span class="note">none yet</span>'}</div></div>
    <div class="lg-band"><b>Lower arm · model</b><div class="lg-sw">${models.map(m => sw(m.color, m.label)).join('') || '<span class="note">none yet</span>'}</div></div>
    <div class="lg-band"><b>Upper arm · effort</b><div><div class="lg-ramp">${DS.EFFORTS.map(e => `<span style="--c:${e.color}" title="${e.label}"></span>`).join('')}</div><div class="lg-ramp-l"><span>low</span><span>med</span><span>high</span><span>xhigh</span><span>max</span></div></div></div>
    <span class="note"><b style="color:var(--color-ink-2)">Hall = project · line = session · arm = agent · tiny yellow robot = transport to the warehouse.</b></span>
    <span class="note">Moving = running · amber = waiting · red strobe = failed · folded = done (main; finished subagents leave the line). Bar on the arm pedestal = tokens (log, vs biggest agent; lit = running). Pile = window total.</span>
    <span class="note"><b style="color:var(--color-human-ink)">Flashing blue beacon = needs you</b> (approval, question or your reply); beats amber.</span>`;
}

export function createHUD(api: AppApi) {
  const counters: Counter[] = [];
  const counter = (el: Element | null, f: (v: number) => string) => { if (el) counters.push({ el, f, cur: null, tgt: 0, last: '' }); return counters[counters.length - 1]; };
  const C = { tok: counter($('#tot-tokens'), fmt.tokens), cost: counter($('#tot-cost'), fmt.cost), rate: counter($('#tot-rate'), v => fmt.tokens(v) + '/s'), calls: counter($('#tot-calls'), v => Math.round(v).toLocaleString('en-US') + ' tools') };
  const K: Partial<Record<KpiKey, Counter>> = {}; for (const k of ['running', 'waiting', 'done', 'failed', 'needs'] as KpiKey[]) { const el = $('#k-' + k); if (el) K[k] = counter(el, v => String(Math.round(v))); }
  function frame(dt: number) {
    for (const c of counters) {
      if (c.cur === null) c.cur = c.tgt;
      c.cur = reduced ? c.tgt : damp(c.cur, c.tgt, 6, dt);
      if (Math.abs(c.cur - c.tgt) < 0.5) c.cur = c.tgt;
      const s = c.f(c.cur); if (s !== c.last) { c.el.textContent = s; c.last = s; }
    }
  }
  const projRows = new Map<string, ProjRow>(); let projOrder = '';
  function renderProjects() {
    const box = $('#projects'); if (!box) return;
    const list = DS.byProject().sort((a, b) => b.lastActivity - a.lastActivity); const max = Math.max(...list.map(p => p.tokens), 1);
    const ids = new Set(list.map(p => p.id));
    for (const [id, r] of projRows) if (!ids.has(id)) { r.el.remove(); projRows.delete(id); }
    for (const p of list) {
      let r = projRows.get(p.id);
      if (!r) {
        const el = document.createElement('button'); el.type = 'button'; el.className = 'row prow';
        el.innerHTML = `<span class="sw" style="--c:${p.color}"></span><span class="row-name"></span><span class="row-val"></span><span class="row-meta"></span><span class="row-cost"></span><span class="bar"><i style="background:${p.color}"></i></span>`;
        el.addEventListener('click', () => api.focus('project', p.id));
        r = { el, name: el.querySelector('.row-name'), meta: el.querySelector('.row-meta'), val: el.querySelector('.row-val'), cost: el.querySelector('.row-cost'), bar: el.querySelector<HTMLElement>('.bar i')! };
        projRows.set(p.id, r);
      }
      setText(r.name, p.name); r.el.title = p.cwd || p.name;
      r.el.classList.toggle('off', !!api.onFloor && !api.onFloor(p.id));
      setText(r.meta, `${p.running} running · ${p.tasks} session${p.tasks === 1 ? '' : 's'} · ${p.agents} ${WORD.agents}`); setText(r.val, fmt.tokens(p.tokens)); setText(r.cost, costTxt(p.cost, p.costKnown));
      r.bar.style.transform = `scaleX(${(p.tokens / max).toFixed(4)})`;
    }
    const order = list.map(p => p.id).join();
    if (order !== projOrder) { projOrder = order; for (const p of list) box.appendChild(projRows.get(p.id)!.el); }
    setText($('#lines-count'), `${list.length} in ${winLabel(DS.hours)} · tokens · cost`);
  }
  const modelRows = new Map<string, ModelRow>();
  function renderModels() {
    const box = $('#models'); if (!box) return;
    const list = DS.byModel(); const max = Math.max(...list.map(m => m.tokens), 1); const ids = new Set(list.map(m => m.model));
    for (const [id, r] of modelRows) if (!ids.has(id)) { r.el.remove(); modelRows.delete(id); }
    for (const m of list) {
      let r = modelRows.get(m.model);
      if (!r) {
        const el = document.createElement('div'); el.className = 'row mrow';
        el.innerHTML = `<span class="sw" style="--c:${m.color}"></span><span class="row-name">${esc(m.label)}</span><span class="row-val"></span><span class="row-meta"></span><span class="row-cost"></span><span class="bar"><i style="background:${m.color}"></i></span>`;
        box.appendChild(el);
        r = { el, meta: el.querySelector('.row-meta'), val: el.querySelector('.row-val'), cost: el.querySelector('.row-cost'), bar: el.querySelector<HTMLElement>('.bar i')! };
        modelRows.set(m.model, r);
      }
      setText(r.meta, `${m.running} running · ${m.agents} agents`); setText(r.val, fmt.tokens(m.tokens)); setText(r.cost, m.costKnown ? fmt.cost(m.cost) : 'price n/a');
      r.bar.style.transform = `scaleX(${(m.tokens / max).toFixed(4)})`;
    }
    if (!list.length && !box.firstChild) box.innerHTML = '<div class="empty-line">No models in this window.</div>';
    else if (list.length) box.querySelector('.empty-line')?.remove();
  }
  const runRows = new Map<string, RunRow>(); let runOrder = '';
  function renderRunning() {
    const box = $('#running'); if (!box) return; const max = +box.dataset.max! || 7;
    const list = DS.agents().filter(a => a.status === 'running' || a.status === 'waiting' || a.needsHuman)
      .sort((a, b) => ((!!b.needsHuman as unknown as number) - (!!a.needsHuman as unknown as number)) || (a.status === b.status ? 0 : a.status === 'running' ? -1 : 1) || b.lastActivity - a.lastActivity);
    const shown = list.slice(0, max); const ids = new Set(shown.map(a => a.id));
    for (const [id, r] of runRows) if (!ids.has(id)) { r.el.remove(); runRows.delete(id); }
    for (const a of shown) {
      let r = runRows.get(a.id);
      if (!r) {
        const li = document.createElement('li'); const el = document.createElement('button'); el.type = 'button'; el.className = 'run'; li.appendChild(el);
        el.innerHTML = `<span class="bandslot"></span><span class="run-main"><span class="run-top"><b></b><span class="run-proj"></span></span><small></small></span><span class="run-val"></span><span class="bar"><i></i></span>`;
        el.addEventListener('click', () => api.focus('agent', a.id));
        r = { el: li, btn: el, slot: el.querySelector('.bandslot')!, b: el.querySelector('b'), proj: el.querySelector('.run-proj'), small: el.querySelector('small'), val: el.querySelector('.run-val'), bar: el.querySelector<HTMLElement>('.bar i')!, key: '' };
        runRows.set(a.id, r);
      }
      const key = a.role + a.model + a.effort; if (key !== r.key) { r.key = key; r.slot.innerHTML = bandsHTML(a); }
      r.btn.dataset.status = a.status; if (a.needsHuman) r.btn.dataset.need = a.needReason!; else delete r.btn.dataset.need;
      setText(r.b, a.role); setText(r.proj, `${projById(a.projectId)?.name || ''} · ${modelOf(a.model).label} · ${effLabel(a.effort)}`);
      setText(r.small, a.needsHuman ? `Needs you · ${needTxt(a)} · ${fmt.ago(a.needSince || a.lastActivity).replace(' ago', '')}` : a.status === 'waiting' ? 'Waiting · ' + a.activity : `${a.activity} · ${a.label}`);
      setText(r.val, fmt.tokens(a.tokens)); r.bar.style.transform = `scaleX(${(a.ctx || 0).toFixed(3)})`;
      r.btn.title = `${a.label} — context ${Math.round(a.ctx * 100)}%`;
    }
    const order = shown.map(a => a.id).join();
    if (order !== runOrder) { runOrder = order; for (const a of shown) box.appendChild(runRows.get(a.id)!.el); }
    if (!list.length && !box.querySelector('.empty-line')) box.insertAdjacentHTML('beforeend', `<li class="empty-line">${WORD.idle}</li>`);
    else if (list.length) box.querySelector('.empty-line')?.remove();
    setText($('#running-count'), list.length > shown.length ? `${shown.length} of ${list.length}` : String(list.length));
  }
  let feedSeeded = false;
  function renderFeed(events: DashEvent[]) {
    const box = $('#feed'); if (!box) return; const max = +box.dataset.max! || 7;
    const add = (feedSeeded ? events : DS.state.events).slice(0, max); feedSeeded = true;
    for (const ev of add.slice().reverse()) {
      const li = document.createElement('li'); li.className = 'ev lvl-' + ev.level;
      const p = projById(ev.projectId);
      li.innerHTML = `<button type="button"><time>${hhmmss(ev.t)}</time><span class="ev-dot" style="--c:${p ? p.color : '#888'}"></span><span class="ev-text">${esc(ev.text)}</span></button>`;
      if (ev.agentId) li.firstChild!.addEventListener('click', () => api.focus('agent', ev.agentId));
      box.prepend(li);
    }
    while (box.children.length > max) box.lastElementChild!.remove();
  }
  function resetFeed() { feedSeeded = false; $('#feed')!.innerHTML = ''; }
  function renderSpark() {
    const svg = $<SVGSVGElement>('#spark'); if (!svg) return;
    const [, , W, H] = svg.getAttribute('viewBox')!.split(' ').map(Number);
    const h = DS.history; if (h.length < 2) return; const mx = Math.max(...h.map(x => x.rate), 1);
    const pts = h.map((x, i) => [(i / (h.length - 1)) * W, H - 2 - (x.rate / mx) * (H - 4)]);
    const line = 'M' + pts.map(p => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join('L');
    svg.querySelector('.sp-line')!.setAttribute('d', line);
    svg.querySelector('.sp-area')!.setAttribute('d', line + `L${W},${H}L0,${H}Z`);
  }
  function renderEmpty() {
    const none = DS.state.ready && DS.state.projects.length === 0;
    $('#empty')!.hidden = !none; if (none) setText($('#empty-h'), `No activity in the last ${winLabel(DS.hours)}`);
  }
  let detail: PickT | null = null;
  const dEl = $('#detail')!;
  function openDetail(kind: PickT['kind'], id: string) { detail = { kind, id }; dEl.hidden = false; requestAnimationFrame(() => dEl.classList.add('open')); renderDetail(); }
  function closeDetail() { detail = null; dEl.classList.remove('open'); dEl.hidden = true; window.dispatchEvent(new CustomEvent('factory:detail', { detail: null })); }
  function renderDetail() {
    if (!detail) return; const body = $('#detail-body')!; let h = ''; const now = Date.now();
    if (detail.kind === 'agent') {
      const a = agentIndex.get(detail.id); if (!a) { body.innerHTML = '<p class="empty-line">This agent left the time window.</p>'; return; }
      const m = modelOf(a.model), p = projById(a.projectId), t = taskById(a.taskId), eff = DS.effortInfo(a.effort);
      const run = a.startedAt ? fmt.dur((a.endedAt || now) - a.startedAt) : '—';
      h = `<div class="d-head">${bandsHTML(a)}<div class="d-title"><h3 title="${esc(a.role)}">${esc(a.role)}</h3><p>${esc(p?.name)} · ${a.kind === 'main' ? 'main session' : 'subagent'}</p></div>${pillOf(a)}</div>
      <p class="d-label">${esc(a.label)}</p>
      <dl class="d-grid">
        <div><dt>Role · ${WORD.role}</dt><dd><i class="sw" style="--c:${DS.roleColor(a.role)}"></i>${esc(a.role)}</dd></div><div><dt>Effort · ${WORD.effort}</dt><dd><i class="sw" style="--c:${eff.color}"></i>${esc(eff.label)}</dd></div>
        <div class="wide"><dt>Model · ${WORD.model}</dt><dd><i class="sw" style="--c:${m.color}"></i>${esc(m.label)} <span style="color:var(--color-ink-3)">${esc(a.model)}</span></dd></div>
        ${a.kind !== 'main' ? `<div class="wide"><dt>Task</dt><dd>${esc(t?.title)}</dd></div>` : ''}
        <div><dt>Runtime</dt><dd>${run}</dd></div><div><dt>Last activity</dt><dd>${fmt.ago(a.lastActivity)}</dd></div>
        <div><dt>Doing</dt><dd>${esc(a.activity)}</dd></div><div><dt>Tool calls</dt><dd>${a.toolCalls} · last ${esc(a.tool)}</dd></div>
        <div><dt>Tokens</dt><dd class="hl">${fmt.tokens(a.tokens)}</dd></div><div><dt>Est. cost</dt><dd class="hl">${costCell(a.cost, a.costKnown)}</dd></div>
        <div><dt>Input</dt><dd>${fmt.tokens(a.input)}</dd></div><div><dt>Output</dt><dd>${fmt.tokens(a.output)}</dd></div>
        <div><dt>Cache write</dt><dd>${fmt.tokens(a.cacheWrite)}</dd></div><div><dt>Cache read</dt><dd>${fmt.tokens(a.cacheRead)}</dd></div>
        <div><dt>Rate (60s)</dt><dd>${fmt.tokens(a.rate)}/s</dd></div><div><dt>Spawn depth</dt><dd>${a.depth || 0}</dd></div>
      </dl>
      <div class="meter"><span>Context (last turn)</span><b>${Math.round(a.ctx * 100)}%</b><span class="bar ctx${a.ctx > .8 ? ' hot' : ''}"><i style="transform:scaleX(${a.ctx.toFixed(3)})"></i></span></div>`;
    } else if (detail.kind === 'project') {
      const p = projById(detail.id), s = DS.byProject().find(x => x.id === detail!.id); if (!p || !s) { body.innerHTML = '<p class="empty-line">This project left the time window.</p>'; return; }
      const as = p.tasks.flatMap(t => t.agents);
      const tasks = p.tasks.slice().sort((x, y) => y.lastActivity - x.lastActivity).slice(0, 10).map(t => { const tok = t.agents.reduce((n, a) => n + a.tokens, 0); const r = t.agents.filter(a => a.status === 'running').length;
        return `<tr data-task="${esc(t.id)}" tabindex="0"><td><span class="cl" title="${esc(t.title)}">${esc(t.title)}</span></td><td>${pillSm(t.needsHuman, t.needReason, t.status)}</td><td class="num">${t.agents.length}${r ? ` · ${r} on` : ''}</td><td class="num">${fmt.tokens(tok)}</td></tr>`; }).join('');
      const roles: Record<string, number> = {}; for (const a of as) roles[a.role] = (roles[a.role] || 0) + 1;
      h = `<div class="d-head"><span class="sw lg" style="--c:${p.color}"></span><div class="d-title"><h3 title="${esc(p.name)}">${esc(p.name)}</h3><p>${esc(p.branch || 'no branch')} · ${esc(p.cwd)}</p></div></div>
      <dl class="d-grid"><div><dt>Tokens</dt><dd class="hl">${fmt.tokens(s.tokens)}</dd></div><div><dt>Est. cost</dt><dd class="hl">${costCell(s.cost, s.costKnown)}</dd></div>
      <div><dt>Running</dt><dd>${s.running}${s.waiting ? ` · ${s.waiting} waiting` : ''}${s.needs ? ` · <span class="st-human">${s.needs} need you</span>` : ''}</dd></div><div><dt>Agents</dt><dd>${as.length}</dd></div>
      <div><dt>Failed</dt><dd>${as.filter(a => a.status === 'failed').length}</dd></div><div><dt>Tasks</dt><dd>${p.tasks.length}</dd></div>
      <div class="wide"><dt>Roles</dt><dd>${Object.entries(roles).sort((a, b) => b[1] - a[1]).map(([r, n]) => `<span style="white-space:nowrap"><i class="sw" style="--c:${DS.roleColor(r)}"></i>${esc(r)} ${n}</span>`).join(' &nbsp; ')}</dd></div>
      <div class="wide"><dt>Last activity</dt><dd>${fmt.ago(p.lastActivity)}</dd></div></dl>
      <table class="d-tasks"><thead><tr><th>${WORD.sessCol}</th><th>Status</th><th class="num">Agents</th><th class="num">Tokens</th></tr></thead><tbody>${tasks}</tbody></table>`;
    } else if (detail.kind === 'task') {
      const t = taskById(detail.id); if (!t) { body.innerHTML = '<p class="empty-line">This session left the time window.</p>'; return; }
      const p = projById(t.projectId), as = t.agents.slice().sort(armOrder), onLine = api.lineSlots ? api.lineSlots(t.id) : null;
      const tok = as.reduce((n, a) => n + a.tokens, 0), cost = as.reduce((n, a) => n + a.cost, 0), ck = as.every(a => a.costKnown);
      const on = as.filter(a => a.status === 'running').length, wt = as.filter(a => a.status === 'waiting').length;
      const rows = as.map(a => { const off = onLine && !onLine.has(a.id) ? (!t.closed && a.kind !== 'main' && (a.status === 'done' || a.status === 'failed') ? WORD.left : WORD.off) : ''; return `<tr data-agent="${esc(a.id)}" tabindex="0"><td><span class="nm">${bandsHTML(a)} ${esc(a.role)}${off}</span>${a.label ? `<span class="ds" title="${esc(a.label)}">${esc(a.label)}</span>` : ''}</td><td>${pillSm(a.needsHuman, a.needReason, a.status)}</td><td class="num">${fmt.tokens(a.tokens)}</td><td class="num">${costCell(a.cost, a.costKnown)}</td></tr>`; }).join('');
      h = `<div class="d-head"><span class="sw lg" style="--c:${p?.color || '#888'}"></span><div class="d-title"><h3 title="${esc(t.title || 'Untitled session')}">${esc(t.title || 'Untitled session')}</h3><p>${esc(p?.name)}${t.aicoId ? ' · ' + esc(t.aicoId) : ''} · ${t.closed ? WORD.closed : WORD.row} · started ${t.startedAt ? fmt.ago(t.startedAt) : '—'}</p></div>${t.needsHuman ? `<span class="pill st-human">Needs you · ${esc(NEED_TXT[t.needReason!] || t.needReason)}</span>` : `<span class="pill st-${t.status}">${STATUS[t.status] || t.status}</span>`}</div>
      <dl class="d-grid"><div><dt>Tokens</dt><dd class="hl">${fmt.tokens(tok)}</dd></div><div><dt>Est. cost</dt><dd class="hl">${costCell(cost, ck)}</dd></div>
      <div><dt>Agents</dt><dd>${as.length}${as.length > WORD.cap ? ' · ' + WORD.cap + WORD.capTxt : ''}</dd></div><div><dt>Running</dt><dd>${on}${wt ? ` · ${wt} waiting` : ''}</dd></div>
      <div><dt>Runtime</dt><dd>${t.startedAt ? fmt.dur((t.endedAt || now) - t.startedAt) : '—'}</dd></div><div><dt>Last activity</dt><dd>${fmt.ago(t.lastActivity)}</dd></div></dl>
      <table class="d-tasks ag"><colgroup><col><col class="c-st"><col class="c-tok"><col class="c-cost"></colgroup><thead><tr><th>${WORD.agentCol}</th><th>Status</th><th class="num">Tokens</th><th class="num">Cost</th></tr></thead><tbody>${rows}</tbody></table>`;
    } else {
      const T = DS.totals();
      h = `<div class="d-head"><div class="d-title"><h3>All projects</h3><p>last ${winLabel(DS.hours)} · ${T.projects} projects · ${T.tasks} tasks · ${T.agents} agents</p></div></div>
      <dl class="d-grid"><div><dt>Tokens</dt><dd class="hl">${fmt.tokens(T.tokens)}</dd></div><div><dt>Est. cost</dt><dd class="hl">${costTxt(T.cost, T.costKnown)}</dd></div>
      <div><dt>Input</dt><dd>${fmt.tokens(T.input)}</dd></div><div><dt>Output</dt><dd>${fmt.tokens(T.output)}</dd></div><div><dt>Cache write</dt><dd>${fmt.tokens(T.cacheWrite)}</dd></div><div><dt>Cache read</dt><dd>${fmt.tokens(T.cacheRead)}</dd></div><div><dt>Tool calls</dt><dd>${T.toolCalls.toLocaleString('en-US')}</dd></div><div><dt>Failed</dt><dd>${T.failed}</dd></div></dl>
      <p class="empty-line">Costs are estimates from list prices; * = some usage on a model with no known price.</p>`;
    }
    body.innerHTML = h;
    window.dispatchEvent(new CustomEvent('factory:detail', { detail: { kind: detail.kind, id: detail.id } })); // chat.js: dock the chat panel for owned sessions
  }
  $('#detail-close')?.addEventListener('click', () => api.unfocus());
  const rowGo = (e: Event) => { const r = (e.target as Element).closest<HTMLElement>('tr[data-agent],tr[data-task]'); if (!r) return; if (r.dataset.agent) api.focus('agent', r.dataset.agent); else api.focus('task', r.dataset.task!); };
  $('#detail-body')?.addEventListener('click', rowGo);
  $('#detail-body')?.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); rowGo(e); } });
  const tipEl = $('#tip')!;
  function tip(pick: null): void;
  function tip(pick: PickT | null, x: number, y: number): void;
  function tip(pick: PickT | null, x?: number, y?: number): void {
    if (!pick) { tipEl.classList.remove('on'); return; }
    let h = '';
    if (pick.kind === 'agent') {
      const a = agentIndex.get(pick.id); if (!a) return tip(null); const m = modelOf(a.model), eff = DS.effortInfo(a.effort);
      h = `<div class="t-h">${bandsHTML(a)}<b>${esc(a.role)}</b><span>${fmt.ago(a.lastActivity)}</span></div>
      <div class="t-l">${esc(a.label)}</div>
      <div class="t-s st-${a.needsHuman ? 'human' : a.status}">${a.needsHuman ? 'Needs you' : STATUS[a.status]} · ${esc(projById(a.projectId)?.name)} · ${esc(a.activity)}</div>
      <table><tr><td>Role · ${WORD.role}</td><td><i class="sw" style="--c:${DS.roleColor(a.role)}"></i>${esc(a.role)}</td></tr><tr><td>Model · ${WORD.model}</td><td><i class="sw" style="--c:${m.color}"></i>${esc(m.label)}</td></tr><tr><td>Effort · ${WORD.effort}</td><td><i class="sw" style="--c:${eff.color}"></i>${esc(eff.label)}</td></tr>
      <tr><td>Tokens</td><td>${a.tokens.toLocaleString('en-US')}</td></tr><tr><td>In / out / cache</td><td>${fmt.tokens(a.input)} / ${fmt.tokens(a.output)} / ${fmt.tokens(a.cache)}</td></tr>
      <tr><td>Est. cost · ctx</td><td>${a.costKnown ? fmt.cost(a.cost) : 'n/a'} · ${Math.round(a.ctx * 100)}%</td></tr></table><div class="t-f">${WORD.focusAgent}</div>`;
    } else if (pick.kind === 'project') {
      const s = DS.byProject().find(p => p.id === pick.id); if (!s) return tip(null);
      h = `<div class="t-h"><span class="sw" style="--c:${s.color}"></span><b>${esc(s.name)}</b><span>${fmt.ago(s.lastActivity)}</span></div>
      <table><tr><td>Tokens</td><td>${s.tokens.toLocaleString('en-US')}</td></tr><tr><td>Est. cost</td><td>${costTxt(s.cost, s.costKnown)}</td></tr><tr><td>Running</td><td>${s.running}${s.needs ? ` · <span class="st-human">${s.needs} need you</span>` : ''}</td></tr><tr><td>Tasks · agents</td><td>${s.tasks} · ${s.agents}</td></tr></table><div class="t-f">Click to focus</div>`;
    } else if (pick.kind === 'task') {
      const t = taskById(pick.id); if (!t) return tip(null); const p = projById(t.projectId);
      const tok = t.agents.reduce((n, a) => n + a.tokens, 0), on = t.agents.filter(a => a.status === 'running').length;
      h = `<div class="t-h"><span class="sw" style="--c:${p?.color || '#888'}"></span><b>${esc(cut(t.aicoId ? t.aicoId + ' · ' + (t.title || '') : t.title || 'Untitled session', 40))}</b><span>${fmt.ago(t.lastActivity)}</span></div>
      <div class="t-s st-${t.needsHuman ? 'human' : t.status}">${t.needsHuman ? 'Needs you · ' + esc(NEED_TXT[t.needReason!] || t.needReason) : STATUS[t.status] || t.status} · ${esc(p?.name)} · ${t.closed ? 'closed session' : WORD.row}</div>`
      + (t.closed ? `<table><tr><td>Tokens</td><td>${tok.toLocaleString('en-US')}</td></tr><tr><td>Est. cost</td><td>${costTxt(t.agents.reduce((n, a) => n + a.cost, 0), t.agents.every(a => a.costKnown))}</td></tr><tr><td>Agents</td><td>${t.agents.length}</td></tr><tr><td>Duration</td><td>${fmt.dur((t.endedAt || t.lastActivity) - t.startedAt)}</td></tr><tr><td>Ended</td><td>${clock(t.endedAt || t.lastActivity)} · ${fmt.ago(t.endedAt || t.lastActivity)}</td></tr></table><div class="t-f">Click to open the session card</div>` : `
      <table><tr><td>Tokens</td><td>${tok.toLocaleString('en-US')}</td></tr><tr><td>Agents · running</td><td>${t.agents.length} · ${on}</td></tr></table><div class="t-f">${WORD.focusRow}</div>`);
    } else {
      const T = DS.totals();
      h = `<div class="t-h"><b>${WORD.total} · all projects</b></div><table><tr><td>Tokens</td><td>${T.tokens.toLocaleString('en-US')}</td></tr><tr><td>Est. cost</td><td>${costTxt(T.cost, T.costKnown)}</td></tr><tr><td>Running</td><td>${T.running}</td></tr></table>`;
    }
    tipEl.innerHTML = h; tipEl.classList.add('on');
    const w = tipEl.offsetWidth, hh = tipEl.offsetHeight;
    const tx = x! + 16 + w > innerWidth ? x! - w - 12 : x! + 16, ty = y! + 16 + hh > innerHeight ? y! - hh - 12 : y! + 16;
    tipEl.style.transform = `translate(${tx}px,${ty}px)`;
  }
  function update(events: DashEvent[]) {
    const T = DS.totals(); C.tok.tgt = T.tokens; C.cost.tgt = T.cost; C.calls.tgt = T.toolCalls;
    C.rate.tgt = DS.history.length ? DS.history[DS.history.length - 1].rate : 0;
    for (const k in K) K[k as KpiKey]!.tgt = T[k as KpiKey] ?? 0;
    $('#kpi-human')?.classList.toggle('on', T.needs > 0);
    setText($('#k-needs-why'), Object.entries(T.needReasons || {}).sort((a, b) => b[1] - a[1]).map(([r, n]) => `${n} ${NEED_TXT[r] || r}`).join(' · '));
    renderProjects(); renderModels(); renderRunning(); renderFeed(events); renderSpark(); renderDetail(); renderLegend(); renderEmpty();
  }
  return { frame, update, tip, openDetail, closeDetail, resetFeed, get detail() { return detail; } };
}
/** The HUD that createHUD returns (SceneCtx.hud). */
export type HUD = ReturnType<typeof createHUD>;
