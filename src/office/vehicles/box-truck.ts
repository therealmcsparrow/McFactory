// Box truck model, nose to +z: a commercial delivery truck, a cab and a tall cargo box with a roll-up door at the rear,
// a bit shorter than the armoured car. Each livery (BOX_VARIANTS) colours the cab, the box and a stripe along it;
// boxTruckLogo adds the shop's name on both box sides as a canvas sign (like the POLICE sign at the station), as a
// group to add to the truck's mesh. vehicles/delivery.ts drives them (deliveries to the shops and through traffic).
// BOX_IND_DIM says where its turn-signal lamps go (traffic.ts IND_DIM), BOX_SIZE is its footprint.
import * as THREE from 'three';
import { WHEEL, type Parts } from './parts.js';

/** A livery: cab, box, stripe colour; the name on the box sides with its sign and ink colours ('' for none). */
export interface BoxLivery { name: string; cab: string; box: string; stripe: string; sign: string; ink: string }

export const BOX_VARIANTS: readonly BoxLivery[] = [
  { name: 'BAKERY', cab: '#a85a24', box: '#b3a483', stripe: '#a85a24', sign: '#a85a24', ink: '#fbf3e0' },
  { name: 'GROCER', cab: '#b1b4ae', box: '#2f7d4e', stripe: '#f2c94c', sign: '#f2c94c', ink: '#1f4d31' },
  { name: 'CAFÉ', cab: '#3b2a22', box: '#3b2a22', stripe: '#d9a066', sign: '#3b2a22', ink: '#f0d2a4' },
  { name: 'PARCEL', cab: '#d6a523', box: '#d6a523', stripe: '#b8281e', sign: '#b8281e', ink: '#ffffff' },
  { name: '', cab: '#a9b0b9', box: '#a9b0b9', stripe: '#2f5fb0', sign: '', ink: '' }, // plain (light grey reads white)
];

/** Turn-signal lamps: half width, front, rear, height (the form of IND_DIM in traffic.ts). */
export const BOX_IND_DIM: readonly [number, number, number, number] = [.73, 1.68, -1.58, .7];

/** Footprint for the collision tables. */
export const BOX_SIZE = { len: 3.44, wid: 1.54 } as const;

const BOXZ = -.45, BOXL = 2.1, BOXY = 1.28; // the cargo box: centre z, length, centre height (1.45 high)
const pick = (variant: number) => BOX_VARIANTS[((variant % BOX_VARIANTS.length) + BOX_VARIANTS.length) % BOX_VARIANTS.length];

/** Box truck, nose to +z. variant picks a BOX_VARIANTS livery (wraps). */
export function boxTruckGeometry({ bx, cy, merge }: Parts, variant = 0): THREE.BufferGeometry {
  const V = pick(variant), GL = '#11151c', TR = '#20242c', DR = '#959ba3', SL = '#6f757e', L: THREE.BufferGeometry[] = [];
  // chassis, cab (windscreen, side windows, roof deflector, mirrors), front bumper, headlights, grille
  L.push(bx(1.2, .18, 3.1, 0, .44, .02, TR), bx(1.44, .92, 1.08, 0, .86, 1.12, V.cab), bx(1.26, .38, .05, 0, 1.08, 1.67, GL), bx(1.46, .3, .5, 0, 1.1, 1.24, GL));
  L.push(bx(1.3, .2, .5, 0, 1.42, .86, V.cab), bx(1.42, .14, .16, 0, .38, 1.68, TR), bx(.6, .16, .04, 0, .66, 1.67, '#15181d'));
  for (const s of [-1, 1]) L.push(bx(.24, .1, .04, s * .5, .62, 1.67, '#f4f1d8'), bx(.06, .2, .06, s * .78, 1.12, 1.5, TR));
  // cargo box with the livery stripe along its foot, a thin trim along the top edges
  L.push(bx(1.52, 1.45, BOXL, 0, BOXY, BOXZ, V.box), bx(1.54, .16, BOXL + .02, 0, .78, BOXZ, V.stripe));
  for (const s of [-1, 1]) L.push(bx(.05, .06, BOXL + .02, s * .755, 1.98, BOXZ, V.stripe));
  // rear: roll-up door with its slats and handle, frame, tail lights, step bumper
  const rz = BOXZ - BOXL / 2;
  L.push(bx(1.3, 1.26, .04, 0, 1.22, rz - .02, DR));
  for (let y = .7; y < 1.82; y += .14) L.push(bx(1.3, .02, .05, 0, y, rz - .03, SL));
  L.push(bx(.3, .05, .05, 0, .66, rz - .05, TR), bx(1.42, .06, .06, 0, 1.87, rz - .02, TR));
  for (const s of [-1, 1]) L.push(bx(.06, 1.3, .06, s * .68, 1.22, rz - .02, TR), bx(.08, .2, .04, s * .68, .74, rz - .05, '#c0281e'));
  L.push(bx(1.36, .1, .22, 0, .4, rz - .08, TR));
  // wheels, twin at the back
  for (const x of [-.7, .7]) L.push(cy(.32, .2, x, .32, 1.06, WHEEL, 12, Math.PI / 2), cy(.32, .3, x * .97, .32, -1.0, WHEEL, 12, Math.PI / 2));
  return merge(L);
}

const logoMats = new Map<string, THREE.MeshBasicMaterial>();
/** The livery's name on both sides of the box, as one group in the truck's own frame (add it to the truck's mesh);
 *  null for a livery without a name. font = the UI font (OS.FONT). The canvas is drawn once per livery and shared. */
export function boxTruckLogo(variant: number, font: string): THREE.Group | null {
  const V = pick(variant); if (!V.name) return null;
  let m = logoMats.get(V.name);
  if (!m) { const c = document.createElement('canvas'); c.width = 384; c.height = 96; const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    const draw = () => { const x = c.getContext('2d')!; x.fillStyle = V.sign; x.fillRect(0, 0, 384, 96); x.font = `800 58px ${font}`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = V.ink; x.fillText(V.name.split('').join(' '), 192, 52); t.needsUpdate = true; };
    draw(); document.fonts?.ready.then(draw); logoMats.set(V.name, m = new THREE.MeshBasicMaterial({ map: t })); }
  const g = new THREE.Group(), geo = new THREE.PlaneGeometry(1.8, .45);
  for (const s of [-1, 1]) { const p = new THREE.Mesh(geo, m); p.position.set(s * .765, 1.36, BOXZ); p.rotation.y = s * Math.PI / 2; g.add(p); }
  return g;
}
