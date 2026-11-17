// Zebra crossings: people on foot have the right of way. roads.ts hands over every zebra's stripes (walks().zebras). A walker
// on a zebra, or about to step onto one within LOOK seconds, claims it (pass, called each frame by the walker); a vehicle whose way
// crosses a claimed zebra brakes to stop before the stripes and drives on once nobody claims it (stopAt, from traffic.ts).
// A walker steps on only when every vehicle coming can still stop comfortably (COMF m/s², MARGIN m to spare) before the stripes,
// no vehicle stands on them, no siren unit is on its way to them, and no vehicle would have to stop with its tail on a roundabout
// (one on the ring, or too close to its line to stop before it): otherwise the walker waits at the kerb. A vehicle at a
// roundabout's line also waits there while the zebra just past its exit is claimed (ringHold), so nobody stops on the ring.
// Siren units never stop for a zebra (walkers wait for them). The road net can change (OS.net.key): the zebras and the per-leg
// lookups are then read again.
//
//   const X = makeCrossings(OS); X.pass(walker, x, z, ux, uz, ahead) → may it go on; X.stopAt(A, L) → where A stops, or null.
import type { AnyVehicle, OfficeLeg } from './types.js';
import type { OSAtSportsCars } from './state.js';
import type { Zebra } from './walknet.js';

type CrossOS = Pick<OSAtSportsCars, 'vehs' | 'atL' | 'ringAt' | 'siren' | 'walks' | 'net' | 'simT'>;
export interface ZebraStats {
  zebras: number; claimed: number; // zebras in town, claimed now
  stops: number; carWaitMax: number; standing: number; // vehicles that stopped for a zebra, the longest stop (s), stopped now
  waits: number; walkWaitMax: number; waiting: number; // walkers that waited at the kerb, the longest wait (s), waiting now
  ringHolds: number; why: Record<string, number>; // vehicles held at a roundabout's line for the zebra past their exit
  at: [number, number][]; cars: [string, number, number, number][]; // the claimed zebras (centre); the vehicles stopped for one now (kind, x, z, s)
}
export interface Crossings {
  /** A walker at (x, z) heading (ux, uz): on a zebra, or one within `ahead` m (its dog's lead plus LOOK s of walking) → claims it. False: wait at the kerb. */
  pass(who: object, x: number, z: number, ux: number, uz: number, ahead: number): boolean;
  /** Where along leg L vehicle A stops for a claimed zebra ahead (s of its centre), or null. */
  stopAt(A: AnyVehicle, L: OfficeLeg): number | null;
  /** True while a zebra within `room` m past `s` on A's way (A's exit off a roundabout) is claimed: A waits at the line. */
  ringHold(A: AnyVehicle, L: OfficeLeg, s: number, room: number): boolean;
  /** Is (x, z) on a zebra or within pad m of one? */
  near(x: number, z: number, pad: number): boolean;
  stats(): ZebraStats;
}
interface Hit { s0: number; s1: number; i: number } // along a leg: where it enters and leaves zebra i
interface Clock { t0: number; last: number; i?: number } // i: the zebra a vehicle stands at

export const LOOK = 1.5;
const HOLD = .5, KEEP = 2, TURN = 6, COMF = 3.5, MARGIN = .6, SIREN_M = 40, SCAN = 30;

export function makeCrossings(OS: CrossOS): Crossings {
  let Z: Zebra[] = [], key: unknown = null, until = new Float64Array(0), hits = new WeakMap<OfficeLeg, Hit[]>(), rings = new WeakMap<OfficeLeg, [number, number][]>();
  const st = { stops: 0, carWaitMax: 0, waits: 0, walkWaitMax: 0, ringHolds: 0 }, carW = new Map<AnyVehicle, Clock>(), walkW = new Map<object, Clock>(), held = new Map<AnyVehicle, Clock>(), got = new Map<object, [number, number]>(); // got: walker -> [zebra, when it was let on]
  const mayC = new Map<number, boolean>(), why: Record<string, number> = {}, no = (k: string) => { why[k] = (why[k] || 0) + 1; return false; }; let mayT = -1; // why: frames a walker was kept at the kerb, by reason
  const q = { x: 0, z: 0, i: 0 };
  function sync() { if (OS.net.key === key) return; key = OS.net.key; Z = (OS.walks().zebras || []).slice(); until = new Float64Array(Z.length); hits = new WeakMap(); rings = new WeakMap(); got.clear(); }
  const inside = (i: number, x: number, z: number, pad: number) => { const [cx, cz, ux, uz, hl, hw] = Z[i], dx = x - cx, dz = z - cz; return Math.abs(dx * ux + dz * uz) < hl + pad && Math.abs(dz * ux - dx * uz) < hw + pad; };
  const zAt = (x: number, z: number, pad: number) => { for (let i = 0; i < Z.length; i++) if (inside(i, x, z, pad)) return i; return -1; };
  const busy = (i: number) => until[i] > OS.simT;
  // found once per leg: the stretches of it over a zebra, and over a roundabout
  function legHits(L: OfficeLeg) { let H = hits.get(L); if (H) return H; H = []; let cur: Hit | null = null;
    for (let k = 0; k < L.pts.length; k++) { const p = L.pts[k], i = zAt(p[0], p[1], .05);
      if (cur && cur.i !== i) { cur.s1 = L.cum[k]; H.push(cur); cur = null; } if (i >= 0 && !cur) cur = { s0: L.cum[k], s1: L.len, i }; }
    if (cur) H.push(cur); hits.set(L, H); return H; }
  function legRings(L: OfficeLeg) { let R = rings.get(L); if (R) return R; R = []; let a = -1;
    for (let k = 0; k < L.pts.length; k++) { const on = !!OS.ringAt(L.pts[k][0], L.pts[k][1]); if (on && a < 0) a = L.cum[k]; if (!on && a >= 0) { R.push([a, L.cum[k]]); a = -1; } }
    if (a >= 0) R.push([a, L.len]); rings.set(L, R); return R; }
  // A's way: its leg and the next one, with where each starts relative to A's leg
  const way = (A: AnyVehicle): [OfficeLeg, number][] => { const L = A.leg; if (!L) return []; const W: [OfficeLeg, number][] = [[L, 0]]; if (A.legs[0] && !A.legs[0].rev) W.push([A.legs[0], L.len]); return W; };
  const bodyOn = (O: AnyVehicle, i: number) => { const sx = Math.sin(O.rot), sz = Math.cos(O.rot); for (let j = -1; j <= 1; j++) if (inside(i, O.x + sx * O.off * j, O.z + sz * O.off * j, O.r)) return true; return false; };
  // may a walker step onto zebra i now? (once per zebra per frame)
  function may(i: number) { if (mayT !== OS.simT) { mayT = OS.simT; mayC.clear(); } const c = mayC.get(i); if (c !== undefined) return c; const r = mayNow(i); mayC.set(i, r); return r; }
  function mayNow(i: number) { const now = OS.simT;
    for (const W of [carW, held]) for (const c of W.values()) if (c.i === i && now - c.t0 > TURN && now - c.last < 1) return no('turn'); // a car stood TURN s for it (before the stripes, or at a roundabout's line): the next walker lets it go first
    for (const O of OS.vehs) { if (O.ghost || O.k < .05) continue; if (bodyOn(O, i)) return no('on'); if (O.parked || !O.leg || O.leg.rev) continue;
      const nose = O.s + O.off + O.r, sir = OS.siren(O), far = sir ? SIREN_M : SCAN;
      for (const [L, b] of way(O)) { let hit = false; for (const h of legHits(L)) { if (h.i !== i || b + h.s1 < O.s - O.off - O.r) continue; const ah = b + h.s0 - nose; if (ah > far) break; hit = true;
          if (sir || O.v * O.v / (2 * COMF) + (O.v < .3 ? .2 : MARGIN) > ah) return no(sir ? 'siren' : 'near'); // a siren unit on its way, or one that cannot stop in time (one standing before the stripes stays there)
          if (OS.ringAt(O.x, O.z)) return no('ring'); // on a roundabout: it would stop with its tail on the ring
          if (O.v >= .3) for (const [r0] of legRings(L)) { const dr = b + r0 - nose; if (dr > 0 && b + r0 < b + h.s0 && O.v * O.v / (2 * COMF) + MARGIN > dr) return no('line'); } // too close to the ring's line to stop before it (one standing at the line stays there: ringHold)
          break; } if (hit) break; } }
    return true; }
  function pass(who: object, x: number, z: number, ux: number, uz: number, ahead: number) { sync(); if (!Z.length) return true; const now = OS.simT;
    let i = zAt(x, z, .2); // on it: it goes on and keeps it
    if (i < 0) for (let d = .3; d <= ahead && i < 0; d += .3) i = zAt(x + ux * d, z + uz * d, 0);
    const w = walkW.get(who);
    if (i < 0) { got.delete(who); if (w) done(who, w); return true; }
    const on = zAt(x, z, .2) === i, g = got.get(who);
    if (on || (g && g[0] === i && now - g[1] < KEEP) || may(i)) { if (on || !g || g[0] !== i) got.set(who, [i, now]); until[i] = Math.max(until[i], now + HOLD); if (w) done(who, w); return true; }
    if (!w || now - w.last > 1) { walkW.set(who, { t0: now, last: now }); st.waits++; } else w.last = now;
    return false; }
  function done(who: object, w: Clock) { st.walkWaitMax = Math.max(st.walkWaitMax, w.last - w.t0); walkW.delete(who); }
  function stopAt(A: AnyVehicle, L: OfficeLeg) { sync(); let r: number | null = null, zi = -1;
    if (Z.length && !L.rev) { const nose = A.s + A.off + A.r, look = Math.max(6, A.v * A.v / 12 + 4);
      for (const [M, b] of way(A)) { if (b && M === L) continue; for (const h of legHits(M)) { if (b + h.s1 < A.s - A.off - A.r) continue; if (b + h.s0 - nose > look) break;
          if (!busy(h.i) || b + h.s0 < nose - .05) continue; // nobody on it, or its nose is already over the stripes: on
          const s = b + h.s0 - A.off - A.r - .4; // nose .4 m before the stripes
          if (legRings(M).some(([r0, r1]) => b + r1 > s - 2 * (A.off + A.r) && b + r0 < s)) continue; // never with its tail on a roundabout (the walker was told to wait)
          r = Math.max(A.s, s); zi = h.i; break; } if (r != null) break; } }
    const c = carW.get(A), now = OS.simT;
    if (r != null && r - A.s < 3 && A.v < .3) { if (!c || now - c.last > 1) { carW.set(A, { t0: now, last: now, i: zi }); st.stops++; } else { c.last = now; c.i = zi; } }
    else if (c && r == null) { st.carWaitMax = Math.max(st.carWaitMax, c.last - c.t0); carW.delete(A); }
    return r; }
  function ringHold(A: AnyVehicle, L: OfficeLeg, s: number, room: number) { sync(); if (!Z.length) return false;
    for (const [M, b] of way(A)) for (const h of legHits(M)) if (b + h.s1 > s && b + h.s0 < s + room && busy(h.i)) { const c = held.get(A), now = OS.simT; if (!c || c.i !== h.i || now - c.last > 1) { held.set(A, { t0: now, last: now, i: h.i }); st.ringHolds++; } else c.last = now; return true; }
    held.delete(A); return false; }
  function stats(): ZebraStats { sync(); const now = OS.simT; let claimed = 0; for (let i = 0; i < Z.length; i++) if (busy(i)) claimed++;
    for (const [A, c] of carW) if (now - c.last > 1 || !OS.vehs.includes(A)) { st.carWaitMax = Math.max(st.carWaitMax, c.last - c.t0); carW.delete(A); }
    for (const [w, c] of walkW) if (now - c.last > 1) done(w, c);
    for (const A of held.keys()) if (!OS.vehs.includes(A)) held.delete(A);
    const r1 = (v: number) => +v.toFixed(1);
    return { zebras: Z.length, claimed, stops: st.stops, carWaitMax: r1(Math.max(st.carWaitMax, ...[...carW.values()].map(c => c.last - c.t0))), standing: carW.size,
      waits: st.waits, walkWaitMax: r1(Math.max(st.walkWaitMax, ...[...walkW.values()].map(c => c.last - c.t0))), waiting: walkW.size, ringHolds: st.ringHolds, why: { ...why },
      at: Z.filter((_, i) => busy(i)).map(z => [r1(z[0]), r1(z[1])] as [number, number]), cars: [...carW.entries()].map(([A, c]) => [A.kind, r1(A.x), r1(A.z), r1(now - c.t0)] as [string, number, number, number]) }; }
  return { pass, stopAt, ringHold, stats, near: (x, z, pad) => { sync(); return zAt(x, z, pad) >= 0; } };
}
