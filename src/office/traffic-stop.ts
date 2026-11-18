// A traffic stop: a patrol car has pulled a car over and both stand parked on the shoulder (the caller parks them;
// this file moves no vehicle). The officer gets out, walks round to the driver's window, they swap 3 to 5 lines of
// gibberish in speech bubbles (bubbles.ts, gibberish.ts), the officer writes a ticket and hands it in at the window
// (a paper slip flies from the hand to the window), the driver swears in comic symbols, and the officer walks back and
// gets in. Then onDone runs. A head leans out of the driver's window to talk and an arm takes the ticket, unless
// driver.person is false (bubbles from the window) or an object of the caller's own (its bubbles go above it).
//
//   const S = runStop(OS, { cop: { car: unit.A }, driver: { car: speeder }, side: 'left', onDone }); ... S.frame(dt)
//
// S.frame(dt) must run once per frame AFTER folk.ts stepFolk: stepFolk sets the officer's arms from its pose, and the
// writing and handing-over arm poses are laid over that here. The officer is a folk.ts street person ('cop'), so it
// walks and fades in and out like the others; it is made here unless cop.officer gives one already standing by the car.
// With reduced motion the officer steps from point to point (folk.ts), the slip jumps, and the bubbles show and hide.
import * as THREE from 'three';
import { reduced } from '../common/dom.js';
import type { P2 } from '../common/types.js';
import type { OfficeState } from './state.js';
import type { Folk } from './types.js';
import { makeBubbles, type Bubbles } from './bubbles.js';
import { gibberish, grawlix, rng } from './gibberish.js';

/** A car: its model, or anything that carries one as g (a traffic.ts vehicle). Nose to +z, parked: it must not move during the stop. */
export type StopCar = THREE.Object3D | { g: THREE.Object3D };
export interface StopOpts {
  cop: { car: StopCar; officer?: Folk | null };
  driver: { car: StopCar; person?: boolean | THREE.Object3D };
  /** The side of the cars the officer walks on and the driver's window faces: 'left' (default, the driver's side with traffic on the right) or 'right'. */
  side?: 'left' | 'right';
  seed?: number | string;
  /** Bubbles to use (shared with other scenes); without, the stop makes its own and disposes of them at the end. */
  bubbles?: Bubbles;
  onDone?: () => void;
}
export type StopPhase = 'out' | 'talk' | 'write' | 'hand' | 'react' | 'back' | 'in' | 'done';
export interface StopRun { frame(dt: number): void; cancel(): void; readonly phase: StopPhase; readonly done: boolean }
type StopOS = Pick<OfficeState, 'ctx' | 'pov' | 'mkFolk' | 'walk' | 'vanish' | 'folk'>;

const obj = (c: StopCar): THREE.Object3D => (c as THREE.Object3D).isObject3D ? c as THREE.Object3D : (c as { g: THREE.Object3D }).g;
/** The car's box in its own frame (transforms reset for the measure, then put back). */
function localBox(o: THREE.Object3D) {
  const p = o.position.clone(), q = o.quaternion.clone(), s = o.scale.clone(), par = o.parent;
  if (par) par.remove(o); o.position.set(0, 0, 0); o.quaternion.identity(); o.scale.set(1, 1, 1); o.updateMatrixWorld(true);
  const b = new THREE.Box3().setFromObject(o, true); o.position.copy(p); o.quaternion.copy(q); o.scale.copy(s); if (par) par.add(o); o.updateMatrixWorld(true); return b;
}
// the driver: a head with hair and an arm, shared geometry
let DG: { head: THREE.SphereGeometry; hair: THREE.BoxGeometry; arm: THREE.BoxGeometry; slip: THREE.BoxGeometry; pad: THREE.BoxGeometry } | null = null;
let DM: { skin: THREE.MeshStandardMaterial; hair: THREE.MeshStandardMaterial; sleeve: THREE.MeshStandardMaterial; paper: THREE.MeshStandardMaterial; pad: THREE.MeshStandardMaterial } | null = null;
const geo = () => DG ??= { head: new THREE.SphereGeometry(.15, 12, 8), hair: new THREE.BoxGeometry(.27, .09, .28), arm: new THREE.BoxGeometry(.38, .1, .1).translate(.19, 0, 0), slip: new THREE.BoxGeometry(.24, .02, .32), pad: new THREE.BoxGeometry(.2, .03, .26) };
const mat = () => DM ??= { skin: new THREE.MeshStandardMaterial({ color: '#e2b08a', roughness: .8 }), hair: new THREE.MeshStandardMaterial({ color: '#3a2a1c', roughness: .9 }),
  sleeve: new THREE.MeshStandardMaterial({ color: '#6b4a8a', roughness: .8 }), paper: new THREE.MeshStandardMaterial({ color: '#fff7d6', roughness: .6, emissive: '#fff2c0', emissiveIntensity: .25 }), pad: new THREE.MeshStandardMaterial({ color: '#2a2f3a', roughness: .7 }) };

export function runStop(OS: StopOS, o: StopOpts): StopRun {
  const { scene } = OS.ctx, { mkFolk, walk, vanish } = OS, own = !o.bubbles, B = o.bubbles || makeBubbles(OS), sd = o.side === 'right' ? -1 : 1; // +x is a car's left
  const r = rng('stop:' + (o.seed ?? Math.floor(Math.random() * 1e9))), seed = Math.floor(r() * 1e9);
  const C = obj(o.cop.car), D = obj(o.driver.car), cb = localBox(C), db = localBox(D), G = geo(), M = mat();
  const chw = Math.max(-cb.min.x, cb.max.x), dhw = Math.max(-db.min.x, db.max.x), dlen = db.max.z - db.min.z;
  const seatZ = db.min.z + dlen * .56, winY = Math.max(.55, db.max.y * .78); // the driver's seat: a little ahead of the middle; the window: high on the side
  const w = (car: THREE.Object3D, x: number, y: number, z: number) => { car.updateMatrixWorld(); return car.localToWorld(new THREE.Vector3(x, y, z)); };
  const xz = (v: THREE.Vector3): P2 => [v.x, v.z];
  const door = () => w(C, sd * (chw + .45), 0, cb.min.z + (cb.max.z - cb.min.z) * .52), win = () => w(D, sd * (dhw + .02), winY, seatZ);
  // where the officer stands: behind the door pillar as officers do, or just ahead of the window when that would put them
  // between the camera and the driver's head (picked once, by the screen distance between officer and head)
  const head0 = w(D, sd * dhw, winY + .1, seatZ).project(OS.ctx.view), sx = (dz: number) => Math.abs(w(D, sd * (dhw + .55), 1, seatZ + dz).project(OS.ctx.view).x - head0.x);
  const standZ = sx(-.62) > .6 * sx(.42) ? -.62 : .42;
  const stand = () => w(D, sd * (dhw + .55), 0, seatZ + standZ);
  const route = (): P2[] => [xz(w(C, sd * (chw + .7), 0, cb.max.z + .25)), xz(w(D, sd * (dhw + .7), 0, db.min.z - .2)), xz(stand())];
  const faceWin = () => { const a = stand(), b = win(); return Math.atan2(b.x - a.x, b.z - a.z); };
  // the officer: out of the car on the walking side
  const d0 = door(), off: Folk = o.cop.officer || mkFolk('cop', d0.x, d0.z, C.rotation.y + sd * Math.PI / 2);
  const pad = new THREE.Mesh(G.pad, M.pad), slip = new THREE.Mesh(G.slip, M.paper); pad.visible = slip.visible = false;
  pad.position.set(0, -.44, .06); pad.rotation.x = 1.2; off.aL.add(pad); slip.position.set(0, -.46, .05); slip.rotation.x = 1.1; off.aR.add(slip);
  // the driver: a head (and an arm that comes out for the ticket) in the window, unless the caller says otherwise
  let head: THREE.Group | null = null, arm: THREE.Mesh | null = null; const pers = o.driver.person ?? true;
  if (pers === true) { head = new THREE.Group(); const hd = new THREE.Mesh(G.head, M.skin), hr = new THREE.Mesh(G.hair, M.hair); hr.position.set(0, .12, -.02); arm = new THREE.Mesh(G.arm, M.sleeve);
    arm.position.set(0, -.2, .12); arm.rotation.y = sd > 0 ? 0 : Math.PI; arm.scale.x = .001; head.add(hd, hr, arm); head.position.set(sd * (dhw - .12), winY + .08, seatZ); head.scale.setScalar(.001); D.add(head); }
  // bubble anchors: over the officer's head; for the driver over the head in the window (or the caller's model), nudged forward so the two do not cover each other
  const copAt = () => off.g.getWorldPosition(new THREE.Vector3()).setY(1.78);
  const drvAt = pers instanceof THREE.Object3D ? () => { const v = pers.getWorldPosition(new THREE.Vector3()); return v.setY(v.y + 1.75); } : () => w(D, sd * (dhw + .15), winY + .62, seatZ + .55);
  // the lines: 3..5, the officer first, alternating
  const n = 3 + Math.floor(r() * 3), lines = Array.from({ length: n }, (_, i) => { const cop = i % 2 === 0; return { cop, text: gibberish(seed + i, cop ? 2 + Math.floor(r() * 3) : 1 + Math.floor(r() * 4), cop ? 'cop' : 'driver') }; });
  let ph: StopPhase = 'out', t = 0, li = -1, ht = 0, headK = 0, headT = 0, armK = 0, armT = 0; const sp = new THREE.Vector3(), tp = new THREE.Vector3();
  const go = (p: StopPhase) => { ph = p; t = 0; };
  const sayLine = (cop: boolean, text: string, ms?: number) => { B.clear(cop ? drvAt : copAt); B.say(cop ? copAt : drvAt, text, { tone: cop ? 'cop' : 'driver', ms }); };
  const lineT = (s: string) => 1.15 + s.length * .05; // seconds a line stays up
  walk(off, route(), f => { f.face = faceWin(); go('talk'); headT = 1; }, null);
  function cleanup(gone: boolean) {
    B.clear(copAt); B.clear(drvAt); if (own) B.dispose(); pad.removeFromParent(); slip.removeFromParent(); if (head) head.removeFromParent();
    if (gone && OS.folk.includes(off)) vanish(off);
  }
  function frame(dt: number) {
    if (ph === 'done') return; t += dt;
    if (ph === 'talk') { // wait for the head to lean out, then one line after the other
      if (t > .45 && (li < 0 || t >= ht)) { li++; if (li >= lines.length) { B.clear(copAt); B.clear(drvAt); pad.visible = true; go('write'); }
        else { const L = lines[li]; sayLine(L.cop, L.text, lineT(L.text) * 1000); ht = t + lineT(L.text) + .2; } }
      const L = lines[li]; if (L && L.cop && !reduced) { off.aR.rotation.set(-.5 - .35 * Math.max(0, Math.sin(t * 6)), 0, -.15); } } // talking with a hand
    else if (ph === 'write') { off.aL.rotation.set(-1.15, 0, .55); off.aR.rotation.set(-1.05 + (reduced ? 0 : .07 * Math.sin(t * 23)), 0, -.5 + (reduced ? 0 : .05 * Math.sin(t * 17))); // pad in one hand, writing with the other
      if (t > .6) slip.visible = true; if (t > 2.4) { pad.visible = false; slip.getWorldPosition(sp); scene.attach(slip); armT = 1; go('hand'); } }
    else if (ph === 'hand') { // the slip goes from the hand to the window on a small arc; the driver's hand comes out for it
      off.aR.rotation.set(-1.35 * Math.min(1, t / .3), 0, 0); const k = reduced ? 1 : Math.min(1, Math.max(0, (t - .2) / .7)), e = k * k * (3 - 2 * k); tp.copy(win()).setY(winY + .02);
      slip.position.lerpVectors(sp, tp, e).setY(sp.y + (tp.y - sp.y) * e + Math.sin(Math.PI * e) * .25); slip.rotation.set(0, off.rot + e * 1.4, 0);
      if (k >= 1) { slip.scale.setScalar(Math.max(.001, 1 - (t - .9) / .35)); if (t > 1.3 || reduced) { slip.visible = false; armT = 0; go('react'); sayLine(false, grawlix(seed), 1700); } } }
    else if (ph === 'react') { if (t > .9 && t - dt <= .9) sayLine(true, gibberish(seed + 99, 1, 'cop'), 1100);
      if (t > 1.6) { B.clear(drvAt); headT = 0; walk(off, [...route().slice(0, 2).reverse(), xz(door())], f => { vanish(f); go('in'); }); go('back'); } }
    else if (ph === 'in') { if (!OS.folk.includes(off) && headK < .01) { cleanup(false); ph = 'done'; o.onDone?.(); return; } }
    // the head and the arm ease in and out
    headK = reduced ? headT : headK + Math.sign(headT - headK) * Math.min(Math.abs(headT - headK), dt * 4); armK = reduced ? armT : armK + Math.sign(armT - armK) * Math.min(Math.abs(armT - armK), dt * 3.5);
    if (head) { head.scale.setScalar(Math.max(.001, headK)); head.position.x = sd * (dhw - .12 + .14 * headK); head.rotation.z = -sd * .25 * headK; if (arm) arm.scale.x = Math.max(.001, armK); }
    if (own) B.frame(dt);
  }
  return { frame, cancel() { if (ph !== 'done') { cleanup(true); ph = 'done'; } }, get phase() { return ph; }, get done() { return ph === 'done'; } };
}
