// Patrol car model, nose to +z. Light grey reads white (brighter tips the bloom). The light bar on the roof is not part
// of this geometry: police.ts adds it as two separate meshes so they can flash.
import type * as THREE from 'three';
import { WHEEL, type Parts } from './parts.js';

export function patrolCarGeometry({ bx, cy, merge }: Parts): THREE.BufferGeometry {
  const PC = [], PW = '#959ca6', PB = '#1f4fb8';
  PC.push(bx(1.2, .42, 2.7, 0, .4, 0, PW), bx(1.22, .13, 2.72, 0, .44, 0, PB), bx(1.04, .36, 1.3, 0, .79, -.15, '#11151c'), bx(1.06, .06, 1.2, 0, .99, -.15, PW), bx(.8, .06, .26, 0, 1.04, -.15, '#20242c'), bx(1.1, .1, .12, 0, .3, 1.34, '#20242c'));
  for (const x of [-.58, .58]) for (const z of [-.88, .88]) PC.push(cy(.27, .18, x, .27, z, WHEEL, 12, Math.PI / 2));
  return merge(PC);
}
