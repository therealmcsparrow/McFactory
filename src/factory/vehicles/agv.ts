import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { clamp, hashf, easeOut, easeIO, damp } from '../../common/math.js';
import type { Leg, P2 } from '../../common/types.js';
import type { FSAtAgvs } from '../state.js';
import type { BoxHold, Dock, DropTask, HereRef, Mover, NetEdge, NetNode, Path, PickTask, RbPlan, Robot, RoutePlan, Stop, StopRef } from '../types.js';

export function makeAgvs(FS: FSAtAgvs) {
  const { jointM, mat, steel, NB, Z0, OFFC, scene, NET, LBD, RLEAD, RR, LB, R, DSL, eAt, seg, eSlice, LO, ROUT, docks, CARRY, spotClaim, SX, roads, YAX, mP, mS, mM, tc, AMBER, CYAN, GREEN, STK } = FS;
  // ── warehouse robots (AGVs): instanced skirt, body, lifting deck, blinking light
  const RG = { skirt: new THREE.BoxGeometry(.92, .1, .66).translate(0, .07, 0), body: new RoundedBoxGeometry(.86, .2, .6, 2, .05).translate(0, .2, 0),
    deck: new THREE.BoxGeometry(.66, .04, .5).translate(0, .32, 0), light: new THREE.BoxGeometry(.1, .08, .1).translate(-.3, .34, .2) };
  const RM = { skirt: jointM, body: mat('#e2a516', { roughness: .45, metalness: .2 }), deck: steel, light: new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false }) };
  const RIM = {} as Record<keyof typeof RG, THREE.InstancedMesh>; for (const k in RG) { const im = new THREE.InstancedMesh(RG[k as keyof typeof RG], RM[k as keyof typeof RM], NB); im.frustumCulled = false; im.castShadow = k !== 'light'; im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); for (let i = 0; i < NB; i++) im.setMatrixAt(i, Z0); if (k === 'light') for (let i = 0; i < NB; i++) im.setColorAt(i, OFFC); scene.add(im); RIM[k as keyof typeof RIM] = im; }
  const robots: Robot[] = []; let rid = 0, rateEMA = 0, fleetT = 0; FS.rateAcc = 0; FS.fleetWant = 2;
  const VMAX = 4, ACC = 2.6, DEC = ACC * 3, VC = 1.5, GAPD = .45, LAT = .72;
  const deckSpot = (r: Robot, slot: number, out: THREE.Vector3) => out.set(r.x, (r.ry || 0) + (.34 + r.lift * .12 + slot * .31) * Math.max(.001, r.scale), r.z); // r.ry: lifted (breakdowns: towed / on the jack)
  const dropClaim = new Map<string, number>();
  function stopOf(d: StopRef): Stop | null | undefined { // a stop = a point on a directed lane (e, t) plus an off-road spot for lay-bys
    if (d.kind === 'dock') { const dk = d.dk;
      if (dk.sv !== NET.ver) { let best: Stop | null = null, bd = 1e9; // the lane that passes the dock with the dock on its right
        for (const e of NET.edges) { if (e.kind !== 'road') continue; const a = e.pts[0], t = (dk.px - a[0]) * e.h[0] + (dk.oz - a[1]) * e.h[1], lat = (dk.px - a[0]) * e.n[0] + (dk.oz - a[1]) * e.n[1];
          if (t < LBD + RLEAD || t > e.len - LBD - RLEAD || lat < .3 || lat > 2.5) continue; if (lat < bd) { bd = lat; best = { e, t, spot: [dk.px, dk.oz], dock: true }; } }
        dk.st = best; dk.sv = NET.ver; }
      return dk.st; }
    if (d.kind === 'drop') { const e = NET.strips[d.side][d.k]; return { e, t: d.t ?? e.tStop!, spot: null }; }
    if (d.kind === 'here') return d.v === NET.ver ? d.st : null; // a mid-route lane point (re-planning)
    return NET.spots[d.i];
  }
  FS.routeRoads = false; // the tow truck never drives through the warehouse passages
  function route(eA: NetEdge, t0: number, eB: NetEdge, t1: number): { es: NetEdge[]; cost: number } | null { // shortest lane route; U-turns only round a roundabout
    if (eA === eB && t1 >= t0 - 1e-6) return { es: [eA], cost: t1 - t0 };
    const dist = new Float64Array(NET.edges.length).fill(1e9), prev = new Int32Array(NET.edges.length).fill(-1), open = [eA.id];
    dist[eA.id] = eA.len - t0; let best = 1e9, bestPrev = -1;
    while (open.length) { let bi = 0; for (let k = 1; k < open.length; k++) if (dist[open[k]] < dist[open[bi]]) bi = k;
      const id = open.splice(bi, 1)[0], e = NET.edges[id], d = dist[id]; if (d >= best) break;
      for (const f of NET.out.get(e.b) || []) { const ut = f.b === e.a; if (ut && !(e.kind === 'road' && f.kind === 'road' && e.b.rb)) continue; if (f.kind === 'strip' && (FS.routeRoads || (f !== eB && !f.transit))) continue; // unload lanes only to unload; the outer one doubles as the through lane
        const c = d + (ut ? 2 * Math.PI * RR : 0); // U-turn = once round the ring
        if (f === eB) { if (c + t1 < best) { best = c + t1; bestPrev = id; } continue; }
        if (c + f.len < dist[f.id]) { dist[f.id] = c + f.len; prev[f.id] = id; if (!open.includes(f.id)) open.push(f.id); } } }
    if (bestPrev < 0) return null;
    const es = [eB]; for (let id = bestPrev; id >= 0 && es.length < 99; id = id === eA.id ? -1 : prev[id]) es.unshift(NET.edges[id]);
    return { es, cost: best };
  }
  const lbOf = (S: Stop) => S.dock ? LBD : S.spot ? LB : 0; // lay-by length: docks have the long parallel side lane
  function routePts(r: { x: number; z: number }, A: Stop, B: Stop): RoutePlan {
    const t0 = A.t + lbOf(A), t1 = B.t - lbOf(B), R = route(A.e, t0, B.e, t1), V: RbPlan[] = [];
    const pts: P2[] = [[r.x, r.z]];
    if (A.dock) { const h = A.e.h, sp = A.spot!; pts.push([sp[0] + h[0] * DSL, sp[1] + h[1] * DSL]); } // straight out along the bay first
    if (!R) { pts.push(B.spot || eAt(B.e, B.t)); return { pts, M: [], V }; }
    const far = (v: NetNode, p: P2) => Math.hypot(p[0] - v.x, p[1] - v.z) > RLEAD - .05;
    R.es.forEach((e, i) => { let seg = eSlice(e, i === 0 ? t0 : 0, i === R.es.length - 1 ? t1 : e.len);
      if (i > 0) { const p = R.es[i - 1], v = p.b;
        if (p.kind === 'road' && e.kind === 'road' && v.rb) { // roundabout: lead in, circle counter-clockwise (keep right), lead out
          while (pts.length > 1 && !far(v, pts[pts.length - 1])) pts.pop(); seg = seg.filter(q => far(v, q));
          const ca = Math.sqrt(1 - (LO / RR) ** 2), sa = LO / RR;
          const qi: P2 = [v.x + RR * (-p.h[0] * ca + p.n[0] * sa), v.z + RR * (-p.h[1] * ca + p.n[1] * sa)], qo: P2 = [v.x + RR * (e.h[0] * ca + e.n[0] * sa), v.z + RR * (e.h[1] * ca + e.n[1] * sa)];
          const li: P2 = [v.x + p.n[0] * LO - p.h[0] * RLEAD, v.z + p.n[1] * LO - p.h[1] * RLEAD], lo: P2 = [v.x + e.n[0] * LO + e.h[0] * RLEAD, v.z + e.n[1] * LO + e.h[1] * RLEAD];
          const ai = Math.atan2(qi[1] - v.z, qi[0] - v.x), ao = Math.atan2(qo[1] - v.z, qo[0] - v.x); let D = ((ai - ao) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI); if (D < .1) D += 2 * Math.PI;
          pts.push(li); const k = Math.max(2, Math.ceil(D / .32)); for (let m = 0; m <= k; m++) { const th = ai - D * m / k; pts.push([v.x + Math.cos(th) * RR, v.z + Math.sin(th) * RR]); } pts.push(lo);
          V.push({ n: v, ai, ao, li, qo, lo }); }
        else if (p.kind === 'road' && e.kind === 'road') {
          { const k = 1 + p.n[0] * e.n[0] + p.n[1] * e.n[1]; pts.pop(); seg.shift(); pts.push([v.x + (p.n[0] + e.n[0]) * LO / k, v.z + (p.n[1] + e.n[1]) * LO / k]); } }
        else if (v.box && (p.kind === 'strip') !== (e.kind === 'strip')) { // warehouse corner: the unload strips end on the node centre but the corridor lanes lie .6 beside it, so the old path swung to the centre and back (a hairpin, queues nose to tail on it). Join the two lane lines where they cross.
          const sh = (p.kind === 'strip' ? p : e).pts, ux0 = sh[2][0] - sh[1][0], uz0 = sh[2][1] - sh[1][1], ul = Math.hypot(ux0, uz0) || 1, ux = ux0 / ul, uz = uz0 / ul, toRoad = p.kind === 'strip';
          const Rp = toRoad ? seg[0] : pts[pts.length - 1], hh = toRoad ? e.h : p.h, dx = Rp[0] - sh[1][0], dz = Rp[1] - sh[1][1], det = hh[0] * uz - ux * hh[1];
          if (Math.abs(det) > .5) { const a = (-dx * hh[1] + hh[0] * dz) / det, C: P2 = [sh[1][0] + a * ux, sh[1][1] + a * uz];
            if (toRoad) { const q = pts[pts.length - 2]; // strip lane runs on past the node end; join the road lane there
              if (q && (C[0] - q[0]) * ux + (C[1] - q[1]) * uz > .05) { pts.pop(); pts.push(C); if ((C[0] - seg[0][0]) * hh[0] + (C[1] - seg[0][1]) * hh[1] > .02) seg.shift(); } }
            else { let n = pts.length; while (n > 1 && (pts[n - 1][0] - C[0]) * hh[0] + (pts[n - 1][1] - C[1]) * hh[1] > .02) n--; // road lane: trim back to the turn-off (or run on to it)
              if ((C[0] - pts[n - 1][0]) * hh[0] + (C[1] - pts[n - 1][1]) * hh[1] > -.02) { pts.length = n; pts.push(C); seg.shift(); } } } } }
      pts.push(...seg); });
    if (B.dock) { const h = B.e.h, sp = B.spot!; pts.push([sp[0] - h[0] * DSL, sp[1] - h[1] * DSL]); } // line up parallel to the bay, then roll straight to the pick spot
    if (B.spot) pts.push(B.spot);
    return { pts, M: A.dock ? [eAt(A.e, t0)] : A.spot ? [pts[1]] : [], V };
  }
  function buildPath(raw: P2[]): Path {
    const pts: P2[] = []; for (const p of raw) { const q = pts[pts.length - 1]; if (!q || Math.hypot(p[0] - q[0], p[1] - q[1]) > .05) pts.push([p[0], p[1]]); }
    const n = pts.length, sh = pts;
    const out: P2[] = [sh[0]], cap = [VMAX];
    for (let k = 1; k < n - 1; k++) { // round each corner with a quadratic curve, slow down through it
      const A = sh[k - 1], V = sh[k], B = sh[k + 1], li = Math.hypot(V[0] - A[0], V[1] - A[1]) || 1, lo = Math.hypot(B[0] - V[0], B[1] - V[1]) || 1;
      const di = [(V[0] - A[0]) / li, (V[1] - A[1]) / li], dO = [(B[0] - V[0]) / lo, (B[1] - V[1]) / lo], rr = Math.min(.9, li * .45, lo * .45);
      if (di[0] * dO[0] + di[1] * dO[1] > .995 || rr < .03) { out.push(V); cap.push(VMAX); continue; }
      const P0 = [V[0] - di[0] * rr, V[1] - di[1] * rr], P2 = [V[0] + dO[0] * rr, V[1] + dO[1] * rr];
      for (let s = 0; s <= 6; s++) { const u = s / 6, a = (1 - u) * (1 - u), b = 2 * u * (1 - u), c = u * u; out.push([a * P0[0] + b * V[0] + c * P2[0], a * P0[1] + b * V[1] + c * P2[1]]); cap.push(VC); }
    }
    if (n > 1) { out.push(sh[n - 1]); cap.push(0); }
    const cum = [0]; for (let k = 1; k < out.length; k++) cum.push(cum[k - 1] + Math.hypot(out[k][0] - out[k - 1][0], out[k][1] - out[k - 1][1]));
    return { pts: out, cap, cum, len: cum[cum.length - 1] };
  }
  const pathAt = (P: Path, s: number, k0 = 0): P2 => { s = clamp(s, 0, P.len); let k = Math.max(1, k0); while (k < P.pts.length - 1 && P.cum[k] < s) k++;
    const a = P.pts[k - 1] || P.pts[0], b = P.pts[k] || a, l = (P.cum[k] ?? 0) - (P.cum[k - 1] ?? 0); const u = l > 1e-6 ? (s - P.cum[k - 1]) / l : 1; return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u]; };
  function freeBoxes(r: Mover) { for (const j of r.J || []) j.n.hs.delete(j); r.J = []; }
  const eProj = (e: Leg, x: number, z: number) => { let bt = 0, bd = 1e9; for (let k = 1; k < e.pts.length; k++) { const a = e.pts[k - 1], b = e.pts[k], l = e.cum[k] - e.cum[k - 1] || 1, u = clamp(((x - a[0]) * (b[0] - a[0]) + (z - a[1]) * (b[1] - a[1])) / (l * l), 0, 1), px = a[0] + (b[0] - a[0]) * u, pz = a[1] + (b[1] - a[1]) * u, d = (px - x) ** 2 + (pz - z) ** 2; if (d < bd) { bd = d; bt = e.cum[k - 1] + u * l; } } return bt; };
  function setPath(r: Robot, raw: P2[], M: P2[], d: StopRef, V: RbPlan[]) {
    freeBoxes(r); r.back = 0; r.path = buildPath(raw); r.to = d; r.s = 0; r.pi = 0; r.st = 'go'; r.wait = false; r.mi = 0;
    const sAt = (m: P2) => { let bk = 0, bd = 1e9; r.path.pts.forEach((p, k) => { const dd = Math.hypot(p[0] - m[0], p[1] - m[1]); if (dd < bd) { bd = dd; bk = k; } }); return r.path.cum[bk]; };
    r.Ms = (M || []).map(m => ({ s: sAt(m), x: m[0], z: m[1] }));
    r.RB = (V || []).map(v => ({ n: v.n, ai: v.ai, ao: v.ao, a: sAt(v.li), q: sAt(v.qo), b: sAt(v.lo), done: false })); // roundabout visits: lead-in, ring exit, lead-out (path s)
    const P = r.path, onRing = (p: P2) => NET.rbs!.some(n => (p[0] - n.x) ** 2 + (p[1] - n.z) ** 2 < (ROUT + .3) ** 2); // junction boxes (gates) on the way: one robot at a time inside each box
    for (const n of NET.nodes.values()) { if (!n.box) continue; let a = -1, b = -1;
      const rr = n.r! + .6, fp: [number, number, number][] = [];
      for (let s = 0, k = 0; s <= P.len; s += .2) { const p = pathAt(P, s, k); while (k < P.pts.length - 1 && P.cum[k] < s) k++; if ((p[0] - n.x) ** 2 + (p[1] - n.z) ** 2 < rr * rr && !onRing(p)) { if (a < 0) a = s; b = s; fp.push([s, p[0], p[1]]); } else if (a >= 0) break; }
      if (a >= 0) r.J.push({ n, a, b, fp, r, held: false, done: false }); }
    r.J.sort((x, y) => x.a - y.a);
  }
  function goTo(r: Robot, d: StopRef) { const { pts, M, V } = routePts(r, stopOf(r.at!)!, stopOf(d)!); setPath(r, pts, M, d, V); }
  const distTo = (r: Robot, d: StopRef) => { const A = stopOf(r.at!), B = stopOf(d); if (!A || !B) return 1e9; const R = route(A.e, A.t + lbOf(A), B.e, B.t - lbOf(B)); return R ? R.cost : 1e9; };
  function bestDock(r: Robot) { // every dock with crates qualifies (robots never idle while crates wait); unreserved crates and short drives score best
    let best: Dock | null = null, bs = -1e9;
    for (const dk of docks) { if (!dk || !dk.queue.length || !stopOf({ kind: 'dock', dk })) continue; const av = Math.max(0, dk.queue.length - dk.reserved), d = distTo(r, { kind: 'dock', dk }); if (d > 1e8) continue;
      const cl = dk.claims || 0, sc = (av > 0 && cl < 5 ? 1e4 : 0) + Math.min(CARRY, av) * 12 + Math.min(av, 12) * .5 + Math.min(dk.queue.length, 12) * .3 - d - cl * 4; // open crates under the 5-robot cap first, else any dock with crates
      if (sc > bs) { bs = sc; best = dk; } }
    return best;
  }
  const anyCrates = () => docks.some(dk => dk && dk.queue.length);
  function hereStop(r: { x: number; z: number; hx: number; hz: number }): HereRef | null { // the lane point under a driving robot (same heading), to re-plan from mid-route
    let best: Stop | null = null, bd = .36;
    for (const e of NET.edges) { const t = eProj(e, r.x, r.z), p = eAt(e, t), d = (p[0] - r.x) ** 2 + (p[1] - r.z) ** 2; if (d >= bd) continue;
      const a = eAt(e, Math.max(0, t - .3)), b = eAt(e, Math.min(e.len, t + .3)), hx = b[0] - a[0], hz = b[1] - a[1], l = Math.hypot(hx, hz) || 1;
      if ((hx * r.hx + hz * r.hz) / l < .7) continue; bd = d; best = { e, t, spot: null }; }
    return best ? { kind: 'here', st: best, v: NET.ver } : null;
  }
  const onRb = (r: Mover) => (r.RB || []).some(v => r.s > v.a - .3 && r.s < v.b + .3);
  const inBox = (r: Mover) => r.J.some(j => j.held && r.s > j.a - .3) || onRb(r); // already crossing a gate box or a roundabout: never re-plan there
  function unstick(r: Robot) { // safety net: stood still >3 s (crates waiting, or on a job). Head-to-head pair: the lower id drives through; drop box holds not yet entered, then re-plan from here (same goal)
    const o = r.blk; if (o && o.blk === r && o.st === 'go' && (r.id < (o as Robot).id || o.isTruck)) { const canBack = (x: Mover) => { if (x.s < .15) return false; const pc = pathAt(x.path!, Math.max(0, x.s - 1), x.pi); return !robots.some(q => q !== x && !(q.dying && q.scale < .3) && Math.hypot(q.x - pc[0], q.z - pc[1]) < MIND + .05); };
      const w = !o.isTruck && canBack(o) ? o : canBack(r) ? r : null; if (w) w.back = 1.5; r.unstuck = (r.unstuck || 0) + 1; return; } // head-to-head: the higher id backs off along its own path (never drive through); the tow truck never backs off, the robot does
    for (const j of r.J) if (j.held && r.s < j.a - .05) { j.n.hs.delete(j); j.held = false; }
    if (inBox(r) || r.s < .05 && r.Ms.length) return; const H = hereStop(r); if (!H) return;
    if (r.task && r.task.kind === 'home') { if (spotClaim[r.task.i] === r) spotClaim[r.task.i] = null; r.at = H; const dk = bestDock(r); if (dk) assignPick(r, dk); else afterTask(r); return; }
    const B = stopOf(r.to); if (!B) return; const { pts, V } = routePts(r, H.st, B); setPath(r, pts, [], r.to, V); r.unstuck = (r.unstuck || 0) + 1;
  }
  function leaveSpot(r: Robot) { if (r.at && r.at.kind === 'park' && spotClaim[r.at.i] === r) spotClaim[r.at.i] = null; }
  function assignPick(r: Robot, dk: Dock) { leaveSpot(r); const k = Math.max(0, Math.min(CARRY, dk.queue.length - dk.reserved)); dk.reserved += k; dk.claims = (dk.claims || 0) + 1; r.task = { kind: 'pick', dk, k }; goTo(r, { kind: 'dock', dk }); }
  function afterTask(r: Robot) { const dk = bestDock(r); if (dk) { assignPick(r, dk); return; }
    let bi = -1, bd = 1e9; spotClaim.forEach((c, i) => { if (c) return; const d = distTo(r, { kind: 'park', i }); if (d < bd) { bd = d; bi = i; } });
    if (bi < 0) bi = spotClaim.findIndex(c => c === null || c === r); if (bi < 0) bi = 0;
    spotClaim[bi] = r; r.task = { kind: 'home', i: bi }; goTo(r, { kind: 'park', i: bi }); }
  function goDrop(r: Robot) { // least-busy unload lane, then the shortest drive
    let best: { side: number; k: number; key: string } | null = null, bs = 1e9;
    for (const side of [1, -1]) for (let k = 0; k < SX.length; k++) { const key = side + ':' + k, sc = (dropClaim.get(key) || 0) * 6 + (k === SX.length - 1 ? 2 : 0) + distTo(r, { kind: 'drop', side, k }); if (sc < bs) { bs = sc; best = { side, k, key }; } }
    dropClaim.set(best!.key, (dropClaim.get(best!.key) || 0) + 1);
    r.task = { kind: 'drop', side: best!.side, k: best!.k, z: 0, key: best!.key }; goTo(r, { kind: 'drop', side: best!.side, k: best!.k });
  }
  function arrive(r: Robot) {
    freeBoxes(r); r.at = r.to; r.v = 0; r.wait = false;
    if (r.task!.kind === 'test') { // test drive for the breakdown button ended without a breakdown: back to normal dispatch from here (the button asks again)
      r.task = null; r.stillT = 0; const H = hereStop(r); if (H) r.at = H; afterTask(r); return; }
    if (r.task!.kind === 'pick') { r.st = 'load'; r.t = 0; r.took = false; }
    else if (r.task!.kind === 'drop') { r.st = 'unload'; r.t = 0; r.nextDrop = .3; }
    else { r.st = 'park'; r.idle = 0; r.task = null; }
  }
  function aheadGap(r: Mover, from = 0, look0 = 0) { // path distance to the nearest robot sitting on my path ahead (same lane)
    const P = r.path!, look = look0 || GAPD + r.v * r.v / (2 * DEC) + 1.2; let best = 1e9; if (!from) r.blk = null;
    for (const o of FS.BRK.OBST.length ? (robots as Mover[]).concat(FS.BRK.OBST) : robots) { if (o === r || o.shoulder || (o.towed && r.isTruck) || (o.dying && o.scale < .3) || (r.isTruck && o.blk === r)) continue; // shoulder: broken robot off the lane; OBST: tow truck; a robot that waits for the truck (crossing or merging with it) cannot be waited for in turn: the truck goes first, sepHold keeps the distance
      const c = pathAt(P, r.s + from + look / 2, r.pi); if (Math.abs(o.x - c[0]) > look / 2 + 1.5 || Math.abs(o.z - c[1]) > look / 2 + 1.5) continue;
      for (let d = from + .35; d <= from + look; d += .15) { const p = pathAt(P, r.s + d, r.pi); if ((p[0] - o.x) ** 2 + (p[1] - o.z) ** 2 < LAT * LAT) { if (d < best) { best = d; if (!from) r.blk = o; } break; } } }
    return best;
  }
  function mergeStop(r: Mover) { // leaving a lay-by: yield to traffic only when it would reach the merge point before (or right after) me; returns the stop line (path s) or 1e9
    while (r.mi < r.Ms.length && r.s > r.Ms[r.mi].s - .05) r.mi++;
    if (r.mi >= r.Ms.length) return 1e9; const m = r.Ms[r.mi], line = Math.max(.05, m.s - 1.7); // far enough back that the robot waiting here stays clear of the lane (>= the robot length)
    if (r.s > line + .05) return 1e9; // past the stop line: committed
    const dm = Math.max(0, m.s - r.s), tm = (-r.v + Math.sqrt(r.v * r.v + 2 * ACC * dm)) / ACC; // my time to the merge point (accelerating)
    for (const o of FS.BRK.OBST.length ? (robots as Mover[]).concat(FS.BRK.OBST) : robots) { if (o === r || o.st !== 'go' || o.wait || o.dying) continue;
      const ox = m.x - o.x, oz = m.z - o.z, od = Math.hypot(ox, oz); if (od > 8 || od < .05 || (o.v < .2 && od > 1.5)) continue;
      if ((ox * o.hx + oz * o.hz) / od < .5) continue;
      let behind = false; // o's own path runs into me before the merge point: it follows me, no conflict
      for (let d = .3; d <= od + 1 && o.path; d += .2) { const p = pathAt(o.path, o.s + d, o.pi); if ((p[0] - r.x) ** 2 + (p[1] - r.z) ** 2 < LAT * LAT) { behind = true; break; } if ((p[0] - m.x) ** 2 + (p[1] - m.z) ** 2 < .25) break; }
      if (behind) continue;
      if (od / Math.max(o.v, .7) < tm + .55 + (r.v < .3 ? .2 : 0)) return line; } // it gets there first, or less than ~1 s behind me
    return 1e9;
  }
  function onTrackAhead(r: Robot, o: Mover, upto: number) { // o sits on my path ahead, heading my way: plain following, the gap keeps us apart
    for (let d = .2; d <= upto; d += .2) { const p = pathAt(r.path, r.s + d, r.pi), q = pathAt(r.path, r.s + d + .2, r.pi);
      if ((p[0] - o.x) ** 2 + (p[1] - o.z) ** 2 < .3) { const hx = q[0] - p[0], hz = q[1] - p[1], l = Math.hypot(hx, hz) || 1; return (hx * o.hx + hz * o.hz) / l > .7; } }
    return false;
  }
  function boxFree(r: Robot, j: BoxHold) { // conflict-zone lock: only movements whose remaining footprints cross (or merge ahead of me) exclude each other
    if (FS.BRK.OBST.length) { const T = FS.BRK.OBST[0]; if (T.path) { // the tow truck holds no box itself: wait while it is in, or about to cross, this one (unless I sit on its path: then it follows me)
      let ahead = false, hit = false; for (let d = 0; d <= 6; d += .3) { const pt = pathAt(T.path, T.s + d, T.pi); if ((pt[0] - r.x) ** 2 + (pt[1] - r.z) ** 2 < .5) { ahead = true; break; }
        if (d <= 3.6 && !hit) for (const q of j.fp) if ((pt[0] - q[1]) ** 2 + (pt[1] - q[2]) ** 2 < 1.7) { hit = true; break; } }
      if (hit && !ahead) return false; } }
    for (const h of j.n.hs) { const o = h.r; if (o === r) continue; if (!robots.includes(o as Robot)) { j.n.hs.delete(h); continue; }
      const rest = h.fp.filter(q => q[0] > o.s - .6); if (!rest.length) { j.n.hs.delete(h); continue; }
      let hit = false; for (const p of j.fp) { for (const q of rest) if ((p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2 < .81) { hit = true; break; } if (hit) break; }
      if (hit && !onTrackAhead(r, o, j.b - r.s + 1)) return false; }
    return true;
  }
  function rbStop(r: Mover) { // roundabout yield: enter only when no robot on the ring will pass my entry soon, and the ring is not crowded
    const v = (r.RB || []).find(v => !v.done && r.s < v.b + .3); if (!v) return 1e9; if (r.s > v.b) { v.done = true; return 1e9; }
    if (r.s >= v.a - .05) return 1e9; if (v.a - r.s > r.v * r.v / (2 * DEC) + 1.2) return 1e9; // committed, or still far
    const n = v.n, TAU = 2 * Math.PI; let inside = 0;
    for (const o of FS.BRK.OBST.length ? (robots as Mover[]).concat(FS.BRK.OBST) : robots) { if (o === r || (o.dying && o.scale < .3) || o.st !== 'go' || !o.RB) continue; const w = o.RB.find(w => w.n === n && !w.done && o.s >= w.a - .05 && o.s <= w.b); if (!w) continue;
      inside++; if (o.s > w.q) continue; // already leaving the ring
      const ph = Math.atan2(o.z - n.z, o.x - n.x), up = ((ph - v.ai) % TAU + TAU) % TAU, rem = ((ph - w.ao) % TAU + TAU) % TAU; // circulation runs toward decreasing angle
      if (up < Math.min(rem + .5, 2.4) || up > TAU - .55) return v.a - .05; }
    return inside >= 4 ? v.a - .05 : 1e9;
  }
  function boxStop(r: Robot) { // junction boxes: enter when no crossing movement holds the box (and any box right after it) and there is room behind it
    for (const j of r.J) if (j.held && r.s - .5 > j.b) { j.n.hs.delete(j); j.held = false; j.done = true; }
    for (const j of r.J) if (j.held) j.fp = j.fp.filter(q => q[0] > r.s - .6); // release the part already cleared
    const k = r.J.findIndex(j => !j.held && !j.done); if (k < 0) return 1e9;
    const j = r.J[k]; if (j.a - r.s > r.v * r.v / (2 * DEC) + 1.2) return 1e9;
    const ch = [j]; for (let m = k + 1; m < r.J.length && r.J[m].a < ch[ch.length - 1].b + 2.5; m++) ch.push(r.J[m]);
    const end = ch[ch.length - 1].b, room = end + 1.4 > r.path.len || aheadGap(r, end - r.s, 1.4) > 1e8;
    if (room && ch.every(c => boxFree(r, c))) { for (const c of ch) { c.n.hs.add(c); c.held = true; } return 1e9; }
    return j.a - .6;
  }
  const MIND = .96, MINF = .93; // robot length .92 plus a little; MINF: the closest a robot may ever come (hard floor, above the .92 robot length)
  function sepHold(r: Mover, dt: number, md = MIND) { // would my next step bring me closer than md to a robot ahead of me (any state)?
    const P = r.path!, pc = pathAt(P, Math.min(P.len, r.s + r.v * dt), r.pi);
    for (const o of FS.BRK.OBST.length ? (robots as Mover[]).concat(FS.BRK.OBST) : robots) { if (o === r || (o.dying && o.scale < .3) || ((o.towed || o.shoulder) && r.isTruck)) continue;
      const dx = o.x - r.x, dz = o.z - r.z; if (Math.abs(dx) > md + .6 || Math.abs(dz) > md + .6) continue;
      const d2 = Math.hypot(o.x - pc[0], o.z - pc[1]); if (d2 >= md || d2 > Math.hypot(dx, dz) - 1e-4 || dx * (r.hx || 0) + dz * (r.hz || 0) < -.25) continue;
      if (o.blk === r && d2 >= MINF && (r.isTruck || (!o.isTruck && r.id < o.id))) continue; // two robots holding each other (abreast on lanes .94 apart, or a robot crossing the tow truck): the truck, then the lower id, creeps on, never below the hard floor
      r.blk = o; return true; }
    return false;
  }
  function stepRobot(r: Robot, dt: number) {
    const P = r.path, top = !r.isTruck && !(r.load && r.load.length) ? VMAX * 1.3 : VMAX; let vA = top; const brake = top * top / (2 * ACC) + .5; // an empty robot drives 30 % faster than a loaded one; corner caps stay
    if (r.back > 0) { // backing off: reverse along the path (slowly), stop when something is right behind
      const ds = Math.min(r.back, Math.min(r.s, 1.0 * dt)); let clear = ds > 1e-6;
      if (clear) { const pc = pathAt(P, r.s - ds, r.pi); for (const o of robots) { if (o === r || (o.dying && o.scale < .3)) continue; const dx = o.x - r.x, dz = o.z - r.z;
        if (Math.abs(dx) < MIND + .6 && Math.abs(dz) < MIND + .6 && Math.hypot(o.x - pc[0], o.z - pc[1]) < MIND && Math.hypot(o.x - pc[0], o.z - pc[1]) < Math.hypot(dx, dz) - 1e-4) { clear = false; break; } } }
      r.v = 0; r.why = 'r'; r.wait = false; if (!clear) { r.back = 0; return; }
      r.s -= ds; r.back -= ds; while (r.pi > 0 && P.cum[r.pi] > r.s) r.pi--;
      const a = P.pts[r.pi], b = P.pts[r.pi + 1] || a, sl = (P.cum[r.pi + 1] ?? P.cum[r.pi]) - P.cum[r.pi], u = sl > 1e-6 ? (r.s - P.cum[r.pi]) / sl : 1; r.x = a[0] + (b[0] - a[0]) * u; r.z = a[1] + (b[1] - a[1]) * u; return; }
    for (let j = r.pi + 1; j < P.pts.length; j++) { const ds = P.cum[j] - r.s; if (ds > brake) break; const cj = P.cap[j] >= VMAX ? top : P.cap[j]; vA = Math.min(vA, Math.sqrt(cj * cj + 2 * ACC * Math.max(0, ds))); }
    vA = Math.max(vA, .35); // creep speed so the final approach always ends
    if (r.force > 0) { // "Drive" from the robot menu: ignore yields, boxes and spacing for a moment, so a jam (a full roundabout) clears
      r.force -= dt; r.why = 'd'; r.wait = false; r.blk = null; r.stillT = 0;
      for (const j of r.J) if (!j.held && !j.done && r.s > j.a - .6) j.done = true; // boxes driven through without a lock never stop me afterwards
      r.v = Math.min(Math.min(vA, VC), r.v + ACC * dt); }
    else { r.why = ''; r.wait = false; const g = aheadGap(r); if (g < 1e8) { const vg = Math.sqrt(2 * DEC * .8 * Math.max(0, g - GAPD)); if (vg < vA) { vA = vg; r.why = 'f'; } }
    const ms = mergeStop(r); if (ms < 1e8) { const vm = Math.sqrt(2 * DEC * Math.max(0, ms - r.s)); if (vm < vA) { vA = vm; r.why = 'm'; } r.wait = true; }
    const bs = boxStop(r); if (bs < 1e8) { const vb = Math.sqrt(2 * DEC * Math.max(0, bs - r.s)); if (vb < vA) { vA = vb; r.why = 'b'; } r.wait = true; }
    const ys = rbStop(r); if (ys < 1e8) { const vy = Math.sqrt(2 * DEC * Math.max(0, ys - r.s)); if (vy < vA) { vA = vy; r.why = 'y'; } r.wait = true; }
    r.v = r.v < vA ? Math.min(vA, r.v + ACC * dt) : Math.max(vA, r.v - DEC * dt);
    if (r.v > 0 && sepHold(r, dt)) { r.v = 0; r.why = 'h'; return; } } // hard guard: never close in on another robot (or the tow truck) below the robot length
    r.s = Math.min(P.len, r.s + r.v * dt);
    while (r.pi < P.pts.length - 2 && P.cum[r.pi + 1] <= r.s) r.pi++;
    const a = P.pts[r.pi], b = P.pts[r.pi + 1] || a, sl = (P.cum[r.pi + 1] ?? P.cum[r.pi]) - P.cum[r.pi], u = sl > 1e-6 ? (r.s - P.cum[r.pi]) / sl : 1;
    r.x = a[0] + (b[0] - a[0]) * u; r.z = a[1] + (b[1] - a[1]) * u;
    if (sl > 1e-6) { r.hx = (b[0] - a[0]) / sl; r.hz = (b[1] - a[1]) / sl; const yt = Math.atan2(-r.hz, r.hx); let dy = yt - r.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); r.yaw += dy * (1 - Math.exp(-12 * dt)); }
    if (r.s >= P.len - 1e-4) arrive(r);
  }
  const inBay = (r: Robot) => r.st === 'park';
  function spawnRobot() { // a new robot appears on a free charging spot
    roads(); const used = new Set(robots.map(r => r.ii)); let ii = 0; while (used.has(ii)) ii++; if (ii >= NB) return;
    const i = spotClaim.findIndex((c, k) => c === null && !robots.some(o => Math.hypot(o.x - NET.spots[k].spot[0], o.z - NET.spots[k].spot[1]) < 1.3)); if (i < 0) return; const S = NET.spots[i];
    const r = { id: rid++, ii, x: S.spot[0], z: S.spot[1], yaw: Math.atan2(-S.e.h[1], S.e.h[0]), hx: S.e.h[0], hz: S.e.h[1], v: 0, st: 'park', lift: 0, load: [], at: { kind: 'park', i }, task: null, Ms: [], mi: 0, J: [],
      born: 0, dying: 0, idle: 0, scale: .001, ph: hashf('r' + ii), q: new THREE.Quaternion(), t: 0 } as Partial<Robot> as Robot;
    spotClaim[i] = r; robots.push(r);
  }
  spawnRobot(); spawnRobot();
  function robotsFrame(dt: number, t: number) {
    fleetT += dt;
    if (fleetT >= 1) { // fleet size follows dock throughput and backlog: 2..12 robots
      rateEMA = rateEMA * .85 + (FS.rateAcc / fleetT) * .15; FS.rateAcc = 0; fleetT = 0;
      let backlog = 0; for (const dk of docks) if (dk) backlog += Math.max(0, dk.queue.length - dk.reserved);
      FS.fleetWant = clamp(2 + Math.ceil(rateEMA * 24 / CARRY) + Math.floor(backlog / 6), 2, NB);
      const alive = robots.filter(r => !r.dying).length;
      if (alive < FS.fleetWant) spawnRobot();
      else if (alive > FS.fleetWant) { const r = robots.filter(r => !r.dying && inBay(r) && r.idle > 4).sort((a, b) => a.x - b.x)[0]; if (r) r.dying = 1e-4; } // queue tail leaves
    }
    roads(); const busy = anyCrates();
    if (busy) for (const r of robots) { if (r.dying || r.born < 1) continue; // crates waiting: parked robots leave, robots heading home turn round to a dock
      if (r.st === 'park') { const dk = bestDock(r); if (dk) assignPick(r, dk); }
      else if (r.st === 'go' && r.task && r.task.kind === 'home' && (r.rpT = (r.rpT || 0) + dt) > .4 && !inBox(r)) { r.rpT = 0; const H = hereStop(r); if (!H) continue;
        const at = r.at; r.at = H; const dk = bestDock(r); if (!dk) { r.at = at; continue; } if (spotClaim[r.task.i] === r) spotClaim[r.task.i] = null; assignPick(r, dk); } }
    for (let k = robots.length - 1; k >= 0; k--) {
      const r = robots[k];
      if (r.born < 1) r.born = Math.min(1, r.born + dt * 2);
      if (r.dying) { r.dying += dt; if (r.dying > .6) { for (const n in RIM) RIM[n as keyof typeof RIM].setMatrixAt(r.ii, Z0); leaveSpot(r); freeBoxes(r); robots.splice(k, 1); continue; } }
      r.scale = easeOut(r.born) * (r.dying ? 1 - easeIO(Math.min(1, r.dying / .6)) : 1);
      if (r.st === 'park') { r.idle += dt; r.lift = damp(r.lift, 0, 4, dt); }
      else if (r.st === 'go') { stepRobot(r, dt);
        if (r.st === 'go' && (busy || (r.task && r.task.kind !== 'home')) && r.v < .05) { if ((r.stillT = (r.stillT || 0) + dt) > 3) { r.stillT = 0; unstick(r); } } else r.stillT = 0;
        if (r.st === 'go' && r.task && r.task.kind === 'drop') { const left = r.path.len - r.s;
          if (left < 8.5 && r.load.length && (r.dropT = (r.dropT || 0) + dt) >= .18) { r.dropT = 0; const c = r.load.pop()!; c.st = 'drop'; c.t = 0; c.from = c.w.clone(); c.robot = null!;
            c.to = new THREE.Vector3(clamp(r.x * .4, -2.4, 2.4) + (Math.random() - .5) * 1.2, pileTop(), (r.task as DropTask).side * (1.4 + Math.random() * 1.8)); }
          if (!r.load.length && left < 5) { const T = r.task, e = NET.strips[T.side][T.k]; dropClaim.set(T.key, Math.max(0, (dropClaim.get(T.key) || 0) - 1)); r.at = { kind: 'drop', side: T.side, k: T.k, t: eProj(e, r.x, r.z) }; r.dropT = 0; afterTask(r); } } if (r.task && r.task.kind === 'home' && r.v < .05) r.idle += dt; else r.idle = 0; r.lift = damp(r.lift, r.load.length ? 1 : 0, 4, dt); }
      else if (r.st === 'load') {
        r.t += dt; r.lift = damp(r.lift, r.t < .5 ? 0 : 1, 8, dt);
        if (!r.took && r.t >= .2) { r.took = true; const dk = (r.task as PickTask).dk; dk.reserved -= (r.task as PickTask).k; const k2 = Math.min(CARRY, dk.queue.length); // first come, first served: fill up to capacity (later robots take what is left or move on)
          for (let n = 0; n < k2; n++) { const c = dk.queue.shift()!; c.st = 'deck'; c.t = 0; c.from = c.w.clone(); c.robot = r; c.slot = r.load.length; c.dock = null!; r.load.push(c); } }
        if (r.t >= .75) { (r.task as PickTask).dk.claims!--; if (r.load.length) goDrop(r); else afterTask(r); }
      } else if (r.st === 'unload') {
        r.t += dt;
        while (r.load.length && r.t >= r.nextDrop) { const c = r.load.pop()!; c.st = 'drop'; c.t = 0; c.from = c.w.clone(); c.robot = null!;
          c.to = new THREE.Vector3(clamp(r.x * .4, -2.4, 2.4) + (Math.random() - .5) * 1.6, pileTop(), (r.task as DropTask).side * (1.4 + Math.random() * 1.8)); r.nextDrop += .22; }
        r.lift = damp(r.lift, r.load.length ? 1 : 0, 5, dt);
        if (!r.load.length && r.t >= r.nextDrop + .25) { dropClaim.set((r.task as DropTask).key, Math.max(0, (dropClaim.get((r.task as DropTask).key) || 0) - 1)); afterTask(r); }
      }
      r.q.setFromAxisAngle(YAX, r.yaw); mP.set(r.x, 0, r.z); mS.setScalar(Math.max(.001, r.scale)); mM.compose(mP, r.q, mS);
      RIM.skirt.setMatrixAt(r.ii, mM); RIM.body.setMatrixAt(r.ii, mM); RIM.light.setMatrixAt(r.ii, mM);
      mP.y = r.lift * .12 * r.scale; mM.compose(mP, r.q, mS); RIM.deck.setMatrixAt(r.ii, mM);
      if (r.st === 'go' && !(r.task && r.task.kind === 'home' && r.v < .05)) tc.copy(AMBER).multiplyScalar(((t * 2.2 + r.ph) % 1) < .5 ? 3 : .25);
      else if (r.st === 'load' || r.st === 'unload') tc.copy(CYAN).multiplyScalar(2.4);
      else tc.copy(GREEN).multiplyScalar(.9 + Math.sin(t * 2 + r.ph * 6) * .5);
      RIM.light.setColorAt(r.ii, tc);
    }
    for (const n in RIM) RIM[n as keyof typeof RIM].instanceMatrix.needsUpdate = true; RIM.light.instanceColor!.needsUpdate = true;
  }
  const pileTop = () => .06 + Math.ceil(Math.max(1, FS.shown) / (STK.nx * STK.nz)) * .52 + .1;
  return { RIM, robots, ACC, DEC, GAPD, deckSpot, dropClaim, stopOf, routePts, buildPath, pathAt, freeBoxes, eProj, goTo, distTo, hereStop, inBox, leaveSpot, afterTask, goDrop, aheadGap, mergeStop, rbStop, sepHold, robotsFrame };
}
