// Eight shops in an L round a shared car park: the east leg (bakery, café, grocer, pharmacy) faces the east roundabout,
// the north leg (florist, bike shop, bookshop, hardware store) runs west along the back of the bank, so the row wraps the
// bank's corner. The car park has 14 car spots and 6 motorcycle spots along the east leg's pavement, a one-way loop and
// a loading bay at the far end of the north leg, reached by a service drive from the car park's U-turn (the box trucks,
// vehicles/delivery.ts). makeShops builds it at any origin and rotation and returns where the spots, doors, footpaths,
// gates, the service drive and the loading bay are. In the office it stands at SHOP_SITE: roads.ts runs an arm from the
// east roundabout E to SHOP_GATES (one lane each way), index.ts builds it, the shoppers on foot (shoppers.ts), the
// visiting cars and motorcycles (vehicles/shop-visitor.ts) and the box trucks (vehicles/delivery.ts).
//
// Local frame (before origin.rot): the east leg stands along x (x -36..12) with its doors facing +z: z -8..0 shops,
// 0..2 pavement, 2..19 car park. The north leg stands at x -44..-36 along z (z -8..58), doors facing +x, its pavement at
// x -36..-34. Car park (x -34..12.6): spots along the pavement, aisle 1 at z 9.5 (one way, towards -x), a U-turn at the
// north end, aisle 2 at z 15.5 back towards +x, out at the exit lane (x -10); in at the entry lane (x 10). Past the car
// park (z > 19) the service drive (x -34..-30.5, two-way, one truck at a time) runs beside the north leg's pavement up
// to the loading apron (x -45..-30.5, z 58..67), with a planted strip east of it (x -30.5..-27.3, clear of the bank's
// fence). A footpath runs down the east side (x 12.7..14).
import * as THREE from 'three';
import type { P2 } from '../../common/types.js';
import type { OSAtBank } from '../state.js';

/** What makeShops needs from OS (all there once makeProps has run). */
export type ShopsOS = Pick<OSAtBank, 'bx' | 'cy' | 'sp' | 'merge' | 'mesh' | 'VC' | 'arrow' | 'FONT' | 'DARKW' | 'ctx'>;
export type ShopKind = 'bakery' | 'cafe' | 'grocer' | 'pharmacy' | 'florist' | 'bikes' | 'books' | 'hardware';
/** A position with a heading (rot: rotation.y, 0 = facing +z, the same as a vehicle's rot). */
export interface Pose { x: number; z: number; rot: number }
/** The same thing in the shops' own frame and in the world. */
export interface Both<T> { local: T; world: T }
export interface ShopSpot { i: number; kind: 'car' | 'moto'; pose: Both<Pose>; walk: Both<P2[]> } // walk: from beside the parked vehicle to the pavement walking line
export interface ShopDoor { kind: ShopKind; name: string; door: Both<P2>; inside: Both<P2>; front: Both<P2>; face: number } // door: on the step; inside: just behind the shop front (out of sight); front: where the door meets the pavement walking line; face: the way the shop front looks (local rot)
export interface Shops {
  group: THREE.Group; origin: Pose;
  cars: ShopSpot[]; motos: ShopSpot[]; doors: ShopDoor[];
  entry: Both<Pose>; exit: Both<Pose>; // where a vehicle enters (heading in) and leaves (heading out) at the front edge
  lane: Both<P2[]>;                    // the one-way drive: entry, aisle 1, U-turn, aisle 2, exit
  loading: Both<Pose>;                 // where a box truck stands to unload (its back to the hardware store's side door)
  service: { up: Both<P2[]>; back: Both<P2[]>; away: Both<P2[]> }; // box truck: from the entry along aisle 1, half the U-turn, up the drive to past the bay (forward); reversing into loading; from loading down the drive onto aisle 2's west end (forward)
  crates: P2;                          // local: where unloaded goods stand, beside the bay by the side door
  paths: { pavement: Both<P2[]>; west: Both<P2[]>; east: Both<P2[]> }; // footpaths: the L walking line (east end first), its far end on the north leg, the east footpath (pavement to front edge)
  toWorld: (x: number, z: number) => P2;
  setLit: (level: number) => void;     // 0 dark .. 1 lit (above 1 brighter still)
  // the sliding doors (two leaves each, the same order as doors): openDoor(i) keeps door i open for the next half second
  // (call it every frame while someone is at it), doorOpen(i) is how far open it is (0 shut .. 1 open), frameDoors moves them
  openDoor: (i: number) => void; doorOpen: (i: number) => number; frameDoors: (dt: number) => void;
  dispose: () => void;
}

interface Def { kind: ShopKind; name: string; w: number; h: number; wall: string; trim: string; awn: string; sign: string; ink: string; glow: string }
const EAST: Def[] = [ // from the south end (x 12) northwards
  { kind: 'bakery', name: 'BAKERY', w: 10, h: 4.0, wall: '#9a7550', trim: '#6e4a2c', awn: '#b03d2b', sign: '#5a3620', ink: '#f6e3c2', glow: '#ffc98a' },
  { kind: 'cafe', name: 'CAFÉ', w: 10, h: 4.0, wall: '#7c5242', trim: '#4a2c22', awn: '#2a2f37', sign: '#2a1c18', ink: '#f0c88a', glow: '#ffbf73' },
  { kind: 'grocer', name: 'GROCER', w: 14, h: 4.6, wall: '#527a4a', trim: '#2f4a2a', awn: '#3a6e36', sign: '#284224', ink: '#f2f0d8', glow: '#f5dfae' },
  { kind: 'pharmacy', name: 'PHARMACY', w: 14, h: 4.2, wall: '#5e7f78', trim: '#33504a', awn: '#2f7a55', sign: '#1f3f33', ink: '#e8f6ee', glow: '#dff2e8' },
];
const NORTH: Def[] = [ // from the corner (z 2) westwards
  { kind: 'florist', name: 'FLORIST', w: 10, h: 4.0, wall: '#8a6a7a', trim: '#5a3e4c', awn: '#b0506f', sign: '#3e2433', ink: '#ffe6f0', glow: '#ffd6e2' },
  { kind: 'bikes', name: 'BIKES', w: 12, h: 4.2, wall: '#46668c', trim: '#25384f', awn: '#b8962f', sign: '#1c2c42', ink: '#ffffff', glow: '#d6e2f2' },
  { kind: 'books', name: 'BOOKSHOP', w: 12, h: 4.4, wall: '#6a5a46', trim: '#3e3226', awn: '#7a2a2a', sign: '#2a1f18', ink: '#f2dfb0', glow: '#ffd9a0' },
  { kind: 'hardware', name: 'HARDWARE', w: 22, h: 5.0, wall: '#6f737a', trim: '#3c4047', awn: '#c0701c', sign: '#22262c', ink: '#ffb347', glow: '#f0e6d0' },
];
const STRIPE = '#6f6a60'; // the pale awning stripe: kept well below white so it does not glare in the sun
const LW = .85, LZ = .1, SLIDE = .78, OPENS = 1.6; // door leaf width, its distance in front of the wall, how far each leaf slides aside; open/shut speed (per s)
const SD = 8, PZ = 2, CPZ = 12, FZ = 19, AX = 12.6, PX = 14, WZ = 1.2, AZL = 9.5;  // shop depth, pavement edge, planter start, front edge, asphalt east edge, site east edge, walking line, aisle 1
const XC = -36, XN = -34, XW = XC + WZ, XB = XC - SD, ZW = 58, UR = 3, UC = -29.5, Z2 = AZL + 2 * UR; // north leg: front, pavement edge (= car park north edge), walking line, back, west end; U-turn radius and centre x; aisle 2
const MW = 1.4, MX0 = -33.2, MZ = 3.25, NM = 6, CSW = 2.4, CX0 = MX0 + NM * MW, NC = 15, CZ = 4.4, EXX = 10, OXX = -10; // moto spots, car spots (the last one is not used), entry and exit lane x
// service drive: its east edge, the truck's line along it (the U-turn's west end), the planted strip east of it (to 0.9 short of
// the bank's north fence), the apron's far edge, where the truck turns on the apron (z), and the turn radius
const DXE = -30.5, DX = UC - UR, SX0 = DXE, SX1 = -27.3, ZA = ZW + 9, ZT = ZW + 7.4, TR = 3;
const BX = XC - SD / 2, BZ = ZW + 2.6, BW = XB + 1; // the bay: its centre line x, where the truck stands (its back 0.9 from the side door), where it starts to reverse (x)
const arcP = (cx: number, cz: number, r: number, a0: number, a1: number, n = 8): P2[] => Array.from({ length: n + 1 }, (_, i): P2 => { const a = a0 + (a1 - a0) * i / n; return [cx + r * Math.cos(a), cz + r * Math.sin(a)]; });

/** Where the shops stand in the office: east of the east roundabout (EX 69, street z 18.6). The east leg's doors face west
 *  to the roundabout, the north leg's face south to the back of the bank. Local x runs along world +z, local +z points
 *  to world -x; the car park's front edge is at world x 92.5, the north leg reaches world x 53.5 at z -25..-17. */
export const SHOP_SITE: Readonly<Pose> = { x: 111.5, z: 18.6, rot: -Math.PI / 2 };
/** The world points where the car park meets the road (roads.ts nodes shop:in / shop:out), heading in and heading out. */
export const SHOP_GATES = (() => { const cs = Math.cos(SHOP_SITE.rot), sn = Math.sin(SHOP_SITE.rot), w = (x: number, z: number): P2 => [SHOP_SITE.x + x * cs + z * sn, SHOP_SITE.z - x * sn + z * cs];
  return { entry: { p: w(EXX, FZ), rot: Math.PI + SHOP_SITE.rot }, exit: { p: w(OXX, FZ), rot: SHOP_SITE.rot } }; })();
/** The car park's lane layout (local frame), for the vehicles that drive in it. XN..AX: its asphalt along x. */
export const SHOP_LOT = { FZ, CPZ, PZ, AZL, Z2, UC, UR, EXX, OXX, AX, XN, CZ, MZ, CSW, MW } as const;
/** How many spots the car park has in use (cars + motorcycles): the most the Shop vehicles setting allows. */
export const SHOP_SPOTS = NC - 1 + NM;
const motoX = (i: number) => MX0 + MW * (i + .5), carX = (i: number) => CX0 + CSW * (i + .5);

export function makeShops(OS: ShopsOS, origin: Pose): Shops {
  const { bx, cy, sp, merge, mesh, VC, arrow, FONT, DARKW } = OS;
  const { scene } = OS.ctx;
  const g = new THREE.Group(); g.position.set(origin.x, 0, origin.z); g.rotation.y = origin.rot; scene.add(g);
  const cs = Math.cos(origin.rot), sn = Math.sin(origin.rot);
  const toWorld = (x: number, z: number): P2 => [origin.x + x * cs + z * sn, origin.z - x * sn + z * cs];
  const both2 = (p: P2): Both<P2> => ({ local: p, world: toWorld(p[0], p[1]) });
  const bothL = (P: P2[]): Both<P2[]> => ({ local: P, world: P.map(p => toWorld(p[0], p[1])) });
  const bothP = (x: number, z: number, rot: number): Both<Pose> => { const [wx, wz] = toWorld(x, z); return { local: { x, z, rot }, world: { x: wx, z: wz, rot: rot + origin.rot } }; };

  // ── ground: pavements, car park, planters, footpaths, paint (no shadows cast) ──
  const AS = '#1f242d', LN = '#4d5460', PV = '#3b414b', KB = '#59606c', IS = '#18251d', FP = '#343a43', HY = '#8a7a3c';
  const L: THREE.BufferGeometry[] = [];
  L.push(bx(PX - XC + .2, .1, PZ + .2, (PX + XC - .2) / 2, .05, PZ / 2 - .1, PV));                                                  // east pavement
  L.push(bx(XN - XC + .2, .1, ZW - PZ, (XN + XC - .2) / 2, .05, (PZ + ZW) / 2, PV));                                                 // north pavement
  L.push(bx(AX - XN, .06, FZ - PZ, (XN + AX) / 2, .03, (PZ + FZ) / 2, AS));                                                           // car park
  L.push(bx(PX - AX - .1, .1, FZ - PZ, (AX + .1 + PX) / 2, .05, (PZ + FZ) / 2, FP), bx(.12, .14, FZ - PZ, AX + .06, .07, (PZ + FZ) / 2, KB)); // east footpath, its kerb
  L.push(bx(AX - XN, .14, .12, (XN + AX) / 2, .07, PZ + .06, KB), bx(.12, .14, ZW - PZ, XN - .06, .07, (PZ + ZW) / 2, KB));          // kerbs along both pavements
  L.push(bx(DXE - XN, .06, ZW - FZ, (XN + DXE) / 2, .03, (FZ + ZW) / 2, AS));                                                         // service drive past the car park
  L.push(bx(SX1 - SX0 - .2, .16, ZW - FZ - 1, (SX0 + SX1) / 2, .08, (FZ + 1 + ZW) / 2, IS), bx(SX1 - SX0, .12, ZW - FZ - .8, (SX0 + SX1) / 2, .06, (FZ + 1 + ZW) / 2, KB)); // planted strip east of it
  const pl0 = OXX + 2.4, pl1 = EXX - 2.4; L.push(bx(pl1 - pl0, .16, FZ - CPZ, (pl0 + pl1) / 2, .08, (CPZ + FZ) / 2, IS), bx(pl1 - pl0 + .2, .12, FZ - CPZ + .2, (pl0 + pl1) / 2, .06, (CPZ + FZ) / 2, KB)); // planter between the lanes
  const ia0 = UC, ia1 = OXX - 3.4; L.push(bx(ia1 - ia0, .16, 2.4, (ia0 + ia1) / 2, .08, AZL + UR, IS), bx(ia1 - ia0 + .2, .12, 2.6, (ia0 + ia1) / 2, .06, AZL + UR, KB), cy(1.2, .16, ia0, .08, AZL + UR, IS, 16)); // island between the aisles
  for (let k = 0; k <= NC; k++) L.push(bx(.06, .012, 5, CX0 + k * CSW, .066, PZ + 2.5, LN));                                          // car spot lines
  for (let k = 0; k < NM; k++) L.push(bx(.06, .012, 2.6, MX0 + k * MW, .066, PZ + 1.3, LN)); L.push(bx(NM * MW, .012, .06, MX0 + NM * MW / 2, .066, PZ + 2.6, LN)); // moto spots
  for (let k = 0; k < NM; k++) L.push(bx(.5, .012, .06, motoX(k), .066, PZ + 2.3, HY));                                               // a short mark: motorcycles only
  for (const x of [6, -4, -14, -24]) arrow(L, x, AZL, 0, LN); for (const x of [-24, -16]) arrow(L, x, Z2, Math.PI, LN);             // one way: west along aisle 1, back east along aisle 2
  arrow(L, EXX, FZ - 1.9, -Math.PI / 2, LN); arrow(L, OXX, FZ - 1.6, Math.PI / 2, LN);                                                // in at the east lane, out at the west lane
  for (const x of [pl0 + 1.2, (pl0 + pl1) / 2, pl1 - 1.2]) L.push(sp(.55, x, .55, (CPZ + FZ) / 2, '#22402c'));                        // shrubs
  for (const x of [ia0 + 4, ia0 + 9]) L.push(sp(.5, x, .5, AZL + UR, '#22402c'));
  // the loading bay at the north leg's west end: an apron with a hatched box, the truck backs up to the side door
  L.push(bx(DXE - XB + 1, .06, ZA - ZW, (DXE + XB - 1) / 2, .03, (ZW + ZA) / 2, AS));
  for (const [w, d, x, z] of [[3.2, .1, XC - SD / 2, ZW + .4], [3.2, .1, XC - SD / 2, ZW + 8], [.1, 7.6, XC - SD / 2 - 1.6, ZW + 4.2], [.1, 7.6, XC - SD / 2 + 1.6, ZW + 4.2]]) L.push(bx(w, .012, d, x, .066, z, HY));
  for (let k = 0; k < 6; k++) L.push(bx(3.1, .012, .08, XC - SD / 2, .066, ZW + 1.2 + k * 1.2, HY, .5));
  g.add(mesh(merge(L), VC, false, true));

  // ── the shops: each built in its own front frame (front at z 0, facing +z, centred on x 0), then turned into place ──
  const S: THREE.BufferGeometry[] = [], RF = '#1c2129', PAR = '#2b3038', DOOR = '#151a21', FRAME = '#20252d';
  interface Slot { d: Def; ox: number; oz: number; ry: number }
  const slots: Slot[] = [];
  { let x = 12; for (const d of EAST) { slots.push({ d, ox: x - d.w / 2, oz: 0, ry: 0 }); x -= d.w; } }
  { let z = PZ; for (const d of NORTH) { slots.push({ d, ox: XC, oz: z + d.w / 2, ry: Math.PI / 2 }); z += d.w; } }
  const F = (s: Slot, fx: number, fz: number): P2 => { const c = Math.cos(s.ry), n = Math.sin(s.ry); return [s.ox + fx * c + fz * n, s.oz - fx * n + fz * c]; };
  const winAt: { s: Slot; x: number; y: number; z: number; w: number; h: number; k: number; c: THREE.Color }[] = [];
  const glassAt: number[] = []; // per slot: the first of its two door-leaf panes in winAt
  for (const s of slots) { const { d } = s, w = d.w, h = d.h, P: THREE.BufferGeometry[] = [], gl = new THREE.Color(d.glow);
    P.push(bx(w, h, SD, 0, h / 2, -SD / 2, d.wall), bx(w, .3, .14, 0, h - .15, .07, d.trim), bx(w, .14, .2, 0, .07, .1, d.trim));      // block, cornice, plinth
    P.push(bx(1.9, .08, .16, 0, 2.24, .08, FRAME));                                                                                       // the lintel with the doors' rail
    winAt.push({ s, x: 0, y: 1.1, z: .03, w: 1.7, h: 2.2, k: .45, c: gl });                                                              // the doorway: the shop's lit inside, seen while the door is open
    glassAt.push(winAt.length); winAt.push({ s, x: -LW / 2, y: 1.3, z: LZ + .03, w: .6, h: 1.6, k: .7, c: gl }, { s, x: LW / 2, y: 1.3, z: LZ + .03, w: .6, h: 1.6, k: .7, c: gl }); // the leaves' glass (moves with them)
    const nW = Math.floor((w / 2 - 1.3) / 2.25);
    for (let k = 0; k < nW; k++) for (const u of [-1, 1]) { const x = u * (2.4 + k * 2.25); P.push(bx(2.15, 1.9, .06, x, 1.4, .03, FRAME)); winAt.push({ s, x, y: 1.4, z: .07, w: 1.95, h: 1.7, k: 1, c: gl }); }
    const nA = Math.floor(w - 1); for (let k = 0; k < nA; k++) { const c = k % 2 ? STRIPE : d.awn, ax = -nA / 2 + .5 + k; P.push(bx(1, .07, .6, ax, 2.78, .3, c), bx(1, .07, .6, ax, 2.64, .85, c)); } // striped awning, sloping out
    P.push(bx(nA, .2, .04, 0, 2.52, 1.14, d.awn), bx(w - 1.2, .9, .1, 0, h - .75, .08, d.sign));                                         // awning valance, fascia board
    for (const u of [-1, 1]) P.push(bx(.22, h + .1, .16, u * w / 2, (h + .1) / 2, .02, d.trim));                                       // pilasters at the ends
    P.push(bx(w + .1, .18, SD + .1, 0, h + .09, -SD / 2, RF), bx(w + .1, .4, .14, 0, h + .3, .02, PAR), bx(w + .1, .4, .14, 0, h + .3, -SD - .02, PAR)); // roof, parapets
    for (const u of [-1, 1]) P.push(bx(.14, .4, SD + .1, u * (w / 2 + .02), h + .3, -SD / 2, PAR));
    for (const x of w > 12 ? [-w / 4, w / 4] : [w / 5]) P.push(bx(1.4, .6, 1.1, x, h + .48, -SD / 2 - .6, '#3d4450'), cy(.32, .08, x, h + .82, -SD / 2 - .6, FRAME, 12)); // roof units
    // things on the pavement by the front (z under 0.65, clear of the door), so the walkers' lanes stay free
    if (d.kind === 'bakery') P.push(bx(1.4, .08, .4, -2.6, .45, .4, '#6b5540'), bx(.08, .4, .36, -3.2, .25, .4, DOOR), bx(.08, .4, .36, -2, .25, .4, DOOR));
    if (d.kind === 'grocer') for (const u of [-1, 1]) for (let k = 0; k < 4; k++) { const x = u * 3.5 - .9 + k * .6; P.push(bx(.5, .3, .4, x, .2, .32, '#7a5a3a'), bx(.44, .06, .34, x, .37, .32, ['#d23a2a', '#e0b52c', '#4f9a3a', '#e07a2a'][k])); }
    if (d.kind === 'cafe') for (const u of [-1, 1]) { const x = u * 2.6; P.push(cy(.28, .04, x, .74, .5, '#646a72', 12), cy(.04, .72, x, .37, .5, DOOR, 6), bx(.3, .05, .3, x - .45, .45, .5, FRAME), bx(.3, .05, .3, x + .45, .45, .5, FRAME)); }
    if (d.kind === 'bikes') { P.push(bx(3.2, .05, .05, 3.4, .55, .45, '#6f767f'));
      for (let k = 0; k < 3; k++) { const x = 2.25 + k * .9; P.push(cy(.26, .04, x, .3, .3, DOOR, 10, Math.PI / 2), cy(.26, .04, x, .3, .62, DOOR, 10, Math.PI / 2), bx(.05, .05, .4, x, .5, .46, ['#c9452f', '#2f5fb0', '#e0b52c'][k])); } }
    if (d.kind === 'pharmacy') { const x = w / 2 - .9; P.push(bx(.1, .8, .8, x, 3.1, .5, '#e8efe9'), bx(.14, .5, .16, x, 3.1, .5, '#2f9a4a'), bx(.14, .16, .5, x, 3.1, .5, '#2f9a4a'), bx(.08, .08, .5, x, 3.1, .1, FRAME)); } // the green cross, out from the wall
    if (d.kind === 'florist') for (const u of [-1, 1]) for (let k = 0; k < 4; k++) { const x = u * (1.7 + k * .55); P.push(cy(.17, .3, x, .15, .38, '#4a4f57', 10), sp(.21, x, .42, .38, ['#d8456a', '#f2c14e', '#e98fb0', '#f4f1e8'][k]), sp(.12, x + .08, .52, .3, '#3f7a3a')); }
    if (d.kind === 'books') { P.push(bx(1.8, .55, .5, -2.6, .38, .38, '#5a4632'), bx(1.8, .05, .5, -2.6, .1, .38, FRAME));
      for (let k = 0; k < 9; k++) P.push(bx(.16, .26 + (k % 3) * .04, .34, -3.35 + k * .19, .78, .38, ['#7a2a2a', '#2f5fb0', '#d8c38a', '#3f6a3f', '#5a3a6a'][k % 5])); }
    if (d.kind === 'hardware') for (const u of [-1, 1]) { const x = u * 6.2; P.push(bx(1.2, .12, .55, x, .06, .36, '#7a6040'), bx(.5, .4, .45, x - .3, .32, .36, '#a8804a'), bx(.5, .3, .45, x + .32, .27, .36, '#8a9aa8'), bx(.44, .3, .4, x - .3, .67, .36, '#c0701c')); }
    const gm = merge(P); gm.rotateY(s.ry); gm.translate(s.ox, 0, s.oz); S.push(gm);
  }
  // the corner block behind the pavement corner (the north leg's store rooms) and the hardware store's side door with its shutter
  S.push(bx(SD, 4.6, PZ + SD, XC - SD / 2, 2.3, (PZ - SD) / 2, '#5c6068'), bx(SD + .1, .18, PZ + SD + .1, XC - SD / 2, 4.69, (PZ - SD) / 2, RF), bx(SD + .1, .4, .14, XC - SD / 2, 4.9, PZ + .02, PAR), bx(.14, .4, PZ + SD, XC + .02, 4.9, (PZ - SD) / 2, PAR));
  S.push(bx(3, 3, .08, XC - SD / 2, 1.5, ZW + .04, '#4a4f57'), bx(3.3, .3, .2, XC - SD / 2, 3.15, ZW + .1, FRAME));
  for (let k = 1; k < 10; k++) S.push(bx(3, .03, .03, XC - SD / 2, k * .3, ZW + .09, '#3a3f47'));
  for (const x of [pl0 + .4, pl1 - .4]) S.push(cy(.06, 3.6, x, 1.8, CPZ + .5, PAR, 8), bx(.5, .1, .25, x, 3.6, CPZ + .5, PAR), sp(.13, x, 3.5, CPZ + .5, '#ffd9a0')); // car park lamps
  for (const x of [ia0 + 2, ia1 - 1]) S.push(cy(.06, 3.6, x, 1.8, AZL + UR, PAR, 8), bx(.25, .1, .5, x, 3.6, AZL + UR, PAR), sp(.13, x, 3.5, AZL + UR, '#ffd9a0'));
  const SXC = (SX0 + SX1) / 2, BNX = SX1 - .4;
  for (let z = FZ + 4; z < ZW - 2; z += 8) S.push(cy(.12, 1.6, SXC, .8, z, '#3a2f26', 8), sp(1.1, SXC, 2.3, z, '#24452f'));               // trees on the planted strip
  for (let z = FZ + 8; z < ZW - 4; z += 16) S.push(bx(.4, .08, 1.5, BNX, .45, z, '#6b5540'), bx(.36, .4, .08, BNX, .25, z - .6, DOOR), bx(.36, .4, .08, BNX, .25, z + .6, DOOR)); // benches on the strip's far side
  g.add(mesh(merge(S), VC));

  // ── lit windows: one instance per pane, coloured from dark to the shop's own warm light (like the office windows) ──
  const panes = winAt;
  const WIN = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial(), panes.length), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3(), tc = new THREE.Color(), tc2 = new THREE.Color(), UP = new THREE.Vector3(0, 1, 0);
  panes.forEach((w, i) => { const [x, z] = F(w.s, w.x, w.z); m4.compose(v.set(x, w.y, z), q.setFromAxisAngle(UP, w.s.ry), sc.set(w.w, w.h, 1)); WIN.setMatrixAt(i, m4); WIN.setColorAt(i, DARKW); }); g.add(WIN);
  function setLit(level: number) { const k = Math.max(0, level); panes.forEach((w, i) => WIN.setColorAt(i, tc.copy(DARKW).lerp(tc2.copy(w.c).multiplyScalar(.75 * w.k * Math.max(1, k)), Math.min(1, k)))); WIN.instanceColor!.needsUpdate = true; }

  // ── the sliding doors: two leaves each, in front of the doorway; they slide apart while someone goes in or comes out ──
  const leafGeo = [-1, 1].map(u => merge([bx(LW, 2.2, .05, 0, 1.1, 0, DOOR), bx(.06, 2.2, .06, -u * (LW / 2 - .03), 1.1, 0, FRAME), bx(LW, .06, .06, 0, .03, 0, FRAME)])); // leaf, its meeting edge, foot rail
  const leaves = slots.map(s => leafGeo.map(geo => { const m = mesh(geo, VC); m.rotation.y = s.ry; g.add(m); return m; }));
  const dk = slots.map(() => 0), dw = slots.map(() => 0); // how far open, how long it stays wanted open
  function placeDoor(i: number) { const s = slots[i], e = dk[i] * dk[i] * (3 - 2 * dk[i]);
    [-1, 1].forEach((u, j) => { const x = u * (LW / 2 + SLIDE * e), [lx, lz] = F(s, x, LZ), [gx, gz] = F(s, x, LZ + .03), w = winAt[glassAt[i] + j]; leaves[i][j].position.set(lx, 0, lz);
      m4.compose(v.set(gx, w.y, gz), q.setFromAxisAngle(UP, s.ry), sc.set(w.w, w.h, 1)); WIN.setMatrixAt(glassAt[i] + j, m4); });
    WIN.instanceMatrix.needsUpdate = true; }
  slots.forEach((_, i) => placeDoor(i));
  const openDoor = (i: number) => { if (i >= 0 && i < dw.length) dw[i] = .5; };
  const doorOpen = (i: number) => dk[i] || 0;
  function frameDoors(dt: number) { for (let i = 0; i < dk.length; i++) { if (dw[i] > 0) dw[i] -= dt; const t = dw[i] > 0 ? 1 : 0; if (dk[i] === t) continue;
    dk[i] = t ? Math.min(1, dk[i] + dt * OPENS) : Math.max(0, dk[i] - dt * OPENS); placeDoor(i); } }

  // ── signs: a canvas each, like the police station's ──
  const signs = slots.map(s => { const d = s.d, sw = d.w - 1.6, ch = 80, cw = Math.min(2048, Math.round(ch * sw / .74));
    const c = document.createElement('canvas'); c.width = cw; c.height = ch; const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    const draw = () => { const x = c.getContext('2d')!; x.fillStyle = d.sign; x.fillRect(0, 0, cw, ch); x.font = `800 54px ${FONT}`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = d.ink; x.fillText(d.name.split('').join(' '), cw / 2, 43); t.needsUpdate = true; };
    draw(); void document.fonts?.ready.then(draw);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(sw, .74), new THREE.MeshBasicMaterial({ map: t })); const [x, z] = F(s, 0, .14); m.position.set(x, d.h - .75, z); m.rotation.y = s.ry; g.add(m); return { t, m };
  });

  // ── the data the road network, the shoppers and the visitors need ──
  const cars: ShopSpot[] = [], motos: ShopSpot[] = [];
  for (let i = 0; i < NC; i++) { const x = carX(i); cars.push({ i, kind: 'car', pose: bothP(x, CZ, Math.PI), walk: bothL([[x - .95, CZ], [x - CSW / 2, CZ], [x - CSW / 2, WZ]]) }); } // nose to the shops; the driver gets out on the left (-x) and walks up the gap between cars
  for (let i = 0; i < NM; i++) { const x = motoX(i); motos.push({ i, kind: 'moto', pose: bothP(x, MZ, Math.PI), walk: bothL([[x - .7, MZ], [x - .7, WZ]]) }); }
  const doors: ShopDoor[] = slots.map(s => ({ kind: s.d.kind, name: s.d.name, door: both2(F(s, 0, .35)), inside: both2(F(s, 0, -.7)), front: both2(F(s, 0, WZ)), face: s.ry }));
  const turn: P2[] = Array.from({ length: 9 }, (_, i): P2 => { const t = -Math.PI / 2 - Math.PI * i / 8; return [UC + UR * Math.cos(t), AZL + UR + UR * Math.sin(t)]; });
  const shops: Shops = { group: g, origin: { ...origin }, cars, motos, doors,
    entry: bothP(EXX, FZ, Math.PI), exit: bothP(OXX, FZ, 0),
    lane: bothL([[EXX, FZ], [EXX, AZL + 1.5], [EXX - 1.5, AZL], ...turn, [OXX - 1.5, Z2], [OXX, Z2 + 1.5], [OXX, FZ]]),
    loading: bothP(BX, BZ, 0),
    service: {
      up: bothL([[EXX, FZ], [EXX, AZL + 1.5], [EXX - 1.5, AZL], ...turn.slice(0, 5), [DX, ZT - TR], ...arcP(DX - TR, ZT - TR, TR, 0, Math.PI / 2).slice(1), [BW, ZT]]),
      back: bothL([[BW, ZT], ...arcP(BW, ZT - TR, TR, Math.PI / 2, 0).slice(1), [BX, BZ]]),
      away: bothL([[BX, BZ], ...arcP(BX + TR, ZT - TR, TR, Math.PI, Math.PI / 2), ...arcP(DX - TR, ZT - TR, TR, Math.PI / 2, 0), ...arcP(UC, FZ - .5, UR, Math.PI, 1.5 * Math.PI)]),
    },
    crates: [BX + 2.4, ZW + .9],
    paths: { pavement: bothL([[PX - .6, WZ], [XW, WZ], [XW, ZW - .6]]), west: bothL([[XW, ZW - 4], [XW, ZW - .6]]), east: bothL([[PX - .6, WZ], [PX - .65, FZ]]) },
    toWorld, setLit, openDoor, doorOpen, frameDoors,
    dispose() { scene.remove(g); g.traverse(o => { if (o instanceof THREE.Mesh) { o.geometry.dispose(); (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => { if (m !== VC) m.dispose(); }); } }); for (const s of signs) s.t.dispose(); } };
  return shops;
}
