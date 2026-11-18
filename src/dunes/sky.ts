// Ships passing over the dunes, now and then: a needle courier, a chunky freighter, a vee of three delta fighters or a
// huge slow ore barge. Scenery: they show no data. Each crosses the part of the planet you are looking at, high up,
// with glowing engines and a slight bank. Off with the "Ship flybys" setting, and with reduced motion.
import * as THREE from 'three';
import type { SceneCtx } from '../common/types.js';
import { G, mat, part } from './models.js';

type Kind = 'courier' | 'freighter' | 'fighters' | 'barge';
const KINDS: { k: Kind; w: number; speed: [number, number]; alt: [number, number] }[] = [
  { k: 'courier', w: 3, speed: [34, 44], alt: [26, 40] },
  { k: 'freighter', w: 3, speed: [14, 19], alt: [32, 48] },
  { k: 'fighters', w: 3, speed: [38, 48], alt: [22, 34] },
  { k: 'barge', w: .6, speed: [11, 14], alt: [58, 72] },
];
const glowCache = new Map<string, THREE.MeshStandardMaterial>();
const glow = (c: string, i = 3.4) => { const k = c + i; let m = glowCache.get(k); if (!m) { m = new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: i }); glowCache.set(k, m); } return m; };
const trailM = new Map<string, THREE.MeshBasicMaterial>();
const trail = (c: string) => { let m = trailM.get(c); if (!m) { m = new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: .35, blending: THREE.AdditiveBlending, depthWrite: false }); trailM.set(c, m); } return m; };
const tri = new THREE.ConeGeometry(1, 1, 3); // a flattened three-sided cone makes a delta wing

/** An engine at (x, y, z) facing -z: a glowing nozzle and a fading exhaust cone. */
export function engine(g: THREE.Object3D, x: number, y: number, z: number, r: number, c: string, len = r * 6) {
  const n = part(G.cyl, glow(c), r, .3, r, x, y, z, false); n.rotation.x = Math.PI / 2; g.add(n);
  const t = part(G.cone, trail(c), r * .9, len, r * .9, x, y, z - .15 - len / 2, false); t.rotation.x = -Math.PI / 2; t.userData.trail = 1; g.add(t);
}
const along = (m: THREE.Mesh) => { m.rotation.x = Math.PI / 2; return m; }; // a cylinder or cone laid along z

function courier(): THREE.Group {
  const g = new THREE.Group(), hull = mat('#dcd7cd', { metalness: .4, roughness: .35 }), red = mat('#b8361f', { roughness: .5 });
  g.add(along(part(G.cyl, hull, .5, 7, .5, 0, 0, 0)));
  g.add(along(part(G.cone, hull, .5, 2.6, .5, 0, 0, 4.8)));
  g.add(part(G.box, red, 1.02, .2, 1.4, 0, .2, 2.4, false));
  g.add(part(G.box, mat('#1d2630', { metalness: .6, roughness: .2 }), .5, .25, 1, 0, .42, 2.6, false)); // canopy
  for (const s of [-1, 1]) { const w = part(G.box, hull, 3.4, .12, 1.5, s * 1.9, -.1, -1.6); w.rotation.y = s * .45; g.add(w); g.add(part(G.box, red, .3, .14, 1.2, s * 3.3, -.1, -2.4, false)); }
  g.add(part(G.box, hull, .12, 1.3, 1.4, 0, .75, -2.8));
  engine(g, 0, 0, -3.55, .42, '#8fd8ff', 4);
  return g;
}
function freighter(): THREE.Group {
  const g = new THREE.Group(), hull = mat('#8f8a80', { metalness: .45, roughness: .6 }), rust = mat('#a86638', { metalness: .3, roughness: .7 }), dark = mat('#2c2f33', { metalness: .4 });
  g.add(part(G.box, hull, 5, 2.6, 12, 0, 0, 0));
  g.add(part(G.box, hull, 3.6, 1.8, 3, 0, -.2, 7.2)); // nose block
  g.add(part(G.box, hull, 2.2, 1.2, 2.4, 0, 1.9, 3.6)); // bridge
  g.add(part(G.box, mat('#cfe8ff', { emissive: '#9fd0ff', emissiveIntensity: .6 }), 2.24, .25, .4, 0, 2.05, 4.75, false)); // bridge windows
  for (const s of [-1, 1]) for (const z of [-3, 1.5]) g.add(along(part(G.cyl, rust, .9, 4, .9, s * 3.3, -.5, z))); // cargo pods
  for (const z of [-4, -1, 2, 5]) g.add(part(G.box, dark, 5.1, .2, .4, 0, 1.31, z, false)); // ribs
  g.add(part(G.cyl8, mat('#c9c4ba'), .06, 2.6, .06, 1.6, 2.4, 2.2, false)); // antenna
  for (const x of [-1.6, 0, 1.6]) engine(g, x, 0, -6.1, .7, '#ffb067', 5);
  return g;
}
function dart(): THREE.Group {
  const g = new THREE.Group(), hull = mat('#6d7f93', { metalness: .5, roughness: .45 }), tip = mat('#e28a2c', { roughness: .5 });
  const w = part(tri, hull, 2.2, 3.4, .14, 0, 0, 0); w.rotation.x = Math.PI / 2; g.add(w); // the delta, point forward
  g.add(along(part(G.cyl8, hull, .32, 2.6, .32, 0, .12, .2)));
  g.add(part(G.sph, mat('#18202a', { metalness: .6, roughness: .2 }), .3, .22, .55, 0, .34, .5, false)); // canopy
  for (const s of [-1, 1]) g.add(part(G.box, tip, .12, .5, .7, s * 1.75, .2, -1.2, false)); // wingtip fins
  for (const s of [-1, 1]) engine(g, s * .35, .1, -1.55, .2, '#7fe0ff', 2.4);
  return g;
}
function fighters(): THREE.Group {
  const g = new THREE.Group();
  for (const [x, z] of [[0, 0], [-4.5, -4.5], [4.5, -4.5]]) { const d = dart(); d.position.set(x, z ? -.6 : 0, z); g.add(d); }
  return g;
}
function barge(): THREE.Group {
  const g = new THREE.Group(), hull = mat('#5f6670', { metalness: .5, roughness: .6 }), dark = mat('#383d44', { metalness: .45, roughness: .6 }), lite = glow('#ffcf7a', 2.2);
  g.add(part(G.box, hull, 14, 4, 56, 0, 0, 0));
  g.add(part(G.box, hull, 10, 3, 8, 0, -.5, 31)); // prow
  g.add(part(G.box, dark, 16, 1.2, 50, 0, -1.6, -1)); // keel skirt
  for (let z = -22; z <= 22; z += 5.5) g.add(part(G.box, dark, 14.4, 1, 1.3, 0, 2.3, z)); // ribs
  for (const [x, z, w, d, h] of [[-3, -12, 4, 6, 3], [3.5, 4, 3, 5, 2.2], [0, 14, 5, 4, 1.6]]) g.add(part(G.box, hull, w, h, d, x, 2 + h / 2, z)); // ore hoppers
  g.add(part(G.box, hull, 6, 7, 6, 0, 5.5, -24)); // command tower
  g.add(part(G.box, mat('#cfe8ff', { emissive: '#9fd0ff', emissiveIntensity: .8 }), 6.1, .6, .5, 0, 7.6, -20.8, false));
  for (let z = -24; z <= 24; z += 4) for (const s of [-1, 1]) g.add(part(G.box, lite, .1, .25, .5, s * 7.06, .6, z, false)); // running lights
  for (const x of [-5, -1.7, 1.7, 5]) engine(g, x, 0, -28.1, 1.3, '#ffa45c', 9);
  return g;
}
const BUILD: Record<Kind, () => THREE.Group> = { courier, freighter, fighters, barge };
/** Ships that fit a spaceport bay (port.ts). Exhaust cones carry userData.trail. */
export const PORT_SHIPS = { courier, freighter, dart };

interface Ship { k: Kind; g: THREE.Group; from: THREE.Vector3; dir: THREE.Vector3; t: number; dur: number; L: number; bank: number }

export function makeSky(ctx: SceneCtx, on: () => boolean) {
  const { scene, camera, controls, reduced } = ctx;
  const ships: Ship[] = [];
  let next = 6 + Math.random() * 8, clock = 0, last: Kind | null = null;
  const v = new THREE.Vector3();

  function launch(kind?: Kind) {
    let pick = KINDS.filter(x => x.k !== last); if (kind) pick = KINDS.filter(x => x.k === kind);
    let r = Math.random() * pick.reduce((n, x) => n + x.w, 0), K = pick[0]; for (const x of pick) { r -= x.w; if (r <= 0) { K = x; break; } }
    const g = BUILD[K.k](); g.traverse(o => { if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).castShadow = K.k === 'barge' || K.k === 'freighter'; }); scene.add(g);
    const alt = K.alt[0] + Math.random() * (K.alt[1] - K.alt[0]), speed = K.speed[0] + Math.random() * (K.speed[1] - K.speed[0]);
    // cross the middle of the view: put the line where a point this high appears over the view centre
    v.copy(camera.position).sub(controls.target); const ox = v.x / v.y * alt, oz = v.z / v.y * alt;
    const half = (camera.right - camera.left) / 2 / camera.zoom, D = half * 1.25 + 60;
    const a = Math.random() * Math.PI * 2, dir = new THREE.Vector3(Math.cos(a), 0, Math.sin(a)), side = (Math.random() - .5) * half * .8;
    const c = new THREE.Vector3(controls.target.x + ox - dir.z * side, alt, controls.target.z + oz + dir.x * side);
    const from = c.clone().addScaledVector(dir, -D);
    g.rotation.y = Math.atan2(dir.x, dir.z);
    ships.push({ k: K.k, g, from, dir, t: 0, dur: 2 * D / speed, L: 2 * D, bank: (Math.random() - .5) * .5 });
    last = K.k;
  }
  function frame(dt: number) {
    clock += dt;
    if (!reduced && clock > next && ships.length < 2) { if (on()) launch(); next = clock + 12 + Math.random() * 23; }
    for (let i = ships.length - 1; i >= 0; i--) {
      const S = ships[i]; S.t += dt;
      const k = S.t / S.dur; if (k >= 1 || reduced) { scene.remove(S.g); ships.splice(i, 1); continue; }
      S.g.position.copy(S.from).addScaledVector(S.dir, S.L * k); S.g.position.y += Math.sin(k * Math.PI * 2) * 1.2;
      S.g.rotation.z = Math.sin(k * Math.PI * 2) * S.bank;
    }
  }
  return { frame, launch, count: () => ships.length, kinds: () => ships.map(s => s.k) };
}
