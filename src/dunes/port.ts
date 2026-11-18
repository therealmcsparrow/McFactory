// The spaceport: three landing bays in the town. Now and then a ship comes in over the dunes (a courier, a freighter, a
// fighter or a cargo shuttle), slows over its bay, settles straight down and sits a while with its engines off; then it
// lifts straight up and flies off another way. Scenery: it shows no data. Off with the "Spaceport traffic" setting
// (ships on the bays still leave); with reduced motion two bays just hold a parked ship.
import * as THREE from 'three';
import type { SceneCtx } from '../common/types.js';
import { G, mat, own, part } from './models.js';
import { PORT_SHIPS, engine } from './sky.js';
import { PORTS, PORT_R } from './terrain.js';

type K = 'courier' | 'freighter' | 'dart' | 'shuttle';
/** scale, and the height the origin sits at when landed */
const SPEC: Record<K, { s: number; y: number }> = { courier: { s: 1, y: .95 }, freighter: { s: .72, y: 1.3 }, dart: { s: 1.5, y: .62 }, shuttle: { s: 1, y: 0 } };
const KS: K[] = ['courier', 'freighter', 'dart', 'shuttle', 'shuttle', 'freighter'];
const HOVER_Y = 14;

/** A boxy cargo shuttle on four legs, with two engine pods. Origin = between its feet, on the ground. */
function shuttle(): THREE.Group {
  const g = new THREE.Group(), hull = mat('#c7bfae', { metalness: .35, roughness: .55 }), band = mat('#2f6d8a', { roughness: .6 }), dark = mat('#3a3d42', { metalness: .4 });
  g.add(part(G.box, hull, 2.4, 1.5, 4.6, 0, 1.45, 0));
  const nose = part(G.box, hull, 2.2, 1.1, 1.4, 0, 1.3, 2.6); nose.rotation.x = .35; g.add(nose);
  g.add(part(G.box, mat('#1d2630', { metalness: .6, roughness: .2 }), 1.6, .35, .1, 0, 1.75, 2.95, false)); // windscreen
  g.add(part(G.box, band, 2.44, .3, 3.2, 0, 1.55, -.4, false));
  for (const s of [-1, 1]) {
    const pod = part(G.cyl, hull, .45, 3.4, .45, s * 1.6, 1.25, -.6); pod.rotation.x = Math.PI / 2; g.add(pod);
    engine(g, s * 1.6, 1.25, -2.35, .36, '#9fd8ff', 3);
    for (const z of [-1.5, 1.4]) { g.add(part(G.cyl8, dark, .07, .75, .07, s * 1, .37, z)); g.add(part(G.cyl8, dark, .22, .06, .22, s * 1, .03, z, false)); }
  }
  g.add(part(G.box, hull, .14, 1.2, 1.3, 0, 2.6, -1.7)); // tail fin
  return g;
}
const BUILD: Record<K, () => THREE.Group> = { ...PORT_SHIPS, shuttle };

interface Ship { k: K; g: THREE.Group; trails: THREE.Object3D[]; ph: 'in' | 'down' | 'sit' | 'up' | 'out'; t: number; dur: number; from: THREE.Vector3; yaw0: number; yaw1: number; out: THREE.Vector3 }
interface Bay { x: number; z: number; lampM: THREE.MeshStandardMaterial; ship: Ship | null; wait: number }

const ease = (k: number) => k * k * (3 - 2 * k);
const angTo = (a: number, b: number, k: number) => { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return a + d * k; };

export function makePort(ctx: SceneCtx, on: () => boolean) {
  const { scene, reduced } = ctx;
  const padM = mat('#7d7366', { roughness: .95 }), paint = mat('#e0b23a', { roughness: .8 });
  const bays: Bay[] = PORTS.map(([x, z], i) => {
    scene.add(part(G.cyl, padM, PORT_R, .2, PORT_R, x, .1, z, false));
    const ring = part(G.ring, paint, PORT_R * .72, PORT_R * .72, .35, x, .22, z, false); ring.rotation.x = Math.PI / 2; scene.add(ring);
    for (const a of [0, Math.PI / 2]) { const m = part(G.box, paint, PORT_R * .9, .03, .3, x, .215, z, false); m.rotation.y = a + .5; scene.add(m); }
    const lampM = own('#ffcf7a', { emissive: '#ffb347', emissiveIntensity: .5 });
    for (let k = 0; k < 10; k++) { const a = k / 10 * Math.PI * 2; scene.add(part(G.sph, lampM, .13, .13, .13, x + Math.cos(a) * (PORT_R - .25), .3, z + Math.sin(a) * (PORT_R - .25), false)); }
    return { x, z, lampM, ship: null, wait: reduced ? 0 : 3 + i * 7 + Math.random() * 8 };
  });

  function newShip(B: Bay, k: K, ph: Ship['ph']): Ship {
    const g = BUILD[k](), sp = SPEC[k]; g.scale.setScalar(sp.s); scene.add(g);
    const trails: THREE.Object3D[] = []; g.traverse(o => { if (o.userData.trail) trails.push(o); if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).castShadow = true; });
    const a = Math.random() * Math.PI * 2, from = new THREE.Vector3(B.x - Math.cos(a) * 170, 50, B.z - Math.sin(a) * 170);
    const yaw0 = Math.atan2(Math.cos(a), Math.sin(a)), b = a + (Math.random() - .5) * 2.4 + Math.PI * (Math.random() < .5 ? .5 : -.5);
    return { k, g, trails, ph, t: 0, dur: ph === 'in' ? 8 + Math.random() * 3 : 1e9, from, yaw0, yaw1: Math.atan2(Math.cos(b), Math.sin(b)), out: new THREE.Vector3(Math.cos(b), 0, Math.sin(b)) };
  }
  if (reduced) bays.slice(0, 2).forEach((B, i) => { B.ship = newShip(B, KS[i * 3], 'sit'); });

  function frame(dt: number, t: number) {
    for (const B of bays) {
      let S = B.ship;
      if (!S) {
        if (reduced) continue;
        B.wait -= dt; B.lampM.emissiveIntensity = .5;
        if (B.wait > 0) continue;
        if (!on()) { B.wait = 5; continue; }
        S = B.ship = newShip(B, KS[Math.floor(Math.random() * KS.length)], 'in');
      }
      const ly = SPEC[S.k].y;
      if (!reduced) S.t += dt;
      const k = Math.min(1, S.t / S.dur), p = S.g.position; let thrust = 0;
      if (S.ph === 'in') {
        const h = 1 - Math.pow(1 - k, 2.2);
        p.set(S.from.x + (B.x - S.from.x) * h, S.from.y + (HOVER_Y - S.from.y) * (1 - Math.pow(1 - k, 1.6)), S.from.z + (B.z - S.from.z) * h);
        S.g.rotation.y = S.yaw0; S.g.rotation.x = .12 * (1 - k); thrust = 1;
        if (k >= 1) { S.ph = 'down'; S.t = 0; S.dur = 4; }
      } else if (S.ph === 'down') {
        p.set(B.x, HOVER_Y + (ly - HOVER_Y) * ease(k), B.z); S.g.rotation.x = 0; thrust = .45;
        if (k >= 1) { S.ph = 'sit'; S.t = 0; S.dur = 14 + Math.random() * 26; }
      } else if (S.ph === 'sit') {
        p.set(B.x, ly, B.z); S.g.rotation.y = S.yaw0;
        if (k >= 1) { S.ph = 'up'; S.t = 0; S.dur = 3.5; }
      } else if (S.ph === 'up') {
        p.set(B.x, ly + (HOVER_Y - ly) * ease(k), B.z); S.g.rotation.y = angTo(S.yaw0, S.yaw1, ease(k)); thrust = .45;
        if (k >= 1) { S.ph = 'out'; S.t = 0; S.dur = 7; }
      } else {
        p.set(B.x + S.out.x * k * k * 190, HOVER_Y + Math.pow(k, 1.5) * 40, B.z + S.out.z * k * k * 190); S.g.rotation.y = S.yaw1; S.g.rotation.x = -.15 * Math.min(1, k * 3); thrust = 1;
        if (k >= 1) { scene.remove(S.g); B.ship = null; B.wait = 4 + Math.random() * 16; continue; }
      }
      for (const o of S.trails) o.visible = thrust > 0;
      // the bay's lamps blink while a ship comes down or goes up
      B.lampM.emissiveIntensity = S.ph === 'down' || S.ph === 'up' ? (Math.sin(t * 9) > 0 ? 2.4 : .3) : S.ph === 'sit' ? .9 : .5;
    }
  }
  const stats = () => bays.map(B => B.ship ? `${B.ship.k}:${B.ship.ph}` : 'empty');
  return { frame, stats };
}
