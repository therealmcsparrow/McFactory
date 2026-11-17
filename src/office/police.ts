import * as THREE from 'three';
import { reduced } from '../common/dom.js';
import type { OSAtPolice } from './state.js';
import type { P2 } from '../common/types.js';
import type { AnyVehicle, Folk, LaneSample, NetEdge, PoliceState, PoliceUnit, RouteP, Spot, Station } from './types.js';
import type { PatrolStation } from './patrol.js';
import { HOME_SITE, HOME_BOX } from './buildings/apartments.js';

export function makePolice(OS: OSAtPolice) {
  const { col, mesh, G, VC, veh, route, plen, ringAt, vehs, bez, POX, STZ, RW, BFW, BFX, BFZ, bldgs, HZ, SVZ, RT, LA, SH, mkLeg, arc, PR, on, LO, siren, soonAt, place, EX, PRZ, mkFolk, walk, vanish, cy, pose, q, poseA, hits, MG, BLUE, RED, folk, LINE, stns, dropStation, dropVeh } = OS;
  // ── the police stations (police-station.ts; one more for every 20 offices): three patrol cars and a SWAT van each. Units leave forward onto
  // the yard lane and come back over the back lane, nose-in. A call goes to the nearest station with free units (else the next nearest);
  // its units drive home to their own station ──
  const fun = (k: string) => { try { return window.CWFun ? window.CWFun.get(k) !== false : true; } catch (e) { return true; } };
  const expo = (m: number) => -m * Math.log(1 - Math.random()), adiff = (a: number, b: number) => ((b - a + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
  const DARKL = col('#1a1d24');
  const units: PoliceUnit[] = []; let nU = 0; // every station's units (index i: the order they were made in)
  function mkUnits(S: Station) { S.units = S.bays.map((b, j): PoliceUnit => { const sw = j === 3, g = mesh(sw ? G.swat : G.pcar, VC), mB = new THREE.MeshBasicMaterial({ color: DARKL }), mR = new THREE.MeshBasicMaterial({ color: DARKL });
    for (const [m, x] of [[mB, -.21], [mR, .21]] as [THREE.MeshBasicMaterial, number][]) { const l = new THREE.Mesh(G.unit, m); l.scale.set(.38, .1, .24); l.position.set(x, sw ? 1.86 : 1.12, sw ? 1.1 : -.15); g.add(l); } // light bar: blue and red
    const A = veh(sw ? 'swat' : 'police', g, b, S.bz, S.s === 1 ? Math.PI : 0); A.unit = true; return A.U = { i: nU++, b, sw, A, mB, mR, dir: 'home', spot: null, ret: false, retAt: 0, S }; });
    units.push(...S.units); }
  mkUnits(stns[0]);
  const free = (S: Station) => !S.gone && S.units.length > 0;
  const atHome = (U: PoliceUnit) => U.dir === 'home' && U.A.k >= 1 && !U.A.leg && !U.A.legs.length;
  /** The stations nearest (x, z) first (straight line from the out road), not those going. */
  const byNear = (x: number, z: number) => stns.filter(free).sort((a, b) => Math.hypot(a.outX - x, a.yz - z) - Math.hypot(b.outX - x, b.yz - z));
  /** For a robbery at (x, z): two patrol cars and the SWAT van of the nearest station that has all three at home (null: none has). */
  const cops = (x: number, z: number) => { for (const S of byNear(x, z)) { const C = [S.units[0], S.units[1], S.units[3]]; if (C.every(atHome)) return C; } return null; };
  /** May a unit (or a patrol car, patrol.ts) of station S pull out of its out road now: both lanes it joins clear from where traffic comes
   *  (and nobody about to be there: off a roundabout, or changing lanes into them). lead: how far the line stands back from the lane */
  function gateOK(S: Station, A: AnyVehicle) { const s = S.s, X = S.outX, Z = S.zs, up = (O: { x: number }) => (X - O.x) * s, lat = (z: number) => (z - Z) * s; // up: metres upstream of the out road; lat: across the lanes it joins
    return !vehs.some(O => O !== A && !O.ghost && !O.parked && O.k > .05 && (!ringAt(O.x, O.z) && lat(O.z) > -.3 && lat(O.z) < RW + .6 && up(O) < (O.v < .3 ? 4.5 : 14 + O.v * 2.5) && up(O) > -2.6 ||
      O.leg && !O.leg.rev && !siren(O) && !(O.v < .3 && waits(O)) && Math.abs(O.x - X) < 24 && Math.abs(O.z - Z) < 11 && soonAt(O, 22, (x, z) => lat(z) > .4 && lat(z) < RW + .3 && up({ x }) < 12 && up({ x }) > -2.6))); } // (not one standing at the roundabout's line: it may wait there for long)
  /** Its own roads: the yard, the bays, the back lane, the in and out roads (2 m back from the street). */
  const yardOf = (S: Station, x: number, z: number) => S.k ? x > S.ox - 21.5 && x < S.inX + 2 && z > S.rz - 2.5 && z < S.yz + 1.2 : x > POX - 1.5 && x < OS.PIX + 2 && z > STZ + RW + 2 && z < PRZ + 2.5;
  // the stations as patrol.ts sees them (OS.patrolStations): fade in on the yard lane, out on the in road, wait for a gap at the out road
  const PST = new Map<Station, PatrolStation>();
  const patrolOf = (S: Station): PatrolStation => { let P = PST.get(S); if (!P) PST.set(S, P = { out: S.out, in: S.in, spawn: [S.outX + 8, S.yz], rot: -Math.PI / 2, end: [S.inX, S.yz + S.s * 3.5],
    line: [S.outX, S.zs + S.s * (LO + LINE.car)], yard: (x, z) => yardOf(S, x, z), gate: A => gateOK(S, A) && !vehs.some(O => O !== A && siren(O) && Math.hypot(O.x - S.outX, O.z - S.zs) < 30) }); return P; };
  /** After the stations change (sync.ts, or one dropped here): units for a new station, the patrol stations. */
  function policeSync() { for (const S of stns) if (!S.gone && !S.units.length) mkUnits(S); (OS as { patrolStations?: PatrolStation[] }).patrolStations = stns.filter(free).map(patrolOf); }
  /** A station no longer wanted goes once its units are home and nothing has them (a robbery, a jam call): units, mesh, roads. */
  function dropGone() { let n = 0; for (const S of stns.slice()) { if (!S.gone || !S.k || !S.units.every(atHome) || S.units.some(U => U === pol.U || OS.rob.cops.includes(U))) continue;
    for (const U of S.units) { dropVeh(U.A); const i = units.indexOf(U); if (i >= 0) units.splice(i, 1); } S.units = []; PST.delete(S); dropStation(S); n++; }
    if (n) { OS.buildNet(); policeSync(); } }
  // lane samples every .5 m (rebuilt with the network): where a unit can stop, and the way there
  let SMP: { key: string | null; L: LaneSample[]; Q: Map<number, LaneSample[]> } = { key: null, L: [], Q: new Map() };
  const QK = (i: number, k: number) => (i + 4096) * 8192 + k + 4096;
  function samples() { if (SMP.key === OS.net.key) return SMP.L; const L: LaneSample[] = [], Q = new Map<number, LaneSample[]>();
    for (const [u, n] of OS.net.N) for (const e of n.e) for (let i = 0; i < e.pts.length - 1; i++) { const a = e.pts[i], b = e.pts[i + 1], l = Math.hypot(b[0] - a[0], b[1] - a[1]); if (l < 1e-6) continue; const h = Math.atan2(b[0] - a[0], b[1] - a[1]);
      for (let d = 0; d < l; d += .5) L.push({ x: a[0] + (b[0] - a[0]) * d / l, z: a[1] + (b[1] - a[1]) * d / l, h, u, e, i, a: d, b: l - d }); } // a, b: straight metres before and after on this segment
    for (const s of L) { const k = QK(Math.floor(s.x / 4), Math.floor(s.z / 4)); let A = Q.get(k); if (!A) Q.set(k, A = []); A.push(s); } // in 4 m buckets (a big town has a few hundred thousand)
    SMP = { key: OS.net.key, L, Q }; return L; }
  /** Is there a lane sample not on edge e within 1.9 m of (x, z)? */
  const laneNear = (x: number, z: number, e: NetEdge | null) => { for (let i = Math.floor((x - 1.9) / 4); i <= Math.floor((x + 1.9) / 4); i++) for (let k = Math.floor((z - 1.9) / 4); k <= Math.floor((z + 1.9) / 4); k++)
    for (const p of SMP.Q.get(QK(i, k)) || []) if (p.e !== e && Math.abs(p.x - x) < 1.9 && Math.abs(p.z - z) < 1.9 && Math.hypot(p.x - x, p.z - z) < 1.9) return true; return false; };
  const rings = (x: number, z: number) => OS.net.rq ? OS.net.rq(x, z) : OS.net.R;
  const nearS = (x: number, z: number, h?: number | null) => { let best: LaneSample | null = null, bd = Infinity; for (const s of samples()) { const d = (s.x - x) ** 2 + (s.z - z) ** 2; if (d < bd && (h == null || Math.abs(adiff(s.h, h)) < .3)) { bd = d; best = s; } } return best; };
  const routeTo = (a: string, s: LaneSample, sir?: boolean) => { const r = route(a, s.u, sir); let best = r && [...r, ...s.e.pts.slice(1, s.i + 1), [s.x, s.z]] as RouteP; if (best) { best.w = r!.w; best.k = r!.k; }
    if (!sir) return best; // lights on: it may also come along the lane the other way and turn across the street, 6..8 m before the stop, into its lane
    let bl = best ? plen(best) - 10 : Infinity; for (const s0 of samples()) { if (Math.abs(adiff(s0.h, s.h)) > .05 || ringAt(s0.x, s0.z)) continue; const ex = s.x - s0.x, ez = s.z - s0.z, ea = ex * Math.sin(s.h) + ez * Math.cos(s.h);
      if (ea < 6 || ea > 8 || Math.abs(ex * Math.cos(s.h) - ez * Math.sin(s.h)) > .2) continue; // s0: on the same straight, 6..8 m before the stop
      if (vehs.some(O => !O.ghost && !O.parked && O.k > .05 && O.v < 1.5 && Math.abs(adiff(O.rot, s.h)) < .6 && (() => { const dx = O.x - s0.x, dz = O.z - s0.z, al = dx * Math.sin(s.h) + dz * Math.cos(s.h); const ac = Math.abs(dx * Math.cos(s.h) - dz * Math.sin(s.h)); return al < ea + 2 && (ac < 1.4 ? al > -25 : ac < 3.6 && al > -3); })())) { sirP.uq++; continue; } // a queue stands in that lane (up to 25 m back), or something on its shoulder where it swings in (from 3 m back: the scene's armoured car on the shoulder behind does not count): it would wait there for good
      for (const o of samples()) { if (Math.abs(adiff(o.h, s0.h + Math.PI)) > .2 || o.a < 4 || ringAt(o.x, o.z) || !pub(o.x, o.z)) continue; const dx = o.x - s0.x, dz = o.z - s0.z, al = dx * Math.sin(s0.h) + dz * Math.cos(s0.h), ac = Math.abs(dx * Math.cos(s0.h) - dz * Math.sin(s0.h));
        if (Math.abs(al) > .3 || ac < 1 || ac > 4.5) continue; const r2 = route(a, o.u, sir); if (!r2) continue;
        const P = [...r2, ...o.e.pts.slice(1, o.i + 1), ...bez([o.x, o.z], o.h, [s0.x, s0.z], s0.h, ac * 1.2), [s.x, s.z]] as RouteP, l = plen(P); if (l < bl) { bl = l; best = P; P.w = [...r2.w, [s0.x, s0.z, s0.h, o.x, o.z]]; P.k = [...(r2.k || []), 'uturn']; } } } // the U-turn waits until the lane of the stop is clear
    return best; };
  const lp = (s: LaneSample, lat: number, fwd: number): P2 => [s.x - Math.cos(s.h) * lat + Math.sin(s.h) * fwd, s.z + Math.sin(s.h) * lat + Math.cos(s.h) * fwd]; // a point beside a lane sample: lat to the right, fwd ahead
  // public road: not a station's own roads, not the bank yard, not a forecourt
  function pub(x: number, z: number) { for (const S of stns) if (yardOf(S, x, z)) return false; if (x > BFW - .5 && x < BFX + .5 && z < BFZ + .3) return false;
    if (x > HOME_SITE.x + HOME_BOX.X0 - .5 && x < HOME_SITE.x + HOME_BOX.X1 + .5 && z < HOME_SITE.z + .3) return false; // the apartments (its car park too)
    for (const F of bldgs.values()) if (Math.abs(x - F.ox) < 22 && z > F.oz - HZ - 1.5 && z < F.oz + SVZ + 1.2) return false; return true; } // (behind a building: up to 1.5 m from its back wall, so the shoulder of the street of the row in front stays public)
  function freeAt(x: number, z: number, e: NetEdge | null) { // free ground beside a lane: no other lane, roundabout, vehicle, fence or yard here
    if (!pub(x, z) || (x > BFW - 1 && x < BFX + 1 && z < BFZ + .9)) return false; for (const c of rings(x, z)) if (Math.hypot(x - c[0], z - c[1]) < RT + 1.4) return false;
    for (const O of vehs) if (!O.ghost && Math.hypot(O.x - x, O.z - z) < 1.7) return false;
    return !laneNear(x, z, e); }
  const spotOK = (s: LaneSample) => s.a >= 6 && s.b >= 3.5 && pub(s.x, s.z) && [-1.4, 0, 1.4, 2.4].every(k => { const [x, z] = lp(s, SH, k); return freeAt(x, z, s.e); }); // room to pull over, the car and the officer on free ground
  // a stop in the lane (hazard lights on): a straight stretch, away from roundabouts and junctions (no other lane under the car), the officer's place at the lane edge on public road
  const laneOK = (s: LaneSample) => s.a >= 1.5 && s.b >= 1.5 && pub(s.x, s.z) && pub(...lp(s, .9, 2.4)) && !rings(s.x, s.z).some(c => Math.hypot(s.x - c[0], s.z - c[1]) < RT + 3) &&
    [-1.4, 0, 1.4].every(k => { const [x, z] = lp(s, 0, k); return !laneNear(x, z, s.e); });
  // one standing in a queue whose front stands at a line (one that stops for a siren unit does too): it will not come yet
  const waits = (O: AnyVehicle) => { let f = O; for (let n = 0; f.by && f.v < .3 && n < 30; n++) f = f.by; return f.v < .3 && (f.wl || f.wr === 'siren'); };
  const laneFree = (A: AnyVehicle | null, x: number, z: number, h: number) => !vehs.some(O => { if (O === A || O.ghost || O.parked || O.k < .05) return false; const dx = O.x - x, dz = O.z - z, al = dx * Math.sin(h) + dz * Math.cos(h); return al > (O.v < .3 && waits(O) ? -3 : -12) && al < 4 && Math.abs(dx * Math.cos(h) - dz * Math.sin(h)) < 1.4; });
  function unitOut(U: PoliceUnit, s: Spot, then?: ((U: PoliceUnit) => void) | null) { // bay -> yard lane -> out road (gives way to the street) -> the stop; the last 5 m it pulls over onto the shoulder
    const S = U.S, r = routeTo(S.out, s, true), A = U.A; if (!r) return false; // lights on: it may take the short cuts (see sirenNet)
    const L = mkLeg([[U.b, S.bz], ...arc(U.b - PR, S.yz + S.s * PR, PR, 0, -S.s * Math.PI / 2), ...r], { end: () => { U.dir = 'post'; if (then) then(U); } });
    // the out road turns right into the eastbound lanes (a short cut across them to the westbound lanes waits again, see polcut below): it waits until
    // both eastbound lanes are clear from the west and nobody is about to be there (coming off the avenue roundabout, or changing lanes into them)
    on(L, S.outX, S.zs + S.s * (LO + (U.sw ? LINE.truck : LINE.car)), () => gateOK(S, A), null, 1.2, false, 'polout');
    for (const w of r.w || []) { // a short cut across the street: it waits until the lane it joins is clear. From 30 m before its line, and while it crosses,
      // traffic in that lane and the one beside it holds a few metres before the point where it joins (see traffic.ts), so the lane clears
      const e = on(L, w[3], w[4], () => { A.cj = [w[0], w[1], w[2], OS.simT + 4]; return laneFree(A, w[0], w[1], w[2]); }, null, 1.5, false, 'polcut');
      L.ev.push({ s: Math.max(0, e.s - 30), fn: () => { A.cj = [w[0], w[1], w[2], OS.simT + 12]; } }); L.ev.sort((a, b) => a.s - b.s); }
    if (!s.lane) { L.ev.push({ s: Math.max(0, L.len - 5), fn: () => { A.latT = SH; } }); L.ev.sort((a, b) => a.s - b.s); } // a stop in the lane: it stays in the lane
    A.legs.push(L); U.dir = 'out'; U.spot = s; U.ret = false; sirP.trips++; sirP.log.push(S.k + '.' + S.units.indexOf(U) + ':' + (r.k || []).join('+')); sirP.stn[S.id] = (sirP.stn[S.id] || 0) + 1; if (sirP.log.length > 12) sirP.log.shift(); for (const k of r.k || []) sirP[k as 'island' | 'cut' | 'uturn']++; return true;
  }
  // a short cut whose lane stays busy (8 s without a gap at its line): it drops it and drives on the normal way, round the next roundabout
  function noCut(U: PoliceUnit) { sirP.noCut++; U.A.cj = null; const A = U.A, L0 = A.leg, s = U.spot; if (!L0 || !s) return; const n = nearS(A.x, A.z, A.rot); if (!n) return; const r = route(n.e.to, s.u); if (!r) { A.wt = 0; return; }
    const L = mkLeg([[A.x, A.z], ...n.e.pts.slice(n.i + 1), ...r.slice(1), ...s.e.pts.slice(1, s.i + 1), [s.x, s.z]], { end: L0.end || undefined });
    if (!s.lane) { L.ev.push({ s: Math.max(0, L.len - 5), fn: () => { A.latT = SH; } }); L.ev.sort((a, b) => a.s - b.s); }
    A.leg = L; A.s = 0; A.wt = 0; }
  function homeNow(U: PoliceUnit) { const A = U.A; A.legs.length = 0; A.leg = null; Object.assign(A, { x: U.b, z: U.S.bz, rot: U.S.s === 1 ? Math.PI : 0, lat: 0, latT: null, v: 0, k: 0, haz: false }); U.dir = 'home'; place(A); }
  function unitHome(U: PoliceUnit) { // back onto the lane when it is clear behind, on to the east roundabout, the in road, the back lane, nose-in into the bay
    const A = U.A, S = U.S, k = S.s, s = U.spot, r = s && route(s.e.to, S.in); U.ret = false; if (!r) { homeNow(U); return; }
    const L = mkLeg([[s.x, s.z], ...s.e.pts.slice(s.i + 1), ...r.slice(1), ...arc(S.inX - PR, S.rz - k * PR, PR, 0, k * Math.PI / 2), [U.b + PR, S.rz], ...arc(U.b + PR, S.rz - k * PR, PR, k * Math.PI / 2, k * Math.PI), [U.b, S.bz]],
      { end: () => { U.dir = 'home'; A.lat = 0; A.latT = null; crewIn(U); } });
    L.ev.push({ s: 0, fx: true, wait: () => A.lat < .3 || laneFree(A, s.x, s.z, s.h) }); A.latT = 0; A.haz = false; A.legs.push(L); U.dir = 'in';
  }
  function crewIn(U: PoliceUnit) { const S = U.S, k = S.s; for (let i = 0; i < (U.sw ? 2 : 1); i++) { const f = mkFolk(U.sw ? 'swat' : 'cop', U.b + .95, S.bz + k * (-.4 + i * .7), 0); walk(f, [[U.b + .95, S.bz + k * 2.1], [S.door[0], S.door[1] + k * (-.1 + i * .3)]], vanish); } } // the crew walks in

  // traffic police: a jam (a vehicle held > 5 s, or 3 or more standing behind each other) brings one patrol car. It stops on the shoulder behind
  // the queue, the officer stands at the lane edge and waves waiting vehicles on one at a time (they may pass a wait without side effects; never through another vehicle)
  const pol: PoliceState = { ph: 'idle', tk: 0, cool: 0, jam: null, force: null, U: null, off: null, quiet: 0, t0: 0, waved: 0, n: 0, mv: 0 };
  const frontOf = (A: AnyVehicle) => { let f = A; for (let n = 0; f.by && f.by.v < .05 && n < 40; n++) f = f.by; return f; };
  function jamFind() {
    const f0 = pol.force; pol.force = null; const C = vehs.filter(A => !A.unit && !A.scene && !A.ghost && A.leg && !A.leg.rev && A.k > .5);
    const dJ = (A: { x: number; z: number }, J: { x: number; z: number }) => Math.hypot(A.x - J.x, A.z - J.z); let J: { x: number; z: number; rot: number } | null | undefined = null, mem: AnyVehicle[] = [];
    if (f0) { const P = { x: f0[0], z: f0[1] }; J = C.filter(A => pub(A.x, A.z) && dJ(A, P) < 30).sort((a, b) => dJ(a, P) - dJ(b, P))[0] || null;
      if (J) mem = C.filter(A => A !== J && frontOf(A) === J); else { const s = nearS(P.x, P.z); J = s && pub(s.x, s.z) ? { x: s.x, z: s.z, rot: s.h } : { x: P.x, z: P.z, rot: 0 }; } }
    else { const Q = new Map<AnyVehicle, Set<AnyVehicle>>(); for (const A of C) if (A.v < .05 && ((A.wt || 0) > 5 || A.stuck > 5)) { const f = frontOf(A); if (!Q.has(f)) Q.set(f, new Set([f])); Q.get(f)!.add(A); }
      let best: Set<AnyVehicle> | null = null, bf: AnyVehicle | null = null; for (const [f, S] of Q) if ((S.size >= 3 || [...S].some(A => A.stuck > 5)) && (!best || S.size > best.size)) { best = S; bf = f; }
      if (!best) return null; const L = [...best].sort((a, b) => dJ(a, bf!) - dJ(b, bf!)); J = L.find(A => C.includes(A) && pub(A.x, A.z)); if (!J) return null; mem = L.filter(A => A !== J); }
    const sj = Math.sin(J.rot), cj = Math.cos(J.rot); let D = 0; for (const A of mem) if ((A.x - J.x) * sj + (A.z - J.z) * cj < 0) D = Math.max(D, dJ(A, J) + A.off);
    for (const far of f0 ? [30, 60] : [30]) for (let lane = 0; lane < 2; lane++) { let best: LaneSample | null = null, ba = Infinity; // the stop: behind the queue tail on the same straight, nearest first; on the shoulder, else (no shoulder, e.g. along the bank fence) in the lane itself
      for (const s of samples()) { const dx = J.x - s.x, dz = J.z - s.z, al = dx * Math.sin(s.h) + dz * Math.cos(s.h); if (al < D + (lane ? 3.5 : 6) || al > D + far || al >= ba) continue;
        if (Math.abs(dx * Math.cos(s.h) - dz * Math.sin(s.h)) > .8 || Math.abs(adiff(s.h, J.rot)) > .3 || !(lane ? laneOK(s) : spotOK(s))) continue; best = s; ba = al; }
      if (best) return Object.assign({}, best, { lane: !!lane }); }
    if (f0) for (let lane = 0; lane < 2; lane++) { let best: LaneSample | null = null, bd = 60; // a call-out (police('call'), or 'jam') always gets a unit: failing a stop behind the queue (J on a roundabout, or no straight behind it), the nearest stop anywhere
      for (const s of samples()) { const d = Math.hypot(s.x - J.x, s.z - J.z); if (d < bd && (lane ? laneOK(s) : spotOK(s))) { best = s; bd = d; } }
      if (best) return Object.assign({}, best, { lane: !!lane }); }
    return null;
  }
  function onPost(U: PoliceUnit) { // on the shoulder: the officer gets out on the far side, walks round the front to the lane edge and faces the waiting traffic
    const s = U.spot!, A = U.A, o = mkFolk('cop', A.x - Math.cos(s.h) * .9, A.z + Math.sin(s.h) * .9, s.h); o.U = U;
    A.haz = !!s.lane; // stopped in the lane: hazard lights, the officer stays on the kerb side
    walk(o, s.lane ? [lp(s, .9, 2.4)] : [lp(s, SH + .9, 2.1), lp(s, 1.35, 2.4)], (f: Folk) => { f.pose = 'wave'; }, s.h + Math.PI); pol.off = o; pol.ph = 'post'; pol.quiet = 0; pol.t0 = OS.simT;
  }
  // vehicles ahead of a siren unit in its lane move over and slow down: from the inner lane into the outer lane when that is clear beside them, from
  // the outer lane onto the shoulder where there is room (a straight, free shoulder); they pull back into their lane once it has passed, or when it stops
  // or turns its lights off
  function makeWay() { const S = units.filter(U => siren(U.A) && U.A.leg && (U.A.v > .5 || (U.A.by && !U.A.by.unit))).map<AnyVehicle>(U => U.A); // (one standing behind a queue too: the queue squeezes over to let it by)
    // back into the lane only when the lane beside and behind it is clear: a car that has come up beside it would else stop for its nose, and it for the car
    // (and one already on its way back that sees a car come up after all goes back onto the shoulder: it would else stand with its nose in that car's lane)
    // a gap in the lane, as for a lane change: room to the one ahead (more when it stands) and a time gap to the one behind, from its speed. While it
    // waits it shows where it wants in (lw): a slow vehicle coming up in that lane stops short and lets it in. A long wait makes it settle for less room
    const free = (O: AnyVehicle) => { const l = O.lat, h = O.rot, x = O.x + Math.cos(h) * l, z = O.z - Math.sin(h) * l, sh = Math.sin(h), ch = Math.cos(h), rx = (O.wt || 0) > 20 ? .5 : 1;
      const ok = !vehs.some(V => { if (V === O || V.ghost || V.parked || V.k < .05 || Math.abs(adiff(V.rot, h)) > .6) return false; const dx = V.x - x, dz = V.z - z, al = dx * sh + dz * ch, hl = O.off + O.r + V.off + V.r;
        if (Math.abs(dx * ch - dz * sh) > 1.25 || al < -45 || al > 25) return false; return al >= 0 ? al < hl + (V.v < 1 ? 3.5 : 1.5) * rx : -al < hl + (1 + V.v * .8) * rx; });
      O.lw = ok ? null : { x, z, h }; return ok; };
    const back = (O: AnyVehicle) => { O.yb = false; if (O.scene || !O.latT) { O.yw = false; O.lw = null; return; } O.yw = !free(O); if (!O.yw) { O.latT = 0; O.yb = true; } };
    for (const O of vehs) if (O.yb && !O.scene && O.latT === 0) { if (O.lat < .05) { O.yb = false; O.lw = null; } else if (O.lat > (O.lm || SH) * .6 && !free(O)) { O.latT = O.lm || SH; O.yw = true; O.yb = false; } else O.lw = null; } // (more than half way back in: it carries on)
    for (const O of vehs) if (O.yw) back(O);
    for (const O of vehs) if (O.yl) { const Y = O.yl, h = Y.rot; if (!S.includes(Y) || (O.x - Y.x) * Math.sin(h) + (O.z - Y.z) * Math.cos(h) < -3 || Math.hypot(O.x - Y.x, O.z - Y.z) > 30) { O.yl = null; back(O); } }
    if (!S.length) return; samples();
    for (const Y of S) { const sy = Math.sin(Y.rot), cy = Math.cos(Y.rot);
      for (const O of vehs) {
        if (O.unit || O.yl || O.ghost || O.parked || O.scene || O.haz || !O.leg || O.leg.rev || O.latT != null || O.lat || O.k < 1 || O.leg.len - O.s < 10) continue;
        const dx = O.x - Y.x, dz = O.z - Y.z, al = dx * sy + dz * cy; if (al < O.off + Y.off + (Y.v > .5 ? 5 : 1.5) || al > 24 || Y.leg!.len - Y.s < al + 8 || Math.abs(dx * cy - dz * sy) > .6 || Math.abs(adiff(O.rot, Y.rot)) > .3) continue;
        const lw = LO - LA, ix = O.x - Math.cos(O.rot) * lw, iz = O.z + Math.sin(O.rot) * lw, inner = SMP.L.some(p => Math.abs(adiff(p.h, O.rot)) < .2 && Math.abs(p.x - ix) < .5 && Math.abs(p.z - iz) < .5 && Math.hypot(p.x - ix, p.z - iz) < .5); // a lane on its right: it is in the inner lane
        const m = inner ? lw : SH; let ok = !ringAt(O.x, O.z); for (let d = 0; ok && d <= 9; d += 3) { pose(O.leg, O.s + d, q); if (Math.abs(adiff(q.rot, O.rot)) > .15) { ok = false; break; } const x = q.x - Math.cos(q.rot) * m, z = q.z + Math.sin(q.rot) * m; ok = !ringAt(q.x, q.z) && (inner || freeAt(x, z, null)); }
        if (ok && inner) ok = !vehs.some(V => { if (V === O || V.ghost || V.k < .05) return false; const dx = V.x - ix, dz = V.z - iz, al = dx * Math.sin(O.rot) + dz * Math.cos(O.rot); return al > -9 && al < 12 && Math.abs(dx * Math.cos(O.rot) - dz * Math.sin(O.rot)) < 1.3; }); // the outer lane beside it is clear
        if (ok) { O.yl = Y; O.latT = m; O.lm = m; pol.mv++; } } } }
  function clearAhead(A: AnyVehicle) { for (let d = .5; d <= 7 && A.s + d <= A.leg!.len; d += .5) { poseA(A, A.leg!, A.s + d, d); if (hits(A, q.x, q.z, q.rot, MG, false)) return false; } return true; }
  // probe (police().sir): trips with the lights on; short cuts taken (over an island, out of an out road across the street, a U-turn to the stop) and
  // dropped (noCut); seconds a siren unit stood still on its way (held, by what it waited for) and the longest stand; seconds other vehicles stood
  // at a line for a siren unit (gave), and how many moved over for one (pol.mv)
  // (uq: U-turns not taken for a queue in the stop's lane; log: the last trips, unit:short cuts; foll: seconds a siren unit had a non-unit vehicle right ahead)
  const sirP = { trips: 0, island: 0, cut: 0, uturn: 0, noCut: 0, held: 0, heldMax: 0, why: {} as Record<string, number>, gave: 0, uq: 0, log: [] as string[], foll: 0, stn: {} as Record<string, number> }, stand = new Map<PoliceUnit, number>();
  function sirProbe(dt: number) { for (const U of units) { const A = U.A; if (U.dir === 'out' && A.by && !A.by.unit) sirP.foll += dt; if (U.dir !== 'out' || !A.leg || A.v > .3 || A.leg.len - A.s < 6) { stand.delete(U); continue; }
      const t = (stand.get(U) || 0) + dt, w = A.wr || (A.by ? 'by:' + A.by.kind : 'other'); stand.set(U, t); sirP.held += dt; sirP.heldMax = Math.max(sirP.heldMax, t); sirP.why[w] = (sirP.why[w] || 0) + dt; }
    for (const O of vehs) if (O.sg) { sirP.gave += dt; O.sg = false; } }
  function policeStep(dt: number, t: number) {
    makeWay(); sirProbe(dt);
    for (const U of units) { const on = U.dir === 'out' || U.dir === 'post', ph = (t * 2.6 + U.i * .37) % 1; // lights flash while on duty (steady with reduced motion)
      U.mB.color.copy(on ? BLUE : DARKL).multiplyScalar(on ? (reduced ? 1.6 : ph < .5 ? 2.6 : .2) : 1); U.mR.color.copy(on ? RED : DARKL).multiplyScalar(on ? (reduced ? 1.6 : ph < .5 ? .2 : 2.6) : 1);
      if (U.dir === 'post' && U.ret && OS.simT >= U.retAt && !folk.some(f => f.U === U)) unitHome(U);
      if (U.dir === 'out' && U.A.wr === 'polcut' && (U.A.wt || 0) > 8) noCut(U); }
    if ((pol.tk += dt) < .5) return; pol.tk = 0; dropGone();
    if (pol.ph === 'idle') { if ((OS.rob.ph !== 'idle' && OS.rob.ph !== 'drive' && OS.rob.ph !== 'wait') || (!pol.force && OS.simT < pol.cool)) return;
      const s = jamFind(); if (!s) { if (pol.force === null && OS.simT >= pol.cool) pol.cool = OS.simT + .5; return; }
      let U: PoliceUnit | null = null; for (const S of byNear(s.x, s.z)) { const C = S.units.find(U => !U.sw && atHome(U)); if (C && unitOut(C, s, onPost)) { U = C; break; } } // the nearest station with a patrol car at home, else the next
      if (!U) { pol.cool = OS.simT + 10; return; } pol.U = U; pol.ph = 'out'; pol.t0 = OS.simT; pol.n++; }
    else if (pol.ph === 'out' && OS.simT - pol.t0 > 90) { pol.U!.ret = true; pol.ph = 'back'; } // never got there: give up when it does
    else if (pol.ph === 'post') { const o = pol.off!, U = pol.U!, s = U.spot!; let quiet = true, best = null;
      for (const A of vehs) { if (A.unit || A.scene || A.ghost || A.parked || Math.hypot(A.x - o.x, A.z - o.z) > 25) continue; if ((A.stuck > 5 || (A.wt || 0) > 3) && frontOf(A) !== U.A) quiet = false; // cars stopped behind a patrol car in the lane do not count
        if (o.pose === 'wave' && A.v < .05 && (A.wt || 0) > 1 && !A.by && A.leg && !A.leg.rev && (!best || A.wt! > best.wt!) && clearAhead(A) && !vehs.some(O => O !== A && !O.ghost && !O.parked && O.v > .3 && Math.hypot(O.x - A.x, O.z - A.z) < 10)) best = A; } // nothing on the move close by either
      if (best && !vehs.some(A => A.wave! > OS.simT && A.v < 1)) { best.wave = OS.simT + 4; pol.waved++; } // one at a time: the next only once the last one rolls
      pol.quiet = quiet ? pol.quiet + .5 : 0;
      if (pol.quiet >= 6 || OS.simT - pol.t0 > 60) { walk(o, s.lane ? [lp(s, .9, .2)] : [lp(s, SH + .9, 2.1), lp(s, SH + .9, .2)], vanish); U.ret = true; U.retAt = OS.simT + .5; pol.ph = 'back'; pol.cool = OS.simT + 45 + Math.random() * 45; } }
    else if (pol.ph === 'back' && pol.U!.dir === 'home') { pol.ph = 'idle'; pol.U = null; pol.off = null; }
  }
  policeSync();
  return { fun, expo, adiff, units, cops, policeSync, gateOK, samples, nearS, routeTo, pub, laneFree, unitOut, pol, policeStep, sirP, spotOK, freeAt, lp, DARKL }; // (spotOK, freeAt, lp: the traffic stops of patrol.ts too)
}
