// Preview of a traffic stop (?stopPreview=1, loaded by index.ts only then): on empty ground east of the town, a
// patrol car parked behind a car, the stop (traffic-stop.ts) on a loop with a new seed and another car each time.
// window.__office.look(STOP_PREVIEW_AT[0], STOP_PREVIEW_AT[1], 1.4) frames it. window.__stopPreview() tells the phase.
// Returns the per-frame step; index.ts runs it after the rest of the frame (after folk.ts stepFolk, see traffic-stop.ts).
import * as THREE from 'three';
import { reduced } from '../common/dom.js';
import type { OfficeState } from './state.js';
import { makeBubbles } from './bubbles.js';
import { runStop, type StopRun } from './traffic-stop.js';

export const STOP_PREVIEW_AT: readonly [number, number] = [96, 10];

type PreviewOS = Pick<OfficeState, 'bx' | 'mesh' | 'VC' | 'G' | 'ctx' | 'pov' | 'mkFolk' | 'walk' | 'vanish' | 'folk' | 'carMat'>;
declare global { interface Window { __stopPreview?: () => { phase: string; loops: number; bubbles: { up: number; shown: number } } } }

export function stopPreview(OS: PreviewOS): (dt: number) => void {
  const { bx, mesh, VC, G } = OS, { scene } = OS.ctx, [X0, Z0] = STOP_PREVIEW_AT, H = -Math.PI / 2; // both heading west (-x): their left side faces the camera
  scene.add(mesh(bx(14, .04, 6, X0, .02, Z0 - .6, '#20262f'), VC, false, true));
  for (let x = X0 - 6.5; x < X0 + 7; x += 1.6) scene.add(mesh(bx(.8, .012, .1, x, .045, Z0 + 1.05, '#59606c'), VC, false, true)); // a dashed lane edge beside the shoulder
  const cop = mesh(G.pcar, VC); cop.position.set(X0 + 2.3, .06, Z0); cop.rotation.y = H; scene.add(cop);
  const mB = new THREE.MeshBasicMaterial({ color: new THREE.Color('#3d8bff').multiplyScalar(2) }), mR = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff3b2b').multiplyScalar(.3) });
  for (const [m, x] of [[mB, -.21], [mR, .21]] as [THREE.MeshBasicMaterial, number][]) { const l = new THREE.Mesh(G.unit, m); l.scale.set(.38, .1, .24); l.position.set(x, 1.12, -.15); cop.add(l); } // the light bar, as police.ts builds it
  const models = [() => mesh(G.hatch[2], VC), () => mesh(G.suv[4], VC), () => mesh(G.car, OS.carMat('implementer')), () => mesh(G.pickup[1], VC)];
  const B = makeBubbles(OS); let run: StopRun | null = null, car: THREE.Object3D | null = null, loops = 0, wait = .5, tt = 0;
  const start = () => { car?.removeFromParent(); car = models[loops % models.length](); car.position.set(X0 - 1.9, .06, Z0); car.rotation.y = H; scene.add(car);
    run = runStop(OS, { cop: { car: cop }, driver: { car }, side: 'left', seed: 'preview' + loops, bubbles: B, onDone: () => { loops++; wait = 1.5; } }); };
  window.__stopPreview = () => ({ phase: run ? run.phase : 'wait', loops, bubbles: B.stats() });
  return (dt: number) => {
    tt += dt; const ph = reduced ? .25 : (tt * 2.6) % 1; mB.color.set('#3d8bff').multiplyScalar(ph < .5 ? 2.6 : .2); mR.color.set('#ff3b2b').multiplyScalar(ph < .5 ? .2 : 2.6);
    if (run && !run.done) run.frame(dt); else if ((wait -= dt) <= 0) start();
    B.frame(dt);
  };
}
