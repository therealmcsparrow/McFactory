// Preview of the vehicle models (?carsPreview=1, loaded by index.ts only then): parked in rows on empty ground south-east
// of the police station, with a sports car, a motorcycle, a person and an armoured car for scale. Row 1: one of each,
// with their turn-signal lamps lit where *_IND_DIM puts them; row 2: the box truck liveries; row 3: the colour variants.
// window.__office.look(PREVIEW_AT[0], PREVIEW_AT[1], 6) frames it.
import * as THREE from 'three';
import type { OfficeState } from '../state.js';
import { suvGeometry, SUV_IND_DIM, SUV_SIZE, SUV_VARIANTS } from './suv.js';
import { hatchbackGeometry, HATCH_IND_DIM, HATCH_SIZE, HATCH_VARIANTS } from './hatchback.js';
import { pickupGeometry, PICKUP_IND_DIM, PICKUP_SIZE, PICKUP_VARIANTS } from './pickup.js';
import { boxTruckGeometry, boxTruckLogo, BOX_IND_DIM, BOX_SIZE, BOX_VARIANTS } from './box-truck.js';
import { MOTO_IND_DIM } from './motorcycle.js';

export const PREVIEW_AT: readonly [number, number] = [96, 62];

type PreviewOS = Pick<OfficeState, 'bx' | 'cy' | 'sp' | 'merge' | 'mesh' | 'VC' | 'G' | 'FONT' | 'ctx'>;

export function carsPreview(OS: PreviewOS): void {
  const { bx, cy, merge, mesh, VC, G, FONT } = OS, { scene } = OS.ctx, P = { bx, cy, merge }, [X0, Z0] = PREVIEW_AT;
  const root = new THREE.Group(); root.position.set(X0, 0, Z0); scene.add(root);
  root.add(mesh(bx(36, .04, 24, -3.5, .02, 1, '#20262f'), VC, false, true));
  const lamp = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffb02e').multiplyScalar(1.6) });
  const put = (o: THREE.Object3D, x: number, z: number, ind?: readonly number[]) => { o.position.set(x, 0, z); root.add(o);
    if (ind) { const [w, f, r, y] = ind; for (const s of [-1, 1]) o.add(new THREE.Mesh(merge([bx(.08, .1, .16, s * w, y, f - .08, '#fff'), bx(.08, .1, .16, s * w, y, r + .08, '#fff')]), lamp)); } return o; };
  // row 1 (z = -6): scale references, then the new models
  const sports = mesh(G.car, new THREE.MeshStandardMaterial({ vertexColors: true, color: '#c33b30', roughness: .6 }));
  let x = -19;
  const row: [THREE.Object3D, number, readonly number[] | undefined][] = [
    [mesh(G.guard, VC), .6, undefined], [mesh(G.moto[0].ride, VC), 1, MOTO_IND_DIM], [sports, 1.3, [.6, 1.27, -1.27, .4]],
    [mesh(hatchbackGeometry(P, 0), VC), HATCH_SIZE.wid, HATCH_IND_DIM], [mesh(suvGeometry(P, 0), VC), SUV_SIZE.wid, SUV_IND_DIM],
    [mesh(pickupGeometry(P, 0), VC), PICKUP_SIZE.wid, PICKUP_IND_DIM], [mesh(boxTruckGeometry(P, 0), VC), BOX_SIZE.wid, BOX_IND_DIM], [mesh(G.truck, VC), 1.5, [.77, 1.98, -1.84, .66]]];
  for (const [o, w, ind] of row) { x += w / 2; put(o, x, -7, ind); x += w / 2 + 2.6; }
  // row 2 (z = -2.5): every box truck livery, with its name on the box
  BOX_VARIANTS.forEach((_, i) => { const m = mesh(boxTruckGeometry(P, i), VC), l = boxTruckLogo(i, FONT); if (l) m.add(l); put(m, -16 + i * 4.4, -2.5); });
  put(mesh(boxTruckGeometry(P, 3), VC), -16 + BOX_VARIANTS.length * 4.4, -2.5).rotation.y = Math.PI; // turned round: the roll-up door faces the camera
  // rows 3..5: the colour variants of the hatchback, the SUV and the pickup
  const sets: [(v: number) => THREE.BufferGeometry, number, number][] = [[v => hatchbackGeometry(P, v), HATCH_VARIANTS.length, 2], [v => suvGeometry(P, v), SUV_VARIANTS.length, 5.6], [v => pickupGeometry(P, v), PICKUP_VARIANTS.length, 9.6]];
  for (const [geo, n, z] of sets) for (let i = 0; i < n; i++) put(mesh(geo(i), VC), -16 + i * 2.6, z);
}
