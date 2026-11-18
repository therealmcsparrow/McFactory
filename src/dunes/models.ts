// The Dunes view's models, all built from a few shared primitives: the homestead, condenser towers, farmhands,
// hover-sleds, the patrol wardens and the dune crawlers. Every model faces local +z. Materials whose colour or glow
// changes per object are made fresh; the rest are shared through mat().
import * as THREE from 'three';

const cache = new Map<string, THREE.MeshStandardMaterial>();
/** A shared standard material (do not change it: it is reused by everything with the same colour and options). */
export function mat(c: string, o: THREE.MeshStandardMaterialParameters = {}): THREE.MeshStandardMaterial {
  const k = c + JSON.stringify(o); let m = cache.get(k);
  if (!m) { m = new THREE.MeshStandardMaterial(Object.assign({ color: c, roughness: .85, metalness: .05 }, o)); cache.set(k, m); }
  return m;
}
/** A material of its own, for parts that light up or change colour. */
export const own = (c: string, o: THREE.MeshStandardMaterialParameters = {}) => new THREE.MeshStandardMaterial(Object.assign({ color: c, roughness: .6, metalness: .05 }, o));
export const invisM = new THREE.MeshBasicMaterial({ visible: false });

export const G = {
  dome: new THREE.SphereGeometry(1, 28, 12, 0, Math.PI * 2, 0, Math.PI / 2),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 18), cyl8: new THREE.CylinderGeometry(1, 1, 1, 8),
  box: new THREE.BoxGeometry(1, 1, 1), sph: new THREE.SphereGeometry(1, 14, 10), cone: new THREE.ConeGeometry(1, 1, 14),
  ring: new THREE.TorusGeometry(1, .14, 8, 28), can: new THREE.CylinderGeometry(.16, .16, .44, 10),
};
// cylinder and cone parts are scaled (r, h, r) and centred on y; box parts (w, h, d)
export function part(g: THREE.BufferGeometry, m: THREE.Material, sx: number, sy: number, sz: number, x = 0, y = 0, z = 0, shadow = true) {
  const o = new THREE.Mesh(g, m); o.scale.set(sx, sy, sz); o.position.set(x, y, z); o.castShadow = shadow; o.receiveShadow = true; return o;
}

const PLASTER = '#e8dbc0', PLASTER2 = '#d6c29d', METAL = '#b4ada2', DARK = '#4a4038';

/** A domed homestead with a vestibule, a colour band, an antenna with a beacon, and water tanks. Origin = main dome centre. */
export function homestead(color: string) {
  const g = new THREE.Group(), pl = mat(PLASTER, { roughness: .95 });
  g.add(part(G.cyl, mat(PLASTER2, { roughness: 1 }), 4.6, .2, 4.6, 0, .1, 0, false)); // courtyard floor
  g.add(part(G.dome, pl, 3.1, 2.4, 3.1, 0, .2, 0));
  g.add(part(G.dome, pl, 1.4, 1.2, 1.4, 0, .2, -3.4)); // vestibule toward the depot
  g.add(part(G.box, mat(DARK), .7, .9, .3, 0, .6, -4.7, false)); // door
  const band = part(G.ring, own(color, { emissive: color, emissiveIntensity: .25 }), 3.12, 3.12, 1.2, 0, .35, 0, false); band.rotation.x = Math.PI / 2; g.add(band);
  g.add(part(G.cyl, mat(METAL, { metalness: .5, roughness: .4 }), .05, 4.2, .05, 2.6, 2.1, -1.6)); // antenna mast
  const beacon = part(G.sph, own('#333', { emissive: '#000', roughness: .3 }), .2, .2, .2, 2.6, 4.3, -1.6, false); g.add(beacon);
  for (const [x, z, h] of [[-3.6, 1.4, 1.6], [-3.9, -.6, 1.2], [3.7, 1.1, 1.4]] as const) { // tanks
    g.add(part(G.cyl, mat(PLASTER2, { roughness: .7, metalness: .2 }), .55, h, .55, x, h / 2, z)); g.add(part(G.cyl, mat(METAL, { metalness: .5 }), .58, .08, .58, x, h, z, false)); }
  return { g, beacon, bandM: band.material as THREE.MeshStandardMaterial };
}

/** A tall banner on a pole: a cloth in the farm's colour with a swallowtail foot, a water-drop emblem and the farm's
 * name reading top to bottom. Origin = the foot of the pole. `cloth` hangs from the cross bar (sway it); `name()` repaints. */
export function banner(color: string) {
  const g = new THREE.Group(), metal = mat(METAL, { metalness: .5, roughness: .4 });
  g.add(part(G.cyl8, metal, .045, 4.5, .045, 0, 2.25, 0)); // pole
  g.add(part(G.sph, metal, .09, .09, .09, 0, 4.55, 0, false)); // finial
  const bar = part(G.cyl8, metal, .03, 1.15, .03, 0, 4.3, .06, false); bar.rotation.z = Math.PI / 2; g.add(bar);
  const W = 160, H = 480, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const c2 = cv.getContext('2d')!, tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const lum = (() => { const c = new THREE.Color(color); return .2126 * c.r + .7152 * c.g + .0722 * c.b; })(), ink = lum > .55 ? '#1d1a17' : '#f6f1e6';
  let txt = '';
  const draw = () => {
    const t = c2; t.clearRect(0, 0, W, H);
    const cloth = () => { t.beginPath(); t.moveTo(0, 0); t.lineTo(W, 0); t.lineTo(W, H); t.lineTo(W / 2, H * .9); t.lineTo(0, H); t.closePath(); };
    cloth(); t.fillStyle = color; t.fill();
    t.save(); cloth(); t.clip(); // a darker hem and top band, and a fold shade down one side
    t.fillStyle = 'rgba(0,0,0,.28)'; t.fillRect(0, 0, W, 16);
    t.strokeStyle = 'rgba(0,0,0,.22)'; t.lineWidth = 6; t.strokeRect(11, 24, W - 22, H - 22);
    const sh = t.createLinearGradient(0, 0, W, 0); sh.addColorStop(0, 'rgba(0,0,0,.14)'); sh.addColorStop(.5, 'rgba(0,0,0,0)'); sh.addColorStop(1, 'rgba(255,255,255,.07)');
    t.fillStyle = sh; t.fillRect(0, 0, W, H); t.restore();
    t.fillStyle = ink; t.beginPath(); t.arc(W / 2, 62, 25, 0, Math.PI * 2); t.fill(); // emblem: a water drop in a disc
    t.fillStyle = color; t.beginPath(); t.moveTo(W / 2, 44); t.bezierCurveTo(W / 2 + 15, 62, W / 2 + 13, 76, W / 2, 77); t.bezierCurveTo(W / 2 - 13, 76, W / 2 - 15, 62, W / 2, 44); t.fill();
    const FONT = `800 ${W * .5}px "Barlow Condensed", "Arial Narrow", sans-serif`; t.font = FONT; t.fillStyle = ink; t.textAlign = 'center'; t.textBaseline = 'middle';
    const room = H * .66, tw = t.measureText(txt).width, s = tw > room ? room / tw : 1; // squeeze a long name along its length
    t.save(); t.translate(W / 2, 108 + room / 2); t.rotate(Math.PI / 2); t.scale(s, 1); t.fillText(txt, 0, 0); t.restore();
    tex.needsUpdate = true;
  };
  const cloth = new THREE.Group(); cloth.position.set(0, 4.3, .07); g.add(cloth);
  const m = new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: '#ffffff', emissiveIntensity: .3, alphaTest: .5, side: THREE.DoubleSide, roughness: .95 });
  const pl = new THREE.Mesh(new THREE.PlaneGeometry(1.05, 3.15), m); pl.position.y = -1.6; pl.receiveShadow = true; cloth.add(pl);
  const name = (n: string) => { const u = n.toUpperCase(); if (u === txt) return; txt = u; draw(); };
  if (document.fonts) document.fonts.ready.then(draw); // repaint once the web font is in
  return { g, cloth, name };
}

/** The canister pad: a slab with four corner posts. Origin = pad centre on the ground. */
export function pad() {
  const g = new THREE.Group(); g.add(part(G.box, mat('#9c8a72', { roughness: .9 }), 2.4, .12, 2.0, 0, .06, 0));
  for (const x of [-1.1, 1.1]) for (const z of [-.9, .9]) g.add(part(G.cyl8, mat(METAL, { metalness: .4 }), .05, .5, .05, x, .25, z));
  return g;
}

export interface TowerParts { g: THREE.Group; spin: THREE.Group; lampM: THREE.MeshStandardMaterial; ringM: THREE.MeshStandardMaterial; capM: THREE.MeshStandardMaterial; bandM: THREE.MeshStandardMaterial; hit: THREE.Mesh }
/** A moisture condenser tower: band = role, cap = model, glow ring = effort, lamp = status; the fins spin while it runs. */
export function tower(): TowerParts {
  const g = new THREE.Group(), steel = mat(METAL, { metalness: .55, roughness: .35 });
  g.add(part(G.cyl8, mat('#6b5b4a'), .34, .3, .34, 0, .15, 0));
  g.add(part(G.cyl, steel, .15, 2.5, .15, 0, 1.55, 0));
  const bandM = own('#888'); g.add(part(G.cyl, bandM, .21, .4, .21, 0, .75, 0));
  const spin = new THREE.Group(); spin.position.y = 1.85; g.add(spin);
  for (let i = 0; i < 3; i++) { const b = part(G.box, steel, .05, .9, .8, 0, 0, 0); b.rotation.y = i * Math.PI / 1.5; b.translateZ(.42); spin.add(b); }
  const ringM = own('#888', { emissive: '#000' }); const ring = part(G.ring, ringM, .3, .3, .5, 0, 2.62, 0, false); ring.rotation.x = Math.PI / 2; g.add(ring);
  const capM = own('#888'); g.add(part(G.cone, capM, .26, .4, .26, 0, 3.0, 0));
  const lampM = own('#222', { emissive: '#000', roughness: .3 }); g.add(part(G.sph, lampM, .1, .1, .1, 0, 3.28, 0, false));
  const hit = part(G.box, invisM, .9, 3.4, .9, 0, 1.7, 0, false); g.add(hit);
  return { g, spin, lampM, ringM, capM, bandM, hit };
}

export interface FigureParts { g: THREE.Group; body: THREE.Group; legL: THREE.Object3D; legR: THREE.Object3D }
/** A farmhand in a hooded robe (role colour). */
export function farmhand(color: string): FigureParts & { robeM: THREE.MeshStandardMaterial } {
  const g = new THREE.Group(), body = new THREE.Group(); g.add(body);
  const robeM = own(color, { roughness: .95 }), hood = new THREE.Color(color).multiplyScalar(.72);
  const legL = part(G.box, mat('#5a4a3a'), .1, .3, .12, -.09, .15, 0), legR = part(G.box, mat('#5a4a3a'), .1, .3, .12, .09, .15, 0); g.add(legL, legR);
  body.add(part(G.cone, robeM, .3, 1.0, .3, 0, .72, 0));
  body.add(part(G.sph, mat('#c99b76'), .14, .15, .14, 0, 1.24, .02));
  body.add(part(G.sph, own('#' + hood.getHexString(), { roughness: .95 }), .17, .17, .17, 0, 1.27, -.04));
  body.add(part(G.cyl8, mat('#6e5b45'), .025, 1.25, .025, .26, .7, .08)); // staff
  return { g, body, legL, legR, robeM };
}

/** A patrol warden in white armour: a round white helmet with a dark wrap-round visor band and a low crest fin, white
 * chest and shoulder plates over a dark suit, a short dark carbine across the chest. The leader has an orange pauldron. */
export function warden(leader: boolean): FigureParts {
  const g = new THREE.Group(), body = new THREE.Group(); g.add(body);
  const white = mat('#f1f2f0', { roughness: .35, metalness: .05 }), suit = mat('#2b2f35', { roughness: .8 }), visor = mat('#151a20', { roughness: .15, metalness: .6 });
  const leg = (x: number) => { const l = new THREE.Group(); l.position.set(x, .5, 0); l.add(part(G.box, white, .14, .34, .16, 0, -.2, 0)); l.add(part(G.box, suit, .15, .12, .19, 0, -.44, .02)); return l; };
  const legL = leg(-.1), legR = leg(.1); g.add(legL, legR);
  body.add(part(G.box, suit, .34, .2, .22, 0, .58, 0)); // hips
  body.add(part(G.box, white, .38, .14, .24, 0, .62, .01)); // belt plate
  body.add(part(G.box, suit, .32, .4, .2, 0, .9, 0)); // under-suit
  body.add(part(G.box, white, .4, .32, .26, 0, 1.0, .02)); // chest plate
  body.add(part(G.box, mat('#9aa1a8', { roughness: .5 }), .14, .06, .02, 0, 1.02, .16, false)); // chest vent
  for (const x of [-.25, .25]) {
    body.add(part(G.sph, leader && x > 0 ? mat('#e8742a', { roughness: .5 }) : white, .11, .09, .12, x, 1.14, 0)); // shoulders
    body.add(part(G.box, white, .1, .36, .11, x * 1.04, .92, .02)); // arms
  }
  body.add(part(G.cyl8, suit, .07, .1, .07, 0, 1.22, 0)); // neck
  body.add(part(G.sph, white, .17, .19, .18, 0, 1.38, 0)); // helmet
  const band = part(G.ring, visor, .17, .17, .55, 0, 1.38, 0, false); band.rotation.x = Math.PI / 2; band.scale.set(.188, .188, .5); body.add(band); // the visor band, all round
  body.add(part(G.box, visor, .2, .07, .05, 0, 1.38, .15, false)); // visor front
  body.add(part(G.box, white, .03, .07, .22, 0, 1.56, -.01, false)); // crest fin
  const gun = part(G.box, mat('#24272b', { metalness: .5, roughness: .4 }), .06, .07, .6, .03, .93, .2); gun.rotation.set(.2, 0, .6); body.add(gun);
  return { g, body, legL, legR };
}

export interface CrawlerParts { g: THREE.Group; hull: THREE.Group; legs: { hip: THREE.Vector3; up: THREE.Mesh; lo: THREE.Mesh; side: number; front: number }[]; eyeM: THREE.MeshStandardMaterial }
/** A dune crawler: a low beetle carapace on four splayed, high-kneed legs, one glowing sensor eye. Legs are posed by poseCrawler. */
export function crawler(): CrawlerParts {
  const g = new THREE.Group(), hull = new THREE.Group(); g.add(hull);
  const shell = mat('#6f675d', { metalness: .45, roughness: .5 }), dark = mat('#3f3a35', { metalness: .4, roughness: .55 });
  hull.add(part(G.sph, shell, 1.7, .75, 2.3, 0, 0, 0));
  hull.add(part(G.box, dark, 2.6, .35, 3.6, 0, -.35, 0));
  for (const z of [-1.1, 0, 1.1]) hull.add(part(G.box, mat('#8a8074', { metalness: .4 }), 1.3, .12, .5, 0, .68, z)); // back plates
  const eyeM = own('#ff7a3a', { emissive: '#ff7a3a', emissiveIntensity: 2.2 }); hull.add(part(G.sph, eyeM, .28, .22, .2, 0, .05, 2.25, false));
  hull.add(part(G.cyl8, dark, .07, 1.2, .07, .7, .2, 2.2)); hull.children[hull.children.length - 1].rotation.x = Math.PI / 2; // sensor barrel
  const legs: CrawlerParts['legs'] = [];
  for (const side of [-1, 1]) for (const front of [-1, 1]) {
    const up = part(G.cyl8, dark, .14, 1, .14), lo = part(G.cyl8, shell, .1, 1, .1); g.add(up, lo);
    legs.push({ hip: new THREE.Vector3(side * 1.3, 0, front * 1.2), up, lo, side, front });
  }
  return { g, hull, legs, eyeM };
}
const UP = new THREE.Vector3(0, 1, 0), tv = new THREE.Vector3(), tq = new THREE.Quaternion();
/** Stretch a unit cylinder between two local points. */
export function between(m: THREE.Mesh, a: THREE.Vector3, b: THREE.Vector3) {
  tv.subVectors(b, a); const L = tv.length(); m.position.copy(a).addScaledVector(tv, .5);
  m.quaternion.copy(tq.setFromUnitVectors(UP, tv.multiplyScalar(1 / (L || 1)))); m.scale.y = L;
}
const knee = new THREE.Vector3(), foot = new THREE.Vector3(), hipW = new THREE.Vector3();
/** Pose a crawler: hull at height h, gait phase ph (diagonal pairs swing together). */
export function poseCrawler(C: CrawlerParts, h: number, ph: number, moving: boolean) {
  C.hull.position.y = h + (moving ? Math.sin(ph * 2) * .08 : 0);
  for (const L of C.legs) {
    const p = ph + (L.side * L.front > 0 ? 0 : Math.PI), sw = moving ? Math.sin(p) : 0, lift = moving ? Math.max(0, Math.cos(p)) * .7 : 0;
    hipW.set(L.hip.x, C.hull.position.y - .2, L.hip.z);
    foot.set(L.side * 3.0, lift, L.front * 2.7 + sw * .9);
    knee.set(L.side * 2.5, h + 1.4 + lift * .5, (L.hip.z + foot.z) / 2 + L.front * .4);
    between(L.up, hipW, knee); between(L.lo, knee, foot);
  }
}

export interface SledParts { g: THREE.Group; glowM: THREE.MeshStandardMaterial; slots: THREE.Vector3[] }
/** A hover-sled: flat deck with six cargo slots, a cab at the back, two glowing hover pods. */
export function sled(): SledParts {
  const g = new THREE.Group(), hullM = mat('#8d8f94', { metalness: .55, roughness: .4 });
  g.add(part(G.box, hullM, 1.1, .22, 2.0, 0, 0, 0));
  g.add(part(G.box, mat('#a85a32', { metalness: .3, roughness: .5 }), 1.12, .08, .3, 0, .12, .95, false)); // nose stripe
  g.add(part(G.box, mat('#5c6b78', { metalness: .4, roughness: .3 }), .8, .42, .55, 0, .3, -.75));
  const glowM = own('#7fe0ff', { emissive: '#7fe0ff', emissiveIntensity: 1.8 });
  for (const x of [-.55, .55]) { const p = part(G.cyl8, hullM, .16, 1.8, .16, x, -.1, 0); p.rotation.x = Math.PI / 2; g.add(p); g.add(part(G.box, glowM, .12, .04, 1.5, x, -.27, 0, false)); }
  const slots: THREE.Vector3[] = [];
  for (let i = 0; i < 6; i++) slots.push(new THREE.Vector3((i % 2 - .5) * .4, .33, .55 - Math.floor(i / 2) * .38));
  return { g, glowM, slots };
}
