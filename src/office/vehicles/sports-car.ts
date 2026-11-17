// Agent vehicles: each person drives to work in their own vehicle, parks nose-in at their building and reverses out when
// they leave. Which one (rideOf): a sports car (body in the colour of their role), an SUV, a hatchback, a pickup or (about
// 1 in 7) a motorcycle, and its colour, follow from a hash of the agent id, so an agent always comes in the same one.
// sportsCarGeometry is the sports car model (the others are in suv.ts, hatchback.ts, pickup.ts, motorcycle.ts);
// makeSportsCars drives them all.
import type * as THREE from 'three';
import type { P2 } from '../../common/types.js';
import type { OSAtSportsCars } from '../state.js';
import type { AgentRide, Office, Person, SportsCar } from '../types.js';
import { hashf } from '../../common/math.js';
import { WHEEL, type Parts } from './parts.js';
import { SUV_SIZE } from './suv.js';
import { HATCH_SIZE } from './hatchback.js';
import { PICKUP_SIZE } from './pickup.js';

/** The share of each vehicle among the agents (cumulative), and how long each one is. */
const RIDES: readonly [AgentRide, number][] = [['moto', .15], ['car', .38], ['suv', .58], ['hatch', .79], ['pickup', 1]];
const RIDE_LEN: Record<AgentRide, number> = { car: 2.6, moto: 2.1, suv: SUV_SIZE.len, hatch: HATCH_SIZE.len, pickup: PICKUP_SIZE.len };
/** The vehicle an agent comes in and its colour variant: the same for the same agent id every time. */
export function rideOf(id: string): { kind: AgentRide; vr: number } {
  const h = hashf(id, 71); return { kind: (RIDES.find(r => h < r[1]) || RIDES[RIDES.length - 1])[0], vr: Math.floor(hashf(id, 72) * 64) };
}

/** Sports car model, nose to +z; the white parts take the role colour (the material tints them). */
export function sportsCarGeometry({ bx, cy, merge }: Parts): THREE.BufferGeometry {
  const C = [];
  C.push(bx(1.15, .3, 2.6, 0, .34, 0, '#fff'), bx(1.05, .12, 1, 0, .5, .75, '#fff'), bx(.95, .27, 1.05, 0, .6, -.2, '#11151c'), bx(1.12, .05, .26, 0, .7, -1.2, '#fff'), bx(.08, .14, .08, -.45, .6, -1.2, WHEEL), bx(.08, .14, .08, .45, .6, -1.2, WHEEL));
  for (const x of [-.56, .56]) for (const z of [-.85, .85]) C.push(cy(.25, .16, x, .25, z, WHEEL, 12, Math.PI / 2));
  return merge(C);
}

export function makeSportsCars(OS: OSAtSportsCars) {
  const { SPOTX, SPOTZ, HZ, veh, mesh, G, VC, carMat, cars, spawnQ, drop, leavers, bldgs, route, mkLeg, arc, SVZ, canLeave, leftOut, leftIn, SLIPX, STZ, on, LO, dropVeh, vehs, NSPOT, LOTZ, LOTK, LOTX } = OS;
  // ── agent vehicles: in through the gate, nose-in to a spot, reverse out, off through the gate ──
  // a long one (the pickup) parks with its nose at the kerb (HZ + 1.1) instead of at SPOTZ, so its tail stays clear of the forecourt lane
  const spotZ = (kind: AgentRide) => Math.max(SPOTZ, HZ + 1.15 + RIDE_LEN[kind] / 2);
  const spotW = (c: SportsCar): P2 => [c.F.ox + c.sx, c.F.oz + c.pz];
  // the side car park (spots NSPOT and up, layout.ts): in straight up the in road's line and nose-in to the east; out by reversing into the
  // lane at LOTX and down it to the forecourt lane. Where that lane meets the forecourt lane it crosses the way in to the forecourt spots: a car
  // on its way out waits short of it until nothing is coming in there, then claims it (cm) and the next one in waits at the in road until it is past
  const side = (spot: number) => spot >= NSPOT;
  const sideOut = (F: Office) => vehs.some(O => O.F === F && (O as SportsCar).cm);
  const inZone = (F: Office) => vehs.some(O => O.inb && O.F === F && !side((O as SportsCar).spot) && O.x > F.ox + 5 && O.x < F.ox + SLIPX + 1.6 && O.z > F.oz + SPOTZ - 1 && O.z < F.oz + STZ - 3);
  const motoGeo = (vr: number, ride: boolean) => { const m = G.moto[vr % G.moto.length]; return ride ? m.ride : m.park; };
  const body = (kind: AgentRide, vr: number, role: string, ride: boolean) => kind === 'car' ? mesh(G.car, carMat(role)) : kind === 'moto' ? mesh(motoGeo(vr, ride), VC) : mesh(G[kind][vr % G[kind].length], VC);
  /** A motorcycle shows its rider while it rides, and stands without one when parked. */
  const setRide = (c: SportsCar, ride: boolean) => { if (c.kind === 'moto') (c.g as THREE.Mesh).geometry = motoGeo(c.vr, ride); };
  function addCar(F: Office, spot: number, role: string, P: Person | null, parked: boolean) {
    const { kind, vr } = rideOf(P ? P.a.id : role + spot), sd = side(spot), sx = sd ? LOTK - RIDE_LEN[kind] / 2 : SPOTX(spot), pz = sd ? LOTZ(spot - NSPOT) : spotZ(kind);
    const c = veh(kind, body(kind, vr, role, !parked), F.ox + sx, F.oz + pz, sd ? Math.PI / 2 : Math.PI) as unknown as SportsCar; Object.assign(c, { F, spot, sx, pz, vr, P, st: parked ? 'parked' : 'wait' });
    F.spots[spot] = c; cars.add(c); if (!parked) { c.ghost = true; c.gk = 0; c.g.scale.setScalar(.001); c.gi = OS.gateIn(false)!; spawnQ.push(c); } return c;
  }
  function arrived(c: SportsCar) { c.st = 'parked'; setRide(c, false); c.rot = side(c.spot) ? Math.PI / 2 : Math.PI; c.inb = false; drop(c.F.lock, c); const P = c.P; if (!P) return;
    if (P.gone) { leavers.delete(P); P.f.g.remove(P.g); c.P = null; carLeave(c); } else if (side(c.spot)) { P.state = 'walk'; P.x = c.sx - .3; P.z = c.pz - .9; P.path = [{ x: LOTX - 1.5, z: P.z, pre: true }, { x: LOTX - 1.5, z: 7.15, pre: true }, ...OS.walkIn(P, null)]; } // along the footpath by the building
    else { P.state = 'walk'; P.x = c.sx - .95; P.z = SPOTZ; P.path = OS.walkIn(P, c.sx); } }
  function spawn(c: SportsCar) { // from the gate to the spot: one forward leg
    const F = c.F, r = bldgs.get(F.id) === F && route(c.gi || 'gate:in', F.id + ':in', 'truck'), [x, z] = spotW(c); c.ghost = false; setRide(c, true);
    if (!r) { c.gk = 1; c.k = 0; arrived(c); return; }
    const sd = side(c.spot), L = mkLeg([...r, ...(sd ? [[F.ox + SLIPX, z + 2.2] as P2, ...arc(F.ox + SLIPX + 2.2, z + 2.2, 2.2, Math.PI, Math.PI * 1.5)] : arc(x + 2.2, F.oz + SVZ - 2.2, 2.2, Math.PI / 2, Math.PI)), [x, z]], { fin: true, end: () => arrived(c) });
    if (!sd) on(L, F.ox + SLIPX, F.oz + SVZ + 1.2, () => !sideOut(F), null, null, true, 'side'); leftIn(L, c, r); // a left turn into the in road waits for a gap (traffic.ts)
    c.inb = true; c.x = r[0][0]; c.z = r[0][1]; c.rot = Math.PI; c.k = 0; c.gk = 1; c.st = 'in'; c.legs.push(L);
  }
  function carLeave(c: SportsCar) {
    if (c.st === 'out') return; if (c.st === 'wait') { dropCar(c); return; } if (c.st === 'in') { c.P = null; c.end = true; return; }
    // a finished agent may drive home, or to the shops first (homes.ts): H says where the off leg goes and what it ends with; else off out of town
    const F = c.F, [x, z] = spotW(c); let H = OS.homeTrip ? OS.homeTrip(c) : null, r = route(F.id + ':out', H ? H.to : OS.gateOut(), 'truck'); // (may turn left out of the out road and into an in road: it waits for a gap)
    if (H && !r) { H.cancel(); H = null; r = route(F.id + ':out', OS.gateOut(), 'truck'); } if (!r) { dropCar(c); return; } c.st = 'out'; setRide(c, true);
    const sd = side(c.spot), lx = F.ox + LOTX, rx = lx + 2.9;
    const back = mkLeg(sd ? [[x, z], [rx, z], ...arc(rx, z - 2.9, 2.9, Math.PI / 2, Math.PI)] : [[x, z], ...arc(x + 2.2, F.oz + SVZ - 2.2, 2.2, Math.PI, Math.PI / 2)], { rev: true, v: 2.2, end: () => { if (F.spots[c.spot] === c) F.spots[c.spot] = null; } }); back.ev.push({ s: 0, fx: true, tag: 'leave', wait: () => { const ok = canLeave(F, c); c.parked = !ok; return ok; } }); // while it waits its turn it still counts as parked: a wide one reversing out next to it swings its nose closer than the margin for a moving vehicle
    const off = mkLeg(sd ? [[lx, z - 2.9], [lx, F.oz + SVZ - 2.1], ...arc(lx - 2.1, F.oz + SVZ - 2.1, 2.1, 0, Math.PI / 2), ...r, ...(H ? H.tail : [])] : [[x + 2.2, F.oz + SVZ], ...r, ...(H ? H.tail : [])], H ? { end: H.end } : { fout: true, end: () => dropCar(c) });
    if (H) H.on(off, r);
    if (sd) { on(off, lx, F.oz + SPOTZ - 2.4, () => { if (inZone(F)) return false; c.cm = true; return true; }, null, .6, false, 'sideout'); on(off, F.ox + 6, F.oz + SVZ, null, () => { c.cm = false; }); } leftOut(off, F.ox - SLIPX, F.oz + STZ, c, r); leftIn(off, c, r); on(off, F.ox - SLIPX, F.oz + STZ - LO, null, () => drop(F.lock, c)); c.legs.push(back, off);
  }
  function dropCar(c: SportsCar) { if (c.P && c.st === 'parked' && OS.homeStay) OS.homeStay(c); // reduced motion: a finished agent's vehicle stands at home instead (homes.ts)
    c.cm = false; if (c.F.spots[c.spot] === c) c.F.spots[c.spot] = null; const i = spawnQ.indexOf(c); if (i >= 0) spawnQ.splice(i, 1); cars.delete(c); dropVeh(c); }
  return { addCar, spawn, carLeave, dropCar };
}
