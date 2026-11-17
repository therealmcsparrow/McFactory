import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { easeOut, easeIO } from '../common/math.js';
import type { FSAtCrates } from './state.js';
import type { Arm, Crate } from './types.js';

export function makeCrates(FS: FSAtCrates) {
  const { mat, Z0, scene, crateCol, W, BELT_TOP, facs, arms, docks, QI, XC, R, dockSpot, tv, arc, seg, mS, mM } = FS;
  // ── crates (instanced): belt → cross conveyor → dock → robot deck → warehouse pile
  const crateG = new RoundedBoxGeometry(.34, .3, .34, 2, .03).translate(0, .15, 0);
  crateG.computeBoundingBox(); const CRATE_BASE = -crateG.boundingBox!.min.y; // origin-to-base offset: a crate at y = top + CRATE_BASE stands on that top
  const MAXC = 2400; const crates = new THREE.InstancedMesh(crateG, mat('#ffffff', { roughness: .55 }), MAXC); crates.castShadow = true; crates.frustumCulled = false; crates.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  for (let i = 0; i < MAXC; i++) { crates.setMatrixAt(i, Z0); crates.setColorAt(i, new THREE.Color('#fff')); } crates.count = 0; scene.add(crates);
  const freeC: number[] = []; for (let i = MAXC - 1; i >= 0; i--) freeC.push(i);
  const cr: Crate[] = []; let crHW = 0, crColDirty = false;
  const stats = { docked: 0, delivered: 0 };
  function newCrate(col: THREE.Color): Crate | null {
    let i: number;
    if (freeC.length) i = freeC.pop()!;
    else { const k = cr.findIndex(c => !c.dead && (c.st === 'belt' || c.st === 'cross')); if (k < 0) return null; i = cr[k].i; cr[k] = cr[cr.length - 1]; cr.pop(); } // pool full: recycle a crate not yet docked
    crHW = Math.max(crHW, i + 1); crates.setColorAt(i, col); crColDirty = true;
    const c = { i, st: 'belt', w: new THREE.Vector3(), born: 0, t: 0, dead: false } as Crate; cr.push(c); return c;
  }
  function dropCrate(A: Arm) { const c = newCrate(crateCol(A.a.role)); if (!c) return; c.line = A.line; c.lx = A.ax; c.born = 1; W(A.line.f, c.lx, BELT_TOP + CRATE_BASE, A.line.z, c.w); } // full size at once: it replaces the held crate
  const rq = new Map();
  function cratesFrame(dt: number) {
    for (const f of facs.values()) { f.backlog = f.dock.queue.length; f.crossLoad = 0; for (const l of f.lines) l.load = 0; }
    for (const A of arms.values()) if (A.cycling && !A.dropped) A.line.f.backlog++;
    for (const dk of docks) if (dk) dk.queue.forEach((c, i) => { c.qi = i; });
    for (let k = cr.length - 1; k >= 0; k--) {
      const c = cr[k];
      if (c.dead) { crates.setMatrixAt(c.i, Z0); freeC.push(c.i); cr[k] = cr[cr.length - 1]; cr.pop(); continue; }
      c.born = Math.min(1, c.born + dt * 4); let s = easeOut(c.born), q = QI;
      switch (c.st) {
        case 'belt': { const l = c.line!; l.f.backlog++; l.load++; if (c.lx > XC - 1.2) l.f.crossLoad++; c.lx += dt * l.f.speed * (R || .5) * (R ? l.sp : 1); W(l.f, Math.min(c.lx, XC), BELT_TOP + CRATE_BASE, l.z, c.w);
          if (c.lx >= XC) { c.st = 'cross'; c.f = l.f; c.lz = l.z; c.line = null; } break; }
        case 'cross': { c.f!.backlog++; c.f!.crossLoad++; const v = dt * 1.4 * (R || .5) * (R ? c.f!.cs : 1); c.lz = Math.abs(c.lz) <= v ? 0 : c.lz - Math.sign(c.lz) * v; W(c.f!, XC, (c.f!.crossTop ?? BELT_TOP) + CRATE_BASE, c.lz, c.w);
          if (c.lz === 0) { const dk = c.f!.dock; c.dock = dk; c.st = 'hop'; c.t = 0; c.from = c.w.clone(); c.qi = dk.queue.length; dk.queue.push(c); stats.docked++; FS.rateAcc++; c.f = null; } break; }
        case 'hop': case 'dock': { dockSpot(c.dock, c.qi, tv);
          if (c.st === 'hop') { c.t = Math.min(1, c.t + dt / .55); arc(c.from, tv, c.t, .7, c.w); if (c.t >= 1) c.st = 'dock'; } else c.w.lerp(tv, 1 - Math.exp(-10 * dt)); break; }
        case 'deck': case 'agv': { const r = c.robot; FS.deckSpot(r, c.slot, tv); q = r.q; s *= Math.max(.001, r.scale);
          if (c.st === 'deck') { c.t = Math.min(1, c.t + dt / .45); arc(c.from, tv, c.t, .6, c.w); if (c.t >= 1) c.st = 'agv'; } else c.w.copy(tv); break; }
        case 'drop': { c.t = Math.min(1, c.t + dt / .75); arc(c.from, c.to, c.t, 1.6, c.w); s *= 1 - easeIO(seg(c.t, .8, 1));
          if (c.t >= 1) { c.dead = true; stats.delivered++; } break; }
      }
      mS.setScalar(Math.max(.001, s)); mM.compose(c.w, q, mS); crates.setMatrixAt(c.i, mM);
    }
    crates.count = crHW; crates.instanceMatrix.needsUpdate = true; if (crColDirty) { crates.instanceColor!.needsUpdate = true; crColDirty = false; }
  }
  return { CRATE_BASE, cr, stats, newCrate, dropCrate, cratesFrame };
}
