// Townsfolk: humans and aliens walking the town's lanes, round every building, bay and sled pad, from a shop counter to
// a door, the plaza round the depot hall or the edge of a bay to watch the ships; they stop a while and move on. They
// step aside to pass each other (keeping right when head-on) and wait when they cannot get by; nobody heads for a spot
// someone else stands on or is walking to.
// Scenery: they show no data. How many with the "Townsfolk" setting (0 = none); with reduced motion they stand still.
import * as THREE from 'three';
import type { SceneCtx } from '../common/types.js';
import { G, mat, part } from './models.js';
import { makeNav, pathAt, pathLen, inside, TOWN_OBS, TOWN_SPOTS, PARK } from './terrain.js';

type P2 = [number, number];
type Kind = 'human' | 'robed' | 'bulb' | 'stalk' | 'horn' | 'tall' | 'tendril';
const KINDS: [Kind, number][] = [['human', 3], ['robed', 3], ['bulb', 1.2], ['stalk', 1.2], ['horn', 1.2], ['tall', 1], ['tendril', 1.2]];
const CLOTHES = ['#8a6d4c', '#b8481f', '#d6c29d', '#5b6f7a', '#6d8a3a', '#7a4a5e', '#c9a46a', '#46525e'];
const SKIN = ['#e0b48f', '#c99b76', '#9c6b4a', '#6e4a33', '#f0cfb0'];
const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];

interface Fig { g: THREE.Group; body: THREE.Group; legL: THREE.Object3D; legR: THREE.Object3D; kind: Kind }
/** A walker of the given kind, facing +z, feet at y 0. */
function figure(kind: Kind): Fig {
  const g = new THREE.Group(), body = new THREE.Group(); g.add(body);
  const cloth = mat(pick(CLOTHES), { roughness: .95 }), cloth2 = mat(pick(CLOTHES), { roughness: .95 });
  const legs = (hip: number, gap: number, w: number, m: THREE.Material) => {
    const mk = (x: number) => { const l = new THREE.Group(); l.position.set(x, hip, 0); l.add(part(G.box, m, w, hip, w * 1.15, 0, -hip / 2, 0)); return l; };
    const L = mk(-gap), R = mk(gap); g.add(L, R); return [L, R] as const;
  };
  let lg: readonly [THREE.Object3D, THREE.Object3D];
  if (kind === 'human') {
    const skin = mat(pick(SKIN));
    lg = legs(.62, .09, .12, cloth2);
    body.add(part(G.box, cloth, .36, .5, .22, 0, .88, 0));
    for (const s of [-1, 1]) body.add(part(G.box, cloth, .09, .46, .1, s * .23, .9, 0));
    body.add(part(G.sph, skin, .12, .13, .12, 0, 1.27, .01));
    body.add(part(G.sph, mat(pick(['#2a201a', '#5a3a22', '#c9a46a', '#1a1a1a'])), .125, .085, .125, 0, 1.33, -.015, false)); // hair
  } else if (kind === 'robed') {
    lg = legs(.3, .08, .1, mat('#4a3c30'));
    body.add(part(G.cone, cloth, .32, 1.1, .32, 0, .68, 0));
    body.add(part(G.sph, mat(pick(SKIN)), .12, .13, .12, 0, 1.26, .02));
    body.add(part(G.sph, cloth2, .15, .15, .15, 0, 1.29, -.04)); // hood
  } else if (kind === 'bulb') { // thin and grey, a tall bulb of a head with two big dark eyes
    const skin = mat('#a9b2bb', { roughness: .6 });
    lg = legs(.6, .07, .07, skin);
    body.add(part(G.box, cloth, .24, .46, .16, 0, .84, 0));
    body.add(part(G.cyl8, skin, .04, .14, .04, 0, 1.12, 0));
    body.add(part(G.sph, skin, .17, .25, .18, 0, 1.38, 0));
    for (const s of [-1, 1]) { const e = part(G.sph, mat('#101418', { roughness: .2 }), .06, .035, .03, s * .075, 1.37, .16, false); e.rotation.z = s * .4; body.add(e); }
  } else if (kind === 'stalk') { // round and green, short legs, eyes on stalks
    const skin = mat('#7fa84a', { roughness: .7 });
    lg = legs(.28, .12, .11, skin);
    body.add(part(G.sph, skin, .3, .34, .28, 0, .6, 0));
    body.add(part(G.box, cloth, .5, .14, .42, 0, .48, 0)); // a sash
    for (const s of [-1, 1]) {
      body.add(part(G.cyl8, skin, .025, .3, .025, s * .1, 1.04, .05, false));
      body.add(part(G.sph, mat('#f2efe6'), .065, .065, .065, s * .1, 1.21, .06, false));
      body.add(part(G.sph, mat('#141414'), .03, .03, .02, s * .1, 1.21, .12, false));
    }
  } else if (kind === 'horn') { // ruddy skin, two swept horns, a robe
    const skin = mat('#c0603a', { roughness: .7 });
    lg = legs(.3, .08, .1, mat('#3e2f26'));
    body.add(part(G.cone, cloth, .31, 1.05, .31, 0, .66, 0));
    body.add(part(G.sph, skin, .14, .15, .14, 0, 1.26, .01));
    for (const s of [-1, 1]) { const h = part(G.cone, mat('#e8dcc4'), .035, .2, .035, s * .08, 1.42, -.03, false); h.rotation.z = -s * .45; h.rotation.x = -.35; body.add(h); }
  } else if (kind === 'tall') { // tall and violet, four arms, a fin on the head
    const skin = mat('#7a5a9a', { roughness: .65 });
    lg = legs(.85, .07, .08, skin);
    body.add(part(G.box, cloth, .26, .6, .18, 0, 1.15, 0));
    for (const s of [-1, 1]) for (const y of [1.22, .98]) { const a = part(G.box, skin, .06, .42, .06, s * .19, y - .1, .02); a.rotation.z = s * .12; body.add(a); }
    body.add(part(G.sph, skin, .11, .15, .12, 0, 1.6, .01));
    body.add(part(G.box, mat('#d39a2c'), .025, .12, .22, 0, 1.73, -.02, false));
  } else { // tendril: teal, hooded, four short tendrils under the chin
    const skin = mat('#3f9a92', { roughness: .6 });
    lg = legs(.3, .08, .1, mat('#33302c'));
    body.add(part(G.cone, cloth, .3, 1.08, .3, 0, .67, 0));
    body.add(part(G.sph, skin, .14, .15, .14, 0, 1.25, .02));
    body.add(part(G.sph, cloth2, .165, .16, .16, 0, 1.28, -.04));
    for (const x of [-.06, -.02, .02, .06]) body.add(part(G.cyl8, skin, .018, .22, .018, x, 1.04, .1, false));
  }
  return { g, body, legL: lg[0], legR: lg[1], kind };
}
function pickKind(): Kind { let r = Math.random() * KINDS.reduce((n, k) => n + k[1], 0); for (const [k, w] of KINDS) { r -= w; if (r <= 0) return k; } return 'human'; }

interface Person { F: Fig; x: number; z: number; yaw: number; face: number; ph: number; path: P2[]; s: number; L: number; wait: number; speed: number; spot: number;
  /** sideways step off the path (to pass someone), right of the walking direction; seconds stuck behind someone */
  side: number; stuck: number; held: boolean }
/** Townsfolk the abduction (abduct.ts) has hold of: they stand still and the caller moves them. */
export interface Held { F: Fig; x: number; z: number }

const BODY = .2, NAV_M = .45; // a walker's radius (two people stay 2 * BODY apart); the router's margin round obstacles

export function makeFolk(ctx: SceneCtx, count: () => number) {
  const { scene, reduced } = ctx;
  const obs = [...TOWN_OBS, ...PARK.map(([x, z]) => ({ x, z, r: 1 }))]; // a pad is drawn .9 across
  const nav = makeNav(obs, NAV_M);
  // only spots there is a way to: a clear route from the plaza spot nearest the hall
  const way = (ax: number, az: number, bx: number, bz: number) => { const r: P2[] = [[ax, az], ...nav.route(ax, az, bx, bz)]; return r.every((q, i) => !i || nav.clear(r[i - 1][0], r[i - 1][1], q[0], q[1])); };
  const hub = TOWN_SPOTS.reduce((b, s) => Math.hypot(s[0], s[1]) < Math.hypot(b[0], b[1]) ? s : b, TOWN_SPOTS[0]);
  const usable = TOWN_SPOTS.map((s, j) => j).filter(j => way(hub[0], hub[1], TOWN_SPOTS[j][0], TOWN_SPOTS[j][1]));
  const folk: Person[] = [], taken = new Set<number>();
  let refill = 0, bad = 0; // after an abduction, nobody new walks in for a while; routes turned down (for checks)
  /** A free spot: not taken, and not where anyone else stands or is headed. */
  const freeSpot = (me?: Person) => {
    const ok: number[] = [];
    for (const j of usable) {
      if (taken.has(j)) continue; const [x, z] = TOWN_SPOTS[j];
      if (folk.some(q => q !== me && (Math.hypot(q.x - x, q.z - z) < 1 || Math.hypot(TOWN_SPOTS[q.spot][0] - x, TOWN_SPOTS[q.spot][1] - z) < 1))) continue;
      ok.push(j);
    }
    return ok.length ? ok[Math.floor(Math.random() * ok.length)] : -1;
  };
  /** Is (x, z) clear of every building and pad for a body? */
  const open = (x: number, z: number) => !obs.some(o => inside(o, x, z, BODY + .02));
  /** (x, z) pushed just outside the router's margin of every obstacle it is near (a few passes for corners). */
  const clearOf = (x: number, z: number): P2 => {
    for (let k = 0; k < 4; k++) {
      const o = obs.find(q => inside(q, x, z, NAV_M)); if (!o) break;
      if ('r' in o) { const dx = x - o.x, dz = z - o.z, d = Math.hypot(dx, dz) || 1, R = o.r + NAV_M + .05; x = o.x + dx / d * R; z = o.z + dz / d * R; }
      else {
        const dx = x - o.x, dz = z - o.z, lx = dx * o.ux + dz * o.uz, lz = -dx * o.uz + dz * o.ux;
        let nx = lx, nz = lz; if (o.hx + NAV_M - Math.abs(lx) < o.hz + NAV_M - Math.abs(lz)) nx = Math.sign(lx || 1) * (o.hx + NAV_M + .05); else nz = Math.sign(lz || 1) * (o.hz + NAV_M + .05);
        x = o.x + nx * o.ux - nz * o.uz; z = o.z + nx * o.uz + nz * o.ux;
      }
    }
    return [x, z];
  };

  function add(): boolean {
    const j = freeSpot(); if (j < 0) return false;
    const F = figure(pickKind()), [x, z, face] = TOWN_SPOTS[j]; taken.add(j); scene.add(F.g);
    folk.push({ F, x, z, yaw: face, face, ph: Math.random() * 6, path: [], s: 0, L: 0, wait: reduced ? 1e9 : Math.random() * 10, speed: .85 + Math.random() * .45, spot: j, side: 0, stuck: 0, held: false });
    return true;
  }
  function drop(p: Person) { scene.remove(p.F.g); taken.delete(p.spot); folk.splice(folk.indexOf(p), 1); }
  function fit() {
    const n = Math.max(0, Math.min(40, count()));
    while (folk.length < n && refill <= 0) if (!add()) break;
    while (folk.length > n) { const p = [...folk].reverse().find(q => !q.held); if (!p) break; drop(p); }
  }
  fit();

  /** One walker's step: along its path, stepping aside round anyone in the way; it waits when it cannot get past. */
  function walk(p: Person, dt: number): boolean {
    const [bx, bz] = pathAt(p.path, p.s), [ax, az] = pathAt(p.path, Math.min(p.L, p.s + .3));
    let dx = ax - bx, dz = az - bz; const dl = Math.hypot(dx, dz);
    if (dl < 1e-6) { dx = Math.sin(p.yaw); dz = Math.cos(p.yaw); } else { dx /= dl; dz /= dl; }
    const rx = dz, rz = -dx; // to the right of the walking direction
    // the nearest person ahead, near the path: pass them with a body's width to spare (keep right when head-on)
    let want = 0, near = Infinity;
    for (const q of folk) {
      if (q === p) continue;
      const ox = q.x - bx, oz = q.z - bz, f = ox * dx + oz * dz, sd = ox * rx + oz * rz;
      if (f < -.25 || f > 1.8 || Math.abs(sd) > 2 * BODY + .45 || f >= near) continue;
      near = f; want = sd > .08 ? sd - (2 * BODY + .12) : sd < -.08 ? sd + 2 * BODY + .12 : 2 * BODY + .12;
    }
    want = Math.max(-.65, Math.min(.65, want));
    if (!open(bx + rx * want, bz + rz * want)) want = open(bx - rx * want, bz - rz * want) ? -want : 0;
    const ns = p.side + (want - p.side) * Math.min(1, dt * 3.5);
    if (open(bx + rx * ns, bz + rz * ns)) p.side = ns;
    // step on, unless someone is right in front of where that would put us
    const s2 = Math.min(p.L, p.s + p.speed * dt), [cx, cz] = pathAt(p.path, s2), nx = cx + rx * p.side, nz = cz + rz * p.side;
    let block: Person | null = null;
    for (const q of folk) {
      if (q === p) continue;
      const ox = q.x - nx, oz = q.z - nz;
      if (ox * ox + oz * oz < (2 * BODY) ** 2 && ox * (nx - p.x) + oz * (nz - p.z) > 0) { block = q; break; }
    }
    if (block) {
      p.stuck += dt;
      // someone standing in the way long enough moves on; a walker in the way goes first
      if (p.stuck > 1.5 && block.wait > 0 && !block.held) block.wait = Math.min(block.wait, .01);
      const [bx2, bz2] = [bx + rx * p.side, bz + rz * p.side]; if (Math.hypot(bx2 - p.x, bz2 - p.z) > 1e-4 && open(bx2, bz2)) { p.x += (bx2 - p.x) * Math.min(1, dt * 4); p.z += (bz2 - p.z) * Math.min(1, dt * 4); }
      return false;
    }
    p.stuck = 0; p.s = s2;
    const mx = nx - p.x, mz = nz - p.z; if (mx * mx + mz * mz > 1e-8) p.yaw = Math.atan2(mx, mz);
    p.x = nx; p.z = nz; p.ph += dt * 7.5 * p.speed;
    return true;
  }

  function frame(dt: number) {
    refill -= dt; fit();
    for (const p of folk) {
      if (p.held) continue;
      let moving = false;
      if (p.wait > 0) {
        if (!reduced) p.wait -= dt;
        let d = p.face - p.yaw; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; p.yaw += d * Math.min(1, dt * 4);
        if (p.wait <= 0) { // on to somewhere else
          const j = freeSpot(p);
          if (j < 0) p.wait = 1 + Math.random() * 2;
          else {
            // the router ignores an obstacle the start is near, so first step out of any (a side step can end up close)
            const [sx, sz] = TOWN_SPOTS[j], [ox, oz] = clearOf(p.x, p.z);
            const r: P2[] = [[ox, oz], ...nav.route(ox, oz, sx, sz)];
            // the router falls back to a straight line when it finds no way: then try somewhere else in a moment
            if (!r.every((q, i) => !i || nav.clear(r[i - 1][0], r[i - 1][1], q[0], q[1]))) { p.wait = .5 + Math.random(); bad++; }
            else {
              taken.delete(p.spot); p.spot = j; taken.add(j); p.side = 0; p.stuck = 0;
              p.path = ox !== p.x || oz !== p.z ? [[p.x, p.z], ...r] : r; p.s = 0; p.L = pathLen(p.path);
            }
          }
        }
      } else {
        moving = walk(p, dt);
        if (p.s >= p.L) { p.wait = 3 + Math.random() * 11; p.face = TOWN_SPOTS[p.spot][2] + (Math.random() - .5) * .8; }
      }
      const g = p.F.g; g.position.set(p.x, .13, p.z); g.rotation.y = p.yaw;
      const sw = moving ? Math.sin(p.ph) * .5 : 0; p.F.legL.rotation.x = sw; p.F.legR.rotation.x = -sw; p.F.body.position.y = moving ? Math.abs(Math.cos(p.ph)) * .03 : 0;
    }
  }

  /** Take hold of an alien (not a human) for the abduction: one standing still, preferring those ok(x, z) accepts. */
  function grab(ok: (x: number, z: number) => boolean, strict: boolean): Held | null {
    const aliens = folk.filter(p => !p.held && p.F.kind !== 'human' && p.F.kind !== 'robed');
    const pool = aliens.filter(p => ok(p.x, p.z)), still = pool.filter(p => p.wait > 0);
    const list = still.length ? still : pool.length ? pool : strict ? [] : aliens; if (!list.length) return null;
    const p = list[Math.floor(Math.random() * list.length)];
    p.held = true; p.F.legL.rotation.x = p.F.legR.rotation.x = 0; p.F.body.position.y = 0;
    return { F: p.F, x: p.x, z: p.z };
  }
  /** Let go: gone (taken away) or back to walking. */
  function release(h: Held, gone: boolean) {
    const p = folk.find(q => q.F === h.F); if (!p) return;
    if (gone) { drop(p); refill = 25; } else { p.held = false; p.wait = 2; }
  }
  /** Everyone standing or walking within r of (x, z) stops and stares at it for a while. */
  function stare(x: number, z: number, r: number) {
    for (const p of folk) if (!p.held && Math.hypot(p.x - x, p.z - z) < r) {
      if (p.wait <= 0) { taken.delete(p.spot); p.path = []; p.s = p.L = 0; }
      p.wait = 6 + Math.random() * 4; p.face = Math.atan2(x - p.x, z - p.z);
    }
  }
  const stats = () => ({ folk: folk.length, walking: folk.filter(p => p.wait <= 0 && !p.held).length, kinds: [...new Set(folk.map(p => p.F.kind))].length, badRoutes: bad });
  const aliens = () => folk.filter(p => !p.held && p.F.kind !== 'human' && p.F.kind !== 'robed').length;
  /** Where everyone stands, for checks. */
  const where = () => folk.filter(p => !p.held).map(p => [p.x, p.z] as P2);
  return { frame, stats, where, grab, release, stare, aliens, nodes: nav.nodes.length, spots: usable.length };
}
