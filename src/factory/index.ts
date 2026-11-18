// The factory scene: one hall per project, one conveyor line per session, one robot arm per agent; AGVs carry the
// crates to the central warehouse. buildScene(ctx) is called once by startApp (app/stage.ts) and returns the scene API.
//
// Module pattern: each part of the scene is a maker `makeX(FS)` that takes the shared factory state FS, builds its
// meshes and returns what the later parts need; buildScene merges every result into FS in order. Values that more
// than one part reassigns (focusF, hovered, unit, shown, target, rateAcc, routeRoads ...) live on FS itself, and a
// part that calls into a later part does so through FS at call time (FS.BRK, FS.dockFor ...), never at build time.
import * as THREE from 'three';
import type { SceneCtx } from '../common/types.js';
import type { FactoryState } from './state.js';
import type { ArmNode, PickTask, Robot } from './types.js';
import { makeLayout } from './layout.js';
import { makeHalls } from './halls.js';
import { makeWarehouse } from './warehouse.js';
import { makeRoads } from './roads.js';
import { makeSculptures } from './sculptures.js';
import { makeArms } from './arms.js';
import { makeCrew } from './crew.js';
import { makeCrates } from './crates.js';
import { makeAgvs } from './vehicles/agv.js';
import { makeTowTruck } from './vehicles/tow-truck.js';
import { makeSync } from './sync.js';
import { makeFrame } from './frame.js';
import { makeFocus } from './focus.js';

export function buildScene(ctx: SceneCtx) {
  const FS = { ctx } as FactoryState;
  Object.assign(FS, makeLayout(FS)); // lights, layout constants, materials, belt rollers
  Object.assign(FS, makeHalls(FS)); // halls and their conveyor lines
  Object.assign(FS, makeWarehouse(FS)); // outbound docks, the warehouse pile
  Object.assign(FS, makeRoads(FS)); // road network, roundabouts, parking bays
  Object.assign(FS, makeSculptures(FS)); // roundabout decor
  Object.assign(FS, makeArms(FS)); // robot arms: instancing, line filling, posing
  Object.assign(FS, makeCrew(FS)); // removal crew for finished arms
  Object.assign(FS, makeCrates(FS));
  Object.assign(FS, makeAgvs(FS)); // transport robots
  Object.assign(FS, makeTowTruck(FS)); // breakdowns: tow truck, mechanics, garage
  Object.assign(FS, makeSync(FS)); // data sync, boards, hover
  Object.assign(FS, makeFrame(FS)); // per-frame update
  Object.assign(FS, makeFocus(FS)); // labels, focus, camera framing
  const { docks, cr, robots, arms, facs, lineIdx, stats, frame, dyingArms, pathAt, BELT_TOP, CRATE_BASE, G, stopOf, newCrate, crateCol, W, XC, BRK, controls, camera, sync, layoutLabels, focusOf, anchorOf, hover, home, markLine } = FS;
  // read-only probe for tests: crate accounting and robot states
  window.__fac = {
    stats: () => { let queued = 0, carried = 0, dropping = 0; for (const dk of docks) if (dk) queued += dk.queue.length; for (const c of cr) if (!c.dead) { if (c.st === 'deck' || c.st === 'agv') carried++; else if (c.st === 'drop') dropping++; }
      return Object.assign({ queued, carried, dropping, robots: robots.length, want: FS.fleetWant, arms: arms.size, factories: facs.size, lines: lineIdx.size, crates: cr.length }, stats); },
    ms: () => FS.frameMs, simT: () => FS.simT,
    path: (id: number) => { const r = robots.find(r => r.id === id); return r && r.path ? { s: r.s, pts: r.path.pts.map(p => [+p[0].toFixed(2), +p[1].toFixed(2)]), cum: r.path.cum.map(v => +v.toFixed(1)) } : null; },
    step(sec: number, dt = 1 / 30) { for (let n = Math.round(sec / dt); n > 0; n--) frame(dt, FS.simT); }, // test hook: advance the simulation without rendering
    armList: () => [...arms.values()].map(A => ({ id: A.a.id, st: A.a.status, kind: A.a.kind, line: A.line.id, si: A.si, lv: !!A.leaving, cy: A.cycling, dr: A.dropped })), dyingN: () => dyingArms.size,
    belts: () => [...facs.values()].map(f => ({ id: f.id, cross: { off: f.ct.offset.x, sp: f.cs, load: f.crossLoad, rd: f.cd, rollers: f.crossR.length }, lines: f.lines.map(l => ({ id: l.id, off: l.bt.offset.x, sp: l.sp, load: l.load, rd: l.rd })) })),
    info: () => { const i = ctx.renderer.info.render; return { calls: i.calls, tris: i.triangles }; },
    robots: () => robots.map(r => ({ hx: r.hx, hz: r.hz, s: r.s, back: r.back || 0, Jd: (r.J || []).map(j => [j.n.id, +j.a.toFixed(1), +j.b.toFixed(1), j.held ? 1 : 0, j.done ? 1 : 0]), ahead: r.path ? [-1, 0, 1, 2, 3, 4].map(d => pathAt(r.path, Math.max(0, r.s + d), r.pi).map(v => +v.toFixed(2))) : null, id: r.id, st: r.st, load: r.load.length, x: r.x, z: r.z, wait: !!r.wait, v: r.v, task: r.task && r.task.kind, to: r.path && r.path.pts[r.path.pts.length - 1], left: r.path ? r.path.len - r.s : 0, born: r.born, dying: r.dying, idle: r.idle, held: (r.J || []).filter(j => j.held).map(j => j.n.id), dk: r.task && (r.task as PickTask).dk ? (r.task as PickTask).dk.k : null, unstuck: r.unstuck || 0, why: r.why || '', blk: r.blk ? (r.blk as Robot).id : null, wb: (() => { const j = (r.J || []).find(j => !j.held && !j.done); return j ? [j.n.id, +(j.a - r.s).toFixed(1), ...[...j.n.hs].map(h => (h.r as Robot).id + ':' + h.r.st + ':' + h.r.v.toFixed(1) + ':' + (h.r.blk ? (h.r.blk as Robot).id : '-') + ':' + ((h.r as Robot).task && (h.r as Robot).task!.kind))] : null; })() })),
    crateGap: () => { const out = { belt: [] as number[], cross: [] as number[], held: [] as number[], top: BELT_TOP, at: null as number[] | null }, v = new THREE.Vector3(); // crate base minus the surface it stands on
      for (const c of cr) if (!c.dead && (c.st === 'belt' || c.st === 'cross')) { if (!out.at && c.st === 'belt') out.at = [c.w.x, c.w.z]; out[c.st].push(c.w.y - CRATE_BASE - (c.st === 'cross' && c.f ? c.f.crossTop ?? BELT_TOP : BELT_TOP)); }
      for (const A of arms.values()) if (A.cycling && A.heldVis && A.u > .55) { A.held.getWorldPosition(v); out.held.push(v.y + G.held.boundingBox!.min.y * A.scale - BELT_TOP); }
      return out; },
    docks: () => docks.filter(Boolean).map(dk => ({ k: dk.k, q: dk.queue.length, res: dk.reserved, cl: dk.claims || 0, st: !!stopOf({ kind: 'dock', dk }), f: !!dk.f })),
    flood(n: number) { const fs = [...facs.values()]; for (let i = 0; i < n && fs.length; i++) { const f = fs[i % fs.length], c = newCrate(crateCol('qa')); if (!c) return; // test hook: crates straight onto docks
      W(f, XC, (f.crossTop ?? BELT_TOP) + CRATE_BASE, 0, c.w); c.dock = f.dock; c.st = 'hop'; c.t = 0; c.from = c.w.clone(); c.qi = f.dock.queue.length; f.dock.queue.push(c); stats.docked++; FS.rateAcc++; } },
    armPts: () => [...arms.values(), ...dyingArms].map(A => ({ id: A.a.id, line: A.line.id, si: A.si, s: A.scale, pts: ['turn', 'sh', 'el', 'wr', 'held'].map(n => A[n as ArmNode].getWorldPosition(new THREE.Vector3()).toArray()) })), // test hook: arm joint world positions
    breakdown: (id?: number) => BRK.force(id), tow: () => BRK.info(), // test hooks: force a breakdown (any eligible robot, or robot id), breakdown phase
    view(x: number, z: number, zoom: number) { controls.autoRotate = false; controls.target.set(x, 0, z); camera.position.set(x + 30, 31, z + 30); camera.zoom = zoom; camera.updateProjectionMatrix(); },
  };
  { const b = document.getElementById('brk'); // HUD button: force a breakdown now, show the step, re-enable when the repair is over
    if (b) { const STEP = { pull: 'Towing…', wait: 'Towing…', out: 'Towing…', hook: 'Towing…', tow: 'Towing…', drop: 'Repairing…', fix: 'Repairing…', roll: 'Back on the road…' };
      const set = (txt: string, off: boolean, tip: string, busy: boolean) => { if (b.textContent !== txt) b.textContent = txt; b.setAttribute('aria-disabled', off ? 'true' : 'false'); b.dataset.busy = busy ? 'true' : 'false'; b.title = tip;
        b.setAttribute('aria-label', busy ? 'Breakdown in progress: ' + txt.replace('…', '') : off ? 'Break down a robot (no robots yet)' : 'Break down a robot'); };
      const upd = () => { const i = BRK.info();
        if (i.ph) set(STEP[i.ph as keyof typeof STEP] || 'Repairing…', true, 'A breakdown is running', true);
        else if (i.sending) set('Sending a robot out…', true, 'A parked robot is taking a short test drive to a clear stretch of road', true);
        else if (i.pending) set('Waiting for traffic…', true, 'Waiting for a robot to drive past a clear stretch of road', true);
        else if (!robots.length) set('Break down', true, 'No robots on the floor yet', false);
        else set('Break down', false, 'Force a robot breakdown: watch the tow truck and the repair garage', false); };
      b.addEventListener('click', () => { if (b.getAttribute('aria-disabled') === 'true') return; BRK.force(); upd(); });
      upd(); setInterval(upd, 250); } }
  function robotAt(cx: number, cy: number) { // the robot under a screen point (instanced, so by projected distance), or null
    const v = new THREE.Vector3(), W = innerWidth, H = innerHeight; let best: Robot | null = null, bd = Math.max(22, 32 * ctx.camera.zoom) ** 2; // generous: the robots are small and keep moving
    for (const r of robots) { if (r.dying || r.born < 1) continue; v.set(r.x, .2, r.z).project(ctx.view);
      const d = ((v.x + 1) / 2 * W - cx) ** 2 + ((1 - v.y) / 2 * H - cy) ** 2; if (d < bd) { bd = d; best = r; } }
    return best && { id: best.id, canDrive: best.st === 'go' && !best.broken && !best.towed && !best.shoulder, moving: best.v > .3 };
  }
  function driveRobot(id: number) { const r = robots.find(o => o.id === id); if (!r || r.st !== 'go' || r.broken || r.towed || r.shoulder) return false; r.force = 2.5; r.back = 0; return true; }
  window.__fac.drive = driveRobot; // test hook
  return { sync, frame, layoutLabels, focusOf, anchorOf, hover, home, robotAt, driveRobot, unfocus() { FS.focusF = null; markLine(null); }, onFloor: (id: string) => facs.has(id),
    lineSlots: (id: string) => { const l = lineIdx.get(id); return l ? new Set(l.slots.filter(Boolean) as string[]) : null; } };
}
