// People walking their dog through town. makeDogWalkers(OS, net) takes a walkable graph (WalkNet: the sidewalks and
// footpaths, never a road) and returns a pool of walkers that come in at the graph's ends (the edge of town) or out of
// a door, wander the graph and leave again by the nearest end or door. setMax(n) sets how many may be about (the
// "Dog walkers, at most" setting, 0..DOG_MAX): raising it brings newcomers one by one, lowering it sends the extras off
// to the nearest way out, nobody vanishes on the spot.
//
// Walking: along the graph's edges, keeping right (lane = half * LANE_K off the centre line), so two walkers pass each
// other on a sidewalk. At a node they turn at random, never straight back unless it is a dead end. Someone in the
// corridor ahead (an owner or a dog) makes a walker slow down and wait; two who wait for each other let the higher rank
// go first, and after STUCK s anyone walks on regardless (stats().forced). Now and then the dog stops to sniff a spot
// (net.spots: trees, lamp posts; or the edge of the sidewalk) and the owner waits; two walkers who meet head-on stop
// for a short chat while the dogs greet each other.
// The dog: one of a few breeds (size and colours), on a leash from the owner's right hand (a single line segment,
// written in place each frame). It trots ahead or beside the owner and drifts left and right, stays within the leash,
// keeps to the sidewalk and never walks through the owner. Owners are the usual person model in varied clothes.
// Reduced motion: walkers stand still on the sidewalks, their dogs sitting beside them; setMax applies at once.
//
// Cheap: everything is pooled (a released walker keeps its meshes for the next one), each dog is a few meshes on shared
// per-breed merged geometry with vertex colours, and frame() allocates nothing.
import * as THREE from 'three';
import { reduced } from '../common/dom.js';
import type { P2 } from '../common/types.js';
import type { OSAtBank } from './state.js';
import { addLegs, gait, gaitDip, legGeo, headGeo } from './gait.js';
import { crowdOf, crowdId, CROWD_DOGS, type Plan } from './crowd.js';
import { LOOK } from './crossings.js';

/** What makeDogWalkers needs from OS (all there once makeProps has run). */
export type DogsOS = Pick<OSAtBank, 'G' | 'BODY' | 'mesh' | 'VC' | 'bx' | 'sp' | 'merge' | 'dA' | 'ctx' | 'zeb'>;

/** A door walkers may come out of and go back in by: path runs from the door to nodes[node] (its last point may be that node). */
export interface WalkDoor { path: P2[]; node: number }
/** The walkable graph, in world x/z. Walkers stay on its edges (offset to the right of the walking direction). */
export interface WalkNet {
  nodes: P2[];
  edges: [number, number][];
  ends?: number[];   // nodes at the edge of town where walkers come and go (default: every node with one edge)
  doors?: WalkDoor[]; // apartment doors and the like: walkers come out and go home there too
  spots?: P2[];      // trees, lamp posts, hydrants beside the walk: where a dog likes to stop and sniff
  half?: number;     // half the sidewalk width (default 1): lane and dog drift are kept inside it
  y?: number;        // height of the walking surface (default .1)
  road?: (x: number, z: number, pad?: number) => boolean; // the road surface: a dog keeps off it unless its walker is on it too (a zebra, a dropped kerb)
}
export interface DogWalkerStats {
  max: number; active: number; walking: number; leaving: number; chatting: number; sniffing: number; sitting: number; pool: number;
  forced: number; chats: number; sniffs: number; passes: number; passing: [number, number, number][]; /* x, z, crowd id */ minGap: number | null; dogOwnerMin: number | null; leashMax: number;
  dogGap: number | null; // smallest clear space between a dog's body and its owner's body (target >= DOG_GAP)
  dogFrames: number; dogRoad: number; dogRoadFix: number; dogRoadWith: number; roadAt: [number, number, number, number, string][]; // roadAt: a few dogRoad frames (dog x, z, walker x, z, state) // dog frames; on the road with its walker off it, outside a zebra (target 0); pulled back off it; on it with its walker (a zebra, a dropped kerb)
  at: [number, number, string, string][]; // per walker: x, z, breed, state (probe)
}
export interface DogWalkers {
  group: THREE.Group;
  setMax: (n: number) => void;                    // 0..DOG_MAX, rounded
  frame: (dt: number, t: number) => void;
  stats: () => DogWalkerStats;
  feet: () => number[];                            // walkers and dogs on the go, as x, z pairs (once a frame; traffic stops for them)
  dispose: () => void;
}

/** The planned setting "Dog walkers, at most": 0..DOG_MAX, default DOG_DEFAULT. */
export const DOG_MAX = 20, DOG_DEFAULT = 6;

interface Breed { name: string; L: number; h: number; w: number; leg: number; hd: number; c: string; c2: string; c3: string; ear: 'up' | 'flop'; ec: string; tail: number; tilt: number; saddle?: boolean; spots?: string; beard?: boolean; collar: string }
// L, h, w: body length, height, width; leg: hip height; hd: head size; c body, c2 markings, c3 muzzle/legs/chest; ec ears; tilt: tail angle from upright
const BREEDS: Breed[] = [
  // sized against the person (legs 0-.6, torso .6-1.12): back (leg + h) small ~.21 (below the knee), medium ~.3 (knee),
  // large ~.44 (hip to mid-thigh); head top (leg + h + .9 hd) stays under the waist (~.62 for the large ones)
  { name: 'terrier', L: .32, h: .12, w: .14, leg: .09, hd: .13, c: '#cfc9bb', c2: '#9a6436', c3: '#cfc9bb', ear: 'up', ec: '#9a6436', tail: .1, tilt: .2, saddle: true, collar: '#2f6fd0' },
  { name: 'schnauzer', L: .34, h: .13, w: .14, leg: .1, hd: .13, c: '#8a8d93', c2: '#4a4c52', c3: '#bfc1c4', ear: 'flop', ec: '#4a4c52', tail: .07, tilt: .25, beard: true, collar: '#d03a2f' },
  { name: 'beagle', L: .42, h: .16, w: .16, leg: .14, hd: .15, c: '#c07a30', c2: '#2b2420', c3: '#d3cdc0', ear: 'flop', ec: '#8a5220', tail: .15, tilt: .4, saddle: true, collar: '#2aa36b' },
  { name: 'labrador', L: .56, h: .21, w: .2, leg: .23, hd: .18, c: '#6a4428', c2: '#6a4428', c3: '#7a5232', ear: 'flop', ec: '#553520', tail: .24, tilt: 1.0, collar: '#d03a2f' },
  { name: 'retriever', L: .58, h: .21, w: .2, leg: .23, hd: .18, c: '#d9a04c', c2: '#d9a04c', c3: '#ecc27e', ear: 'flop', ec: '#bf8536', tail: .26, tilt: .9, collar: '#2f6fd0' },
  { name: 'dalmatian', L: .58, h: .2, w: .19, leg: .25, hd: .17, c: '#d2cfc8', c2: '#d2cfc8', c3: '#d2cfc8', ear: 'flop', ec: '#1a1a1a', tail: .25, tilt: .8, spots: '#161616', collar: '#d03a2f' },
];
const CLOTH = ['#8a5a3c', '#3f5f7a', '#6d7a46', '#7a3f4a', '#4f4a6b', '#9a7b3a', '#3d6a63', '#5c5f66', '#b0563a', '#2f4f8a', '#7c8a9a', '#a3486e'];
const PANTS = ['#20242c', '#34465f', '#5a4a38', '#3a3a3e'], HAIR = ['#2a2018', '#6b4a2a', '#c9b27a', '#8c8c8c'];
const LEASHC = ['#e0412f', '#2f7fe0', '#e0a92f', '#36b36a'];

const OWN_R = .3, DOG_GAP = .6; // a person's half width; the clear space kept between a dog's body and its owner's (or a chat mate's)
const LANE_K = .45, LEASH = 2.1, GAP_F = 2.4, GAP_SLOW = 3.3, CORR = .62, FADE = 2.2, STUCK = 7, HAND_A = -.5;
const HAND_Y = 1.05 - .38 * Math.cos(HAND_A), HAND_Z = .04 - .38 * Math.sin(HAND_A), HAND_X = .29; // the right hand of a leash arm raised by HAND_A (person-local; right = -x)
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const clampN = (v: number, a: number, b: number) => v < a ? a : v > b ? b : v;

interface DogGeo { body: THREE.BufferGeometry; head: THREE.BufferGeometry; leg: THREE.BufferGeometry; tail: THREE.BufferGeometry }
interface Dog {
  g: THREE.Group; torso: THREE.Group; body: THREE.Mesh; head: THREE.Mesh; legs: THREE.Mesh[]; tail: THREE.Mesh; b: Breed;
  x: number; z: number; h: number; ph: number; p1: number; p2: number; p3: number; sit: number; nose: number; spd: number;
}
type Mode = 'net' | 'in' | 'out'; // on the graph; coming out of a door along its path; going in at a door
type State = 'walk' | 'sniff' | 'chat' | 'stand';
interface Walker {
  on: boolean; g: THREE.Group; aL: THREE.Mesh; aR: THREE.Mesh; torso: THREE.Mesh; body: THREE.Mesh; lL: THREE.Mesh; lR: THREE.Mesh; ga: number; sw: number; dog: Dog; /* body: the head and hair; lL, lR: the legs (gait.ts) */ leash: THREE.Line; lp: Float32Array; lattr: THREE.BufferAttribute;
  x: number; z: number; h: number; v: number; vMax: number; k: number; kT: number; ph: number;
  mode: Mode; a: number; b: number; s: number; len: number; ux: number; uz: number; door: number; di: number; fading: boolean;
  leaving: boolean; life: number; state: State; stT: number; sniffCool: number; chatCool: number; seekT: number; mate: Walker | null; sx: number; sz: number;
  by: Walker | null; wait: number; rank: number;
  id: number; lat: number; /* id in the town's crowd (crowd.ts, the dog under the same id); lat: m left of the lane now (passing someone slower) */
  nx: number; zw: boolean; /* nx: the node after b, picked early so the dog can lead round the corner (-1 not yet, -2 none: the way out); zw: waiting at a zebra's kerb */
}

export function makeDogWalkers(OS: DogsOS, net: WalkNet): DogWalkers {
  const { G, BODY, mesh, VC, bx, sp, merge, dA } = OS;
  const group = new THREE.Group(); group.name = 'dog-walkers'; OS.ctx.scene.add(group);
  const N = net.nodes, half = net.half ?? 1, lane = half * LANE_K, GY = net.y ?? .1, spots = net.spots || [], doors = net.doors || [];
  // ── the graph: neighbours, ways out, and the next node towards the nearest way out from every node ──
  const adj: number[][] = N.map(() => []);
  for (const [a, b] of net.edges) if (a !== b && N[a] && N[b] && !adj[a].includes(b)) { adj[a].push(b); adj[b].push(a); }
  const doorAt = new Int32Array(N.length).fill(-1); doors.forEach((d, i) => { if (N[d.node]) doorAt[d.node] = i; });
  const ends = (net.ends || adj.map((l, i) => l.length === 1 ? i : -1).filter(i => i >= 0)).filter(i => N[i] && adj[i].length);
  let exits = [...new Set([...ends, ...doors.map(d => d.node).filter(i => N[i] && adj[i].length)])];
  if (!exits.length) exits = adj.map((l, i) => l.length ? i : -1).filter(i => i >= 0); // a closed loop: come and go anywhere
  const isExit = new Uint8Array(N.length); for (const e of exits) isExit[e] = 1;
  const toExit = new Int32Array(N.length).fill(-2), dist = new Float64Array(N.length).fill(Infinity), done = new Uint8Array(N.length); // -1: here, -2: no way out
  for (const e of exits) { dist[e] = 0; toExit[e] = -1; }
  for (;;) { let u = -1; for (let i = 0; i < N.length; i++) if (!done[i] && dist[i] < Infinity && (u < 0 || dist[i] < dist[u])) u = i; if (u < 0) break; done[u] = 1;
    for (const w of adj[u]) { const d = dist[u] + Math.hypot(N[w][0] - N[u][0], N[w][1] - N[u][1]); if (d < dist[w]) { dist[w] = d; toExit[w] = u; } } }
  const edgeList = net.edges.filter(([a, b]) => a !== b && N[a] && N[b]);

  // ── shared geometry and materials ──
  const cloth = CLOTH.map(c => new THREE.MeshStandardMaterial({ color: c, roughness: .8 }));
  const legsG = PANTS.map(p => legGeo(bx, p)), heads = HAIR.map(hc => headGeo(bx, sp, merge, hc, true)); // trousers, hair (gait.ts)
  const leashM = LEASHC.map(c => new THREE.LineBasicMaterial({ color: c }));
  const dogGeo: DogGeo[] = BREEDS.map(dogGeometry);
  function dogGeometry(b: Breed): DogGeo {
    const { L, h, w, leg, hd } = b, ins = w * .28, HPz = -L / 2 + ins, NPy = leg + h * .95, NPz = L / 2 + .04, top = leg + h;
    const B: THREE.BufferGeometry[] = [bx(w, h, L, 0, leg + h / 2, 0, b.c), bx(w * .8, h * .7, .03, 0, leg + h * .45, L / 2 + .012, b.c3),
      bx(w * .62, h * .8, .16, 0, leg + h * .85, L / 2 + .02, b.c), bx(w * .62 + .035, .05, .19, 0, leg + h * .88, L / 2 + .02, b.collar)];
    if (b.saddle) B.push(bx(w + .014, h * .5, L * .55, 0, leg + h * .76, -L * .06, b.c2));
    if (b.spots) { let s = 7; const r = () => (s = (s * 16807) % 2147483647) / 2147483647; // the same spots on every dalmatian
      for (let i = 0; i < 16; i++) { const zz = (r() - .5) * L * .85, yy = leg + h * (.25 + r() * .65), sz = .035 + r() * .04;
        if (i % 3 === 2) B.push(bx(sz, .012, sz, (r() - .5) * w * .6, top + .004, zz, b.spots)); else B.push(bx(.012, sz, sz, (i % 2 ? 1 : -1) * (w / 2 + .004), yy, zz, b.spots)); } }
    const body = merge(B); body.translate(0, -leg, -HPz);
    const hy = top + hd * .4, hz = L / 2 + hd * .5, H: THREE.BufferGeometry[] = [bx(hd * .95, hd, hd * 1.05, 0, hy, hz, b.c),
      bx(hd * .55, hd * .45, hd * .62, 0, top + hd * .2, hz + hd * .8, b.c3), bx(hd * .26, hd * .18, .03, 0, top + hd * .36, hz + hd * 1.11 + .012, '#111'),
      bx(.035, .035, .02, -hd * .24, hy + hd * .16, hz + hd * .53, '#111'), bx(.035, .035, .02, hd * .24, hy + hd * .16, hz + hd * .53, '#111')];
    for (const sx of [-1, 1]) H.push(b.ear === 'up' ? bx(.055, hd * .45, .05, sx * hd * .3, hy + hd * .6, hz - hd * .15, b.ec) : bx(.04, hd * .72, hd * .45, sx * (hd * .48 + .02), hy - hd * .05, hz - hd * .1, b.ec));
    if (b.beard) H.push(bx(hd * .5, hd * .22, hd * .45, 0, top + .01, hz + hd * .85, b.c3));
    if (b.spots) H.push(bx(.012, .05, .05, hd * .48, hy + hd * .1, hz - hd * .2, b.spots), bx(.05, .012, .05, -hd * .1, hy + hd * .51, hz + hd * .1, b.spots));
    const head = merge(H); head.translate(0, -NPy, -NPz);
    const lw = Math.max(.05, w * .3), legG = merge([bx(lw, leg + .02, lw, 0, -leg / 2 + .01, 0, b.spots ? b.c : b.c3), bx(lw * 1.05, .04, lw * 1.25, 0, -leg + .02, .01, b.c3)]);
    const tw = Math.max(.04, w * .22), tail = merge([bx(tw, b.tail, tw, 0, b.tail / 2, 0, b.c), bx(tw * .9, b.tail * .25, tw * .9, 0, b.tail * .88, 0, b.name === 'beagle' ? '#d3cdc0' : b.c)]);
    return { body, head, leg: legG, tail };
  }

  // ── the pool ──
  const all: Walker[] = [];
  let max = DOG_DEFAULT, spawnT = .5, age = 0, forced = 0, chats = 0, sniffs = 0, leashMax = 0, passes = 0, dogFrames = 0, dogRoad = 0, dogRoadFix = 0, dogRoadWith = 0;
  const road = net.road, rt = { x: 0, z: 0 }, roadAt: [number, number, number, number, string][] = [];
  const C = crowdOf(OS), pl: Plan = { lat: 0, v: 0, passing: false }; // the town's crowd (crowd.ts): passing and being passed, shoppers too
  function make(): Walker {
    const g = new THREE.Group(); g.rotation.order = 'YXZ';
    const m = cloth[0], torso = mesh(G.torso, m, true, false), aL = mesh(G.arm, m, true, false), aR = mesh(G.arm, m, true, false);
    aL.position.set(-HAND_X, 1.05, .04); aR.position.set(HAND_X, 1.05, .04); g.add(torso, aL, aR);
    const { lL, lR, head: body } = addLegs(g, (geo, mt) => mesh(geo, mt, true, false), BODY[0], legsG[0], heads[0]);
    const dg = new THREE.Group(), dt = new THREE.Group(), geo = dogGeo[0];
    const db = mesh(geo.body, VC, true, false), dh = mesh(geo.head, VC, true, false), dtl = mesh(geo.tail, VC, true, false), legs = [0, 1, 2, 3].map(() => mesh(geo.leg, VC, true, false));
    dtl.rotation.order = 'YXZ'; dt.add(db, dh, dtl, ...legs); dg.add(dt);
    const lp = new Float32Array(6), lg = new THREE.BufferGeometry(), lattr = new THREE.BufferAttribute(lp, 3); lattr.setUsage(THREE.DynamicDrawUsage); lg.setAttribute('position', lattr);
    const leash = new THREE.Line(lg, leashM[0]); leash.frustumCulled = false;
    group.add(g, dg, leash);
    const dog: Dog = { g: dg, torso: dt, body: db, head: dh, legs, tail: dtl, b: BREEDS[0], x: 0, z: 0, h: 0, ph: 0, p1: 0, p2: 0, p3: 0, sit: 0, nose: 0, spd: 0 };
    const W: Walker = { on: false, g, aL, aR, torso, body, lL, lR, ga: 0, sw: 0, dog, leash, lp, lattr, x: 0, z: 0, h: 0, v: 0, vMax: 1, k: 0, kT: 0, ph: 0, mode: 'net', a: 0, b: 0, s: 0, len: 1, ux: 0, uz: 1, door: -1, di: 0, fading: false,
      leaving: false, life: 0, state: 'walk', stT: 0, sniffCool: 0, chatCool: 0, seekT: 0, mate: null, sx: 0, sz: 0, by: null, wait: 0, rank: 0, id: crowdId(CROWD_DOGS, all.length), lat: 0, nx: -1, zw: false };
    all.push(W); return W;
  }
  function setBreed(D: Dog, bi: number) {
    const b = BREEDS[bi], geo = dogGeo[bi], ins = b.w * .28, Lh = b.L - 2 * ins; D.b = b;
    D.torso.position.z = -b.L / 2 + ins; D.body.geometry = geo.body; D.head.geometry = geo.head; D.tail.geometry = geo.tail; for (const l of D.legs) l.geometry = geo.leg;
    D.head.position.set(0, b.h * .95, b.L - ins + .04); D.tail.position.set(0, b.h * .85, -ins + .01);
    D.legs[0].position.set(-b.w * .3, 0, Lh); D.legs[1].position.set(b.w * .3, 0, Lh); D.legs[2].position.set(-b.w * .3, 0, 0); D.legs[3].position.set(b.w * .3, 0, 0); // front left, front right, hind left, hind right
  }
  function take(): Walker { // a free walker from the pool, dressed afresh
    let W: Walker | null = null; for (const Q of all) if (!Q.on) { W = Q; break; } if (!W) W = make();
    const ci = Math.floor(Math.random() * cloth.length); W.torso.material = W.aL.material = W.aR.material = cloth[ci];
    W.body.geometry = heads[Math.floor(Math.random() * heads.length)]; W.lL.geometry = W.lR.geometry = legsG[Math.floor(Math.random() * legsG.length)];
    W.body.material = W.lL.material = W.lR.material = BODY[Math.floor(Math.random() * BODY.length)]; W.ga = 0; W.sw = 0; W.lL.rotation.x = W.lR.rotation.x = 0;
    W.leash.material = leashM[Math.floor(Math.random() * leashM.length)];
    setBreed(W.dog, Math.floor(Math.random() * BREEDS.length));
    const D = W.dog; D.p1 = rnd(0, 6.3); D.p2 = rnd(0, 6.3); D.p3 = rnd(0, 6.3); D.ph = rnd(0, 6.3); D.sit = reduced ? 1 : 0; D.nose = 0; D.spd = 0;
    Object.assign(W, { on: true, v: 0, vMax: Math.random() < .3 ? rnd(.75, .95) : rnd(1, 1.45), lat: 0, k: reduced ? 1 : 0, kT: 1, ph: rnd(0, 6.3), door: -1, di: 0, fading: false, leaving: false, life: rnd(70, 200), state: reduced ? 'stand' : 'walk',
      stT: 0, sniffCool: rnd(4, 16), chatCool: rnd(3, 10), seekT: rnd(0, .5), mate: null, by: null, wait: 0, rank: Math.random(), nx: -1, zw: false });
    W.g.visible = W.dog.g.visible = W.leash.visible = true; return W;
  }
  function release(W: Walker) { W.on = false; W.mate = null; W.g.visible = W.dog.g.visible = W.leash.visible = false; for (const Q of all) if (Q.by === W) Q.by = null; }

  // ── on the graph ──
  function setEdge(W: Walker, a: number, b: number) { W.a = a; W.b = b; const dx = N[b][0] - N[a][0], dz = N[b][1] - N[a][1], l = Math.hypot(dx, dz) || 1e-3; W.len = l; W.ux = dx / l; W.uz = dz / l; W.mode = 'net'; W.nx = -1; }
  function peek(W: Walker) { if (W.nx === -1) W.nx = W.leaving && toExit[W.b] < 0 ? -2 : nextFrom(W, W.b, W.a); return W.nx; } // the node after b (picked once)
  // a point on the walker's own route: s m on from a along this edge (past b round the corner onto the next one), off m to the right of it
  function routeAt(W: Walker, s: number, off: number, out: { x: number; z: number }) {
    let ax = N[W.a][0], az = N[W.a][1], ux = W.ux, uz = W.uz;
    if (s > W.len) { const n = W.zw ? -2 : peek(W); // held at a zebra's kerb: the dog waits on this side too
      if (n >= 0) { const bx = N[W.b][0], bz = N[W.b][1], dx = N[n][0] - bx, dz = N[n][1] - bz, l = Math.hypot(dx, dz) || 1e-3; s = Math.min(s - W.len, l); ax = bx; az = bz; ux = dx / l; uz = dz / l; } else s = W.len; }
    out.x = ax + ux * s - uz * off; out.z = az + uz * s + ux * off;
  }
  function nextFrom(W: Walker, at: number, from: number): number { // the node to head for from at: towards the way out, or a random turn (straight on a little more likely), not back unless it is a dead end
    if (W.leaving) { const n = toExit[at]; if (n >= 0) return n; }
    const L = adj[at]; if (L.length === 1) return L[0];
    const ix = N[at][0] - N[from][0], iz = N[at][1] - N[from][1], il = Math.hypot(ix, iz) || 1;
    let tot = 0; for (const n of L) if (n !== from) tot += wt(at, n, ix / il, iz / il);
    let r = Math.random() * tot; for (const n of L) if (n !== from) { r -= wt(at, n, ix / il, iz / il); if (r <= 0) return n; }
    return L[0] !== from ? L[0] : L[1];
  }
  function wt(at: number, n: number, ix: number, iz: number) { const dx = N[n][0] - N[at][0], dz = N[n][1] - N[at][1], l = Math.hypot(dx, dz) || 1; return 1 + .6 * Math.max(0, (dx * ix + dz * iz) / l); }
  function free(x: number, z: number, d: number) { for (const Q of all) if (Q.on && (Math.hypot(Q.x - x, Q.z - z) < d || Math.hypot(Q.dog.x - x, Q.dog.z - z) < d)) return false; return true; }
  function carrot(W: Walker, out: { x: number; z: number }) { // where on the walk the walker heads for now
    if (W.mode === 'net') { const o = lane - W.lat; out.x = N[W.a][0] + W.ux * W.s - W.uz * o; out.z = N[W.a][1] + W.uz * W.s + W.ux * o; return; } // right of a→b: (-uz, ux); W.lat back to the left while passing
    const P = doors[W.door].path, p = P[clampN(W.di, 0, P.length - 1)]; out.x = p[0]; out.z = p[1];
  }
  const cv = { x: 0, z: 0 };
  function placeStart(W: Walker) { carrot(W, cv); W.x = cv.x; W.z = cv.z; const D = W.dog, f = W.mode === 'net' ? 1 : 0;
    W.h = W.mode === 'net' ? Math.atan2(W.ux, W.uz) : (() => { const P = doors[W.door].path, q = P[Math.min(1, P.length - 1)]; return Math.atan2(q[0] - W.x, q[1] - W.z); })();
    const fx = Math.sin(W.h), fz = Math.cos(W.h), fw = OWN_R + DOG_GAP + D.b.L * .5 + .15, sd = reduced ? .2 : .15 * f;
    D.x = W.x + fx * fw - fz * sd; D.z = W.z + fz * fw + fx * sd; D.h = W.h + (reduced ? .5 : 0); keepOff(D, W.x, W.z, fx, fz); }

  function spawn(anywhere: boolean): boolean {
    for (let tries = 0; tries < 8; tries++) {
      if (anywhere || reduced) { const e = edgeList[Math.floor(Math.random() * edgeList.length)]; if (!e) return false; const fw = Math.random() < .5, a = fw ? e[0] : e[1], b = fw ? e[1] : e[0];
        const l = Math.hypot(N[b][0] - N[a][0], N[b][1] - N[a][1]); if (l < 2.5) continue; const s = rnd(1, l - 1);
        const x = N[a][0] + (N[b][0] - N[a][0]) / l * s, z = N[a][1] + (N[b][1] - N[a][1]) / l * s; if (!free(x, z, 3.2)) continue;
        const W = take(); setEdge(W, a, b); W.s = s; placeStart(W); if (reduced) { W.state = 'stand'; W.h += rnd(-.3, .3); W.dog.h = W.h + rnd(-.4, .4); } place(W, 0); return true; }
      const e = exits[Math.floor(Math.random() * exits.length)]; if (e === undefined) return false;
      const di = doorAt[e];
      if (di >= 0 && (ends.indexOf(e) < 0 || Math.random() < .5)) { const p = doors[di].path[0]; if (!p || !free(p[0], p[1], 3)) continue;
        const W = take(); W.mode = 'in'; W.door = di; W.di = 0; W.a = W.b = e; placeStart(W); W.di = 1; place(W, 0); return true; }
      const p = N[e]; if (!free(p[0], p[1], 3.2)) continue;
      const W = take(); setEdge(W, e, adj[e][Math.floor(Math.random() * adj[e].length)]); W.s = 0; placeStart(W); place(W, 0); return true;
    }
    return false;
  }
  function count() { let n = 0; for (const W of all) if (W.on && !W.leaving) n++; return n; }
  function about() { let n = 0; for (const W of all) if (W.on) n++; return n; } // leavers too: nobody new comes until the total is under max
  function setMax(n: number) {
    max = clampN(Math.round(+n || 0), 0, DOG_MAX);
    if (reduced) { let c = 0; for (const W of all) if (W.on) { if (c >= max) release(W); else c++; } for (let i = c, tries = 0; i < max && tries < 60; tries++) if (spawn(true)) i++; return; }
    let extra = count() - max; if (extra <= 0) return; // the extras finish their walk now: they head for the nearest way out
    const L = all.filter(W => W.on && !W.leaving).sort((p, q) => p.life - q.life); for (let i = 0; i < extra; i++) { L[i].leaving = true; if (L[i].state === 'chat' && L[i].mate) { L[i].mate!.state = 'walk'; L[i].mate!.mate = null; L[i].state = 'walk'; L[i].mate = null; } }
  }

  // ── per frame ──
  function frame(dtIn: number, t: number) {
    if (reduced) return; // standing still, dogs sitting (placed once, by setMax)
    const dt = Math.min(dtIn, .1); age += dt; C.begin(CROWD_DOGS);
    if ((spawnT -= dt) <= 0) { spawnT = age < 2 ? .05 : rnd(1.5, 4); if (about() < max) spawn(age < 2); }
    for (const W of all) if (W.on) think(W, dt);
    for (const W of all) if (W.on) move(W, dt);
    for (const W of all) if (W.on) { stepDog(W, dt, t); place(W, t);
      if (W.k > .05) { const fx = Math.sin(W.h), fz = Math.cos(W.h); C.put(W.id, W.x, W.z, fx, fz, W.v, OWN_R); C.put(W.id, W.dog.x, W.dog.z, fx, fz, W.v, W.dog.b.L / 2); } } // owner and dog in the town's crowd
  }
  // state changes: life, sniffing, chatting
  function think(W: Walker, dt: number) {
    W.life -= dt; if (W.life <= 0 && !W.leaving) W.leaving = true;
    W.sniffCool -= dt; W.chatCool -= dt; W.seekT -= dt;
    if (W.state !== 'walk') { if ((W.stT -= dt) <= 0) { if (W.state === 'chat' && W.mate) { W.mate.chatCool = Math.max(W.mate.chatCool, 25); } W.state = 'walk'; W.mate = null; } return; }
    if (W.mode !== 'net' || W.fading || W.k < .99) return;
    if (OS.zeb && OS.zeb.near(W.x, W.z, 2.5)) return; // no chat or sniff on a zebra or by its ends: the way on and off stays clear (crossings.ts)
    const fx = Math.sin(W.h), fz = Math.cos(W.h);
    if (W.chatCool <= 0 && !W.leaving) for (const Q of all) { // meeting someone head-on: maybe a short chat
      if (Q === W || !Q.on || Q.state !== 'walk' || Q.mode !== 'net' || Q.leaving || Q.chatCool > 0 || Q.k < .99) continue;
      const rx = Q.x - W.x, rz = Q.z - W.z, d = Math.hypot(rx, rz); if (d > 2.2 || d < 1) continue;
      if (fx * Math.sin(Q.h) + fz * Math.cos(Q.h) > -.6 || rx * fx + rz * fz < .3) continue;
      W.chatCool = Q.chatCool = rnd(30, 60);
      if (Math.random() < .5) { W.state = Q.state = 'chat'; W.stT = Q.stT = rnd(3.5, 7); W.mate = Q; Q.mate = W; chats++; }
      return;
    }
    if (W.sniffCool > 0 || W.seekT > 0) return; W.seekT = .5;
    let best = -1, bd = Infinity; // a tree or lamp post just ahead
    for (let i = 0; i < spots.length; i++) { const rx = spots[i][0] - W.x, rz = spots[i][1] - W.z, fw = rx * fx + rz * fz; if (fw < .3 || fw > 2) continue; const d = Math.hypot(rx, rz); if (d < 1.9 && d < bd) { bd = d; best = i; } }
    if (best >= 0 && Math.random() < .55) { W.sx = spots[best][0]; W.sz = spots[best][1]; }
    else if (W.sniffCool < -12 && Math.random() < .2) { let sd = 0; for (const s of [1, -1]) { routeAt(W, W.s + .9, s * (half + .5), rt); if (!road || !road(rt.x, rt.z, .3)) { sd = s; break; } }
      if (!sd) return; routeAt(W, W.s + .9, sd * (half + .1), rt); W.sx = rt.x; W.sz = rt.z; } // the grass at the edge of the sidewalk (the side away from the road)
    else return;
    W.state = 'sniff'; W.stT = rnd(2.5, 5.5); W.sniffCool = rnd(12, 28); sniffs++;
  }
  function topOfCycle(W: Walker, Q: Walker) { // does Q's chain of waits lead back to W, with W the highest rank on it?
    let c: Walker | null = Q, top = 0; for (let i = 0; i < 8 && c; i++) { if (c === W) return W.rank > top; top = Math.max(top, c.rank); c = c.by; } return false;
  }
  // the owner: along the walk at the speed the way ahead allows
  function move(W: Walker, dt: number) {
    const fx = Math.sin(W.h), fz = Math.cos(W.h);
    let vT = W.state === 'walk' ? W.vMax : 0, by: Walker | null = null;
    if (vT > 0 && !W.fading) for (const Q of all) { // someone (or their dog) in the corridor ahead: slow down, then wait
      if (Q === W || !Q.on || Q.k < .05) continue;
      for (let j = 0; j < 2; j++) { const qx = j ? Q.dog.x : Q.x, qz = j ? Q.dog.z : Q.z, rx = qx - W.x, rz = qz - W.z, fw = rx * fx + rz * fz;
        if (fw <= 0 || Math.abs(rx * fz - rz * fx) > CORR) continue;
        const lim = j ? GAP_F - .7 : GAP_F; if (fw > lim + .9) continue;
        if (Q.by && topOfCycle(W, Q)) continue; // waiting for each other (two or more round a crossing): the highest rank goes first
        const k = clampN((fw - lim) / .9, 0, 1); if (W.vMax * k < vT) { vT = W.vMax * k; by = Q; } }
    }
    // the town's crowd (crowd.ts), planned from the dog (it goes first): someone slower ahead, out to the left (up to the far
    // side of the sidewalk), past them and their dog, and back; oncoming in the lane: keep right; no room: their speed
    const net = W.mode === 'net' && !W.fading && W.state === 'walk', fd = OWN_R + DOG_GAP + W.dog.b.L * .5;
    C.plan(W.id, W.x + fx * fd, W.z + fz * fd, net ? W.ux : fx, net ? W.uz : fz, W.vMax, .3, W.lat, net ? Math.max(0, lane + half - .2) : 0, net ? Math.max(0, half - .3 - lane) : 0, pl);
    if (W.state === 'walk') vT = Math.min(vT, Math.max(pl.v, W.lat > .3 ? W.vMax * .6 : 0)); // half way out: on, the other side of the corridor is clear
    // zebras (crossings.ts): on one, or about to step onto one, it claims it and the traffic stops; it steps on only when the traffic can stop, else waits at the kerb
    W.zw = W.mode === 'net' && !W.fading && !!OS.zeb && !OS.zeb.pass(W, W.x, W.z, W.ux, W.uz, Math.min(W.len - W.s + .3, fd + LOOK * W.vMax)) && W.state === 'walk'; if (W.zw) vT = 0;
    const lat0 = W.lat; W.lat += (pl.lat - W.lat) * Math.min(1, dt * 2.2); if (Math.abs(W.lat) < .005) W.lat = 0;
    if (lat0 < .3 && W.lat >= .3) passes++; // each pass once: when well out
    W.by = by;
    if (by && vT < .05) { W.wait += dt; if (W.wait > STUCK) { forced++; W.wait = 0; W.rank = 2 + Math.random(); } } else W.wait = Math.max(0, W.wait - dt);
    if (W.rank > 1 && W.wait === 0 && !by) W.rank = Math.random(); // back to normal once clear
    W.v += (vT - W.v) * Math.min(1, dt * 4);
    const st = W.v * dt;
    if (W.mode === 'net') {
      W.s += st;
      if (!W.fading && W.s >= W.len) { const at = W.b, from = W.a;
        if (W.leaving && toExit[at] < 0) { const di = doorAt[at]; if (di >= 0 && (ends.indexOf(at) < 0 || toExit[at] === -1 && Math.random() < .5)) { W.mode = 'out'; W.door = di; W.di = doors[di].path.length - 1; } else W.fading = true; }
        else { const over = W.s - W.len, nn = W.nx >= 0 && (!W.leaving || W.nx === toExit[at]) ? W.nx : nextFrom(W, at, from); setEdge(W, at, nn); W.s = over; } } // the next node the dog already leads to
      if (W.fading) W.kT = 0;
    } else { const P = doors[W.door].path; carrot(W, cv); if (Math.hypot(cv.x - W.x, cv.z - W.z) < .25) {
      if (W.mode === 'in') { if (++W.di >= P.length) { const at = doors[W.door].node; setEdge(W, at, nextFrom(W, at, at)); W.s = 0; } }
      else if (--W.di < 0) { W.di = 0; W.kT = 0; } } }
    carrot(W, cv);
    const dx = cv.x - W.x, dz = cv.z - W.z, d = Math.hypot(dx, dz), e = 1 - Math.exp(-6 * dt), ox = W.x, oz = W.z;
    if (W.mode !== 'net' && d > 1e-4) { const s2 = Math.min(d, st); W.x += dx / d * s2; W.z += dz / d * s2; } else { W.x += dx * e; W.z += dz * e; }
    W.sw = gait(W, W.v > .05 ? Math.hypot(W.x - ox, W.z - oz) : 0, dt); // the legs on the distance walked (gait.ts)
    if (W.state === 'chat' && W.mate) W.h = dA(W.h, Math.atan2(W.mate.x - W.x, W.mate.z - W.z), 3, dt);
    else if (W.state === 'sniff') W.h = dA(W.h, Math.atan2(W.dog.x - W.x, W.dog.z - W.z), 1.2, dt);
    else if (W.v > .05) { const hx = W.mode === 'net' ? W.ux + dx * .8 : dx, hz = W.mode === 'net' ? W.uz + dz * .8 : dz; W.h = dA(W.h, Math.atan2(hx, hz), 7, dt); }
    W.k = W.kT > W.k ? Math.min(W.kT, W.k + dt * FADE) : Math.max(W.kT, W.k - dt * FADE); // stops at kT (no size pulse once faded in)
    if (W.k === 0 && W.kT === 0) release(W);
  }
  // the dog: trots ahead or beside the owner, drifting left and right, within the leash and never through the owner
  function stepDog(W: Walker, dt: number, t: number) {
    const D = W.dog, b = D.b, fx = Math.sin(W.h), fz = Math.cos(W.h), rx = -fz, rz = fx; // owner's forward and right
    let tx: number, tz: number, face = NaN, nose = 0, wag = 9;
    if (W.state === 'sniff') { const vx = W.sx - D.x, vz = W.sz - D.z, l = Math.hypot(vx, vz) || 1, off = b.L * .5 + b.hd * .9; tx = W.sx - vx / l * off; tz = W.sz - vz / l * off; face = Math.atan2(vx, vz); nose = 1; wag = 14; }
    else if (W.state === 'chat' && W.mate) { const M = W.mate, vx = M.x - W.x, vz = M.z - W.z, l = Math.hypot(vx, vz) || 1, ux = vx / l, uz = vz / l, side = 1.05 + b.L * .3; // beside the owner, away from the pair
      tx = W.x + ux * .25 - uz * side; tz = W.z + uz * .25 + ux * side; face = Math.atan2(M.dog.x - D.x, M.dog.z - D.z); wag = 15; }
    else { const lo = -half + .2 - lane + W.lat, hi = Math.max(lo, half - .15 - lane + W.lat - Math.max(0, W.lat) * 1.4) /* passing: the dog on the owner's left, away from the one passed */, mv = W.v > .15, ahead = OWN_R + DOG_GAP + b.L * .5 + .1;
      const fw = mv ? ahead + .2 + .2 * Math.sin(t * .37 + D.p1) : ahead + .05 + .08 * Math.sin(t * .5 + D.p1), lt = clampN(mv ? .08 + .25 * Math.sin(t * .23 + D.p2) + .1 * Math.sin(t * .71 + D.p3) : .3 + .1 * Math.sin(t * .4 + D.p2), lo, hi);
      if (W.mode === 'net') { routeAt(W, W.s + fw, lane - W.lat + lt, rt); tx = rt.x; tz = rt.z; } // on the walker's own route, so round a corner it keeps to the sidewalk, never cutting across
      else { tx = W.x + fx * fw + rx * lt; tz = W.z + fz * fw + rz * lt; } if (!mv) { face = W.h + .5 * Math.sin(t * .3 + D.p3); nose = .5 + .5 * Math.sin(t * .6 + D.p1); } }
    const ox = D.x, oz = D.z, vx = tx - D.x, vz = tz - D.z, l = Math.hypot(vx, vz), sp = Math.min(l * 3.2, 2.8) * dt;
    if (l > 1e-4) { D.x += vx / l * Math.min(sp, l); D.z += vz / l * Math.min(sp, l); }
    let qx = D.x - W.x, qz = D.z - W.z, q = Math.hypot(qx, qz);
    if (q > LEASH) { D.x = W.x + qx / q * LEASH; D.z = W.z + qz / q * LEASH; } // the leash holds it
    if (W.state === 'chat' && W.mate) keepOff(D, W.mate.x, W.mate.z, rx, rz);
    keepOff(D, W.x, W.z, fx, fz); // round the owner, never through, never touching
    offRoad(W);
    const mx = D.x - ox, mz = D.z - oz, mvd = Math.hypot(mx, mz); D.spd += (mvd / Math.max(dt, 1e-3) - D.spd) * Math.min(1, dt * 8);
    if (D.spd > .12 && mvd > 1e-5 && (isNaN(face) || D.spd > .5)) D.h = dA(D.h, Math.atan2(mx, mz), 9, dt); else if (!isNaN(face)) D.h = dA(D.h, face, 4, dt);
    if (W.state === 'chat' && W.mate) keepOff(D, W.mate.x, W.mate.z, rx, rz);
    keepOff(D, W.x, W.z, fx, fz); // again, after turning: the nose swings
    offRoad(W);
    if (road && W.k > .99) { dogFrames++; if (road(D.x, D.z)) { if (road(W.x, W.z)) dogRoadWith++; else if (!zebOK(W)) { dogRoad++; if (roadAt.length < 40 && dogRoad % 5 === 1) roadAt.push([+D.x.toFixed(1), +D.z.toFixed(1), +W.x.toFixed(1), +W.z.toFixed(1), W.state + (W.mode !== 'net' ? ':' + W.mode : '')]); } } }
    D.nose += (nose - D.nose) * Math.min(1, dt * 4); D.sit = Math.max(0, D.sit - dt * 2);
    D.ph += dt * D.spd * 3 / b.leg; const amp = Math.min(.55, D.spd * .45), sw = Math.sin(D.ph) * amp;
    D.legs[0].rotation.x = D.legs[3].rotation.x = sw; D.legs[1].rotation.x = D.legs[2].rotation.x = -sw; // a trot: diagonal pairs together
    D.tail.rotation.set(-b.tilt, Math.sin(t * wag + D.p1) * (.45 + .2 * D.nose), 0);
    D.head.rotation.x = D.nose * .75; D.torso.position.y = b.leg + Math.abs(Math.sin(D.ph)) * .02 * amp; D.torso.rotation.x = 0;
  }
  // the dog keeps off the road (net.road, with ROAD_PAD to spare): stepped back towards the sidewalk's centre line (the owner, off the graph) until clear.
  // Not while its walker is on the road too (on a zebra, over a dropped kerb), nor on a zebra's stripes with the walker about to cross (not held at the kerb)
  const ROAD_PAD = .4; // (a lane's half width and this: clear of a wide truck's mirror on the outer lane, not just of the paint)
  function zebOK(W: Walker) { return !W.zw && !!OS.zeb && OS.zeb.near(W.dog.x, W.dog.z, .2); }
  function offRoad(W: Walker) {
    const D = W.dog; if (!road || !road(D.x, D.z, ROAD_PAD) || road(W.x, W.z) || zebOK(W)) return;
    let px = W.x, pz = W.z; if (W.mode === 'net') { const ax = N[W.a][0], az = N[W.a][1], s = clampN((D.x - ax) * W.ux + (D.z - az) * W.uz, 0, W.len); px = ax + W.ux * s; pz = az + W.uz * s;
      if (road(px, pz, ROAD_PAD)) { px = W.x; pz = W.z; } } // the line itself crosses the road there (a dropped kerb, a zebra ahead): back to the walker's side
    let k = .1; for (; k < 1; k += .1) if (!road(D.x + (px - D.x) * k, D.z + (pz - D.z) * k, ROAD_PAD)) break;
    D.x += (px - D.x) * k; D.z += (pz - D.z) * k; dogRoadFix++;
  }
  // the dog's body as a segment from tail to nose along its heading, half its width around it; the closest point to (px, pz)
  function dogNear(D: Dog, px: number, pz: number, o: { x: number; z: number }) {
    const b = D.b, fx = Math.sin(D.h), fz = Math.cos(D.h), s = clampN((px - D.x) * fx + (pz - D.z) * fz, -b.L / 2 - .05, b.L / 2 + b.hd * 1.5);
    o.x = D.x + fx * s; o.z = D.z + fz * s; return Math.hypot(o.x - px, o.z - pz);
  }
  const np = { x: 0, z: 0 };
  function gapTo(D: Dog, px: number, pz: number) { return dogNear(D, px, pz, np) - OWN_R - D.b.w / 2; } // clear space between the dog's body and a person's
  function keepOff(D: Dog, px: number, pz: number, ax: number, az: number) { // push the dog out to DOG_GAP; (ax, az) is the way out if it stands right on the person
    const R = OWN_R + DOG_GAP + D.b.w / 2; let d = dogNear(D, px, pz, np); if (d >= R) return;
    let vx = np.x - px, vz = np.z - pz; if (d < 1e-3) { vx = ax; vz = az; d = 0; } else { vx /= d; vz /= d; }
    D.x += vx * (R - d); D.z += vz * (R - d);
  }
  function posePerson(W: Walker, t: number) {
    const sw = W.sw;
    W.aL.rotation.set(HAND_A + sw * .12, 0, 0); // the leash hand, a little forward
    W.aR.rotation.set(W.state === 'chat' ? -.35 + .25 * Math.sin(t * 4 + W.rank * 6) : -sw, 0, 0);
  }
  function sitDog(D: Dog) { // reduced motion: sitting, front legs straight, hind legs folded, tail on the ground
    const b = D.b, ins = b.w * .28, Lh = b.L - 2 * ins, th = Math.asin(clampN(.7 * b.leg / Lh, 0, .9));
    D.torso.position.y = b.leg * .3; D.torso.rotation.x = -th; D.legs[0].rotation.x = D.legs[1].rotation.x = th; D.legs[2].rotation.x = D.legs[3].rotation.x = -1.27 + th;
    D.head.rotation.x = th * .8; D.tail.rotation.set(-1.45, .5, 0);
  }
  function place(W: Walker, t: number) {
    const D = W.dog, k = Math.max(.001, W.k), gy = GY + gaitDip(W);
    W.g.position.set(W.x, gy, W.z); W.g.rotation.y = W.h; W.g.scale.setScalar(k); W.g.visible = W.k > 0;
    D.g.position.set(D.x, GY, D.z); D.g.rotation.y = D.h; D.g.scale.setScalar(k); D.g.visible = W.k > 0;
    if (reduced) { W.aL.rotation.set(HAND_A, 0, 0); W.aR.rotation.set(0, 0, 0); sitDog(D); } else posePerson(W, t);
    // the leash: from the owner's right hand to the dog's collar
    const fx = Math.sin(W.h), fz = Math.cos(W.h), b = D.b, ins = b.w * .28, a = D.torso.rotation.x;
    const ry = b.h * .9, rz = b.L - ins + .02, cy = D.torso.position.y + ry * Math.cos(a) - rz * Math.sin(a), cz = -b.L / 2 + ins + ry * Math.sin(a) + rz * Math.cos(a), dfx = Math.sin(D.h), dfz = Math.cos(D.h);
    const lp = W.lp; lp[0] = W.x + (-fz * HAND_X + fx * HAND_Z) * k; lp[1] = gy + HAND_Y * k; lp[2] = W.z + (fx * HAND_X + fz * HAND_Z) * k; // the hand is HAND_X to the right, (-fz, fx)
    lp[3] = D.x + dfx * cz * k; lp[4] = GY + cy * k; lp[5] = D.z + dfz * cz * k;
    W.lattr.needsUpdate = true; W.leash.visible = W.k > .02;
    const ll = Math.hypot(lp[3] - lp[0], lp[5] - lp[2]); if (W.k > .99 && ll > leashMax) leashMax = ll;
  }

  setMax(DOG_DEFAULT);
  const fc: { t: number; v: number[] } = { t: -1, v: [] }; // (the feet, kept for one frame: every vehicle asks)
  return { group, setMax, frame,
    feet() { if (fc.t !== age) { fc.t = age; fc.v = []; for (const W of all) if (W.on && W.k > .3) fc.v.push(W.x, W.z, W.dog.x, W.dog.z); } return fc.v; },
    stats() { let active = 0, walking = 0, leaving = 0, chatting = 0, sniffing = 0, sitting = 0, min = Infinity, dmin = Infinity, gmin = Infinity;
      for (const W of all) { if (!W.on) continue; active++; if (W.k > .5) gmin = Math.min(gmin, gapTo(W.dog, W.x, W.z)); if (W.leaving) leaving++; if (W.state === 'chat') chatting++; else if (W.state === 'sniff') sniffing++; else if (W.state === 'stand') sitting++; else if (W.v > .05) walking++;
        for (const Q of all) if (Q.on && W.k > .5 && Q.k > .5) { dmin = Math.min(dmin, Math.hypot(W.dog.x - Q.x, W.dog.z - Q.z)); if (Q !== W) min = Math.min(min, Math.hypot(W.x - Q.x, W.z - Q.z)); } }
      return { max, active, walking, leaving, chatting, sniffing, sitting, pool: all.length, forced, chats, sniffs, passes, passing: all.filter(W => W.on && W.lat > .3).map(W => [+W.x.toFixed(1), +W.z.toFixed(1), W.id] as [number, number, number]), minGap: min === Infinity ? null : +min.toFixed(3), dogOwnerMin: dmin === Infinity ? null : +dmin.toFixed(3), leashMax: +leashMax.toFixed(2), dogGap: gmin === Infinity ? null : +gmin.toFixed(3), dogFrames, dogRoad, dogRoadFix, dogRoadWith, roadAt,
        at: all.filter(W => W.on).map(W => [+W.x.toFixed(1), +W.z.toFixed(1), W.dog.b.name, (W.by && W.v < .05 ? 'wait:' + all.indexOf(W.by) + (Math.hypot(W.by.dog.x - W.x, W.by.dog.z - W.z) < Math.hypot(W.by.x - W.x, W.by.z - W.z) ? 'd' : 'o') + ':' : '') + (W.leaving ? 'leave' : W.state) + ':' + all.indexOf(W)] as [number, number, string, string]) }; },
    dispose() { OS.ctx.scene.remove(group); for (const W of all) W.leash.geometry.dispose(); for (const g of [...legsG, ...heads]) g.dispose(); for (const d of dogGeo) { d.body.dispose(); d.head.dispose(); d.leg.dispose(); d.tail.dispose(); }
      for (const m of cloth) m.dispose(); for (const m of leashM) m.dispose(); all.length = 0; } };
}
