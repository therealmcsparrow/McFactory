// Box trucks (box-truck.ts model): deliveries to the shops' loading bay, and now and then one as through traffic.
// A delivery comes in through the site gate and over the shops arm off roundabout E like a shop visitor, drives in at the
// entry lane, west along aisle 1, half round the U-turn and up the service drive (buildings/shops.ts), reverses into the
// bay behind the hardware store, unloads for a few seconds (a few crates appear by the side door) and leaves down the
// drive, east along aisle 2 and out at the exit lane, back to the gate. A through truck drives in at the gate, round the
// town over the avenue and the east street and out at the gate again.
// How often: a delivery every 2.5..4 minutes when it is quiet, every 1..1.5 minutes at full busyness; a through truck
// every 4..7 minutes (2..3.5 at full busyness). At most one delivery and two box trucks at once. Setting 'shops' off:
// every box truck goes at once and none comes. Reduced motion: none.
// The rules it shares with the shop visitors (shop-visitor.ts link/clear/inbound), so the car park has no standoffs:
// one vehicle on the way in at a time (a truck or a visitor); a truck drives into the car park only while nobody reverses
// out, and nobody starts to reverse out from then until it is up the drive; on the way out it waits at the foot of the
// drive until nobody is on aisle 1 or the U-turn on their way out, and nobody reverses out until it is at the exit lane.
import * as THREE from 'three';
import { reduced } from '../../common/dom.js';
import type { P2 } from '../../common/types.js';
import type { OfficeState } from '../state.js';
import type { BoxTruck } from '../types.js';
import { SHOP_LOT, type Shops } from '../buildings/shops.js';
import { shopRingWait, type ShopTraffic } from './shop-visitor.js';
import { boxTruckLogo } from './box-truck.js';

export interface Deliveries {
  setBusy: (b: number) => void;
  frame: (dt: number) => void;
  stats: () => { on: boolean; trucks: [string, number, number][]; came: number; pass: number; next: number; nextPass: number };
  dispose: () => void;
}

const { FZ, Z2, UC, UR, OXX } = SHOP_LOT;
const DX = UC - UR; // the service drive's line (the U-turn's west end)
const fun = (k: string) => { try { return window.CWFun ? window.CWFun.get(k) !== false : true; } catch (e) { return true; } };
const rnd = (a: number, b: number) => a + Math.random() * (b - a);

export function makeDeliveries(OS: OfficeState, S: Shops, visit: ShopTraffic): Deliveries {
  const { veh, mesh, G, VC, vehs, spawnQ, mkLeg, on, route, bez, dropVeh, bx, merge, FONT } = OS;
  const T: BoxTruck[] = [], meta = new Map<BoxTruck, { hold: boolean; t: number; logo: THREE.Group | null }>();
  let on_ = fun('shops'), busy = 0, nextD = rnd(20, 40), nextP = rnd(60, 120), came = 0, pass = 0, crT = -1;
  const W = (P: P2[]) => P.map(p => S.toWorld(p[0], p[1]));
  const hold = () => T.some(A => meta.get(A)!.hold);
  const dueD = () => on_ && !reduced && nextD <= 0 && T.length < 2 && !T.some(A => A.st !== 'pass'); // a delivery is due: no new visitor sets off, so it gets its turn
  visit.link({ hold, inbound: () => T.filter(A => A.st === 'in').length + (dueD() ? 1 : 0) });

  // the unloaded goods: a pallet and two stacks of crates by the side door, shown one by one while a truck unloads
  const [cx, cz] = S.crates, CB = '#a8804a', CD = '#8a6a3c';
  const crates = [merge([bx(1.1, .14, 1.1, cx, .07, cz, '#6b5540'), bx(.5, .4, .45, cx - .25, .34, cz - .25, CB), bx(.5, .4, .45, cx + .27, .34, cz - .22, CD)]),
    merge([bx(.5, .4, .45, cx - .24, .34, cz + .25, CD), bx(.5, .4, .45, cx + .26, .34, cz + .24, CB)]),
    merge([bx(.46, .36, .42, cx - .2, .72, cz - .1, CB), bx(.46, .36, .42, cx + .24, .72, cz + .05, CD)])].map(geo => { const m = mesh(geo, VC); m.visible = false; S.group.add(m); return m; });
  const showCrates = (n: number) => crates.forEach((m, i) => { m.visible = i < n; });

  function make(x: number, z: number, st: BoxTruck['st']): BoxTruck {
    const vr = Math.floor(Math.random() * 64), A = veh('box', mesh(G.box[vr % G.box.length], VC), x, z, Math.PI) as unknown as BoxTruck;
    const logo = boxTruckLogo(vr, FONT); if (logo) A.g.add(logo);
    Object.assign(A, { st, vr }); A.ghost = false; A.k = 0; A.gk = 1; T.push(A); meta.set(A, { hold: false, t: 0, logo }); return A;
  }
  function remove(A: BoxTruck) { const i = T.indexOf(A), m = meta.get(A); if (i >= 0) T.splice(i, 1); meta.delete(A);
    if (m && m.logo) m.logo.traverse(o => { if (o instanceof THREE.Mesh) o.geometry.dispose(); }); dropVeh(A); }

  // ── a delivery ──
  function deliver(): boolean {
    const g = OS.gateIn(), r = g && route(g, 'shop:in'); if (!r) return false;
    const A = make(r[0][0], r[0][1], 'in'), m = meta.get(A)!;
    const L = mkLeg([...r, ...S.service.up.world.slice(1)], { fin: true, end: () => toBay(A) });
    shopRingWait(OS, L, r);
    const [ex, ez] = S.toWorld(SHOP_LOT.EXX, FZ - 1.9); on(L, ex, ez, () => { m.hold = true; if (!visit.clear('in')) return false; A.st = 'lot'; return true; }, null, 6, false, 'shopin');
    const [ux, uz] = S.toWorld(DX, FZ + 4); on(L, ux, uz, null, () => { m.hold = false; });
    A.legs.push(L); came++; return true;
  }
  function toBay(A: BoxTruck) { A.st = 'bay'; A.legs.push(mkLeg(S.service.back.world, { rev: true, v: 1.6, end: () => { A.st = 'unload'; meta.get(A)!.t = rnd(8, 14); A.rot = S.loading.world.rot; crT = -1; } })); }
  function away(A: BoxTruck) { const m = meta.get(A)!, r = route('shop:out', OS.gateOut()); if (!r) { remove(A); return; }
    A.st = 'out'; crT = 20; // the goods are taken in a while after the truck has gone
    const c: P2 = [OXX - 2.6, Z2], tail = W([c, ...bez(c, Math.PI / 2, [OXX, FZ - .9], 0, 1.6).slice(1), [OXX, FZ]]);
    const L = mkLeg([...S.service.away.world, ...tail, ...r.slice(1)], { fout: true, end: () => remove(A) });
    const [dx, dz] = S.toWorld(DX, FZ + 3); on(L, dx, dz, () => { m.hold = true; return visit.clear('out'); }, null, 3, false, 'shopdrive');
    const [ox, oz] = S.toWorld(OXX, FZ - 1); on(L, ox, oz, null, () => { m.hold = false; });
    A.legs.push(L); }

  // ── through traffic: in at a random in road, round by the east street, out at a random one ──
  function through(): boolean {
    const g = OS.gateIn(), r1 = g && route(g, 'E:o2'), r2 = r1 && route('E:o2', OS.gateOut()); if (!r1 || !r2) return false;
    const P = [...r1, ...r2.slice(1)], A = make(P[0][0], P[0][1], 'pass');
    const L = mkLeg(P, { fin: true, fout: true, end: () => remove(A) }); shopRingWait(OS, L, P); A.legs.push(L); pass++; return true;
  }

  const gateFree = () => !!OS.gateIn(true, false); // an in road clear, with no staff car waiting for it (they come first)
  function frame(dt: number) {
    dt = Math.min(dt, .1);
    if (!on_ || reduced) return;
    for (const A of T) { const m = meta.get(A)!; if (A.st !== 'unload' || A.leg || A.legs.length) continue;
      m.t -= dt; showCrates(m.t < 2 ? 3 : m.t < 5 ? 2 : 1); if (m.t <= 0) away(A); }
    if (crT > 0 && (crT -= dt) <= 0) showCrates(0);
    nextD -= dt; nextP -= dt;
    if (nextD > 0 && nextP > 0) return;
    const free = T.length < 2 && !T.some(A => A.st === 'in') && gateFree();
    if (nextD <= 0) { if (T.some(A => A.st !== 'pass')) nextD = 2; else if (free && visit.inbound() === 0) nextD = deliver() ? rnd(150, 240) * (1 - busy) + rnd(50, 90) * busy : 5; return; } // due: it waits (nextD stays <= 0) until the visitor on its way in is there
    if (nextP <= 0) { if (!free || T.some(A => A.st === 'pass')) nextP = 3; else nextP = through() ? rnd(240, 420) * (1 - busy) + rnd(120, 210) * busy : 10; }
  }

  function setBusy(b: number) { busy = Math.max(0, Math.min(1, +b || 0)); }
  function setOn(v: boolean) { on_ = v; if (!on_) { for (const A of T.slice()) remove(A); showCrates(0); crT = -1; } nextD = rnd(20, 40); nextP = rnd(60, 120); }
  const off = window.CWFun ? window.CWFun.on((k, v) => { if (k === 'shops') setOn(v !== false); }) : null;

  return { setBusy, frame,
    stats: () => ({ on: on_, trucks: T.map(A => [A.st, +A.x.toFixed(1), +A.z.toFixed(1)] as [string, number, number]), came, pass, next: +Math.max(0, nextD).toFixed(0), nextPass: +Math.max(0, nextP).toFixed(0) }),
    dispose() { if (off) off(); for (const A of T.slice()) remove(A); for (const m of crates) { S.group.remove(m); m.geometry.dispose(); } } };
}
