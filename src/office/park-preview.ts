// Preview of the playground kids (?parkPreview=1, loaded by index.ts only then): a small playground on empty ground at
// PARK_PREVIEW_AT (swings, slide, sandbox, see-saw, climbing frame, benches, grass) with 10 kids from kids.ts playing on it.
// window.__office.look(96, -40, 1.2) frames it; window.__kids is the kids' API (stats(), setCount(n)).
//
// The equipment builders are exported so the real park can use them, or match their poses: each returns merged,
// vertex-coloured geometry in its own frame (origin on the ground, see each one), and *Poses() gives the KidSpec part
// for a piece placed at (x, z) turned by rot. Heights are above the ground the piece stands on.
import * as THREE from 'three';
import type { OfficeState } from './state.js';
import type { P2 } from '../common/types.js';
import { makeKids, type KidSpec, type KidSwing, type KidSlide, type KidSeesaw, type Pose } from './kids.js';

export const PARK_PREVIEW_AT: readonly [number, number] = [96, -40];
/** What the builders need from OS (the layout.ts geometry helpers). */
export type PlayGeoOS = Pick<OfficeState, 'bx' | 'cy' | 'sp' | 'merge'>;
type G = THREE.BufferGeometry;

export const SWING = { h: 2.1, len: 1.7, gap: 1.2, splay: .95 } as const;     // top bar height, rope length, seat spacing, how far each A-frame leg stands out
export const SLIDE = { h: 1.3, run: 2.8, ladder: .8, w: .5 } as const;         // platform height, run length, ladder foot behind the platform, chute width
export const SEESAW = { h: .45, half: 1.5, tilt: Math.asin(.41 / 1.5) } as const; // pivot height, seat distance from the pivot, tilt with one end on the ground
export const CLIMBER = { half: 1, h: 1.6 } as const;
export const SANDBOX = { half: 1.4, sand: .1 } as const;
export const BENCH = { seat: .48, w: 1.5 } as const;

const RED = '#c8452f', STEEL = '#9aa3ad', WOOD = '#8a6a44', DARK = '#2b2f36', YEL = '#c99a24', BLUE = '#3a7bd5', GREEN = '#5aa84a';

/** A round bar from a to b. */
function rod(P: PlayGeoOS, r: number, a: readonly [number, number, number], b: readonly [number, number, number], c: string, seg = 8): G {
  const d = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]), len = d.length(), g = P.cy(r, len, 0, 0, 0, c, seg);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize())); g.translate((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2); return g;
}
/** A flat board w wide, t thick, from a to b in the y-z plane (x = a[0]). */
function slab(P: PlayGeoOS, w: number, t: number, a: readonly [number, number, number], b: readonly [number, number, number], c: string): G {
  const dy = b[1] - a[1], dz = b[2] - a[2], g = P.bx(w, t, Math.hypot(dy, dz), 0, 0, 0, c); g.rotateX(-Math.atan2(dy, dz)); g.translate(a[0], (a[1] + b[1]) / 2, (a[2] + b[2]) / 2); return g;
}
const place = (x: number, z: number, rot: number, lx: number, lz: number, lrot = 0): Pose => { const c = Math.cos(rot), s = Math.sin(rot); return { x: x + lx * c + lz * s, z: z - lx * s + lz * c, rot: rot + lrot }; };

/** Swing frame: origin on the ground under the middle of the top bar; the bar runs along x, the n seats hang at x = seatX(i)
 *  and swing along z (the kids face +z). */
export const seatX = (i: number, n: number, gap: number = SWING.gap) => (i - (n - 1) / 2) * gap;
export function swingFrameGeometry(P: PlayGeoOS, n = 2, h: number = SWING.h, gap: number = SWING.gap): G {
  const half = (n - 1) * gap / 2 + .7, L: G[] = [rod(P, .06, [-half - .1, h, 0], [half + .1, h, 0], STEEL, 10)];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) { L.push(rod(P, .055, [sx * half, h, 0], [sx * half, 0, sz * SWING.splay], RED)); L.push(P.bx(.16, .04, .16, sx * half, .02, sz * SWING.splay, DARK)); }
  for (let i = 0; i < n; i++) for (const s of [-1, 1]) L.push(P.cy(.03, .06, seatX(i, n, gap) + s * .22, h - .05, 0, DARK, 6));
  return P.merge(L);
}
/** One swing seat with its ropes: origin at the pivot on the top bar, hanging down -y. Swing it with rotation.x (order YXZ). */
export function swingSeatGeometry(P: PlayGeoOS, len = SWING.len): G {
  return P.merge([P.cy(.014, len, -.22, -len / 2, 0, '#c9ccd1', 5), P.cy(.014, len, .22, -len / 2, 0, '#c9ccd1', 5), P.bx(.52, .05, .22, 0, -len, 0, DARK)]);
}
export function swingPoses(x: number, z: number, rot: number, n = 2, h: number = SWING.h, len: number = SWING.len, gap: number = SWING.gap): KidSwing[] {
  return Array.from({ length: n }, (_, i) => ({ ...place(x, z, rot, seatX(i, n, gap), 0), h, len }));
}

/** Slide: origin on the ground under the middle of the platform; the run goes down along +z, the ladder is at -z. */
export function slideGeometry(P: PlayGeoOS, h = SLIDE.h, run = SLIDE.run, lad = SLIDE.ladder): G {
  const w = SLIDE.w, L: G[] = [P.bx(.75, .07, .7, 0, h, 0, YEL)];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) L.push(rod(P, .045, [sx * .33, 0, sz * .3], [sx * .33, h + .55, sz * .3], BLUE));
  for (const sx of [-1, 1]) { L.push(rod(P, .03, [sx * .33, h + .5, -.3], [sx * .33, h + .5, .3], BLUE)); L.push(rod(P, .04, [sx * .27, 0, -lad], [sx * .27, h, -.32], STEEL)); }
  L.push(rod(P, .03, [-.33, h + .5, -.3], [.33, h + .5, -.3], BLUE));
  for (let k = 1; k <= 5; k++) { const u = k / 6; L.push(rod(P, .025, [-.27, h * u, -lad + (lad - .32) * u], [.27, h * u, -lad + (lad - .32) * u], STEEL, 6)); }
  const z0 = .35, z1 = run - .35, y1 = .3;
  L.push(slab(P, w, .05, [0, h, z0], [0, y1, z1], RED), slab(P, w, .05, [0, y1, z1], [0, .24, run], RED));
  for (const sx of [-1, 1]) L.push(slab(P, .04, .16, [sx * (w / 2 + .02), h + .07, z0], [sx * (w / 2 + .02), y1 + .07, z1], RED), slab(P, .04, .16, [sx * (w / 2 + .02), y1 + .07, z1], [sx * (w / 2 + .02), .31, run], RED));
  L.push(rod(P, .04, [0, 0, z1 - .2], [0, y1, z1 - .2], STEEL));
  return P.merge(L);
}
export function slidePoses(x: number, z: number, rot: number, h = SLIDE.h, run = SLIDE.run, lad = SLIDE.ladder): KidSlide {
  return { ladder: place(x, z, rot, 0, -lad - .15), top: place(x, z, rot, 0, 0), foot: place(x, z, rot, 0, run + .35), h };
}

/** Sandbox: origin at its centre on the ground; a wooden rim round the sand, a bucket and a spade. */
export function sandboxGeometry(P: PlayGeoOS, half: number = SANDBOX.half): G {
  const L: G[] = [P.bx(half * 2 - .2, SANDBOX.sand, half * 2 - .2, 0, SANDBOX.sand / 2, 0, '#b8a172')];
  for (const s of [-1, 1]) L.push(P.bx(half * 2, .2, .16, 0, .1, s * (half - .08), WOOD), P.bx(.16, .2, half * 2 - .32, s * (half - .08), .1, 0, WOOD));
  L.push(P.cy(.09, .16, half * .35, .16, -half * .3, '#d8402e', 10), P.bx(.06, .02, .3, -half * .4, .12, half * .25, '#2f6fd6'), P.sp(.18, -half * .1, .08, half * .2, '#cdb377'));
  return P.merge(L);
}

/** See-saw base (the fulcrum): origin on the ground at the pivot. */
export function seesawBaseGeometry(P: PlayGeoOS, h = SEESAW.h): G {
  return P.merge([P.bx(.34, h - .05, .26, 0, (h - .05) / 2, 0, BLUE), P.cy(.06, .42, 0, h, 0, STEEL, 10, Math.PI / 2), P.bx(.6, .04, .4, 0, .02, 0, DARK)]);
}
/** See-saw beam: origin at the pivot, the beam along z (end A at -half, end B at +half). Tilt it with rotation.x (order YXZ; negative: end B up). */
export function seesawBeamGeometry(P: PlayGeoOS, half = SEESAW.half): G {
  const L: G[] = [P.bx(.22, .07, half * 2 + .35, 0, .03, 0, YEL)];
  for (const s of [-1, 1]) { L.push(P.bx(.34, .05, .34, 0, .08, s * half, RED), rod(P, .025, [0, .06, s * (half - .32)], [0, .36, s * (half - .32)], STEEL, 6), rod(P, .025, [-.16, .36, s * (half - .32)], [.16, .36, s * (half - .32)], STEEL, 6)); }
  return P.merge(L);
}
export function seesawPoses(x: number, z: number, rot: number, h = SEESAW.h, half = SEESAW.half): KidSeesaw { return { x, z, rot, h, half, tilt: SEESAW.tilt }; }

/** Climbing frame: origin at its centre on the ground; a 3 x 3 grid of posts with bars at three levels. */
export function climberGeometry(P: PlayGeoOS, half: number = CLIMBER.half, h: number = CLIMBER.h): G {
  const L: G[] = [], X = [-half, 0, half], lv = [.55, 1.1, h];
  for (const x of X) for (const z of X) L.push(rod(P, .045, [x, 0, z], [x, h + .02, z], BLUE));
  for (const y of lv) for (const u of X) { L.push(rod(P, .032, [-half, y, u], [half, y, u], y === h ? YEL : GREEN, 6), rod(P, .032, [u, y, -half], [u, y, half], y === h ? YEL : GREEN, 6)); }
  return P.merge(L);
}

/** Bench: origin on the ground under the middle of the seat; whoever sits on it faces +z. */
export function benchGeometry(P: PlayGeoOS): G {
  const w = BENCH.w, L: G[] = [P.bx(w, .06, .42, 0, BENCH.seat - .03, 0, WOOD), P.bx(w, .3, .05, 0, .78, -.21, WOOD)];
  for (const s of [-1, 1]) L.push(P.bx(.06, BENCH.seat - .06, .36, s * (w / 2 - .12), (BENCH.seat - .06) / 2, 0, DARK), P.bx(.06, .4, .05, s * (w / 2 - .12), .62, -.21, DARK));
  return P.merge(L);
}

/** A loop of n points round an ellipse (for KidSpec.run). */
export const loop = (cx: number, cz: number, rx: number, rz: number, n = 12): P2[] => Array.from({ length: n }, (_, i): P2 => [cx + rx * Math.cos(i / n * Math.PI * 2), cz + rz * Math.sin(i / n * Math.PI * 2)]);

type PreviewOS = PlayGeoOS & Pick<OfficeState, 'mesh' | 'VC' | 'ctx'>;

export function parkPreview(OS: PreviewOS, kidsN = 10) {
  const { bx, cy, sp, merge, mesh, VC } = OS, { scene } = OS.ctx, [X0, Z0] = PARK_PREVIEW_AT, Y = .04;
  const root = new THREE.Group(); root.position.set(X0, 0, Z0); scene.add(root);
  const put = (g: G, x: number, z: number, rot = 0, y = Y) => { const m = mesh(g, VC); m.position.set(x, y, z); m.rotation.y = rot; root.add(m); return m; };
  // ground: grass, a safety mat under the swings and the climbing frame, a low fence with a gap on the south side, two trees
  const GX = 11.5, GZ = 8.5, F: G[] = [bx(GX * 2, .04, GZ * 2, 0, .02, 0, '#3f6136'), bx(4.6, .012, 4.4, -6.5, .046, -4.5, '#7a4038'), bx(3.4, .012, 3.4, 4.5, .046, -4.5, '#7a4038')];
  for (let x = -GX; x <= GX + .01; x += 1.5) for (const z of [-GZ, GZ]) if (!(z > 0 && Math.abs(x - 2) < 1.6)) F.push(bx(.08, .6, .08, x, .3, z, '#b7a07a'));
  for (let z = -GZ; z <= GZ + .01; z += 1.5) for (const x of [-GX, GX]) F.push(bx(.08, .6, .08, x, .3, z, '#b7a07a'));
  for (const z of [-GZ, GZ]) for (const [a, b] of z > 0 ? [[-GX, .4], [3.6, GX]] : [[-GX, GX]]) F.push(bx(b - a, .06, .05, (a + b) / 2, .5, z, '#b7a07a'));
  for (const x of [-GX, GX]) F.push(bx(.05, .06, GZ * 2, x, .5, 0, '#b7a07a'));
  for (const [x, z] of [[-10, 7], [10.2, -7.2]] as P2[]) F.push(cy(.14, 1.6, x, .8, z, '#5a4030'), sp(1.2, x, 2.2, z, '#2f5a2c'));
  root.add(mesh(merge(F), VC, true, true));
  // equipment (local to root)
  const SW: P2 = [-6.5, -4.5], SLD: P2 = [-1, -5.4], SBX: P2 = [-6.5, 2.6], SS: P2 = [-1.2, 3.2], CLM: P2 = [4.6, -4.5];
  put(swingFrameGeometry(OS), SW[0], SW[1]);
  const sw = swingPoses(SW[0], SW[1], 0);
  for (const S of sw) { const seat = put(swingSeatGeometry(OS), S.x, S.z, S.rot, Y + S.h); seat.rotation.order = 'YXZ'; S.seat = seat; }
  put(slideGeometry(OS), SLD[0], SLD[1]);
  put(sandboxGeometry(OS), SBX[0], SBX[1]);
  put(seesawBaseGeometry(OS), SS[0], SS[1], Math.PI / 2);
  const see = seesawPoses(SS[0], SS[1], Math.PI / 2), beam = put(seesawBeamGeometry(OS), see.x, see.z, see.rot, Y + see.h); beam.rotation.order = 'YXZ'; see.beam = beam;
  put(climberGeometry(OS), CLM[0], CLM[1]);
  const benches: Pose[] = [{ x: -4, z: 7.2, rot: Math.PI }, { x: 10.6, z: -1.5, rot: -Math.PI / 2 }];
  for (const B of benches) put(benchGeometry(OS), B.x, B.z, B.rot);
  const spec: KidSpec = { swings: sw, slide: slidePoses(SLD[0], SLD[1], 0), sandbox: { c: SBX, half: SANDBOX.half, y: SANDBOX.sand }, seesaw: see,
    climber: { c: CLM, half: CLIMBER.half, h: CLIMBER.h }, run: loop(6.2, 3.4, 3.4, 2.6), benches, seatH: BENCH.seat, y: Y, parent: root };
  const kids = makeKids(OS, spec); kids.setCount(kidsN);
  (window as unknown as { __kids?: typeof kids }).__kids = kids;
  // its own clock: the preview is loaded after the scene's frame loop is set up
  let last = performance.now(), on = true;
  const tick = (now: number) => { if (!on) return; const dt = Math.min(.1, (now - last) / 1000); last = now; kids.frame(dt, now / 1000); requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
  return { kids, root, stop() { on = false; kids.dispose(); root.removeFromParent(); } };
}
