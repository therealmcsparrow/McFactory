// The Dunes view's world: the haze, the twin suns (two shadow-casting lights, so everything throws two shadows), the
// dune ground, rocks and far mesas, and the town at the origin: the depot hall with its canister pile inside (the window
// total), the sled pads, the garrison hall, houses, shops and a cantina.
import * as THREE from 'three';
import { clamp } from '../common/math.js';
import type { SceneCtx } from '../common/types.js';
import { G, mat, part, invisM } from './models.js';
import { heightAt, openAt, pileSpot, PILE, SETTLE_R, PATROL_R, WALKER_R, DUEL_SPOTS, DEPOT_XZ, YARD_XZ, LAND_R, PARK, GARRISON, MAST, BUILDINGS, HALL_R, HALL_H, HALL_OPEN, type Bld } from './terrain.js';

const PLASTERS = ['#e8dbc0', '#d6c29d', '#e2cfa8', '#cdb48c'], CLOTH = ['#b8481f', '#2f6d8a', '#d39a2c', '#6d8a3a', '#8a3a6d'];
/** A town building, front (local +z) toward the town centre. */
function building(b: Bld): THREE.Group {
  const g = new THREE.Group(); g.position.set(b.x, 0, b.z); g.rotation.y = b.a;
  const wall = mat(PLASTERS[b.v], { roughness: .95 }), dark = mat('#3e352d'), cloth = mat(CLOTH[(b.v + Math.round(b.w * 3)) % CLOTH.length], { roughness: .9, side: THREE.DoubleSide });
  const { w, d } = b;
  if (b.k === 'tank') {
    g.add(part(G.cyl, mat('#b9b2a6', { metalness: .45, roughness: .45 }), w / 2, 2.6, w / 2, 0, 1.3, 0));
    g.add(part(G.cyl, mat('#8d867a', { metalness: .5 }), w / 2 + .03, .12, w / 2 + .03, 0, 2.6, 0, false));
    g.add(part(G.box, mat('#b8481f'), w * .9, .3, .05, 0, 1.6, w / 2 - .02, false));
  } else if (b.k === 'dome') {
    g.add(part(G.dome, wall, w / 2, w * .42, w / 2, 0, 0, 0));
    g.add(part(G.box, wall, .9, 1.1, .9, 0, .55, w / 2 - .1));
    g.add(part(G.box, dark, .55, .8, .05, 0, .4, w / 2 + .36, false));
  } else {
    const h = b.k === 'cantina' ? 2.6 : b.k === 'shop' ? 2.2 : 2 + (b.v % 3) * .3;
    g.add(part(G.box, wall, w, h, d, 0, h / 2, 0));
    g.add(part(G.box, mat(PLASTERS[(b.v + 1) % 4], { roughness: .95 }), w + .12, .16, d + .12, 0, h + .08, 0)); // roof ledge
    g.add(part(G.box, dark, b.k === 'cantina' ? 1.3 : .7, b.k === 'cantina' ? 1.5 : 1.1, .05, b.k === 'shop' ? -w / 2 + .6 : 0, b.k === 'cantina' ? .75 : .55, d / 2 + .01, false)); // door
    if (b.k === 'house') {
      g.add(part(G.dome, wall, .75, .6, .75, w * .2 * (b.v % 2 ? 1 : -1), h + .16, -d * .1));
      for (const x of [-w / 2 + .55, w / 2 - .55]) g.add(part(G.box, dark, .38, .32, .05, x, h * .62, d / 2 + .01, false)); // windows
    } else {
      // an awning over the front with a counter and goods under it
      const aw = part(G.box, cloth, w * .92, .06, 1.2, 0, h - .35, d / 2 + .55); aw.rotation.x = .28; g.add(aw);
      for (const x of [-w * .44, w * .44]) g.add(part(G.cyl8, mat('#6e5b45'), .04, h - .35, .04, x, (h - .35) / 2, d / 2 + 1.1, false));
      if (b.k === 'shop') {
        g.add(part(G.box, mat('#8a6d4c'), w * .55, .7, .45, w * .12, .35, d / 2 + .3));
        const goods = ['#e0a33a', '#a4c24a', '#d0503a', '#5aa0c8', '#e8e0cc'];
        for (let i = 0; i < 4; i++) g.add(part(i % 2 ? G.sph : G.box, mat(goods[(i + b.v) % goods.length]), .14, .14, .14, w * .12 + (i - 1.5) * .32, .78, d / 2 + .3, false));
      } else {
        g.add(part(G.dome, mat(PLASTERS[(b.v + 2) % 4], { roughness: .9 }), 1.8, 1.3, 1.8, 0, h + .16, -.2));
        g.add(part(G.box, mat('#ffb36b', { emissive: '#ff9a3a', emissiveIntensity: 1.6 }), 1.8, .3, .05, 0, h - .05, d / 2 + .02, false)); // the sign
      }
    }
  }
  return g;
}

export const BG = '#e2c497';
/** The top of the hall floor, where the pile stands. */
export const FLOOR = .15;
/** The depot yard (pile centre) and the sled parking spots around the landing ring. */
export const YARD = new THREE.Vector3(YARD_XZ[0], 0, YARD_XZ[1]), DEPOT = new THREE.Vector3(DEPOT_XZ[0], 0, DEPOT_XZ[1]);
export const parkSpot = (i: number): [number, number] => PARK[i % PARK.length];

// small seeded random, so the rocks and huts land in the same places on every load
export function rng(seed: number) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

export function makeWorld(ctx: SceneCtx) {
  const { scene, camera, controls } = ctx;
  scene.background = new THREE.Color(BG); scene.fog = new THREE.Fog(BG, 320, 640);
  scene.add(new THREE.HemisphereLight('#fff0d6', '#7a5634', .5));
  // ── twin suns: a white-gold primary and a smaller amber one further round the sky
  const suns = [
    { l: new THREE.DirectionalLight('#fff1d2', 1.25), o: new THREE.Vector3(-14, 32, 18).normalize().multiplyScalar(120), map: 2048 },
    { l: new THREE.DirectionalLight('#ffb36b', .55), o: new THREE.Vector3(20, 22, 12).normalize().multiplyScalar(120), map: 1024 },
  ];
  for (const s of suns) { s.l.castShadow = true; s.l.shadow.mapSize.set(s.map, s.map); s.l.shadow.camera.near = 1; s.l.shadow.camera.far = 320; s.l.shadow.bias = -.0005; s.l.shadow.normalBias = .04; scene.add(s.l, s.l.target); }
  let shHalf = 0;
  function updateSuns() { // the shadow boxes follow the view; wider when zoomed out
    const half = clamp(Math.ceil(26 / camera.zoom / 8) * 8, 24, 128);
    for (const s of suns) {
      s.l.position.copy(controls.target).add(s.o); s.l.target.position.copy(controls.target);
      if (half !== shHalf) { Object.assign(s.l.shadow.camera, { left: -half, right: half, top: half, bottom: -half }); s.l.shadow.camera.updateProjectionMatrix(); }
    }
    shHalf = half;
  }

  // ── the ground: one displaced plane, sand shaded lighter on the crests and darker in the troughs
  const N = 230, SIZE = 480, geo = new THREE.PlaneGeometry(SIZE, SIZE, N, N); geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position as THREE.BufferAttribute, cols = new Float32Array(pos.count * 3);
  const lo = new THREE.Color('#b8874f'), mid = new THREE.Color('#d9b07a'), hi = new THREE.Color('#efd3a2'), flat = new THREE.Color('#cfae80'), c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i), h = heightAt(x, z), o = openAt(x, z); pos.setY(i, h);
    const k = clamp(h / (3 + Math.hypot(x, z) / 40), 0, 1);
    c.copy(lo).lerp(mid, clamp(k * 2, 0, 1)).lerp(hi, clamp(k * 2 - 1, 0, 1)).lerp(flat, 1 - o);
    cols[i * 3] = c.r; cols[i * 3 + 1] = c.g; cols[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(cols, 3)); geo.computeVertexNormals();
  const ground = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .97, metalness: 0 })); ground.receiveShadow = true; scene.add(ground);

  // ── rocks on open sand and mesas on the horizon
  const R = rng(7), rockM = mat('#8c6e55', { roughness: .95, flatShading: true }), rockG = new THREE.DodecahedronGeometry(1, 0);
  for (let n = 0, tries = 0; n < 70 && tries < 900; tries++) {
    const a = R() * Math.PI * 2, r = 30 + R() * 170, x = Math.cos(a) * r, z = Math.sin(a) * r; if (openAt(x, z) < .95) continue;
    // nothing on the warden and crawler rings, in the gaps the squads walk through or on the duel grounds
    if (r < PATROL_R + 6 || Math.abs(r - WALKER_R) < 8 || DUEL_SPOTS.some(([dx, dz]) => Math.hypot(dx - x, dz - z) < 7)) continue;
    const s = .5 + R() * 1.6, m = part(rockG, rockM, s * (1 + R()), s * .7, s, x, heightAt(x, z) + s * .2, z); m.rotation.y = R() * 6; scene.add(m); n++;
  }
  const mesaM = mat('#a0704a', { roughness: 1, flatShading: true }), capM = mat('#b98657', { roughness: 1, flatShading: true });
  for (let i = 0; i < 14; i++) {
    const a = i / 14 * Math.PI * 2 + R() * .3, r = 175 + R() * 45, x = Math.cos(a) * r, z = Math.sin(a) * r, w = 7 + R() * 12, h = 7 + R() * 12, y = heightAt(x, z) - 1;
    const m = part(new THREE.CylinderGeometry(w * .8, w, h, 7), mesaM, 1, 1, 1, x, y + h / 2, z, false); m.rotation.y = R() * 6; scene.add(m);
    scene.add(part(new THREE.CylinderGeometry(w * .82, w * .82, .8, 7), capM, 1, 1, 1, x, y + h + .3, z, false));
  }

  // ── the town: the depot hall (the canister pile inside) with the sled pads round it, the garrison hall, a mast, houses,
  // shops, a cantina and fuel tanks; the spaceport bays are port.ts's
  const pl = mat('#e8dbc0', { roughness: .95 }), pl2 = mat('#d6c29d', { roughness: 1 }), steel = mat('#b4ada2', { metalness: .5, roughness: .4 });
  scene.add(part(G.cyl, pl2, SETTLE_R - 1, .12, SETTLE_R - 1, 0, .06, 0, false));
  scene.add(part(G.cyl, mat('#c4a77e', { roughness: 1 }), 13.2, .14, 13.2, 0, .07, 0, false)); // the plaza
  { // the hall: a round wall with four doorways, a roof ring open in the middle, a crane beam across the opening
    const wallM = mat('#e3d3b4', { roughness: .9, side: THREE.DoubleSide }), roofM = mat('#cbb48c', { roughness: .85, side: THREE.DoubleSide });
    for (let k = 0; k < 4; k++) {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(HALL_R, HALL_R, HALL_H, 40, 1, true, Math.PI / 4 + .26 + k * Math.PI / 2, Math.PI / 2 - .52), wallM);
      w.position.set(DEPOT.x, HALL_H / 2, DEPOT.z); w.castShadow = true; w.receiveShadow = true; scene.add(w);
      const a = Math.PI / 4 + k * Math.PI / 2; // a lintel over each doorway
      const l = part(G.box, mat('#b8481f', { roughness: .6 }), 1.9, .45, .35, DEPOT.x + Math.sin(a) * HALL_R, HALL_H - .22, DEPOT.z + Math.cos(a) * HALL_R); l.rotation.y = a; scene.add(l);
    }
    const roofG = new THREE.RingGeometry(HALL_OPEN, HALL_R + .35, 40); roofG.rotateX(-Math.PI / 2);
    const roof = new THREE.Mesh(roofG, roofM); roof.position.set(DEPOT.x, HALL_H, DEPOT.z); roof.castShadow = true; roof.receiveShadow = true; scene.add(roof);
    scene.add(part(new THREE.CylinderGeometry(1, 1, 1, 40, 1, true), roofM, HALL_OPEN, .35, HALL_OPEN, DEPOT.x, HALL_H + .17, DEPOT.z));
    scene.add(part(G.box, steel, HALL_OPEN * 2 + .6, .18, .3, DEPOT.x, HALL_H + .38, DEPOT.z));
    scene.add(part(G.cyl, mat('#8f7a5e', { roughness: .95 }), HALL_R - .1, .14, HALL_R - .1, DEPOT.x, .08, DEPOT.z, false)); // the hall floor
  }
  const ringM = mat('#9c8a72', { roughness: .9 }); const lr = part(G.ring, ringM, LAND_R, LAND_R, .5, DEPOT.x, .16, DEPOT.z, false); lr.rotation.x = Math.PI / 2; scene.add(lr);
  for (const [x, z] of PARK) { const pd = part(G.cyl, ringM, .9, .06, .9, x, .18, z, false); scene.add(pd); } // landing pads
  for (const b of BUILDINGS) scene.add(building(b));
  const [mx, mz, mh] = MAST; scene.add(part(G.cyl, steel, .08, mh, .08, mx, mh / 2, mz)); scene.add(part(G.sph, mat('#ff5a3a', { emissive: '#ff5a3a', emissiveIntensity: 2 }), .22, .22, .22, mx, mh + .1, mz, false));
  { // the garrison hall: a long half-barrel lying along the settlement edge, its door facing out
    const g = new THREE.Group(); g.position.set(GARRISON.x, 0, GARRISON.z); g.rotation.y = Math.atan2(Math.cos(GARRISON.a), Math.sin(GARRISON.a)); scene.add(g);
    const garr = part(new THREE.CylinderGeometry(1, 1, 1, 18, 1, false, 0, Math.PI), mat('#c9b08a', { roughness: .8, metalness: .15 }), 2.2, 7, 2.2, 0, 0, 0, true);
    garr.rotation.z = Math.PI / 2; g.add(garr); // the barrel's axis along local x, its round side up
    g.add(part(G.box, mat('#4a4038'), 1.4, 1.6, .2, 0, .8, 2.12, false)); // door
    g.add(part(G.box, mat('#b8481f', { roughness: .6 }), 1.8, .22, .1, 0, 1.75, 1.42, false)); // red lintel over it
  }
  const depotHit = part(G.box, invisM, 13, 6, 13, DEPOT.x, 3, DEPOT.z, false); scene.add(depotHit); ctx.addPickable(depotHit, { kind: 'total', id: 'total' });

  // the pile: an instanced canister per step of the (log) window total, coloured by each role's share of the tokens
  const pile = new THREE.InstancedMesh(G.can, new THREE.MeshStandardMaterial({ roughness: .5, metalness: .3 }), PILE); pile.castShadow = true; pile.receiveShadow = true;
  const m4 = new THREE.Matrix4(), white = new THREE.Color('#ffffff');
  for (let i = 0; i < PILE; i++) { const [x, y, z] = pileSpot(i); m4.makeTranslation(YARD.x + x, y + FLOOR, YARD.z + z); pile.setMatrixAt(i, m4); pile.setColorAt(i, white); }
  pile.count = 0; scene.add(pile);
  const depEl = document.createElement('div'); depEl.className = 'sign wh'; depEl.innerHTML = '<small>DEPOT · ALL FARMS</small><b>—</b><small class="u">—</small>';
  depEl.addEventListener('click', () => ctx.focus('total', 'total'));
  const depLab = new ctx.CSS2DObject(depEl); depLab.position.set(DEPOT.x, 7.2, DEPOT.z); scene.add(depLab);
  return { updateSuns, pile, depEl, ground };
}
