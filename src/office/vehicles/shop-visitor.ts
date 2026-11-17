// Shop visitors: cars and motorcycles that drive to the shops (buildings/shops.ts), park nose-in in a free spot while the
// driver goes shopping on foot (shoppers.ts arrive), then reverse out and drive off. They come in through the site gate and
// leave by it, over the road net (roads.ts: the shops arm off the east roundabout E, one lane each way).
// How many come follows the busyness (0..1, from index.ts): at 0 an occasional visitor, at 1 up to 16 (one on the way in at a time),
// never more than the Shop vehicles setting ('shopCars', 0..number of spots, 0: none).
// A visitor takes a spot when it sets off, so there are never more visitors than spots; with no spot free nobody comes.
// Setting 'shops' off: every visitor goes at once and nobody comes. Reduced motion: no driving; as many vehicles as the
// busyness asks for stand parked in their spots.
//
// In the car park (shops' local frame): in at the entry lane, west along aisle 1, nose-in to the spot; out: reverse onto
// aisle 1 (towards the east), west along it, U-turn round the island's west end, east along aisle 2, out at the exit lane.
// One rule keeps the car park free of standoffs:
// nobody reverses out while somebody is driving in to a spot, and nobody drives in while somebody reverses out.
// The box trucks to the loading bay (delivery.ts) take part through link, clear and inbound.
import * as THREE from 'three';
import { reduced } from '../../common/dom.js';
import type { P2 } from '../../common/types.js';
import type { OfficeState } from '../state.js';
import type { ShopVisitor, Vehicle, OfficeLeg } from '../types.js';
import { SHOP_LOT, type Shops, type ShopSpot } from '../buildings/shops.js';
import type { ShopLife } from '../shoppers.js';

export interface ShopTraffic {
  setBusy: (b: number) => void;
  frame: (dt: number) => void;
  stats: () => { on: boolean; busy: number; cap: number; target: number; visitors: number; st: Record<string, number>; cars: number; motos: number; free: number; came: number; left: number; noShopper: number; at: [string, string, number, number][] };
  dispose: () => void;
  /** For the box trucks (delivery.ts): visitors on their way in; whether the car park is clear for a truck to drive in
   *  along aisle 1 (in) or to come down the service drive onto aisle 2 (out); link: while hold() is true nobody starts
   *  to reverse out, while inbound() is above 0 no visitor sets off (one vehicle on the way in at a time). */
  inbound: () => number;
  clear: (way: 'in' | 'out') => boolean;
  link: (o: { hold: () => boolean; inbound: () => number }) => void;
  /** For homes.ts: a finished agent's own vehicle (A) shops on its way home. Null when the shops are off, motion is reduced, another agent
   *  or more than ROAD_IN others are on the way in, or no spot of its kind is free. Else it takes a spot and joins the visitors: tail is the way
   *  from shop:in to the spot (world), add(L, r) puts the visitor's waits on the leg that drives there (r: its road part), end is that
   *  leg's end; cancel gives the spot back when that leg is not driven after all. After the visit it reverses out as a visitor does and
   *  drives to next().to and on along next().tail, next().end at the end; next() null (or no way there): off out of town, as a visitor. */
  agent: (A: Vehicle, kind: 'car' | 'moto', vr: number, next: () => AgentNext | null) => AgentVisit | null;
}
export interface AgentVisit { tail: P2[]; add: (L: OfficeLeg, r: P2[]) => void; end: () => void; cancel: () => void }
export interface AgentNext { to: string; tail: P2[]; add?: (L: OfficeLeg, r: P2[]) => void; end: () => void }

const { FZ, AZL, Z2, UC, UR, EXX, OXX, XN, AX } = SHOP_LOT;
// at most this many visitors on their way in (ROAD_IN) and on their way out (ROAD) at once: the shop trips share the avenue and its
// roundabouts with the staff cars and armoured cars (with 2 on the way in, the stress runs held up more traffic at the avenue's roundabouts)
const ROAD_IN = 1, ROAD = 2;
const RC = 2.6, RM = 3.5; // turn radius into a spot: car, motorcycle (wider for the motorcycles, so they come out east of the exit lane)
const CARC = ['#a9afb7', '#3a3f47', '#2c3e66', '#6e2a2e', '#b8a88a', '#d8dade', '#2f4a3a', '#5a4a3c'];
const fun = (k: string) => { try { return window.CWFun ? window.CWFun.get(k) !== false : true; } catch (e) { return true; } };
const carCap = (n: number) => { try { return window.CWFun ? Math.max(0, Math.min(n, window.CWFun.get('shopCars'))) : n; } catch (e) { return n; } }; // the Shop vehicles setting
const rnd = (a: number, b: number) => a + Math.random() * (b - a);

/** Before the first roundabout on the way in (the avenue's south one), wait while an armoured car drives through it: an armoured car
 *  that changes lane at that roundabout's north exit and a vehicle going straight on in the outer lane can end up waiting for each
 *  other (seen at about (5, 52) in the stress runs). After 8 s it goes anyway. Also used by the box trucks (delivery.ts). */
export function shopRingWait(OS: OfficeState, L: ReturnType<OfficeState['mkLeg']>, r: P2[]) {
  const RT = OS.RT; let k = -1, R: [number, number, number, number, number] | null = null;
  for (let i = 1; i < r.length && !R; i++) { const c = OS.rAt(r[i][0], r[i][1]); if (c) { R = c; k = i; } }
  if (!R) return; const [rx, rz] = R; let j = k; while (j > 0 && Math.hypot(r[j][0] - rx, r[j][1] - rz) < RT + 3) j--;
  let t0 = -1;
  OS.on(L, r[j][0], r[j][1], () => { if (t0 < 0) t0 = OS.simT; if (OS.simT - t0 > 8) return true;
    return !OS.vehs.some(O => O.kind === 'truck' && !O.ghost && !O.parked && O.leg && O.v > .3 && Math.hypot(O.x - rx, O.z - rz) < RT + 5); }, null, 3, false, 'shopring');
}

export function makeShopVisitors(OS: OfficeState, S: Shops, life: ShopLife): ShopTraffic {
  const { veh, mesh, G, VC, vehs, spawnQ, mkLeg, on, route, bez, arc, dropVeh, place } = OS;
  const mats = CARC.map(c => new THREE.MeshStandardMaterial({ vertexColors: true, color: c, roughness: .35, metalness: .4 }));
  const V: ShopVisitor[] = [], meta = new Map<ShopVisitor, { sp: ShopSpot; var: number; go: boolean; tries: number; t: number; shopper: boolean; next?: () => AgentNext | null }>(); // next: a finished agent's own vehicle (agent)
  const CAR_SPOTS = S.cars.length - 1, SPOTS = CAR_SPOTS + S.motos.length; // the last car spot (by the entry lane) is left out: reversing out of it would swing the tail into the lane
  let ext: { hold: () => boolean; inbound: () => number } | null = null;
  let on_ = fun('shops'), cap = carCap(SPOTS), busy = 0, nextT = 2, came = 0, left = 0, noShopper = 0;
  // busyness scales the visitors up to the Shop vehicles setting (0: none); at busyness 0 an occasional one
  const target = () => !on_ || cap <= 0 ? 0 : Math.min(cap, busy <= 0 ? 1 : Math.round(1 + busy * (SPOTS - 5)));
  const W = (P: P2[]) => P.map(p => S.toWorld(p[0], p[1]));
  const cs = Math.cos(S.origin.rot), sn = Math.sin(S.origin.rot);
  const toLocal = (x: number, z: number): P2 => { const dx = x - S.origin.x, dz = z - S.origin.z; return [dx * cs - dz * sn, dx * sn + dz * cs]; };

  // ── spots ──
  const spots = (kind: 'car' | 'moto') => kind === 'car' ? S.cars.slice(0, CAR_SPOTS) : S.motos;
  const taken = (sp: ShopSpot) => V.some(A => meta.get(A)!.sp === sp);
  const freeOf = (kind: 'car' | 'moto') => spots(kind).filter(sp => !taken(sp));
  function pick(): ShopSpot | null {
    const c = freeOf('car'), m = freeOf('moto'); if (!c.length && !m.length) return null;
    const pool = !c.length ? m : !m.length ? c : Math.random() < 1 / 3 ? m : c; return pool[Math.floor(Math.random() * pool.length)];
  }

  // ── the ways through the car park (local frame) ──
  function wayIn(sp: ShopSpot): P2[] { const { x, z } = sp.pose.local, R = sp.kind === 'car' ? RC : RM, top: P2 = [EXX, FZ - 3.1];
    if (x + R > EXX - 1.5) return [[EXX, FZ], top, ...bez(top, Math.PI, [x, AZL - 2.5], Math.PI, 2.2).slice(1), [x, z]]; // a spot right by the entry lane: an S-curve straight in
    const P: P2[] = [[EXX, FZ], top, ...bez(top, Math.PI, [EXX - 2.4, AZL], -Math.PI / 2, 1.3).slice(1)];
    if (x + R < EXX - 2.5) P.push([x + R, AZL]); P.push(...arc(x + R, AZL - R, R, Math.PI / 2, Math.PI).slice(1), [x, z]); return P; }
  function wayBack(sp: ShopSpot): P2[] { const { x, z } = sp.pose.local, R = sp.kind === 'car' ? RC : RM; return [[x, z], ...arc(x + R, AZL - R, R, Math.PI, Math.PI / 2)]; }
  // out: west along aisle 1 to the U-turn round the island's west end, east along aisle 2, then up the exit lane
  function wayOut(sp: ShopSpot): P2[] { const R = sp.kind === 'car' ? RC : RM, ex = sp.pose.local.x + R, c: P2 = [OXX - 2.6, Z2];
    return [[ex, AZL], ...(ex > UC + .2 ? [[UC, AZL] as P2] : []), ...arc(UC, AZL + UR, UR, -Math.PI / 2, -1.5 * Math.PI).slice(1), c,
      ...bez(c, Math.PI / 2, [OXX, FZ - .9], 0, 1.6).slice(1), [OXX, FZ]]; }

  // ── the rule in the car park ──
  const lot = (A: ShopVisitor) => { const [x, z] = toLocal(A.x, A.z); return z < FZ + .5 && z > 1.5 && x > XN - .5 && x < AX + .5; };
  const canEnter = () => !V.some(O => O.st === 'back');
  function canBack(A: ShopVisitor) { const xs = meta.get(A)!.sp.pose.local.x;
    return !V.some(O => O !== A && (O.st === 'back' || O.st === 'park' || (O.st === 'out' && lot(O) && (() => { const [x, z] = toLocal(O.x, O.z); return z > 6 && z < AZL + 2.2 && x > xs - 3; })()))); }

  // ── one visitor ──
  function body(kind: 'car' | 'moto', vr: number, ride: boolean) { return kind === 'car' ? mesh(G.car, mats[vr % mats.length]) : mesh(ride ? G.moto[vr % G.moto.length].ride : G.moto[vr % G.moto.length].park, VC); }
  function make(sp: ShopSpot, x: number, z: number, rot: number, ride: boolean): ShopVisitor {
    const vr = Math.floor(Math.random() * 64), A = veh(sp.kind, body(sp.kind, vr, ride), x, z, rot) as unknown as ShopVisitor;
    Object.assign(A, { st: 'in', shop: true, spot: { kind: sp.kind, i: sp.i }, sx: sp.pose.local.x }); V.push(A); meta.set(A, { sp, var: vr, go: false, tries: 0, t: 0, shopper: false }); return A;
  }
  function setRide(A: ShopVisitor, ride: boolean) { if (A.kind !== 'moto') return; const m = A.g as THREE.Mesh, vr = meta.get(A)!.var % G.moto.length; m.geometry = ride ? G.moto[vr].ride : G.moto[vr].park; }
  function remove(A: ShopVisitor) { const i = V.indexOf(A); if (i >= 0) V.splice(i, 1); meta.delete(A); dropVeh(A); }

  function spawn(g: string): boolean {
    const sp = pick(), r = sp && route(g, 'shop:in'); if (!sp || !r) return false;
    const P = [...r, ...W(wayIn(sp)).slice(1)], A = make(sp, r[0][0], r[0][1], Math.PI, true);
    const L = mkLeg(P, { fin: true, end: () => arrived(A) });
    ringWait(L, r);
    const [ex, ez] = S.toWorld(EXX, FZ - 1.9); on(L, ex, ez, () => { if (!canEnter()) return false; A.st = 'park'; return true; }, null, 6, false, 'shopin');
    A.ghost = false; A.k = 0; A.gk = 1; A.legs.push(L); came++; return true;
  }
  const ringWait = (L: ReturnType<typeof mkLeg>, r: P2[]) => shopRingWait(OS, L, r);
  function arrived(A: ShopVisitor) { const m = meta.get(A); if (!m) return; A.st = 'shop'; A.rot = m.sp.pose.world.rot; m.t = 0; tryShop(A); }
  function tryShop(A: ShopVisitor) { const m = meta.get(A)!; m.tries++;
    if (life.arrive(m.sp, () => { if (meta.get(A) === m) { setRide(A, true); m.go = true; } })) { m.shopper = true; setRide(A, false); } }
  function leave(A: ShopVisitor) { const m = meta.get(A)!, nx = m.next ? m.next() : null, ra = nx && route('shop:out', nx.to), r = ra || route('shop:out', OS.gateOut()); if (!r) { remove(A); return; }
    A.st = 'back'; m.go = false;
    const back = mkLeg(W(wayBack(m.sp)), { rev: true, v: 2.2, end: () => { A.st = 'out'; } });
    // an agent on its way home: it leaves the visitors at the end of the leg (the vehicle drives on), homes.ts takes over
    const off = nx && ra ? mkLeg([...W(wayOut(m.sp)), ...r.slice(1), ...nx.tail], { end: () => { left++; const i = V.indexOf(A); if (i >= 0) V.splice(i, 1); meta.delete(A); nx.end(); } })
      : mkLeg([...W(wayOut(m.sp)), ...r.slice(1)], { fout: true, end: () => { left++; remove(A); } });
    if (nx && ra && nx.add) nx.add(off, r); A.legs.push(back, off);
  }
  function agent(B: Vehicle, kind: 'car' | 'moto', vr: number, next: () => AgentNext | null): AgentVisit | null {
    // one agent at a time, never while someone reverses out or a delivery holds the lot; it may be on the way in beside the one visitor or delivery (ROAD_IN): else on a busy day nobody would ever stop to shop
    if (!on_ || reduced || V.some(O => meta.get(O)?.next) || V.some(O => O.st === 'back') || (ext && ext.hold()) || V.filter(O => O.st === 'in').length + (ext ? ext.inbound() : 0) >= ROAD_IN + 1) return null;
    const free = freeOf(kind); if (!free.length) return null;
    const sp = free[Math.floor(Math.random() * free.length)], A = B as unknown as ShopVisitor;
    Object.assign(A, { st: 'in', shop: true, spot: { kind, i: sp.i }, sx: sp.pose.local.x }); V.push(A); meta.set(A, { sp, var: vr, go: false, tries: 0, t: 0, shopper: false, next });
    return { tail: W(wayIn(sp)).slice(1), end: () => arrived(A), cancel: () => { const i = V.indexOf(A); if (i >= 0) V.splice(i, 1); meta.delete(A); },
      add(L, r) { ringWait(L, r); const [ex, ez] = S.toWorld(EXX, FZ - 1.9); on(L, ex, ez, () => { if (!canEnter()) return false; A.st = 'park'; return true; }, null, 6, false, 'shopin'); } };
  }

  // reduced motion: parked visitors only, as many as the busyness asks for
  function standers() { const n = target();
    while (V.length > n) remove(V[V.length - 1]);
    for (let j = V.length; j < n; j++) { const sp = pick(); if (!sp) break; const p = sp.pose.world, A = make(sp, p.x, p.z, p.rot, false); A.st = 'shop'; place(A); } }

  function frame(dt: number) {
    dt = Math.min(dt, .1);
    if (!on_ || reduced) return;
    for (const A of V.slice()) { const m = meta.get(A); if (!m || A.st !== 'shop' || A.leg || A.legs.length) continue; m.t += dt;
      if (!m.shopper && !m.go) { if (m.t > 20) { noShopper++; m.go = true; } else if (m.t > m.tries) tryShop(A); } // no room for the driver on the pavement now: try again, give up after 20 s
      if (m.go && canBack(A) && !(ext && ext.hold()) && V.filter(O => O.st === 'back' || O.st === 'out').length < ROAD) leave(A); } // a visitor that is done may wait in its spot for room on the road
    if ((nextT -= dt) > 0) return;
    const busyNow = V.filter(A => A.st !== 'out').length;
    if (busyNow >= target() || V.filter(A => A.st === 'in').length + (ext ? ext.inbound() : 0) >= ROAD_IN) { nextT = .5; return; }
    const g = OS.gateIn(); if (!g) { nextT = .3; return; } // a random in road that is clear, with no staff car waiting for it (they come first)
    if (spawn(g)) nextT = busy <= 0 ? rnd(40, 90) : rnd(4, 10) / Math.max(.25, busy); else nextT = 2;
  }

  function setBusy(b: number) { busy = Math.max(0, Math.min(1, +b || 0)); if (on_ && reduced) standers(); }
  function setOn(v: boolean) { on_ = v; if (!on_) { for (const A of V.slice()) remove(A); } else if (reduced) standers(); nextT = 2; }
  const off = window.CWFun ? window.CWFun.on((k, v) => { if (k === 'shops') setOn(v !== false); if (k === 'shopCars') { cap = carCap(SPOTS); if (on_ && reduced) standers(); } }) : null; // a lower cap: nobody new comes until there are fewer; those parked finish their visit
  setOn(on_);

  // a truck drives in only while nobody reverses out; it comes down onto aisle 2 only while nobody is still on aisle 1 or the U-turn on the way out
  function clear(way: 'in' | 'out') { return !V.some(O => O.st === 'back' || (way === 'out' && O.st === 'out' && lot(O) && (() => { const [x, z] = toLocal(O.x, O.z); return z < Z2 - 1 || x < UC + 3; })())); }

  return { setBusy, frame, clear, agent, inbound: () => V.filter(A => A.st === 'in').length, link(o) { ext = o; },
    stats() { const st: Record<string, number> = {}; for (const A of V) st[A.st] = (st[A.st] || 0) + 1;
      return { on: on_, busy, cap, target: target(), visitors: V.length, st, cars: V.filter(A => A.kind === 'car').length, motos: V.filter(A => A.kind === 'moto').length, free: freeOf('car').length + freeOf('moto').length, came, left, noShopper, at: V.map(A => [A.kind, A.st, +A.x.toFixed(1), +A.z.toFixed(1)] as [string, string, number, number]) }; },
    dispose() { if (off) off(); for (const A of V.slice()) remove(A); for (const m of mats) m.dispose(); } };
}
