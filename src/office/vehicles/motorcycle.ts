// Motorcycle model, nose to +z, about 0.8 m wide (handlebars) and 2.1 m long, with or without its rider. In traffic as
// vehicle kind 'moto' (the shop visitors, shop-visitor.ts, and agents who ride to work, sports-car.ts rideOf): props.ts puts every variant in G.moto, MOTO_IND_DIM says where
// its turn-signal lamps go (traffic.ts IND_DIM).
import type * as THREE from 'three';
import type { OSAtProps } from '../state.js';
import { WHEEL, type Parts } from './parts.js';

/** The geometry helpers the motorcycle needs: the vehicle parts plus spheres (helmet). */
export type MotoParts = Parts & Pick<OSAtProps, 'sp'>;

/** Colour sets: bike body, rider jacket, helmet. */
export const MOTO_VARIANTS: readonly { body: string; jacket: string; helmet: string }[] = [
  { body: '#b8322a', jacket: '#1c1f26', helmet: '#c8ccd2' }, // red bike, black jacket
  { body: '#1b1e24', jacket: '#6b4630', helmet: '#22252b' }, // black bike, brown leather
  { body: '#2f5fb0', jacket: '#a8322e', helmet: '#c99a22' }, // blue bike, red jacket
  { body: '#2f7d4e', jacket: '#565d68', helmet: '#c33b30' }, // green bike, grey jacket
  { body: '#d9782f', jacket: '#243552', helmet: '#bfc4cb' }, // orange bike, navy jacket
];

/** Turn-signal lamps: half width, front, rear, height (the form of IND_DIM in traffic.ts). */
export const MOTO_IND_DIM: readonly [number, number, number, number] = [.22, .95, -1.0, .84];

/** Motorcycle, nose to +z. variant picks a MOTO_VARIANTS entry (wraps); rider = false gives a parked, empty bike. */
export function motorcycleGeometry({ bx, cy, sp, merge }: MotoParts, variant = 0, rider = true): THREE.BufferGeometry {
  const V = MOTO_VARIANTS[((variant % MOTO_VARIANTS.length) + MOTO_VARIANTS.length) % MOTO_VARIANTS.length], B = V.body;
  const DK = '#15181d', MT = '#8b939e', SEAT = '#121419', L: THREE.BufferGeometry[] = [];
  // wheels and hubs
  for (const z of [-.72, .72]) L.push(cy(.31, .13, 0, .31, z, WHEEL, 14, Math.PI / 2), cy(.12, .15, 0, .31, z, MT, 10, Math.PI / 2));
  // engine, exhaust, frame
  L.push(bx(.3, .3, .56, 0, .44, .02, '#2a2e36'), bx(.09, .09, .78, .19, .3, -.42, MT), bx(.08, .08, .5, 0, .62, -.42, DK), bx(.06, .06, .7, 0, .5, -.4, DK));
  // tank, seat, tail, mudguards
  L.push(bx(.34, .2, .5, 0, .76, .2, B), bx(.3, .1, .6, 0, .74, -.32, SEAT), bx(.26, .14, .34, 0, .76, -.76, B), bx(.16, .05, .4, 0, .66, .74, B), bx(.18, .05, .3, 0, .68, -.92, B));
  // front fork, fairing, headlight, handlebars, mirrors, tail light
  for (const x of [-.1, .1]) L.push(bx(.05, .56, .05, x, .6, .76, MT));
  L.push(bx(.3, .22, .18, 0, .9, .8, B), bx(.18, .12, .04, 0, .88, .9, '#f4f1d8'), bx(.78, .05, .05, 0, .98, .58, DK), bx(.05, .14, .05, -.3, 1.08, .6, DK), bx(.05, .14, .05, .3, 1.08, .6, DK), bx(.14, .06, .04, 0, .8, -.94, '#c0281e'));
  if (rider) { // seated, leaning forward to the bars; sized to the office people (about 1.5 m standing)
    const J = V.jacket, PT = '#252a33';
    for (const s of [-1, 1]) L.push(bx(.16, .14, .46, s * .14, .84, -.06, PT), bx(.13, .4, .13, s * .2, .58, .18, PT), bx(.13, .09, .24, s * .2, .36, .24, DK)); // thighs, shins, boots
    L.push(bx(.42, .28, .26, 0, .92, -.3, J), bx(.44, .28, .26, 0, 1.14, -.2, J));                                                                     // torso, leaning forward
    for (const s of [-1, 1]) L.push(bx(.11, .11, .36, s * .25, 1.14, .04, J), bx(.1, .1, .32, s * .29, 1.03, .34, J), bx(.1, .08, .1, s * .3, .99, .54, DK)); // arms, gloves on the grips
    L.push(sp(.19, 0, 1.4, -.1, V.helmet), bx(.26, .09, .08, 0, 1.4, .07, '#0e1218'));                                                                     // helmet, visor
  }
  return merge(L);
}
