import { agentIndex, modelOf, DS, fmt, costTxt, STATUS, NEED_TXT } from '../app/data.js';
import { setText, cut, esc, clock } from '../common/text.js';
import type { Agent, AgentDelta, DashEvent, DashState, Pick, Task } from '../common/types.js';
import type { FSAtSync } from './state.js';
import type { Hall, Line } from './types.js';

export function makeSync(FS: FSAtSync) {
  const { MAXF, facs, killFactory, makeFactory, slotUsed, layoutLines, lineIdx, fillLine, arms, paintArm, isLive, RED, GREEN, BLUE, isFin, WHZ, scene, roads, CAP, crateCol, whEl, MAXFIN, MAXCS, L, ctx } = FS;
  // ── data sync
  let hoverF: string | null = null; FS.hovered = null; FS.hoverHall = null; FS.focusF = null; FS.offLab = null;
  function sync(state: DashState, events: DashEvent[], deltas: Map<string, AgentDelta>, initial: boolean) {
    const proj = state.projects.slice().sort((a, b) => b.lastActivity - a.lastActivity);
    const want = proj.slice(0, MAXF), ids = new Set(want.map(p => p.id));
    for (const f of [...facs.values()]) if (!ids.has(f.id)) killFactory(f);
    for (const p of want) if (!facs.has(p.id)) makeFactory(p, slotUsed.indexOf(null));
    const tmap = new Map<string, Task>();
    for (const p of want) { const f = facs.get(p.id)!; f.name = p.name; layoutLines(f, p, initial); for (const t of p.tasks) tmap.set(t.id, t); }
    for (const l of lineIdx.values()) { const t = tmap.get(l.id); if (t && !l.closing) fillLine(l, t, !initial); }
    for (const A of arms.values()) {
      const a = agentIndex.get(A.a.id); if (!a) continue; A.a = a; paintArm(A); const d = deltas.get(a.id);
      // tokens just arrived: at least one crate goes out now (rate trickle in frame() covers the steady flow)
      if (!initial && d && !d.isNew && d.dTokens > 0 && isLive(a)) A.credit = Math.min(4, Math.max(A.credit + .5, 1));
      if (!initial && d && d.changed) {
        if (a.status === 'failed') { A.flash = 1; A.flashCol.copy(RED); }
        if (a.status === 'done') { A.flash = 1; A.flashCol.copy(GREEN); }
        if (a.status === 'running' && d.prevStatus !== 'running') { A.flash = 1; A.flashCol.set(modelOf(a.model).color); }
      }
      if (!initial && d && a.needsHuman && !d.prevNeeds) { A.flash = 1; A.flashCol.copy(BLUE); }
    }
    const bp = new Map(DS.byProject().map(s => [s.id, s]));
    for (const f of facs.values()) {
      const s = bp.get(f.id); if (!s) continue; setText(f.nameT, f.name);
      setText(f.subB, fmt.tokens(s.tokens));
      const nc = f.closed.length, no = s.tasks - nc;
      setText(f.subS, `${costTxt(s.cost, s.costKnown)} · ${s.running} on · ${no} open${nc ? ` · ${nc} closed` : ''}${f.more > 0 ? ` · +${f.more} more sessions` : ''}`);
      setText(f.clT, nc ? `${nc} closed` : '');
      renderBoard(f);
      f.speed = .45 + Math.min(1, s.running * .15); f.run = s.running; f.wait = s.waiting; f.need = s.needs;
      f.nameEl.classList.toggle('ask', s.needs > 0); setText(f.needT, s.needs > 0 ? `${s.needs} need${s.needs === 1 ? 's' : ''} you` : '');
    }
    for (const l of lineIdx.values()) {
      const t = tmap.get(l.id); if (!t) continue;
      const fins = t.agents.filter(isFin), finIds = new Set(fins.map(a => a.id)), tok = t.agents.reduce((n, a) => n + a.tokens, 0);
      const more = Math.max(0, t.agents.length - fins.length - l.slots.filter(id => id && !finIds.has(id)).length);
      renderFin(l, fins);
      setText(l.title, t.aicoId || cut(t.title || 'Untitled session', 32)); l.el.title = t.aicoId ? `${t.aicoId} · ${t.title || ''}` : t.title || '';
      setText(l.small, `${fmt.tokens(tok)} · ${(STATUS[t.status] || t.status).toLowerCase()}${fins.length ? ` · ${fins.length} finished` : ''}${more > 0 ? ` · +${more} arms` : ''}`);
      const cls = 'dot st-' + t.status; if (l.dot!.className !== cls) l.dot!.className = cls;
      l.el.classList.toggle('ask', !!t.needsHuman); if (t.needsHuman) l.el.title = `Needs you · ${NEED_TXT[t.needReason!] || t.needReason} · ${t.aicoId ? t.aicoId + ' · ' : ''}${t.title || ''}`;
    }
    const hidden = proj.length - want.length;
    if (hidden > 0) {
      if (!FS.offLab) { const el = document.createElement('div'); el.className = 'sign more'; FS.offLab = new ctx.CSS2DObject(el); FS.offLab.center.set(.5, 1); FS.offLab.position.set(0, .1, -WHZ - 1.4); scene.add(FS.offLab); }
      setText(FS.offLab.element, `+${hidden} more project${hidden === 1 ? '' : 's'} off floor · see Factories`); FS.offLab.visible = true;
    } else if (FS.offLab) FS.offLab.visible = false;
    roads();
    const T = DS.totals();
    FS.unit = 50000; while (T.tokens / FS.unit > CAP) FS.unit *= 2;
    FS.target = Math.floor(T.tokens / FS.unit);
    // pile composition by role (same colours as the crates feeding it)
    const br = DS.byRole(); const tot = Math.max(1, br.reduce((s, m) => s + m.tokens, 0)); FS.stackColors = []; let acc = 0;
    for (const r of br) { acc += r.tokens / tot; FS.stackColors.push([acc, crateCol(r.role)]); }
    setText(whEl.querySelector('b'), fmt.tokens(T.tokens)); setText(whEl.querySelector('.u'), `${FS.target} crates · 1 crate = ${fmt.tokens(FS.unit)} tokens`);
  }
  function renderFin(l: Line, fins: Agent[]) { // a line's finished-agents sign: newest ended first, top MAXFIN rows + "+N more"
    const list = fins.slice().sort((a, b) => (b.endedAt || b.lastActivity) - (a.endedAt || a.lastActivity)), shown = list.slice(0, MAXFIN);
    l.finN = list.length; l.finEl.hidden = !l.finN;
    setText(l.finH, `${list.length} finished`); setText(l.finS, list.length ? fmt.tokens(list.reduce((n, a) => n + a.tokens, 0)) : '');
    setText(l.finM, list.length > MAXFIN ? `+${list.length - MAXFIN} more · see the session card` : '');
    const rows = shown.map((a): string[] => [a.id, a.status, DS.roleColor(a.role), a.role, modelOf(a.model).label, fmt.tokens(a.tokens), fmt.dur((a.endedAt || a.lastActivity) - a.startedAt)]);
    const key = JSON.stringify([rows, list.slice(MAXFIN, 12).map(a => a.id + a.status)]); if (key === l.finKey) return; l.finKey = key;
    // collapsed: one colour chip per finished agent (newest first, max 12); hover, keyboard focus or a focused line opens the rows
    l.finC!.innerHTML = rows.concat(list.slice(MAXFIN, 12).map((a): string[] => [a.id, a.status, DS.roleColor(a.role), a.role, modelOf(a.model).label, fmt.tokens(a.tokens), fmt.dur((a.endedAt || a.lastActivity) - a.startedAt)]))
      .map(([id, st, c, role, m, tk, d]) => `<i class="fa fchip st-${esc(st)}" data-agent="${esc(id)}" style="--c:${esc(c)}" tabindex="-1" aria-hidden="true"></i>`).join('');
    l.finL!.innerHTML = rows.map(([id, st, c, role, m, tk, d]) => `<div class="fa st-${esc(st)}" data-agent="${esc(id)}" tabindex="0" role="button" aria-label="${esc(`Finished agent ${role}, ${m}, ${tk} tokens, ${st}, ${d}`)}"><i class="rc" style="--c:${esc(c)}"></i><b>${esc(cut(role, 18))}</b><span>${esc(m)}</span><span>${esc(tk)}</span><span class="fs">${st === 'failed' ? '✕ failed' : '✓ done'}</span><span>${esc(d)}</span></div>`).join('');
  }
  function renderBoard(f: Hall) { // closed-session info signs: name (aico ID or title), tokens, cost, agents, duration, ended
    const cs = f.closed, shown = cs.slice(0, MAXCS);
    setText(f.cbName, f.name); setText(f.cbN, cs.length ? `${cs.length} closed session${cs.length === 1 ? '' : 's'}` : '');
    setText(f.cbMore, cs.length > MAXCS ? `+${cs.length - MAXCS} older · see the project card` : '');
    const rows = shown.map((t): string[] => { const tok = t.agents.reduce((n, a) => n + a.tokens, 0), cost = t.agents.reduce((n, a) => n + a.cost, 0), ck = t.agents.every(a => a.costKnown), end = t.endedAt || t.lastActivity;
      return [t.id, t.status, t.aicoId || cut(t.title || 'Untitled session', 26), `${fmt.tokens(tok)} · ${costTxt(cost, ck)} · ${t.agents.length} agent${t.agents.length === 1 ? '' : 's'}`, `${fmt.dur(end - t.startedAt)} · ended ${clock(end)}`, t.aicoId ? `${t.aicoId} · ${t.title || ''}` : t.title || '']; });
    const key = JSON.stringify(rows); if (key === f.cbKey) return; f.cbKey = key;
    f.cbG.innerHTML = rows.map(([id, st, name, a, b, ttl]) => `<div class="cs st-${esc(st)}" data-task="${esc(id)}" tabindex="0" role="button" aria-label="${esc('Closed session ' + ttl)}"><b>${esc(name)}</b><small>${esc(a)}</small><small>${esc(b)}</small></div>`).join('');
  }
  function hover(p: Pick | null) {
    FS.hovered = p && p.kind === 'agent' ? p.id : null; const hf = p && p.kind === 'project' ? p.id : null;
    if (hf !== hoverF) { hoverF = hf; for (const f of facs.values()) f.accentM.emissiveIntensity = f.id === hoverF ? .9 : .25; }
    // hall under the pointer: its floor/walls, any of its lines or arms
    const A = p && p.kind === 'agent' ? arms.get(p.id) : null, L = p && p.kind === 'task' ? lineIdx.get(p.id) : null;
    FS.hoverHall = hf || (A && A.line && A.line.f.id) || (L && L.f.id) || null;
  }
  return { sync, hover };
}
