import * as THREE from 'three';
import { clamp } from '../../common/math.js';
import { reduced } from '../../common/dom.js';
import type { OSAtTraffic } from '../state.js';
import { MOTO_IND_DIM } from './motorcycle.js';
import { SUV_IND_DIM } from './suv.js';
import { HATCH_IND_DIM } from './hatchback.js';
import { PICKUP_IND_DIM } from './pickup.js';
import { BOX_IND_DIM } from './box-truck.js';
import type { P2 } from '../../common/types.js';
import type { AnyVehicle, Vehicle, VehKind, VehOf, SportsCar, Lock, OfficeLeg, LegOpts, LegPos, LegEvent, Office, Ring, LaneZone, Junction, JInfo, RouteP } from '../types.js';

export function makeTraffic(OS: OSAtTraffic) {
  const { col, merge, bx, bldgs, SLIPX, SVZ, LA, LO, RW } = OS;
  const { scene } = OS.ctx;
  // ── vehicles: follow a leg (a dense, smoothed line), never drive into each other ──
  // each vehicle is two circles; before it moves it samples its own line ahead and brakes for whatever is there. Forecourts and the
  // bank apron take one moving vehicle at a time (a lock taken on the street), so nobody has to pass or back up into somebody else.
  const STEP = .3, ACC = 4, DEC = 6, MG = .25, SIRV = 1.35, vehs: AnyVehicle[] = [], apron: Lock = { who: null }, spawnQ: SportsCar[] = [], tstat = { vanish: 0, sq: 0 }; // tstat: how many vehicles faded out to get unstuck (probe)
  const q = { x: 0, z: 0, i: 0, rot: 0 }, q1 = { x: 0, z: 0, i: 0 }, q2 = { x: 0, z: 0, i: 0 };
  function mkLeg(P: P2[], o: LegOpts = {}): OfficeLeg {
    let R = [P[0].slice() as P2], px = P[0][0], pz = P[0][1], need = STEP;
    for (let i = 1; i < P.length; i++) { const dx = P[i][0] - px, dz = P[i][1] - pz; let d = Math.hypot(dx, dz), ux = dx / (d || 1), uz = dz / (d || 1); while (d >= need) { px += ux * need; pz += uz * need; R.push([px, pz]); d -= need; need = STEP; } need -= d; px = P[i][0]; pz = P[i][1]; }
    const e = P[P.length - 1], l = R[R.length - 1]; if (Math.hypot(e[0] - l[0], e[1] - l[1]) > .05 || R.length < 2) R.push(e.slice() as P2);
    for (let pass = 0; pass < 2; pass++) R = R.map((p, i): P2 => { const k = Math.min(4, i, R.length - 1 - i); if (!k) return p; let x = 0, z = 0; for (let j = i - k; j <= i + k; j++) { x += R[j][0]; z += R[j][1]; } return [x / (2 * k + 1), z / (2 * k + 1)]; });
    const n = R.length, cum = new Float32Array(n), vp = new Float32Array(n), vmax = o.v || 9;
    for (let i = 1; i < n; i++) cum[i] = cum[i - 1] + Math.hypot(R[i][0] - R[i - 1][0], R[i][1] - R[i - 1][1]);
    for (let i = 1; i < n - 1; i++) { const ax = R[i][0] - R[i - 1][0], az = R[i][1] - R[i - 1][1], bx2 = R[i + 1][0] - R[i][0], bz = R[i + 1][1] - R[i][1], k = Math.abs(Math.atan2(ax * bz - az * bx2, ax * bx2 + az * bz)) / STEP; vp[i] = k > .01 ? clamp(Math.sqrt(5 / k), 1.6, vmax) : vmax; }
    vp[0] = vmax; vp[n - 1] = o.fout ? vmax : .6; for (let i = n - 2; i >= 0; i--) vp[i] = Math.min(vp[i], Math.sqrt(vp[i + 1] * vp[i + 1] + 2 * DEC * (cum[i + 1] - cum[i])));
    return { pts: R, cum, vp, len: cum[n - 1] || .001, rev: !!o.rev, fin: !!o.fin, fout: !!o.fout, end: o.end || null, ev: [] };
  }
  function atL<T extends LegPos>(L: OfficeLeg, s: number, o: T): T { const c = L.cum, n = c.length; s = clamp(s, 0, L.len); let i = clamp(Math.floor(s / L.len * (n - 1)), 0, n - 2); while (i > 0 && c[i] > s) i--; while (i < n - 2 && c[i + 1] < s) i++;
    const k = (s - c[i]) / (c[i + 1] - c[i] || 1), a = L.pts[i], b = L.pts[i + 1]; o.x = a[0] + (b[0] - a[0]) * k; o.z = a[1] + (b[1] - a[1]) * k; o.i = i; return o; }
  function pose<T extends LegPos>(L: OfficeLeg, s: number, o: T): T { atL(L, s - .8, q1); atL(L, s + .8, q2); atL(L, s, o); o.rot = Math.atan2(q2.x - q1.x, q2.z - q1.z) + (L.rev ? Math.PI : 0); return o; }
  function on(L: OfficeLeg, x: number, z: number, wait: (() => boolean) | null, fn?: (() => void) | null, near?: number | null, re?: boolean, tag?: string) { let bi = 0, bd = Infinity; for (let i = 0; i < L.pts.length; i++) { const d = (L.pts[i][0] - x) ** 2 + (L.pts[i][1] - z) ** 2; if (d < bd) { bd = d; bi = i; } } const e: LegEvent = { s: L.cum[bi], wait, fn, near, re, tag }; L.ev.push(e); L.ev.sort((a, b) => a.s - b.s); return e; } // re: asked again every frame until passed
  const take = (lk: Lock, A: AnyVehicle) => { if (lk.who && lk.who !== A && vehs.includes(lk.who)) return false; if (lk.nx && lk.nx !== A && vehs.includes(lk.nx)) return false; lk.who = A; lk.nx = null; return true; },
    drop = (lk: Lock, A: AnyVehicle) => { if (lk.who === A) lk.who = null; if (lk.nx === A) lk.nx = null; };
  const DIM: Partial<Record<VehKind, [number, number, number]>> = { moto: [.45, .5, .04], suv: [.63, .8, .06], hatch: [.54, .6, .06], pickup: [.63, 1.02, .06], box: [.77, .95, .04] }; // r, off, y of a kind that is neither car-sized nor truck-sized (r: half the width, off + r: half the length)
  function veh<K extends VehKind>(kind: K, g: THREE.Object3D, x: number, z: number, rot: number) { const car = kind === 'car' || kind === 'police', dm = DIM[kind], A = { kind, g, x, z, rot, r: dm ? dm[0] : car ? .6 : .78, off: dm ? dm[1] : car ? .7 : 1.15, y: dm ? dm[2] : car ? .06 : .04, legs: [], leg: null, s: 0, v: 0, k: 1, gk: 1, ghost: false, gt: 0, stuck: 0, parked: true, by: null, lat: 0, latT: null, sig: 0, sigT: 0 } as unknown as VehOf<K>;
    A.ind = [1, -1].map(side => { const m = new THREE.Mesh(indGeo(kind, side), IND); m.visible = false; g.add(m); return m; }); scene.add(g); vehs.push(A); place(A); return A; }
  // turn signals: a pair of amber lamps (front and rear corner) on each side; side +1 is the side the nose turns to when rot grows
  const IND = new THREE.MeshBasicMaterial({ color: col('#ffab2e').multiplyScalar(2.2) }), indG = new Map<string, THREE.BufferGeometry>();
  const IND_DIM = { car: [.6, 1.27, -1.27, .4], police: [.63, 1.32, -1.32, .48], truck: [.77, 1.98, -1.84, .66], moto: [...MOTO_IND_DIM], suv: [...SUV_IND_DIM], hatch: [...HATCH_IND_DIM], pickup: [...PICKUP_IND_DIM], box: [...BOX_IND_DIM] } as Record<string, number[]>; // half width, front, rear, height
  function indGeo(kind: VehKind, side: number) { const key = kind + side; if (!indG.has(key)) { const [w, f, r, y] = IND_DIM[kind] || [.77, 1.76, -1.82, .58]; indG.set(key, merge([bx(.08, .1, .16, side * w, y, f - .08, '#fff'), bx(.08, .1, .16, side * w, y, r + .08, '#fff')])); } return indG.get(key)!; }
  const wrapA = (a: number) => ((a + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI, q4 = { x: 0, z: 0, i: 0 }, q5 = { x: 0, z: 0, i: 0 };
  const hdg = (L: OfficeLeg, s: number) => { atL(L, s, q4); atL(L, s + .6, q5); return Math.atan2(q5.x - q4.x, q5.z - q4.z); };
  // which way is A about to turn? On a roundabout it signals only to leave it: from about 70° before its exit (just past the arm before the one
  // it takes) until it is off the ring, not while it passes exits it does not take. Elsewhere it signals a turn of more than ~40° in the next
  // 10 m, but not for the roundabout ahead (going round is not a turn). Reversing and parked vehicles do not signal. (Only the lamp: offRing
  // below reads the vehicle's path, so who gives way to whom does not depend on when the lamp goes on.)
  function signal(A: AnyVehicle, dt: number) { if ((A.sigT -= dt) > 0) return; A.sigT = .15; const L = A.leg; let s = 0;
    if (L && !L.rev && !A.parked && A.k > .5) { const c = rAt(A.x, A.z), h0 = hdg(L, A.s);
      if (c && Math.hypot(A.x - c[0], A.z - c[1]) < c[2] + .9) { const reach = c[2] * 1.25; // ~70° of the ring
        for (let d = .5; d <= reach && A.s + d < L.len; d += .5) { atL(L, A.s + d, q3); if (Math.hypot(q3.x - c[0], q3.z - c[1]) > c[2] + .9) { const cr = (A.x - c[0]) * Math.cos(h0) - (A.z - c[1]) * Math.sin(h0); s = Math.sign(cr) || A.sig || 0; break; } } } // the way it goes round tells the exit side
      else { let e = A.s; for (let d = .5; d <= 10 && A.s + d < L.len - .6; d += .5) { atL(L, A.s + d, q3); if (rAt(q3.x, q3.z)) break; e = A.s + d; } const dh = wrapA(hdg(L, e) - h0); if (Math.abs(dh) > .7) s = Math.sign(dh); } }
    A.sig = s; }
  // the lamps blink even with reduced motion (a slow 1.25 Hz flash; lit steadily they read as always on)
  function blink(A: AnyVehicle) { const on = (A.sig || A.haz) as boolean && OS.simT % .8 < .45; A.ind[0].visible = on && (A.haz || A.sig > 0); A.ind[1].visible = on && (A.haz || A.sig < 0); } // haz: hazard lights, both sides
  // reading the signals: a vehicle on the ring that will leave it before it reaches your entry does not hold you up
  // two wide vehicles (armoured car, van) swing too close when one leaves at the very arm the other enters: then it still waits
  function offRing(O: AnyVehicle, c: Ring, te: number, A: AnyVehicle) { if (!O.leg || O.parked || O.leg.rev) return false; const th = A.r > .7 || O.r > .7 ? .7 : .3; if (Math.abs(wrapA(Math.atan2(O.z - c[1], O.x - c[0]) - te)) < th + .2) return false;
    for (let d = .5; d <= 16; d += .5) { if (O.s + d > O.leg.len) return false; atL(O.leg, O.s + d, q3); if (Math.hypot(q3.x - c[0], q3.z - c[1]) > c[2] + .9) return true; if (Math.abs(wrapA(Math.atan2(q3.z - c[1], q3.x - c[0]) - te)) < th) return false; }
    return false; }
  // ...and one on the street that turns off (into a forecourt, the bank, a yard) before it reaches the out road does not hold up a vehicle waiting there
  function turnsOff(O: AnyVehicle, laneZ: number, xStop: number, dir: number) { if (!O.leg || O.leg.rev) return false;
    for (let d = .5; d <= 30; d += .5) { if (O.s + d > O.leg.len) return false; atL(O.leg, O.s + d, q3); if (Math.abs(q3.z - laneZ) > .7) return true; if (dir * (q3.x - xStop) >= 0) return false; }
    return false; }
  function place(A: Vehicle) { A.g.position.set(A.x, A.y, A.z); A.g.rotation.y = A.rot; A.g.scale.setScalar(Math.max(.001, A.k * A.gk)); }
  function dropVeh(A: AnyVehicle) { const i = vehs.indexOf(A); if (i >= 0) vehs.splice(i, 1); scene.remove(A.g); drop(apron, A); for (const F of bldgs.values()) drop(F.lock, A); }
  function hits(A: AnyVehicle, x: number, z: number, rot: number, mg: number, skip: boolean, rb?: AnyVehicle | null): AnyVehicle | null { // would A, standing at this pose, be closer to another vehicle than allowed (and closer than it is now)?
    const sn = Math.sin(rot), cs = Math.cos(rot), s0 = Math.sin(A.rot), c0 = Math.cos(A.rot);
    // a circle that stays inside the body as it stands now (the tail when it drives straight on) cannot touch anything new: it is not checked,
    // or two armoured cars side by side (one turning into the bank, one passing) each wait for the other's tail
    const cov = (i: number) => { const px = x + sn * A.off * i - A.x, pz = z + cs * A.off * i - A.z, t = clamp(px * s0 + pz * c0, -A.off, A.off); return Math.hypot(px - s0 * t, pz - c0 * t) < 1e-5; }, cv = [cov(-1), false, cov(1)]; // exactly on the axis: drifting sideways (to the shoulder) is always checked
    for (const O of vehs) { if (O === A || O.ghost || (skip && O.by === A)) continue; const thr = A.r + O.r + (O.parked ? 0 : mg), far = thr + A.off + O.off; if ((x - O.x) ** 2 + (z - O.z) ** 2 > far * far) continue;
      const so = Math.sin(O.rot), co = Math.cos(O.rot);
      // one coming the other way, far enough to the side that the two pass (the lanes of a two-lane road are 1.9 m apart; where an arm meets a
      // roundabout a vehicle that still curves off the ring comes closer to one at the line beside it than the circles allow, but never touches it)
      if (!O.parked && sn * so + cs * co < -.7 && Math.abs((x - O.x) * co - (z - O.z) * so) > A.r + O.r + .2) continue;
      for (let i = O === rb ? 1 : -1; i <= 1; i += 2) for (let j = -1; j <= 1; j += 2) { const ox = O.x + so * O.off * j, oz = O.z + co * O.off * j, fx = x + sn * A.off * i - ox, fz = z + cs * A.off * i - oz, d2 = fx * fx + fz * fz;
        if (d2 < thr * thr && !cv[i + 1]) { const nx = A.x + s0 * A.off * i - ox, nz = A.z + c0 * A.off * i - oz; if (d2 < nx * nx + nz * nz - 1e-6) return O; } } }
    return null;
  }
  // roundabouts: whoever is on the ring has the right of way; a vehicle that wants in waits at the line while somebody on the ring would reach its
  // entry before it is in and clear of it (see ringBusy), and until there is room for it past the exit it takes
  const rAt = (x: number, z: number) => { for (const c of OS.net.rq ? OS.net.rq(x, z) : OS.net.R) { const y = c[2] + 1.15; if ((x - c[0]) ** 2 + (z - c[1]) ** 2 < y * y) return c; } return null; };
  // junctions (roads.ts rb: T-junctions and lit crossings): the box in the middle. ringAt (for everybody else) counts a junction's box as a
  // ring too (J.c, inner radius 0): nobody stops in it, a short cut is not taken over it
  const jAt = (x: number, z: number) => { const Q = OS.net.jq; if (!Q) return null; for (const j of Q(x, z)) if (Math.abs(x - j.x) < 5 && Math.abs(z - j.z) < 5) return j; return null; };
  const ringAt = (x: number, z: number): Ring | null => rAt(x, z) || jAt(x, z)?.c || null;
  const JSL = 9.2, inBox = (J: Junction, x: number, z: number, m = 0) => Math.abs(x - J.x) < RW + .3 + m && Math.abs(z - J.z) < RW + .3 + m;
  const armOf = (J: Junction, x: number, z: number) => { const dx = x - J.x, dz = z - J.z; return Math.abs(dx) > Math.abs(dz) ? (dx > 0 ? 0 : 2) : (dz > 0 ? 1 : 3); };
  const TRN = ['U', 'R', 'S', 'L'] as const, q8 = { x: 0, z: 0, i: 0 };
  // the next junction on A's leg (once per tick): where it goes into the box and out (sIn, sOut), its stop line (sLine), the arms in and out, its turn
  function jInfo(A: AnyVehicle): JInfo | null { const L = A.leg, Js = OS.net.J; if (!L || L.rev || !Js || !Js.length) return null;
    const c = A.jI; if (c && c.t === OS.simT && c.leg === L) return c.v; let v: JInfo | null = null;
    if (Js.some(j => Math.abs(j.x - A.x) < 40 && Math.abs(j.z - A.z) < 40)) { const back = A.off + A.r;
      for (let s = Math.max(0, A.s - 12); s <= Math.min(L.len, A.s + 30); s += .5) { atL(L, s, q8); const J = jAt(q8.x, q8.z); if (!J || !inBox(J, q8.x, q8.z)) continue;
        let so = s; while (so + .25 <= L.len) { atL(L, so + .25, q8); if (!inBox(J, q8.x, q8.z)) break; so += .25; }
        if (so <= A.s - back) { s = so; continue; } // passed it: the next one
        let sl = s; while (sl - .25 >= 0) { atL(L, sl - .25, q8); const ax = Math.abs(q8.x - J.x), az = Math.abs(q8.z - J.z); if (Math.max(ax, az) >= JSL || Math.min(ax, az) >= RW) break; sl -= .25; }
        atL(L, sl < s - 1 ? sl : Math.max(0, s - .5), q8); const ai = armOf(J, q8.x, q8.z); atL(L, Math.min(L.len, so + 3), q8); const ao = armOf(J, q8.x, q8.z);
        v = { J, sIn: s, sOut: so, sLine: sl, ai, ao, t: TRN[((ai - ao) % 4 + 4) % 4] }; break; } }
    A.jI = { t: OS.simT, leg: L, v }; return v; }
  // who goes first at a junction: a siren unit coming; the lights (red, or amber while it can still stop; one that waits at the line to turn
  // left goes in the first 1.8 s of amber); a left turn (or a U-turn) gives way to traffic from the other side going straight on or right;
  // without lights the side road gives way to the through road; nobody goes while one in the box crosses its way, or without room past the exit
  const opp = (a: number, b: number) => (a + 2) % 4 === b;
  function jConflict(I: JInfo, O: JInfo) { if (O.ai === I.ai) return false; const lI = I.t === 'L' || I.t === 'U', lO = O.t === 'L' || O.t === 'U';
    if (opp(I.ai, O.ai)) return lI !== lO; if (I.t === 'R' && O.t === 'R') return false; if ((I.t === 'R' || O.t === 'R') && I.ao !== O.ao) return false; return true; }
  function jWait(A: AnyVehicle, I: JInfo): string { const J = I.J, nose = A.s + A.off + A.r;
    if (sirenFor(A, (x, z) => inBox(J, x, z, .5))) return 'siren';
    if (J.lit) { const [st, tt] = OS.lightAt(J, I.ai % 2); if (st === 'r' || (st === 'a' && !(A.wl && (I.t === 'L' || I.t === 'U') && tt < 1.8))) return 'red'; }
    for (const O of vehs) { if (O === A || O.ghost || O.parked || O.k < .05 || Math.abs(O.x - J.x) > 45 || Math.abs(O.z - J.z) > 45) continue; const P = jInfo(O); if (!P || P.J !== J) { if (inBox(J, O.x, O.z) && !siren(O)) return 'box'; continue; }
      const on = O.jc === J || inBox(J, O.x, O.z), wt = O.wl && O.v < .3, dIn = P.sIn - O.s - O.off - O.r;
      if (on) { if (jConflict(I, P) || (J.lit && P.ai % 2 !== I.ai % 2)) return 'box'; continue; }
      if (wt || O.s > P.sOut) continue;
      if ((I.t === 'L' || I.t === 'U') && opp(I.ai, P.ai) && (P.t === 'S' || P.t === 'R') && dIn < Math.max(12, O.v * 3.2)) return 'yield';
      if (!J.lit && J.arms.length === 3 && I.ai % 2 !== J.main && P.ai % 2 === J.main && dIn < Math.max(14, O.v * 3.5) && !(P.t === 'R' && P.ao === I.ai) && !(I.t === 'R' && P.ai !== (I.ai + 1) % 4)) return 'giveway'; }
    if (noRoom(A, A.leg!, I.sOut + A.off + A.r + .3) || (OS.zeb && OS.zeb.ringHold(A, A.leg!, I.sOut, A.off + A.r + 4))) return 'junroom';
    void nose; return ''; }
  // keep-clear boxes where an out road joins the street: nobody stops in one, a vehicle waits before it until there is room past it
  const inKc = (x: number, z: number) => OS.net.kc.some(k => Math.abs(x - k[0]) < k[2] && Math.abs(z - k[1]) < k[3]);
  const q6 = { x: 0, z: 0, i: 0, rot: 0 }, noRoom = (A: AnyVehicle, L: OfficeLeg, s: number) => { if (s > L.len) return false; pose(L, s, q6); const O = hits(A, q6.x, q6.z, q6.rot, MG, true); return !!O && O.v < 2; };
  // sirens on (a police unit driving out to a call-out or a robbery): right of way everywhere, as long as nobody is physically in its way
  const siren = (A: AnyVehicle | null | undefined) => !!(A && A.unit && A.U && A.U.dir === 'out');
  // (one that stands in a queue does not count: the swat van behind a patrol car waiting at the station exit, with a truck at the roundabout line in
  // the lane the patrol car joins, held that truck, and so itself, for good)
  // the siren units that wait at a line or pull out slowly (not one standing in a queue), with the next 14 m of their way: [x, z, heading]; once a frame
  const q7 = { x: 0, z: 0, i: 0, rot: 0 }, swC: { t: number; W: { A: AnyVehicle; P: [number, number, number][] }[] } = { t: -1, W: [] };
  const sirenWait = () => { if (swC.t === OS.simT) return swC.W; swC.t = OS.simT; swC.W = [];
    for (const Y of vehs) { if (!siren(Y) || Y.ghost || !Y.leg) continue;
      if (Y.by && Y.v < .3) { let f: AnyVehicle | null = Y.by; for (let n = 0; f && !f.unit && n < 12; n++) { f.sq = OS.simT; f = f.v < .3 ? f.by : null; } continue; } // the queue in front of it: see ringBusy
      if (Y.v > 4 || Y.leg.len - Y.s < 8) continue; const P: [number, number, number][] = [];
      for (let d = 0; d <= 14 && Y.s + d <= Y.leg.len; d += 1) { pose(Y.leg, Y.s + d, q7); P.push([q7.x, q7.z, q7.rot]); } swC.W.push({ A: Y, P }); }
    return swC.W; };
  // a siren unit standing at a short cut's line (polcut) waits for A when A is in the lane it joins, right at that point (say at a roundabout's line
  // just past it): then A goes first, or each would wait for the other
  const cutFor = (O: AnyVehicle, A: AnyVehicle) => { const c = O.cj; if (!c || O.v > .5 || c[3] - OS.simT > 4.05 || c[3] < OS.simT) return false; const dx = A.x - c[0], dz = A.z - c[1], al = dx * Math.sin(c[2]) + dz * Math.cos(c[2]);
    return al > -12 && al < 4 && Math.abs(dx * Math.cos(c[2]) - dz * Math.sin(c[2])) < 1.6; };
  const sirenFor = (A: AnyVehicle, f: (x: number, z: number) => boolean) => { const r = !siren(A) && vehs.some(O => siren(O) && !O.ghost && !O.wl && !(O.by && O.v < .3) && !cutFor(O, A) && O.leg && soonAt(O, 26, f) && !soonAt(O, 26, (x, z) => Math.hypot(x - A.x, z - A.z) < 1.8)); if (r) A.sg = true; return r; }; // a siren unit that will be there soon, unless A is ahead of it on its way
  // whoever wants in waits for anybody on the ring (either lane) that comes up to its entry within about 2.3 rad, unless that one signals it
  // will leave before it gets there (offRing); a siren unit waits only for one right at its entry
  // (one in a queue with a siren unit standing at its tail goes like a siren unit: the queue moves on and lets it through)
  function ringBusy(c: Ring, A: AnyVehicle, ex: number, ez: number) { sirenWait(); const te = Math.atan2(ez - c[1], ex - c[0]), sw = siren(A) || OS.simT - (A.sq ?? -9) < .3;
    if (!sw && sirenFor(A, (x, z) => Math.hypot(x - c[0], z - c[1]) < c[2] + .9)) return true; // waits at the line for a siren unit coming to this roundabout
    if (!sw && A.leg && swC.W.length) for (const Y of swC.W) { if (Math.abs(Y.A.x - A.x) > 40 || Math.abs(Y.A.z - A.z) > 40 || cutFor(Y.A, A)) continue; // ...or for one that waits to pull out just past it (the station's out road,
      for (let d = 2; d <= 30 && A.s + d < A.leg.len; d += 2) { pose(A.leg, A.s + d, q7); if (Y.P.some(p => Math.abs(p[0] - q7.x) < 2.6 && Math.abs(p[1] - q7.z) < 2.6)) { A.sg = true; return true; } } } // a short cut): the street it would drive into stays clear
    if (OS.pol.jam && !A.unit && OS.simT < OS.pol.jam.until && c[0] === OS.pol.jam.x && c[1] === OS.pol.jam.z) return true; // a jam made on purpose (probe): police units still get in
    for (const O of vehs) { if (O === A || O.ghost || O.k < .05 || Math.hypot(O.x - c[0], O.z - c[1]) > c[2] + .9) continue; const d = ((Math.atan2(O.z - c[1], O.x - c[0]) - te) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI); if ((sw ? d < 1.1 || d > 2 * Math.PI - .4 : d < 2.3 || d > 2 * Math.PI - .6) && !offRing(O, c, te, A)) return true; } // a siren unit only waits for one right at its entry
    return false; }
  // forecourts: arriving vehicles never wait on the street; a vehicle that wants to leave its spot or the lay-by waits there until nobody is on the way in
  // the armoured car joins only the last stretch of the forecourt lane, the way the leaving cars go: it waits only until that stretch is clear
  // (an armoured car standing in the other spot of the same lay-by does not count: it is off the lane)
  const mergeClear = (F: Office, T: AnyVehicle) => !vehs.some(O => O !== T && !O.ghost && !O.parked && O.k > .05 && !(O.kind === 'truck' && O.F === F && (O.st === 'load' || (O.st === 'back' && !O.ret))) && O.x > F.ox - SLIPX - 1.6 && O.x < F.ox - 2.5 && O.z > F.oz + SVZ - 4.2 && O.z < F.oz + SVZ + 1.8);
  // (one that is already on the forecourt lane west of A's spot has passed it: it no longer holds A up)
  const canLeave = (F: Office, A: AnyVehicle) => !vehs.some(O => O !== A && O.inb && O.F === F && Math.hypot(O.x - F.ox - SLIPX, O.z - F.oz - SVZ) < 28 && !(O.x < A.x - 3.5 && O.z > F.oz + SVZ - 4.5 && O.z < F.oz + SVZ + 1.5)) && take(F.lock, A);
  // out roads: traffic on the street has the right of way. An out road only turns right, into the outer westbound lane: a vehicle waits at the line
  // until nobody coming from the east will be in that lane at the junction (one changing lanes into it counts, one turning off before it does not),
  // and until the inner lane is clear too when it wants that lane (the bank's out road) or swings over it (an armoured car)
  const streetClear = (jx: number, zs: number, A: AnyVehicle, inner: boolean) => !sirenFor(A, (x, z) => Math.abs(x - jx) < 3 && Math.abs(z - zs) < 2) && !vehs.some(O => O !== A && !O.ghost && !O.parked && O.k > .05 &&
    ((O.z < zs + .3 && O.z > zs - RW - .6 && O.x > jx - 2.6 && O.x < jx + Math.max(A.kind === 'truck' ? 20 : 14, O.v * 2.3, inner && A.kind === 'truck' && Math.abs(O.z - zs + LA) < .9 ? 28 : 0) && // an armoured car pulls out slowly: it looks further (furthest for the far lane it crosses into)
      ((inner && Math.abs(O.z - zs + LA) < .9) || (Math.abs(O.z - zs + LO) < .9 && O.x < jx + 2.6) || (O.leg ? soonAt(O, Math.max(14, O.v * 2.3) + 3, (x, z) => Math.abs(x - jx) < 2.6 && z < (inner ? zs + .3 : zs - LA - .5) && z > zs - RW - .3) : Math.abs(O.z - zs + LO) < .9))) || // (one moving into the inner lane counts when A wants that lane too)
     (O.leg && Math.abs(O.x - jx) < 30 && ringAt(O.x, O.z) && soonAt(O, 12, (x, z) => Math.abs(x - jx) < 10 && z < zs - LA - .5 && z > zs - RW - .3)))); // or will be there within 12 m (coming off a roundabout)
  const q3 = { x: 0, z: 0, i: 0 }, soonAt = (O: AnyVehicle, m: number, f: (x: number, z: number) => boolean) => { for (let d = 1; d <= m; d += 1.5) { atL(O.leg!, O.s + d, q3); if (f(q3.x, q3.z)) return true; } return false; };
  // an armoured car swings its nose over the far lane even when it turns right: it waits for both lanes.
  // The line is far enough back that a car standing at it keeps more than MG from an armoured car passing in the near lane: closer, and that
  // car would stop for it, in the very lane the waiting car waits to see clear (both stood still until one faded out)
  const LINE: Record<string, number> = { truck: 3.3, car: 2.7, suv: 2.85, pickup: 3.05 }, giveWay = (L: OfficeLeg, jx: number, zs: number, A: AnyVehicle, r: P2[]) => { const e = on(L, jx, zs - LO - (LINE[A.kind] ?? LINE.car),() => streetClear(jx, zs, A, A.kind === 'truck' || r.some(p => Math.abs(p[0] - jx) < .01 && Math.abs(p[1] - zs + LA) < .01)), null, 1.2, false, 'giveway'); e.ag = .6; return e; }; // looked at when it is at the line, not before
  function gap(A: Vehicle, O: Vehicle) { let m = Infinity; for (let i = -1; i <= 1; i += 2) for (let j = -1; j <= 1; j += 2) m = Math.min(m, Math.hypot(A.x + Math.sin(A.rot) * A.off * i - O.x - Math.sin(O.rot) * O.off * j, A.z + Math.cos(A.rot) * A.off * i - O.z - Math.cos(O.rot) * O.off * j) - A.r - O.r); return m; }
  const overlap = (A: AnyVehicle) => vehs.some(O => O !== A && !O.ghost && gap(A, O) < .05);
  // ── lane changes (the S-curves roads.ts keeps in net.lz) ──
  // found once per leg: where on it a lane change starts (s0) and ends (s1)
  function legZones(L: OfficeLeg) { if (L.lz) return L.lz; const out: { s0: number; s1: number; z: LaneZone }[] = [], P = L.pts, n = P.length;
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity; for (const p of P) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); z0 = Math.min(z0, p[1]); z1 = Math.max(z1, p[1]); }
    if (!L.rev) for (const Z of OS.net.lz || []) { if (Z.x0 < x0 - 1 || Z.x0 > x1 + 1 || Z.z0 < z0 - 1 || Z.z0 > z1 + 1) continue; let i0 = -1, b = .2025;
      if (!Z.c && (OS.net.R.some(c => Math.hypot(Z.x0 - c[0], Z.z0 - c[1]) < c[2] + 4) || (OS.net.J || []).some(j => Math.abs(Z.x0 - j.x) < 10 && Math.abs(Z.z0 - j.z) < 10))) continue; // one that starts right off a roundabout (a short stretch): waiting there would block the ring, it goes on (hits() still keeps it clear)
      for (let i = 0; i < n; i++) { const d = (P[i][0] - Z.x0) ** 2 + (P[i][1] - Z.z0) ** 2; if (d < b) { b = d; i0 = i; } } if (i0 < 0) continue;
      const s0 = L.cum[i0]; let s1 = -1; for (let i = i0 + 1; i < n && L.cum[i] < s0 + 22; i++) if ((P[i][0] - Z.x1) ** 2 + (P[i][1] - Z.z1) ** 2 < .36) { s1 = L.cum[i]; break; }
      if (s1 > s0 && !out.some(o => Math.abs(o.s0 - s0) < 1)) out.push({ s0, s1, z: Z }); }
    out.sort((a, b) => a.s0 - b.s0); return L.lz = out; }
  // where A would join the lane it moves into (level with the start of the change), and how far along that lane O is from there
  const zA0 = (Z: LaneZone, c: Ring) => Math.atan2(Z.z0 - c[1], Z.x0 - c[0]);
  function lanePt(Z: LaneZone) { const c = Z.c; if (c) { const a = zA0(Z, c); return { x: c[0] + c[2] * Math.cos(a), z: c[1] + c[2] * Math.sin(a), h: Math.atan2(Math.sin(a), -Math.cos(a)), c }; }
    const ux = Math.sin(Z.h), uz = Math.cos(Z.h), L = (Z.x1 - Z.x0) * ux + (Z.z1 - Z.z0) * uz; return { x: Z.x1 - ux * L, z: Z.z1 - uz * L, h: Z.h }; }
  function inLane(O: AnyVehicle, Z: LaneZone): number | null { const c = Z.c;
    if (c) { if (Math.abs(Math.hypot(O.x - c[0], O.z - c[1]) - c[2]) > 1) return null; return wrapA(zA0(Z, c) - Math.atan2(O.z - c[1], O.x - c[0])) * c[2]; } // the ring turns to smaller angles
    if (Math.abs(wrapA(O.rot - Z.h)) > .6) return null; const ux = Math.sin(Z.h), uz = Math.cos(Z.h); if (Math.abs((O.x - Z.x1) * uz - (O.z - Z.z1) * ux) > 1.25) return null; return (O.x - Z.x0) * ux + (O.z - Z.z0) * uz; }
  // a gap in the other lane: time to the one ahead (a slow one ahead must be past the end of the change, or A would stand across both lanes)
  // and to the one behind, from the speeds, A's when it starts the change. A long wait makes it settle for less (but never less than room)
  function laneGap(A: AnyVehicle, Z: LaneZone, ds: number) { const vc = Math.max(A.v, 2.5), tq = ds / Math.max(A.v, 1.5), wt = A.wt || 0, rx = wt > 15 ? .2 : wt > 6 ? .5 : 1, hA = A.off + A.r;
    const Lz = Z.c ? wrapA(zA0(Z, Z.c) - Math.atan2(Z.z1 - Z.c[1], Z.x1 - Z.c[0])) * Z.c[2] : (Z.x1 - Z.x0) * Math.sin(Z.h) + (Z.z1 - Z.z0) * Math.cos(Z.h);
    for (const O of vehs) { if (O === A || O.ghost || O.parked || O.k < .05) continue; const al = inLane(O, Z); if (al == null || al < -40 || al > Lz + 20) continue;
      const hl = hA + O.off + O.r, aO = al + O.v * tq;
      // one in that lane that waits to move into A's lane, level with A or behind it: the one behind (level: the first in the list) lets the other go first
      if (O.lw && Math.abs(al) < hl + 1.5 && Math.hypot(O.lw.x - A.x, O.lw.z - A.z) < 1.6 && (al < -.3 || (al <= .3 && vehs.indexOf(A) < vehs.indexOf(O)))) continue;
      if (aO >= 0) { const need = O.v < 1.5 && rx > .2 ? Math.min(Lz, 8) + hl + .6 : hl + (.8 + Math.max(0, vc - O.v)) * rx; if (aO < need) return false; }
      else { if (O.by === A && O.v < .3) continue; // one behind it that it holds up itself (its nose by A's side) is not coming: waiting for it would lock both
        const need = hl + (1 + O.v * .7 + Math.max(0, O.v - vc) * 1.5) * rx; if (-aO < need) return false; } }
    return true; }
  const turn = (a: number, b: number, m: number) => { const d = ((b - a + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI; return Math.abs(d) <= m ? b : a + Math.sign(d) * m; };
  // lat: how far right of its lane a vehicle drives (a stop on the shoulder); it moves towards latT by LATR per metre driven, so only while rolling
  const LATR = .47, latAt = (A: Vehicle, d: number) => A.latT == null ? 0 : A.lat + clamp(A.latT - A.lat, -LATR * d, LATR * d);
  function poseA(A: Vehicle, L: OfficeLeg, s: number, d: number) { pose(L, s, q); const l = latAt(A, d); if (l) { const h = q.rot - (L.rev ? Math.PI : 0); q.x -= Math.cos(h) * l; q.z += Math.sin(h) * l; } return q; }
  function stepVeh(A: AnyVehicle, dt: number) {
    A.gk = A.ghost ? Math.max(0, A.gk - dt * 3) : Math.min(1, A.gk + dt * 3);
    let L = A.leg;
    if (!L) { if (!A.legs.length) { A.parked = true; A.v = 0; A.by = null; A.stuck = 0; if (A.k < 1) A.k = Math.min(1, A.k + dt * 2); if (A.ghost && !overlap(A)) A.ghost = false; place(A); return; } L = A.leg = A.legs.shift()!; A.s = 0; A.v = 0; A.parked = false; }
    // waved through by a police officer (wv): a wait without side effects (fx) counts as passed, and the roundabout line too; hits() still applies
    // a give way that held at its line is asked again while the vehicle still stands at it, held there by something else (a keep-clear box):
    // what was clear when it got there may not be when it can go
    let lim = L.len, wr = ''; const wv = A.wave! > OS.simT; A.rb = null; for (const e of L.ev) { if (e.done) { if (e.ag && e.wait && !wv && A.v < .3 && A.s < e.s + e.ag && !e.wait()) { lim = Math.min(lim, A.s); wr = e.tag || 'wait'; break; } continue; } if (e.wait && (!e.ok || e.re) && A.s >= e.s - (e.near || 7)) e.ok = e.wait() || (wv && !e.fx); if (e.wait && !e.ok) { lim = Math.min(lim, e.s); wr = e.tag || 'wait'; break; } if (A.s >= e.s - .05) { e.done = true; if (e.fn) e.fn(); } }
    if (!A.ghost && !wv && !rAt(A.x, A.z)) for (let d = .2, dm = Math.max(6, A.v * A.v / (2 * DEC) + 3); d <= dm; d += .2) { atL(L, A.s + d, q1); const c = rAt(q1.x, q1.z); if (!c) continue;
      if (d > A.off + A.r + .1) { let w = ringBusy(c, A, q1.x, q1.z) ? 'ring' : '';
        if (!w && !siren(A)) { let de = d; while (de < d + 40 && A.s + de < L.len) { atL(L, A.s + de, q1); if (!rAt(q1.x, q1.z)) break; de += .3; } if (noRoom(A, L, A.s + de + A.off + A.r + .3)) w = 'ringroom'; // room for it past the exit
          else if (OS.zeb && OS.zeb.ringHold(A, L, A.s + de, A.off + A.r + 4)) w = 'zebraring'; } // and nobody on the zebra just past it (it would stop on the ring: crossings.ts)
        if (w) { const l2 = Math.max(A.s, A.s + d - A.off - A.r - .7); if (l2 < lim) { lim = l2; wr = w; } } } break; }
    // junctions: it waits at the stop line (jWait) until it may go; once it has decided to go (jc: from where it could no longer stop at the
    // line in comfort) it does not look again, except for room past the exit (then it waits before the box, never in it). Siren units just go
    if (!A.ghost && !L.rev) { const I = jInfo(A); if (A.jc && (!I || I.J !== A.jc)) A.jc = null;
      if (I && !siren(A)) { const hl = A.off + A.r, nose = A.s + hl;
        if (A.jc !== I.J) { if (nose > I.sLine + .3 || wv) A.jc = I.J;
          else { const w = jWait(A, I); if (w) { const l2 = Math.max(A.s, I.sLine - hl - .1); if (l2 < lim) { lim = l2; wr = w; } } else if (I.sLine - nose < A.v * A.v / (2 * DEC) + 1.5) A.jc = I.J; } }
        if (A.jc === I.J && nose < I.sIn + .2 && noRoom(A, L, I.sOut + hl + .3)) { const l2 = Math.max(A.s, I.sIn - hl - .2); if (l2 < lim) { lim = l2; wr = 'junroom'; } } } }
    if (!A.ghost && !wv && !siren(A) && !inKc(A.x, A.z)) for (let d = .2, dm = Math.max(5, A.v * A.v / (2 * DEC) + 2); d <= dm && A.s + d < L.len; d += .2) { atL(L, A.s + d, q1); if (!inKc(q1.x, q1.z)) continue;
      let de = d; while (de < d + 12 && A.s + de < L.len) { atL(L, A.s + de, q1); if (!inKc(q1.x, q1.z)) break; de += .2; }
      if (noRoom(A, L, A.s + de + A.off + A.r + .2)) { const l2 = Math.max(A.s, A.s + d - A.off - A.r - .3); if (l2 < lim) { lim = l2; wr = 'keepclear'; } } break; }
    // zebras: people on foot on one, or stepping onto it, have the right of way: it stops before the stripes (crossings.ts; a siren unit does not)
    if (!A.ghost && !siren(A) && OS.zeb) { const zs = OS.zeb.stopAt(A, L); if (zs != null && zs < lim) { lim = zs; wr = 'zebra'; } }
    // lane changes: it starts one only when the lane it moves into has a gap; else it slows down and waits at the start of the change, in its own lane
    if (!A.yw) A.lw = null; // (one on the shoulder waiting to get back into the lane keeps its own, see police.ts makeWay)
    let vl = Infinity;
    if (!A.ghost && !siren(A) && !L.rev) for (const w of legZones(L)) { if (w.s0 < A.s - .05) continue; const ds = w.s0 - A.s; if (ds > Math.max(8, A.v * A.v / (2 * DEC) + 4)) break;
      if (!laneGap(A, w.z, ds)) { if (w.z.c && ds > 1.2) { vl = 2.2; if (!wr) wr = 'lane'; } // on a roundabout it slows down first, so the one in the outer lane mostly gets past without it stopping;
        else if (w.z.c) { const l2 = Math.max(A.s, w.s0 - .1); if (l2 < lim) { lim = l2; wr = 'lane'; } } // if not, it stops in the inner lane where it would move over (it never pushes in beside one)
        else { const l2 = Math.max(A.s, w.s0 - .1); if (l2 < lim) { lim = l2; wr = 'lane'; } if (ds < 2 && A.v < 1) A.lw = lanePt(w.z); } } break; }
    // ...and one that waits to move into this lane just ahead gets room: a slow vehicle coming up in that lane stops short of it (not one already beside it)
    if (!A.ghost && !siren(A) && !A.lw && A.v < 4.5) for (const W of vehs) { const p = W.lw; if (!p || W === A || W.ghost) continue; let rel: number;
      if (p.c) { const c = p.c; if (Math.abs(Math.hypot(A.x - c[0], A.z - c[1]) - c[2]) > 1) continue; rel = wrapA(Math.atan2(A.z - c[1], A.x - c[0]) - Math.atan2(p.z - c[1], p.x - c[0])) * c[2]; }
      else { if (Math.abs(wrapA(A.rot - p.h)) > .6) continue; const ux = Math.sin(p.h), uz = Math.cos(p.h), dx = p.x - A.x, dz = p.z - A.z; if (Math.abs(dx * uz - dz * ux) > 1) continue; rel = dx * ux + dz * uz; }
      const room = rel - (A.off + A.r + W.off + W.r) - 1.3; if (rel > 14 || room < 0) continue; const l2 = A.s + room; if (l2 < lim) { lim = l2; wr = 'letin'; } }
    // ...and nobody drives into the way of a siren unit that waits at a line or pulls out slowly (the station's out road, a short cut across
    // the street, a roundabout line): one that can still stop short of where its path crosses the unit's next 14 m stops there (before a
    // roundabout, not on it); one that cannot carries on. The unit's own wait then sees the street clear
    if (!A.ghost && !A.unit && !L.rev && !ringAt(A.x, A.z)) { const W = sirenWait(), hl = A.off + A.r, sm = A.v * A.v / (2 * DEC) + .3;
      for (const Y of W) { if (Math.abs(Y.A.x - A.x) > 45 || Math.abs(Y.A.z - A.z) > 45) continue;
        for (let d = 1; d <= 34 && A.s + d < L.len; d += 1) { pose(L, A.s + d, q7); if (!Y.P.some(p => Math.abs(p[0] - q7.x) < 2.4 && Math.abs(p[1] - q7.z) < 2.4 && Math.hypot(p[0] - q7.x, p[1] - q7.z) < 2.4 && Math.abs(OS.adiff(p[2], q7.rot)) > .5)) continue;
          let st = A.s + d - hl - 1; while (st > A.s && (atL(L, st + hl, q1), ringAt(q1.x, q1.z))) st -= .5; // (its nose before the ring's line)
          if (st - A.s >= sm && st < lim) { lim = st; wr = 'siren'; A.sg = true; } break; } }
      // a unit about to cross the street on a short cut (a U-turn to its stop, a left turn out of an out road): in the lane it joins and the one beside
      // it, one that can still stop in comfort holds with its nose 6 m before the point where the unit joins; one nearer carries on (the unit waits for it)
      for (const Y of vehs) { const c = Y.cj; if (!c || c[3] < OS.simT || Y.ghost || Y === A || !siren(Y) || Math.abs(OS.adiff(A.rot, c[2])) > .4 || Math.abs(c[0] - A.x) > 60 || Math.abs(c[1] - A.z) > 60) continue;
        const dx = A.x - c[0], dz = A.z - c[1], al = dx * Math.sin(c[2]) + dz * Math.cos(c[2]); if (al < -50 || al > -hl || Math.abs(dx * Math.cos(c[2]) - dz * Math.sin(c[2])) > 4.2) continue;
        const st = A.s + (-6 - hl - al); if ((st - A.s >= sm || (A.v < .5 && st - A.s > -1.5)) && st < lim) { lim = Math.max(A.s, st); wr = 'siren'; A.sg = true; } } } // (one already standing at its stop stays there)
    atL(L, A.s, q); let vt = Math.max(.6, L.vp[Math.min(L.vp.length - 1, q.i + 1)]), by = null;
    if (siren(A) && OS.pub(A.x, A.z)) vt *= SIRV; // sirens on: faster on the street (corners too), not in the yard
    if (lim < L.len) vt = Math.min(vt, Math.sqrt(2 * DEC * Math.max(0, lim - A.s)));
    vt = Math.min(vt, vl);
    A.wl = lim < L.len && lim - A.s < 3; // standing at (or right before) a line it waits at
    if (vt > 9 && !OS.pub(A.x, A.z)) vt = 9; // an empty armoured car cruises faster (TVE), but not in the bank yard or a forecourt
    if (A.yl) vt = Math.min(vt, 2.4); // moving over for a siren unit: slow, but rolling (it can only move over while it rolls)
    if (A.yw) { vt = A.latT != null && A.lat < A.latT - .02 ? Math.min(vt, 2.4) : 0; wr = 'shoulder'; } // waiting for the lane to clear (see police.ts makeWay): rolls on until it is fully on the shoulder, then stands
    if (!A.ghost) { const look = 1.5 + A.v * A.v / (2 * DEC); for (let d = .5; d <= look && A.s + d <= L.len + .01; d += .5) { poseA(A, L, A.s + d, d); let O = hits(A, q.x, q.z, q.rot, MG, d > .5);
        // two that stop for each other (a turning armoured car's tail and one behind it or in the other lane): either may go on while it keeps
        // MG / 2.5 clear. When neither can (they came closer than that), after 3 s the one in front (side by side: the first in the list) goes on
        // as long as it does not touch: the tail swings past and away
        if (O && O.by === A && O.v < .05 && A.v < .05) { O = hits(A, q.x, q.z, q.rot, MG / 2.5, d > .5);
          if (O && O.by === A && A.stuck > 3) { const ah = (P: AnyVehicle, Q: AnyVehicle) => (Q.x - P.x) * Math.sin(P.rot) + (Q.z - P.z) * Math.cos(P.rot) < -.5, a = ah(A, O), b = ah(O, A);
            if (a !== b ? a : vehs.indexOf(A) < vehs.indexOf(O)) { const B = O; O = hits(A, q.x, q.z, q.rot, 0, d > .5); if (O === B && a && Math.abs(OS.adiff(A.rot, B.rot)) < .6) { A.rb = B; O = hits(A, q.x, q.z, q.rot, 0, d > .5, B); } } } } // still held: only by its own tail beside the nose of the one behind (it cut in in front of it); the tail moves on and away
        // (an armoured car turning off in front: its tail swings out too; one that stops close behind it leaves it no room to finish the turn)
        if (O) { by = O; const xm = (siren(O) && !siren(A) || O.kind === 'truck') && Math.abs(OS.adiff(O.rot, A.rot)) > .5 ? 1.8 : 0; vt = Math.min(vt, Math.sqrt(2 * DEC * Math.max(0, d - .7 - xm))); break; } } } // a siren unit crossing in front: stop well back, its tail still swings round
    A.by = by; A.wr = by && (!wr || vt < Math.sqrt(2 * DEC * Math.max(0, lim - A.s))) ? 'by' : wr; A.v = vt > A.v ? Math.min(vt, A.v + ACC * dt) : Math.max(vt, A.v - DEC * 1.6 * dt);
    let ds = Math.max(0, Math.min(A.v * dt, lim - A.s));
    if (ds > 0 && !A.ghost) { poseA(A, L, A.s + ds, ds); if (hits(A, q.x, q.z, q.rot, 0, false, A.rb)) { ds = 0; A.v = 0; } }
    // stuck behind something for a long time: fade out, drive on unseen, come back where there is room (never drawn overlapping)
    A.wt = A.v < .05 && !A.ghost ? (A.wt || 0) + dt : 0; // standing still for any reason (probe)
    A.hz = !!(by && A.v < .05 && (by.haz || by.hz)); // in the queue behind a patrol car stopped in the lane
    // (sooner, 6 s, in a queue with a siren unit standing at its tail: counted apart, tstat.sq)
    if (by && A.v < .05 && !A.scene && !A.hz) { const sq = OS.simT - (A.sq ?? -9) < .3; if ((A.stuck += dt) > (sq ? 6 : 25)) { A.ghost = true; A.gt = 0; A.stuck = 0; if (sq) tstat.sq++; else tstat.vanish++; } } else A.stuck = 0; // scene: part of a police scene, it stands still on purpose
    if (A.ghost && (A.gt += dt) > 3 && !overlap(A)) A.ghost = false;
    const r0 = A.rot, l0 = A.lat, lt0 = A.latT; A.s += ds; poseA(A, L, A.s, ds); if (A.latT != null) { A.lat = latAt(A, ds); if (!A.latT && !A.lat) A.latT = null; }
    const tr = q.rot - (ds > 1e-4 ? Math.atan2(A.lat - l0, ds) : 0); // drifting to the shoulder (or back) points the nose that way
    let nr = L.fin ? tr : turn(A.rot, tr, ds * 2 + .002);
    const sw0 = ds > 0 && !A.ghost && Math.abs(A.lat - l0) > 1e-4 && hits(A, q.x, q.z, nr, 0, false), sw = sw0 && hits(A, q.x, q.z, A.rot, 0, false); // the nose turning to the shoulder would swing the tail into someone: roll on without turning, or stay put
    if (sw0 && !sw) nr = A.rot;
    if (sw) { A.s -= ds; A.lat = l0; A.latT = lt0; A.v = 0; ds = 0; q.x = A.x; q.z = A.z; }
    A.x = q.x; A.z = q.z; if (!sw) A.rot = nr; // turn only while rolling, never on the spot (a new leg that starts at another heading is driven into)
    if (L.fin || L.fout) A.k = clamp(Math.min(L.fin ? A.s / 3 : 1, L.fout ? (L.len - A.s) / 3 : 1), 0, 1); else if (A.k < 1) A.k = Math.min(1, A.k + dt * 2);
    if (!A.ghost && A.k * A.gk > .3) { const d = Math.abs(((A.rot - r0 + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI); if (d > .02) A.spin = Math.max(A.spin || 0, d / Math.max(ds, .01)); } // turn per metre driven (probe)
    place(A);
    if (A.s >= L.len - .02) { A.leg = null; if (L.end) L.end(); }
  }
  // left turns in and out of the offices, the apartments and the bank (roads.ts truckNet; route(.., 'truck')): no lights to go first, so it
  // waits for a real gap. Moving vehicles in the lane from well back (24 m, or 3.6 s at their speed) to just past the point block it; standing
  // ones only within 6 m of it (a queue that leaves the way open)
  const gapFree = (T: AnyVehicle, x: number, z: number, h: number) => !vehs.some(O => { if (O === T || O.ghost || O.parked || O.k < .05) return false;
    const dx = O.x - x, dz = O.z - z, al = dx * Math.sin(h) + dz * Math.cos(h), ac = dx * Math.cos(h) - dz * Math.sin(h);
    return Math.abs(ac) < 1.4 && al < 5 && al > (O.v < .3 ? -6 : -Math.max(24, O.v * 3.6)); });
  // out of an out road (the street's near lanes run west, from +x): at the give-way line until the near lanes are clear (giveWay) and the far lane it joins too
  function leftOut(L: OfficeLeg, jx: number, zs: number, T: AnyVehicle, r: RouteP) {
    const e = giveWay(L, jx, zs, T, r), w = r.w && r.w[0]; if (!w || !e.wait) return; const w0 = e.wait; e.wait = () => w0() && gapFree(T, w[0], w[1], w[2]); e.tag = 'leftout'; }
  // into an in road: where it turns, in its far lane, until both near lanes are clear where it crosses them (where the in road leaves each),
  // and from the outer far lane the inner one beside it too
  function leftIn(L: OfficeLeg, T: AnyVehicle, r: RouteP) {
    for (const [u, e] of r.es || []) { if (e.sc !== 'tin') continue; const N = OS.net.N, base = e.to.slice(0, -3), [px, pz] = e.pts[0], [qx, qz] = e.pts[1], hf = Math.atan2(qx - px, qz - pz), hn = hf + Math.PI;
      const X = [N.get(base + ':a'), N.get(base + ':a.0')].filter(n => n).map(n => [n!.x, n!.z, hn]);
      if (u.startsWith('tx:1:')) X.push([px + Math.cos(hf) * 1.9, pz - Math.sin(hf) * 1.9, hf]); // the inner far lane: straight across (to its left), never in its own lane (the queue behind it would hold it for ever)
      on(L, px, pz, () => X.every(([x, z, h]) => gapFree(T, x, z, h)), null, 1.2, false, 'leftin').ag = .6; } }
  // ── the in roads (roads.ts net.gates): traffic from outside picks one at random as it comes, and leaves by a random one. Each has its own
  // spawn queue (the staff cars that wait for it: c.gi; they come first there); gstat: [in, out] per in road (probe) ──
  const gstat: Record<string, [number, number]> = {};
  const gates = () => OS.net.gates && OS.net.gates.length ? OS.net.gates : [{ i: 'gate:in', o: 'gate:out', x: 0 }];
  const gateClear = (id: string) => { const g = OS.net.N.get(id); return !!g && !vehs.some(O => !O.ghost && Math.hypot(O.x - g.x, O.z - g.z) < 7); };
  const tally = (g: { i: string }, k: number) => { (gstat[g.i] ||= [0, 0])[k]++; };
  /** A random in road that is clear now and has no staff car waiting for it (null: none); q false: any, clear or not (to queue for);
   *  use false: only look (not counted). */
  function gateIn(q = true, use = true) { const G = gates(), k0 = Math.floor(Math.random() * G.length);
    for (let n = 0; n < G.length; n++) { const g = G[(k0 + n) % G.length]; if (q && (spawnQ.some(c => c.gi === g.i) || !gateClear(g.i))) continue; if (use) tally(g, 0); return g.i; } return null; }
  /** A random in road to leave by: the node where it leaves the town. */
  function gateOut() { const G = gates(), g = G[Math.floor(Math.random() * G.length)]; tally(g, 1); return g.o; }
  /** Spawn the first staff car waiting for each in road that is clear (one that waits for an in road no longer there picks another). */
  function spawnGates(spawn: (c: SportsCar) => void) { if (!spawnQ.length) return; const G = gates();
    for (const c of spawnQ) if (!c.gi || !G.some(g => g.i === c.gi)) c.gi = gateIn(false)!;
    for (const g of G) { const i = spawnQ.findIndex(c => c.gi === g.i); if (i >= 0 && gateClear(g.i)) spawn(spawnQ.splice(i, 1)[0]); } }
  return { gstat, gateIn, gateOut, spawnGates, MG, LINE, vehs, apron, spawnQ, tstat, q, q1, mkLeg, atL, pose, on, take, drop, veh, signal, blink, place, dropVeh, hits, ringAt, rAt, siren, gapFree, leftOut, leftIn, mergeClear, canLeave, soonAt, giveWay, gap, poseA, stepVeh };
}
