import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { FSAtWarehouse } from './state.js';
import type { Dock } from './types.js';

export function makeWarehouse(FS: FSAtWarehouse) {
  const { slotInfo, XD, XP, dark, rail, L, yellowM, scene, WHX, WHZ, mat, Z0, invisM, ctx } = FS;
  // ── outbound docks (one per grid cell, outlive their factory until every crate is picked up)
  const docks: Dock[] = [];
  function dockFor(k: number): Dock {
    if (docks[k]) return docks[k];
    const s = slotInfo(k), rx = s.ox + s.d * XD, px = s.ox + s.d * XP;
    const rack = new THREE.Mesh(new THREE.BoxGeometry(1.1, .12, 1.5).translate(rx, .06, s.oz), dark); rack.castShadow = rack.receiveShadow = true;
    const rr = new THREE.Mesh(mergeGeometries([-.78, .78].map(z => new THREE.BoxGeometry(1.1, .06, .06).translate(rx, .15, s.oz + z))), rail);
    const pg: THREE.BufferGeometry[] = []; for (const [a, b, c, e] of [[-.42, -.55, .42, -.55], [-.42, .55, .42, .55], [-.42, -.55, -.42, .55], [.42, -.55, .42, .55]]) L(pg, px + a, s.oz + b, px + c, s.oz + e, .06, .006);
    { const sd = Math.sign(s.ox), xo = px + sd * .5, xi = px - sd * .45; // dock side lane parallel to the bay: outer edge, tapers back to the road edge, dashed guide line
      L(pg, xo, s.oz - FS.DSL, xo, s.oz + FS.DSL, .05, .006); for (const u of [-1, 1]) L(pg, xo, s.oz + u * FS.DSL, xi, s.oz + u * (FS.DSL + FS.DT), .05, .006);
      for (let z = -FS.DSL + .2; z < FS.DSL - .5; z += .9) if (Math.abs(z + .25) > .7) L(pg, px, s.oz + z, px, s.oz + z + .5, .04, .006); }
    const pm = new THREE.Mesh(mergeGeometries(pg), yellowM);
    scene.add(rack, rr, pm);
    return (docks[k] = { k, rx, oz: s.oz, px, lane: s.lane, side: Math.sign(s.ox), queue: [], reserved: 0, f: null });
  }
  const dockSpot = (dk: Dock, i: number, out: THREE.Vector3) => { const layer = Math.floor(i / 6), r = i % 6; return out.set(dk.rx + ((r % 2) - .5) * .42, .12 + layer * .31, dk.oz + (Math.floor(r / 2) - 1) * .42); };

  // ── warehouse (centre) + charging bay
  const wh = new THREE.Group(); scene.add(wh);
  const whFloor = new THREE.Mesh(new THREE.BoxGeometry(2 * WHX + .6, .06, 2 * WHZ + .6), mat('#17181c', { roughness: .95, envMapIntensity: .4 })); whFloor.position.y = .03; whFloor.receiveShadow = true; wh.add(whFloor);
  const postG = []; for (const x of [-WHX, WHX]) for (let z = -WHZ; z <= WHZ + .01; z += 4.5) postG.push(new THREE.BoxGeometry(.16, 5.2, .16).translate(x, 2.6, z));
  for (const x of [-WHX, WHX]) postG.push(new THREE.BoxGeometry(.12, .16, 2 * WHZ).translate(x, 5.2, 0));
  for (let z = -WHZ; z <= WHZ + .01; z += 4.5) postG.push(new THREE.BoxGeometry(2 * WHX, .14, .1).translate(0, 5.2, z));
  const posts = new THREE.Mesh(mergeGeometries(postG), mat('#3a4654', { metalness: .6, roughness: .4 })); posts.castShadow = true; wh.add(posts);
  const backWall = new THREE.Mesh(new THREE.BoxGeometry(2 * WHX + .4, 5.2, .2), mat('#1d1f24', { roughness: .9 })); backWall.position.set(0, 2.6, -WHZ - .25); backWall.receiveShadow = true; wh.add(backWall);
  const wallStripe = new THREE.Mesh(new THREE.BoxGeometry(2 * WHX + .4, .4, .05), rail); wallStripe.position.set(0, .9, -WHZ - .13); wh.add(wallStripe);
  const SX = [-.95, 0, .95]; // three parallel one-way unload lanes per pass-through (z offset from the passage line); unload slot beside the pile
  { const g: THREE.BufferGeometry[] = []; for (const s of [-1, 1]) for (const z0 of SX) { const x = s * 1.2, z = s * (6.75 + z0); for (const [a, b, c, e] of [[-.42, -.55, .42, -.55], [-.42, .55, .42, .55], [-.42, -.55, -.42, .55], [.42, -.55, .42, .55]]) L(g, x + b, z + a, x + e, z + c, .06, .006); } wh.add(new THREE.Mesh(mergeGeometries(g), yellowM)); }
  const STK = { nx: 9, nz: 12, layers: 7, s: .62 }; const CAP = STK.nx * STK.nz * STK.layers;
  const stackG = new RoundedBoxGeometry(.56, .5, .56, 2, .04).translate(0, .25, 0);
  const stack = new THREE.InstancedMesh(stackG, mat('#ffffff', { roughness: .6 }), CAP); stack.castShadow = true; stack.receiveShadow = true; stack.instanceMatrix.setUsage(THREE.DynamicDrawUsage); stack.frustumCulled = false;
  for (let i = 0; i < CAP; i++) { stack.setMatrixAt(i, Z0); stack.setColorAt(i, new THREE.Color('#fff')); } wh.add(stack);
  const stackPos = (i: number) => { const layer = Math.floor(i / (STK.nx * STK.nz)), r = i % (STK.nx * STK.nz); const ix = r % STK.nx, iz = Math.floor(r / STK.nx);
    return new THREE.Vector3((ix - (STK.nx - 1) / 2) * STK.s, .06 + layer * .52, (iz - (STK.nz - 1) / 2) * STK.s); };
  const whHit = new THREE.Mesh(new THREE.BoxGeometry(2 * WHX, 5, 2 * WHZ), invisM); whHit.position.set(0, 2.5, 0); scene.add(whHit);
  ctx.addPickable(whHit, { kind: 'total', id: 'total' });
  const whEl = document.createElement('div'); whEl.className = 'sign wh'; whEl.innerHTML = '<small>WAREHOUSE · ALL PROJECTS</small><b>—</b><small class="u">—</small>';
  whEl.addEventListener('click', () => ctx.focus('total', 'total'));
  const whLab = new ctx.CSS2DObject(whEl); whLab.position.set(0, 6.2, -WHZ + .5); scene.add(whLab);
  FS.unit = 50000; FS.shown = 0; FS.target = 0; const stackScale = new Float32Array(CAP); FS.stackColors = [];
  return { docks, dockFor, dockSpot, SX, STK, CAP, stack, stackPos, whEl, whLab, stackScale };
}
