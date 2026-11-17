// Finished agents go home. When an agent clocks out, its own vehicle (vehicles/sports-car.ts carLeave asks homeTrip) mostly
// drives straight home to the apartments (buildings/apartments.ts); about one in three goes to the shops first and parks there
// while the driver shops (vehicles/shop-visitor.ts agent), then drives home. At home it parks in a free spot (car or motorcycle),
// the driver walks to the door of their block and goes in, and a few more windows light up (setHome). After a while the driver
// comes out again, walks back to the vehicle and drives off out of town; when that cannot happen soon, the vehicle fades out
// where it stands, so the car park never fills for good.
// Limits: at most MAXROAD of these trips at once (driving there, shopping, parking, leaving); the rest drive off out of town as
// before. A full car park: off out of town too. Pickups do not shop (too long for the shop spots).
// The car park is one way (in at the east, out at the west, apartments.ts): nobody drives in while somebody reverses out of a
// spot, and nobody reverses out while somebody drives in or is still on the lanes.
// Reduced motion: no driving and no walking. A finished agent's vehicle stands in a home spot (homeStay) and their windows are lit.
import * as THREE from 'three';
import { reduced } from '../common/dom.js';
import type { P2 } from '../common/types.js';
import type { OfficeState } from './state.js';
import type { OfficeLeg, SportsCar } from './types.js';
import { HOME_LOT, type Apartments, type HomeSpot } from './buildings/apartments.js';
import type { ShopTraffic } from './vehicles/shop-visitor.js';
import { addLegs, gait, gaitDip, walkSpeed } from './gait.js';
import { crowdOf, crowdId, CROWD_HOME, type Plan } from './crowd.js';

/** What carLeave gets back: the road node the off leg drives to, the way on from there (world), its waits (r: its road part) and its end;
 *  cancel: the trip is off after all (no way there). */
export interface HomeTrip { to: string; tail: P2[]; on: (L: OfficeLeg, r: P2[]) => void; end: () => void; cancel: () => void }
export interface Homes {
  frame: (dt: number) => void;
  /** Counts for the probe. force: the next finished agent goes ('home', 'shop', or either at the usual odds), past the odds and the limit. */
  stats: () => Record<string, unknown>;
  force: (how: 'home' | 'shop' | 'any') => void;
  /** false: no new trips (every finished agent drives off out of town, as before); the ones under way finish. */
  setOn: (v: boolean) => void;
}

type HomeSt = 'shop' | 'drive' | 'park' | 'walk' | 'home' | 'fetch' | 'wait' | 'back' | 'out' | 'fade' | 'stand';
interface Walker { g: THREE.Group; aL: THREE.Mesh; aR: THREE.Mesh; lL: THREE.Mesh; lR: THREE.Mesh; ga: number; P: P2[]; i: number; x: number; z: number; rot: number; k: number; ph: number; v: number; id: number; lat: number } // v: their walking speed (gait.ts walkSpeed); id: in the town's crowd (crowd.ts); lat: how far left of their way (m, passing)
interface Homer { A: SportsCar; sp: HomeSpot; st: HomeSt; t: number; stay: number; role: string; W: Walker | null; shop: boolean }

const MAXROAD = 3, SHOP_P = 1 / 3, BASE = 28, PER = 6, WAITMAX = 30, BUSY = 60; // MAXROAD: trips at once; BASE: windows lit anyway; PER: windows per agent at home; BUSY: vehicles in town from which a parked one fades instead of driving off
const { OXX, IXX, LHW, XLZ, MAZ, MZ, WCX, ECX } = HOME_LOT;
const RC = 2.6, RM = 1.6; // turn radius into a spot: car, motorcycle
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const TRIP: HomeSt[] = ['shop', 'drive', 'park', 'fetch', 'wait', 'back', 'out'];

export function makeHomes(OS: OfficeState, H0: Apartments, visit: ShopTraffic): Homes {
  const { vehs, route, mkLeg, on, arc, dropVeh, place, leftOut, leftIn, cars, G, BODY, mesh, clothMat, veh } = OS;
  const all: Homer[] = [];
  let forceNext: 'home' | 'shop' | 'any' | null = null, on_ = true; // on_: the probe can turn new trips off (to compare the traffic)
  const tot = { home: 0, shop: 0, noShop: 0, full: 0, capped: 0, drove: 0, faded: 0, lost: 0 }; // noShop: wanted to shop, no room there (straight home)
  const cs = Math.cos(H0.origin.rot), sn = Math.sin(H0.origin.rot);
  const W = (P: P2[]) => P.map(p => H0.toWorld(p[0], p[1]));
  const toLocal = (x: number, z: number): P2 => { const dx = x - H0.origin.x, dz = z - H0.origin.z; return [dx * cs - dz * sn, dx * sn + dz * cs]; };
  const inLot = (A: { x: number; z: number }) => { const [x, z] = toLocal(A.x, A.z); return z < -.3 && z > XLZ - LHW - 1 && x > OXX - LHW - 1 && x < IXX + LHW + 1; };
  const zh = H0.origin.z + 6.5, [ox] = H0.toWorld(OXX, 0); // the apartments road's centre line and the car park's out road (roads.ts)

  // ── spots and the ways in the car park (local frame) ──
  const taken = (sp: HomeSpot) => all.some(h => h.sp === sp);
  const spotFor = (c: SportsCar) => { const L = (c.kind === 'moto' ? H0.motos : H0.cars).filter(sp => !taken(sp)); return L.length ? L[Math.floor(Math.random() * L.length)] : null; };
  const east = (sp: HomeSpot) => sp.kind === 'car' && sp.pose.local.x > (WCX + ECX) / 2;
  function wayIn(sp: HomeSpot): P2[] { const { x, z } = sp.pose.local;
    if (sp.kind === 'moto') return [[IXX, 0], [IXX, MAZ + LHW], [IXX - LHW, MAZ], [x + RM, MAZ], ...arc(x + RM, MAZ + RM, RM, -Math.PI / 2, -Math.PI).slice(1), [x, MZ]];
    if (east(sp)) return [[IXX, 0], [IXX, z + RC], ...arc(IXX - RC, z + RC, RC, 0, -Math.PI / 2).slice(1), [ECX, z]];
    return [[IXX, 0], [IXX, XLZ + LHW], [IXX - LHW, XLZ], [OXX + LHW, XLZ], [OXX, XLZ + LHW], [OXX, z - RC], ...arc(OXX + RC, z - RC, RC, Math.PI, Math.PI / 2).slice(1), [WCX, z]]; }
  function wayBack(sp: HomeSpot): P2[] { const { x, z } = sp.pose.local;
    if (sp.kind === 'moto') return [[x, MZ], [x, MAZ + RM], ...arc(x + RM, MAZ + RM, RM, -Math.PI, -Math.PI / 2).slice(1)];
    if (east(sp)) return [[ECX, z], [IXX - RC, z], ...arc(IXX - RC, z + RC, RC, -Math.PI / 2, 0).slice(1)];
    return [[WCX, z], [OXX + RC, z], ...arc(OXX + RC, z - RC, RC, Math.PI / 2, Math.PI).slice(1)]; }
  function wayOut(sp: HomeSpot): P2[] { const { x, z } = sp.pose.local;
    if (sp.kind === 'moto') return [[x + RM, MAZ], [OXX + LHW, MAZ], [OXX, MAZ + LHW], [OXX, 0]];
    if (east(sp)) return [[IXX, z + RC], [IXX, XLZ + LHW], [IXX - LHW, XLZ], [OXX + LHW, XLZ], [OXX, XLZ + LHW], [OXX, 0]];
    return [[OXX, z - RC], [OXX, 0]]; }

  // ── the rule in the car park ──
  const backing = () => all.some(h => h.st === 'back');
  const canBack = (h: Homer) => !all.some(o => o !== h && (o.st === 'park' || o.st === 'back' || (o.st === 'out' && inLot(o.A))));
  const trips = () => all.filter(h => TRIP.includes(h.st)).length;
  const atHome = () => all.filter(h => h.st === 'home' || h.st === 'stand').length;

  // ── the driver on foot (a child of the apartments group, local frame): from the vehicle to the door, or back ──
  function walker(role: string, P: P2[]): Walker {
    const g = new THREE.Group(), m = clothMat(role), aL = mesh(G.arm, m, true, false), aR = mesh(G.arm, m, true, false); g.rotation.order = 'YXZ';
    aL.position.set(-.29, 1.05, .04); aR.position.set(.29, 1.05, .04); g.add(mesh(G.torso, m, true, false), aL, aR);
    const { lL, lR } = addLegs(g, (geo, mt) => mesh(geo, mt, true, false), BODY[Math.floor(Math.random() * BODY.length)], G.leg, G.head);
    H0.group.add(g); const w: Walker = { g, aL, aR, lL, lR, ga: 0, P, i: 1, x: P[0][0], z: P[0][1], rot: 0, k: 0, ph: Math.random() * 6, v: walkSpeed(), id: crowdId(CROWD_HOME, uid++), lat: 0 }; put(w); return w;
  }
  // the town's crowd (crowd.ts): someone slower ahead: out to the side and past them where the way is wide enough (the
  // pavement, the car park footpath), else behind them at their speed (the walkway between the rows and the courtyard
  // paths are too narrow to pass on, the gaps between the cars too); oncoming: keep right where there is room; and they are
  // in it for the others. The apartments' frame is a rotation of the world.
  // The walkable strips (local; apartments.ts layout): x0, x1, z0, z1. room: how far one can go from (x, z) in the
  // direction (dx, dz) and stay on them; passing keeps the shoulders (SHOULDER: half a body with its arms) inside
  const STRIPS: [number, number, number, number][] = [[-38, 31.5, -3, 0], [9.4, 11.6, XLZ - LHW, -3], [19.7, 21.1, XLZ - LHW, -9], [-27, 9.4, HOME_LOT.ZP - .8, HOME_LOT.ZP + .8]], SHOULDER = .35, PASSW = .75;
  function room(x: number, z: number, dx: number, dz: number) { let r = 0;
    for (const [x0, x1, z0, z1] of STRIPS) { if (x < x0 || x > x1 || z < z0 || z > z1) continue;
      const tx = dx > 1e-6 ? (x1 - x) / dx : dx < -1e-6 ? (x0 - x) / dx : 1e9, tz = dz > 1e-6 ? (z1 - z) / dz : dz < -1e-6 ? (z0 - z) / dz : 1e9; r = Math.max(r, Math.min(tx, tz)); }
    return r; }
  let passes = 0; // passes begun (each once)
  let uid = 0; const C = crowdOf(OS), pl: Plan = { lat: 0, v: 0, passing: false }, [h0x, h0z] = H0.toWorld(0, 0), [h1x, h1z] = H0.toWorld(1, 0), wcs = h1x - h0x, wsn = h0z - h1z;
  function put(w: Walker) { w.g.position.set(w.x, .08, w.z); w.g.rotation.y = w.rot; w.g.scale.setScalar(Math.max(.001, w.k)); w.g.visible = w.k > 0; }
  function dropW(h: Homer) { if (h.W) { H0.group.remove(h.W.g); h.W = null; } }
  /** One step; true: at the end of the way (and faded out there). */
  function stepW(w: Walker, dt: number): boolean {
    const end = w.i >= w.P.length; w.k = end ? Math.max(0, w.k - dt * 3) : Math.min(1, w.k + dt * 3);
    let mv = 0; // how far this frame
    const [wx, wz] = H0.toWorld(w.x, w.z), lx = Math.sin(w.rot), lz = Math.cos(w.rot), fx = lx * wcs + lz * wsn, fz = lz * wcs - lx * wsn;
    if (!end) { const n0 = w.P[w.i], a0 = w.P[w.i - 1], gx = n0[0] - a0[0], gz = n0[1] - a0[1], gl = Math.hypot(gx, gz) || 1, ux = gx / gl, uz = gz / gl;
      const bx = w.x - uz * w.lat, bz = w.z + ux * w.lat; // where on their way they are (w.lat back to the right; left of the leg: (uz, -ux))
      const latL = Math.min(PASSW, Math.max(0, room(bx, bz, uz, -ux) - SHOULDER)), latR = Math.min(PASSW, Math.max(0, room(bx, bz, -uz, ux) - SHOULDER));
      C.plan(w.id, wx, wz, ux * wcs + uz * wsn, uz * wcs - ux * wsn, w.v, .3, w.lat, latL, latR, pl);
      const lat0 = w.lat; w.lat += (pl.lat - w.lat) * Math.min(1, dt * 2.5); if (Math.abs(w.lat) < .005) w.lat = 0;
      if (Math.abs(lat0) < .3 && Math.abs(w.lat) >= .3) passes++;
      const n: P2 = w.lat ? [n0[0] + uz * w.lat, n0[1] - ux * w.lat] : n0, dx = n[0] - w.x, dz = n[1] - w.z, d = Math.hypot(dx, dz), s = pl.v * dt;
      if (d <= s) { w.x = n[0]; w.z = n[1]; w.i++; mv = d; } else { w.x += dx / d * s; w.z += dz / d * s; w.rot = OS.dA(w.rot, Math.atan2(dx, dz), 10, dt); mv = s; } }
    const sw = gait(w, mv, dt); w.aL.rotation.x = sw; w.aR.rotation.x = -sw; put(w); w.g.position.y += gaitDip(w); // the legs on the distance walked (gait.ts)
    if (w.k > .05) C.put(w.id, wx, wz, fx, fz, dt > 0 ? mv / dt : 0, .3);
    return end && w.k === 0;
  }

  // ── a trip ──
  const setRide = (h: Homer, ride: boolean) => { if (h.A.kind === 'moto') { const m = G.moto[h.A.vr % G.moto.length]; (h.A.g as THREE.Mesh).geometry = ride ? m.ride : m.park; } };
  function remove(h: Homer, drop: boolean) { dropW(h); const i = all.indexOf(h); if (i >= 0) all.splice(i, 1); if (drop) dropVeh(h.A); }
  /** The lot entry: wait just inside while somebody reverses out, then drive in. */
  function lotWait(h: Homer, L: OfficeLeg) { const [x, z] = H0.toWorld(IXX, -1.2); on(L, x, z, () => { if (backing()) return false; h.st = 'park'; return true; }, null, 6, false, 'homein'); }
  function parked(h: Homer) { const p = h.sp.pose.world; h.A.rot = p.rot; setRide(h, false); h.st = 'walk'; h.t = 0; h.W = walker(h.role, h.sp.walk.local); }
  function homeTrip(c: SportsCar): HomeTrip | null {
    if (reduced || !on_) return null;
    const f = forceNext; if (!f && trips() >= MAXROAD) { tot.capped++; return null; }
    const sp = spotFor(c); if (!sp) { tot.full++; return null; }
    forceNext = null; cars.delete(c); // from here on it is no staff car any more (frame.ts, offices.ts leave it alone)
    const h: Homer = { A: c, sp, st: 'drive', t: 0, stay: rnd(60, 150), role: c.P ? c.P.a.role : 'dev', W: null, shop: false }; all.push(h);
    const wantShop = f === 'shop' || (f !== 'home' && Math.random() < SHOP_P);
    const S = wantShop && c.kind !== 'pickup' ? visit.agent(c, c.kind === 'moto' ? 'moto' : 'car', c.vr, () => { if (!all.includes(h)) return null; h.st = 'drive'; return { to: 'apt:in', tail: W(wayIn(sp)).slice(1), add: L => lotWait(h, L), end: () => parked(h) }; }) : null;
    const undo = () => { remove(h, false); cars.add(c); };
    if (wantShop && !S) tot.noShop++;
    if (S) { h.st = 'shop'; h.shop = true; tot.shop++; return { to: 'shop:in', tail: S.tail, on: (L, r) => S.add(L, r), end: S.end, cancel: () => { S.cancel(); undo(); tot.shop--; } }; }
    tot.home++; return { to: 'apt:in', tail: W(wayIn(sp)).slice(1), on: L => lotWait(h, L), end: () => parked(h), cancel: () => { undo(); tot.home--; } };
  }
  function leaveLot(h: Homer) { const r = route('apt:out', OS.gateOut(), 'truck'); if (!r) { h.st = 'fade'; return; }
    h.st = 'back'; setRide(h, true); const A = h.A;
    const back = mkLeg(W(wayBack(h.sp)), { rev: true, v: 2.2, end: () => { h.st = 'out'; } });
    const off = mkLeg([...W(wayOut(h.sp)), ...r.slice(1)], { fout: true, end: () => { tot.drove++; remove(h, true); } });
    leftOut(off, ox, zh, A, r); leftIn(off, A, r); A.legs.push(back, off);
  }
  // reduced motion: the vehicle stands in a home spot (a copy of its body; the vehicle itself is dropped as before)
  function homeStay(c: SportsCar) {
    if (!reduced) return; const sp = spotFor(c); if (!sp) { tot.full++; return; }
    const p = sp.pose.world, m = c.g as THREE.Mesh, kind = c.kind;
    const geo = kind === 'moto' ? G.moto[c.vr % G.moto.length].park : m.geometry, A = veh(kind, new THREE.Mesh(geo, m.material), p.x, p.z, p.rot) as unknown as SportsCar;
    (A.g as THREE.Mesh).castShadow = m.castShadow; A.vr = c.vr; place(A);
    all.push({ A, sp, st: 'stand', t: 0, stay: rnd(60, 150), role: c.P ? c.P.a.role : 'dev', W: null, shop: false }); tot.home++;
  }
  OS.homeTrip = homeTrip; OS.homeStay = homeStay;

  let lit = -1;
  function frame(dt: number) {
    dt = Math.min(dt, .1); C.begin(CROWD_HOME);
    for (const h of all.slice()) {
      if (!vehs.includes(h.A)) { tot.lost++; remove(h, false); continue; } // dropped elsewhere (the shops turned off): gone
      if (h.st === 'walk' && h.W && stepW(h.W, dt)) { dropW(h); h.st = 'home'; h.t = 0; }
      else if (h.st === 'home' || h.st === 'stand') { h.t += dt;
        if (h.t > h.stay) { if (h.st === 'stand') { remove(h, true); continue; }
          if (vehs.length >= BUSY) h.st = 'fade'; // a busy town: no second trip on its roads
          else if (trips() < MAXROAD) { h.st = 'fetch'; h.t = 0; h.W = walker(h.role, h.sp.walk.local.slice().reverse()); } else if (h.t > h.stay + WAITMAX) h.st = 'fade'; } }
      else if (h.st === 'fetch' && h.W && stepW(h.W, dt)) { dropW(h); h.st = 'wait'; h.t = 0; }
      else if (h.st === 'wait') { h.t += dt; if (canBack(h) && !h.A.leg && !h.A.legs.length) leaveLot(h); else if (h.t > WAITMAX) h.st = 'fade'; }
      if (h.st === 'fade') { h.A.k = Math.max(0, h.A.k - dt * 4); place(h.A); if (h.A.k <= 0) { tot.faded++; remove(h, true); } } // stepVeh brings a parked one's k back up by 2 dt
    }
    const n = Math.min(H0.windows, BASE + PER * atHome()); if (n !== lit) { lit = n; H0.setHome(n); }
  }

  return { frame, force(how) { forceNext = how; }, setOn(v) { on_ = v; },
    stats() { const c = (s: HomeSt[]) => all.filter(h => s.includes(h.st)).length;
      return { driving: c(['drive', 'park']), shopping: c(['shop']), parked: all.filter(h => !['shop', 'drive', 'park', 'out'].includes(h.st)).length, atHome: atHome(), walking: c(['walk', 'fetch']), leaving: c(['wait', 'back', 'out']), fading: c(['fade']), trips: trips(), max: MAXROAD, passes,
        lit: lit, windows: H0.windows, force: forceNext, on: on_, reduced, total: { ...tot }, free: { cars: H0.cars.filter(s => !taken(s)).length, motos: H0.motos.filter(s => !taken(s)).length },
        at: all.map(h => [h.A.kind, h.st, h.sp.kind + h.sp.i, +h.A.x.toFixed(1), +h.A.z.toFixed(1), h.W ? [+h.W.x.toFixed(1), +h.W.z.toFixed(1)] : null]) }; } };
}
