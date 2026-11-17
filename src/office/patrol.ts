// Patrol cars and speeders (setting 'patrols', 0..4, default 2). Patrol cars are ordinary traffic in police paint, apart
// from the station's own units (police.ts): they come out of the station yard, cruise a random round of the town at normal
// speed and drive back in. They have no siren right of way and move over for siren units like everybody else.
// Every few minutes, while a patrol car is out, one ordinary car speeds: a higher top speed, but it still keeps to every
// traffic rule (lines, roundabouts, lane gaps, the car ahead). A patrol car near it turns its lights on (no siren right
// of way) and follows it. Both pull over onto the shoulder on a straight (not on a roundabout or junction, not in front of
// an in or out road), the traffic stop plays (traffic-stop.ts, with the shared speech bubbles OS.bubbles), and both get
// back into the lane when it is clear. One stop at a time. A robbery or a jam call comes first: no new patrol car or
// speeder then, and a stop going on ends at once (both drive on). With reduced motion the lights stay on steady.
//   const P = makePatrols(OS); ... P.frame(dt) once per frame AFTER folk.ts stepFolk (the stop's officer poses)
import * as THREE from 'three';
import { reduced } from '../common/dom.js';
import type { P2 } from '../common/types.js';
import type { OfficeState } from './state.js';
import type { AnyVehicle, LaneSample, LegEvent, OfficeLeg } from './types.js';
import { runStop, type StopRun } from './traffic-stop.js';

type PatPh = 'cruise' | 'chase' | 'stop' | 'home';
/** A station patrol cars start from and go back to. out / in: its road nodes; spawn, rot: where a car fades in (on its yard lane);
 *  end: where it fades out (on its in road); line: the give-way line where its out road meets the street; yard(x, z): its own roads;
 *  gate(A): may A pull out now (default: nothing near the line, no siren unit near) */
export interface PatrolStation { out: string; in: string; spawn: P2; rot: number; end: P2; line: P2; yard: (x: number, z: number) => boolean; gate?: (A: AnyVehicle) => boolean }
interface Pat { S: PatrolStation; A: AnyVehicle; mB: THREE.MeshBasicMaterial; mR: THREE.MeshBasicMaterial; ph: PatPh; i: number; arr: boolean; goHome: boolean; sp: LaneSample | null }
interface Stop { P: Pat; C: AnyVehicle; L: OfficeLeg; vp0: Float32Array; sT: number; s0: LaneSample; s1: LaneSample; S: { go: boolean }; t0: number; run: StopRun | null; side: 'left' | 'right' }

export function makePatrols(OS: OfficeState) {
  const { veh, mesh, G, VC, BLUE, RED, DARKL, mkLeg, route, on, pose, ringAt, siren, soonAt, LINE, vehs, dropVeh, place, samples, spotOK, freeAt, lp, pub, laneFree, adiff, plen, SH, POX, PLZ, STZ, LO, RW, EX } = OS;
  const VMAX = 14; // the speeder's top speed (others: 9)
  const waits = (O: AnyVehicle) => { let f = O; for (let n = 0; f.by && f.v < .3 && n < 30; n++) f = f.by; return f.v < .3 && !!(f.wl || f.wr === 'siren'); };
  // the first station (police.ts, police-station.ts): fade in on the yard lane, out on the in road; its out road joins the eastbound
  // lanes, where it waits for a gap as a unit does (police.ts unitOut), and for siren units too
  const MAIN: PatrolStation = { out: 'pol:out', in: 'pol:in', spawn: [POX + 8, PLZ], rot: -Math.PI / 2, end: [OS.PIX, PLZ + 3.5], line: [POX, STZ + LO + LINE.car],
    yard: (x, z) => x > POX - 1.5 && z > STZ + RW + 2,
    gate: A => !vehs.some(O => O !== A && !O.ghost && !O.parked && O.k > .05 && (!ringAt(O.x, O.z) && O.z > STZ - .3 && O.z < STZ + RW + .6 && O.x > (O.v < .3 ? POX - 4.5 : POX - 14 - O.v * 2.5) && O.x < POX + 2.6 ||
      siren(O) && Math.hypot(O.x - POX, O.z - STZ) < 30 || O.leg && !O.leg.rev && !(O.v < .3 && waits(O)) && Math.abs(O.x - POX) < 24 && Math.abs(O.z - STZ) < 11 && soonAt(O, 22, (x, z) => z > STZ + .4 && z < STZ + RW + .3 && x > POX - 12 && x < POX + 2.6))) };
  /** The stations: OS.patrolStations when the road net has more than one station (a list of PatrolStation, set by whoever builds
   *  them), else the one station. The only place patrols read where stations are. */
  const stations = (): PatrolStation[] => { const L = (OS as OfficeState & { patrolStations?: PatrolStation[] }).patrolStations; return L && L.length ? L : [MAIN]; };
  const gateOf = (S: PatrolStation, A: AnyVehicle) => S.gate ? S.gate(A) : !vehs.some(O => O !== A && !O.ghost && !O.parked && O.k > .05 && (Math.hypot(O.x - S.line[0], O.z - S.line[1]) < 12 || siren(O) && Math.hypot(O.x - S.line[0], O.z - S.line[1]) < 30));
  const T: Pat[] = [], st = { launched: 0, home: 0, speeders: 0, stops: 0, aborts: 0, spawned: 0, last: '' };
  let cur: Stop | null = null, tk = 0, nextLaunch = 4, nextSpeed = 90 + Math.random() * 60, force = false, fT = 0, nPat = 0;
  const want = () => { try { return window.CWFun ? window.CWFun.get('patrols') : 2; } catch (e) { return 2; } };
  window.addEventListener('cw-fun', e => { const d = (e as CustomEvent<{ key: string; value: unknown }>).detail; if (d && d.key === 'patrols' && T.length < want()) nextLaunch = Math.min(nextLaunch, OS.simT + 1); }); // more wanted: the next one comes out soon (fewer: see frame)
  const busy = () => OS.rob.ph !== 'idle' || OS.rob.pend || OS.pol.ph !== 'idle'; // a robbery or a jam call: they come first
  // lane samples (police.ts samples) and road nodes in 4 m / 8 m buckets, rebuilt with the network
  let BK: { key: string | null; Q: Map<number, LaneSample[]>; NQ: Map<number, P2[]>; ex: string[] } = { key: null, Q: new Map(), NQ: new Map(), ex: [] };
  const QK = (i: number, k: number) => (i + 4096) * 8192 + k + 4096;
  function bk() { if (BK.key === OS.net.key) return BK; const Q = new Map<number, LaneSample[]>(), NQ = new Map<number, P2[]>(), ex: string[] = [];
    for (const s of samples()) { const k = QK(Math.floor(s.x / 4), Math.floor(s.z / 4)); let a = Q.get(k); if (!a) Q.set(k, a = []); a.push(s); }
    for (const [u, n] of OS.net.N) { const k = QK(Math.floor(n.x / 8), Math.floor(n.z / 8)); let a = NQ.get(k); if (!a) NQ.set(k, a = []); a.push([n.x, n.z]); if (/:o\d+$/.test(u) && pub(n.x, n.z)) ex.push(u); }
    return BK = { key: OS.net.key, Q, NQ, ex }; }
  /** The lane sample nearest (x, z) within .6 m, heading h (to .3). */
  function near(x: number, z: number, h: number) { const { Q } = bk(); let best: LaneSample | null = null, bd = .36;
    for (let i = Math.floor(x / 4) - 1; i <= Math.floor(x / 4) + 1; i++) for (let k = Math.floor(z / 4) - 1; k <= Math.floor(z / 4) + 1; k++)
      for (const s of Q.get(QK(i, k)) || []) { const d = (s.x - x) ** 2 + (s.z - z) ** 2; if (d < bd && Math.abs(adiff(s.h, h)) < .3) { bd = d; best = s; } } return best; }
  /** A road node (junction, in or out road, roundabout arm) within r m of (x, z)? */
  function nodeNear(x: number, z: number, r: number) { const { NQ } = bk(); for (let i = Math.floor((x - r) / 8); i <= Math.floor((x + r) / 8); i++) for (let k = Math.floor((z - r) / 8); k <= Math.floor((z + r) / 8); k++)
    for (const p of NQ.get(QK(i, k)) || []) if (Math.hypot(p[0] - x, p[1] - z) < r) return true; return false; }
  const kcNear = (x: number, z: number) => OS.net.kc.some(c => Math.abs(x - c[0]) < c[2] + 6 && Math.abs(z - c[1]) < c[3] + 6); // a keep-clear box at an out road
  const yard = (p: P2) => stations().some(S => S.yard(p[0], p[1])); // a station's own roads
  const pubR = (r: P2[]) => r.every(p => yard(p) || pub(p[0], p[1])); // no forecourt, car park or bank yard on the way

  // ── a patrol car: the police model with a dark light bar (lit on a chase and at the stop) ──
  function body() { const g = mesh(G.pcar, VC), mB = new THREE.MeshBasicMaterial({ color: DARKL }), mR = new THREE.MeshBasicMaterial({ color: DARKL });
    for (const [m, x] of [[mB, -.21], [mR, .21]] as [THREE.MeshBasicMaterial, number][]) { const l = new THREE.Mesh(G.unit, m); l.scale.set(.38, .1, .24); l.position.set(x, 1.12, -.15); g.add(l); } return { g, mB, mR }; }
  /** A random round from station S's out node: up to three roundabout exits not too far from each other, then back to S's in road. */
  function round(S: PatrolStation): P2[] | null { const a = S.out; const N = OS.net.N, ex = bk().ex; if (!ex.length) return null; let P: P2[] = [], u = a;
    for (let n = 0, tries = 0; n < 3 && tries < 24; tries++) { const p = N.get(u)!, b = ex[Math.floor(Math.random() * ex.length)], q = N.get(b)!, d = Math.hypot(q.x - p.x, q.z - p.z); if (b === u || d < 40 || (d > 180 && tries < 18)) continue;
      const r = route(u, b); if (!r || !pubR(r) || plen(r) < 30) continue; P = P.length ? [...P, ...r.slice(1)] : [...r]; u = b; n++; }
    const r = route(u, S.in); if (!r || !pubR(r)) return null; P = P.length ? [...P, ...r.slice(1)] : [...r]; P.push(S.end); return P; }
  /** One patrol car out of a station: the one with the fewest out (spread over the stations), the others in turn if it cannot. */
  function launch() { const L0 = stations(), n = (S: PatrolStation) => T.filter(P => P.S === S).length;
    for (const S of L0.slice().sort((a, b) => n(a) - n(b))) if (launchAt(S)) return true; return false; }
  function launchAt(S: PatrolStation) { const [x0, z0] = S.spawn; if (vehs.some(O => !O.ghost && Math.hypot(O.x - x0, O.z - z0) < 9)) return false;
    if (OS.units.some(U => U.dir === 'out' && !pub(U.A.x, U.A.z) && Math.hypot(U.A.x - x0, U.A.z - z0) < 80)) return false; // a unit on its way out of this station goes first
    const R = round(S); if (!R) return false; const { g, mB, mR } = body(), A = veh('police', g, x0, z0, S.rot) as AnyVehicle; A.k = 0; place(A);
    const P: Pat = { S, A, mB, mR, ph: 'cruise', i: nPat++, arr: false, goHome: false, sp: null };
    const L = mkLeg([[x0, z0], ...R], { fin: true, fout: true, end: () => gone(P) });
    on(L, S.line[0], S.line[1], () => gateOf(S, A), null, 1.2, false, 'polout'); // where the out road joins the street: wait for a gap
    A.legs.push(L); T.push(P); st.launched++; return true; }
  function gone(P: Pat) { dropVeh(P.A); const i = T.indexOf(P); if (i >= 0) T.splice(i, 1); st.home++; nextLaunch = Math.max(nextLaunch, OS.simT + 6 + Math.random() * 14); }
  /** From the shoulder (or wherever its chase leg ends) back into the lane when it is clear behind, and home. */
  function homeFrom(P: Pat) { const A = P.A, s = P.sp; P.ph = 'home'; P.goHome = false; const r = s && route(s.e.to, P.S.in);
    if (!s || !r) { gone(P); return; }
    const L = mkLeg([[s.x, s.z], ...s.e.pts.slice(s.i + 1), ...r.slice(1), P.S.end], { fout: true, end: () => gone(P) });
    L.ev.push({ s: 0, fx: true, wait: () => A.lat < .3 || laneFree(A, s.x, s.z, s.h) }); A.latT = 0; A.scene = false; A.legs.push(L); }
  /** Off its round, straight home (fewer patrol cars wanted): only on a public street, off a roundabout, with no line ahead to wait at. */
  function sendHome(P: Pat) { const A = P.A, L0 = A.leg; if (P.ph !== 'cruise' || !L0 || !pub(A.x, A.z) || ringAt(A.x, A.z) || L0.ev.some(e => !e.done && e.wait && e.s - A.s < 30)) return false;
    const n = near(A.x, A.z, A.rot); const r = n && route(n.e.to, P.S.in); if (!n || !r) return false;
    const L = mkLeg([[A.x, A.z], ...n.e.pts.slice(n.i + 1), ...r.slice(1), P.S.end], { fout: true, end: () => gone(P) }); A.leg = L; A.s = 0; A.wt = 0; A.legs.length = 0; P.ph = 'home'; return true; }

  // ── the speeder ──
  /** Leg L's speeds as mkLeg (traffic.ts) works them out, with a higher top speed: as fast as the bends allow, braking (6 m/s²) into them. */
  function fast(L: OfficeLeg, vmax: number) { const R = L.pts, n = R.length, vp = new Float32Array(n);
    for (let i = 1; i < n - 1; i++) { const ax = R[i][0] - R[i - 1][0], az = R[i][1] - R[i - 1][1], bx = R[i + 1][0] - R[i][0], bz = R[i + 1][1] - R[i][1], k = Math.abs(Math.atan2(ax * bz - az * bx, ax * bx + az * bz)) / .3; vp[i] = k > .01 ? Math.min(vmax, Math.max(1.6, Math.sqrt(5 / k))) : vmax; }
    vp[0] = vmax; vp[n - 1] = L.vp[n - 1]; for (let i = n - 2; i >= 0; i--) vp[i] = Math.min(vp[i], Math.sqrt(vp[i + 1] * vp[i + 1] + 12 * (L.cum[i + 1] - L.cum[i]))); return vp; }
  const isCar = (C: AnyVehicle) => (C.kind === 'car' || C.kind === 'suv' || C.kind === 'hatch' || C.kind === 'pickup') && !C.unit && 'st' in C && (C.st === 'in' || C.st === 'out') && !!C.leg && !C.leg.rev &&
    !C.scene && !C.ghost && !C.parked && C.k >= 1 && C.gk >= 1 && C.latT == null && !C.lat && !C.yl && !C.yw && !C.haz && C.v > 2 && pub(C.x, C.z) && !ringAt(C.x, C.z);
  const qa = { x: 0, z: 0, i: 0, rot: 0 }, qb = { x: 0, z: 0, i: 0, rot: 0 };
  const straight = (L: OfficeLeg, s0: number, s1: number, h: number) => { for (let s = s0; s <= s1; s += 2) { pose(L, s, qb); if (Math.abs(adiff(qb.rot, h)) > .06 || ringAt(qb.x, qb.z)) return false; } return true; };
  /** Where C pulls over: 45..110 m ahead on its leg (15 m of it left after), on a straight with room for both cars on the shoulder,
   *  no road node (junction, in or out road) within 9 m and no keep-clear box near. */
  function findStop(C: AnyVehicle, d0 = 45) { const L = C.leg!;
    for (let d = d0; d <= 110; d += 1) { const s = C.s + d; if (s > L.len - 18) break; pose(L, s, qa); const h = qa.rot, x = qa.x, z = qa.z;
      if (!straight(L, s - 14, s + 5, h) || nodeNear(x, z, 9) || kcNear(x, z)) continue; pose(L, s - 7.5, qb); if (nodeNear(qb.x, qb.z, 9) || kcNear(qb.x, qb.z)) continue;
      const s0 = near(x, z, h), s1 = near(qb.x, qb.z, h); if (!s0 || !s1 || s0.e !== s1.e || !spotOK(s0) || !spotOK(s1) || !pub(s0.x, s0.z) || !pub(s1.x, s1.z)) continue;
      const right = [-2, -1, 0, 1].every(k => { const [px, pz] = lp(s0, SH + 1.3, k); return freeAt(px, pz, s0.e); }); // the officer can stand on the far side (off the lane)
      return { sT: s, s0, s1, side: right ? 'right' as const : 'left' as const }; }
    return null; }
  /** On the chasing car's leg: it never comes closer than GAP m (centre to centre) to C ahead of it, on a roundabout too; it waits
   *  instead (a line it stops at, GAP m short of where C is now, re-checked every step). C gone or not ahead: nothing to wait for. */
  const GAP = 6;
  function gapEv(A: AnyVehicle, C: AnyVehicle): LegEvent { const E: LegEvent = { s: 1e9, near: 1e9, re: true, fx: true, tag: 'gap', wait: () => {
    const dx = C.x - A.x, dz = C.z - A.z, d = Math.hypot(dx, dz), al = dx * Math.sin(A.rot) + dz * Math.cos(A.rot);
    if (!vehs.includes(C) || al <= 0 || d >= GAP + A.v * A.v / 6 + 1.5) { E.s = A.s + 1e6; return true; }
    E.s = A.s + Math.max(0, d - GAP); return false; } }; return E; }
  /** P follows C: lights on, to the shoulder 7.5 m behind where C stops. */
  function chase(P: Pat, C: AnyVehicle, f: NonNullable<ReturnType<typeof findStop>>) { const A = P.A, s1 = f.s1, n = near(A.x, A.z, A.rot); if (!n || !A.leg || ringAt(A.x, A.z) || A.leg.ev.some(e => !e.done && e.wait && e.s - A.s < 30)) return false;
    let path: P2[]; if (n.e === s1.e && n.i <= s1.i && (s1.x - A.x) * Math.sin(s1.h) + (s1.z - A.z) * Math.cos(s1.h) > 3) path = [[A.x, A.z], ...n.e.pts.slice(n.i + 1, s1.i + 1), [s1.x, s1.z]];
    else { const r = route(n.e.to, s1.u); if (!r || !pubR(r)) return false; path = [[A.x, A.z], ...n.e.pts.slice(n.i + 1), ...r.slice(1), ...s1.e.pts.slice(1, s1.i + 1), [s1.x, s1.z]]; }
    if (plen(path) > f.sT - C.s + 260) return false; // too far round
    const L = mkLeg(path, { end: () => { P.arr = true; A.scene = true; if (P.goHome) homeFrom(P); } });
    let behind = false; for (let s = 4; s < L.len - 8 && !behind; s += 1.5) { pose(L, s, qb); behind = Math.hypot(qb.x - C.x, qb.z - C.z) < 2.5 && Math.abs(adiff(qb.rot, C.rot)) < .5; }
    if (!behind) return false; // its way to the spot goes where C is now: it follows C there, never round another way and past it
    L.ev.push({ s: Math.max(0, L.len - 5), fn: () => { if (!P.goHome) A.latT = SH; } }, gapEv(A, C));
    L.vp = fast(L, VMAX + 1); // lights on: it keeps up with the speeder (still no right of way)
    A.leg = L; A.s = 0; A.wt = 0; A.legs.length = 0; P.ph = 'chase'; P.arr = false; P.sp = s1;
    const CL = C.leg!, S = { go: false }, vp0 = CL.vp; CL.vp = fast(CL, VMAX); C.scene = true; // part of the scene now: it does not fade out when it stands, and nobody calls the police about it
    CL.ev.push({ s: f.sT - 8, fn: () => { if (!S.go) C.latT = SH; } }, { s: f.sT, fx: true, near: 40, tag: 'pulled', wait: () => S.go && (C.lat < .3 || laneFree(C, f.s0.x, f.s0.z, f.s0.h)) }); CL.ev.sort((a, b) => a.s - b.s);
    cur = { P, C, L: CL, vp0, sT: f.sT, s0: f.s0, s1, S, t0: OS.simT, run: null, side: f.side }; st.speeders++; return true; }
  /** One speeder near a cruising patrol car: ahead of it the same way within 70 m, the nearest first; forced (patrol('speed')): the same,
   *  or else the nearest one ahead on the patrol car's own route (up to 160 m on), never one somewhere else in town (it tries again). */
  const onRoute = (A: AnyVehicle, c: AnyVehicle) => { const L = A.leg!; let best = -1; for (let d = 6; d <= 160 && A.s + d < L.len; d += 2) { pose(L, A.s + d, qb); if (Math.hypot(qb.x - c.x, qb.z - c.z) < 2 && Math.abs(adiff(qb.rot, c.rot)) < .5) { best = d; break; } } return best; };
  function trySpeed(any: boolean) { const pats = T.filter(P => P.ph === 'cruise' && P.A.leg && P.A.k >= 1 && P.A.gk >= 1 && !P.A.ghost && pub(P.A.x, P.A.z) && !ringAt(P.A.x, P.A.z)); if (!pats.length) return false;
    const C = vehs.filter(isCar), pairs: [number, Pat, AnyVehicle][] = [];
    for (const P of pats) for (const c of C) { const A = P.A, dx = c.x - A.x, dz = c.z - A.z, al = dx * Math.sin(A.rot) + dz * Math.cos(A.rot), ac = Math.abs(dx * Math.cos(A.rot) - dz * Math.sin(A.rot));
      if (al > 6 && al < 70 && ac < 4 && Math.abs(adiff(c.rot, A.rot)) < .4) pairs.push([al, P, c]); else if (any && al > 6 && al < 170) { const d = onRoute(A, c); if (d > 0) pairs.push([1000 + d, P, c]); } }
    pairs.sort((a, b) => a[0] - b[0]); for (const [, P, c] of pairs.slice(0, 10)) { const f = findStop(c, any ? 30 : 45); if (f && chase(P, c, f)) return true; } return false; }
  /** Forced, and no car came along in time: one comes onto the patrol car's own route 30..60 m ahead of it, in its lane, fading in
   *  as spawned cars do (over its first 3 m). Off-screen first, else where a road or roundabout arm joins (as if it came from there),
   *  else anywhere there; 60..90 m ahead only when 30..60 has no room (a roundabout or a queue there); never with another vehicle within 9 m. It drives out of town along the route, and the chase starts at once. */
  const nd = new THREE.Vector3();
  const offScreen = (x: number, z: number) => { try { nd.set(x, .5, z).project(OS.ctx.camera); return Math.abs(nd.x) > 1.05 || Math.abs(nd.y) > 1.05; } catch (e) { return false; } };
  let why = '';
  function spawnSpeeder() { const pats = T.filter(P => P.ph === 'cruise' && P.A.leg && P.A.k >= 1 && !P.A.ghost && pub(P.A.x, P.A.z) && !ringAt(P.A.x, P.A.z)); why = pats.length ? 'spot' : 'nopat';
    for (const P of pats) { const A = P.A, L = A.leg!, c: [number, number, number, number, LaneSample][] = []; if (L.ev.some(e => !e.done && e.wait && e.s - A.s < 30)) { why = 'line'; continue; }
      const W: Record<string, number> = { len: 0, ring: 0, pub: 0, veh: 0, lane: 0 }; if (A.s + 30 >= L.len - 20) W.len++;
      for (let d = 30; d <= 90 && A.s + d < L.len - 20; d += 2) { pose(L, A.s + d, qa); const { x, z, rot } = qa; if (ringAt(x, z)) { W.ring++; continue; } if (!pub(x, z) || yard([x, z])) { W.pub++; continue; } if (vehs.some(O => Math.hypot(O.x - x, O.z - z) < 9)) { W.veh++; continue; }
        const n = near(x, z, rot); if (!n || !pub(n.x, n.z)) { W.lane++; continue; } c.push([(d > 60 ? 3 : 0) + (offScreen(x, z) ? 0 : nodeNear(x, z, 7) ? 1 : 2), d, x, z, n]); }
      c.sort((a, b) => a[0] - b[0] || a[1] - b[1]); if (!c.length) why = 'spot ' + Object.entries(W).filter(e => e[1]).map(e => e.join(':')).join(' ');
      const ex = bk().ex;
      for (const [, , x, z, n] of c.slice(0, 8)) { let CL: OfficeLeg | null = null, f: ReturnType<typeof findStop> = null; // out of town, or on to a roundabout exit: the first way with somewhere to pull over on it
        for (const to of [OS.gateOut(), ...[...ex].sort(() => Math.random() - .5).slice(0, 5)]) { const g = OS.gateOut(), r = to && to !== n.e.to && route(n.e.to, to), r2 = r && (to === g ? [] : route(to, g)); if (!r || !r2 || !pubR(r)) continue;
          CL = mkLeg([[x, z], ...n.e.pts.slice(n.i + 1), ...r.slice(1), ...r2.slice(1)], { fin: true, fout: true }); f = findStop({ leg: CL, s: 0 } as AnyVehicle, 25); if (f) break; }
        if (!CL || !f) { why = 'stop'; continue; }
        const kinds = ['hatch', 'suv', 'pickup'] as const, k = kinds[Math.floor(Math.random() * 3)], Gk = G[k], g = mesh(Gk[Math.floor(Math.random() * Gk.length)], VC);
        const C = veh(k, g, x, z, n.h) as AnyVehicle; C.k = 0; place(C); (C as AnyVehicle & { st: string }).st = 'out';
        CL.end = () => dropVeh(C); C.leg = CL; C.s = 0; C.v = 8; C.parked = false;
        if (chase(P, C, f)) { st.spawned++; return true; } why = 'chase'; dropVeh(C); } }
    return false; }
  function release(ok: boolean) { const c = cur; if (!c) return; cur = null; if (c.run && !c.run.done) c.run.cancel(); const { P, C, L, S } = c;
    S.go = true; L.vp = c.vp0; C.scene = false; if (C.leg !== L) { C.lat = 0; C.latT = null; } else if (C.lat || C.latT) C.latT = 0; // back into the lane when the lane is clear behind
    if (T.includes(P)) { if (P.arr) homeFrom(P); else { P.goHome = true; P.ph = 'home'; if (P.A.latT) P.A.latT = 0; } }
    if (ok) st.stops++; else st.aborts++; st.last = ok ? 'ticket' : 'abort'; }
  function stepStop() { const c = cur!, { P, C } = c, el = OS.simT - c.t0;
    const ab = !vehs.includes(C) ? 'gone' : C.ghost ? 'cghost' : P.A.ghost ? 'pghost' : !T.includes(P) ? 'pgone' : busy() ? 'busy' : el > (c.run ? 150 : 90) ? 'time' : '';
    if (ab) { release(false); st.last = 'abort ' + ab; return; } // gone, or a robbery or jam call came: they drive on
    if (c.run || !P.arr || P.A.leg || P.A.legs.length) return;
    if (C.v < .05 && C.leg === c.L && C.s > c.sT - .4 && Math.abs(C.lat - SH) < .15 && Math.abs(P.A.lat - SH) < .15 && P.A.v < .05) { // both stand on the shoulder: the stop
      const B = OS.bubbles; P.ph = 'stop';
      c.run = runStop(OS, { cop: { car: P.A }, driver: { car: C }, side: c.side, seed: 'patrol' + st.speeders, bubbles: B, onDone: () => { if (cur === c) release(true); } }); } }

  function frame(dt: number, t: number) {
    for (const P of T) { const lit = P.ph === 'chase' || P.ph === 'stop', ph = (t * 2.6 + P.i * .37) % 1; // lights: on a chase and at the stop (steady with reduced motion)
      P.mB.color.copy(lit ? BLUE : DARKL).multiplyScalar(lit ? (reduced ? 1.6 : ph < .5 ? 2.6 : .2) : 1); P.mR.color.copy(lit ? RED : DARKL).multiplyScalar(lit ? (reduced ? 1.6 : ph < .5 ? .2 : 2.6) : 1); }
    if (cur && cur.run) cur.run.frame(dt);
    if ((tk += dt) < .5) return; tk = 0;
    if (cur) stepStop();
    const n = want(), b = busy();
    if (!b && OS.simT >= nextLaunch && (T.length < n || (force && !T.length))) { if (launch()) nextLaunch = OS.simT + 12 + Math.random() * 18; else nextLaunch = OS.simT + 2; }
    if (T.length > n && !force) for (const P of T.filter(P => P.ph === 'cruise').slice(0, T.length - n)) sendHome(P); // fewer wanted: the extra ones head home
    if (force && (n === 0 || b)) force = false; // it cannot happen now: no patrol cars wanted, or a robbery or jam call came
    const cr = T.some(P => P.ph === 'cruise'); if (force && (cur || !cr)) fT = OS.simT; // the 5 s count from when a patrol car is cruising
    if (!cur && !b && (force || OS.simT >= nextSpeed) && cr) { if (trySpeed(force) || force && OS.simT - fT >= 4 && spawnSpeeder()) { force = false; nextSpeed = OS.simT + 150 + Math.random() * 150; } else if (!force) nextSpeed = OS.simT + 5; }
  }
  const r1 = (v: number) => +v.toFixed(1);
  /** probe: patrol(): the patrol cars and the stop; patrol('speed'): a speeder now (a patrol car comes out first if none is). */
  function probe(cmd?: string) { if (cmd === 'speed' && want() > 0 && !busy()) { if (!force) fT = OS.simT; force = true; if (!T.length) nextLaunch = 0; }
    const c = cur; return { want: want(), out: T.length, force, busy: busy(), why, next: r1(Math.max(0, nextSpeed - OS.simT)), ...st,
      stations: stations().map(S => [S.out, T.filter(P => P.S === S).length]), cars: T.map(P => [P.ph, r1(P.A.x), r1(P.A.z), r1(P.A.v), +P.A.lat.toFixed(2), P.S.out]),
      stop: c && { phase: c.run ? c.run.phase : c.P.arr ? 'arrived' : 'chase', kind: c.C.kind, at: [r1(c.s0.x), r1(c.s0.z)], car: [r1(c.C.x), r1(c.C.z), r1(c.C.v), +c.C.lat.toFixed(2), +c.C.rot.toFixed(2)], cop: [r1(c.P.A.x), r1(c.P.A.z), r1(c.P.A.v), +c.P.A.lat.toFixed(2), +c.P.A.rot.toFixed(2)], side: c.side, t: r1(OS.simT - c.t0) } }; }
  return { frame, probe };
}
