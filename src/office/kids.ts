// Kids playing in a playground: swinging, climbing the ladder and sliding down, digging in the sandbox, see-saw pairs,
// climbing the frame, playing tag along a loop on the grass, and a parent or two on a bench. Purely for show: they stand
// for nothing in the data beyond the count the owner gives setCount, and they are not checked against traffic.
//
// makeKids(OS, spec) takes the equipment as a KidSpec (world coordinates, or the frame of spec.parent) and returns
// { group, setCount, frame, dispose, stats }. The owner calls frame(dt, t) every frame. A swing seat or a see-saw beam
// passed in the spec is moved here (only its rotation.x), so the kid and the seat swing together.
//
// Cheap: every person is drawn from 9 InstancedMeshes shared by all (torso, arms, thighs, shins, head, two hair styles),
// one draw call per part; colours are per instance. Everyone is posed through one scratch rig, and frame() allocates nothing.
// The person is the office person (props.ts: same boxes and proportions) with knees; a kid is 0.65 of it with a bigger head.
//
// Reduced motion: nothing moves. Each kid sits or stands still at a piece of equipment (on a swing, in the sandbox,
// on the see-saw, on the climbing frame, at the slide, on the grass), and the swings and the see-saw stay at rest.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { reduced } from '../common/dom.js';
import type { P2 } from '../common/types.js';

/** A spot and the way it faces: rot 0 faces +z, rot = atan2(dx, dz) of the facing direction. Every height in the spec (h) is above the ground, spec.y. */
export interface Pose { x: number; z: number; rot: number }
/** One swing: the pivot on the top bar above (x, z) at height h, ropes len long. The kid faces rot and swings along it.
 *  seat (optional): an object whose origin is the pivot, hanging down its local -y and turned to rot by the owner; its rotation.x is set here. */
export interface KidSwing { x: number; z: number; rot: number; h: number; len: number; seat?: THREE.Object3D | null }
/** The slide: ladder = the foot of the ladder, facing up it; top = the platform (height h), facing down the run; foot = the end of the run (where a kid gets off), facing on. */
export interface KidSlide { ladder: Pose; top: Pose; foot: Pose; h: number }
/** The see-saw: pivot at (x, z), height h; the beam runs along rot, the seats are half either side of the pivot (end A at -half, end B at +half);
 *  tilt: the most it tips (rad). beam (optional): origin at the pivot, beam along its local z, turned to rot by the owner; its rotation.x is set here (positive tilt: end B up). */
export interface KidSeesaw { x: number; z: number; rot: number; h: number; half: number; tilt: number; beam?: THREE.Object3D | null }
/** The climbing frame: a box of bars, centre c, half its width, h high. */
export interface KidClimber { c: P2; half: number; h: number }
/** The sandbox: centre c, half its width; y: the top of the sand above the ground (default 0.08). */
export interface KidSandbox { c: P2; half: number; y?: number }
export interface KidSpec {
  swings: KidSwing[];
  slide?: KidSlide | null;
  sandbox?: KidSandbox | null;
  seesaw?: KidSeesaw | null;
  climber?: KidClimber | null;
  /** A closed loop on open grass for tag (at least 3 points; the last joins the first). Also where kids come and go, and stand about. */
  run: P2[];
  /** Other things kids walk round, not through (trees, lamp posts, benches, a curved hedge): circles [x, z, radius]. Keep run clear of them. */
  obstacles?: [number, number, number][];
  /** Bench seats for the parents (the middle of the seat, facing out). seatH: their seat height (default 0.45). */
  benches: Pose[];
  seatH?: number;
  /** The ground height (default 0.04). */
  y?: number;
  /** Where the group is added (default OS.ctx.scene); the spec is in its frame. */
  parent?: THREE.Object3D;
}
export interface KidsStats { kids: number; parents: number; acts: Record<Act, number>; swings: number[]; seesaw: number; /** where each kid in play is drawn now (probe) */ at: [number, number, Act][]; /** each parent on: hip height, heading, how far it has faded in; times a parent came or went */ par: [number, number, number][]; parToggles: number }
export interface Kids {
  group: THREE.Group;
  /** How many kids play (0 .. MAXKIDS). New ones come in at the run loop; ones beyond n fade out where they are. Parents follow: 1 from 1 kid, 2 from 6. */
  /** soft: the live count (fewer kids and parents only after a while, see setCount) */
  setCount: (n: number, soft?: boolean) => void;
  frame: (dt: number, t: number) => void;
  stats: () => KidsStats;
  /** Removes the group, frees the geometry and the material, and puts any seat or beam it moved back at rest. */
  dispose: () => void;
}
export type KidsOS = { ctx: { scene: THREE.Object3D } };

type Act = 'swing' | 'slide' | 'sand' | 'seesaw' | 'climb' | 'tag' | 'mill' | 'gone';
interface Body {
  on: boolean; k: number; kT: number; s: number; headS: number; hairL: boolean; drawn: boolean;
  px: number; py: number; pz: number; rot: number; pitch: number; lean: number;
  aLx: number; aRx: number; aLz: number; aRz: number; tLx: number; tRx: number; sLx: number; sRx: number;
}
interface Kid extends Body {
  i: number; x: number; z: number; act: Act; slot: number; st: number; tm: number; stay: number; ph: number; fz: number;
  way: Float32Array; wn: number; wi: number; // waypoints (x, z pairs) still to walk, from wi
  v: number; s0: number;                    // tag: speed, place along the loop
}

export const MAXKIDS = 16;
const MAXPAR = 2, KID = .65, KIDHEAD = 1.32, WALK = 1.7, RUN = 2.9, HIP = .6;
// bright, but kept under the bloom threshold in full sun (no channel near white)
const SHIRT = ['#d8413f', '#d99a26', '#3592c8', '#d65a98', '#dc7a22', '#62a83f', '#8e62cc', '#26a596', '#b2bcc8', '#4a7bd8', '#d4b034', '#e0644a'];
const PANTS = ['#2f3a56', '#3b4a3a', '#5a4636', '#283040', '#7a2f3a', '#36506e', '#6a6f78'];
const HAIR = ['#2a2018', '#5b3a1e', '#c99a4a', '#c4a25c', '#8a3f1c', '#16120e', '#a0602a'];
const SKIN = ['#d9a883', '#c8956f', '#9c6c50', '#6e4a36', '#dcb08e'];
const CLOTH = ['#8a5a3c', '#3f5f7a', '#6d7a46', '#7a3f4a', '#4f4a6b', '#5c5f66']; // the parents: the shoppers' muted colours
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T>(L: readonly T[]) => L[Math.floor(Math.random() * L.length)];
const turn = (c: number, t: number, l: number, dt: number) => { const d = ((t - c + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI; return dt <= 0 ? t : c + d * (1 - Math.exp(-l * dt)); };

export function makeKids(OS: KidsOS, spec: KidSpec): Kids {
  const Y = spec.y ?? .04, SEATH = spec.seatH ?? .45, swings = spec.swings, sl = spec.slide || null, sb = spec.sandbox || null, ss = spec.seesaw || null, cl = spec.climber || null;
  const run = spec.run.length >= 3 ? spec.run : [[0, 0], [2, 0], [2, 2]] as P2[];
  const group = new THREE.Group(); group.name = 'kids'; (spec.parent || OS.ctx.scene).add(group);

  // ── the parts, each with its origin at its joint (the office person's boxes, props.ts G.torso / G.arm / G.body) ──
  const box = (w: number, h: number, d: number, y: number, z = 0) => new THREE.BoxGeometry(w, h, d).translate(0, y, z);
  const cap = () => new THREE.SphereGeometry(.185, 12, 6, 0, Math.PI * 2, 0, Math.PI * .56).translate(0, .015, -.02);
  const GEO = { torso: box(.44, .52, .26, 0), arm: box(.12, .46, .14, -.19), thigh: box(.17, .32, .2, -.15), shin: box(.165, .31, .19, -.15),
    head: new THREE.SphereGeometry(.17, 12, 8), hairS: cap(), hairL: mergeGeometries([cap(), box(.3, .3, .09, -.1, -.13)], false) };
  const mat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: .85 });
  const NP = MAXKIDS + MAXPAR;
  const inst = (g: THREE.BufferGeometry, n: number) => { const m = new THREE.InstancedMesh(g, mat, n); m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.frustumCulled = false; m.castShadow = true; group.add(m); return m; };
  const IM = { torso: inst(GEO.torso, NP), arm: inst(GEO.arm, NP * 2), thigh: inst(GEO.thigh, NP * 2), shin: inst(GEO.shin, NP * 2), head: inst(GEO.head, NP), hairS: inst(GEO.hairS, NP), hairL: inst(GEO.hairL, NP) };
  const IML = Object.values(IM), ZERO = new THREE.Matrix4().makeScale(0, 0, 0), C = new THREE.Color();
  for (const m of Object.values(IM)) for (let i = 0; i < m.count; i++) { m.setMatrixAt(i, ZERO); m.setColorAt(i, C.set('#ffffff')); }

  // the scratch rig: root (feet) → hip → upper body (torso, arms, head → hair) and thighs → shins
  const o = (p: THREE.Object3D, x: number, y: number, z: number) => { const q = new THREE.Object3D(); q.position.set(x, y, z); p.add(q); return q; };
  const R = new THREE.Object3D(); R.rotation.order = 'YXZ';
  const hip = o(R, 0, HIP, 0), up = o(hip, 0, 0, 0), torso = o(up, 0, .26, 0), aL = o(up, -.29, .45, .04), aR = o(up, .29, .45, .04), head = o(up, 0, .7, 0), hair = o(head, 0, 0, 0);
  const tL = o(hip, -.1, 0, 0), tR = o(hip, .1, 0, 0), sL = o(tL, 0, -.3, 0), sR = o(tR, 0, -.3, 0);

  const body = (s: number, headS: number, hairL: boolean): Body => ({ on: false, k: 0, kT: 0, s, headS, hairL, drawn: true, px: 0, py: Y, pz: 0, rot: 0, pitch: 0, lean: 0, aLx: 0, aRx: 0, aLz: -.08, aRz: .08, tLx: 0, tRx: 0, sLx: 0, sRx: 0 });
  function paint(i: number, shirt: string, pants: string, shin: string, skin: string, hc: string) {
    IM.torso.setColorAt(i, C.set(shirt)); IM.arm.setColorAt(2 * i, C); IM.arm.setColorAt(2 * i + 1, C);
    IM.thigh.setColorAt(2 * i, C.set(pants)); IM.thigh.setColorAt(2 * i + 1, C); IM.shin.setColorAt(2 * i, C.set(shin)); IM.shin.setColorAt(2 * i + 1, C);
    IM.head.setColorAt(i, C.set(skin)); IM.hairS.setColorAt(i, C.set(hc)); IM.hairL.setColorAt(i, C);
  }
  const kids: Kid[] = [];
  for (let i = 0; i < MAXKIDS; i++) { const skin = pick(SKIN), pants = pick(PANTS), L = Math.random() < .45;
    kids.push({ ...body(KID, KIDHEAD, L), i, x: run[0][0], z: run[0][1], act: 'gone', slot: -1, st: 0, tm: 0, stay: 0, ph: Math.random() * 6, fz: Math.random() * 6, way: new Float32Array(24), wn: 0, wi: 0, v: RUN, s0: 0 });
    paint(i, SHIRT[(i * 5 + Math.floor(Math.random() * 3)) % SHIRT.length], pants, Math.random() < .55 ? skin : pants, skin, pick(HAIR)); }
  const parents: Body[] = [];
  for (let j = 0; j < MAXPAR; j++) { const skin = pick(SKIN), pants = pick(PANTS); parents.push(body(1, 1, j === 1)); paint(MAXKIDS + j, CLOTH[(j * 3 + Math.floor(Math.random() * 3)) % CLOTH.length], pants, pants, skin, pick(HAIR)); }
  for (const m of Object.values(IM)) if (m.instanceColor) m.instanceColor.needsUpdate = true;

  function draw(B: Body, i: number, seat = false) { // seat: it fades in and out round its hips (on the bench), not up from its feet
    const k = B.k;
    if (k <= 0) { if (B.drawn) { for (const m of [IM.torso, IM.head, IM.hairS, IM.hairL]) m.setMatrixAt(i, ZERO); for (const m of [IM.arm, IM.thigh, IM.shin]) { m.setMatrixAt(2 * i, ZERO); m.setMatrixAt(2 * i + 1, ZERO); } B.drawn = false; } return; }
    B.drawn = true;
    R.position.set(B.px, B.py + (seat ? HIP * B.s * (1 - k) : 0), B.pz); R.rotation.set(B.pitch, B.rot, 0); R.scale.setScalar(B.s * k);
    up.rotation.x = B.lean; aL.rotation.set(B.aLx, 0, B.aLz); aR.rotation.set(B.aRx, 0, B.aRz);
    tL.rotation.x = B.tLx; tR.rotation.x = B.tRx; sL.rotation.x = B.sLx; sR.rotation.x = B.sRx;
    head.position.y = .53 + .17 * B.headS; head.scale.setScalar(B.headS);
    R.updateMatrixWorld(true);
    IM.torso.setMatrixAt(i, torso.matrixWorld); IM.head.setMatrixAt(i, head.matrixWorld);
    IM.hairS.setMatrixAt(i, B.hairL ? ZERO : hair.matrixWorld); IM.hairL.setMatrixAt(i, B.hairL ? hair.matrixWorld : ZERO);
    IM.arm.setMatrixAt(2 * i, aL.matrixWorld); IM.arm.setMatrixAt(2 * i + 1, aR.matrixWorld);
    IM.thigh.setMatrixAt(2 * i, tL.matrixWorld); IM.thigh.setMatrixAt(2 * i + 1, tR.matrixWorld);
    IM.shin.setMatrixAt(2 * i, sL.matrixWorld); IM.shin.setMatrixAt(2 * i + 1, sR.matrixWorld);
  }

  // ── poses ──
  function stand(B: Body) { B.pitch = 0; B.lean = 0; B.aLx = 0; B.aRx = 0; B.aLz = -.08; B.aRz = .08; B.tLx = 0; B.tRx = 0; B.sLx = 0; B.sRx = 0; }
  function stride(B: Body, ph: number, amp: number) { const w = Math.sin(ph) * amp; stand(B); B.tLx = w; B.tRx = -w; B.sLx = Math.max(0, -Math.sin(ph - .6)) * amp * 1.3; B.sRx = Math.max(0, Math.sin(ph - .6)) * amp * 1.3; B.aLx = -w * 1.1; B.aRx = w * 1.1; B.lean = amp * .18; }
  /** chair: knees bent down (a seat), else legs out in front (on the ground, on the slide) */
  function sit(B: Body, hipY: number, chair: boolean) { stand(B); B.tLx = B.tRx = -1.5; B.sLx = B.sRx = chair ? 1.45 : 0; B.py = hipY - HIP * B.s; }
  function arms(B: Body, x: number, zOut = .12) { B.aLx = B.aRx = x; B.aLz = -zOut; B.aRz = zOut; }

  // ── equipment state ──
  const swingBy: (Kid | null)[] = swings.map(() => null), swA = swings.map(() => 0), swPh = swings.map(() => Math.random() * 6), swTh = swings.map(() => 0);
  const swW = swings.map(S => Math.sqrt(9.8 / Math.max(.5, S.len)) * .92);
  for (const S of swings) if (S.seat) S.seat.rotation.order = 'YXZ';
  if (ss && ss.beam) ss.beam.rotation.order = 'YXZ';
  const seeBy: (Kid | null)[] = [null, null]; let seeA = ss ? ss.tilt : 0, seePh = 0;
  const sandBy: (Kid | null)[] = [null, null, null], climbBy: (Kid | null)[] = [null, null, null, null], tagBy: (Kid | null)[] = [null, null, null, null];
  const queue: Kid[] = []; let ladderBy: Kid | null = null; const QMAX = 3;
  // the run loop
  const cum = [0]; for (let i = 1; i <= run.length; i++) { const a = run[i - 1], b = run[i % run.length]; cum.push(cum[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1])); }
  const LOOP = cum[run.length];
  const loopAt = (s: number, K: { x: number; z: number }) => { s = ((s % LOOP) + LOOP) % LOOP; let i = 0; while (i < run.length - 1 && cum[i + 1] < s) i++;
    const a = run[i], b = run[(i + 1) % run.length], l = cum[i + 1] - cum[i] || 1, u = (s - cum[i]) / l; K.x = a[0] + (b[0] - a[0]) * u; K.z = a[1] + (b[1] - a[1]) * u; return Math.atan2(b[0] - a[0], b[1] - a[1]); };
  const nearestS = (x: number, z: number) => { let best = Infinity, s = 0; for (let i = 0; i < run.length; i++) { const a = run[i], b = run[(i + 1) % run.length], dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz || 1, u = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / l2)), d = Math.hypot(a[0] + dx * u - x, a[1] + dz * u - z); if (d < best) { best = d; s = cum[i] + u * Math.sqrt(l2); } } return s; };

  // spots
  const fwd = (r: number): P2 => [Math.sin(r), Math.cos(r)];
  const sandSpot = (j: number): Pose => { const a = j * 2.1 + .5, r = sb!.half * .5; return { x: sb!.c[0] + Math.sin(a) * r, z: sb!.c[1] + Math.cos(a) * r, rot: a + Math.PI }; };
  const climbSide = (j: number, d: number): Pose => { const a = j * Math.PI / 2; return { x: cl!.c[0] + Math.sin(a) * (cl!.half + d), z: cl!.c[1] + Math.cos(a) * (cl!.half + d), rot: a + Math.PI }; };
  const seeEnd = (j: number, alpha: number) => { const [fx, fz] = fwd(ss!.rot), sg = j ? 1 : -1, c = Math.cos(alpha) * ss!.half; return { x: ss!.x + fx * sg * c, z: ss!.z + fz * sg * c, y: Y + ss!.h + sg * Math.sin(alpha) * ss!.half, rot: ss!.rot + (j ? Math.PI : 0) }; };
  const qSpot = (n: number): Pose => { const L = sl!.ladder, [fx, fz] = fwd(L.rot); return { x: L.x - fx * .6 * (n + 1), z: L.z - fz * .6 * (n + 1), rot: L.rot }; };

  // walking: a few waypoints, round the equipment rather than through it: the climber, the slide (ladder to foot), the see-saw beam
  // and the swing seats are circles; a leg that crosses one (not the one it starts or ends in) gets a point beside it
  const OBS: [number, number, number][] = [];
  if (cl) OBS.push([cl.c[0], cl.c[1], cl.half * 1.42 + .25]);
  if (sl) for (let i = 0; i <= 3; i++) OBS.push([sl.ladder.x + (sl.foot.x - sl.ladder.x) * i / 3, sl.ladder.z + (sl.foot.z - sl.ladder.z) * i / 3, .6]);
  if (ss) { const [fx, fz] = fwd(ss.rot); for (const s of [-1, 0, 1]) OBS.push([ss.x + fx * s * ss.half * .8, ss.z + fz * s * ss.half * .8, .45]); }
  for (const S of swings) OBS.push([S.x, S.z, .6]);
  for (const o of spec.obstacles || []) OBS.push(o); // trees, lamps, benches, the hedge's curve
  function detour(ax: number, az: number, bx: number, bz: number): P2 | null {
    const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz; if (l2 < .01) return null; let best: P2 | null = null, bu = 2;
    for (const [ox, oz, r] of OBS) { if (Math.hypot(ax - ox, az - oz) < r + .1 || Math.hypot(bx - ox, bz - oz) < r + .1) continue;
      const u = ((ox - ax) * dx + (oz - az) * dz) / l2; if (u <= 0 || u >= 1 || u >= bu) continue; const cx = ax + dx * u - ox, cz = az + dz * u - oz, d = Math.hypot(cx, cz); if (d >= r) continue;
      const l = Math.sqrt(l2), nx = d > .01 ? cx / d : -dz / l, nz = d > .01 ? cz / d : dx / l; bu = u; best = [ox + nx * (r + .35), oz + nz * (r + .35)]; } // out on the near side
    return best; }
  function go(K: Kid, ...P: number[]) {
    const pts: number[] = [K.x, K.z, ...P];
    for (let i = 0, n = 0; i + 3 < pts.length && pts.length < K.way.length + 2 && n < 12; n++) { const c = detour(pts[i], pts[i + 1], pts[i + 2], pts[i + 3]); if (c) pts.splice(i + 2, 0, c[0], c[1]); else i += 2; }
    K.wn = Math.min(pts.length - 2, K.way.length); for (let i = 0; i < K.wn; i++) K.way[i] = pts[pts.length - K.wn + i]; K.wi = 0; }
  function walk(K: Kid, dt: number, spd: number) { // true once at the last point
    if (K.wi >= K.wn) return true;
    const tx = K.way[K.wi], tz = K.way[K.wi + 1], dx = tx - K.x, dz = tz - K.z, d = Math.hypot(dx, dz), stp = spd * dt;
    if (d > .02) K.rot = turn(K.rot, Math.atan2(dx, dz), 10, dt);
    if (d <= stp) { K.x = tx; K.z = tz; K.wi += 2; } else { K.x += dx / d * stp; K.z += dz / d * stp; }
    K.ph += dt * spd * 5.2; stride(K, K.ph, .8); K.px = K.x; K.pz = K.z; K.py = Y; // the phase about matches the step (no sliding feet); no bob: the body keeps one height
    return K.wi >= K.wn;
  }

  // ── choosing what to play ──
  const freeSlot = (L: (Kid | null)[]) => L.indexOf(null);
  function release(K: Kid) {
    const a = K.act;
    if (a === 'swing') swingBy[K.slot] = null; else if (a === 'sand') sandBy[K.slot] = null; else if (a === 'climb') climbBy[K.slot] = null;
    else if (a === 'seesaw') seeBy[K.slot] = null; else if (a === 'tag') tagBy[K.slot] = null;
    else if (a === 'slide') { const q = queue.indexOf(K); if (q >= 0) queue.splice(q, 1); if (ladderBy === K) ladderBy = null; }
    K.act = 'mill'; K.slot = -1;
  }
  const W: [Act, number][] = [['swing', 0], ['slide', 0], ['sand', 0], ['seesaw', 0], ['climb', 0], ['tag', 0]];
  function choose(K: Kid, quick = false) {
    const prev = K.act; release(K);
    const slideN = queue.length + (ladderBy ? 1 : 0) + kids.filter(Q => Q.act === 'slide' && Q.on && queue.indexOf(Q) < 0 && Q !== ladderBy).length;
    const tagN = tagBy.filter(Boolean).length, seeN = seeBy.filter(Boolean).length;
    W[0][1] = freeSlot(swingBy) >= 0 ? 3 : 0; W[1][1] = sl && slideN < QMAX ? 3 : 0; W[2][1] = sb && freeSlot(sandBy) >= 0 ? 2 : 0;
    W[3][1] = ss && seeN < 2 ? (seeN === 1 ? 7 : 2) : 0; W[4][1] = cl && freeSlot(climbBy) >= 0 ? 2 : 0; W[5][1] = tagN < 4 ? (tagN === 1 ? 5 : 2) : 0;
    for (const w of W) if (w[0] === prev && !quick) w[1] *= .15;
    const sum = W.reduce((n, w) => n + w[1], 0);
    let r = Math.random() * sum, act: Act = 'mill'; if (sum > 0) for (const w of W) { r -= w[1]; if (r <= 0 && w[1] > 0) { act = w[0]; break; } }
    K.act = act; K.st = 0; K.tm = 0; K.stay = act === 'mill' ? rnd(2, 4) : rnd(14, 32);
    if (act === 'swing') { K.slot = freeSlot(swingBy); swingBy[K.slot] = K; const S = swings[K.slot], [fx, fz] = fwd(S.rot); go(K, S.x - fx * .9, S.z - fz * .9, S.x, S.z); }
    else if (act === 'sand') { K.slot = freeSlot(sandBy); sandBy[K.slot] = K; const p = sandSpot(K.slot); go(K, p.x, p.z); }
    else if (act === 'climb') { K.slot = freeSlot(climbBy); climbBy[K.slot] = K; const p = climbSide(K.slot % 4, .32); go(K, p.x, p.z); }
    else if (act === 'seesaw') { K.slot = freeSlot(seeBy); seeBy[K.slot] = K; const e = seeEnd(K.slot, 0), [fx, fz] = fwd(ss!.rot + Math.PI / 2); go(K, e.x + fx * .5, e.z + fz * .5); }
    else if (act === 'tag') { K.slot = freeSlot(tagBy); tagBy[K.slot] = K; K.s0 = nearestS(K.x, K.z); const at = { x: 0, z: 0 }; loopAt(K.s0, at); go(K, at.x, at.z); K.v = rnd(2.5, 3.1); }
    else if (act === 'slide') { const p = qSpot(queue.length + 1); go(K, p.x, p.z); }
    else { const s = Math.random() * LOOP, at = { x: 0, z: 0 } as Kid; loopAt(s, at); go(K, at.x, at.z); }
  }

  // ── reduced motion: everyone at their equipment, still ──
  function snap(K: Kid) {
    K.wi = K.wn; K.k = K.kT;
    if (K.act === 'swing') K.st = 1; else if (K.act === 'sand' || K.act === 'seesaw') K.st = 1;
    else if (K.act === 'climb') { K.st = 2; K.tm = .7; } else if (K.act === 'tag') { K.st = 1; }
    if (K.wn >= 2) { K.x = K.way[K.wn - 2]; K.z = K.way[K.wn - 1]; }
    if (K.act === 'slide') { queue.push(K); K.st = 1; const p = qSpot(queue.length - 1); K.x = p.x; K.z = p.z; }
  }

  // ── one kid's step ──
  function step(K: Kid, dt: number, t: number) {
    if (K.act === 'gone') return;
    const live = !reduced; if (live) K.stay -= dt;
    switch (K.act) {
      case 'swing': { const S = swings[K.slot];
        if (K.st === 0) { if (walk(K, dt, WALK)) { K.st = 1; K.rot = S.rot; } return; }
        const th = swTh[K.slot], [fx, fz] = fwd(S.rot), sx = S.x + fx * S.len * Math.sin(th), sz = S.z + fz * S.len * Math.sin(th), sy = Y + S.h - S.len * Math.cos(th);
        const ux = -fx * Math.sin(th), uy = Math.cos(th), uz = -fz * Math.sin(th), hipUp = .07 - HIP * K.s; // the root: the hips on the seat, the body along the ropes
        sit(K, 0, true); K.rot = S.rot; K.pitch = -th; K.px = sx + ux * hipUp; K.py = sy + uy * hipUp; K.pz = sz + uz * hipUp;
        const pump = Math.cos(swPh[K.slot]) * (live ? 1 : 0); K.tLx = K.tRx = -1.35 - pump * .25; K.sLx = K.sRx = 1.2 - pump * .55; arms(K, -2.75, .2); K.lean = -pump * .15;
        if (live && K.stay <= 0) { K.x = sx; K.z = sz; choose(K); } return; }
      case 'sand': { const p = sandSpot(K.slot), sy = Y + (sb!.y ?? .08);
        if (K.st === 0) { if (walk(K, dt, WALK)) K.st = 1; return; }
        K.rot = live ? turn(K.rot, p.rot, 6, dt) : p.rot; sit(K, sy + .1, false); K.tLx = -1.45; K.tRx = -1.25; K.lean = .45; K.px = p.x; K.pz = p.z;
        const dig = live ? Math.sin(t * 5 + K.fz) : 0; K.aRx = -1.1 + dig * .45; K.aLx = -.6 - (live ? Math.max(0, Math.sin(t * 1.3 + K.fz)) * .5 : 0); K.aLz = -.2;
        if (live && K.stay <= 0) choose(K); return; }
      case 'seesaw': { const S = ss!, j = K.slot;
        if (K.st === 0) { if (walk(K, dt, WALK)) K.st = 1; return; }
        const e = seeEnd(j, seeA); sit(K, e.y + .1, true); K.rot = e.rot; K.px = e.x; K.pz = e.z; K.tLx = K.tRx = -1.25; K.sLx = K.sRx = 1.3;
        const rise = j ? Math.sin(seeA) : -Math.sin(seeA); arms(K, -1.05 - Math.max(0, rise / Math.max(.01, S.tilt)) * 1.7 * (live ? 1 : 0), .15);
        const alone = !seeBy[1 - j]; if (live && alone) K.stay -= dt * 2; // nobody on the other end: they soon go
        if (live && K.stay <= 0) { const [fx, fz] = fwd(S.rot + Math.PI / 2); K.x = e.x + fx * .5; K.z = e.z + fz * .5; choose(K); } return; }
      case 'climb': { const C = cl!, top = K.slot === 3, p = climbSide(K.slot, .12);
        if (K.st === 0) { if (walk(K, dt, WALK)) { K.st = 1; K.tm = 0; K.fz = top ? C.h : rnd(.45, C.h - .45); } return; }
        K.rot = p.rot;
        const cy = (y: number) => { K.px = p.x; K.pz = p.z; K.py = Y + y; stand(K); const c = live ? Math.sin(t * 6 + K.i) : .6; K.aLx = -2.6 - c * .3; K.aRx = -2.6 + c * .3; K.tLx = -.9 - c * .4; K.tRx = -.9 + c * .4; K.sLx = K.sRx = 1.1; };
        if (K.st === 1) { K.tm = Math.min(K.fz, K.tm + dt * .55); cy(K.tm); if (K.tm >= K.fz) K.st = 2; return; }
        if (K.st === 2) {
          if (top) { stand(K); K.px = C.c[0]; K.pz = C.c[1]; K.py = Y + C.h + .04; K.rot = live ? turn(K.rot, K.rot + .6, 1, dt) : p.rot; const wv = live ? Math.sin(t * 7) : 0; K.aLx = -.2; K.aRx = -2.8; K.aRz = .3 + wv * .35; }
          else { cy(K.fz + (live ? Math.sin(t * .8 + K.i) * .2 : 0)); if (!live) { K.aLx = -2.8; K.aRx = -2.4; } }
          if (live && K.stay <= 0) { K.st = 3; K.tm = K.fz; } return; }
        K.tm = Math.max(0, K.tm - dt * .7); cy(K.tm); if (K.tm <= 0) { const q = climbSide(K.slot, .32); K.x = q.x; K.z = q.z; choose(K); } return; }
      case 'tag': {
        if (K.st === 0) { if (walk(K, dt, WALK * 1.3)) K.st = 1; return; }
        if (!live) { const r = loopAt(K.s0 + K.slot * LOOP / 4, K); stand(K); K.rot = r + (K.slot % 2 ? Math.PI : 0); K.px = K.x; K.pz = K.z; K.py = Y; K.aRx = K.slot % 2 ? 0 : -1.3; return; }
        let v = K.v * (1 + .15 * Math.sin(t * .9 + K.fz)); // keep a little apart from the one ahead
        for (const Q of tagBy) if (Q && Q !== K && Q.st === 1) { const d = ((Q.s0 - K.s0) % LOOP + LOOP) % LOOP; if (d < .9) v = Math.min(v, Q.v * .8); }
        K.s0 += v * dt; const r = loopAt(K.s0, K); K.rot = turn(K.rot, r, 8, dt);
        K.ph += dt * v * 4; stride(K, K.ph, 1); K.aRx -= .2; K.px = K.x; K.pz = K.z; K.py = Y;
        if (K.stay <= 0) choose(K); return; }
      case 'slide': { const S = sl!, L = S.ladder, T = S.top, F = S.foot;
        if (K.st === 0) { if (walk(K, dt, WALK)) { queue.push(K); K.st = 1; } return; }
        if (K.st === 1) { const q = queue.indexOf(K), p = qSpot(q);
          if (K.wi >= K.wn && (Math.abs(K.x - p.x) > .05 || Math.abs(K.z - p.z) > .05)) go(K, p.x, p.z);
          if (K.wi < K.wn) { walk(K, dt, WALK * .8); return; }
          stand(K); K.rot = live ? turn(K.rot, L.rot, 8, dt) : L.rot; K.px = K.x; K.pz = K.z; K.py = Y;
          if (live && q === 0 && !ladderBy) { if (K.stay <= 0) { choose(K); return; } queue.shift(); ladderBy = K; go(K, L.x, L.z); K.st = 2; K.tm = 0; } return; }
        if (K.st === 2) { if (K.wi < K.wn) { walk(K, dt, WALK); return; } // up the ladder
          K.tm = Math.min(1, K.tm + dt / 1.5); const u = K.tm; K.px = L.x + (T.x - L.x) * u; K.pz = L.z + (T.z - L.z) * u; K.py = Y + S.h * u; K.rot = L.rot;
          stand(K); const c = Math.sin(K.tm * 16); K.aLx = -2.3 - c * .4; K.aRx = -2.3 + c * .4; K.tLx = -.8 - c * .5; K.tRx = -.8 + c * .5; K.sLx = K.sRx = 1;
          if (u >= 1) { K.st = 3; K.tm = 0; } return; }
        if (K.st === 3) { K.tm += dt; K.rot = turn(K.rot, T.rot, 9, dt); sit(K, S.h + Y + .12, false); K.px = T.x; K.pz = T.z; arms(K, -.4, .5); if (K.tm > .6) { K.st = 4; K.tm = 0; ladderBy = null; } return; }
        if (K.st === 4) { K.tm = Math.min(1, K.tm + dt / 1.2); const u = K.tm * K.tm * (1.6 - .6 * K.tm); // down the run: slow at first
          K.px = T.x + (F.x - T.x) * u; K.pz = T.z + (F.z - T.z) * u; K.rot = T.rot; sit(K, Y + .12 + (S.h + .02) * (1 - u) + .18 * (1 - u) * u, false); K.lean = -.35; arms(K, -2.7, .45);
          if (u >= 1) { K.st = 5; K.tm = 0; K.x = F.x; K.z = F.z; } return; }
        if (K.st === 5) { K.tm += dt; if (K.tm < .35) sit(K, Y + .12, false); else { stand(K); K.py = Y; } K.px = K.x; K.pz = K.z; // a moment on the ground at the end, then up
          if (K.tm >= .55) { if (K.stay <= 0) { choose(K); return; } const [rx, rz] = fwd(F.rot + Math.PI / 2), q = qSpot(queue.length); go(K, F.x + rx * .9, F.z + rz * .9, (L.x + T.x) / 2 + rx * .9, (L.z + T.z) / 2 + rz * .9, q.x + rx * .5, q.z + rz * .5, q.x, q.z); K.st = 6; } return; }
        if (walk(K, dt, WALK * 1.1)) { queue.push(K); K.st = 1; } return; }
      default: { // mill about (or nothing free): stand on the grass and look round, then try again
        if (K.wi < K.wn) { walk(K, dt, WALK * .7); return; }
        stand(K); K.px = K.x; K.pz = K.z; K.py = Y; K.rot = live ? turn(K.rot, K.rot + Math.sin(t + K.fz), 1.5, dt) : K.rot;
        if (live && K.stay <= 0) choose(K, true); }
    }
  }

  // ── parents on the benches ──
  function placeParent(B: Body, j: number) {
    if (!spec.benches.length) { B.kT = 0; return; }
    const P = spec.benches[j % spec.benches.length], [rx, rz] = fwd(P.rot + Math.PI / 2), off = spec.benches.length > j ? 0 : .55; // a bench of its own, else side by side
    sit(B, Y + SEATH + .05, true); B.rot = P.rot; B.px = P.x + rx * off; B.pz = P.z + rz * off; B.tLx = B.tRx = -1.45; B.sLx = B.sRx = 1.45;
    B.aLx = -.55; B.aRx = j ? -1.1 : -.5; B.aLz = -.05; B.aRz = j ? -.35 : .05; // one has a phone
  }

  // soft (the live count, every sync): fewer kids only once the lower count has held LOWER s, and a parent stays PSTAY s at least,
  // the second one comes at 7 kids and goes at 4 (no fading in and out as the count wobbles). Not soft (the setting, the probe): at once.
  const LOWER = 20, PSTAY = 60; let parToggles = 0, count = 0, np = 0, tNow = 0, lowSince = -1; const parAt = parents.map(() => -1e9);
  function setCount(n: number, soft = false) {
    let c = Math.max(0, Math.min(MAXKIDS, Math.round(n)));
    if (soft && c < count) { if (lowSince < 0) lowSince = tNow; if (tNow - lowSince < LOWER) c = count; } else lowSince = -1;
    if (c < count) lowSince = -1;
    count = c;
    for (const K of kids) { const want = K.i < count;
      if (want && (!K.on || K.kT === 0)) { const fresh = !K.on || K.act === 'gone', seen = K.on && K.k > 0; K.on = true; K.kT = 1;
        if (fresh) { if (!seen) { const s = Math.random() * LOOP; K.rot = loopAt(s, K); K.k = reduced ? 1 : 0; } else { K.x = K.px; K.z = K.pz; } // one still fading out turns back where it stands
          K.act = 'mill'; choose(K, true); if (reduced) snap(K); } }
      else if (!want && K.on && K.kT > 0) { K.kT = 0; release(K); K.act = 'gone'; } }
    if (reduced) for (const K of kids) if (K.on && K.kT > 0) { for (let i = 0; i < 2; i++) step(K, 0, 0); } // settle the pose
    const want = !count ? 0 : !soft ? (count >= 6 ? 2 : 1) : count >= 7 ? 2 : count <= 4 ? 1 : Math.max(1, np);
    np = soft ? (want < np && parents.some((B, j) => j >= want && j < np && tNow - parAt[j] < PSTAY) ? np : want) : want;
    parents.forEach((B, j) => { const on = j < np && spec.benches.length > 0;
      if (on && !B.kT) { B.kT = 1; parToggles++; if (!B.on || B.k <= 0) placeParent(B, j); B.on = true; parAt[j] = tNow; if (reduced) B.k = 1; } // only a parent newly turned on sits down: one already there is left alone
      else if (!on && B.kT) { B.kT = 0; parToggles++; } });
  }

  function frame(dtIn: number, t: number) {
    const dt = reduced ? 0 : Math.min(.1, Math.max(0, dtIn)); tNow = t;
    // the swings: up to speed while someone sits on them, slowly to rest when empty
    for (let i = 0; i < swings.length; i++) { const K = swingBy[i], on = !!K && K.st === 1 && K.k > .5;
      swA[i] += ((on ? .72 : 0) - swA[i]) * dt * (on ? .35 : .5); swPh[i] += swW[i] * dt; swTh[i] = reduced ? 0 : swA[i] * Math.sin(swPh[i]);
      const seat = swings[i].seat; if (seat) seat.rotation.x = -swTh[i]; }
    if (ss) { const a = seeBy[0] && seeBy[0].st === 1, b = seeBy[1] && seeBy[1].st === 1;
      if (reduced) seeA = a && b ? 0 : a ? ss.tilt : b ? -ss.tilt : seeA;
      else if (a && b) { seePh += dt * 1.7; seeA += (ss.tilt * .95 * Math.sin(seePh) - seeA) * Math.min(1, dt * 6); }
      else { const tg = a ? ss.tilt : b ? -ss.tilt : seeA; seeA += (tg - seeA) * Math.min(1, dt * 2.5); seePh = Math.asin(Math.max(-1, Math.min(1, seeA / ss.tilt))); }
      if (ss.beam) ss.beam.rotation.x = -seeA; }
    for (const K of kids) {
      if (!K.on) continue;
      K.k = reduced ? K.kT : K.kT > K.k ? Math.min(K.kT, K.k + dt * 2.5) : Math.max(K.kT, K.k - dt * 2.5); // stops at kT (no size pulse once faded in)
      if (K.kT === 0 && K.k <= 0) { K.on = false; draw(K, K.i); continue; }
      if (K.kT > 0) step(K, dt, t);
      draw(K, K.i);
    }
    parents.forEach((B, j) => { if (!B.on) return; B.k = reduced ? B.kT : B.kT > B.k ? Math.min(B.kT, B.k + dt * 2) : Math.max(B.kT, B.k - dt * 2); if (!B.kT && !B.k) B.on = false;
      if (!reduced && B.kT && j === 0) B.rot = spec.benches[0].rot + Math.sin(t * .23) * .35; // watching the kids
      draw(B, MAXKIDS + j, true); });
    for (const m of IML) m.instanceMatrix.needsUpdate = true;
  }

  return {
    group, setCount, frame,
    stats() { const acts = { swing: 0, slide: 0, sand: 0, seesaw: 0, climb: 0, tag: 0, mill: 0, gone: 0 } as Record<Act, number>; for (const K of kids) if (K.on) acts[K.act]++;
      return { kids: kids.filter(K => K.on && K.kT > 0).length, parents: parents.filter(B => B.on && B.kT > 0).length, acts, swings: swTh.map(v => +v.toFixed(2)), seesaw: +seeA.toFixed(2),
        at: kids.filter(K => K.on && K.kT > 0).map(K => [+K.px.toFixed(2), +K.pz.toFixed(2), K.act] as [number, number, Act]),
        par: parents.filter(B => B.on).map(B => [+(B.py + HIP * B.s).toFixed(3), +B.rot.toFixed(3), +B.k.toFixed(2)] as [number, number, number]), parToggles }; },
    dispose() { group.removeFromParent(); for (const m of Object.values(IM)) m.dispose(); for (const g of Object.values(GEO)) g.dispose(); mat.dispose();
      for (const S of swings) if (S.seat) S.seat.rotation.x = 0; if (ss && ss.beam) ss.beam.rotation.x = 0; },
  };
}
