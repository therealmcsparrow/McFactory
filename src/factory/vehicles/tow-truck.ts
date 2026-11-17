import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { damp, easeIO } from '../../common/math.js';
import type { P2 } from '../../common/types.js';
import type { FSAtTowTruck } from '../state.js';
import type { Breakdown, Mover, NetEdge, RbPlan, Robot, Stop, StopRef, TowTruckState } from '../types.js';

export function makeTowTruck(FS: FSAtTowTruck) {
  const { scene, L, slabM, wallM, pierM, roofM, yellowM, extraLabs, steel, mat, dark, WG, NET, hereStop, inBox, ZG, CX1, RLEAD, docks, LBD, eAt, robots, distTo, leaveSpot, goTo, dropClaim, spotClaim, freeBoxes, buildPath, L1, eProj, LB, R, routePts, ACC, aheadGap, GAPD, DEC, mergeStop, rbStop, sepHold, ZAX, YAX, mP, mS, mM, RIM, AMBER, GREEN, OFFC, QI, Z0, goDrop, afterTask, reduced, ctx } = FS;
  // ── breakdowns: now and then (one at a time, mean ~4 min of fleet driving, never with reduced motion) a robot on a plain road
  //    stretch breaks down: it pulls onto the right shoulder (smoke, hazard blinkers) and leaves dispatch (r.broken; r.shoulder = others pass it).
  //    A tow truck leaves the repair garage, hooks it, tows it back; two mechanics fix it; it rolls out and re-enters service.
  //    Its crates stay on its deck the whole time (still "carried"), so docked = queued + carried + dropping + delivered holds.
  const BRK = (() => {
    const GX = 4.9, GZ = 17.7, GW = 3.4, GD = 2.6, DOORZ = 16.0, RBX = GX - .8, TBX = GX + .85, BZ = GZ + .25, VT = 3.2, MEAN = 240;
    const NORTH = Math.PI / 2, SOUTH = -Math.PI / 2;
    const g = new THREE.Group(); scene.add(g);
    // garage: floor, west wall, posts, shed roof over the north part (south and east stay open toward the camera), hazard stripes at the door
    { const fl: THREE.BufferGeometry[] = [], wl: THREE.BufferGeometry[] = [], ps: THREE.BufferGeometry[] = [], rf: THREE.BufferGeometry[] = [], st: THREE.BufferGeometry[] = [], x0 = GX - GW / 2, x1 = GX + GW / 2, z0 = GZ - GD / 2, z1 = GZ + GD / 2;
      fl.push(new THREE.BoxGeometry(GW, .05, GD).translate(GX, .025, GZ));
      wl.push(new THREE.BoxGeometry(.1, 1.5, GD).translate(x0 + .05, .75, GZ), new THREE.BoxGeometry(.9, 1.5, .1).translate(x0 + .45, .75, z0 + .05));
      for (const [x, z] of [[x1 - .06, z0 + .06], [x1 - .06, z1 - .06], [x0 + .06, z1 - .06], [GX + .02, z0 + .06]]) ps.push(new THREE.BoxGeometry(.12, 1.5, .12).translate(x, .75, z));
      rf.push(new THREE.BoxGeometry(GW + .2, .08, 1.7).translate(GX, 1.54, z0 + .85), new THREE.BoxGeometry(GW, .06, .1).translate(GX, 1.5, z1 - .06));
      for (let k = 0; k < 9; k++) { const x = x0 + .95 + k * .27; L(st, x, z0 - .05, x + .14, z0 - .3, .08, .006); }
      const fm = new THREE.Mesh(mergeGeometries(fl), slabM); fm.receiveShadow = true;
      const wm = new THREE.Mesh(mergeGeometries(wl), wallM), pm = new THREE.Mesh(mergeGeometries(ps), pierM), rm = new THREE.Mesh(mergeGeometries(rf), roofM), sm = new THREE.Mesh(mergeGeometries(st), yellowM);
      for (const m of [wm, pm, rm]) { m.castShadow = true; m.receiveShadow = true; } g.add(fm, wm, pm, rm, sm);
      const be = document.createElement('div'); be.className = 'sign more'; be.textContent = 'Repair'; const bl = new ctx.CSS2DObject(be); bl.position.set(GX, .1, z1 + .5); bl.center.set(.5, 0); g.add(bl); extraLabs.push(bl); }
    const jack = new THREE.Mesh(new THREE.BoxGeometry(.6, .1, .8), steel); jack.position.set(RBX, .02, BZ); jack.castShadow = true; g.add(jack);
    // tow truck: +x forward (same yaw convention as the robots)
    const redM = mat('#d4421a', { roughness: .45, metalness: .25 }), barM = new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false });
    const truck = new THREE.Group(); g.add(truck);
    { const red = [new THREE.BoxGeometry(.42, .36, .56).translate(.4, .42, 0), new THREE.BoxGeometry(.08, .62, .08).rotateZ(-.55).translate(-.45, .5, 0), new THREE.BoxGeometry(.1, .1, .5).translate(-.66, .2, 0)];
      const drk: THREE.BufferGeometry[] = [new THREE.BoxGeometry(1.25, .12, .56).translate(0, .18, 0), new THREE.BoxGeometry(.05, .15, .48).translate(.62, .48, 0)];
      for (const x of [-.38, .38]) for (const z of [-.29, .29]) drk.push(new THREE.CylinderGeometry(.11, .11, .08, 10).rotateX(Math.PI / 2).translate(x, .11, z));
      const tr = [new THREE.BoxGeometry(.7, .05, .52).translate(-.2, .26, 0), new THREE.BoxGeometry(.02, .3, .02).translate(-.62, .62, 0)];
      const a = new THREE.Mesh(mergeGeometries(red), redM), b = new THREE.Mesh(mergeGeometries(drk), dark), c = new THREE.Mesh(mergeGeometries(tr), steel), d = new THREE.Mesh(new THREE.BoxGeometry(.1, .06, .42).translate(.4, .63, 0), barM);
      for (const m of [a, b, c]) m.castShadow = true; truck.add(a, b, c, d); }
    const T = { st: 'go', isTruck: true, RB: [], Ms: [], mi: 0, J: [], x: TBX, z: BZ, yaw: NORTH, hx: 0, hz: -1, v: 0, s: 0, pi: 0, P: null, stuck: 0, scale: 1, dying: 0 } as TowTruckState;
    // mechanics: hi-vis vest, hard hat, wrench arm (shared geometry and materials)
    const WG = { body: mergeGeometries([new THREE.BoxGeometry(.13, .22, .08).translate(0, .11, 0), new THREE.BoxGeometry(.17, .2, .11).translate(0, .32, 0)]),
      head: new THREE.SphereGeometry(.06, 10, 8).translate(0, .48, 0), hat: mergeGeometries([new THREE.SphereGeometry(.072, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, .5, 0), new THREE.CylinderGeometry(.09, .09, .012, 12).translate(0, .505, 0)]),
      arm: mergeGeometries([new THREE.BoxGeometry(.04, .17, .04).translate(0, -.085, 0), new THREE.BoxGeometry(.03, .1, .02).translate(0, -.2, 0)]) };
    const WM = { body: mat('#ff7a1a', { roughness: .7 }), head: mat('#c79a76', { roughness: .8 }), hat: mat('#ffd21a', { roughness: .4 }), arm: mat('#3a5a8a', { roughness: .7 }) };
    const crew = [0, 1].map(i => { const w = new THREE.Group(); for (const k of ['body', 'head', 'hat']) { const m = new THREE.Mesh(WG[k as keyof typeof WG], WM[k as keyof typeof WM]); m.castShadow = k === 'body'; w.add(m); }
      const arm = new THREE.Mesh(WG.arm, WM.arm); arm.position.set(0, .4, .1); w.add(arm); w.userData.arm = arm; w.position.set(GX - .1 + i * .45, .05, GZ + 1); g.add(w); return w; });
    // sparks (instanced), smoke puffs, hazard blinkers that ride on the broken robot
    const NS = 12, sparks = new THREE.InstancedMesh(new THREE.BoxGeometry(.035, .035, .035), new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffc861').multiplyScalar(3), toneMapped: false }), NS);
    sparks.frustumCulled = false; sparks.visible = false; g.add(sparks); const sp = Array.from({ length: NS }, () => ({ t: 1, p: new THREE.Vector3(), v: new THREE.Vector3() }));
    const puffG = new THREE.SphereGeometry(.16, 8, 6), puffs = Array.from({ length: 6 }, () => { const m = new THREE.Mesh(puffG, new THREE.MeshBasicMaterial({ color: '#8d9399', transparent: true, depthWrite: false, opacity: 0 })); m.visible = false; g.add(m); return m; });
    const hazM = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffa21a').multiplyScalar(3), toneMapped: false });
    const haz = new THREE.Mesh(mergeGeometries([[.47, .3], [.47, -.3], [-.47, .3], [-.47, -.3]].map(([x, z]) => new THREE.BoxGeometry(.07, .07, .07).translate(x, .24, z))), hazM); haz.matrixAutoUpdate = false; haz.visible = false; scene.add(haz);
    let S: Breakdown | null = null, driveT = 0, nextAt = -Math.log(Math.random() || .5) * MEAN, pending = false, count = 0, pendT = 0, testR: Robot | null = null; const OBST: Mover[] = [];
    const FR = () => NET.spots[0] && NET.spots[0].e; // eastbound front-road lane, the garage sits off its right side
    const laneHere = (x: number, z: number, hx: number, hz: number) => { const H = hereStop({ x, z, hx, hz }); return H && H.st; };
    function eligible(r: Robot, vmin = .6) { // vmin: a button press accepts slower robots (still on plain road, never near lay-bys)
      if (r.st !== 'go' || r.dying || r.born < 1 || r.v < vmin || r.wait || inBox(r)) return null; if (Math.abs(r.z) < ZG + 1.6 && Math.abs(r.x) < CX1 + 1) return null; // never inside the warehouse passages or on a junction box
      const L0 = laneHere(r.x, r.z, r.hx, r.hz);
      if (!L0 || L0.e.kind !== 'road' || L0.t < 2.5 || L0.t > L0.e.len - 2.1 - RLEAD - .5) return null; // the truck stops 2.1 ahead: keep that spot clear of the roundabout lead-in, or the tow route starts with a reversal into the queue behind it
      for (const s of NET.spots) if (s.e === L0.e && Math.abs(s.t - L0.t) < 3) return null; // never beside a parking lay-by
      for (const dk of docks) if (dk && dk.st && dk.st.e === L0.e && Math.abs(dk.st.t - L0.t) < LBD + 1.5) return null; // or a dock lay-by
      return L0;
    }
    function wake() { // button pressed, nobody on a safe stretch: send the parked robot with the shortest drive on a test drive (normal routing and traffic rules, no crate job), break it down once it is on the stretch
      const cand: { e: NetEdge; t: number }[] = [];
      for (const e of NET.edges) { if (e.kind !== 'road') continue; let run: { a: number; b: number } | null = null, best: { a: number; b: number } | null = null; // longest run of the edge that passes the same checks as eligible()
        for (let t = 2.5; t <= e.len - 2.1 - RLEAD - .5; t += .5) { const p = eAt(e, t); let ok = !(Math.abs(p[1]) < ZG + 1.6 && Math.abs(p[0]) < CX1 + 1);
          if (ok) for (const s of NET.spots) if (s.e === e && Math.abs(s.t - t) < 3) { ok = false; break; }
          if (ok) for (const dk of docks) if (dk && dk.st && dk.st.e === e && Math.abs(dk.st.t - t) < LBD + 1.5) { ok = false; break; }
          if (ok) { if (!run) run = { a: t, b: t }; else run.b = t; if (!best || run.b - run.a > best.b - best.a) best = { a: run.a, b: run.b }; } else run = null; }
        if (best && best.b - best.a >= 3) cand.push({ e, t: best.b }); }
      let bR: Robot | null = null, bD: StopRef | null = null, bc = 1e8;
      for (const r of robots) { if (r.st !== 'park' || r.task || r.load.length || r.dying || r.born < 1 || r.broken) continue;
        for (const c of cand) { const d: StopRef = { kind: 'here', st: { e: c.e, t: c.t, spot: null }, v: NET.ver }, k = distTo(r, d); if (k < bc) { bc = k; bR = r; bD = d; } } }
      if (!bR) return false;
      leaveSpot(bR); bR.task = { kind: 'test' }; bR.idle = 0; testR = bR; goTo(bR, bD!); return true;
    }
    function breakDown(r: Robot, L0: Stop) {
      const k = r.task; if (k) { if (k.kind === 'pick') { k.dk.reserved -= k.k; k.dk.claims = Math.max(0, (k.dk.claims || 1) - 1); }
        else if (k.kind === 'drop') dropClaim.set(k.key, Math.max(0, (dropClaim.get(k.key) || 0) - 1)); else if (k.kind === 'home' && spotClaim[k.i] === r) spotClaim[k.i] = null; }
      leaveSpot(r); freeBoxes(r); r.task = null; r.st = 'broken'; r.broken = true; r.shoulder = true; r.v = 0; r.wait = false; r.stillT = 0; r.ry = 0; r.pitch = 0;
      const p = eAt(L0.e, L0.t + .6); S = { r, ph: 'pull', t: 0, L: L0, lx: r.x, lz: r.z, lh: [r.hx, r.hz], ver: NET.ver, p0: [r.x, r.z], p1: [p[0] + L0.e.n[0] * 1.05, p[1] + L0.e.n[1] * 1.05], y0: r.yaw }; count++;
    }
    function plan(pts: P2[], V: RbPlan[], M?: P2[]) { T.P = T.path = buildPath(pts); T.s = 0; T.pi = 0; T.v = 0; T.stuck = 0; T.wait = false; T.mi = 0; // V: roundabout visits, so the truck gives way on the ring like the robots
      const sAt = (m: P2) => { let bk = 0, bd = 1e9; T.P!.pts.forEach((q, k) => { const dd = Math.hypot(q[0] - m[0], q[1] - m[1]); if (dd < bd) { bd = dd; bk = k; } }); return T.P!.cum[bk]; };
      T.Ms = (M || []).map(m => ({ s: sAt(m), x: m[0], z: m[1] })); // merge point off the garage lane: the truck waits for a gap in the traffic, like a robot leaving a lay-by
      T.RB = (V || []).map(v => ({ n: v.n, ai: v.ai, ao: v.ao, a: sAt(v.li), q: sAt(v.qo), b: sAt(v.lo), done: false })); }
    function planOut() { // garage → just ahead of the broken robot, on its lane
      if (S!.ver !== NET.ver) { const L1 = laneHere(S!.lx, S!.lz, S!.lh[0], S!.lh[1]); if (L1) S!.L = L1; S!.ver = NET.ver; }
      const e = FR(), A: Stop = { e, t: eProj(e, TBX + .9, DOORZ) - LB, spot: [TBX, DOORZ] }, B: Stop = { e: S!.L.e, t: Math.min(S!.L.e.len - .3, S!.L.t + 2.1), spot: null };
      FS.routeRoads = true; const R = routePts({ x: TBX, z: DOORZ }, A, B); FS.routeRoads = false; plan([[T.x, T.z], ...R.pts], R.V, R.M);
    }
    function planBack() { const e = FR(), A: Stop = { e: S!.L.e, t: Math.min(S!.L.e.len - .3, S!.L.t + 2.1), spot: null }, B: Stop = { e, t: eProj(e, TBX - 1.5, DOORZ) + LB, spot: [TBX, DOORZ] };
      FS.routeRoads = true; const R = routePts(T, A, B); FS.routeRoads = false; plan([...R.pts, [TBX, BZ + .35]], R.V); }
    function drive(dt: number) { // follow the path like a robot: keep the gap to whatever is ahead (never squeeze past), give way on roundabouts, never close in on a robot
      const P = T.P!; let vA = VT; const brake = VT * VT / (2 * ACC) + .5;
      for (let j = T.pi + 1; j < P.pts.length; j++) { const ds = P.cum[j] - T.s; if (ds > brake) break; vA = Math.min(vA, Math.sqrt(Math.min(P.cap[j], VT) ** 2 + 2 * ACC * Math.max(0, ds))); }
      vA = Math.max(vA, .3);
      const g = aheadGap(T, 0, GAPD + T.v * T.v / (2 * DEC) + 1.6); if (g < 1e8) vA = Math.min(vA, Math.sqrt(2 * DEC * .8 * Math.max(0, g - GAPD - .25)));
      const ms = mergeStop(T); if (ms < 1e8) vA = Math.min(vA, Math.sqrt(2 * DEC * Math.max(0, ms - T.s)));
      const ys = rbStop(T); if (ys < 1e8) vA = Math.min(vA, Math.sqrt(2 * DEC * Math.max(0, ys - T.s)));
      T.v = T.v < vA ? Math.min(vA, T.v + ACC * dt) : Math.max(vA, T.v - DEC * dt);
      if (T.v > 0 && sepHold(T, dt, 1.05)) T.v = 0; else T.s = Math.min(P.len, T.s + T.v * dt);
      while (T.pi < P.pts.length - 2 && P.cum[T.pi + 1] <= T.s) T.pi++;
      const a = P.pts[T.pi], b = P.pts[T.pi + 1] || a, sl = (P.cum[T.pi + 1] ?? P.cum[T.pi]) - P.cum[T.pi], u = sl > 1e-6 ? (T.s - P.cum[T.pi]) / sl : 1;
      T.x = a[0] + (b[0] - a[0]) * u; T.z = a[1] + (b[1] - a[1]) * u;
      if (sl > 1e-6) { T.hx = (b[0] - a[0]) / sl; T.hz = (b[1] - a[1]) / sl; let dy = Math.atan2(-T.hz, T.hx) - T.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); T.yaw += dy * (1 - Math.exp(-10 * dt)); }
      return T.s >= P.len - 1e-4;
    }
    const towPose = (): P2 => [T.x - Math.cos(T.yaw) * 1.05, T.z + Math.sin(T.yaw) * 1.05]; // behind the boom (yaw convention: heading = (cos, -sin))
    const qa = new THREE.Quaternion(), qb = new THREE.Quaternion(), ZAX = new THREE.Vector3(0, 0, 1), hzC = new THREE.Color();
    function poseRobot(r: Robot, t: number) { // overrides the pose robotsFrame wrote: height, nose-up tilt, hazard blinkers
      qa.setFromAxisAngle(YAX, r.yaw); qb.setFromAxisAngle(ZAX, r.pitch || 0); r.q.copy(qa).multiply(qb);
      mP.set(r.x, r.ry || 0, r.z); mS.setScalar(Math.max(.001, r.scale)); mM.compose(mP, r.q, mS);
      RIM.skirt.setMatrixAt(r.ii, mM); RIM.body.setMatrixAt(r.ii, mM); RIM.light.setMatrixAt(r.ii, mM); haz.matrix.copy(mM);
      mP.y += r.lift * .12 * r.scale; mM.compose(mP, r.q, mS); RIM.deck.setMatrixAt(r.ii, mM);
      const on = S!.ph !== 'fix' && S!.ph !== 'roll' && (t * 2.4) % 1 < .5; haz.visible = on;
      RIM.light.setColorAt(r.ii, on ? hzC.copy(AMBER).multiplyScalar(3) : S!.ph === 'roll' ? hzC.copy(GREEN).multiplyScalar(1.4) : OFFC);
      for (const n in RIM) RIM[n as keyof typeof RIM].instanceMatrix.needsUpdate = true; RIM.light.instanceColor!.needsUpdate = true;
    }
    function crewFrame(dt: number, t: number, fixing: boolean) {
      crew.forEach((w, i) => { const tx = fixing ? RBX + (i ? .55 : -.55) : GX - .2 + i * .5, tz = fixing ? BZ + (i ? .15 : -.1) : GZ + 1, ty = fixing ? (i ? -Math.PI / 2 : Math.PI / 2) : (i ? Math.PI * .8 : Math.PI * .2);
        w.position.x = damp(w.position.x, tx, 3, dt); w.position.z = damp(w.position.z, tz, 3, dt); let dy = ty - w.rotation.y; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); w.rotation.y += dy * (1 - Math.exp(-5 * dt));
        w.position.y = .05 + (fixing ? Math.abs(Math.sin(t * 7 + i * 1.7)) * .03 : Math.abs(Math.sin(t * 1.5 + i)) * .01);
        w.userData.arm.rotation.x = fixing ? -1.1 + Math.sin(t * 11 + i * 2) * .55 : -.15 + Math.sin(t * 1.3 + i) * .1; });
    }
    function sparksFrame(dt: number, on: boolean) {
      sparks.visible = on || sp.some(s => s.t < 1); if (!sparks.visible) return;
      for (let i = 0; i < NS; i++) { const s = sp[i]; s.t += dt * 2.6;
        if (s.t >= 1 && on && Math.random() < dt * 9) { const sd = Math.random() < .5 ? -1 : 1; s.t = 0; s.p.set(RBX + sd * .36, .38, BZ + (Math.random() - .5) * .5); s.v.set(sd * (.6 + Math.random()), 1 + Math.random() * 1.4, (Math.random() - .5) * 1.2); }
        if (s.t < 1) { s.v.y -= 6 * dt; s.p.addScaledVector(s.v, dt); mS.setScalar(1 - s.t); mM.compose(s.p, QI, mS); } else mM.copy(Z0); sparks.setMatrixAt(i, mM); }
      sparks.instanceMatrix.needsUpdate = true;
    }
    function smokeFrame(t: number, at: P2 | null, k: number) { puffs.forEach((m, i) => { m.visible = k > 0; if (!k) return; const u = (t * .45 + i / puffs.length) % 1;
      m.position.set(at![0] + u * .25, .4 + u * 1.3, at![1] - u * .15); m.scale.setScalar(.45 + u * 1.4); m.material.opacity = .5 * k * Math.sin(u * Math.PI); }); }
    const lerpA = (a: number, b: number, u: number) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * u;
    // Settings toggle 'breakdowns' (window.CWFun): off hides the garage, its label, the truck and the HUD button (CSS), and stops new breakdowns.
    // A breakdown in progress ends at once: the robot is repaired and leaves the garage door as after a normal repair; the truck is home and is no obstacle.
    let on = true;
    function endNow() {
      if (S) { const r = S.r; S = null;
        if (robots.includes(r)) { const e = FR(); r.broken = false; r.shoulder = false; r.towed = false; r.ry = 0; r.pitch = 0; r.v = 0; r.wait = false; r.stillT = 0; r.task = null;
          r.x = RBX; r.z = DOORZ; r.yaw = NORTH; r.hx = 0; r.hz = -1;
          r.at = { kind: 'here', st: { e, t: eProj(e, RBX + .4, DOORZ) - LB + 1.6, spot: [RBX, DOORZ] }, v: NET.ver };
          if (r.load.length) goDrop(r); else afterTask(r); } }
      pending = false; pendT = 0; testR = null; OBST.length = 0;
      T.P = T.path = null; T.v = 0; T.wait = false; T.x = TBX; T.z = BZ; T.yaw = NORTH; T.hx = 0; T.hz = -1; truck.position.set(T.x, 0, T.z); truck.rotation.y = T.yaw;
      haz.visible = false; sparks.visible = false; for (const s of sp) s.t = 1; smokeFrame(0, null, 0); jack.position.y = .02;
      crew.forEach((w, i) => { w.position.set(GX - .2 + i * .5, .05, GZ + 1); w.userData.arm.rotation.x = -.15; });
    }
    function setOn(v: unknown) { v = !!v; if (v === on) return; on = v as boolean;
      if (!on) endNow(); else { driveT = 0; nextAt = -Math.log(Math.random() || .5) * MEAN; } // back on: a fresh wait before the next random breakdown
      g.visible = on; for (const o of g.children) if ((o as THREE.Object3D & { isCSS2DObject?: boolean }).isCSS2DObject) o.visible = on; } // CSS2D labels hide by their own flag, not the group's
    if (window.CWFun) { setOn(window.CWFun.get('breakdowns')); window.CWFun.on((k, v) => { if (k === 'breakdowns') setOn(v); }); }
    function frame(dt: number, t: number) {
      if (!on) return;
      if (!S) { // random breakdowns: one at a time, after an exponential stretch of fleet driving time
        let n = 0; for (const r of robots) if (r.st === 'go' && r.v > .5) n++; if (!reduced) driveT += dt * n;
        if (pending || (!reduced && driveT >= nextAt)) for (const r of robots) { const L0 = eligible(r, pending ? .25 : .6); if (L0) { breakDown(r, L0); pending = false; driveT = 0; nextAt = -Math.log(Math.random() || .5) * MEAN; break; } }
        if (testR && (!robots.includes(testR) || !testR.task || testR.task.kind !== 'test')) testR = null;
        if (!pending) pendT = 0; else if (!S && !testR && (pendT += dt) >= (n ? 3 : .2)) { pendT = wake() ? 0 : -1; } } // nobody eligible: after a short grace (none at all when every robot is parked) a parked robot goes out; no parked robot: wait for traffic, ask again every second
      let fixing = false, smoke = 0;
      const tw = T.P && S && (S.ph === 'out' || S.ph === 'hook' || S.ph === 'tow');
      if (tw && !OBST.length) OBST.push(T); else if (!tw && OBST.length) OBST.length = 0;
      if (S) { const r = S.r; S.t += dt;
        if (!robots.includes(r)) { S = null; } else {
          if (S.ph === 'pull') { const u = easeIO(Math.min(1, S.t / .9)); r.x = S.p0[0] + (S.p1[0] - S.p0[0]) * u; r.z = S.p0[1] + (S.p1[1] - S.p0[1]) * u; r.yaw = S.y0 - Math.sin(u * Math.PI) * .25; smoke = u;
            if (S.t >= .9) { S.ph = 'wait'; S.t = 0; } }
          else if (S.ph === 'wait') { smoke = 1; if (S.t >= 2) { planOut(); S.ph = 'out'; S.t = 0; } }
          else if (S.ph === 'out') { smoke = .8; if (drive(dt)) { S.ph = 'hook'; S.t = 0; S.h0 = [r.x, r.z, r.yaw]; r.towed = true; } }
          else if (S.ph === 'hook') { smoke = .5; const u = easeIO(Math.min(1, S.t / 1.4)), q = towPose(); r.x = S.h0![0] + (q[0] - S.h0![0]) * u; r.z = S.h0![1] + (q[1] - S.h0![1]) * u; r.yaw = lerpA(S.h0![2], T.yaw, u);
            r.ry = .14 * u + Math.sin(u * Math.PI) * .15; r.pitch = .28 * u; if (S.t >= 1.4) { r.shoulder = false; planBack(); S.ph = 'tow'; S.t = 0; } }
          else if (S.ph === 'tow') { smoke = .25; const done = drive(dt), q = towPose(); r.x = q[0]; r.z = q[1]; r.yaw = T.yaw; if (done) { S.ph = 'drop'; S.t = 0; S.h0 = [r.x, r.z, r.yaw]; T.P = T.path = null; r.towed = false; } }
          else if (S.ph === 'drop') { const u = easeIO(Math.min(1, S.t / 1.3)); r.x = S.h0![0] + (RBX - S.h0![0]) * u; r.z = S.h0![1] + (BZ - S.h0![1]) * u; r.yaw = lerpA(S.h0![2], NORTH, u);
            r.ry = .14 * (1 - u) + Math.sin(u * Math.PI) * .25 + .1 * u; r.pitch = .28 * (1 - u); if (S.t >= 1.3) { S.ph = 'fix'; S.t = 0; r.shoulder = true; } }
          else if (S.ph === 'fix') { fixing = S.t > .6 && S.t < 5.6; r.ry = .1 + .12 * easeIO(Math.min(1, S.t / .6)) * (S.t < 5.8 ? 1 : 0); if (S.t >= 6.2) { r.ry = 0; S.ph = 'roll'; S.t = 0; } }
          else if (S.ph === 'roll') { const u = easeIO(Math.min(1, S.t / 1.2)); r.x = RBX; r.z = BZ + (DOORZ - BZ) * u; r.yaw = NORTH;
            if (S.t >= 1.2) { const e = FR(); r.broken = false; r.shoulder = false; r.ry = 0; r.pitch = 0; r.hx = 0; r.hz = -1; r.v = 0; r.task = null; S = null;
              r.at = { kind: 'here', st: { e, t: eProj(e, RBX + .4, DOORZ) - LB + 1.6, spot: [RBX, DOORZ] }, v: NET.ver };
              if (r.load.length) goDrop(r); else afterTask(r); } }
          if (S) poseRobot(r, t); else { haz.visible = false; }
          if (S) smokeFrame(t, [S.r.x, S.r.z], smoke); else smokeFrame(t, null, 0);
          jack.position.y = .02 + (S && S.ph === 'fix' ? Math.max(0, r.ry! - .1) : 0); } }
      else smokeFrame(t, null, 0);
      // truck at home: turn round in the bay (nose out) after a tow
      if (!T.P && !(S && (S.ph === 'out' || S.ph === 'hook' || S.ph === 'tow'))) { T.x = damp(T.x, TBX, 2, dt); T.z = damp(T.z, BZ, 2, dt); T.yaw = lerpA(T.yaw, NORTH, 1 - Math.exp(-1.5 * dt)); T.hx = Math.cos(T.yaw); T.hz = -Math.sin(T.yaw); }
      truck.position.set(T.x, 0, T.z); truck.rotation.y = T.yaw;
      barM.color.copy(tw ? ((t * 3) % 1 < .5 ? hzC.copy(AMBER).multiplyScalar(3) : hzC.set('#3a2a10')) : hzC.set('#3a2a10'));
      crewFrame(dt, t, fixing); sparksFrame(dt, fixing && !reduced);
    }
    return { frame, OBST, force(id?: number) { if (!on) return { off: true }; if (S) return { busy: S.r.id, ph: S.ph }; const r = id != null ? robots.find(o => o.id === id) : null;
        if (r) { const L0 = eligible(r, .25); if (L0) { breakDown(r, L0); return { ok: r.id }; } } else if (id == null) for (const o of robots) { const L0 = eligible(o, .25); if (L0) { breakDown(o, L0); return { ok: o.id }; } } pending = true; pendT = 0; if (id == null && !robots.some(o => o.st === 'go' && o.v > .5)) { wake(); pendT = 0; } return { pending: true }; },
      info: () => ({ on, ph: S ? S.ph : null, id: S ? S.r.id : null, t: S ? +S.t.toFixed(2) : 0, n: count, pending, sending: pending && !!testR, truck: [+T.x.toFixed(2), +T.z.toFixed(2)], robot: S ? [+S.r.x.toFixed(2), +S.r.z.toFixed(2)] : null, garage: [GX, GZ] }) };
  })();
  return { BRK };
}
