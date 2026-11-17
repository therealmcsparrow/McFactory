import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { DS, modelOf, armOrder } from '../app/data.js';
import { clamp, hashf, damp, easeOut, easeIO } from '../common/math.js';
import type { Agent, Task } from '../common/types.js';
import type { FSAtArms } from './state.js';
import type { AimPart, Arm, ArmNode, Line } from './types.js';

export function makeArms(FS: FSAtArms) {
  const { mat, MAXF, MAXL, ARMS, Z0, scene, invisM, armX, crateCol, ARM_PITCH, reduced, isFin, isLive, W, ARMDZ, BY, CRATE_TOK, DOCKCAP, seg, bump, BELT_TOP, R, ctx } = FS;
  // ── robot arms, fully instanced: one InstancedMesh per part; base + turret = role, lower arm = model,
  //    upper arm (forearm) = effort, gripper = neutral steel, held crate = role
  const L1 = .9, L2 = .85, SH = .52;
  // swing envelope: the gripper's reach along the line (toward the next slot) is capped at ARM_XL (scaled units);
  // in that sector the arm lifts and tucks (upper arm upright) so it swings over its own base, never into a neighbour.
  // Folded (done / retiring) arms lean over their pad, not along the line.
  const ARM_XL = .3, ARM_FOLD = 1.41;
  // every arm is one fixed size (fits the 1.45 slot spacing and the 3.9 roof); tokens show on the pedestal gauge instead
  const ARM_S = 1.3, GAUGE_H = .3;
  const G = {
    base: new THREE.CylinderGeometry(.34, .4, .16, 24).translate(0, .08, 0),
    ring: new THREE.TorusGeometry(.33, .035, 8, 32).rotateX(Math.PI / 2).translate(0, .17, 0),
    turn: new THREE.CylinderGeometry(.24, .28, .3, 20).translate(0, .3, 0),
    joint: new THREE.CylinderGeometry(.12, .12, .3, 18).rotateX(Math.PI / 2),
    upper: mergeGeometries([new THREE.BoxGeometry(.16, L1, .18).translate(0, L1 / 2, 0), new THREE.CylinderGeometry(.06, .06, L1 * .7, 8).translate(.1, L1 / 2, 0)]),
    elbowJ: new THREE.CylinderGeometry(.09, .09, .24, 16).rotateX(Math.PI / 2),
    fore: new THREE.CylinderGeometry(.07, .09, L2, 12).translate(0, L2 / 2, 0),
    wrist: new THREE.CylinderGeometry(.075, .075, .14, 12).translate(0, .07, 0),
    palm: new THREE.BoxGeometry(.28, .07, .14).translate(0, .15, 0),
    finger: new THREE.BoxGeometry(.035, .15, .11).translate(0, .24, 0),
    beacon: new THREE.CylinderGeometry(.06, .06, .12, 12).translate(0, .06, 0),
    held: new RoundedBoxGeometry(.34 / ARM_S, .3 / ARM_S, .34 / ARM_S, 2, .03 / ARM_S), // = belt crate size once the arm's scale applies
    gTrack: new THREE.BoxGeometry(.075, GAUGE_H + .03, .075).translate(0, (GAUGE_H + .03) / 2, 0), // token gauge: dark slot on the pedestal
    gFill: new THREE.BoxGeometry(.05, 1, .085).translate(0, .5, 0), // lit fill, scaled in y by the agent's token share
  };
  // held crate hangs HELD_Y below the wrist (wrist points down while placing): wrist-to-crate-base distance, arm-local units
  const HELD_Y = .4; G.held.computeBoundingBox(); const HELD_BASE = HELD_Y - G.held.boundingBox!.min.y;
  const PLACE_U = (.55 + .78) / 2; // crate leaves the gripper at the bottom of the belt dip
  const jointM = mat('#2a2d32', { metalness: .6, roughness: .35 });
  const gripBase = mat('#8b939b', { metalness: .8, roughness: .35 }); // neutral steel hand
  const bandM = mat('#ffffff', { metalness: .22, roughness: .4 }), heldM = mat('#ffffff', { roughness: .55 });
  const beaconM = new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false });
  const MAXA = MAXF * MAXL * ARMS;
  const AP = [['base', 'sc', 'r'], ['ring', 'sc', ''], ['turn', 'turn', 'r'], ['joint', 'sh', ''], ['upper', 'sh', 'm'], ['elbowJ', 'el', ''], ['fore', 'el', 'e'], ['wrist', 'wr', ''], ['palm', 'wr', 'g'], ['finger', 'f1', 'g'], ['finger', 'f2', 'g'], ['held', 'held', 'c'], ['beacon', 'beacon', 'b'], ['gTrack', 'gauge', ''], ['gFill', 'gfill', 't']] as [keyof typeof G, ArmNode, string][];
  const AIM = AP.map(([g, node, ck]): AimPart => {
    const m = ({ r: bandM, m: bandM, e: bandM, c: heldM, b: beaconM, t: beaconM, g: gripBase } as Record<string, THREE.Material>)[ck] || jointM;
    const im = new THREE.InstancedMesh(G[g], m, MAXA); im.frustumCulled = false; im.castShadow = ['base', 'turn', 'upper', 'fore', 'held'].includes(g); // small parts skip the shadow pass im.receiveShadow = ck === 'r';
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); for (let i = 0; i < MAXA; i++) im.setMatrixAt(i, Z0);
    if (ck && 'rmecbt'.includes(ck)) { const c = new THREE.Color(1, 1, 1); for (let i = 0; i < MAXA; i++) im.setColorAt(i, c); im.instanceColor!.setUsage(THREE.DynamicDrawUsage); }
    im.count = 0; scene.add(im); return { im, node, ck };
  });
  const [IBASE, , ITURN, , IUP, , IFORE, , , , , IHELD, IBEAC, , IGAUGE] = AIM;
  const arms = new Map<string, Arm>(), dyingArms = new Set<Arm>(), armFree: number[] = []; let armHW = 0;
  const armHitG = new THREE.CylinderGeometry(.55, .55, 2.3, 10).translate(0, 1.15, 0);
  const effIdx = (e: string) => DS.EFFORTS.findIndex(x => x.id === String(e || '').toLowerCase());
  const scaleOf: (tokens?: number) => number = () => ARM_S; // fixed: arm size no longer encodes tokens
  // token gauge fill: log share of the biggest agent in the window (max refreshed at most once a second)
  let gMax = 1, gMaxAt = 0; const gLog = (tok: number) => Math.log10(1 + tok / 1000);
  function gaugeOf(tok: number) { const now = performance.now(); if (now - gMaxAt > 1000) { gMaxAt = now; gMax = Math.max(1e-6, gLog(Math.max(1, ...DS.agents().map(a => a.tokens || 0)))); } return clamp(gLog(tok) / gMax, .04, 1); }
  function makeArm(a: Agent, l: Line, si: number, animate: boolean): Arm | null {
    const ii = armFree.length ? armFree.pop()! : (armHW < MAXA ? armHW++ : -1); if (ii < 0) return null;
    for (const P of AIM) P.im.count = armHW;
    const O = () => new THREE.Object3D();
    const root = O(), sc = O(), turn = O(), sh = O(), el = O(), wr = O(), f1 = O(), f2 = O(), held = O(), beacon = O(), gauge = O(), gfill = O();
    root.add(sc); sc.add(turn); turn.add(sh); sh.position.y = SH; sh.add(el); el.position.y = L1; el.add(wr); wr.position.y = L2; wr.add(f1, f2, held); held.position.y = HELD_Y;
    sc.add(beacon); beacon.position.set(.24, .16, .2);
    sc.add(gauge); gauge.position.set(-.24, .16, .2); gauge.add(gfill); gfill.position.y = .015; gfill.scale.y = .01;
    const hit = new THREE.Mesh(armHitG, invisM); root.add(hit); ctx.addPickable(hit, { kind: 'agent', id: a.id });
    const A: Arm = { a, line: l, si, ax: armX(si), ii, root, sc, turn, sh, el, wr, f1, f2, held, beacon, gauge, gfill, gauge01: 0, hit, heldVis: false, key: '',
      roleC: new THREE.Color(), modelC: new THREE.Color(), effC: new THREE.Color(), effGlow: 0,
      ph: hashf(a.id, 7), yaw: Math.PI / 2, r: .35, h: 1.1, grip: .1, credit: 0, cycling: false, u: 0, dropped: false, born: animate ? 0 : 1, wait: !!animate, scale: animate ? .001 : scaleOf(a.tokens), dying: 0, flash: 0, flashCol: new THREE.Color(), sag: 0 };
    paintArm(A); l.slots[si] = a.id; arms.set(a.id, A); return A;
  }
  function paintArm(A: Arm) {
    const a = A.a, key = a.role + '|' + a.model + '|' + a.effort; if (key === A.key) return; A.key = key;
    A.roleC.set(DS.roleColor(a.role)); A.modelC.set(modelOf(a.model).color); A.effC.set(DS.effortColor(a.effort));
    IHELD.im.setColorAt(A.ii, crateCol(a.role)); IHELD.im.instanceColor!.needsUpdate = true;
    A.effGlow = Math.max(0, effIdx(a.effort) - 2) * .12; // xhigh/max upper arms glow a touch (a black max arm stays black: its glow colour is black)
  }
  function reslot(l: Line) { // compact a line's arms after one retires: main first, then by start time; arms slide (eased in animArm)
    const list = [...arms.values()].filter(A => A.line === l).sort((x, y) => armOrder(x.a, y.a)); l.slots.fill(null); list.forEach((A, i) => { A.si = i; l.slots[i] = A.a.id; });
  }
  function spotFree(A: Arm) { // a new arm only appears where no other arm (live or being removed) stands: neighbours at their slots are ARM_PITCH away
    for (const O of arms.values()) if (O !== A && O.line === A.line && Math.abs(O.ax - A.ax) < ARM_PITCH * .9) return false;
    for (const O of dyingArms) if (O.line === A.line && Math.abs(O.ax - A.ax) < ARM_PITCH * .9) return false;
    return true;
  }
  function startDying(A: Arm, retire?: boolean) { A.retire = !!retire && !reduced; A.fin = !!retire; A.leaving = false; if (arms.get(A.a.id) === A) arms.delete(A.a.id); if (A.si >= 0 && A.line.slots[A.si] === A.a.id) A.line.slots[A.si] = null; A.si = -1; A.dying = 1e-4; ctx.removePickable(A.hit); dyingArms.add(A);
    if (A.retire) { (A.line.hold || (A.line.hold = new Set())).add(A); FS.crewJobs.add(A); } } // the line's other arms keep their places until the crew has cleared this slot
  function freeArm(A: Arm) {
    ctx.removePickable(A.hit); for (const P of AIM) P.im.setMatrixAt(A.ii, Z0); armFree.push(A.ii);
    if (arms.get(A.a.id) === A) arms.delete(A.a.id); dyingArms.delete(A); if (A.si >= 0 && A.line.slots[A.si] === A.a.id) A.line.slots[A.si] = null;
  }
  function fillLine(l: Line, t: Task, animate: boolean) {
    // which agents get an arm (cap ARMS): main, then needs-you, live, recent; slot order: main first, then by start time
    // finished subagents get no arm; one still mid-cycle keeps its arm until the crate is on the belt (then retires in frame)
    const fin = new Set(t.agents.filter(isFin).map(a => a.id));
    const pend = t.agents.filter(a => { const A = fin.has(a.id) && arms.get(a.id); return A && A.line === l && A.cycling && !A.dropped; });
    pend.forEach(a => { arms.get(a.id)!.leaving = true; });
    const as = t.agents.filter(a => !fin.has(a.id)).sort((x, y) => (((y.kind === 'main') as unknown as number) - ((x.kind === 'main') as unknown as number)) || ((!!y.needsHuman as unknown as number) - (!!x.needsHuman as unknown as number)) || ((isLive(y) as unknown as number) - (isLive(x) as unknown as number)) || y.lastActivity - x.lastActivity).slice(0, ARMS - pend.length).concat(pend).sort(armOrder);
    const want = new Set(as.map(a => a.id));
    for (let si = 0; si < ARMS; si++) { const id = l.slots[si]; if (id && !want.has(id)) { const A = arms.get(id); if (A) startDying(A, fin.has(id)); else l.slots[si] = null; } }
    l.slots.fill(null);
    as.forEach((a, si) => { const A = arms.get(a.id); if (A) { A.si = si; l.slots[si] = a.id; } else makeArm(a, l, si, animate); }); // existing arms slide to their new slot
  }
  function solve(A: Arm, r: number, h: number) {
    const d = Math.min(Math.hypot(r, h), L1 + L2 - .02), a1 = Math.atan2(r, h);
    const B = Math.acos(clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1));
    const C = Math.acos(clamp((L1 * L1 + L2 * L2 - d * d) / (2 * L1 * L2), -1, 1));
    const p1 = a1 - B; A.sh.rotation.z = -p1; A.el.rotation.z = -(Math.PI - C); A.wr.rotation.z = -(C - p1);
  }
  function poseArm(A: Arm) { // apply yaw + IK with the swing tuck (see ARM_XL); smooth in yaw, so no pops
    const c = Math.cos(A.yaw), r = Math.min(A.r, ARM_XL / Math.max(c, 1e-3)), lift = clamp((A.r - r) / .3, 0, 1);
    const hu = L1 + Math.sqrt(Math.max(0, L2 * L2 - r * r)) - .05; // height where the upper arm stands upright
    A.turn.rotation.y = A.yaw; solve(A, r, A.h + Math.max(0, hu - A.h) * lift - A.sag * .25);
  }
  function writeArm(A: Arm) { A.root.updateMatrixWorld(true); for (const P of AIM) P.im.setMatrixAt(A.ii, P.node === 'held' && !A.heldVis ? Z0 : A[P.node].matrixWorld); }
  const BLUE = new THREE.Color('#2f8cff'), AMBER = new THREE.Color('#fab219'), RED = new THREE.Color('#ff2a1a'), GREEN = new THREE.Color('#36d07a'), CYAN = new THREE.Color('#5fd4ff'), WHITE = new THREE.Color('#ffffff'), OFFC = new THREE.Color('#222222');
  const YP = Math.PI / 2, YB = -Math.PI / 2, tc = new THREE.Color();
  function animArm(A: Arm, dt: number, t: number) {
    const a = A.a, st = a.status, l = A.line, f = l.f;
    if (A.si >= 0 && !(l.hold && l.hold.size)) A.ax = reduced ? armX(A.si) : damp(A.ax, armX(A.si), 4, dt); // re-slot waits for the removal crew
    W(f, A.ax, 0, l.z + ARMDZ, A.root.position); A.root.rotation.y = f.rot;
    if (A.wait && spotFree(A)) A.wait = false; // a new arm waits, unseen and idle, until its spot is empty
    A.hit.visible = f.det && !A.wait; // no click target on an arm that is not there yet
    if (A.born < 1 && !A.wait) A.born = Math.min(1, A.born + dt / (reduced ? .01 : 1));
    A.scale = damp(A.scale, scaleOf(a.tokens) * easeOut(A.born), 3, dt); A.sc.scale.setScalar(Math.max(.001, A.scale));
    const s = A.scale || 1;
    let yaw: number, r: number, h: number, grip = .1, rate = 4;
    const beltH = (BY + .32) / s - SH, padH = (.36) / s - SH, reach = 1.4 / s;
    // Pick-and-place is driven by token flow, not the clock: a cycle only starts when the arm has
    // a crate's worth of credit, and every cycle carries exactly one crate. No credit = idle pose.
    const P = 3.4 / (modelOf(a.model).speed || 1);
    if (st === 'running' && a.rate > 0 && Date.now() - a.lastActivity < 60e3) A.credit = Math.min(4, A.credit + dt * clamp(a.rate / CRATE_TOK, 1 / 8, 1 / P));
    // backpressure: a hall whose belts + dock already hold DOCKCAP crates waits for the robots
    if (!A.wait && !A.cycling && isLive(a) && A.credit >= 1 && f.backlog < DOCKCAP) { f.backlog++; A.cycling = true; A.u = 0; A.credit -= 1; A.dropped = false; }
    if (A.cycling && A.dropped && (st === 'failed' || st === 'done')) A.cycling = false; // a finished arm still puts its held crate on the belt
    if (A.cycling) {
      const u = A.u = Math.min(1, A.u + dt / P);
      if (u >= PLACE_U && !A.dropped) { FS.dropCrate(A); A.dropped = true; }
      const sw = easeIO(seg(u, .22, .55)) - easeIO(seg(u, .78, 1)); yaw = YP + (YB - YP) * sw;
      const dipP = bump(u, 0, .22), dipB = bump(u, .55, .78);
      // place: wrist points down, so at the dip's bottom the held crate's base sits exactly on the belt top
      const hp = padH + .55 - .5 * dipP, hb = BELT_TOP / s - SH + HELD_BASE + .5 - .5 * dipB;
      h = u < .22 ? hp : u < .55 ? hp + (hb - hp) * easeIO(seg(u, .22, .55)) : u < .78 ? hb : hb + (hp - hb) * easeIO(seg(u, .78, 1));
      r = reach; grip = (u > .1 && u < PLACE_U) ? .045 : .1; rate = 18;
      A.heldVis = u > .1 && u < PLACE_U;
      if (u >= 1) A.cycling = false;
    } else if (st === 'running') { yaw = YP; r = reach * .85; h = padH + .9; A.heldVis = false; rate = 4; } // ready over the pad, no flow
    else if (st === 'waiting') { yaw = YB * .5; r = reach * .8; h = beltH + .7; A.heldVis = false; rate = 3; }
    else if (st === 'failed') { yaw = A.yaw; r = A.r; h = A.h; A.sag = Math.min(1, A.sag + dt * .5); rate = 0; }
    else { yaw = ARM_FOLD; r = .32; h = 1.25; A.heldVis = false; rate = 2.5; }
    if (rate) { A.yaw = damp(A.yaw, yaw, rate, dt); A.r = damp(A.r, r, rate, dt); A.h = damp(A.h, h, rate, dt); }
    poseArm(A);
    A.grip = damp(A.grip, grip, 14, dt); A.f1.position.x = -A.grip; A.f2.position.x = A.grip;
    // beacon (HDR colour feeds the bloom) and band tint for flash / fault / hover
    let failOn = false;
    if (a.needsHuman && st !== 'failed') tc.copy(BLUE).multiplyScalar(reduced ? 1.6 : (t * 1.5 + A.ph) % 1 < .5 ? 2.4 : .12); // needs you: beats amber
    else if (st === 'waiting') tc.copy(AMBER).multiplyScalar(.9 + (Math.sin(t * 5) * .5 + .5) * 1.8 * (R || .5));
    else if (st === 'failed') { failOn = reduced ? true : (t * 2.6 + A.ph) % 1 < .45; tc.copy(RED).multiplyScalar(failOn ? 3.6 : .15); }
    else if (st === 'done') tc.copy(GREEN).multiplyScalar(.75);
    else if (st === 'running') tc.copy(A.modelC).multiplyScalar(.7 + Math.sin(t * 6 + A.ph * 6) * .4);
    else tc.copy(OFFC);
    IBEAC.im.setColorAt(A.ii, tc);
    // token gauge: fill eases to the agent's share; lit cyan (bloom) while running, dim otherwise
    A.gauge01 = reduced ? gaugeOf(a.tokens) : damp(A.gauge01, gaugeOf(a.tokens), 3, dt); A.gfill.scale.y = GAUGE_H * A.gauge01;
    tc.copy(st === 'running' ? CYAN : WHITE).multiplyScalar(st === 'running' ? 1.5 + Math.sin(t * 3 + A.ph * 6) * .3 : .35); if (FS.hovered === a.id) tc.lerp(WHITE, .3); IGAUGE.im.setColorAt(A.ii, tc);
    if (A.flash > 0) A.flash = Math.max(0, A.flash - dt * .9);
    const hov = FS.hovered === a.id;
    const band = (P2: AimPart, base: THREE.Color, glow?: number) => { tc.copy(base); if (glow) tc.multiplyScalar(1 + glow); if (st === 'failed') tc.lerp(RED, failOn ? .55 : .12); if (A.flash > 0) tc.lerp(A.flashCol, A.flash * .7); if (hov) tc.lerp(WHITE, .3); P2.im.setColorAt(A.ii, tc); };
    band(IBASE, A.roleC); band(ITURN, A.roleC); band(IUP, A.modelC); band(IFORE, A.effC, st !== 'done' ? A.effGlow : 0);
    writeArm(A);
  }
  return { L1, L2, SH, ARM_FOLD, G, jointM, AP, AIM, arms, dyingArms, makeArm, paintArm, reslot, startDying, freeArm, fillLine, poseArm, writeArm, BLUE, AMBER, RED, GREEN, CYAN, OFFC, tc, animArm };
}
