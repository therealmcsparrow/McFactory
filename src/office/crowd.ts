// The people on foot in town (shoppers.ts, dogs.ts with their dogs, homes.ts), shared between the systems that move them,
// so they pass each other whoever moves them. Each system puts its walkers in every frame (world x/z, the way they face,
// speed, radius) and asks plan() how to go on: someone slower ahead in my lane makes me step out to the left (within the
// room the caller gives), pass and step back once a little clear of them; someone coming the other way in my lane makes
// me keep right; if the passing side is taken (oncoming, or someone already passing there) I follow at the speed of the
// one ahead instead of walking into them.
// What plan() reads is what everybody put the frame before (begin() starts a new frame when a system begins twice).
// Cheap for a big town: a hashed grid of CELL m cells, linked lists in typed arrays, nothing allocated per frame;
// plan() only looks at the cells within LOOK m.
const CELL = 4, HB = 1024, LOOK = 7;
// SLOWER: how much slower (m/s) someone must be to be passed (else follow); CLEAR: how far behind me (m) they must be before
// I step back in; SIDE: the gap (m) between shoulders when passing (on top of both radii); BOOST: speed factor while passing
// KEEP: how far right (m) one keeps for oncoming people
const SLOWER = .25, CLEAR = 1, SIDE = .1, BOOST = 1.15, KEEP = .15;

class Gen {
  n = 0; cap: number; head = new Int32Array(HB).fill(-1);
  X: Float32Array; Z: Float32Array; FX: Float32Array; FZ: Float32Array; V: Float32Array; R: Float32Array; ID: Int32Array; NX: Int32Array;
  constructor(cap: number) { this.cap = cap; this.X = new Float32Array(cap); this.Z = new Float32Array(cap); this.FX = new Float32Array(cap); this.FZ = new Float32Array(cap);
    this.V = new Float32Array(cap); this.R = new Float32Array(cap); this.ID = new Int32Array(cap); this.NX = new Int32Array(cap); }
  clear() { if (this.n) this.head.fill(-1); this.n = 0; }
  grow() { const o = this.cap, c = o * 2, cp = <T extends Float32Array | Int32Array>(a: T, b: T) => { b.set(a); return b; };
    this.X = cp(this.X, new Float32Array(c)); this.Z = cp(this.Z, new Float32Array(c)); this.FX = cp(this.FX, new Float32Array(c)); this.FZ = cp(this.FZ, new Float32Array(c));
    this.V = cp(this.V, new Float32Array(c)); this.R = cp(this.R, new Float32Array(c)); this.ID = cp(this.ID, new Int32Array(c)); this.NX = cp(this.NX, new Int32Array(c)); this.cap = c; }
}
const cell = (x: number, z: number) => (((Math.floor(x / CELL) * 73856093) ^ (Math.floor(z / CELL) * 19349663)) >>> 0) % HB;

/** What plan() says: lat, how far left of its own lane the walker should be (m, negative: right); v, the speed it may walk at most. */
export interface Plan { lat: number; v: number; passing: boolean }

export class Crowd {
  private w = new Gen(256); private r = new Gen(256); private seen = 0;
  /** A system (bit sys, 0..30) starts its frame; the second begin of the same system starts a new frame for everybody. */
  begin(sys: number) { const b = 1 << sys; if (this.seen & b) { const t = this.r; this.r = this.w; this.w = t; this.w.clear(); this.seen = 0; } this.seen |= b; }
  /** One walker (or a dog: same id as its walker, so they never hold each other up). f: the way they go (unit), v: m/s, rad: m. */
  put(id: number, x: number, z: number, fx: number, fz: number, v: number, rad: number) {
    const G = this.w; if (G.n === G.cap) G.grow(); const i = G.n++, h = cell(x, z);
    G.X[i] = x; G.Z[i] = z; G.FX[i] = fx; G.FZ[i] = fz; G.V[i] = v; G.R[i] = rad; G.ID[i] = id; G.NX[i] = G.head[h]; G.head[h] = i;
  }
  /** How walker id at (x, z), going (fx, fz) at up to v with radius rad and lat m left of its lane now, should go on: out.lat in
   *  [-latR, latL] (latL, latR: how far its middle may go left / right of its lane and stay on the walkable width; passing
   *  needs rad + theirs + SIDE of it, else it follows; keeping right for oncoming takes up to KEEP of latR), out.v: the speed
   *  to walk at (callers use it as is: up to BOOST * v while passing). */
  plan(id: number, x: number, z: number, fx: number, fz: number, v: number, rad: number, lat: number, latL: number, latR: number, out: Plan): Plan {
    const G = this.r; let cap = v, block = false, busy = false, busyR = false, right = false, room = 0; // room: the side step passing the slowest one ahead needs; busy(R): the left (right) passing side is taken
    const c0 = Math.floor((x - LOOK) / CELL), c1 = Math.floor((x + LOOK) / CELL), d0 = Math.floor((z - LOOK) / CELL), d1 = Math.floor((z + LOOK) / CELL);
    for (let cx = c0; cx <= c1; cx++) for (let cz = d0; cz <= d1; cz++) {
      const h = (((cx * 73856093) ^ (cz * 19349663)) >>> 0) % HB;
      for (let i = G.head[h]; i >= 0; i = G.NX[i]) {
        if (G.ID[i] === id) continue;
        const rx = G.X[i] - x, rz = G.Z[i] - z; if (Math.abs(rx) > LOOK || Math.abs(rz) > LOOK) continue; // another cell hashed here
        const fw = rx * fx + rz * fz, sd = rx * fz - rz * fx, ls = sd + lat, need = rad + G.R[i] + .2, dot = G.FX[i] * fx + G.FZ[i] * fz, qv = G.V[i];
        if (fw < -2 || fw > LOOK) continue;
        const band = Math.abs(sd) < rad + G.R[i] + .05; // in the way where I am now (bodies touching; passing goes closer than need)
        if (dot > .3 || (qv < .05 && dot > -.3)) { // going my way (or standing, not facing me: one waiting facing me is oncoming)
          if (qv < v - SLOWER && fw > -CLEAR && fw < 4 && Math.abs(ls) < need) { block = true; room = Math.max(room, rad + G.R[i] + SIDE); } // clearly slower, in my lane ahead (or not yet CLEAR behind me): pass
          if (fw > -1.5 && fw < 3 && !(fw < 0 && qv <= v)) { if (Math.abs(ls - latL) < need) busy = true; if (Math.abs(ls + latR) < need) busyR = true; } // someone on that passing side already
          if (band && fw > 0 && fw < 2) cap = Math.min(cap, qv + Math.max(0, fw - (rad + G.R[i] + .5)) * 1.5); // close behind: their speed
        } else if (dot < -.3) { // coming the other way
          if (fw > 0 && Math.abs(ls - latL) < need + .2) busy = true;
          if (fw > 0 && fw < 6 && Math.abs(ls + latR) < need + .2) busyR = true;
          if (fw > 0 && fw < 3.5 && Math.abs(sd) < need) right = true;
          if (band && fw > 0 && fw < rad + G.R[i] + .4) cap = Math.min(cap, .15);
        } else if (band && fw > 0 && fw < 1.5) cap = Math.min(cap, Math.max(0, fw - (rad + G.R[i] + .2)) * 1.5); // crossing my way just ahead
      }
    }
    // pass only with room for it (no room on the walkable width: wait behind at their speed, the band cap above), and not
    // into someone; half way out already: finish the pass (the others keep right). Passing, a little quicker (BOOST), so a
    // pass takes seconds, not half a street
    // Left as a rule; on the right when only there is room (the left of a pavement can be the curb). Out already: that side.
    const okL = block && latL >= room && (!busy || lat > latL * .5), okR = block && latR >= room && (!busyR || lat < -latR * .5);
    const side = lat < -KEEP - .05 ? (okR ? -1 : okL ? 1 : 0) : okL ? 1 : okR ? -1 : 0, passing = side !== 0;
    out.lat = side > 0 ? latL : side < 0 ? -latR : right ? -Math.min(KEEP, latR) : 0; out.v = Math.max(0, passing ? Math.min(cap, v) * BOOST : cap); out.passing = passing;
    return out;
  }
  /** Walkers put in the last frame (probe). */
  get count() { return this.r.n; }
}

const all = new WeakMap<object, Crowd>();
/** The crowd of one office view (OS): made on first use. */
export const crowdOf = (OS: object): Crowd => { let C = all.get(OS); if (!C) { C = new Crowd(); all.set(OS, C); } return C; };
/** Ids: one block per system, so walkers of different systems never share one. */
export const CROWD_SHOP = 1, CROWD_DOGS = 2, CROWD_HOME = 3;
export const crowdId = (sys: number, i: number) => sys * 1000000 + i;
