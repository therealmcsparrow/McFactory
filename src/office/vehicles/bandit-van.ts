// The bandits' van model, nose to +z: the shared van body in plain grey with a rear door panel. robbery.ts drives it.
import type * as THREE from 'three';
import { vanBody, type Parts } from './parts.js';

export function banditVanGeometry(P: Parts): THREE.BufferGeometry {
  const BV: THREE.BufferGeometry[] = [];
  vanBody(P, BV, '#3b3e45', '#2b2d33'); BV.push(P.bx(.5, .5, .06, .3, 1.05, -1.86, '#2b2d33'));
  return P.merge(BV);
}
