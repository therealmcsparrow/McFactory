// Pickup truck model, nose to +z: a cab with a long bonnet and an open bed behind it (a real one about 2.0 m wide,
// 5.4 m long, 1.85 m high, scaled like the other office vehicles), chrome bumpers, high wheels. In traffic as vehicle kind 'pickup', one of the agent vehicles (sports-car.ts rideOf).
// PICKUP_IND_DIM says where its turn-signal lamps go (traffic.ts IND_DIM), PICKUP_SIZE is its footprint.
import type * as THREE from 'three';
import { WHEEL, type Parts } from './parts.js';

/** Body colours (wraps). */
export const PICKUP_VARIANTS: readonly string[] = ['#b8322a', '#aab0b8', '#22252b', '#2c4f86', '#8a8f96', '#a7683a', '#3d5a40'];

/** Turn-signal lamps: half width, front, rear, height (the form of IND_DIM in traffic.ts). */
export const PICKUP_IND_DIM: readonly [number, number, number, number] = [.61, 1.64, -1.64, .7];

/** Footprint for the collision tables. */
export const PICKUP_SIZE = { len: 3.3, wid: 1.26 } as const;

/** Pickup truck, nose to +z. variant picks a PICKUP_VARIANTS entry (wraps). */
export function pickupGeometry({ bx, cy, merge }: Parts, variant = 0): THREE.BufferGeometry {
  const B = PICKUP_VARIANTS[((variant % PICKUP_VARIANTS.length) + PICKUP_VARIANTS.length) % PICKUP_VARIANTS.length];
  const GL = '#11151c', TR = '#24282f', CH = '#8b939e', L: THREE.BufferGeometry[] = [];
  // lower body (bonnet, cab and bed sides in one), sill, cab glass, pillars, roof
  L.push(bx(1.24, .44, 3.24, 0, .6, 0, B), bx(1.1, .14, 3.1, 0, .33, 0, TR));
  L.push(bx(1.12, .36, 1.0, 0, .99, .36, GL), bx(1.14, .36, .1, 0, .99, -.1, B), bx(1.16, .06, 1.06, 0, 1.2, .34, B), bx(1.06, .05, .72, 0, .84, 1.24, B));
  for (const s of [-1, 1]) L.push(bx(.1, .07, .08, s * .64, .92, .86, B));
  // open bed: floor, side walls, tailgate (the cab's back wall is its front)
  L.push(bx(1.08, .02, 1.42, 0, .83, -.88, '#1b1e24'));
  for (const s of [-1, 1]) L.push(bx(.08, .3, 1.46, s * .58, .97, -.88, B), bx(.09, .03, 1.46, s * .58, 1.13, -.88, TR));
  L.push(bx(1.24, .3, .08, 0, .97, -1.58, B), bx(1.24, .03, .09, 0, 1.13, -1.58, TR), bx(1.02, .3, .04, 0, .97, -.2, TR));
  // front: grille, headlights, bumper; rear: tail lights, bumper
  L.push(bx(.8, .2, .04, 0, .65, 1.63, '#15181d'), bx(1.18, .1, .12, 0, .38, 1.66, CH), bx(1.18, .1, .12, 0, .38, -1.66, CH));
  for (const s of [-1, 1]) L.push(bx(.2, .1, .04, s * .46, .74, 1.63, '#f4f1d8'), bx(.08, .2, .04, s * .58, .92, -1.63, '#c0281e'));
  // wheels
  for (const x of [-.6, .6]) for (const z of [-1.0, 1.08]) L.push(cy(.32, .2, x, .32, z, WHEEL, 12, Math.PI / 2));
  return merge(L);
}
