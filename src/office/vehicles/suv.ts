// SUV model, nose to +z: taller and boxier than the sports car (a real one about 2.0 m wide, 4.6 m long, 1.7 m high,
// scaled like the other office vehicles), with dark wheel-arch cladding, roof rails and a spare wheel on the tailgate.
// In traffic as vehicle kind 'suv', one of the agent vehicles (sports-car.ts rideOf). SUV_IND_DIM says where its turn-signal lamps go (traffic.ts IND_DIM), SUV_SIZE is its footprint.
import type * as THREE from 'three';
import { WHEEL, type Parts } from './parts.js';

/** Body colours (wraps). */
export const SUV_VARIANTS: readonly string[] = ['#aeb4bc', '#1d2129', '#6d7480', '#2c4a6e', '#7a1f24', '#4f5b3e', '#b9a588'];

/** Turn-signal lamps: half width, front, rear, height (the form of IND_DIM in traffic.ts). */
export const SUV_IND_DIM: readonly [number, number, number, number] = [.6, 1.4, -1.42, .66];

/** Footprint for the collision tables. */
export const SUV_SIZE = { len: 2.86, wid: 1.26 } as const;

/** SUV, nose to +z. variant picks a SUV_VARIANTS entry (wraps). */
export function suvGeometry({ bx, cy, merge }: Parts, variant = 0): THREE.BufferGeometry {
  const B = SUV_VARIANTS[((variant % SUV_VARIANTS.length) + SUV_VARIANTS.length) % SUV_VARIANTS.length];
  const GL = '#11151c', TR = '#24282f', L: THREE.BufferGeometry[] = [];
  // body, cladding along the bottom, greenhouse, pillars, roof, roof rails
  L.push(bx(1.24, .48, 2.8, 0, .55, 0, B), bx(1.26, .17, 2.84, 0, .37, 0, TR));
  L.push(bx(1.12, .4, 1.78, 0, .99, -.32, GL), bx(1.14, .4, .1, 0, .99, -.28, B), bx(1.14, .4, .08, 0, .99, -1.17, B));
  L.push(bx(1.18, .07, 1.84, 0, 1.22, -.32, B), bx(1.1, .05, .5, 0, .8, .82, B));
  for (const s of [-1, 1]) L.push(bx(.05, .05, 1.5, s * .5, 1.28, -.32, TR), bx(.1, .07, .08, s * .64, .9, .52, B));
  // front: grille, headlights, skid plate; rear: tail lights, spare wheel
  L.push(bx(.7, .16, .04, 0, .62, 1.41, '#15181d'), bx(.9, .06, .05, 0, .32, 1.43, '#8b939e'));
  for (const s of [-1, 1]) L.push(bx(.24, .08, .04, s * .41, .7, 1.41, '#f4f1d8'), bx(.16, .14, .04, s * .5, .7, -1.41, '#c0281e'));
  const sw = cy(.24, .12, 0, 0, 0, WHEEL, 12); sw.rotateX(Math.PI / 2); sw.translate(0, .7, -1.47); L.push(sw);
  // wheels
  for (const x of [-.6, .6]) for (const z of [-.92, .92]) L.push(cy(.3, .2, x, .3, z, WHEEL, 12, Math.PI / 2));
  return merge(L);
}
