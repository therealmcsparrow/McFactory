// The Dunes view's site plan and ground, as pure math. No imports, so test/ can load the built module on its own.
// The depot settlement sits at the origin. Farms take fixed slots on two rings around it and face outward: the
// homestead and the canister pad are on the depot side, the condenser rows grow away from the depot. The dunes are a
// few crossed, sharp-crested sine ridges, flattened under the settlement and under every farm slot.
// It also holds what keeps anything from walking through anything: the obstacles (settlement buildings, each farm's
// homestead, field and pad), a visibility-graph router for the warden squads, the farmhands' fixed path round the
// homestead to their tower, and the clear spots where sleds park and duels happen.

export const MAXF = 16, MAXROW = 5, CAP = 8, CAN_TOK = 20000, PILE = 250, PADCAP = 36;
/** Farm-local layout (+z points away from the depot): rows, towers in a row, the pad, the homestead. */
export const ROW0 = 1.2, ROWDZ = 3.2, TOWDX = 2.2, PADZ = -12, HOMEZ = -5;
export const FARM_HX = 10, FARM_Z0 = -14, FARM_Z1 = 15.5;
export const SETTLE_R = 34, PATROL_R = 84, WALKER_R = 134;

/** A farm slot: centre, outward unit vector f, farm-local +x unit vector p (world), heading angle. */
export interface Slot { x: number; z: number; fx: number; fz: number; px: number; pz: number; a: number }
const RINGS: [number, number, number][] = [[62, 6, 0], [104, 10, .5]]; // radius, slots, angle offset in slots
export const SLOTS: Slot[] = [];
for (const [r, n, off] of RINGS) for (let i = 0; i < n; i++) {
  const a = (i + off) / n * Math.PI * 2 + .4, fx = Math.cos(a), fz = Math.sin(a);
  SLOTS.push({ x: fx * r, z: fz * r, fx, fz, px: fz, pz: -fx, a }); // p = local +x of a group turned by atan2(fx, fz)
}

/** World [x, z] of a farm-local point. */
export function farmToWorld(s: Slot, lx: number, lz: number): [number, number] { return [s.x + lx * s.px + lz * s.fx, s.z + lx * s.pz + lz * s.fz]; }

const sstep = (a: number, b: number, x: number) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** 1 on open sand, 0 under the settlement and every farm slot, eased in between. */
export function openAt(x: number, z: number): number {
  let f = sstep(SETTLE_R, SETTLE_R + 8, Math.hypot(x, z));
  const zc = (FARM_Z0 + FARM_Z1) / 2, zh = (FARM_Z1 - FARM_Z0) / 2;
  for (const s of SLOTS) {
    const dx = x - s.x, dz = z - s.z, u = dx * s.px + dz * s.pz, v = dx * s.fx + dz * s.fz;
    const d = Math.hypot(Math.max(Math.abs(u) - FARM_HX, 0), Math.max(Math.abs(v - zc) - zh, 0));
    if (d < 9) f = Math.min(f, sstep(1, 9, d));
  }
  return f;
}
/** The bare dunes (>= 0): sharp crests, round troughs, taller toward the horizon. */
export function duneAt(x: number, z: number): number {
  const w = x + 7 * Math.sin(z * .027);
  const r1 = 1 - Math.abs(Math.sin(w * .07 + z * .03));
  const r2 = 1 - Math.abs(Math.sin(z * .05 - x * .022 + 1.7 + 2 * Math.sin(x * .013)));
  const ripple = .5 + .5 * Math.sin(x * .23 + z * .17);
  const d = Math.hypot(x, z), amp = .7 + .6 * sstep(30, 120, d) + 1.6 * sstep(120, 220, d);
  return amp * (2.4 * r1 * r1 + 1.1 * r2 + .25 * ripple);
}
export const heightAt = (x: number, z: number) => duneAt(x, z) * openAt(x, z);

/** Canister k on a farm pad, relative to the pad centre: [x, y, z] (4 x 3 per layer). */
export function padSpot(k: number): [number, number, number] {
  return [((k % 4) - 1.5) * .42, .22 + .45 * Math.floor(k / 12), (Math.floor(k / 4) % 3 - 1) * .42];
}
const LAYERS: [number, number][] = [[10, 8], [9, 7], [8, 6], [7, 5], [6, 4]]; // 80 + 63 + 48 + 35 + 24 = PILE
/** Canister i in the depot pile, relative to the yard centre: [x, y, z], a stepped pyramid. */
export function pileSpot(i: number): [number, number, number] {
  let L = 0; while (L < LAYERS.length - 1 && i >= LAYERS[L][0] * LAYERS[L][1]) { i -= LAYERS[L][0] * LAYERS[L][1]; L++; }
  const [nx, nz] = LAYERS[L];
  return [((i % nx) - (nx - 1) / 2) * .4, .22 + .44 * L, (Math.floor(i / nx) % nz - (nz - 1) / 2) * .4];
}
/** How many canisters the depot pile shows for the window total (log scale, at least 1 once there is anything). */
export function pileN(tokens: number): number { return tokens > 0 ? Math.max(1, Math.min(PILE, Math.round(PILE * Math.log10(1 + tokens / 1e5) / 4))) : 0; }

// ── the town's buildings (world x, z)
/** The depot hall in the middle of town: a round wall with a roof ring and an open centre; the canister pile stands inside
 * (the yard is the hall's floor) and sleds unload by hovering over the opening. The sleds park on the ring of pads round it. */
export const DEPOT_XZ: [number, number] = [0, 0], YARD_XZ: [number, number] = [0, 0], LAND_R = 11;
export const HALL_R = 6.4, HALL_H = 3.4, HALL_OPEN = 3.7;
/** The garrison hall: on the town edge, facing the gap between two inner farms, so its squads march straight out. */
const GA = 3.01;
export const GARRISON = { x: Math.cos(GA) * 29.5, z: Math.sin(GA) * 29.5, a: GA };
export const GARRISON_DOOR: [number, number] = [Math.cos(GA) * 32, Math.sin(GA) * 32];
export const GARRISON_OUT: [number, number] = [Math.cos(GA) * 40, Math.sin(GA) * 40];
/** The spaceport bays: round landing pads in the town, where ships come and go. */
export const PORT_R = 6.5;
export const PORTS: [number, number][] = [GA + Math.PI, GA + 1.3, GA - 1.3].map(a => [Math.cos(a) * 23, Math.sin(a) * 23]);
/** The radio mast: low enough for sleds to cruise over it. */
export const MAST: [number, number, number] = [-7.6, 4.4, 6.5];

/** A town building: centre, kind, width (local x) and depth (local z), yaw; its front (local +z) faces the town centre. */
export interface Bld { x: number; z: number; k: 'house' | 'dome' | 'shop' | 'cantina' | 'tank'; w: number; d: number; a: number; v: number }
const bldObs = (b: Bld): Obs => b.k === 'dome' || b.k === 'tank' ? { x: b.x, z: b.z, r: b.w / 2 } : { x: b.x, z: b.z, ux: Math.cos(b.a), uz: -Math.sin(b.a), hx: b.w / 2, hz: b.d / 2 };
export const BUILDINGS: Bld[] = [];
/** Everything in town that nobody walks through (and the sled pads keep clear of). */
export const TOWN_OBS: Obs[] = [];
{
  let s = 99; const R = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  const base: Obs[] = [{ x: 0, z: 0, r: HALL_R + .3 }, { x: MAST[0], z: MAST[1], r: .5 }, ...PORTS.map(([x, z]) => ({ x, z, r: PORT_R + .3 })),
    { x: GARRISON.x, z: GARRISON.z, ux: -Math.sin(GA), uz: Math.cos(GA), hx: 3.6, hz: 2.3 }];
  TOWN_OBS.push(...base);
  const add = (b: Bld) => { BUILDINGS.push(b); TOWN_OBS.push(bldObs(b)); };
  for (const [px, pz] of PORTS) { // two fuel tanks beside every bay
    const r = Math.hypot(px, pz), tx = -pz / r, tz = px / r;
    for (const k of [-1, 1]) { const x = px + tx * k * (PORT_R + 1.9) + px / r * 1.5, z = pz + tz * k * (PORT_R + 1.9) + pz / r * 1.5; add({ x, z, k: 'tank', w: 1.9, d: 1.9, a: 0, v: 0 }); }
  }
  const streets = Array.from({ length: 6 }, (_, i) => i / 6 * Math.PI * 2 + .4); // open streets toward the inner farms
  const ROWS: [number, number, Bld['k'][]][] = [[16, 5.4, ['shop', 'shop', 'cantina', 'shop']], [21.2, 5.2, ['shop', 'house', 'dome', 'shop']], [26.3, 5, ['house', 'dome', 'house']], [30.8, 4.9, ['dome', 'house', 'house']]];
  for (const [r, step, kinds] of ROWS) {
    const n = Math.floor(Math.PI * 2 * r / step);
    for (let i = 0; i < n; i++) {
      const a0 = (i + R() * .3) / n * Math.PI * 2, x = Math.cos(a0) * r, z = Math.sin(a0) * r;
      const k = kinds[Math.floor(R() * kinds.length)];
      const w = k === 'cantina' ? 5 : k === 'shop' ? 3 + R() * .6 : k === 'dome' ? 2.4 + R() * 1 : 2.5 + R() * .9, d = k === 'cantina' ? 4 : k === 'shop' ? 2.5 : k === 'dome' ? w : 2.3 + R() * .7;
      const rc = Math.hypot(w, d) / 2;
      if (r + rc > SETTLE_R - .4) continue;
      if (streets.some(sa => { const c = Math.cos(sa), sn = Math.sin(sa), along = x * c + z * sn; return along > 0 && Math.abs(-x * sn + z * c) < rc + 1.7; })) continue;
      if (TOWN_OBS.some(o => inside(o, x, z, rc + 1.1))) continue;
      add({ x, z, k, w, d, a: Math.atan2(-x, -z), v: Math.floor(R() * 4) });
    }
  }
  // what stands in front of a building (world.ts draws it): shop counters, awning poles, a dome's porch
  for (const b of BUILDINGS) {
    const ux = Math.cos(b.a), uz = -Math.sin(b.a), fx = Math.sin(b.a), fz = Math.cos(b.a);
    const at = (lx: number, lz: number, hx: number, hz: number): Obs => ({ x: b.x + lx * ux + lz * fx, z: b.z + lx * uz + lz * fz, ux, uz, hx, hz });
    if (b.k === 'shop' || b.k === 'cantina') for (const lx of [-b.w * .44, b.w * .44]) TOWN_OBS.push(at(lx, b.d / 2 + 1.1, .06, .06));
    if (b.k === 'shop') TOWN_OBS.push(at(b.w * .12, b.d / 2 + .3, b.w * .55 / 2, .23));
    if (b.k === 'dome') TOWN_OBS.push(at(0, b.w / 2 - .1, .45, .45));
  }
}
/** Where townsfolk go: a shop counter or a door, the plaza round the hall, the edge of a bay: [x, z, yaw to face]. */
export const TOWN_SPOTS: [number, number, number][] = [];
{
  for (const b of BUILDINGS) {
    if (b.k === 'tank') continue;
    const fx = Math.sin(b.a), fz = Math.cos(b.a), o = b.d / 2 + (b.k === 'shop' ? 1.25 : b.k === 'cantina' ? 1.1 : b.k === 'dome' ? 1.05 : .85);
    TOWN_SPOTS.push([b.x + fx * o, b.z + fz * o, Math.atan2(-fx, -fz)]);
  }
  for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2 + .2, x = Math.cos(a) * 8.7, z = Math.sin(a) * 8.7; TOWN_SPOTS.push([x, z, Math.atan2(-x, -z)]); }
  for (const [px, pz] of PORTS) { const r = Math.hypot(px, pz); for (const k of [-.5, 0, .5]) { const a = Math.atan2(pz, px) + Math.PI + k, x = px + Math.cos(a) * (PORT_R + 1.3), z = pz + Math.sin(a) * (PORT_R + 1.3); TOWN_SPOTS.push([x, z, Math.atan2(px - x, pz - z)]); } void r; }
  for (let i = TOWN_SPOTS.length - 1; i >= 0; i--) { const [x, z] = TOWN_SPOTS[i]; if (TOWN_OBS.some(o => inside(o, x, z, .6)) || Math.hypot(x, z) > SETTLE_R) TOWN_SPOTS.splice(i, 1); }
}

/** An obstacle on the ground: a circle, or a rectangle with half sizes hx along unit axis u and hz along (-uz, ux). */
export type Obs = { x: number; z: number; r: number } | { x: number; z: number; ux: number; uz: number; hx: number; hz: number };
type Rect = Extract<Obs, { ux: number }>;
export const SETTLE_OBS: Obs[] = TOWN_OBS;
function toLocal(o: Rect, x: number, z: number): [number, number] { const dx = x - o.x, dz = z - o.z; return [dx * o.ux + dz * o.uz, -dx * o.uz + dz * o.ux]; }
/** Is the point within m of the obstacle? */
export function inside(o: Obs, x: number, z: number, m = 0): boolean {
  if ('r' in o) return Math.hypot(x - o.x, z - o.z) < o.r + m;
  const [lx, lz] = toLocal(o, x, z); return Math.abs(lx) < o.hx + m && Math.abs(lz) < o.hz + m;
}
/** Does the segment a-b pass within m of the obstacle? (For rectangles, m grows the box.) */
export function segHits(o: Obs, ax: number, az: number, bx: number, bz: number, m = 0): boolean {
  if ('r' in o) {
    const dx = bx - ax, dz = bz - az, L = dx * dx + dz * dz, t = L ? Math.max(0, Math.min(1, ((o.x - ax) * dx + (o.z - az) * dz) / L)) : 0;
    return Math.hypot(ax + dx * t - o.x, az + dz * t - o.z) < o.r + m;
  }
  const [px, pz] = toLocal(o, ax, az), [qx, qz] = toLocal(o, bx, bz); let t0 = 0, t1 = 1;
  for (const [p, d, h] of [[px, qx - px, o.hx + m], [pz, qz - pz, o.hz + m]]) {
    if (Math.abs(d) < 1e-12) { if (Math.abs(p) >= h) return false; continue; }
    let a = (-h - p) / d, b = (h - p) / d; if (a > b) [a, b] = [b, a];
    t0 = Math.max(t0, a); t1 = Math.min(t1, b); if (t0 >= t1 - 1e-9) return false;
  }
  return true;
}

// ── a farm's obstacles, its guard posts and the sled's loading spot (farm-local x, z)
export const FIELD_ZC = ROW0 + (MAXROW - 1) * ROWDZ / 2, FIELD_HX = (CAP * TOWDX + 1.4) / 2, FIELD_HZ = (MAXROW * ROWDZ + .6) / 2;
/** Where a sled hovers to load, beside the pad; where farmhands go in and out; the lane outside the field. */
export const LOAD: [number, number] = [-3.3, PADZ - .4], DOOR_Z = HOMEZ - 4.9, LANE_X = 10.3;
export function farmObs(s: Slot): Obs[] {
  const [hx, hz] = farmToWorld(s, 0, HOMEZ), [fx, fz] = farmToWorld(s, 0, FIELD_ZC), [px, pz] = farmToWorld(s, -1.6, PADZ - .3);
  return [{ x: hx, z: hz, r: 4.8 }, { x: fx, z: fz, ux: s.px, uz: s.pz, hx: FIELD_HX, hz: FIELD_HZ }, { x: px, z: pz, ux: s.px, uz: s.pz, hx: 2.9, hz: 1.5 }];
}
/** Guard post i (0..3): a line beside the pad, in front of the homestead door; world [x, z]. */
export const postSpot = (s: Slot, i: number) => farmToWorld(s, 2.8 + i * .9, HOMEZ - 6.4);
/** Where a duel may happen: open sand in the gaps between the inner farms (not the garrison's gap). */
export const DUEL_SPOTS: [number, number][] = [0, 1, 3, 4, 5].map(i => { const a = (i + .5) / 6 * Math.PI * 2 + .4; return [Math.cos(a) * 50, Math.sin(a) * 50]; });
/** Obstacles for walkers, for the farms in these slots: one circle round the whole settlement, the farms, the duel grounds. */
export const walkObs = (slots: number[]): Obs[] => [{ x: 0, z: 0, r: SETTLE_R + 1 }, ...DUEL_SPOTS.map(([x, z]) => ({ x, z, r: 3 })), ...slots.flatMap(i => farmObs(SLOTS[i]))];

/** A farmhand's path from the homestead door to its spot behind tower (tx, tz), farm-local: out of the door, round the
 * dome on the tower's side, up the lane outside the field and along the aisle behind the tower's row. */
export function handPath(tx: number, tz: number): [number, number][] {
  const s = tx < 0 ? -1 : 1, az = tz + 1.6, fz = ROW0 - 2.4;
  return [[0, DOOR_Z], [s * 3.4, DOOR_Z - .3], [s * 5.4, HOMEZ - 2.2], [s * 5.4, fz], [s * LANE_X, fz], [s * LANE_X, az], [tx + .75, az], [tx + .75, tz + .6]];
}
/** The length of a path through its points. */
export function pathLen(p: [number, number][]): number { let L = 0; for (let i = 1; i < p.length; i++) L += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]); return L; }
/** The point at distance s along a path (clamped to its ends). */
export function pathAt(p: [number, number][], s: number): [number, number] {
  if (s <= 0 || p.length < 2) return p[0];
  for (let i = 1; i < p.length; i++) {
    const l = Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]);
    if (s <= l) { const k = l ? s / l : 1; return [p[i - 1][0] + (p[i][0] - p[i - 1][0]) * k, p[i - 1][1] + (p[i][1] - p[i - 1][1]) * k]; }
    s -= l;
  }
  return p[p.length - 1];
}

/** The sleds' parking spots on the landing ring, clear of every building and at least 3.2 apart. */
export const PARK: [number, number][] = [];
for (let k = 0; k < 126 && PARK.length < 8; k++) {
  const a = -.9 + k * .05, x = DEPOT_XZ[0] + Math.cos(a) * LAND_R, z = DEPOT_XZ[1] + Math.sin(a) * LAND_R;
  if (SETTLE_OBS.some(o => inside(o, x, z, 1.5)) || inside({ x: MAST[0], z: MAST[1], r: .3 }, x, z, 1.5) || PARK.some(([px, pz]) => Math.hypot(px - x, pz - z) < 3.2)) continue;
  PARK.push([x, z]);
}

/** A router over a fixed set of obstacles: a visibility graph on points just outside each one (margin m). route()
 * returns the waypoints after a, ending at b; an obstacle that a or b stands in is ignored for that end. */
export function makeNav(obs: Obs[], m = .7) {
  const pts: [number, number][] = [];
  for (const o of obs) {
    if ('r' in o) { const n = 10, R = (o.r + m + .15) / Math.cos(Math.PI / n); for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; pts.push([o.x + Math.cos(a) * R, o.z + Math.sin(a) * R]); } }
    else for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const lx = sx * (o.hx + m + .15), lz = sz * (o.hz + m + .15); pts.push([o.x + lx * o.ux - lz * o.uz, o.z + lx * o.uz + lz * o.ux]); }
  }
  const nodes = pts.filter(([x, z]) => !obs.some(o => inside(o, x, z, m)));
  const clear = (ax: number, az: number, bx: number, bz: number, skip?: Set<number>) => !obs.some((o, i) => !(skip && skip.has(i)) && segHits(o, ax, az, bx, bz, m));
  const n = nodes.length, adj: number[][] = nodes.map(() => []);
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) if (clear(nodes[i][0], nodes[i][1], nodes[j][0], nodes[j][1])) { adj[i].push(j); adj[j].push(i); }
  const inObs = (x: number, z: number) => new Set(obs.map((o, i) => inside(o, x, z, m) ? i : -1).filter(i => i >= 0));
  function route(ax: number, az: number, bx: number, bz: number): [number, number][] {
    const sa = inObs(ax, az), sb = inObs(bx, bz);
    if (clear(ax, az, bx, bz, new Set([...sa, ...sb]))) return [[bx, bz]];
    const dist = new Array<number>(n).fill(Infinity), prev = new Array<number>(n).fill(-1), done = new Array<boolean>(n).fill(false);
    for (let i = 0; i < n; i++) if (clear(ax, az, nodes[i][0], nodes[i][1], sa)) dist[i] = Math.hypot(nodes[i][0] - ax, nodes[i][1] - az);
    for (;;) {
      let u = -1; for (let i = 0; i < n; i++) if (!done[i] && dist[i] < Infinity && (u < 0 || dist[i] < dist[u])) u = i;
      if (u < 0) break; done[u] = true;
      for (const v of adj[u]) { const d = dist[u] + Math.hypot(nodes[v][0] - nodes[u][0], nodes[v][1] - nodes[u][1]); if (d < dist[v]) { dist[v] = d; prev[v] = u; } }
    }
    let best = -1, bd = Infinity;
    for (let i = 0; i < n; i++) if (dist[i] < Infinity) { const d = dist[i] + Math.hypot(bx - nodes[i][0], bz - nodes[i][1]); if (d < bd && clear(nodes[i][0], nodes[i][1], bx, bz, sb)) { bd = d; best = i; } }
    if (best < 0) return [[bx, bz]];
    const out: [number, number][] = [[bx, bz]]; for (let i = best; i >= 0; i = prev[i]) out.unshift([nodes[i][0], nodes[i][1]]);
    return out;
  }
  return { route, nodes, clear };
}

/** Greedy nearest pairing: for each target, the index of the source sent there (-1 if none left). */
export function assignNearest(from: [number, number][], to: [number, number][]): number[] {
  const pairs: [number, number, number][] = [];
  for (let i = 0; i < from.length; i++) for (let j = 0; j < to.length; j++) pairs.push([Math.hypot(from[i][0] - to[j][0], from[i][1] - to[j][1]), i, j]);
  pairs.sort((a, b) => a[0] - b[0]);
  const out = to.map(() => -1), used = new Set<number>();
  for (const [, i, j] of pairs) if (out[j] < 0 && !used.has(i)) { out[j] = i; used.add(i); }
  return out;
}
