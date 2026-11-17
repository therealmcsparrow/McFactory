// Shoppers on foot at the shops (buildings/shops.ts). They come in on the east footpath or at the far end of the north
// leg, walk the pavement (round the L's corner) to a shop door and go inside; 10 to 40 s later they come out and walk off
// the way they came or the other way. The shop's sliding door (shops.ts openDoor) opens as someone comes up to it, they
// walk through and are out of sight once behind the shop front; coming out, the door opens first, they step out from
// behind it, and it shuts after them. Drivers who park in the car park (vehicles/shop-visitor.ts) come through arrive:
// they walk from their spot and back to it. How many are about follows the busyness (busyness(state): running agents
// across all offices), up to the Shoppers on foot setting ('shopWalkers', 0..30, 0: none), and the shop windows light up
// with it. Setting 'shops' (window.CWFun): off removes the shoppers and turns the windows dark, at once.
// With reduced motion nobody walks: a few shoppers stand still at the shop windows, as many as the busyness asks for,
// and the doors stay shut.
// Purely for show: they walk on the shops' own footpaths only and are not checked against traffic.
//
// Everything works in the shops' local frame (the people are children of the shops group).
// Lanes: walkers keep right, 0.35 m off each path's centre line (in at the right half of a door, out at the left half).
// Spacing: a step that would bring a walker within GAP of another one is not taken (stepping away always is); the
// update runs one walker at a time, so nobody ever ends up inside someone else. Someone held up tries a step to the
// side; walkers who hold each other up in a ring let the highest rank go first while the others step back. Only after
// STUCKMAX s on one spot does someone walk on regardless (counted in stats().forced; 0 in 2 x 900 s stress runs at full busyness).
import * as THREE from 'three';
import { reduced } from '../common/dom.js';
import type { DashState, P2 } from '../common/types.js';
import type { OSAtBank } from './state.js';
import { addLegs, gait, gaitDip, walkSpeed } from './gait.js';
import { crowdOf, crowdId, CROWD_SHOP, type Plan } from './crowd.js';
import { SHOP_LOT, type Shops, type ShopSpot } from './buildings/shops.js';

/** What makeShoppers needs from OS (all there once makeProps has run). */
export type ShoppersOS = Pick<OSAtBank, 'G' | 'BODY' | 'mesh' | 'dA'>;

/** 0..1 from the snapshot: running agents across all offices, 0 → 0 and 12 or more → 1. */
export function busyness(state: Pick<DashState, 'projects'> | null | undefined): number {
  let n = 0; if (state) for (const p of state.projects) for (const t of p.tasks) for (const a of t.agents) if (a.status === 'running') n++;
  return Math.min(1, n / BUSYN);
}

export interface ShopLife {
  setBusy: (b: number) => void;                                // 0..1: how many shoppers are about, how bright the windows are
  sync: (state: Pick<DashState, 'projects'>) => void;          // setBusy(busyness(state))
  arrive: (from: ShopSpot, done?: () => void) => boolean;      // hook for parked cars and motorcycles: a shopper starts at from.walk, shops, walks back and calls done; false if there is no room now
  frame: (dt: number, t: number) => void;
  // walking: on the move; inside: in a shop; doors: the shop doors open now (their index in S.doors); minGap: closest two on the pavement; forced: times someone walked on through a jam (log: the last few)
  stats: () => { on: boolean; busy: number; cap: number; target: number; active: number; walking: number; inside: number; doors: number[]; minGap: number | null; maxStuck: number; forced: number; passes: number; crowd: number; passing: number[][]; log: (string | number)[][] }; // passes: times someone stepped out to pass; crowd: everyone on foot in the town's crowd
  dispose: () => void;
}

interface Shopper {
  g: THREE.Group; aL: THREE.Mesh; aR: THREE.Mesh; lL: THREE.Mesh; lR: THREE.Mesh; ga: number; x: number; z: number; rot: number; k: number; kT: number; ph: number; v: number;
  route: P2[]; seg0: P2; then: 'inside' | 'gone' | 'spot'; door: number; side: number; spot: ShopSpot | null; done: (() => void) | null;
  inT: number; stuck: number; still: boolean; by: Shopper | null; rank: number; // by: who held them up last; rank: who goes first in a ring
  leaving: boolean; // just out of the shop door: it stays open until they are clear of it
  id: number; lat: number; // id in the town's crowd (crowd.ts); lat: how far left of their lane now (passing someone slower)
}

const BUSYN = 12, MAXN = 30, MAXSPOT = 20, GAP = .6, LANE = .35, BOUND = .4, STUCKMAX = 8, PASS = .75; // MAXN: the top of the Shoppers on foot setting (shopWalkers); MAXSPOT: drivers on foot at most (one per spot)
const CLOTH = ['#8a5a3c', '#3f5f7a', '#6d7a46', '#7a3f4a', '#4f4a6b', '#9a7b3a', '#3d6a63', '#5c5f66'];
const fun = (k: string) => { try { return window.CWFun ? window.CWFun.get(k) !== false : true; } catch (e) { return true; } };
const walkCap = () => { try { return window.CWFun ? Math.max(0, Math.min(MAXN, window.CWFun.get('shopWalkers'))) : 12; } catch (e) { return 12; } };
const rnd = (a: number, b: number) => a + Math.random() * (b - a);

/** The polyline moved d to the right of the walking direction (corners mitred); repeated points are dropped first. */
function keepRight(P: P2[], d: number): P2[] {
  const L = P.filter((p, i) => i === 0 || Math.hypot(p[0] - P[i - 1][0], p[1] - P[i - 1][1]) > 1e-3);
  const nrm = (a: P2, b: P2): P2 => { const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1; return [-dz / l, dx / l]; }; // right of a→b
  return L.map((p, i) => {
    const n1 = i > 0 ? nrm(L[i - 1], p) : null, n2 = i < L.length - 1 ? nrm(p, L[i + 1]) : null;
    if (!n1 || !n2) { const n = (n1 || n2)!; return [p[0] + n[0] * d, p[1] + n[1] * d]; }
    const k = 1 + n1[0] * n2[0] + n1[1] * n2[1]; if (k < .2) return [p[0] + n2[0] * d, p[1] + n2[1] * d];
    return [p[0] + (n1[0] + n2[0]) * d / k, p[1] + (n1[1] + n2[1]) * d / k];
  });
}

export function makeShoppers(OS: ShoppersOS, S: Shops): ShopLife {
  const { G, BODY, mesh, dA } = OS;
  const cloth = CLOTH.map(c => new THREE.MeshStandardMaterial({ color: c, roughness: .8 }));
  const all: Shopper[] = [], log: (string | number)[][] = []; // log: the last walkers who had to walk on regardless, and who stood near them
  let on = fun('shops'), cap = walkCap(), busy = 0, spawnT = 1, forced = 0, uid = 0, passes = 0;
  // the town's crowd (crowd.ts): everyone on foot, in world x/z; the shops' frame turned into it (a rotation: left stays left)
  const C = crowdOf(OS), pl: Plan = { lat: 0, v: 0, passing: false }, [o0x, o0z] = S.toWorld(0, 0), [o1x, o1z] = S.toWorld(1, 0), wcs = o1x - o0x, wsn = o0z - o1z;
  // the Shoppers on foot setting caps the walkers who come on the footpaths; busyness scales them up to it (0: none)
  const target = () => !on || cap <= 0 ? 0 : reduced ? Math.min(cap, STAND.length, Math.round(busy * STAND.length)) : Math.min(cap, 1 + Math.round(busy * (cap - 1)));

  // routes in the shops' frame, built from the data makeShops returns. The pavement is one polyline (round the L's corner):
  // along(a, b) is the way along it from a to b, both on it
  const pave = S.paths.pavement.local, west = S.paths.west.local, east = S.paths.east.local;
  const cum = [0]; for (let i = 1; i < pave.length; i++) cum.push(cum[i - 1] + Math.hypot(pave[i][0] - pave[i - 1][0], pave[i][1] - pave[i - 1][1]));
  const at = (p: P2) => { let best = Infinity, s = 0;
    for (let i = 1; i < pave.length; i++) { const a = pave[i - 1], b = pave[i], dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / l2)), d = Math.hypot(a[0] + dx * t - p[0], a[1] + dz * t - p[1]);
      if (d < best) { best = d; s = cum[i - 1] + t * Math.sqrt(l2); } } return s; };
  const along = (a: P2, b: P2): P2[] => { const sa = at(a), sb = at(b), mid = pave.filter((_, i) => (cum[i] - sa) * (cum[i] - sb) < 0); return [a, ...(sa < sb ? mid : mid.reverse()), b]; };
  const sideIn = (s: number): P2[] => (s < 0 ? west : east).slice().reverse();       // from the end of the footpath up to the pavement
  const door = (i: number): P2[] => [S.doors[i].front.local, S.doors[i].door.local, S.doors[i].inside.local]; // the pavement line, the step, behind the shop front
  const routeRaw = (s: number, i: number) => { const P = sideIn(s); return [...P, ...along(P[P.length - 1], door(i)[0]).slice(1), door(i)[1], door(i)[2]]; };
  const routeIn = (s: number, i: number) => keepRight(routeRaw(s, i), LANE);
  const routeOut = (s: number, i: number) => keepRight(routeRaw(s, i).reverse(), LANE);
  const spotRaw = (sp: ShopSpot, i: number) => { const W = sp.walk.local; return [...W, ...along(W[W.length - 1], door(i)[0]).slice(1), door(i)[1], door(i)[2]]; };
  const spotIn = (sp: ShopSpot, i: number) => keepRight(spotRaw(sp, i), LANE);
  const spotOut = (sp: ShopSpot, i: number) => keepRight(spotRaw(sp, i).reverse(), LANE);
  // reduced motion: standing at the shop windows, facing them (just off the walking line, either side of the door)
  const STAND: { p: P2; rot: number }[] = S.doors.flatMap(d => { const [fx, fz] = d.front.local, h = d.face, nx = Math.sin(h), nz = Math.cos(h), tx = Math.cos(h), tz = -Math.sin(h);
    return [-2.4, 2.4].map(u => ({ p: [fx - nx * .2 + tx * u, fz - nz * .2 + tz * u] as P2, rot: h + Math.PI })); });
  const LOT = SHOP_LOT;

  const solid = (P: Shopper) => P.kT > 0 || P.k > 0; // on the street (in the shop, or faded out at the end: not)
  function free(x: number, z: number, d = GAP + .25) { for (const Q of all) if (solid(Q) && Math.hypot(Q.x - x, Q.z - z) < d) return false; return true; }

  function make(x: number, z: number, rot: number): Shopper {
    const g = new THREE.Group(), m = cloth[Math.floor(Math.random() * cloth.length)], aL = mesh(G.arm, m, true, false), aR = mesh(G.arm, m, true, false); g.rotation.order = 'YXZ';
    aL.position.set(-.29, 1.05, .04); aR.position.set(.29, 1.05, .04); g.add(mesh(G.torso, m, true, false), aL, aR);
    const { lL, lR } = addLegs(g, (geo, mt) => mesh(geo, mt, true, false), BODY[Math.floor(Math.random() * BODY.length)], G.leg, G.head);
    S.group.add(g);
    const P: Shopper = { g, aL, aR, lL, lR, ga: 0, x, z, rot, k: reduced ? 1 : 0, kT: 1, ph: Math.random() * 6, v: walkSpeed(), route: [], seg0: [x, z], then: 'gone', door: 0, side: 0, spot: null, done: null, inT: 0, stuck: 0, still: false, by: null, rank: Math.random(), leaving: false, id: crowdId(CROWD_SHOP, uid++), lat: 0 };
    place(P); all.push(P); return P;
  }
  // the walkable strips (local; shops.ts layout): the east pavement (z 0..PZ, the door steps aside), the north leg's
  // pavement (x -36..XN), the east footpath (x AX..14). room: how far one can go from (x, z) in the direction (dx, dz) and
  // stay on them; passing keeps the shoulders (SHOULDER: half a body with its arms) inside
  const WALK: [number, number, number, number][] = [[-36, 14, .15, LOT.PZ], [-35.85, LOT.XN, 0, 58], [LOT.AX + .1, 14, 0, LOT.FZ]], SHOULDER = .35;
  // the car park (.06), or pavements and footpaths (.1): stepping down the 4 cm curb over the first CURB m of the car park, not a jump
  function room(x: number, z: number, dx: number, dz: number) { let r = 0;
    for (const [x0, x1, z0, z1] of WALK) { if (x < x0 || x > x1 || z < z0 || z > z1) continue;
      const tx = dx > 1e-6 ? (x1 - x) / dx : dx < -1e-6 ? (x0 - x) / dx : 1e9, tz = dz > 1e-6 ? (z1 - z) / dz : dz < -1e-6 ? (z0 - z) / dz : 1e9; r = Math.max(r, Math.min(tx, tz)); }
    return r; }
  const CURB = .35, groundY = (x: number, z: number) => { const d = Math.min(z - LOT.PZ - .05, LOT.FZ - z, x - LOT.XN - .05, LOT.AX + .05 - x); return d <= 0 ? .1 : .1 - .04 * Math.min(1, d / CURB); };
  function place(P: Shopper) { P.g.position.set(P.x, groundY(P.x, P.z), P.z); P.g.rotation.y = P.rot; P.g.scale.setScalar(Math.max(.001, P.k)); P.g.visible = P.k > 0; }
  function go(P: Shopper, R: P2[], then: Shopper['then']) { P.x = R[0][0]; P.z = R[0][1]; P.seg0 = R[0]; P.route = R.slice(1); P.then = then; P.lat = 0; P.rot = Math.atan2(R[1][0] - R[0][0], R[1][1] - R[0][1]); }
  function drop(P: Shopper) { S.group.remove(P.g); const i = all.indexOf(P); if (i >= 0) all.splice(i, 1); }
  function clear() { for (const P of all.slice()) drop(P); }

  function spawn(): boolean { // a newcomer at the front edge of one footpath, heading for a shop
    const s = Math.random() < .5 ? -1 : 1, i = Math.floor(Math.random() * S.doors.length);
    for (const side of [s, -s]) { const R = routeIn(side, i); if (!free(R[0][0], R[0][1])) continue;
      const P = make(R[0][0], R[0][1], 0); P.side = side; P.door = i; go(P, R, 'inside'); return true; }
    return false;
  }
  function arrive(from: ShopSpot, done?: () => void): boolean {
    if (!on || reduced || all.filter(P => P.spot).length >= MAXSPOT) return false;
    const i = Math.floor(Math.random() * S.doors.length), R = spotIn(from, i); if (!free(R[0][0], R[0][1])) return false;
    const P = make(R[0][0], R[0][1], 0); P.door = i; P.spot = from; P.done = done || null; go(P, R, 'inside'); return true;
  }
  function standers() { // reduced motion: shoppers stand at the windows, no walking
    const n = target(); while (all.length > n) drop(all[all.length - 1]);
    for (let j = all.length; j < n; j++) { const s = STAND[(j * 5) % STAND.length]; const P = make(s.p[0], s.p[1], s.rot + (j % 3 - 1) * .25); P.still = true; place(P); }
  }

  // one walker's step towards the next point: straight on if that keeps everyone at GAP, else a step to the side.
  // Walkers who hold each other up in a ring (A waits for B waits for ... A) would stand for good: the one with the
  // highest rank in the ring walks on, the others step back out of the way (the same idea as people.ts).
  const DEF = [-.6, .6, -1.2, 1.2, -1.6, 1.6]; // deflections (rad), right of the walking direction first
  let hit: Shopper | null = null; // who blocked the last okStep that failed
  function okStep(P: Shopper, x: number, z: number) {
    hit = null;
    for (const Q of all) { if (Q === P || !solid(Q)) continue; const d1 = Math.hypot(Q.x - x, Q.z - z); if (d1 < GAP && d1 < Math.hypot(Q.x - P.x, Q.z - P.z) - 1e-9) { hit = Q; return false; } }
    const a = P.seg0, b = P.route[0], ax = b[0] - a[0], az = b[1] - a[1], L = Math.hypot(ax, az); if (L < 1e-3) return true;
    const lat = Math.abs(((x - a[0]) * az - (z - a[1]) * ax) / L - P.lat), lat0 = Math.abs(((P.x - a[0]) * az - (P.z - a[1]) * ax) / L - P.lat); // off the lane, P.lat to the left of it while passing
    const lon = ((x - a[0]) * ax + (z - a[1]) * az) / L, lon0 = ((P.x - a[0]) * ax + (P.z - a[1]) * az) / L;
    return (lat <= BOUND || lat <= lat0) && (lon >= -.3 || lon >= lon0); // never more than BOUND off the line of this leg, nor .3 back behind its start (kerbs, walls, props)
  }
  function ringTop(P: Shopper): Shopper | null { let q = P.by, top = P; for (let k = 0; k < 12 && q; k++) { if (q === P) return top; if (q.rank > top.rank) top = q; q = q.by; } return null; }
  function walk(P: Shopper, dt: number): boolean { // true: moved
    // the crowd (crowd.ts): someone slower ahead in the lane: out to the left, past them and back; oncoming in the lane: keep
    // right; no room to pass: their speed. Not on the last legs (the door, the end of the way)
    const n0 = P.route[0], a0 = P.seg0, gx = n0[0] - a0[0], gz = n0[1] - a0[1], gl = Math.hypot(gx, gz) || 1, fx = gx / gl, fz = gz / gl, [wx, wz] = S.toWorld(P.x, P.z), roomy = P.route.length > 3;
    const lx = P.x - fz * P.lat, lz = P.z + fx * P.lat; // where on their lane they are (P.lat back to the right)
    const latL = roomy ? Math.min(PASS, Math.max(0, room(lx, lz, fz, -fx) - SHOULDER)) : 0, latR = roomy ? Math.min(PASS, Math.max(0, room(lx, lz, -fz, fx) - SHOULDER)) : 0;
    C.plan(P.id, wx, wz, fx * wcs + fz * wsn, fz * wcs - fx * wsn, P.v, .3, P.lat, latL, latR, pl);
    const lat0 = P.lat; P.lat += (pl.lat - P.lat) * Math.min(1, dt * 2.5); if (Math.abs(P.lat) < .005) P.lat = 0;
    if (Math.abs(lat0) < .3 && Math.abs(P.lat) >= .3) passes++; // each pass once: when they are well out (either side)
    const n: P2 = P.lat ? [n0[0] + fz * P.lat, n0[1] - fx * P.lat] : n0; // P.lat left of the node (left of the leg: (fz, -fx))
    const dx = n[0] - P.x, dz = n[1] - P.z, d = Math.hypot(dx, dz), s = pl.v * dt, h = Math.atan2(dx, dz), st = Math.min(s, d);
    const move = (x: number, z: number, face: number) => { P.x = x; P.z = z; P.rot = dA(P.rot, face, 10, dt); };
    if (P.route.length === 1 && P.then !== 'inside' && d < GAP) { P.seg0 = n0; P.route.shift(); P.stuck = 0; P.by = null; return true; } // all but at the end of the way (the footpath's end, or the car): done here, so a newcomer starting there does not lock with them
    if (d <= s && okStep(P, n[0], n[1])) { P.x = n[0]; P.z = n[1]; P.seg0 = n0; P.route.shift(); P.stuck = 0; P.by = null; return true; }
    if (d > s && okStep(P, P.x + dx / d * st, P.z + dz / d * st)) { move(P.x + dx / d * st, P.z + dz / d * st, h); P.stuck = Math.max(0, P.stuck - dt * 2); P.by = null; return true; }
    P.by = hit;
    const top = P.by ? ringTop(P) : null;
    if (top && top !== P && P.by) { const bx = P.x - P.by.x, bz = P.z - P.by.z, bl = Math.hypot(bx, bz) || 1, x = P.x + bx / bl * st * .6, z = P.z + bz / bl * st * .6; // in a ring, not first: make room
      if (okStep(P, x, z)) { P.x = x; P.z = z; P.stuck += dt * .2; return true; } }
    if (P.stuck > .3 || top === P) for (const a of DEF) { const hx = Math.sin(h - a), hz = Math.cos(h - a), x = P.x + hx * st * .7, z = P.z + hz * st * .7;
      if (okStep(P, x, z)) { move(x, z, Math.atan2(hx, hz)); P.stuck += dt * .5; return true; } }
    P.stuck += dt;
    if (P.stuck > STUCKMAX) { forced++; P.stuck = 0; const r = (v: number) => +v.toFixed(2);
      log.push([r(P.x), r(P.z), r(n[0]), r(n[1]), ...all.filter(Q => Q !== P && solid(Q) && Math.hypot(Q.x - P.x, Q.z - P.z) < 1.5).map(Q => `${r(Q.x)},${r(Q.z)}>${Q.route[0] ? r(Q.route[0][0]) + ',' + r(Q.route[0][1]) : '-'} s${r(Q.stuck)}`)]); if (log.length > 20) log.shift(); P.x += dx / d * st; P.z += dz / d * st; return true; } // last resort: walk on regardless
    P.rot = dA(P.rot, h, 6, dt); return false;
  }

  function frame(dt: number) {
    dt = Math.min(dt, .1);
    S.frameDoors(dt); // a door nobody asks to keep open shuts (all of them, once the shops are off)
    if (!on) return;
    if (reduced) return;
    C.begin(CROWD_SHOP);
    if ((spawnT -= dt) <= 0) { spawnT = rnd(1.2, 3.5); const dr = all.filter(P => P.spot).length; if (all.length - dr + dr / 2 < target()) spawn(); } // drivers from the car park come on top, but each one takes half a place, so the pavement does not get too full
    for (const P of all.slice()) {
      P.k = P.kT > P.k ? Math.min(P.kT, P.k + dt * 3) : Math.max(P.kT, P.k - dt * 3); // stops at kT (faded in it stays at 1: dropping a step and coming back each frame made the whole body pulse in size)
      let mv = false; const ox = P.x, oz = P.z;
      const D = S.doors[P.door].door.local, dD = Math.hypot(P.x - D[0], P.z - D[1]);
      if (P.then === 'inside' && P.route.length && (dD < 3 || P.route.length === 1)) S.openDoor(P.door); // coming up to the door, or through it
      if (P.leaving) { const I = S.doors[P.door].inside.local; if (Math.hypot(P.x - I[0], P.z - I[1]) < 2.3) S.openDoor(P.door); else P.leaving = false; } // out of the door: it stays open until they are a step past it
      if (P.then === 'inside' && !P.route.length && P.kT === 0) { // in the shop
        if (P.k > 0) { /* still fading in the doorway */ }
        else if ((P.inT -= dt) <= 0) { const side = Math.random() < .5 ? P.side : -P.side || 1, R = P.spot ? spotOut(P.spot, P.door) : routeOut(side, P.door);
          if (!free(R[0][0], R[0][1]) || !free(R[1][0], R[1][1], 1.1)) P.inT = .3;
          else { S.openDoor(P.door); if (S.doorOpen(P.door) < .85) P.inT = 0; else { go(P, R, P.spot ? 'spot' : 'gone'); P.kT = 1; P.k = 1; P.stuck = 0; P.leaving = true; } } } // the door opens first, then they step out from behind it
      } else if (P.route.length) { if (P.then === 'inside' && P.route.length === 1 && S.doorOpen(P.door) < .85) P.rot = dA(P.rot, Math.atan2(P.route[0][0] - P.x, P.route[0][1] - P.z), 6, dt); else mv = walk(P, dt); } // on the step: wait for the door
      else if (P.kT) { P.kT = 0; if (P.then === 'inside') { P.inT = rnd(10, 40); P.k = 0; } }           // through the door and out of sight behind the shop front; or at the end of the way: fade out
      else if (P.k === 0 && P.then !== 'inside') { if (P.then === 'spot' && P.done) P.done(); drop(P); continue; }
      const dist = mv ? Math.hypot(P.x - ox, P.z - oz) : 0, sw = gait(P, dist, dt); // the legs on the distance walked
      P.aL.rotation.x = sw; P.aR.rotation.x = -sw; place(P); P.g.position.y += gaitDip(P);
      if (solid(P)) { const [wx, wz] = S.toWorld(P.x, P.z), lx = Math.sin(P.rot), lz = Math.cos(P.rot); C.put(P.id, wx, wz, lx * wcs + lz * wsn, lz * wcs - lx * wsn, dt > 0 ? dist / dt : 0, .3); } // in the town's crowd
    }
  }

  function setLit() { S.setLit(on ? .3 + .7 * busy : 0); }
  function setBusy(b: number) { busy = Math.max(0, Math.min(1, +b || 0)); setLit(); if (on && reduced) standers(); }
  function setOn(v: boolean) { on = v; if (!on) clear(); else if (reduced) standers(); setLit(); }
  const off = window.CWFun ? window.CWFun.on((k, v) => { if (k === 'shops') setOn(v !== false); if (k === 'shopWalkers') { cap = walkCap(); if (on && reduced) standers(); } }) : null; // a lower cap: no newcomers until there are fewer; those about finish their visit
  setOn(on);

  return { setBusy, arrive, frame, sync: state => setBusy(busyness(state)),
    stats() { const W = all.filter(solid); let min = Infinity, stuck = 0;
      for (let i = 0; i < W.length; i++) { stuck = Math.max(stuck, W[i].stuck); for (let j = i + 1; j < W.length; j++) min = Math.min(min, Math.hypot(W[i].x - W[j].x, W[i].z - W[j].z)); }
      return { on, busy, cap, target: target(), active: all.length, walking: W.filter(P => !P.still).length, inside: all.length - W.length, doors: S.doors.map((_, i) => i).filter(i => S.doorOpen(i) > 0), minGap: min === Infinity ? null : +min.toFixed(3), maxStuck: +stuck.toFixed(2), forced, passes, crowd: C.count, passing: all.filter(P => Math.abs(P.lat) > .3).map(P => [...S.toWorld(P.x, P.z).map(v => +v.toFixed(1)), P.id]), log: log.slice() }; },
    dispose() { if (off) off(); clear(); for (const m of cloth) m.dispose(); } };
}
