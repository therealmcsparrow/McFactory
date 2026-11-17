// Hatchback model, nose to +z: a small city car, shorter than the sports car (a real one about 1.75 m wide, 3.9 m long,
// 1.5 m high, scaled like the other office vehicles), with a short bonnet and a steep rear hatch. In traffic as vehicle kind 'hatch', one of the agent vehicles (sports-car.ts rideOf).
// HATCH_IND_DIM says where its turn-signal lamps go (traffic.ts IND_DIM), HATCH_SIZE is its footprint.
import type * as THREE from 'three';
import { WHEEL, type Parts } from './parts.js';

/** Body colours (wraps). */
export const HATCH_VARIANTS: readonly string[] = ['#c33b30', '#b3afa5', '#2f6fb8', '#d9a62f', '#3f8a5a', '#5b6270', '#6aa2b4'];

/** Turn-signal lamps: half width, front, rear, height (the form of IND_DIM in traffic.ts). */
export const HATCH_IND_DIM: readonly [number, number, number, number] = [.53, 1.13, -1.13, .5];

/** Footprint for the collision tables. */
export const HATCH_SIZE = { len: 2.28, wid: 1.08 } as const;

/** Hatchback, nose to +z. variant picks a HATCH_VARIANTS entry (wraps). */
export function hatchbackGeometry({ bx, cy, merge }: Parts, variant = 0): THREE.BufferGeometry {
  const B = HATCH_VARIANTS[((variant % HATCH_VARIANTS.length) + HATCH_VARIANTS.length) % HATCH_VARIANTS.length];
  const GL = '#11151c', TR = '#24282f', L: THREE.BufferGeometry[] = [];
  // body, bumpers, greenhouse (set well back: short bonnet), pillars, roof
  L.push(bx(1.06, .38, 2.24, 0, .44, 0, B), bx(1.08, .1, 2.28, 0, .29, 0, TR));
  L.push(bx(.96, .3, 1.36, 0, .77, -.28, GL), bx(.98, .3, .08, 0, .77, -.22, B), bx(.98, .3, .07, 0, .77, -.93, B));
  L.push(bx(.98, .05, 1.4, 0, .94, -.3, B), bx(.9, .04, .4, 0, .64, .62, B));
  for (const s of [-1, 1]) L.push(bx(.08, .06, .07, s * .55, .7, .4, B));
  // lights, grille
  L.push(bx(.5, .08, .04, 0, .45, 1.13, '#15181d'));
  for (const s of [-1, 1]) L.push(bx(.2, .08, .04, s * .34, .55, 1.12, '#f4f1d8'), bx(.12, .14, .04, s * .43, .56, -1.12, '#c0281e'));
  // wheels
  for (const x of [-.51, .51]) for (const z of [-.72, .74]) L.push(cy(.23, .16, x, .23, z, WHEEL, 12, Math.PI / 2));
  return merge(L);
}
