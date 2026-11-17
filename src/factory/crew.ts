import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { damp, easeIO, clamp } from '../common/math.js';
import type { FSAtCrew } from './state.js';
import type { Arm, Crew, Hall, Line, Piece, Worker } from './types.js';

export function makeCrew(FS: FSAtCrew) {
  const { HX, ARMDZ, mat, rail, dark, Z0, scene, W, AP, AIM, XAX, dyingArms, facs, QI, YAX, arc, freeArm, arms, makeArm, startDying, reslot, lineIdx, ctx } = FS;
  // ── removal crew: a finished subagent's arm in the open hall is taken apart by a crew of 5 workers (one piece each, one trip, file to the bin) and dumped in the
  //    hall's trash container (back corner of the info-board aisle). Closed hall or reduced motion: the arm goes at once.
  //    Walk route: aisle -> back corridor (behind the belt starts) -> the lane on the arm side of the line. Instanced workers,
  //    shared geometry; the arm's pieces stay in the arm's own instance slot (freed with the arm), so nothing to dispose.
  const CREW = 5, CREWS = 2, QGAP = .5, WMAX = CREW * CREWS, WSPD = 1.7, XBK = -HX + .45;
  const binAt = (f: Hall) => ({ x: -HX + .78, z: -f.d * (f.D / 2 - 1.0) }), aisleZ = (f: Hall) => -f.d * (f.D / 2 - 1.9), laneZ = (l: Line) => l.z + ARMDZ - 1.0;
  const homeOf = (f: Hall) => ({ x: -HX + .3, z: aisleZ(f) });
  const qSpot = (f: Hall, w: Worker) => ({ x: binAt(f).x + w.k * QGAP, z: aisleZ(f) }); // file order: k=4 leads the walk and stands farthest from the bin, k=0 arrives last, stands nearest, dumps first and leaves first
  const crewJobs = new Set<Arm>(), crews: Crew[] = [], wFree = [...Array(WMAX).keys()].reverse();
  const binM = mat('#2f5a44', { metalness: .55, roughness: .5 }), binLidM = mat('#234536', { metalness: .55, roughness: .45 }), puffM = new THREE.MeshStandardMaterial({ color: '#9aa1a8', roughness: 1, transparent: true, opacity: .7, depthWrite: false });
  const BING = (() => { const g: THREE.BufferGeometry[] = [], w = .8, d = .6, h = .5, t = .04;
    g.push(new THREE.BoxGeometry(w, t, d).translate(0, .08, 0), new THREE.BoxGeometry(w + .06, h, t).translate(0, h / 2 + .06, -d / 2), new THREE.BoxGeometry(w + .06, h, t).translate(0, h / 2 + .06, d / 2),
      new THREE.BoxGeometry(t, h, d).translate(-w / 2, h / 2 + .06, 0), new THREE.BoxGeometry(t, h, d).translate(w / 2, h / 2 + .06, 0));
    for (const x of [-.3, .3]) for (const z of [-.2, .2]) g.push(new THREE.BoxGeometry(.08, .06, .08).translate(x, .03, z)); // feet
    return { body: mergeGeometries(g), band: new THREE.BoxGeometry(w + .1, .06, d + .08).translate(0, .42, 0), lid: new THREE.BoxGeometry(w + .1, .04, d + .06).translate(0, .02, (d + .06) / 2),
      door: mergeGeometries([new THREE.BoxGeometry(.03, .72, .5).translate(0, .36, 0)]), doorF: mergeGeometries([new THREE.BoxGeometry(.04, .05, .6).translate(0, .745, 0), new THREE.BoxGeometry(.04, .74, .05).translate(0, .37, -.275), new THREE.BoxGeometry(.04, .74, .05).translate(0, .37, .275)]),
      puff: new THREE.IcosahedronGeometry(.12, 0) }; })();
  function placeBin(f: Hall) { // hall corner decoration: trash container + crew door on the back wall; follows the hall size
    if (!f.bin) { const g = new THREE.Group(), body = new THREE.Mesh(BING.body, binM), band = new THREE.Mesh(BING.band, rail), hinge = new THREE.Object3D(), lid = new THREE.Mesh(BING.lid, binLidM);
      body.castShadow = body.receiveShadow = lid.castShadow = true; hinge.position.set(0, .56, -.33); hinge.add(lid); g.add(body, band, hinge);
      const puffs = [0, 1, 2, 3].map(i => { const m = new THREE.Mesh(BING.puff, puffM); m.visible = false; g.add(m); return m; });
      const door = new THREE.Group(); door.add(new THREE.Mesh(BING.door, dark), new THREE.Mesh(BING.doorF, rail));
      f.grp.add(g, door); f.bin = { g, hinge, puffs, door, open: 0, puff: -1 }; }
    const b = binAt(f); f.bin!.g.position.set(b.x, 0, b.z); f.bin!.g.rotation.y = f.d > 0 ? 0 : Math.PI; f.bin!.door.position.set(-HX + .1, 0, aisleZ(f));
  }
  function binFrame(f: Hall, dt: number) {
    const B = f.bin!, want = crews.some(c => c.f === f && c.ws.some(w => w.st === 'toss' || w.st === 'queue' || (w.st === 'carry' && Math.hypot(w.x - B.g.position.x, w.z - B.g.position.z) < 1.6))) ? 1 : 0;
    B.open = damp(B.open, want, 7, dt); B.hinge.rotation.x = -1.9 * B.open;
    if (B.puff >= 0) { B.puff += dt; const u = B.puff / .7; B.puffs.forEach((m, i) => { m.visible = u < 1; const a = i * 1.7; m.position.set(Math.cos(a) * .18 * u, .55 + u * .45, Math.sin(a) * .14 * u); m.scale.setScalar(Math.max(.01, Math.sin(Math.min(1, u) * Math.PI) * (1 + i * .15))); }); if (u >= 1) B.puff = -1; }
  }
  // workers: one InstancedMesh per part (WMAX slots), safety-yellow/orange hard hats
  const WG = { body: new THREE.BoxGeometry(.2, .26, .13).translate(0, .13, 0), head: new THREE.SphereGeometry(.075, 10, 8),
    hat: mergeGeometries([new THREE.SphereGeometry(.088, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, .015, 0), new THREE.CylinderGeometry(.115, .115, .016, 14).translate(0, .015, 0)]),
    leg: new THREE.BoxGeometry(.075, .26, .085).translate(0, -.13, 0), arm: new THREE.BoxGeometry(.055, .23, .06).translate(0, -.115, 0), spark: new THREE.OctahedronGeometry(.05) };
  const WP = ([['body', mat('#ff7a1a', { roughness: .6 }), 1, 'body'], ['head', mat('#d6a07c', { roughness: .8 }), 1, 'head'], ['hat', mat('#ffffff', { roughness: .45 }), 1, 'hat'],
    ['leg', mat('#2c3846', { roughness: .8 }), 2, 'leg'], ['arm', mat('#ff7a1a', { roughness: .6 }), 2, 'arm'], ['spark', new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffb347').multiplyScalar(4), toneMapped: false }), 1, 'spark']] as [keyof typeof WG, THREE.Material, number, string][])
    .map(([g, m, k, n]) => { const im = new THREE.InstancedMesh(WG[g], m, WMAX * k); im.frustumCulled = false; im.castShadow = n !== 'spark'; im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      for (let i = 0; i < WMAX * k; i++) im.setMatrixAt(i, Z0); scene.add(im); return { im, k, n }; });
  { const hat = WP[2].im, cs = ['#ffc400', '#ff8c00']; for (let i = 0; i < WMAX; i++) hat.setColorAt(i, new THREE.Color(cs[i % 2])); }
  function newWorker(f: Hall, k: number): Worker {
    const ii = wFree.pop()!, O = () => new THREE.Object3D(), root = O(), body = O(), head = O(), hat = O(), l1 = O(), l2 = O(), a1 = O(), a2 = O(), h = homeOf(f);
    root.add(body, head, l1, l2, a1, a2); head.add(hat); head.position.y = .62; hat.position.y = .035; l1.position.set(-.05, .27, 0); l2.position.set(.05, .27, 0); a1.position.set(-.135, .5, 0); a2.position.set(.135, .5, 0); body.position.y = .26;
    return { ii, k, root, body, head, hat, l1, l2, a1, a2, x: h.x, z: h.z, yaw: 0, st: 'wait', wait: k * .55, sc: 0, ph: k, path: [], then: '', t: 0, piece: null, spot: null, out: 0 };
  }
  function writeWorker(w: Worker, f: Hall, t: number) {
    const R2 = w.root; W(f, w.x, 0, w.z, R2.position); R2.rotation.y = w.yaw; R2.scale.setScalar(Math.max(.001, w.sc)); R2.updateMatrixWorld(true);
    const set = (P: (typeof WP)[number], j: number, o: THREE.Object3D) => P.im.setMatrixAt(w.ii * P.k + j, o ? o.matrixWorld : Z0);
    set(WP[0], 0, w.body); set(WP[1], 0, w.head); set(WP[2], 0, w.hat); set(WP[3], 0, w.l1); set(WP[3], 1, w.l2); set(WP[4], 0, w.a1); set(WP[4], 1, w.a2);
  }
  function clearWorker(w: Worker) { for (const P of WP) for (let j = 0; j < P.k; j++) P.im.setMatrixAt(w.ii * P.k + j, Z0); wFree.push(w.ii); }
  function crewRoute(w: Worker, to: { x: number; z: number }) { return Math.abs(w.z - to.z) < .05 ? [to] : [{ x: XBK, z: w.z }, { x: XBK, z: to.z }, to]; }
  function crewGo(w: Worker, to: { x: number; z: number }, then: string) { w.path = crewRoute(w, to); w.st = 'walk'; w.then = then; }
  function dropJob(A: Arm) { crewJobs.delete(A); if (A.line.hold) A.line.hold.delete(A); const j = A.line.f.junk; if (j) { const k = j.indexOf(A); if (k >= 0) j.splice(k, 1); } }
  function killCrew(c: Crew) { for (const w of c.ws) clearWorker(w); crews.splice(crews.indexOf(c), 1); }
  function assignJob(c: Crew, A: Arm) { c.job = A; c.ph = 'go'; c.t = 0; c.pieces = null; c.next = 0; c.dump = -1;
    for (const w of c.ws) { w.spot = { x: A.ax + (2 - w.k) * QGAP, z: laneZ(A.line) }; if (w.st === 'home') { w.st = 'wait'; w.wait = w.k * .55; } else if (!['carry', 'queue', 'toss', 'pick', 'wait'].includes(w.st)) crewGo(w, w.spot, 'ready'); } } // crew reused for the next arm: re-emerge from the door one by one
  // arm pieces (indices into AP): gripper, forearm, upper arm, turret, base; beams are laid flat when carried
  const PIECES: [number[], number][] = [[[7, 8, 9, 10, 11], 0], [[5, 6], 1], [[3, 4], 1], [[2], 0], [[0, 1, 12], 0]];
  const pM = new THREE.Matrix4(), pT = new THREE.Matrix4(), pQ = new THREE.Quaternion(), pV = new THREE.Vector3(), pS = new THREE.Vector3();
  function capturePieces(A: Arm): Piece[] {
    A.root.updateMatrixWorld(true);
    return PIECES.map(([idx, tilt]) => { const parts = idx.map(i => ({ i, M: A[AP[i][1]].matrixWorld.clone() })), box = new THREE.Box3(), cs: THREE.Vector3[] = [];
      for (const p of parts) { if (p.i === 11) continue; const g = AIM[p.i].im.geometry; if (!g.boundingBox) g.computeBoundingBox(); const b = g.boundingBox!;
        for (let k = 0; k < 8; k++) { const v = new THREE.Vector3(k & 1 ? b.max.x : b.min.x, k & 2 ? b.max.y : b.min.y, k & 4 ? b.max.z : b.min.z).applyMatrix4(p.M); cs.push(v); box.expandByPoint(v); } }
      const c = box.getCenter(new THREE.Vector3()); cs.forEach(v => v.sub(c));
      const qt = tilt ? new THREE.Quaternion().setFromAxisAngle(XAX, Math.PI / 2) : new THREE.Quaternion();
      const sc = .7; let low = 0; for (const v of cs) low = Math.min(low, pV.copy(v).applyQuaternion(qt).y * sc);
      return { parts, c, qt, sc, low, st: 'on', u: 0, w: null, p: c.clone(), q: new THREE.Quaternion(), s: 1, yaw0: 0, from: new THREE.Vector3() }; });
  }
  function writePiece(A: Arm, pc: Piece) {
    for (const p of pc.parts) { if (p.i === 11 || pc.st === 'gone') { AIM[p.i].im.setMatrixAt(A.ii, Z0); continue; }
      pT.makeTranslation(-pc.c.x, -pc.c.y, -pc.c.z); pM.compose(pc.p, pc.q, pS.setScalar(pc.s)).multiply(pT).multiply(p.M); AIM[p.i].im.setMatrixAt(A.ii, pM); }
  }
  const hand = (w: Worker, f: Hall, pc: Piece, out: THREE.Vector3) => { W(f, w.x, .78 * w.sc - pc.low, w.z, out); return out; };
  let crewTS = 1; // test hook: crew time scale (headless frame rates are low)
  function armCrewFrame(dt: number, t: number) { dt *= crewTS;
    for (const A of [...crewJobs]) if (!dyingArms.has(A)) dropJob(A); // freed elsewhere (hall closed, line killed)
    for (const f of facs.values()) { if (f.bin) binFrame(f, dt);
      if (!f.junk || !f.junk.length || !f.det) continue;
      let c = crews.find(c => c.f === f);
      if (!c && crews.length < CREWS && wFree.length >= CREW) { c = { f, ws: [], job: null, ph: 'idle', t: 0, pieces: null, next: 0 }; for (let k = 0; k < CREW; k++) c.ws.push(newWorker(f, k)); crews.push(c); }
      if (c && !c.job && c.ws.every(w => w.st === 'home' || w.st === 'wait')) assignJob(c, f.junk.shift()!); }  // next arm only once the whole crew is back at the door
    for (const c of [...crews]) crewTick(c, dt, t);
    for (const P of WP) P.im.instanceMatrix.needsUpdate = true;
    if (WP[2].im.instanceColor) WP[2].im.instanceColor.needsUpdate = true;
  }
  function crewTick(c: Crew, dt: number, t: number) {
    const f = c.f; if (facs.get(f.id) !== f || !f.det) { killCrew(c); return; } // hall gone or closed: no hidden work
    let A = c.job; if (A && !dyingArms.has(A)) { A = c.job = null; c.pieces = null; for (const w of c.ws) if (w.piece) { w.piece = null; crewGo(w, homeOf(f), 'home'); } }
    c.t += dt;
    if (A && c.ph === 'go' && c.ws.every(w => w.st === 'ready')) { c.ph = 'work'; c.t = 0; }
    if (A && c.ph === 'work' && c.t > 1.8) { c.pieces = capturePieces(A); A.dis = true; c.ph = 'haul'; c.next = 0; c.dump = -1; }
    if (A && c.ph === 'haul' && c.dump! < 0 && c.ws.every(w => w.st === 'queue')) c.dump = 0; else if (c.dump! >= 0) c.dump! += dt; // all five in file: dump in quick succession, nearest first
    const bin = binAt(f), binSpot = { x: bin.x, z: aisleZ(f) }, sparkP = WP[5];
    for (const w of c.ws) {
      sparkP.im.setMatrixAt(w.ii, Z0);
      if (w.st === 'wait') { w.wait -= dt; if (w.wait > 0) { w.sc = 0; writeWorker(w, f, t); continue; } if (A) crewGo(w, w.spot!, 'ready'); else w.st = 'home'; }
      w.sc = Math.min(1, w.sc + dt / .35);
      let moving = false, pose = 'rest';
      if ((w.st === 'walk' || w.st === 'carry') && w.path.length) { const p = w.path[0], dx = p.x - w.x, dz = p.z - w.z, d = Math.hypot(dx, dz), step = WSPD * dt * (w.st === 'carry' ? .8 : 1);
        if (d > 1e-4) { const yw = Math.atan2(f.d * dx, f.d * dz); w.yaw += Math.atan2(Math.sin(yw - w.yaw), Math.cos(yw - w.yaw)) * Math.min(1, dt * 12); }
        if (d <= step) { w.x = p.x; w.z = p.z; w.path.shift(); } else { w.x += dx / d * step; w.z += dz / d * step; } moving = true; w.ph += dt * 11;
        if (!w.path.length) { if (w.st === 'carry') { w.st = 'queue'; w.t = 0; } else w.st = w.then; } }
      const face = (lx: number, lz: number) => { const yw = Math.atan2(f.d * (lx - w.x), f.d * (lz - w.z)); w.yaw += Math.atan2(Math.sin(yw - w.yaw), Math.cos(yw - w.yaw)) * Math.min(1, dt * 8); };
      if (w.st === 'ready' && A) { face(w.x, w.z + 1);
        if (c.ph === 'work') { pose = 'work'; if (Math.random() < .55) { W(f, w.x + (Math.random() - .5) * .25, .45 + Math.random() * .5, w.z + .6, pV); pM.compose(pV, pQ.random(), pS.setScalar(.5 + Math.random() * .9)); sparkP.im.setMatrixAt(w.ii, pM); } }
        else if (c.ph === 'haul') { const pc = c.pieces![w.k]; if (pc && !w.piece) { c.next++; pc.st = 'lift'; pc.w = w; pc.u = 0; w.piece = pc; w.st = 'pick'; w.t = 0; pc.yaw0 = w.yaw; }
          else crewGo(w, homeOf(f), 'home'); } }
      else if (w.st === 'ready' && !A) crewGo(w, homeOf(f), 'home');
      if (w.st === 'pick') { w.t += dt; pose = 'lift'; if (w.t > .7) { w.st = 'carry'; w.piece!.st = 'carry'; w.path = crewRoute(w, qSpot(f, w)); } }
      if (w.st === 'carry') pose = 'up';
      if (w.st === 'queue') { face(bin.x, bin.z); pose = 'up'; if (c.dump! >= w.k * .3) { w.st = 'toss'; w.t = 0; w.piece!.st = 'toss'; w.piece!.from.copy(w.piece!.p); } }
      if (w.st === 'toss') { w.t += dt; face(bin.x, bin.z); pose = 'toss';
        if (w.t > .55) { w.piece!.st = 'gone'; if (A) writePiece(A, w.piece!); w.piece = null; f.bin!.puff = 0;
          crewGo(w, homeOf(f), 'home'); } }
      if (w.st === 'home' && (!A || c.ph === 'haul')) { face(w.x - 1, w.z); w.out += dt; w.sc = Math.max(0, 1 - w.out / .35); } else w.out = 0;
      // limbs: walk cycle (legs and arms swing), hammering, carrying overhead, tossing
      const sw = moving ? Math.sin(w.ph) : 0; w.l1.rotation.x = sw * .7; w.l2.rotation.x = -sw * .7; w.body.position.y = .26; // no bob while walking
      let ar = -sw * .6, al = sw * .6;
      if (pose === 'work') { ar = -1.25 + Math.sin(t * 15 + w.k * 2) * .35; al = -1.0; w.body.position.y = .26 + Math.abs(Math.sin(t * 7.5 + w.k)) * .02; }
      else if (pose === 'lift') { ar = al = -Math.PI * easeIO(clamp(w.t / .7, 0, 1)); }
      else if (pose === 'up') { ar = al = -Math.PI + .12; }
      else if (pose === 'toss') { ar = al = -Math.PI + 2.0 * easeIO(clamp(w.t / .4, 0, 1)); }
      w.a1.rotation.x = al; w.a2.rotation.x = ar;
      writeWorker(w, f, t);
    }
    if (A && c.pieces) { // pieces: attached until lifted into a worker's hands, carried overhead, tossed into the bin
      for (const pc of c.pieces) { const w = pc.w!;
        if (pc.st === 'lift') { pc.u = Math.min(1, w.t / .7); const e = easeIO(pc.u); hand(w, f, pc, pV); pc.p.lerpVectors(pc.c, pV, e); pc.q.slerpQuaternions(QI, pc.qt, e); pc.s = 1 + (pc.sc - 1) * e; }
        else if (pc.st === 'carry') { hand(w, f, pc, pc.p); pc.q.setFromAxisAngle(YAX, w.yaw - pc.yaw0).multiply(pc.qt); }
        else if (pc.st === 'toss') { const u = clamp(w.t / .55, 0, 1); W(f, bin.x, .5, bin.z, pV); arc(pc.from, pV, u, .6, pc.p); pc.s = pc.sc * (1 - .75 * easeIO(u)); }
        writePiece(A, pc); }
      if (c.pieces.every(pc => pc.st === 'gone')) { freeArm(A); dropJob(A); c.job = null; c.pieces = null; c.ph = 'idle'; for (const w of c.ws) if (w.st === 'ready') crewGo(w, homeOf(f), 'home'); } }
    if (!c.job && !(f.junk && f.junk.length) && c.ws.every(w => w.st === 'home' && w.out > .35)) killCrew(c);
  }
  window.__crew = { // test hooks: open a hall, then add fake arms to one of its lines and retire some of them
    focus() { const f = [...facs.values()].filter(f => f.lines.length).sort((a, b) => b.lines[0].slots.filter(Boolean).length - a.lines[0].slots.filter(Boolean).length)[0]; if (!f) return null; ctx.focus('project', f.id); return f.id; },
    retire(nFake = 3, idx = [0, 1]) { const f = facs.get(FS.focusF!); if (!f) return null; const l = f.lines.slice().sort((a, b) => a.slots.filter(Boolean).length - b.slots.filter(Boolean).length)[0];
      const tpl = [...arms.values()].find(A => A.line === l) || [...arms.values()][0]; if (!tpl) return null; const out: Arm[] = [];
      for (let i = 0; i < nFake; i++) { const si = l.slots.indexOf(null); if (si < 0) break; const A = makeArm(Object.assign({}, tpl.a, { id: 'crewtest-' + Date.now() + '-' + i, kind: 'sub', status: 'running', rate: 0, needsHuman: false }), l, si, false); if (A) out.push(A); }
      for (const A of out) { W(f, A.ax, 0, l.z + ARMDZ, A.root.position); A.root.rotation.y = f.rot; }
      for (const i of idx) if (out[i]) startDying(out[i], true); reslot(l);
      return { hall: f.id, line: l.id, fakes: out.map(A => A.a.id), ret: idx.map(i => out[i] && out[i].a.id) }; },
    spawn() { const f = facs.get(FS.focusF!); const l = f && f.lines.find(l => l.hold && l.hold.size); if (!l) return null; const si = l.slots.indexOf(null); if (si < 0) return null;
      const tpl = [...arms.values()].find(A => A.line === l); const A = tpl && makeArm(Object.assign({}, tpl.a, { id: 'crewtest-new-' + Date.now(), kind: 'sub', status: 'running', rate: 0, needsHuman: false }), l, si, true); return A ? A.a.id : null; },
    near(id: string) { const A = arms.get(id); if (!A) return null; let d = 99; for (const O of [...arms.values(), ...dyingArms]) if (O !== A && O.line === A.line) d = Math.min(d, Math.abs(O.ax - A.ax)); return { born: +A.born.toFixed(2), wait: A.wait, d: +d.toFixed(2) }; },
    speed(k: number) { crewTS = k; },
    info() { return { crews: crews.length, workers: crews.reduce((n, c) => n + c.ws.length, 0), jobs: crewJobs.size, dying: dyingArms.size, ph: crews.map(c => c.ph + ':' + c.ws.map(w => w.st).join(',')),
      holds: [...lineIdx.values()].reduce((n, l) => n + (l.hold ? l.hold.size : 0), 0), wpos: crews.flatMap(c => c.ws.map(w => W(c.f, w.x, 0, w.z).toArray().map(v => +v.toFixed(2)))), arms: [...arms.values()].filter(A => A.a.id.startsWith('crewtest')).map(A => ({ id: A.a.id, si: A.si, ax: +A.ax.toFixed(2) })) }; },
  };
  return { crewJobs, placeBin, WG, armCrewFrame };
}
