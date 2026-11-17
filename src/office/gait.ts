// How a grown-up walks in the office view: the office person (props.ts G.torso / G.arm) with its legs on hip pivots and
// a knee in each, one swinging forward while the other swings back, the arms against them, like the kids (kids.ts stride).
// The leg that carries the body stays straight; the one swinging through bends at the knee, so it clears the ground
// without lifting the body. No hop: the body stays at one height while walking (gaitDip), and the swing is small enough
// (AMAX) that the lower foot stays within about 1.8 cm of the ground. The phase runs on the distance
// walked, so the feet do not slide; faster walkers take longer and quicker steps. Standing (or reduced motion): legs
// straight, arms down.
//
// Cheap: the legs share geometries (G.leg: the thigh, origin at the hip, with the shin, origin at the knee, in its
// userData.shin), the head and hair another (G.head); one mesh each.
import * as THREE from 'three';
import { reduced } from '../common/dom.js';

/** The hip height, how far each leg sits from the middle, the leg length (thigh + shin). */
export const HIP = .6, LEG_X = .11, LEG_LEN = .6;
const THIGH = .3, SHIN = LEG_LEN - THIGH, SHIN_D = .095; // SHIN_D: half the shin's depth (its corners reach lower when it tilts)
// hip swing (rad) slow..fast; the swinging leg's knee bend at mid swing (rad). Long steps: a stride of ~1 m at 1.3 m/s,
// about 2.6 steps a second (short steps of the same speed patter, which reads as shaking)
// RMAX: above 2 m/s (people in a hurry, police, bandits) the swing grows on to a running stride, the feet off the ground
// at the ends of it as a runner's are
const AMIN = .3, AMAX = .5, RMAX = .7, KNEE = 1.05;
type Bx = (w: number, h: number, d: number, x: number, y: number, z: number, c: THREE.ColorRepresentation) => THREE.BufferGeometry;
type Sp = (r: number, x: number, y: number, z: number, c: THREE.ColorRepresentation) => THREE.BufferGeometry;

/** One leg: the thigh (origin at the hip, hanging down -y), the shin in userData.shin (origin at the knee; reaches a little
 *  above it so the bent knee shows no gap). Together the old G.body leg box. */
export const legGeo = (bx: Bx, pants: THREE.ColorRepresentation = '#20242c') => {
  const g = bx(.17, THIGH, .2, 0, -THIGH / 2, 0, pants); g.userData.shin = bx(.16, SHIN + .04, SHIN_D * 2, 0, .02 - SHIN / 2, 0, pants); return g;
};
/** The head and hair, in the person's frame (the old G.body head); long: hair down the back too. */
export const headGeo = (bx: Bx, sp: Sp, merge: (L: THREE.BufferGeometry[]) => THREE.BufferGeometry, hair: THREE.ColorRepresentation = '#2a2018', long = false) =>
  merge([sp(.17, 0, 1.3, 0, '#e2b08a'), bx(.3, .1, .3, 0, 1.44, -.03, hair), ...(long ? [bx(.3, .22, .07, 0, 1.36, -.15, hair)] : [])]);

export interface Legs { lL: THREE.Mesh; lR: THREE.Mesh; head: THREE.Mesh }
/** Adds the head and the two legs to g in material m (a BODY material): what G.body drew, with the legs free to swing. */
export function addLegs(g: THREE.Object3D, mesh: (geo: THREE.BufferGeometry, m: THREE.Material) => THREE.Mesh, m: THREE.Material, leg: THREE.BufferGeometry, head: THREE.BufferGeometry): Legs {
  const lL = mesh(leg, m), lR = mesh(leg, m), hd = mesh(head, m);
  for (const l of [lL, lR]) { const s = mesh(leg.userData.shin as THREE.BufferGeometry, m); s.position.y = -THIGH; l.add(s); }
  lL.position.set(-LEG_X, HIP, 0); lR.position.set(LEG_X, HIP, 0); g.add(lL, lR, hd);
  return { lL, lR, head: hd };
}
/** The shin of a leg (its first child), kept in the thigh's trousers and material (callers may swap those on the thigh). */
function shin(l: THREE.Object3D): THREE.Object3D | null {
  const s = l.children[0] as THREE.Mesh | undefined; if (!s) return null;
  const t = l as THREE.Mesh, sg = t.geometry && (t.geometry.userData.shin as THREE.BufferGeometry | undefined);
  if (sg && s.geometry !== sg) s.geometry = sg;
  if (t.material && s.material !== t.material) s.material = t.material;
  return s;
}
/** How far below the hip the lowest point of a leg is: thigh at th, shin at th + knee (rad, from straight down). */
const reach = (th: number, kn: number) => THIGH * Math.cos(th) + SHIN * Math.cos(th + kn) + SHIN_D * Math.abs(Math.sin(th + kn));

/** A walker's gait state: its legs, the phase (rad, one full stride per 2 pi) and the swing it has now (eased, rad). */
export interface Gait { lL: THREE.Object3D; lR: THREE.Object3D; ph: number; ga: number }
/** The leg swing for a speed (m/s): longer steps when faster. */
export const swingFor = (v: number) => v <= 2 ? Math.min(AMAX, Math.max(AMIN, .3 + .1 * v)) : Math.min(RMAX, AMAX + .2 * (v - 2));

/** One frame: dist is how far the walker went (m, in its own scale). Moves the phase on by the distance (two steps of
 *  4 * LEG_LEN * sin(swing) per stride, so the feet stay put), eases the swing towards the one for the speed (to 0 when
 *  standing) and swings the legs. Returns the left arm's swing (rotation.x; the right arm takes minus it), 0 when still. */
export function gait(S: Gait, dist: number, dt: number, scale = 1): number {
  const v = dt > 0 ? dist / dt : 0, on = !reduced && dist > 1e-5, a = on ? swingFor(v / Math.max(.05, scale)) : 0;
  if (on) S.ph = (S.ph + dist / Math.max(.05, scale) * Math.PI / (2 * LEG_LEN * Math.sin(a))) % (Math.PI * 2);
  S.ga = reduced ? 0 : S.ga + (a - S.ga) * Math.min(1, dt * 10);
  if (probe) probe.add(S);
  const w = Math.sin(S.ph) * S.ga, c = Math.cos(S.ph), k = KNEE * S.ga / AMAX;
  S.lL.rotation.x = -w; S.lR.rotation.x = w; // positive x: the foot goes back; the left leg forward while the left arm goes back
  // the leg swinging forward (left while cos > 0) bends at the knee, most when it passes under the hip; the other stays straight
  const sL = shin(S.lL), sR = shin(S.lR); if (sL) sL.rotation.x = k * Math.max(0, c); if (sR) sR.rotation.x = k * Math.max(0, -c);
  return S.ga < 1e-3 ? 0 : w * .9;
}
/** How far to raise the body now (m, in the walker's scale). No bob: a steady height for the swing it has (the middle of
 *  how far the lower foot reaches below the hip over a stride: +.5 cm at a swing of .3, -1 cm at .5, -3.7 cm at .7), never
 *  on the phase. Walking, the foot then stays within about 1.8 cm of the ground; a body following the foot every frame
 *  went up and down twice a stride. */
export function gaitDip(S: Gait): number {
  if (!S.lL.children[0] || !S.lR.children[0]) return 0;
  const a = S.ga; return a < AMIN ? .005 * a / AMIN : a <= AMAX ? .005 - .0775 * (a - AMIN) : -.0105 - .13 * (a - AMAX);
}
/** A walking speed (m/s) for one person: most 1.1..1.6, about one in seven a slow stroller (.8..1.05), one in seven brisk
 *  (1.65..1.9). The gait follows it (longer and quicker steps when faster). */
export function walkSpeed(r: () => number = Math.random): number { const u = r(); return u < .14 ? .8 + r() * .25 : u > .86 ? 1.65 + r() * .25 : 1.1 + r() * .5; }
// Probe (window.__gait.sample(ms)): for the walkers walking all the time, per kind, how far the lower foot gets off the
// ground (the level the body stands on: its y less gaitDip) and how much the head goes up and down, in cm, over ms;
// stepsPerS: steps a second (two a stride; people walk at about 2, much more reads as shaking).
let probe: Set<Gait> | null = null;
type Row = { kind: string; n: number; footMax: number; headRange: number; v: number; stepsPerS: number };
const kindOf = (S: object) => 'kind' in S ? 'folk:' + String((S as { kind: unknown }).kind) : 'dog' in S ? 'dog walker' : 'route' in S ? 'shopper' : 'seat' in S ? 'office person' : 'P' in S ? 'home walker' : '?';
function sample(ms: number): Promise<Row[]> {
  probe = new Set(); const tr = new Map<Gait, { foot: number; lo: number; hi: number; n: number; d: number; t: number; x: number; z: number; at: number; ph: number; lph: number }>(), v = new THREE.Vector3(), t0 = performance.now();
  const shinPts = [-.08, .08].flatMap(x => [-SHIN_D, SHIN_D].map(z => new THREE.Vector3(x, -SHIN, z)));
  return new Promise(res => {
    const f = () => {
      for (const S of probe!) {
        const g = S.lL.parent; if (!g) continue; g.updateWorldMatrix(true, true);
        let foot = 1e9; for (const l of [S.lL, S.lR]) { const s = l.children[0]; if (!s) continue; for (const p of shinPts) foot = Math.min(foot, s.localToWorld(v.copy(p)).y); }
        const head = g.localToWorld(v.set(0, 1.3, 0)).y, ground = g.localToWorld(v.set(0, -gaitDip(S), 0)).y, wp = g.getWorldPosition(v);
        let r = tr.get(S); if (!r) { r = { foot: 0, lo: 1e9, hi: -1e9, n: 0, d: 0, t: 0, x: wp.x, z: wp.z, at: performance.now(), ph: 0, lph: S.ph }; tr.set(S, r); }
        const now = performance.now(), dd = Math.hypot(wp.x - r.x, wp.z - r.z), ddt = (now - r.at) / 1000; r.x = wp.x; r.z = wp.z; r.at = now;
        const stepped = ((S.ph - r.lph) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI); r.lph = S.ph;
        if (S.ga < .15 || dd < 1e-4 || Math.abs(g.getWorldScale(v).y - 1) > 1e-3) continue; // only the frames walking (not standing, starting, fading in or out)
        r.n++; r.d += dd; r.t += ddt; r.ph += stepped; r.foot = Math.max(r.foot, Math.abs(foot - ground));
        r.lo = Math.min(r.lo, head - ground); r.hi = Math.max(r.hi, head - ground);
      }
      if (performance.now() - t0 < ms) { requestAnimationFrame(f); return; }
      probe = null; const by = new Map<string, Row>();
      for (const [S, r] of tr) { if (r.n < 30) continue; /* at least half a second of walking */ const k = kindOf(S); let b = by.get(k); if (!b) { b = { kind: k, n: 0, footMax: 0, headRange: 0, v: 0, stepsPerS: 0 }; by.set(k, b); }
        b.n++; b.footMax = Math.max(b.footMax, r.foot * 100); b.headRange = Math.max(b.headRange, (r.hi - r.lo) * 100); b.v += r.d / Math.max(1e-3, r.t); b.stepsPerS += r.ph / Math.PI / Math.max(1e-3, r.t); }
      res([...by.values()].map(b => ({ ...b, footMax: +b.footMax.toFixed(2), headRange: +b.headRange.toFixed(2), v: +(b.v / b.n).toFixed(2), stepsPerS: +(b.stepsPerS / b.n).toFixed(2) })));
    };
    requestAnimationFrame(f);
  });
}
if (typeof window !== 'undefined') (window as unknown as { __gait: unknown }).__gait = { sample };
/** Legs straight (standing, sitting). */
export function legsStill(S: Gait) { S.ga = 0; S.lL.rotation.x = 0; S.lR.rotation.x = 0; for (const l of [S.lL, S.lR]) { const s = shin(l); if (s) s.rotation.x = 0; } }
