// SWAT van model, nose to +z: the shared van body in dark grey with a blue stripe, and a light bar over the windscreen.
import type * as THREE from 'three';
import { vanBody, type Parts } from './parts.js';

export function swatVanGeometry(P: Parts): THREE.BufferGeometry {
  const SW: THREE.BufferGeometry[] = [];
  vanBody(P, SW, '#262b33', '#3d4f6e'); SW.push(P.bx(.9, .07, .28, 0, 1.77, 1.1, '#15181c'));
  return P.merge(SW);
}
