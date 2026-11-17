// Shared parts for the office vehicle models: the geometry helpers they are built with, the wheel colour, and the
// van body that the SWAT van and the bandits' van have in common. Every model is one merged, vertex-coloured geometry.
import type * as THREE from 'three';
import type { OSAtProps } from '../state.js';

/** The geometry helpers from layout.ts a vehicle model needs. */
export type Parts = Pick<OSAtProps, 'bx' | 'cy' | 'merge'>;

export const WHEEL = '#0c0e12';

/** Van body, nose to +z: box, windscreen, side stripe, bumper and four wheels. c = body colour, s = stripe colour. */
export function vanBody({ bx, cy }: Parts, L: THREE.BufferGeometry[], c: string, s: string): void {
  L.push(bx(1.5, 1.4, 3.6, 0, 1.04, -.05, c), bx(1.3, .42, .05, 0, 1.4, 1.76, '#0e1218'), bx(1.52, .14, 3.62, 0, .78, -.05, s), bx(1.4, .12, .2, 0, .32, 1.8, '#20242c'));
  for (const x of [-.74, .74]) for (const z of [-1.25, 1.2]) L.push(cy(.32, .2, x, .32, z, WHEEL, 12, Math.PI / 2));
}
