// Armoured cars: they wait in the bays at the bank, drive out to an office dock when it has drives (token packets)
// ready, a guard carries them aboard, and they bring them back to the bank stack. makeDispatch sends them out.
import type * as THREE from 'three';
import { clamp, damp } from '../../common/math.js';
import type { OSAtArmouredCars, OSAtDispatch } from '../state.js';
import { WHEEL, type Parts } from './parts.js';
import type { P2 } from '../../common/types.js';
import type { ArmouredCar, Office } from '../types.js';

/** Armoured car model, nose to +z, with a guard riding on the rear step (guard = the guard figure's geometry). */
export function armouredCarGeometry({ bx, cy, merge }: Parts, guard: THREE.BufferGeometry): THREE.BufferGeometry {
  const T = [], AR = '#4b5665', AD = '#394352';
  T.push(bx(1.5, 1.3, 2.9, 0, 1, -.35, AR), bx(1.5, .9, .95, 0, .8, 1.55, AD), bx(1.3, .32, .05, 0, 1, 2.03, '#0e1218'), bx(1.52, .16, 2.92, 0, .95, -.35, '#d9b23c'), bx(1.3, .1, .4, 0, .3, -1.95, AD), bx(.3, .12, .3, 0, 1.71, .2, '#d9b23c'));
  for (const x of [-.74, .74]) for (const z of [-1.2, 1.3]) T.push(cy(.32, .2, x, .32, z, WHEEL, 12, Math.PI / 2));
  const gd = guard.clone(); gd.translate(-.36, .35, -1.95); T.push(gd);
  return merge(T);
}

export function makeArmouredCars(OS: OSAtArmouredCars) {
  const { trucks, veh, mesh, G, VC, BAYX, BAYR, BAYN, BAYD, rowOf, bayZ, outZ, inZ, arc, drop, apron, bldgs, route, mkLeg, AZ, SVZ, LBZ, DOCKX, DOCK1, on, leftOut, leftIn, BOX, STZ, LO, vehs, BZ, mergeClear, SLIPX, MAXTRUCK, BIX, V, CARRY, trayAt, hop, stackAt, STK, take } = OS;
  const { scene } = OS.ctx;
  function addTruck() {
    const bay = trucks.length, T = veh('truck', mesh(G.truck, VC), BAYX(bay), bayZ(bay), 0), gd = mesh(G.guard, VC, true, false); scene.add(gd);
    Object.assign(T, { bay, gd, st: 'idle', load: [], F: null, want: 0, tmr: 0, gdk: 0, flying: 0, k: 0, slot: 0 }); trucks.push(T); return T;
  }
  // the lay-by holds two armoured cars nose to tail: slot 0 at the front (by the out road), slot 1 behind it. The car in slot 1 leaves through
  // slot 0, so it waits until slot 0 is empty and no car for slot 0 is on its way in close by; the car in slot 0 never waits for slot 1
  const slotX = (T: ArmouredCar) => T.slot ? DOCK1 : DOCKX;
  const front0 = (T: ArmouredCar, F: Office) => !trucks.some(O => O !== T && O.F === F && O.slot === 0 && (O.st === 'load' || (O.st === 'back' && !O.ret) || (O.st === 'out' && O.cl && Math.hypot(O.x - F.ox - SLIPX, O.z - F.oz - SVZ) < 30)));
  // every car claims its slot on the in road, first come first served: free once no other car holds it or has claimed it (and, for the front
  // slot, the rear car has gone: it leaves through the front slot). Until then it waits there; front0 counts only a car that has claimed
  const slotFree = (T: ArmouredCar, F: Office) => !trucks.some(O => O !== T && O.F === F && ((O.slot === T.slot && (O.st === 'load' || (O.st === 'back' && !O.ret) || (O.st === 'out' && O.cl))) ||
    (!T.slot && O.slot === 1 && (O.st === 'load' || (O.st === 'back' && !O.ret) || (O.st === 'out' && O.cl)))));
  const TVE = 9 * 1.3; // top speed of an empty armoured car on the street (a loaded one, like every other vehicle: 9)
  const bayIn = (T: ArmouredCar, z: number): P2[] => { const b = BAYX(T.bay); return [[b - BAYR, z], ...arc(b - BAYR, z - BAYR, BAYR, Math.PI / 2, 0), [b, bayZ(T.bay)]]; };
  const TR = 2.5; // the turn from a row's lanes onto the side lanes (row 1 only: row 0's lanes meet the in and out roads)
  // where the west side meets row 0's out lane (the corner by the out road) one car goes at a time: a row 0 car waits 4.8 m short of it (or in its bay)
  // while a row 1 car comes down the west side close by; a row 1 car waits up the west side while a row 0 car is in the corner
  const sideBusy = (T: ArmouredCar) => trucks.some(O => O !== T && !O.ghost && O.st === 'out' && rowOf(O.bay) === 1 && O.x < BOX + 1.2 && O.z > SIDEZ - .5 && O.z < AZ + .5);
  const cornerBusy = (T: ArmouredCar) => trucks.some(O => O !== T && !O.ghost && O.st === 'out' && rowOf(O.bay) === 0 && O.x > BOX - 1.5 && O.x < BOX + 4.4 && O.z > AZ - 1.2 && O.z < AZ + 2.5);
  const SIDEZ = outZ(BAYN) + TR + 1; // where a row 1 car waits on the west side
  function sendHome(T: ArmouredCar) { T.ret = false; T.q = false; T.cl = false; T.inb = false; T.rvg = 0; T.mv = false; T.legs.length = 0; T.leg = null; T.x = BAYX(T.bay); T.z = bayZ(T.bay); T.rot = 0; T.k = 0; T.st = T.load.length ? 'unload' : 'idle'; T.tmr = .6; if (T.F && T.F.truck === T) T.F.truck = null; if (T.st === 'idle') T.F = null; drop(apron, T); for (const F of bldgs.values()) drop(F.lock, T); }
  // left turns (roads.ts truckNet): it waits for a real gap (traffic.ts leftOut, leftIn)
  function goOut(T: ArmouredCar, F: Office) { // out of the bay with a right turn (or a left one, waiting for a gap), over the streets to the office dock
    const b = BAYX(T.bay), az = outZ(T.bay), r = route('bank:out', F.id + ':in', 'truck'); if (!r) return false;
    const lx = F.ox + slotX(T), L = mkLeg([...bayIn(T, az).reverse(), ...(rowOf(T.bay) ? arc(BOX + TR, az + TR, TR, -Math.PI / 2, -Math.PI, 6) : []), ...r, [lx + 3, F.oz + SVZ], [lx + 1.1, F.oz + LBZ], [lx, F.oz + LBZ]], { v: T.load.length ? 9 : TVE, end: () => { T.st = 'load'; T.tmr = .5; T.inb = false; } }); // stops in its slot of the lay-by, so the lane stays free
    L.ev.push({ s: 0, fx: true, tag: 'bayout', wait: () => { if (!bayFree(T, false) || (!rowOf(T.bay) && b - BAYR <= BOX + 4.8 && sideBusy(T))) return false; T.rvg = OS.simT; T.mv = true; return true; } }); on(L, b - BAYR - 3.5, az, null, () => { T.rvg = 0; T.mv = false; }); // pulls out when its bay area is clear; others wait while it does
    for (let j = rowOf(T.bay) * BAYN; j <= T.bay - 3; j++) on(L, BAYX(j) + 3.2, az, () => !moving(T, j), null, null, true, 'outlane'); // on the out lane: waits east of a bay a car is reversing into right now
    if (rowOf(T.bay)) on(L, BOX, SIDEZ, () => !cornerBusy(T), null, null, true, 'westside'); else if (b - BAYR > BOX + 4.8) on(L, BOX + 4.8, AZ, () => !sideBusy(T), null, null, true, 'corner'); // (clear of the west side; from the bay by the out road it waits in its bay, see bayout)
    leftOut(L, BOX, STZ, T, r); leftIn(L, T, r);
    T.cl = false; on(L, F.ox + SLIPX, F.oz + SVZ + 2.4, () => { if (T.cl) return true; if (!slotFree(T, F)) return false; T.cl = true; T.q = false; return true; }, null, null, true, 'slotq').fx = true;
    on(L, F.ox + SLIPX, F.oz + SVZ + 2.4, () => !vehs.some(O => O.F === F && (O as { cm?: boolean }).cm), null, null, true, 'side'); // waits on the in road while a car from the side car park comes down to the forecourt lane (sports-car.ts)
    // (the out road is only a few metres from the avenue roundabout: the keep-clear box where it joins makes it wait until there is room past it, see traffic.ts)
    T.inb = true; T.legs.push(L); return true;
  }
  // bank: two lanes. Cars coming back queue on the in lane by the fence and reverse from it into their bay; cars leaving pull out onto the out
  // lane by the bays. A car reverses or pulls out only while no other car uses that bay area (first come, first served within two bays of the same row). On the
  // in lane a car waits east of a bay area that another car has claimed; on the out lane only while a car is moving in it. A moving car never waits.
  const zoneOf = (j: number) => [BAYX(j) - BAYR - 2.5, BAYX(j) + 1.6];
  const busyBay = (T: ArmouredCar, j: number) => trucks.some(t => t !== T && t.bay === j && t.rvg && (t.mv || !T.rvg || t.rvg < T.rvg));
  const moving = (T: ArmouredCar, j: number) => trucks.some(t => t !== T && t.bay === j && t.mv);
  const bayFree = (T: ArmouredCar, rev: boolean) => { const b = BAYX(T.bay), [x0, x1] = zoneOf(T.bay), row = rowOf(T.bay), BZ = inZ(T.bay), AZ = outZ(T.bay), BAYZ = bayZ(T.bay);
    if (trucks.some(t => t !== T && t.rvg && rowOf(t.bay) === row && Math.abs(t.bay - T.bay) <= 2 && (!T.rvg || t.rvg < T.rvg))) return false;
    if (rev && b - BAYR - BOX < 4 && vehs.some(O => O !== T && !O.ghost && O.kind === 'truck' && O.st === 'out' && O.z > (row ? AZ + 1.1 : AZ - 2.5) && O.z < (row ? BZ + 2.5 : STZ) && O.x > BOX - 5 && O.x < b - BAYR)) return false; // the bay by the out road: nobody on the out road beside its stop either
    return !vehs.some(O => O !== T && !O.ghost && !O.parked && O.k > .05 && !(O.kind === 'truck' && !O.mv && O.z < BAYZ + .3) && (O.z < AZ + 1.1 ? O.z > BAYZ - 1.5 && O.x > x0 - 1 && O.x < Math.min(x1 + 4.5, BIX - 1.2) : rev && O.z < BZ + 1.2 && O.x > b - 1.6 && O.x < b + 3)); };
  function goBack(T: ArmouredCar, F: Office) { // back over the streets, past the bay, then reverse into it
    const r = bldgs.get(F.id) === F && route(F.id + ':out', 'bank:in', 'truck'); if (!r) { sendHome(T); return; }
    const L = mkLeg([[T.x, T.z], ...arc(F.ox + DOCKX - .3, F.oz + LBZ + 1.1, 1.1, -Math.PI / 2, -Math.PI, 6), ...r, ...(rowOf(T.bay) ? arc(BIX - TR, inZ(T.bay) + TR, TR, 0, -Math.PI / 2, 6) : []), [BAYX(T.bay) - BAYR, inZ(T.bay)]], { v: T.load.length ? 9 : TVE }); // row 1: north along the east side first // curves out of the lay-by onto the out road
    // leaves the lay-by as soon as the end of the forecourt lane is clear (from slot 1: and slot 0); the next car may come for this office at once.
    // It takes the forecourt lock, like a sports car backing out: the two meet where the lane turns onto the out road, so only one of them goes at a time
    // when only the lock holds it up it is next in line: a car still in its spot does not start backing out before it has gone
    L.ev.push({ s: 0, fx: true, tag: 'layby', wait: () => { if (T.slot && !front0(T, F)) { if (F.lock.nx === T) F.lock.nx = null; return false; } if (!take(F.lock, T)) { if (!F.lock.nx) F.lock.nx = T; return false; } if (!mergeClear(F, T)) { drop(F.lock, T); F.lock.nx = T; return false; } T.ret = true; if (F.truck === T) F.truck = null; return true; } });
    leftOut(L, F.ox - SLIPX, F.oz + STZ, T, r); leftIn(L, T, r); on(L, F.ox - SLIPX, F.oz + STZ - LO, null, () => { drop(F.lock, T); if (F.truck === T) F.truck = null; });
    const b = BAYX(T.bay), stopX = b - BAYR, BZ = inZ(T.bay), j0 = rowOf(T.bay) * BAYN;
    on(L, b + 4.2, BZ, null, () => { T.rvg = T.rvg || OS.simT; }); // from here on its bay area is taken
    // the bay by the out road: standing at its stop the car's nose is in the way of cars on the out road, while the cars queued for the out road keep
    // its bay area busy (a knot). So it waits 3 m short of the stop until the area and the out road are clear, then claims the move and goes straight in
    if (stopX - BOX < 4) { const w = () => { if (!bayFree(T, true)) return false; T.rvg = T.rvg || OS.simT; T.mv = true; return true; }; on(L, stopX + 3, BZ, w, null, 1.2, false, 'bay0').fx = true; }
    for (let j = j0; j < Math.min(MAXTRUCK, j0 + BAYN); j++) { const ex = BAYX(j) + 3.4; if (j === T.bay || BAYX(j) + 1.6 < stopX - 2.2 || ex > BIX - 1) continue; on(L, ex, BZ, () => !busyBay(T, j), null, null, true, 'busybay'); } // wait east of a bay area another car has claimed
    const rv = mkLeg(bayIn(T, BZ), { rev: true, v: 2, end: () => { T.rot = 0; T.st = 'unload'; T.tmr = .5; T.ret = false; T.rvg = 0; T.mv = false; } }); rv.ev.push({ s: 0, fx: true, tag: 'rev', wait: () => { if (!T.mv && !bayFree(T, true)) return false; T.mv = true; return true; } });
    T.legs.push(L, rv); T.st = 'back'; T.hold = 0;
  }
  const h0 = V(), h1 = V();
  function stepTruck(T: ArmouredCar, dt: number) {
    const F = T.F; if (T.st === 'back' && !T.ret) T.hold += dt;
    if (T.st === 'load') { const ok = F && bldgs.get(F.id) === F; T.tmr -= dt;
      const mine = T.load.length + T.flying; // it takes the drives it came for, and more (up to CARRY) only if nobody else has claimed them
      // it leaves as soon as it has CARRY or the pile is empty, never waiting at the dock. The rear car leaves through the front spot, so it
      // loads only once the front spot is clear (nobody loading, loaded or coming in there): loaded first, it would stand full behind that car
      const turn = !(T.slot && ok && !front0(T, F));
      if (T.tmr <= 0 && turn) { if (ok && mine < CARRY && F.dock.q.length && (mine < T.want || F.dock.q.length > F.dock.res)) { const c = F.dock.q.pop()!; if (mine < T.want) F.dock.res = Math.max(0, F.dock.res - 1); trayAt(F, F.dock.q.length, h0); /* from the top of the pile */ h1.set(T.x, 1.1, T.z); T.flying++; hop(h0, h1, c, () => { T.flying--; T.load.push(c); }); T.tmr = .22; }
        else if (!T.flying) { if (ok) F.dock.res = Math.max(0, F.dock.res - Math.max(0, T.want - T.load.length)); if (F) goBack(T, F); else sendHome(T); } } } // goBack itself sends it home when the office is gone
    else if (T.st === 'unload') { T.tmr -= dt;
      if (T.tmr <= 0) { if (T.load.length) { const c = T.load.pop()!; h0.set(T.x, 1.1, T.z); stackAt(clamp(Math.round(OS.stackShown), 0, STK - 1), h1); hop(h0, h1, c, null, .8); T.tmr = .16; } else { if (T.F && T.t0 != null) { const d = T.F.dock; d.trip = d.trip ? d.trip * .7 + (OS.simT - T.t0) * .3 : OS.simT - T.t0; } T.st = 'idle'; T.F = null; } } } // (the round trip, for dispatch)
    // the second guard steps off to the drive tray while loading
    T.gdk = damp(T.gdk, T.st === 'load' ? 1 : 0, 4, dt); const sn = Math.sin(T.rot), cs = Math.cos(T.rot), rx = T.x - sn * 1.95 + cs * .36, rz = T.z - cs * 1.95 - sn * .36;
    const gx = F ? F.ox + (T.slot ? -8.6 : -9.3) : rx, gz = F ? F.oz + 8.6 : rz; // beside the drive pile
    T.gd.position.set(rx + (gx - rx) * T.gdk, .39 * (1 - T.gdk) + .06 * T.gdk, rz + (gz - rz) * T.gdk); T.gd.rotation.y = T.gdk > .5 ? -Math.PI / 2 : T.rot; T.gd.scale.setScalar(Math.max(.001, T.k * T.gk));
  }
  // probe: why a loaded car still stands in its lay-by ('' when nothing holds it)
  const whyLay = (T: ArmouredCar) => !T.F ? '' : [!mergeClear(T.F, T) && 'merge', T.slot && !front0(T, T.F) && 'front0', T.F.lock.who && T.F.lock.who !== T && 'lock', T.F.lock.nx && T.F.lock.nx !== T && 'nx'].filter(Boolean).join('+');
  return { addTruck, goOut, h0, stepTruck, whyLay };
}

export function makeDispatch(OS: OSAtDispatch) {
  const { bldgs, CARRY, TRAY, trucks, MAXTRUCK, addTruck, goOut } = OS;
  // at most OUTMAX cars are on a run at once (out, loading, on the way back). The bank unloads only so many cars a minute: more cars on the
  // road would only queue, in the lay-bys and past the bank's in lane onto the street. The others stand in their bays until one is home.
  const OUTMAX = 10, onRun = () => trucks.filter(t => t.st === 'out' || t.st === 'load' || t.st === 'back').length;
  // each office gets as many cars as its pile needs, 1 to PERMAX: enough to carry what it makes in one round trip (rate: drives a second,
  // sampled every 5 s; trip: its cars' round trip, 60 s until one is back), with a fifth to spare. More than its two lay-by slots: the
  // extra cars are sent ahead (q) and wait on the in road for a slot. The pile's height counts too: one car per layer (TRAY drives), so a
  // pile that grows gets more and more cars and one that shrinks fewer (no new car goes out while an office has as many as it wants)
  const PERMAX = 10, TRIP0 = 60;
  const want = (F: Office) => { const d = F.dock;
    return clamp(Math.max(Math.ceil((d.rate || 0) * (d.trip || TRIP0) * 1.2 / CARRY), Math.ceil(d.q.length / TRAY)), 1, PERMAX); };
  // cars sent ahead per slot: one, two once the office wants more than five
  const aheadMax = (F: Office) => want(F) > 5 ? 2 : 1;
  const runs = (F: Office) => trucks.filter(t => t.F === F && (t.st === 'out' || t.st === 'load' || t.st === 'back')).length;
  function dispatch(dt: number) { OS.simT += dt; let run = onRun();
    for (const F of bldgs.values()) { const d = F.dock; d.acc = (d.acc || 0) + dt; if (d.acc >= 5) { const r = (d.n || 0) / d.acc; d.rate = d.rate == null ? r : d.rate * .6 + r * .4; d.n = 0; d.acc = 0; } }
    for (const F of [...bldgs.values()].sort((a, b) => b.dock.age - a.dock.age)) { // the dock that has waited longest first
      const d = F.dock, avail = d.q.length - d.res; d.age = avail > 0 ? d.age + dt : 0; if (run >= OUTMAX || avail <= 0 || (avail < CARRY && d.age < 3) || runs(F) >= want(F)) continue;
      // two lay-by slots per office: the front one first; the rear one only for a full load, while the front one is taken
      const held = (s: number) => trucks.some(t => t.F === F && t.slot === s && (t.st === 'out' || t.st === 'load' || (t.st === 'back' && !t.ret)));
      // a car in slot 1 that is loading or loaded leaves through slot 0: no new car for slot 0 until it has gone, or it would wait for that one too
      const rearBusy = trucks.some(t => t.F === F && t.slot === 1 && (t.st === 'load' || (t.st === 'back' && !t.ret)));
      // (sent ahead: only a full load, aheadMax per slot, when the office needs more than two cars)
      const ahead = (s: number) => trucks.filter(t => t.F === F && t.slot === s && t.st === 'out' && t.q).length >= aheadMax(F);
      let slot = !held(0) ? (rearBusy ? -1 : 0) : !held(1) && avail >= CARRY ? 1 : -1, q = false;
      if (slot < 0 && want(F) > 2 && avail >= CARRY) { slot = !ahead(0) ? 0 : !ahead(1) ? 1 : -1; q = true; } if (slot < 0) continue;
      const T = trucks.find(t => t.st === 'idle' && t.k >= 1 && !t.ghost) || (trucks.length < MAXTRUCK && !trucks.some(t => t.k < 1) ? addTruck() : null); if (!T || T.k < 1) continue;
      T.slot = slot; T.q = q; T.t0 = OS.simT; if (!goOut(T, F)) { T.q = false; continue; } T.F = F; F.truck = T; T.want = Math.min(CARRY, avail); d.res += T.want; d.age = 0; T.st = 'out'; run++; }
  }
  return { dispatch };
}
