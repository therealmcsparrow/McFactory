import * as THREE from 'three';
import { cut } from '../common/text.js';
import { hashf, clamp, damp } from '../common/math.js';
import { reduced } from '../common/dom.js';
import type { OSAtPeople } from './state.js';
import { addLegs, gait, gaitDip } from './gait.js';
import type { Gate, Office, OfficeSeat, Person, WalkPt, Want } from './types.js';

export function makePeople(OS: OSAtPeople) {
  const { HZ, leavers, q, bx, GREEN, AMBER, AISLE, seatPath, SPOTZ, NSPOT, LOTX, clothMat, mesh, G, BODY, M, BAL, people, addCar, MDOOR, deskPath, inTail, TEAMX, dropCar, carLeave, outPath, dA, FL, roleCol, OFFC, tc, BLUE, RED, effCol } = OS;
  const { camera } = OS.ctx;
  if (!addCar || !dropCar || !carLeave) throw new Error('office: makeSportsCar must run before makePeople'); // they are read once, here
  const INK = new THREE.Color('#c9ced6'); // text lines on a max-effort (black) screen
  // ── people ──
  // walkers keep their distance: nobody steps within PGAP of another walker (stepping away is always allowed); head-on both step aside
  // to the same hand, behind someone they wait their turn, a walker held up for a while edges round, and a newcomer appears only on a free spot
  // LANE: in through the east half of the front door, out through the west half
  // the front zone (forecourt between the cars and the wall, the door, the lobby with the time clock, the gap into the floor) is one way
  // at a time: newcomers wait in their car, leavers at the out gate (x OGX, z OGZ) until it runs their way; it turns once the other way
  // has waited DOORW s and the zone is empty; at most ZCAP walk through it at once. At most OUTK leavers walk to the gate at once, the others finish up at their desk first
  const PGAP = .6, PLOOK = 1.5, LANE = .3, INX = 5.6, OGX = 4.85, OGZ = 5.3, DOORW = 2.5, OUTK = 4, ZCAP = 4, crowd: Person[] = [], pLog: (string | number)[][] = [];
  const inFront = (P: Person) => P.z > HZ || (P.x > 4.3 && P.z > 5); // still in the front zone (an 'in' walker frees it here)
  function doorOK(P: Person, dir: Gate) { // may P enter the front zone going dir?
    let n = 0, w = 0; for (const Q of crowd) { if (Q === P || Q.f !== P.f) continue; if (Q.tok && Q.tok !== dir) return false; if (Q.tok === dir) n++; else if (Q.gd && Q.gd !== dir && !Q.tok) w = Math.max(w, Q.gw || 0); }
    return n ? n < ZCAP && w < DOORW : w <= (P.gw || 0); }
  const outQ = (F: Office) => { let n = 0; for (const Q of leavers) if (Q.f === F && Q.og && !Q.lq) n++; return n; };
  const solid = (P: Person, Q: Person) => Q !== P && Q.f === P.f && Q.state !== 'seat' && Q.state !== 'car' && !Q.hold;
  function roomAt(P: Person, x: number, z: number) { for (const Q of crowd) if (solid(P, Q) && Math.hypot(Q.x - x, Q.z - z) < PGAP) return false; return true; }
  function trimStep(P: Person, mx: number, mz: number): [number, number] { // drop the part of a step that walks into someone; P.by: who held P up most
    let by: Person | null = null, most = 0;
    for (let k = 0; k < 3; k++) { let hit = false;
      for (const Q of crowd) { if (!solid(P, Q) || Q === P.pass) continue; const ox = Q.x - P.x, oz = Q.z - P.z, d0 = Math.hypot(ox, oz);
        if (d0 < 1e-6 || d0 > PGAP + 1 || Math.hypot(ox - mx, oz - mz) >= PGAP) continue;
        const ux = ox / d0, uz = oz / d0, al = mx * ux + mz * uz; if (al > 0) { mx -= al * ux; mz -= al * uz; hit = true; if (al > most) { most = al; by = Q; } } }
      if (!hit) break; }
    P.by = by;
    for (const Q of crowd) { if (!solid(P, Q) || Q === P.pass) continue; const ox = Q.x - P.x, oz = Q.z - P.z, d1 = Math.hypot(ox - mx, oz - mz); if (d1 < PGAP && d1 < Math.hypot(ox, oz) - 1e-9) { P.by = Q; return [0, 0]; } }
    return [mx, mz];
  }
  function jamTop(P: Person): Person | null { // P is held up in a ring (A waits for B waits for ... A), nobody in it moves unless someone gives way: who in it goes first (the others make room); null for a plain queue, that drains by itself
    let q = P.by, top = P; for (let k = 0; k < 12 && q; k++) { if (q === P) return top; if (q.phase > top.phase) top = q; q = q.by; } return null; }
  function keepLane(P: Person, mx: number, mz: number): [number, number] { // stepping aside never takes anyone more than .45 off the line to the next node (walls, desks)
    const n = P.path[0], ax = n.x - P.sx0, az = n.z - P.sz0, L = Math.hypot(ax, az); if (L < .05) return [mx, mz];
    const vx = -az / L, vz = ax / L, o0 = (P.x - P.sx0) * vx + (P.z - P.sz0) * vz, lm = mx * vx + mz * vz, o1 = o0 + lm;
    if (Math.abs(o1) > .45 && Math.abs(o1) > Math.abs(o0)) { mx -= lm * vx; mz -= lm * vz; }
    const tx = ax / L, tz = az / L, a0 = (P.x - P.sx0) * tx + (P.z - P.sz0) * tz, am = mx * tx + mz * tz; // nor more than .3 back behind where the leg began
    if (am < 0 && a0 + am < -.3) { mx -= am * tx; mz -= am * tz; }
    return [mx, mz]; }
  function stride(P: Person, dx: number, dz: number, d: number, s: number, dt: number, soft: boolean): [number, number, boolean, boolean?] { // this frame's step towards the next node: [x, z, arrived, cut the corner]; soft: not the seat at the end
    if (d < 1e-6) return [dx, dz, true];
    if (P.segN !== P.path[0]) { P.segN = P.path[0]; P.sx0 = P.x; P.sz0 = P.z; P.segT = 0; }
    if ((P.segT += P.og && P.by && P.by.og ? 0 : dt) > 20) { // backstop: 20 s on one leg, walk on regardless (queueing for the out gate is no reason to give up)
      if (!P.ghost) { P.ghost = true; OS.pForced++; pLog.push(['ghost', +P.x.toFixed(1), +P.z.toFixed(1), P.leaving ? 'out' : 'in', P.path.length]); if (pLog.length > 40) pLog.shift(); }
      P.by = null; return d <= s ? [dx, dz, true] : [dx / d * s, dz / d * s, false]; }
    P.ghost = false;
    const ux = dx / d, uz = dz / d, rx = -uz, rz = ux, top = P.by ? jamTop(P) : null; let near: Person | null = null, nd = 1e9, nl = 0;
    for (const Q of crowd) { if (!solid(P, Q)) continue; const ox = Q.x - P.x, oz = Q.z - P.z, ah = ox * ux + oz * uz, lat = ox * rx + oz * rz;
      if (ah <= 0) continue; const dq = Math.hypot(ox, oz); if (dq < PGAP + .3 && dq < nd) { nd = dq; near = Q; nl = lat; }
      if (ah > PLOOK || Math.abs(lat) >= PGAP) continue;                                                                  // not in my lane ahead
      const qv = Math.hypot(Q.vx || 0, Q.vz || 0);
      if (qv > .2 && Q.vx * ux + Q.vz * uz < -.4 * qv) { if (!(P.dodge > 0)) P.side = lat > .15 ? -1 : 1; P.dodge = .45; } } // head-on: both to their right (left if the other is already on the right)
    let mx: number, mz: number, arrive = d <= s;
    if (P.dodge > 0) { P.dodge -= dt; mx = (ux * .5 + rx * .85 * P.side) * s; mz = (uz * .5 + rz * .85 * P.side) * s; arrive = false; }
    else if (top && top !== P) { const bx = P.x - P.by!.x, bz = P.z - P.by!.z, bl = Math.hypot(bx, bz) || 1; mx = bx / bl * .6 * s; mz = bz / bl * .6 * s; arrive = false; } // in a ring and not first: step back to make room
    else if (P.stuck > .6 && near) { const l = (nl > 0 ? -1 : 1) * (P.stuck > 3 ? -1 : 1); mx = (ux * .45 + rx * .9 * l) * s; mz = (uz * .45 + rz * .9 * l) * s; arrive = false; } // edge round whoever is in the way
    else if (arrive) { mx = dx; mz = dz; } else { mx = ux * s; mz = uz * s; }
    if (P.passT > 0 && (P.passT -= dt) <= 0) P.pass = null;
    if (!arrive) [mx, mz] = keepLane(P, mx, mz);
    const [fx, fz] = trimStep(P, mx, mz);
    if (fx * ux + fz * uz > .4 * s || (arrive && fx === mx && fz === mz)) P.stuck = Math.max(0, (P.stuck || 0) - dt * 2); else P.stuck = (P.stuck || 0) + dt * (P.og && P.by && P.by.og ? 0 : top === P ? 1 : top ? .3 : .1); // in a queue: patience
    if (P.stuck > 6 && P.by) { OS.pForced++; pLog.push(['pass', +P.x.toFixed(1), +P.z.toFixed(1), P.leaving ? 'out' : 'in', P.path.length]); if (pLog.length > 40) pLog.shift(); P.pass = P.by; P.passT = 1; P.stuck = 0; } // last resort: squeeze past the one in the way, never freeze for good
    const done = arrive && fx === mx && fz === mz, cut = !done && soft && d < .5 && Math.hypot(fx, fz) < .6 * Math.hypot(mx, mz); // held up close to a corner, the time clock or the way out: count it as reached
    return [fx, fz, done, cut];
  }
  const punch = (F: Office, inn: boolean) => { F.clockT = 1; F.clockC = inn ? GREEN : AMBER; };
  const CLOCK = (F: Office, inn: boolean): WalkPt => ({ x: 7.95, z: 5.95, wait: .7, pre: true, fn: () => punch(F, inn) });
  function walkIn(P: Person, sx: number | null): WalkPt[] { P.gin = true; const pre: WalkPt[] =sx == null ? [] : [{ x: sx - .95, z: 7.15, pre: true }]; return [...pre, { x: AISLE + LANE, z: 7.15, pre: true }, { x: AISLE + LANE, z: 6.3, pre: true }, CLOCK(P.f, true), { x: 6.1, z: 5.92, pre: true }, ...(P.seat ? seatPath(P.seat) : [])]; }
  const outFront = (P: Person, inside: boolean): WalkPt[] => [...(inside ? [{ x: 5.9, z: 5.92 }, ...(P.nocar ? [] : [{ x: 7.55, z: 5.92 }, CLOCK(P.f, false), { x: AISLE + LANE, z: 6.4 }])] : []), // through the front zone to the car (or off the street)
    ...(P.nocar ? [{ x: AISLE, z: 6.1 }] : [{ x: AISLE + LANE, z: 7.15 }, ...(P.car ? (P.car.spot >= NSPOT ? [{ x: LOTX - 1.5, z: 7.15 }, { x: LOTX - 1.5, z: P.car.pz - .9 }, { x: P.car.sx - .3, z: P.car.pz - .9 }] : [{ x: P.car.sx - .95, z: 7.15 }, { x: P.car.sx - .95, z: SPOTZ }]) : [{ x: 10.8, z: 7.15 }])])];
  function addPerson(F: Office, d: Want, seat: OfficeSeat, instant: boolean) {
    const a = d.a, id = d.key || a.id, g = new THREE.Group(); g.rotation.order = 'YXZ';
    const cm = clothMat(a.role), cl = mesh(G.torso, cm, true, false), aL = mesh(G.arm, cm, true, false), aR = mesh(G.arm, cm, true, false);
    const cup = new THREE.Mesh(G.cup, M.cup), bulb = new THREE.Mesh(G.bulb, M.bulb), bal = new THREE.Sprite(BAL[2]);
    aL.position.set(-.29, 1.05, .04); aR.position.set(.29, 1.05, .04); cup.visible = bulb.visible = bal.visible = false; bulb.position.y = 1.8; bal.position.set(.18, 2.02, 0); bal.scale.set(.74, .56, 1); g.add(cl, aL, aR, cup, bulb, bal); F.g.add(g);
    const { lL, lR } = addLegs(g, (geo, mt) => mesh(geo, mt, true, false), BODY[Math.floor(hashf(id, 3) * BODY.length)], G.leg, G.head);
    const P = { id, a, ids: d.ids || null, nocar: !!d.nocar, f: F, zk: seat.zone, seat, g, aL, aR, lL, lR, ph: hashf(id, 5) * 6, ga: 0, sp: .85 + hashf(id, 11) * .3, cup, bulb, bal, x: seat.x, z: seat.z, y: seat.sy, rot: seat.rot, path: [], wait: 0, state: 'seat', phase: hashf(id, 7), car: null, leaving: false, gone: false, talk: 0, pk: 0, hold: true } as unknown as Person;
    seat.who = id; people.set(id, P); const spot = P.nocar ? -1 : F.spots.indexOf(null);
    if (instant || reduced || (a.kind !== 'main' && !P.nocar)) { if (spot >= 0) { P.car = addCar(F, spot, a.role, P, true); if (!instant && !reduced) P.car.k = 0; }   // a subagent is sent out by the main agent: its car is already parked, it walks out of the manager's office to its desk
      if (!instant && !reduced && seat.ri != null && !seat.mgr) { P.x = MDOOR; P.z = 2; P.y = 0; P.rot = -Math.PI / 2; P.fast = true; P.state = 'walk'; P.path = deskPath(seat, 2); } }
    else if (P.nocar) { P.x = AISLE; P.z = 6.1; P.y = 0; P.state = 'walk'; P.gin = true; P.path = [{ x: 6.1, z: 5.92, pre: true }, ...seatPath(seat)]; } // a colleague walks up from the corridor
    else if (spot >= 0) { P.car = addCar(F, spot, a.role, P, false); P.state = 'car'; g.visible = false; }
    else { P.x = 10.8; P.z = 7.15; P.y = 0; P.state = 'walk'; P.path = walkIn(P, null); }
    return P;
  }
  function moveTo(P: Person, seat: OfficeSeat) { // another seat (the session moved to the meeting room or back)
    const old = P.seat, was = P.state === 'seat' && old; P.seat = seat; P.zk = seat.zone; seat.who = P.id;
    if (reduced) { P.x = seat.x; P.z = seat.z; P.path = []; return; }
    const pre = P.path.filter(n => n.pre); P.path = pre.length || P.state === 'car' ? [...pre, ...seatPath(seat)] : [...(was ? inTail(old).reverse().slice(1) : P.z > 4.6 && P.x > TEAMX + .3 ? [{ x: inTail(seat)[0].x === INX ? INX : TEAMX, z: 5.95 }] : []), ...inTail(seat)]; // (from the strip along the front, not across the out gate)
    if (P.state === 'seat') P.state = 'walk';
  }
  function dropPerson(P: Person) { if (people.get(P.id) === P) people.delete(P.id); leavers.delete(P); if (P.seat) { P.seat.who = null; P.seat = null; } P.f.g.remove(P.g); if (OS.pov && OS.pov.id === P.id) { OS.pov = null; OS.povMark(null); } }
  function leave(P: Person) { // finished: clock out, walk to the car, drive off (a colleague in a room just walks off)
    const s = P.seat, was = P.state === 'seat' && s; people.delete(P.id); P.leaving = true;
    if (reduced) { if (s) s.who = null; P.seat = null; if (P.car) dropCar(P.car); dropPerson(P); return; }
    leavers.add(P); if (P.state === 'car') { if (s) s.who = null; P.seat = null; P.gone = true; if (P.car && P.car.st === 'wait') { dropCar(P.car); dropPerson(P); } return; }
    if (P.hold && !P.tok) { if (P.car) carLeave(P.car); dropPerson(P); return; } // never stepped out (still in the car, off the street or in the manager's office): just goes again, unseen
    const inside = P.z < HZ; P.wait = 0;
    // no frames lately (the window is hidden or minimised): whoever is at a desk is simply gone when you look again, instead of a crowd
    // of everyone who finished meanwhile queueing at the out gate
    if (was && (document.hidden || performance.now() - OS.lastFrame > 1500)) { if (P.car) carLeave(P.car); dropPerson(P); return; }
    if (was) { P.path = [...outPath(s), ...outFront(P, true)]; P.lq = true; P.og = true; return; } // stays at the desk (seat kept) until there is room on the way out
    if (s) s.who = null; P.seat = null; P.state = 'walk';
    if (!inside || P.tok === 'out') P.path = outFront(P, inside); // already on the way out: straight on
    else if (P.tok === 'in') { P.path = [...P.path.filter(n => n.pre), { x: INX, z: 4.4 }, { x: OGX, z: 4.4 }, { x: OGX, z: OGZ, gate: 'out' }, ...outFront(P, true)]; P.og = true; } // on the way in: clock in, clear the front zone, then out the normal way
    else { P.path = [{ x: OGX, z: clamp(P.z, -1.65, 3.7) }, { x: OGX, z: OGZ, gate: 'out' }, ...outFront(P, true)]; P.og = true; }
  }
  function stepPerson(P: Person, dt: number, t: number) {
    if (P.state === 'car') { P.hold = true; return; }
    if (P.lq && outQ(P.f) < OUTK && roomAt(P, P.x, P.z) && roomAt(P, P.path[0].x, P.path[0].z)) { P.lq = false; if (P.seat && P.seat.who === P.id) P.seat.who = null; P.seat = null; P.state = 'walk'; } // a leaver gets up once there is room on the way out
    if (P.hold && P.gin && !P.tok && !reduced) { // a newcomer waits in the car (or off the street) until the front zone runs inwards
      if (!doorOK(P, 'in') || !roomAt(P, P.x, P.z)) { P.gd = 'in'; P.gw = (P.gw || 0) + dt; P.g.visible = false; return; } P.tok = 'in'; P.gd = null; P.gw = 0; }
    if (P.hold) { const ok = roomAt(P, P.x, P.z); // a newcomer steps out (car door, corridor, manager's office) only once that spot is free
      if (!ok && P.state === 'walk' && P.path.length && !reduced && (P.held = (P.held || 0) + dt) < 8) { P.g.visible = false; return; } if (!ok && P.state === 'walk') { OS.pForced++; pLog.push(['hold', +P.x.toFixed(1), +P.z.toFixed(1)]); if (pLog.length > 40) pLog.shift(); } P.hold = false; P.held = 0; }
    P.vx = P.vz = 0;
    if (P.wait > 0) { P.wait -= dt; P.by = null; if (P.gd) P.gw += dt; }
    else if (P.path.length && P.path[0].gate && P.gd) { if (doorOK(P, P.path[0].gate)) { P.tok = P.path[0].gate; P.gd = null; P.gw = 0; P.og = false; P.path.shift(); } else P.wait = .2; } // at the gate: through once the zone runs this way
    else if (P.lq) { /* finishing up at the desk */ }
    else if (P.path.length) { const n = P.path[0], dx = n.x - P.x, dz = n.z - P.z, d = Math.hypot(dx, dz), s = (P.fast ? 3.6 : 2.8) * P.sp * dt; P.state = 'walk'; // each their own pace (sp)
      const [mx, mz, arrive, cut] = stride(P, dx, dz, d, s, dt, P.path.length > 1 || P.leaving); P.vx = mx / dt; P.vz = mz / dt;
      if (n.gate && (arrive || cut)) { if (arrive) { P.x = n.x; P.z = n.z; } else { P.x += mx; P.z += mz; } P.gd = n.gate; P.gw = 0; } // reached the gate: wait there for the zone
      else if (arrive || cut) { if (arrive) { P.x = n.x; P.z = n.z; } else { P.x += mx; P.z += mz; } P.path.shift(); if (n.wait) P.wait = crowd.some(Q => Q.by === P) ? n.wait * .3 : n.wait; if (n.fn) n.fn(); } // a quick punch when someone waits behind
      else { P.x += mx; P.z += mz; const k = Math.hypot(mx, mz) > .3 * s; P.rot = dA(P.rot, k ? Math.atan2(mx, mz) : Math.atan2(dx, dz), 14, dt); } }
    else if (P.leaving) { if (P.car) carLeave(P.car); dropPerson(P); return; }
    else if (P.seat) { P.state = 'seat'; P.fast = false; P.by = null; }
    if (P.tok === 'in' && (!inFront(P) || P.gd || !P.path.length)) P.tok = null; // through the front zone: free it
    const a = P.a, seated = P.state === 'seat' && P.seat, run = a.status === 'running', ph = P.phase * 30; let y = 0, lean = 0, al = 0, ar = 0;
    if (seated) { P.rot = dA(P.rot, P.seat!.rot, 10, dt); y = P.seat!.sy; if (run) y += reduced ? 0 : Math.sin(t * 9 + ph) * .012; else if (a.status !== 'waiting' && P.seat!.sy) lean = -.16; }
    const sw = gait(P, seated || dt <= 0 ? 0 : Math.hypot(P.vx, P.vz) * dt, dt); // the legs on the distance walked: straight when seated or held up
    if (!seated) { y = gaitDip(P); al = sw; ar = -sw; }
    P.y = damp(P.y, y, 12, dt); const g = P.g; g.position.set(P.x, (P.z < HZ ? FL : .06) + P.y, P.z); g.rotation.y = P.rot; g.rotation.x = damp(g.rotation.x, lean, 6, dt);
    g.visible = (P.z > HZ - .05 || P.f.open > .02) && !(OS.pov && OS.pov.id === P.id && camera.position.distanceTo(OS.pov.pos) < 4);
    const cupOn = !!seated && (a.status === 'waiting' || P.seat!.zone === 'kit'); P.cup.visible = cupOn;
    if (cupOn) { const k = reduced ? 0 : Math.max(0, Math.sin(t * 1.3 + P.phase * 40) - .8) * 5; P.cup.position.set(.2 - .1 * k, 1 + .27 * k, .22); ar = -1 - .5 * k; }
    if (seated && run && P.seat!.top) { al = -1.22 + (reduced ? 0 : Math.sin(t * 19 + ph) * .13); ar = -1.22 - (reduced ? 0 : Math.sin(t * 19 + ph) * .13); }                 // typing
    P.aL.rotation.x = reduced ? al : damp(P.aL.rotation.x, al, 22, dt); P.aR.rotation.x = reduced ? ar : damp(P.aR.rotation.x, ar, 22, dt);
    if (P.talk > 0) P.talk -= dt; const talk = !!seated && !P.seat!.ri && P.seat!.ri !== 0 && (run || P.talk > 0);                                                          // meeting room and kitchen: a balloon while they speak
    P.bal.visible = talk; if (talk) P.bal.material = BAL[reduced ? 2 : Math.floor(t * 2.6 + P.phase * 3) % 3];
    P.bulb.visible = !!a.needsHuman; if (a.needsHuman) P.bulb.scale.setScalar(reduced ? 1 : .8 + .35 * Math.sin(t * 6));
    if (seated && run && P.f.open > .5 && !reduced && (P.pk -= dt) <= 0) { P.pk = .45 + hashf(P.id, Math.floor(t * 3)) * .5; OS.emit(P.f, P.zk, P.seat!.x, roleCol(a.role), 0, true); } // data on the cable while they work
  }
  function paint(F: Office, t: number) { // desk screens of the open building: effort colour, brightness by status
    const ink = F.screens.geometry.getAttribute('aInk') as THREE.InstancedBufferAttribute; let inkDirty = false;
    for (const s of F.seats) { if (s.idx < 0) continue; const P = s.who && people.get(s.who); let c = OFFC, inv = 0;
      if (P && P.state === 'seat') { const a = P.a, mine = OS.pov && OS.pov.id === P.id;
        if (a.needsHuman) c = tc.copy(BLUE).multiplyScalar(mine ? .9 : reduced ? 1.5 : 1.25 + .45 * Math.sin(t * 5));
        else if (a.status === 'failed') c = tc.copy(RED).multiplyScalar(mine ? .9 : 1.3);
        else { const k = a.status === 'running' ? 1.35 + (reduced ? 0 : .2 * Math.sin(t * 7 + P.phase * 20)) : a.status === 'waiting' ? .8 : .22;
          const max = String(a.effort).toLowerCase() === 'max'; inv = max ? 1 : 0; // max effort: black screen, light text lines (aInk, offices.ts)
          c = tc.copy(max ? INK : effCol(a.effort)).multiplyScalar(mine ? Math.min(k, .9) : k); } }
      F.screens.setColorAt(s.idx, c); if (ink.getX(s.idx) !== inv) { ink.setX(s.idx, inv); inkDirty = true; } }
    F.screens.instanceColor!.needsUpdate = true; if (inkDirty) ink.needsUpdate = true;
  }
  return { PGAP, INX, OGX, OGZ, crowd, pLog, walkIn, addPerson, moveTo, dropPerson, leave, stepPerson, paint };
}
