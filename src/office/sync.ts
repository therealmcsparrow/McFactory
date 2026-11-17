import { cut, esc, clock } from '../common/text.js';
import { NEED_TXT, fmt, armOrder, costTxt, DS } from '../app/data.js';
import { reduced } from '../common/dom.js';
import { clamp } from '../common/math.js';
import type { Agent, AgentDelta, DashEvent, DashState, NeedReason, Task } from '../common/types.js';
import type { OSAtSync } from './state.js';
import type { Office, OfficeSeat, Want } from './types.js';

export function makeSync(OS: OSAtSync) {
  const { bldgs, removeBuilding, slotUsed, addBuilding, offCap, buildNet, label, OX0, byAgent, MAXROW, MAXDESK, LINGER, MAXROOM, who, dockPush, roleCol, PKT_TOK, emit, MAXCLOSED, drawSign, people, leave, addPerson, moveTo, modelCol, NEUTRAL, refreshVis, STK, col, stack, bankLab } = OS;
  const { scene } = OS.ctx;
  // ── sync: snapshot -> buildings, seats, people ──
  const shown = (a: Agent) => a.status === 'running' || a.status === 'waiting' || a.kind === 'main' || a.needsHuman;
  const tokOf = (t: Task) => t.agents.reduce((n, a) => n + a.tokens, 0), nameOf = (t: Task) => t.aicoId || cut(t.title || 'Untitled session', 30);
  const live = (a: Agent) => a.status === 'running' ? 2 : a.status === 'waiting' ? 1 : 0;
  function freeSeat(F: Office, zk: string, a: Agent): OfficeSeat | null {
    const L = F.seats.filter(s => s.zone === zk); if (zk[0] !== 'r') return L.find(s => !s.who) || null;
    return a.kind === 'main' ? (L[0].who ? null : L[0]) : L.find((s, i) => i > 0 && !s.who) || null;
  }
  function zoneSign(F: Office, zk: string, t: Task | null | undefined, extra?: string) {
    const o = F.zoneLab[zk]; o.task = t ? t.id : null; if (!t) return; const el = o.element, liveN = t.agents.filter(a => a.status === 'running').length, fin = t.agents.filter(a => a.kind !== 'main' && (a.status === 'done' || a.status === 'failed')).length;
    el.querySelector<HTMLElement>('.dot')!.style.color = t.needsHuman ? '#3d8bff' : liveN ? '#36d07a' : t.status === 'failed' ? '#ff3b2b' : t.status === 'waiting' ? '#d9962f' : '';
    el.querySelector('span')!.textContent = (extra ? extra + ' · ' : '') + nameOf(t); el.querySelector('.nd')!.textContent = 'needs you · ' + (NEED_TXT[t.needReason as NeedReason] || t.needReason || 'input');
    el.querySelector('small')!.textContent = fmt.tokens(tokOf(t)) + (fin ? ' · ' + fin + ' finished' : ''); el.classList.toggle('ask', !!t.needsHuman);
    el.title = t.title || '';
  }
  function sync(state: DashState, events: DashEvent[], deltas: Map<string, AgentDelta>, initial: boolean) {
    // up to the officeMax setting: a project with an agent at work first, then one that has its office already (so offices do not swap back
    // and forth), then the most recent; a new office takes the free cell nearest the bank
    const cap = offCap(), busy = (p: DashState['projects'][number]) => p.tasks.some(t => !t.closed && t.agents.some(a => a.status === 'running')) ? 2 : 0;
    const pick = new Set([...state.projects].sort((a, b) => busy(b) + +bldgs.has(b.id) - busy(a) - +bldgs.has(a.id) || (b.lastActivity || 0) - (a.lastActivity || 0)).slice(0, cap).map(p => p.id));
    for (const F of [...bldgs.values()]) if (!pick.has(F.id) || F.k >= cap) removeBuilding(F);
    for (const p of state.projects) { if (bldgs.has(p.id) || !pick.has(p.id)) continue; const k = slotUsed.indexOf(null); if (k >= 0 && k < cap) addBuilding(p, k); }
    const off = state.projects.length - bldgs.size;
    OS.syncStations(bldgs.size); OS.policeSync(); // one police station for every 20 offices (police-station.ts), with its units (police.ts)
    buildNet();
    if (off && !OS.moreLab) { OS.moreLab = label('sign more omore', ''); OS.moreLab.position.set(-OX0, .1, -22); OS.moreLab.center.set(.5, 1); scene.add(OS.moreLab); }
    if (OS.moreLab) { OS.moreLab.visible = off > 0; OS.moreLab.element.textContent = '+' + off + ' more office' + (off === 1 ? '' : 's') + ' in the list'; }
    const want = new Map<string, Want>(), now = Date.now(); byAgent.clear();
    for (const p of state.projects) { const F = bldgs.get(p.id); if (!F) continue;
      if (F.name !== p.name || F.color !== p.color) { F.name = p.name; F.color = p.color; }
      const open = p.tasks.filter(t => !t.closed), idle = (t: Task) => t.agents.some(a => live(a)) ? 0 : 1;
      F.closed = p.tasks.filter(t => t.closed).sort((x, y) => (y.endedAt || y.lastActivity || 0) - (x.endedAt || x.lastActivity || 0));
      for (let ri = 0; ri < MAXROW; ri++) if (F.rows[ri] && !open.some(t => t.id === F.rows[ri])) { F.rowOf.delete(F.rows[ri]!); F.rows[ri] = null; }
      for (const t of open.filter(t => !F.rowOf.has(t.id)).sort((x, y) => idle(x) - idle(y) || (x.startedAt || 0) - (y.startedAt || 0))) { const ri = F.rows.indexOf(null); if (ri < 0) break; F.rows[ri] = t.id; F.rowOf.set(t.id, ri); }
      const c = F.counts; c.run = 0; c.wait = 0; let need = false, why: string | null = '';
      const meetT = open.filter(t => t.mode === 'brainstorm'), kitT = open.filter(t => t.mode === 'cooler'), inRoom = { meet: 0, kit: 0 };
      for (const t of open) { if (t.needsHuman) { need = true; why = why || t.needReason; }
        for (const a of t.agents) { if (a.status === 'running') c.run++; else if (a.status === 'waiting') c.wait++; }
        const rz = F.rowOf.has(t.id) ? 'r' + F.rowOf.get(t.id) : null, room = t.mode === 'brainstorm' ? 'meet' : t.mode === 'cooler' ? 'kit' : null;
        if (!room) { if (rz) t.agents.filter(shown).sort(armOrder).slice(0, MAXDESK).forEach(a => want.set(a.id, { a, F, zk: rz })); continue; }
        // brainstorm and cooler: the lead plus one colleague per role (every turn is a new subagent of that role; the person stays)
        const main = t.agents.find(a => a.kind === 'main'), mz = room === 'meet' ? 'meet' : rz; if (main && mz) { want.set(main.id, { a: main, F, zk: mz }); if (mz === room) inRoom[room]++; }
        const by = new Map<string, { ids: string[]; a: Agent }>(); for (const a of t.agents) { if (a.kind === 'main') continue; let g = by.get(a.role); if (!g) by.set(a.role, g = { ids: [], a }); g.ids.push(a.id); if (live(a) > live(g.a) || (live(a) === live(g.a) && (a.lastActivity || 0) > (g.a.lastActivity || 0))) g.a = a; }
        for (const g of [...by.values()].filter(g => live(g.a) || g.a.needsHuman || now - (g.a.lastActivity || 0) < LINGER).sort((x, y) => (y.a.lastActivity || 0) - (x.a.lastActivity || 0))) { if (inRoom[room] >= MAXROOM) break; inRoom[room]++;
          const key = t.id + '|' + g.a.role; want.set(key, { a: g.a, F, zk: room, ids: g.ids, nocar: true, key }); for (const id of g.ids) byAgent.set(id, key); } }
      if (need !== c.need) F.wDirty = true; c.need = need; c.why = why;
      // packets: new tokens leave over the data line of the agent's seat
      if (!initial) for (const t of p.tasks) { const rz = !t.closed && F.rowOf.has(t.id) ? 'r' + F.rowOf.get(t.id) : null;
        for (const a of t.agents) { const d = deltas.get(a.id); if (!d || !(d.dTokens > 0)) continue; const P = who(a.id), mine = P && P.f === F; if (mine) P.talk = 8;
          if (reduced) { dockPush(F, roleCol(a.role)); continue; }
          const n = clamp(Math.ceil(d.dTokens / PKT_TOK), 1, 5); for (let i = 0; i < n; i++) emit(F, mine ? P.zk : rz, mine && P.seat && P.state === 'seat' ? P.seat.x : null, roleCol(a.role), i * .22); } }
      // signs
      for (let ri = 0; ri < MAXROW; ri++) zoneSign(F, 'r' + ri, F.rows[ri] ? open.find(t => t.id === F.rows[ri]) : null);
      zoneSign(F, 'meet', meetT[0], (meetT.length > 1 ? 'Brainstorm ×' + meetT.length : 'Brainstorm') + (inRoom.meet ? ' · ' + inRoom.meet + ' in the room' : ''));
      zoneSign(F, 'kit', kitT[0], (kitT.length > 1 ? 'Cooler ×' + kitT.length : 'Cooler') + (inRoom.kit ? ' · ' + inRoom.kit + ' at the cooler' : ''));
      const extra = open.length - F.rowOf.size; F.moreLab.element.textContent = extra > 0 ? '+' + extra + ' more session' + (extra === 1 ? '' : 's') : '';
      const le = F.lab.element; le.classList.toggle('nd', need); le.querySelector('b')!.textContent = need ? 'Needs you · ' + (NEED_TXT[why as NeedReason] || why || 'input') : p.name;
      le.querySelector('small')!.textContent = open.length + ' open · ' + F.closed.length + ' closed · ' + fmt.tokens(p.tasks.reduce((n, t) => n + tokOf(t), 0));
      const cb = F.cbLab.element; cb.querySelector('.h small')!.textContent = String(F.closed.length);
      cb.querySelector('.g')!.innerHTML = F.closed.slice(0, MAXCLOSED).map(t => { const end = t.endedAt || t.lastActivity, ck = t.agents.every(a => a.costKnown);
        return `<div class="cs st-${esc(t.status)}" data-task="${esc(t.id)}" tabindex="0" role="button" aria-label="${esc('Closed session ' + (t.title || ''))}"><b>${esc(nameOf(t))}</b><small>${esc(fmt.tokens(tokOf(t)) + ' · ' + costTxt(t.agents.reduce((n, a) => n + a.cost, 0), ck) + ' · ' + t.agents.length + ' agents')}</small><small>${esc(fmt.dur(end - (t.startedAt || end)) + ' · ended ' + clock(end))}</small></div>`; }).join('');
      cb.querySelector('.more2')!.textContent = F.closed.length > MAXCLOSED ? '+' + (F.closed.length - MAXCLOSED) + ' older' : '';
      if (F.signKey !== F.name + '|' + need) drawSign(F);
    }
    // a dispatched subagent first shows as pending (id p-…); when the real one turns up, the same person carries on under the new id
    for (const [id, d] of want) { if (people.has(id) || d.key || d.a.kind === 'main' || d.a.pending) continue;
      const P = [...people.values()].find(P => P.a.pending && !want.has(P.id) && P.f === d.F && P.a.taskId === d.a.taskId && P.a.role === d.a.role); if (!P) continue;
      people.delete(P.id); if (P.seat) P.seat.who = id; if (OS.pov && OS.pov.id === P.id) OS.pov.id = id; P.id = id; P.a = d.a; people.set(id, P); }
    // people: who leaves, who changes seat, who arrives
    for (const P of [...people.values()]) { const d = want.get(P.id); if (!d && P.a.pending && now - (P.lost = P.lost || now) < 8000) continue; // a background subagent: its dispatch is answered before it shows up, the person waits for it
      if (!d || d.F !== P.f) leave(P); else if (d.zk !== P.zk) { if (P.seat) P.seat.who = null; P.oldSeat = P.seat; P.seat = null; P.zk = d.zk; } }
    for (const [id, d] of want) { const P = people.get(id);
      if (!P) { const s = freeSeat(d.F, d.zk, d.a); if (s) addPerson(d.F, d, s, initial); continue; }
      P.a = d.a; P.ids = d.ids || null; if (!P.seat) { const s = freeSeat(d.F, d.zk, d.a); if (s) { const o = P.oldSeat; P.seat = P.state === 'seat' ? o : null; moveTo(P, s); P.oldSeat = null; } } }
    for (const F of bldgs.values()) { for (const s of F.seats) if (s.idx >= 0) { const P = s.who && people.get(s.who); F.tops.setColorAt(s.idx, P ? modelCol(P.a.model) : NEUTRAL); } F.tops.instanceColor!.needsUpdate = true; refreshVis(F); }
    // bank: the window total as a stack of drives, coloured by role share
    const T = DS.totals(), roles = DS.byRole(); OS.stackN = T.tokens > 0 ? clamp(Math.round(STK * Math.log10(1 + T.tokens / 1e5) / 4), 1, STK) : 0; if (initial || reduced) OS.stackShown = OS.stackN;
    let acc = 0, i = 0; const tot = roles.reduce((n, r) => n + r.tokens, 0) || 1; for (const r of roles) { acc += r.tokens; const end = Math.round(acc / tot * STK), c = col(r.color); for (; i < end; i++) stack.setColorAt(i, c); } stack.instanceColor!.needsUpdate = true;
    const be = bankLab.element; be.querySelector('b')!.textContent = fmt.tokens(T.tokens); be.querySelector('.u')!.textContent = costTxt(T.cost, T.costKnown) + ' · ≈ ' + Math.round(T.tokens / PKT_TOK).toLocaleString('en-US') + ' drives';
  }
  if (window.CWFun) window.CWFun.on(k => { if (k === 'officeMax' && DS.state) sync(DS.state, [], new Map(), false); }); // a new cap: offices come or go at once
  return { sync };
}
