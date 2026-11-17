// The dog walkers' graph (dogs.ts WalkNet) from the sidewalks roads.ts draws: walkLines() hands over every sidewalk and
// footpath piece as it is drawn (straight runs, the arcs round each roundabout, the shops' and the park's paths) and the
// zebras over the roundabout arms. Here they become one graph: piece ends that meet (within SNAP) are one node, a zebra's
// two ends are tied into the sidewalks it joins, a run that stops at a dropped kerb (an in or out road crossing it) is
// joined to the run on the far side, and straight runs and arcs are thinned to the nodes that matter. Only the largest
// connected part is kept, so every walker can reach every way out. Built once per road network (index.ts rebuilds it
// when OS.net.key changes).
import type { P2 } from '../common/types.js';
import type { WalkNet, WalkDoor } from './dogs.js';

/** What roads.ts hands over: sidewalk and footpath centre lines, zebra lines (end to end over the road), sniff spots. */
export interface WalkLines { lines: P2[][]; cross: P2[][]; spots: P2[]; ends?: (p: P2) => boolean; zebras?: Zebra[] }
/** A zebra's stripes as a box: centre x, z; the road's direction (unit x, z); half its length along the road; half its width across (crossings.ts). */
export type Zebra = [number, number, number, number, number, number];
/** A door: path from the door out to a point on (or near) a sidewalk. */
export interface DoorIn { path: P2[] }

const SNAP = .35, TEE = .9, JOIN = 2.3, KERB = 10, ATTACH = 2.6, TURN = .26, SEGMAX = 24;

/** The road surface from the lanes' centre lines (each lane hw wide either side of its line): road(x, z, pad) is true within
 *  hw + pad (pad up to 1) of a lane. The dogs keep off it unless their walker is on it too (a zebra, a dropped kerb; dogs.ts). */
export function roadTest(lanes: P2[][], hw = .95): (x: number, z: number, pad?: number) => boolean {
  const C = 4, H = new Map<number, number[]>(), S: number[] = [], key = (i: number, k: number) => (i + 8192) * 16384 + k + 8192, r = hw + 1;
  for (const P of lanes) for (let i = 1; i < P.length; i++) { const [ax, az] = P[i - 1], [bx, bz] = P[i], n = S.length; S.push(ax, az, bx, bz);
    for (let gi = Math.floor((Math.min(ax, bx) - r) / C); gi <= Math.floor((Math.max(ax, bx) + r) / C); gi++) for (let gk = Math.floor((Math.min(az, bz) - r) / C); gk <= Math.floor((Math.max(az, bz) + r) / C); gk++) {
      const kk = key(gi, gk); let L = H.get(kk); if (!L) H.set(kk, L = []); L.push(n); } }
  return (x, z, pad = 0) => { const L = H.get(key(Math.floor(x / C), Math.floor(z / C))); if (!L) return false; const m = hw + pad;
    for (const n of L) { const ax = S[n], az = S[n + 1], dx = S[n + 2] - ax, dz = S[n + 3] - az, l = dx * dx + dz * dz, t = l ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l)) : 0;
      if (Math.hypot(x - ax - t * dx, z - az - t * dz) < m) return true; }
    return false; };
}

export function walkNet(W: WalkLines, doorsIn: DoorIn[] = [], half = .7, y = .07): WalkNet {
  const X: number[] = [], Z: number[] = [], adj: Set<number>[] = [], H = new Map<number, number[]>(), C = 2;
  const key = (i: number, k: number) => (i + 8192) * 16384 + k + 8192;
  const node = (x: number, z: number): number => {
    const i0 = Math.floor(x / C), k0 = Math.floor(z / C);
    for (let i = i0 - 1; i <= i0 + 1; i++) for (let k = k0 - 1; k <= k0 + 1; k++) for (const n of H.get(key(i, k)) || []) if (Math.hypot(X[n] - x, Z[n] - z) < SNAP) return n;
    const n = X.length; X.push(x); Z.push(z); adj.push(new Set()); const kk = key(i0, k0); let L = H.get(kk); if (!L) H.set(kk, L = []); L.push(n); return n; };
  const link = (a: number, b: number) => { if (a !== b) { adj[a].add(b); adj[b].add(a); } };
  const unlink = (a: number, b: number) => { adj[a].delete(b); adj[b].delete(a); };
  const chain = (P: P2[]) => { let p = -1; for (const [x, z] of P) { const n = node(x, z); if (p >= 0) link(p, n); p = n; } };
  for (const P of W.lines) if (P.length >= 2) chain(P);
  // tie a point into the graph: an existing node near it, else split the nearest edge there (a new node on it)
  const attach = (x: number, z: number, max: number, skip = -1): number => {
    let bd = max, ba = -1, bb = -1, bu = 0;
    for (let a = 0; a < X.length; a++) for (const b of adj[a]) { if (b < a || a === skip || b === skip) continue; const dx = X[b] - X[a], dz = Z[b] - Z[a], l2 = dx * dx + dz * dz || 1e-9, u = Math.max(0, Math.min(1, ((x - X[a]) * dx + (z - Z[a]) * dz) / l2)), d = Math.hypot(X[a] + dx * u - x, Z[a] + dz * u - z);
      if (d < bd) { bd = d; ba = a; bb = b; bu = u; } }
    if (ba < 0) return -1;
    const L = Math.hypot(X[bb] - X[ba], Z[bb] - Z[ba]);
    if (bu * L < SNAP) return ba; if ((1 - bu) * L < SNAP) return bb;
    const n = X.length; X.push(X[ba] + (X[bb] - X[ba]) * bu); Z.push(Z[ba] + (Z[bb] - Z[ba]) * bu); adj.push(new Set()); unlink(ba, bb); link(ba, n); link(n, bb); return n; };
  // zebras: both ends into the sidewalks they join
  for (const P of W.cross) { if (P.length < 2) continue; const a = attach(P[0][0], P[0][1], 1.2), b = attach(P[P.length - 1][0], P[P.length - 1][1], 1.2); if (a >= 0 && b >= 0) link(a, b); }
  // loose ends: ends close together are one corner (an arc meeting a straight run); a run that stops short, in line with another
  // that starts again a few metres on (a dropped kerb over an in or out road), goes on across it
  const deg1 = () => adj.map((s, i) => s.size === 1 ? i : -1).filter(i => i >= 0);
  // a path that ends on (or just short of) the side of another (a park path on the shops' footpath): a T
  for (const n of deg1()) { const m = attach(X[n], Z[n], TEE, n); if (m >= 0 && !adj[n].has(m)) link(n, m); }
  const outDir = (n: number): P2 => { const m = [...adj[n]][0], dx = X[n] - X[m], dz = Z[n] - Z[m], l = Math.hypot(dx, dz) || 1; return [dx / l, dz / l]; };
  { const E = deg1(), used = new Set<number>();
    for (const a of E) { if (used.has(a)) continue; let best = -1, bs = Infinity; const [ax, az] = outDir(a);
      for (const b of E) { if (b === a || used.has(b) || adj[a].has(b)) continue; const dx = X[b] - X[a], dz = Z[b] - Z[a], d = Math.hypot(dx, dz); if (d > KERB) continue;
        const [bx, bz] = outDir(b), al = d > 1e-6 ? (dx * ax + dz * az) / d : 1, bl = d > 1e-6 ? -(dx * bx + dz * bz) / d : 1;
        const ok = d < JOIN || (al > .97 && bl > .97); if (ok && d < bs) { bs = d; best = b; } }
      if (best >= 0) { link(a, best); used.add(a); used.add(best); } } }
  // doors: their last point into the graph
  const doors: WalkDoor[] = [];
  for (const D of doorsIn) { const p = D.path[D.path.length - 1]; if (!p) continue; const n = attach(p[0], p[1], ATTACH); if (n >= 0) doors.push({ path: D.path, node: n }); }
  const keep = new Uint8Array(X.length); for (const d of doors) keep[d.node] = 1;
  // thin: drop a node between two edges that run on nearly straight (straight runs, arcs in steps of about TURN rad)
  for (let pass = 0; pass < 3; pass++) for (let n = 0; n < X.length; n++) { if (keep[n] || adj[n].size !== 2) continue; const [a, b] = [...adj[n]];
    if (adj[a].has(b)) continue; const h1 = Math.atan2(X[n] - X[a], Z[n] - Z[a]), h2 = Math.atan2(X[b] - X[n], Z[b] - Z[n]), d = Math.abs(((h2 - h1 + 3 * Math.PI) % (2 * Math.PI)) - Math.PI);
    if (d > TURN || Math.hypot(X[b] - X[a], Z[b] - Z[a]) > SEGMAX) continue; unlink(a, n); unlink(n, b); link(a, b); }
  // the largest connected part
  const comp = new Int32Array(X.length).fill(-1), size: number[] = [];
  for (let s = 0; s < X.length; s++) { if (comp[s] >= 0 || !adj[s].size) continue; const c = size.length; let m = 0; const st = [s]; comp[s] = c;
    while (st.length) { const u = st.pop()!; m++; for (const v of adj[u]) if (comp[v] < 0) { comp[v] = c; st.push(v); } } size.push(m); }
  const big = size.indexOf(Math.max(0, ...size)), map = new Int32Array(X.length).fill(-1), nodes: P2[] = [];
  for (let n = 0; n < X.length; n++) if (comp[n] === big && big >= 0) { map[n] = nodes.length; nodes.push([X[n], Z[n]]); }
  const edges: [number, number][] = []; for (let a = 0; a < X.length; a++) if (map[a] >= 0) for (const b of adj[a]) if (b > a && map[b] >= 0) edges.push([map[a], map[b]]);
  const ends = W.ends ? nodes.map((p, i) => W.ends!(p) ? i : -1).filter(i => i >= 0) : undefined;
  return { nodes, edges, ends, doors: doors.filter(d => map[d.node] >= 0).map(d => ({ path: d.path, node: map[d.node] })), spots: W.spots, half, y };
}
