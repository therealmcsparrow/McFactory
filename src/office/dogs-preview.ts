// Preview of the dog walkers (?dogsPreview=1, loaded by index.ts only then): a small grid of footpaths on empty ground
// east of the shops, with two spurs to the "edge of town", a kiosk door, trees and lamp posts for the dogs to sniff,
// and six walkers. index.ts steps the returned frame after the scene's own.
// window.__office.look(DOGS_PREVIEW_AT[0], DOGS_PREVIEW_AT[1], 1.3) frames it; window.__dogs is the walkers' API (stats(), setMax(n)).
import * as THREE from 'three';
import type { P2 } from '../common/types.js';
import { makeDogWalkers, type DogsOS, type DogWalkers, type WalkNet } from './dogs.js';

export const DOGS_PREVIEW_AT: readonly [number, number] = [96, 40];

export function dogsPreview(OS: DogsOS & Pick<import('./state.js').OSAtBank, 'cy'>): DogWalkers {
  const { bx, cy, sp, merge, mesh, VC } = OS, [X0, Z0] = DOGS_PREVIEW_AT;
  // the graph: 4 x 3 nodes 8 m apart, a spur west and one east, and a kiosk door north-east
  const nodes: P2[] = [], edges: [number, number][] = [];
  for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) nodes.push([X0 - 12 + c * 8, Z0 - 6 + r * 7]);
  for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) { const i = r * 4 + c; if (c < 3) edges.push([i, i + 1]); if (r < 2) edges.push([i, i + 4]); }
  nodes.push([X0 - 20, Z0 + 1], [X0 + 17, Z0 - 6]); edges.push([4, 12], [3, 13]);
  const spots: P2[] = [], L: THREE.BufferGeometry[] = [];
  for (const [a, b] of edges) { const A = nodes[a], B = nodes[b], dx = B[0] - A[0], dz = B[1] - A[1], l = Math.hypot(dx, dz);
    L.push(bx(2, .08, l + 2, (A[0] + B[0]) / 2, .05, (A[1] + B[1]) / 2, '#4a515c', Math.atan2(dx, dz))); }
  for (let i = 0; i < edges.length; i += 2) { const [a, b] = edges[i], A = nodes[a], B = nodes[b], dx = B[0] - A[0], dz = B[1] - A[1], l = Math.hypot(dx, dz), s = i % 4 ? 1 : -1;
    const x = (A[0] + B[0]) / 2 - dz / l * 1.35 * s, z = (A[1] + B[1]) / 2 + dx / l * 1.35 * s; spots.push([x, z]);
    if (i % 4) L.push(cy(.05, 2.6, x, 1.3, z, '#2b3038', 8), sp(.14, x, 2.65, z, '#ffe2a8'));                                        // lamp post
    else L.push(cy(.09, 1.1, x, .55, z, '#5a3f2a', 8), sp(.7, x, 1.6, z, '#3f7d46'), sp(.45, x + .3, 2.1, z - .2, '#4c8f52')); }       // tree
  const kx = X0 + 18, kz = Z0 + 8; L.push(bx(3, 2.4, 2.4, kx + 1.5, 1.2, kz, '#7a5f4a'), bx(.06, 1.9, 1, kx - .02, .95, kz, '#2b2f36'), bx(kx - nodes[11][0], .08, 1.4, (kx + nodes[11][0]) / 2, .05, kz, '#4a515c')); // kiosk, door, its path
  const ground = mesh(merge(L), VC, true, true); OS.ctx.scene.add(ground);
  const net: WalkNet = { nodes, edges, spots, doors: [{ path: [[kx - .4, kz], [kx - 2.4, kz], nodes[11]], node: 11 }], half: 1, y: .1 };
  const w = makeDogWalkers(OS, net); w.setMax(6);
  (window as unknown as { __dogs?: DogWalkers }).__dogs = w;
  return w;
}
