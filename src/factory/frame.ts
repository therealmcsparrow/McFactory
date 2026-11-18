import * as THREE from 'three';
import { damp, easeIO, clamp, easeOut } from '../common/math.js';
import { setText } from '../common/text.js';
import type { FSAtFrame } from './state.js';
import type { Hall } from './types.js';

export function makeFrame(FS: FSAtFrame) {
  const { reduced, CH, R, BLUE, AMBER, GREEN, updateSun, whLab, facs, posLine, cr, dyingArms, killLine, relayout, rollersFrame, arms, startDying, reslot, animArm, armCrewFrame, freeArm, ARM_FOLD, poseArm, writeArm, AIM, robotsFrame, BRK, cratesFrame, tickSculptures, CAP, stackScale, stack, stackPos, mS, mM, mQ, ctx } = FS;
  let subT = 0; FS.frameMs = 0; FS.simT = 0;
  const BC2 = new THREE.Color();
  function shellFrame(f: Hall, dt: number, t: number) { // only the focused hall opens: walls sink to the low walls, roof lifts and fades (instant with reduced motion)
    const want = f.id === FS.focusF ? 1 : 0;
    if (f.op !== want) { f.op = reduced ? want : damp(f.op, want, 3.2, dt); if (Math.abs(f.op - want) < .004) f.op = want; }
    const e = easeIO(f.op), shut = f.op < .999, fade = 1 - Math.min(1, e * 1.4);
    if (f.shell) { f.shell.visible = shut; f.shell.scale.y = Math.max(.001, 1 - e); }
    if (f.roofG) { f.roofG.visible = shut; f.roofG.position.y = CH + e * 5; for (const m of [f.roofM, f.roofDM, f.skyM, f.beaconM, f.signM]) m.opacity = fade; }
    f.hit.scale.y = f.op > .5 ? 1 : CH + .3;
    // outside activity: skylights glow while agents run; roof beacon blue = needs you (flashing), amber = waiting, green = running
    f.skyM.emissiveIntensity = f.run ? .75 + Math.min(.35, f.run * .07) + (R ? Math.sin(t * 2 + f.k) * .08 : 0) : .08;
    if (f.need) BC2.copy(BLUE).multiplyScalar(reduced ? 1.6 : (t * 1.5) % 1 < .5 ? 2.6 : .15);
    else if (f.wait) BC2.copy(AMBER).multiplyScalar(R ? 1 + (Math.sin(t * 4) * .5 + .5) * 1.4 : 1.6);
    else if (f.run) BC2.copy(GREEN).multiplyScalar(1.5); else BC2.set('#2a2d33');
    f.beaconM.color.copy(BC2);
    for (const m of f.smoke) { const on = !!f.run && !reduced && shut; m.visible = on; if (!on) continue; // chimney smoke while agents run
      const u = (t * .25 + m.userData.ph) % 1; m.position.set(f.smokeAt[0] + u * .5, CH + e * 5 + 2.3 + u * 2.2, f.smokeAt[1] - u * .3); m.scale.setScalar(.7 + u * 1.8); m.material.opacity = .82 * Math.sin(u * Math.PI) * fade; }
  }
  function frame(dt: number, t: number) {
    FS.simT += dt; const t0 = performance.now(); frameBody(dt, t); FS.frameMs = FS.frameMs * .95 + (performance.now() - t0) * .05;
  }
  function frameBody(dt: number, t: number) {
    updateSun();
    whLab.visible = !FS.focusF; // the warehouse sign stays out of the open-hall view
    for (const f of facs.values()) {
      shellFrame(f, dt, t);
      const on = f.op > .5; // closed halls hide their line signs; the open (focused) hall shows them
      if (on !== f.det) { f.det = on; for (const l of f.lines) { l.lab.visible = on; l.hit.visible = on; } f.subLab.position.copy(f.subAt[on ? 1 : 0]); }
      const cb = on && f.closed.length > 0; if (cb !== f.cbOn) { f.cbOn = cb; f.cbLab.element.classList.toggle('show', cb); f.nameLab.visible = !cb; if (!cb) ctx.hud.tip(null); } // the board header carries the hall name while it shows
      if (f.fixS !== 1) { f.fixS = damp(f.fixS, 1, 3, dt); if (Math.abs(f.fixS - 1) < .002) f.fixS = 1; f.fix!.scale.z = f.fixS; f.cbLab.position.z = f.cbZ * f.fixS; }
      for (const l of f.lines) if (l.z !== l.zt) { l.z = damp(l.z, l.zt!, 3, dt); if (Math.abs(l.z - l.zt!) < .003) l.z = l.zt!; posLine(l); }
      for (const l of [...f.lines]) if (l.closing && !l.load && !cr.some(c => !c.dead && c.st === 'belt' && c.line === l) && ![...dyingArms].some(A => A.line === l)) { killLine(l); relayout(f); }
      const sub = f.id === FS.hoverHall || f.id === FS.focusF || !!f.signHov; if (sub !== f.subOn) { f.subOn = sub; f.subLab.element.classList.toggle('show', sub); }
      // a line's belt runs while it has work (agent cycling or token flow) or crates still riding it; eases to stop/start
      for (const l of f.lines) { l.sp = damp(l.sp, (l.work || l.load > 0) ? 1 : 0, 2.2, dt); if (l.sp < .002 && !l.work && !l.load) l.sp = 0; if (l.load && l.sp < .05) l.sp = .05; l.bt.offset.x -= dt * f.speed * R * l.sp / 1.2; l.work = false; }
      // a crate within the 1.2 units before the exit already wakes the cross conveyor, so it is moving when the crate arrives
      f.cs = damp(f.cs, f.crossLoad > 0 ? 1 : 0, 4, dt); if (f.cs < .002 && !f.crossLoad) f.cs = 0;
      if (f.crossLoad && f.cs < .05) f.cs = .05; // never stall a loaded conveyor
      f.ct.offset.x -= dt * 1.4 * R * f.cs / 1.2;
      rollersFrame(f, dt);
    }
    for (const A of arms.values()) { const a = A.a; if (A.cycling || (a.status === 'running' && a.rate > 0 && Date.now() - a.lastActivity < 60e3)) A.line.work = true; }
    for (const A of [...arms.values()]) if (A.leaving && (!A.cycling || A.dropped)) { const l = A.line; startDying(A, true); reslot(l); }
    for (const A of arms.values()) { A.hit.visible = A.line.f.op > .5; animArm(A, dt, t); }
    armCrewFrame(dt, t);
    for (const A of [...dyingArms]) { A.dying += dt; A.heldVis = false;
      if (A.fin && (reduced || !A.line.f.det)) { freeArm(A); continue; } // finished agent in a closed hall / reduced motion: gone at once
      if (A.retire) { // finished agent: fold (eased), then the removal crew takes it apart (crewFrame writes its pieces)
        if (A.dis) continue;
        A.yaw = damp(A.yaw, ARM_FOLD, 5, dt); A.r = damp(A.r, .32, 5, dt); A.h = damp(A.h, 1.25, 5, dt); poseArm(A);
        if (A.dying > .55 && !A.queued) { A.queued = true; const f = A.line.f; (f.junk || (f.junk = [])).push(A); }
        writeArm(A); continue; }
      A.sc.scale.setScalar(Math.max(.001, A.scale * (1 - easeIO(Math.min(1, A.dying / .7))))); if (A.dying > .7) freeArm(A); else writeArm(A); }
    for (const P of AIM) { P.im.instanceMatrix.needsUpdate = true; if (P.im.instanceColor) P.im.instanceColor.needsUpdate = true; }
    robotsFrame(dt, t);
    BRK.frame(dt, t); // breakdowns: after the robots, before the crates (crates ride the towed robot)
    cratesFrame(dt);
    tickSculptures(dt);
    if ((subT += dt) > .5) { subT = 0; for (const f of facs.values()) { const q = f.dock.queue.length; if (q !== f.q) { f.q = q; setText(f.subQ, q ? `dock: ${q} crate${q === 1 ? '' : 's'} waiting` : 'dock clear'); } } }
    const snap = reduced || FS.snapPile; FS.snapPile = false;
    const prevShown = Math.floor(FS.shown); FS.shown = snap ? FS.target : damp(FS.shown, FS.target, 1.6, dt); if (Math.abs(FS.shown - FS.target) < .5) FS.shown = FS.target;
    const n = Math.round(FS.shown); let dirtyC = false, dirtyM = false;
    for (let i = 0; i < CAP; i++) {
      const want = i < n ? 1 : 0; const cur = stackScale[i]; if (cur === want) continue;
      const nx = snap ? want : clamp(cur + (want ? dt * 4 : -dt * 6), 0, 1); stackScale[i] = nx;
      if (want && cur === 0) { const f = (i + .5) / Math.max(n, 1); const col = (FS.stackColors.find(x => f <= x[0] + 1e-6) || FS.stackColors[FS.stackColors.length - 1] || [0, new THREE.Color('#c9a77a')])[1]; stack.setColorAt(i, col); dirtyC = true; }
      const p = stackPos(i); p.y += (1 - easeOut(nx)) * .8; mS.setScalar(Math.max(.0001, easeOut(nx))); mM.compose(p, mQ.identity(), mS); stack.setMatrixAt(i, mM); dirtyM = true;
    }
    if (dirtyM) stack.instanceMatrix.needsUpdate = true;
    if (dirtyC) stack.instanceColor!.needsUpdate = true;
    if (prevShown !== Math.floor(FS.shown) || (t % 5) < dt) { for (let i = 0; i < n; i++) { const f = (i + .5) / Math.max(n, 1); const e = FS.stackColors.find(x => f <= x[0] + 1e-6) || FS.stackColors[FS.stackColors.length - 1]; if (e) stack.setColorAt(i, e[1]); } if (stack.instanceColor) stack.instanceColor.needsUpdate = true; }
  }
  return { frame };
}
