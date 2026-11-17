import { reduced } from '../common/dom.js';
import { damp, clamp } from '../common/math.js';
import type { OSAtFrame } from './state.js';

export function makeFrame(OS: OSAtFrame) {
  const { updateSun, bldgs, refreshVis, BLUE, WARM, AMBER, tc, DARKW, tc2, GREEN, CYAN, paint, spawnGates, vehs, spawn, dispatch, stepVeh, signal, blink, trucks, stepTruck, policeStep, robStep, stepFolk, cars, carLeave, booms, crowd, people, leavers, stepPerson, pulses, at, setM, pkt, HZ, FL, dockPush, trayAt, h0, hdd, HDDN, hops, stack, STK } = OS;
  const { camera } = OS.ctx;
  // ── frame ──
  const pv = [0, 0], gq = { x: 0, z: 0, i: 0 };
  function frame(dt: number, t: number) {
    updateSun();
    const near = OS.pov ? .25 : -600; if (camera.near !== near) { camera.near = near; camera.updateProjectionMatrix(); }
    for (const F of bldgs.values()) {
      const o = F.open = reduced || Math.abs(F.openT - F.open) < .002 ? F.openT : damp(F.open, F.openT, 6, dt);
      F.shell.visible = o < .985; F.inner.visible = o > .01; F.shell.position.y = o * 2.2; F.shellMesh.castShadow = o < .01;
      for (const m of [F.mShell, F.mWin, F.mSign, F.mSiren]) { m.opacity = 1 - o; m.transparent = o > .001; }
      if ((o > .5) !== F.pickOn) { F.pickOn = o > .5; refreshVis(F); }
      // windows: lit while agents work, blue when the project needs you
      const c = F.counts, NW = F.wl.length, litN = c.need ? NW : c.run ? clamp(6 + c.run * 6 + c.wait * 2, 0, NW) : c.wait ? clamp(3 + c.wait * 2, 0, NW) : 0, lc = c.need ? BLUE : c.run ? WARM : AMBER;
      let ch = F.wDirty || (c.need && !reduced); for (let i = 0; i < NW; i++) { const tg = F.wOrder[i] < litN ? 1 : 0, v = F.wl[i]; if (v !== tg) { F.wl[i] = Math.abs(tg - v) < .004 || reduced ? tg : damp(v, tg, 2.5, dt); ch = true; } }
      if (ch) { const k = (c.need ? (reduced ? 1.9 : 1.5 + .6 * Math.sin(t * 4)) : c.run ? 1.55 : .8); for (let i = 0; i < NW; i++) F.win.setColorAt(i, tc.copy(DARKW).lerp(tc2.copy(lc).multiplyScalar(k * (c.need ? 1 : F.wVar[i])), F.wl[i])); F.win.instanceColor!.needsUpdate = true; F.wDirty = false; }
      // roof siren: blue flashing = needs you, amber = waiting, green = running
      if (c.need) F.mSiren.color.copy(BLUE).multiplyScalar(reduced ? 1.6 : (t * 1.5) % 1 < .5 ? 2.6 : .15);
      else if (c.wait && !c.run) F.mSiren.color.copy(AMBER).multiplyScalar(reduced ? 1.6 : 1 + (Math.sin(t * 4) * .5 + .5) * 1.4);
      else if (c.run) F.mSiren.color.copy(GREEN).multiplyScalar(1.5); else F.mSiren.color.set('#2a2d33');
      F.srv = Math.max(0, F.srv - dt * 1.2); F.mSrv.color.copy(CYAN).multiplyScalar(.25 + 1.7 * F.srv);
      F.clockT = Math.max(0, F.clockT - dt * 1.1); F.mLed.color.copy(F.clockC).multiplyScalar(.12 + 2.2 * F.clockT);
      if (o > .01) paint(F, t);
    }
    // traffic
    spawnGates(spawn); // the staff cars, each at its in road
    OS.lightTick(); // the traffic lights (roads.ts)

    const thru = (L: Parameters<typeof OS.atL>[0], s: number, x: number, z: number) => { for (let d = -4; d <= 16; d += .5) { OS.atL(L, Math.max(0, s + d), gq); if (Math.abs(gq.x - x) < 1.6 && Math.abs(gq.z - z) < 1) return true; } return false; };
    dispatch(dt); for (const A of [...vehs]) stepVeh(A, dt); for (const A of vehs) { signal(A, dt); blink(A); } for (const T of trucks) stepTruck(T, dt);
    policeStep(dt, t); robStep(dt, t); stepFolk(dt, t);
    for (const c of cars) if (c.end && c.st === 'parked') { c.end = false; carLeave(c); }
    // a bank gate opens for an armoured car only: one whose way runs through it within the next 16 m (so it is open before the car turns
    // in off the street), and stays open until it is 4 m past
    for (const B of booms) { const want = vehs.some(O => O.kind === 'truck' && !O.parked && O.leg && Math.hypot(O.x - B.x, O.z - B.z) < 24 && thru(O.leg, O.s, B.x, B.z)) ? 1 : 0; B.o = reduced ? want : damp(B.o, want, 5, dt); B.b.rotation.z = -B.o * 1.35; }
    crowd.length = 0; for (const P of people.values()) if (P.state !== 'seat' && P.state !== 'car') crowd.push(P); for (const P of leavers) if (P.state !== 'seat' && P.state !== 'car') crowd.push(P);
    for (const P of people.values()) stepPerson(P, dt, t);
    for (const P of [...leavers]) stepPerson(P, dt, t);
    // packets on the data lines
    let n = 0; for (let i = pulses.length - 1; i >= 0; i--) { const p = pulses[i]; p.s += dt * 5; const len = p.cum[p.cum.length - 1];
      if (p.s >= len || !bldgs.has(p.F.id)) { pulses.splice(i, 1); if (bldgs.get(p.F.id) === p.F) { if (!p.deco) dockPush(p.F, p.c); p.F.srv = 1; } continue; }
      if (p.s < 0 || n >= 400) continue; at(p.pts, p.cum, p.s, pv); setM(pkt, n, p.F.ox + pv[0], pv[1] > HZ ? .22 : FL + .16, p.F.oz + pv[1]); pkt.setColorAt(n, tc.copy(p.c).multiplyScalar(1.9)); n++; }
    pkt.count = n; pkt.instanceMatrix.needsUpdate = true; if (pkt.instanceColor) pkt.instanceColor.needsUpdate = true;
    // drives: on the dock trays and in the air
    n = 0; for (const F of bldgs.values()) { const qd = F.dock.q; for (let j = 0; j < qd.length && n < HDDN; j++) { trayAt(F, j, h0); setM(hdd, n, h0.x, h0.y, h0.z); hdd.setColorAt(n, qd[j]); n++; } }
    for (let i = hops.length - 1; i >= 0; i--) { const h = hops[i]; h.t += dt / h.dur; const k = Math.min(1, h.t);
      if (n < HDDN) { setM(hdd, n, h.a.x + (h.b.x - h.a.x) * k, h.a.y + (h.b.y - h.a.y) * k + Math.sin(Math.PI * k) * (h.dur > .6 ? 6.5 : 1.3), h.a.z + (h.b.z - h.a.z) * k, k * 3); hdd.setColorAt(n, h.c); n++; }
      if (h.t >= 1) { hops.splice(i, 1); if (h.fn) h.fn(); } }
    hdd.count = n; hdd.instanceMatrix.needsUpdate = true; if (hdd.instanceColor) hdd.instanceColor.needsUpdate = true;
    OS.stackShown = damp(OS.stackShown, OS.stackN, 2, dt); stack.count = clamp(Math.round(OS.stackShown), 0, STK);
  }
  return { frame };
}
