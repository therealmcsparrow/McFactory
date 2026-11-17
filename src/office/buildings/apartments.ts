// The apartment complex where the agents live: three residential blocks round a courtyard (Elm House on the street, 5 floors;
// Oak House at the back, 6 floors; Ash House on the west side, 4 floors), each with balconies and a front entrance under a
// canopy, a courtyard with grass, trees, benches, a sandbox and paths, hedges and green strips by the buildings, a pavement
// along the street front and its own car park (16 car spots, 6 motorcycle spots; no garage). makeApartments builds it at any
// origin and rotation and returns where the spots, doors, footpaths and the car park entry and exit are, and setHome(n) lights
// n windows (people at home) in a scattered but stable order. Nothing in it moves. index.ts builds it at HOME_SITE, behind
// (north of) the bank and the park, facing its own road (roads.ts: east off the avenue on row -2's line, along the front).
//
// Local frame (before origin.rot): the street runs along x beyond the front edge z = 0; everything stands at z < 0.
//   z -3..0 pavement (walking line z = -1.5) along the whole front, x -38..31.5.
//   x -38..9.4  the homes: Elm House x -22..2, z -16..-7 (door on the street side, x = -10); Ash House x -36..-27, z -38..-9
//               (door on its east face, z = -20.1); Oak House x -22..2, z -44..-35 (door on its courtyard face, x = -10).
//               The courtyard lies between them (x -27..9.4, z -35..-16); its main path runs along z = -20.1, a path from the
//               pavement comes in between Ash and Elm (x = -24.5), a branch goes to Oak's door (x = -10).
//   x 9.4..11.6 a footpath from the pavement along the car park (x = 10.5); where it meets the courtyard path is the hub.
//   x 11.7..29.1 the car park, one way: in at x 27.3 (east), back to the cross lane at z -34.6, out at x 13.5 (west).
//               Car spots in two rows between the lanes (west row x 15.3..19.7, nose to +x; east row x 21.1..25.5, nose to -x)
//               with a raised walkway between them (x = 20.4); the west row has a gap at z = -20.1 and a zebra over the out lane
//               leads from it to the hub. Motorcycle spots in the front apron (z -3.2..-5.6, nose to the pavement), reached by a
//               short one-way aisle (z = -7.3) from the in lane to the out lane.
import * as THREE from 'three';
import { hashf } from '../../common/math.js';
import type { P2 } from '../../common/types.js';
import type { OSAtBank } from '../state.js';

/** What makeApartments needs from OS (all there once makeProps has run). */
export type ApartmentsOS = Pick<OSAtBank, 'bx' | 'cy' | 'sp' | 'merge' | 'mesh' | 'VC' | 'arrow' | 'FONT' | 'DARKW' | 'ctx'>;
/** A position with a heading (rot: rotation.y, 0 = facing +z, the same as a vehicle's rot). */
export interface Pose { x: number; z: number; rot: number }
/** The same thing in the complex's own frame and in the world. */
export interface Both<T> { local: T; world: T }
export type HomeBlock = 'elm' | 'oak' | 'ash';
/** A parking spot. walk: from beside the parked vehicle (the driver's or rider's side) to the door of its home block (door);
 *  toHub: the first part of it, from beside the vehicle to the hub where the car park footpath meets the courtyard path. */
export interface HomeSpot { i: number; kind: 'car' | 'moto'; pose: Both<Pose>; door: number; walk: Both<P2[]>; toHub: Both<P2[]> }
/** A block's front entrance. door: on the step inside the canopy; front: in front of the canopy, where the walk arrives.
 *  fromPavement: from the pavement walking line to the door; fromParking: from the hub to the door. */
export interface HomeDoor { i: number; block: HomeBlock; name: string; floors: number; door: Both<P2>; front: Both<P2>; fromPavement: Both<P2[]>; fromParking: Both<P2[]> }
export interface Apartments {
  group: THREE.Group; origin: Pose;
  cars: HomeSpot[]; motos: HomeSpot[]; doors: HomeDoor[];
  hub: Both<P2>;                        // where the car park footpath meets the courtyard path (every toHub ends here, every fromParking starts here)
  entry: Both<Pose>; exit: Both<Pose>;  // where a vehicle enters (heading in) and leaves (heading out) at the front edge
  lane: Both<P2[]>;                     // the one-way drive for cars: entry, up the in lane, the cross lane (westward), down the out lane, exit
  motoLane: Both<P2[]>;                 // the short one-way drive for motorcycles: entry, the front aisle (westward) past the motorcycle spots, exit
  paths: { pavement: Both<P2[]>; footpath: Both<P2[]>; walkway: Both<P2[]> }; // the pavement walking line; the car park footpath (pavement to hub); the walkway between the spot rows
  walkTo: (spot: HomeSpot, door: number) => Both<P2[]>; // from beside a parked vehicle to any door
  windows: number;                      // how many windows there are (setHome lights at most this many)
  setHome: (n: number) => void;         // light n windows (people at home), the same windows for the same n, scattered over the blocks
  winMesh: THREE.InstancedMesh;         // the window panes (instances 0..windows-1) and the entrance glass after them, for picking
  isLit: (i: number) => boolean;        // window i is lit now (someone is home)
  windowAt: (i: number) => { x: number; y: number; z: number; nx: number; nz: number }; // window i's centre in the world and the way it faces
  toWorld: (x: number, z: number) => P2;
  dispose: () => void;
}

// ── layout (local frame) ──
const FH = 2.6, WY = 1.35, WW = 1, WH = 1.3, COL = 2;                       // floor height, window centre above its floor, window size, window pitch
const WZ = -1.5, PVZ = -3, X0 = -38, X1 = 31.5, Z1 = -47;                    // pavement walking line, pavement back edge, site west, east and back edge
const OXX = 13.5, IXX = 27.3, LHW = 1.8, AX0 = OXX - LHW, AX1 = IXX + LHW;  // out lane, in lane, lane half width, car park asphalt
const SPD = 4.4, CSW = 2.4, WX = 20.4, WWH = .7;                             // spot depth, spot width, walkway centre and half width
const WCX = WX - WWH - SPD / 2, ECX = WX + WWH + SPD / 2;                    // west and east row spot centres (x)
const SZ0 = -9, ZP = -20.1, GAP = 3, XLZ = -34.6, AZB = XLZ - LHW;           // first spot front edge, courtyard path / zebra z, the gap in the west row, cross lane, car park back
const MW = 1.4, MZ = -4.4, MAZ = -7.3, FPX = 10.5, FP0 = 9.4, FP1 = 11.6;    // moto spot width, moto spot centre z, moto aisle, footpath centre and edges
const CPX = -24.5;                                                            // the path between Ash and Elm, from the pavement into the courtyard
const westZ = (i: number) => i < 4 ? SZ0 - CSW * (i + .5) : SZ0 - 4 * CSW - GAP - CSW * (i - 4 + .5); // 4 spots, the gap, 4 spots
const eastZ = (i: number) => SZ0 - CSW * (i + .5);                                                     // 8 spots in a row
const motoX = (i: number) => WX - 3 * MW + MW * (i + .5);
/** Where the complex stands in the office scene: local x -38..31.5, z -47..0 → world x 14..83.5, z -100.9..-53.9, the front
 *  facing +z onto the apartments road (centre line z = -47.4, row -2's street line, roads.ts), behind the bank and the park. */
export const HOME_SITE: Pose = { x: 52, z: -53.9, rot: 0 };
/** The site's local extent (front edge z = 0). */
export const HOME_BOX = { X0, X1, Z1 } as const;
/** The car park's lane layout (local frame), for the vehicles that will drive in it. */
export const HOME_LOT = { OXX, IXX, LHW, XLZ, MAZ, MZ, SPD, CSW, MW, WX, WCX, ECX, ZP } as const;

type Face = 's' | 'n' | 'e' | 'w';                                            // s: +z (towards the street), n: -z, e: +x, w: -x
interface BlockDef { block: HomeBlock; name: string; x0: number; x1: number; z0: number; z1: number; floors: number; wall: string; band: string; door: { face: Face; at: number }; balc: Face[] }
const BLOCKS: BlockDef[] = [
  { block: 'elm', name: 'ELM HOUSE', x0: -22, x1: 2, z0: -16, z1: -7, floors: 5, wall: '#7a6f63', band: '#5c534a', door: { face: 's', at: -10 }, balc: ['s', 'n'] },
  { block: 'oak', name: 'OAK HOUSE', x0: -22, x1: 2, z0: -44, z1: -35, floors: 6, wall: '#5f6874', band: '#474e58', door: { face: 's', at: -10 }, balc: ['s'] },
  { block: 'ash', name: 'ASH HOUSE', x0: -36, x1: -27, z0: -38, z1: -9, floors: 4, wall: '#7d6a5a', band: '#5d4f43', door: { face: 'e', at: ZP }, balc: ['e', 's'] },
];
const RY: Record<Face, number> = { s: 0, n: Math.PI, e: Math.PI / 2, w: -Math.PI / 2 };

export function makeApartments(OS: ApartmentsOS, origin: Pose): Apartments {
  const { bx, cy, sp, merge, mesh, VC, arrow, FONT, DARKW } = OS;
  const { scene } = OS.ctx;
  const g = new THREE.Group(); g.position.set(origin.x, 0, origin.z); g.rotation.y = origin.rot; scene.add(g);
  const cs = Math.cos(origin.rot), sn = Math.sin(origin.rot);
  const toWorld = (x: number, z: number): P2 => [origin.x + x * cs + z * sn, origin.z - x * sn + z * cs];
  const both2 = (p: P2): Both<P2> => ({ local: p, world: toWorld(p[0], p[1]) });
  const bothL = (P: P2[]): Both<P2[]> => ({ local: P, world: P.map(p => toWorld(p[0], p[1])) });
  const bothP = (x: number, z: number, rot: number): Both<Pose> => { const [wx, wz] = toWorld(x, z); return { local: { x, z, rot }, world: { x: wx, z: wz, rot: rot + origin.rot } }; };

  // ── ground: grass, pavement, paths, car park, paint (no shadows cast) ──
  const GR = '#1d3024', GR2 = '#22382a', PV = '#3b414b', KB = '#59606c', FP = '#3a3f47', AS = '#1f242d', LN = '#4d5460', ZB = '#8d939c';
  const L: THREE.BufferGeometry[] = [];
  L.push(bx(X1 - X0, .04, PVZ - Z1, (X0 + X1) / 2, .02, (PVZ + Z1) / 2, GR));                                           // the whole site: grass
  L.push(bx(FP0 + 27, .02, 19, (-27 + FP0) / 2, .05, -25.5, GR2));                                               // the courtyard lawn, a shade lighter
  L.push(bx(X1 - X0, .1, -PVZ, (X0 + X1) / 2, .05, PVZ / 2, PV), bx(X1 - X0, .14, .12, (X0 + X1) / 2, .07, -.06, KB));   // pavement, street kerb
  L.push(bx(AX1 - AX0, .06, PVZ - AZB, (AX0 + AX1) / 2, .03, (PVZ + AZB) / 2, AS));                                    // car park
  for (const x of [OXX, IXX]) L.push(bx(LHW * 2, .03, -PVZ, x, .105, PVZ / 2, AS));                                       // driveways over the pavement (dropped kerb)
  L.push(bx(IXX - OXX - LHW * 2, .14, .12, (OXX + IXX) / 2, .07, PVZ - .06, KB));                                       // kerb between the motorcycle spots and the pavement
  for (const x of [AX0 - .06, AX1 + .06]) L.push(bx(.12, .14, PVZ - AZB, x, .07, (PVZ + AZB) / 2, KB));                 // car park side kerbs
  L.push(bx(AX1 - AX0 + .24, .14, .12, (AX0 + AX1) / 2, .07, AZB - .06, KB));                                          // back kerb
  L.push(bx(WWH * 2, .12, SZ0 - XLZ - LHW, WX, .06, (SZ0 + XLZ + LHW) / 2, FP), bx(WWH * 2 + .1, .1, SZ0 - XLZ - LHW + .1, WX, .05, (SZ0 + XLZ + LHW) / 2, KB)); // walkway between the rows
  L.push(bx(FP1 - FP0, .1, PVZ - AZB, FPX, .05, (PVZ + AZB) / 2, FP));                                                 // car park footpath
  L.push(bx(FP0 + 27, .08, 1.6, (FP0 - 27) / 2, .06, ZP, FP));                                                         // courtyard main path
  L.push(bx(1.6, .08, ZP - PVZ, CPX, .06, (ZP + PVZ) / 2, FP));                                                        // path from the pavement between Ash and Elm
  L.push(bx(1.6, .08, ZP + 35, -10, .06, (ZP - 35) / 2, FP), bx(1.6, .08, 4, -10, .06, -5, FP));                     // to Oak's door; Elm's front path
  L.push(bx(1.6, .08, 1.2, -26.2 - 0, .06, ZP, FP));                                                                   // Ash's step apron
  for (let k = 0; k < 6; k++) L.push(bx(.36, .012, 3.4, AX0 + .4 + k * .6, .066, ZP, ZB));                            // zebra over the out lane
  L.push(bx(SPD, .012, GAP - .3, WCX, .066, ZP, '#2a3038'));                                                           // the gap in the west row: a paved strip, no spot
  // spot lines: west row (with the gap), east row, motorcycle spots
  const wLines = [SZ0, SZ0 - CSW, SZ0 - 2 * CSW, SZ0 - 3 * CSW, SZ0 - 4 * CSW, SZ0 - 4 * CSW - GAP, SZ0 - 5 * CSW - GAP, SZ0 - 6 * CSW - GAP, SZ0 - 7 * CSW - GAP, SZ0 - 8 * CSW - GAP];
  for (const z of wLines) L.push(bx(SPD, .012, .06, WCX, .066, z, LN));
  for (let k = 0; k <= 8; k++) L.push(bx(SPD, .012, .06, ECX, .066, SZ0 - k * CSW, LN));
  for (let k = 0; k <= 6; k++) L.push(bx(.06, .012, 2.4, WX - 3 * MW + k * MW, .066, MZ, LN));
  L.push(bx(6 * MW, .012, .06, WX, .066, MZ - 1.2, LN)); for (let k = 0; k < 6; k++) L.push(bx(.5, .012, .06, motoX(k), .066, MZ - .9, '#8a7a3c')); // motorcycles only
  // one way: in at the east, along the cross lane, out at the west; the moto aisle westward
  arrow(L, IXX, -14, -Math.PI / 2, LN); arrow(L, IXX, -26, -Math.PI / 2, LN); arrow(L, WX + 3, XLZ, 0, LN); arrow(L, WX - 3, XLZ, 0, LN);
  arrow(L, OXX, -28, Math.PI / 2, LN); arrow(L, OXX, -12, Math.PI / 2, LN); arrow(L, WX, MAZ, 0, LN);
  g.add(mesh(merge(L), VC, false, true));

  // ── the blocks: walls, floor bands, roof, balconies, entrance with canopy; window places ──
  const S: THREE.BufferGeometry[] = [], RF = '#1c2129', RAIL = '#30363f', SLAB = '#8b8478', DOOR = '#151a21', FRAME = '#262b33';
  const winAt: { x: number; y: number; z: number; ry: number }[] = [];
  const doorAt: { x: number; y: number; z: number; ry: number }[] = [];
  BLOCKS.forEach(b => {
    const W = b.x1 - b.x0, D = b.z1 - b.z0, cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2, H = b.floors * FH;
    S.push(bx(W, H, D, cx, H / 2, cz, b.wall), bx(W + .12, .4, D + .12, cx, .2, cz, b.band));                           // block, plinth
    for (let f = 1; f < b.floors; f++) S.push(bx(W + .1, .14, D + .1, cx, f * FH, cz, b.band));                         // floor bands
    S.push(bx(W + .2, .18, D + .2, cx, H + .09, cz, RF));                                                               // roof
    for (const s of [-1, 1]) S.push(bx(W + .2, .45, .14, cx, H + .4, cz + s * (D / 2 + .03), b.band), bx(.14, .45, D + .2, cx + s * (W / 2 + .03), H + .4, cz, b.band)); // parapet
    S.push(bx(3, 1.3, 2.6, cx - W * .22, H + .65, cz, '#3d4450'), bx(1.4, .6, 1.2, cx + W * .25, H + .45, cz - D * .15, '#3d4450'), cy(.28, .1, cx + W * .25, H + .8, cz - D * .15, '#20252d', 12)); // stair housing, roof unit
    // a point on a face: u along it, d out from it
    const on = (f: Face, u: number, d: number): P2 => f === 's' ? [u, b.z1 + d] : f === 'n' ? [u, b.z0 - d] : f === 'e' ? [b.x1 + d, u] : [b.x0 - d, u];
    const fbx = (f: Face, w: number, h: number, dd: number, u: number, d: number, y: number, c: string) => { const [x, z] = on(f, u, d); return f === 's' || f === 'n' ? bx(w, h, dd, x, y, z, c) : bx(dd, h, w, x, y, z, c); };
    for (const f of ['s', 'n', 'e', 'w'] as Face[]) {
      const a0 = f === 's' || f === 'n' ? b.x0 : b.z0, a1 = f === 's' || f === 'n' ? b.x1 : b.z1, n = Math.floor((a1 - a0 - 1.2) / COL), m = (a0 + a1) / 2;
      for (let j = 0; j < n; j++) { const u = m + (j - (n - 1) / 2) * COL, isDoor = f === b.door.face && Math.abs(u - b.door.at) < 1.7;
        for (let fl = 0; fl < b.floors; fl++) {
          if (fl === 0 && isDoor) continue;
          const y = fl * FH + WY, [x, z] = on(f, u, .07); winAt.push({ x, y, z, ry: RY[f] }); S.push(fbx(f, WW + .16, WH + .16, .06, u, .02, y, FRAME));
          if (fl > 0 && b.balc.includes(f) && j % 2 === 1 && !(isDoor && fl === 1)) {                                    // a balcony: slab, railing front and sides
            const y0 = fl * FH + .05; S.push(fbx(f, 1.7, .1, .8, u, .4, y0, SLAB), fbx(f, 1.7, .5, .05, u, .78, y0 + .3, RAIL));
            for (const s of [-1, 1]) S.push(fbx(f, .05, .5, .8, u + s * .83, .4, y0 + .3, RAIL));
          }
        }
      }
    }
    // entrance: door, glass beside it, canopy on two posts, step, a lamp each side; the sign above the canopy (canvas, below)
    const f = b.door.face, u = b.door.at;
    S.push(fbx(f, 1.3, 2.05, .08, u, .04, 1.03, DOOR), fbx(f, 1.5, .1, .1, u, .05, 2.1, FRAME), fbx(f, 1.8, .1, 1.1, u, .5, .05, '#4a505a')); // door, lintel, step
    doorAt.push(...[-1, 1].map(s => { const [x, z] = on(f, u + s * .32, .1); return { x, y: 1.2, z, ry: RY[f] }; }));
    S.push(fbx(f, 3.2, .14, 1.7, u, .85, 2.4, '#2b3038'), fbx(f, 3.2, .22, .06, u, 1.7, 2.34, b.band));                // canopy, its fascia
    for (const s of [-1, 1]) S.push(fbx(f, .1, 2.35, .1, u + s * 1.5, 1.6, 1.18, RAIL));                                 // posts
    for (const s of [-1, 1]) { const [x, z] = on(f, u + s * 1.15, .12); S.push(sp(.1, x, 1.9, z, '#ffd9a0')); }           // wall lamps
    // hedges along the faces without the door, a green strip in front (gaps for the paths kept by leaving the door face alone)
    for (const hf of ['s', 'n', 'e', 'w'] as Face[]) if (hf !== f) { const a0 = hf === 's' || hf === 'n' ? b.x0 : b.z0, a1 = hf === 's' || hf === 'n' ? b.x1 : b.z1; S.push(fbx(hf, a1 - a0 - .6, .55, .55, (a0 + a1) / 2, .55, .3, '#1e3a26')); }
  });
  // hedges: along the pavement (gaps for the paths), the east edge, the back edge, beside the footpath (gap at the courtyard path)
  const H = '#1d3a26', hedge = (x0: number, x1: number, z0: number, z1: number) => S.push(bx(Math.max(.6, Math.abs(x1 - x0)), .8, Math.max(.6, Math.abs(z1 - z0)), (x0 + x1) / 2, .4, (z0 + z1) / 2, H));
  hedge(X0 + .3, CPX - 1.2, PVZ - .7, PVZ - .1); hedge(CPX + 1.2, -11, PVZ - .7, PVZ - .1); hedge(-9, FP0 - .3, PVZ - .7, PVZ - .1);
  hedge(X1 - .9, X1 - .3, PVZ - .6, Z1 + .8); hedge(X0 + .3, X1 - .3, Z1 + .2, Z1 + .8); hedge(X0 + .2, X0 + .8, Z1 + .8, PVZ - .7);
  hedge(FP0 - .7, FP0 - .1, PVZ - .7, ZP + 1); hedge(FP0 - .7, FP0 - .1, ZP - 1, AZB);
  // trees: trunk and two crowns each
  const tree = (x: number, z: number, s = 1) => S.push(cy(.12 * s, 1.4 * s, x, .7 * s, z, '#4a3526', 6), sp(.95 * s, x, 2.1 * s, z, '#24452c'), sp(.62 * s, x + .3 * s, 2.75 * s, z - .2 * s, '#2b5234'));
  for (const [x, z, s] of [[-18, -26, 1.1], [-3, -30.5, 1], [5, -25, .9], [-21, -31.5, .9], [3, -17.8, .8], [-14, -17.8, .8], [-32, -5.5, 1], [-36.5, -42, .9], [-30, -44.5, .9], [6, -42, 1], [16, -41.5, 1], [24, -41.5, 1.1], [30.2, -40, .9], [-5, -5, .7], [5, -5, .7], [-17, -5, .7]] as [number, number, number][]) tree(x, z, s);
  // benches along the courtyard path, a sandbox, lamps (courtyard and car park)
  const bench = (x: number, z: number, ry: number) => { const k = Math.cos(ry), s = Math.sin(ry), at = (dx: number, dz: number): [number, number] => [x + dx * k + dz * s, z - dx * s + dz * k];
    let p = at(0, 0); S.push(bx(1.4, .07, .42, p[0], .44, p[1], '#6b5540', ry)); p = at(0, -.2); S.push(bx(1.4, .32, .06, p[0], .7, p[1], '#6b5540', ry));
    for (const d of [-.6, .6]) { p = at(d, 0); S.push(bx(.07, .42, .4, p[0], .21, p[1], DOOR, ry)); } };
  for (const x of [-20, -4, 3]) bench(x, ZP - 1.3, 0); for (const x of [-16, 0]) bench(x, ZP + 1.3, Math.PI);
  S.push(bx(3.4, .22, 3.4, -18, .11, -30.5, '#5a4a36'), bx(3, .06, 3, -18, .2, -30.5, '#a8925e'), bx(.5, .3, .5, -17.3, .35, -29.8, '#c9452f'));
  const lamp = (x: number, z: number, h = 3.2) => S.push(cy(.06, h, x, h / 2, z, '#2b3038', 8), sp(.16, x, h, z, '#ffd9a0'));
  for (const [x, z] of [[-23.3, -12], [-23.3, ZP - 1.2], [-8.8, -28], [6, ZP - 1.2], [8.2, -30], [8.2, -8], [30.3, -12], [30.3, -26], [WX, AZB - 1.2]] as P2[]) lamp(x, z);
  g.add(mesh(merge(S), VC));

  // ── windows: one instance per pane, dark until setHome lights them; a scattered but fixed order ──
  const NW = winAt.length, WIN = new THREE.InstancedMesh(new THREE.PlaneGeometry(WW, WH), new THREE.MeshBasicMaterial(), NW + doorAt.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1), YA = new THREE.Vector3(0, 1, 0), tc = new THREE.Color();
  winAt.forEach((w, i) => { m4.compose(v.set(w.x, w.y, w.z), q.setFromAxisAngle(YA, w.ry), one); WIN.setMatrixAt(i, m4); WIN.setColorAt(i, DARKW); });
  const hall = new THREE.Color('#ffd9a0').multiplyScalar(.55);                                                         // the entrance glass: always lit (the hall light)
  doorAt.forEach((w, i) => { m4.compose(v.set(w.x, w.y, w.z), q.setFromAxisAngle(YA, w.ry), new THREE.Vector3(.42 / WW, 1.5 / WH, 1)); WIN.setMatrixAt(NW + i, m4); WIN.setColorAt(NW + i, hall); });
  g.add(WIN);
  const rank = [...Array(NW).keys()].sort((a, b) => hashf('home', a) - hashf('home', b));
  const LITC = ['#ffd59a', '#ffe2b8', '#f5c07a', '#ffd59a', '#ffcf8a', '#a9c4ff'];                                    // mostly warm; now and then a TV's blue
  const litOf = rank.map(i => new THREE.Color(LITC[Math.floor(hashf('homec', i) * LITC.length)]).multiplyScalar(1 + .5 * hashf('homek', i))); // bright like the office windows
  let shown = -1;
  function setHome(n: number) { const k = Math.max(0, Math.min(NW, Math.round(n))); if (k === shown) return; shown = k;
    rank.forEach((w, r) => WIN.setColorAt(w, r < k ? litOf[r] : tc.copy(DARKW))); WIN.instanceColor!.needsUpdate = true; }
  setHome(0);
  const rankOf: number[] = []; rank.forEach((w, r) => { rankOf[w] = r; });
  const isLit = (i: number) => i >= 0 && i < NW && rankOf[i] < shown;
  const wm = new THREE.Matrix4(), wp = new THREE.Vector3(), wn = new THREE.Vector3();
  const windowAt = (i: number) => { WIN.updateWorldMatrix(true, false); WIN.getMatrixAt(i, wm); wm.premultiply(WIN.matrixWorld);  // the pane's centre and outward normal in the world
    wp.setFromMatrixPosition(wm); wn.set(0, 0, 1).transformDirection(wm); return { x: wp.x, y: wp.y, z: wp.z, nx: wn.x, nz: wn.z }; };

  // ── signs over the canopies: a canvas each, like the police station's ──
  const signs = BLOCKS.map(b => {
    const c = document.createElement('canvas'); c.width = 384; c.height = 64; const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    const draw = () => { const x = c.getContext('2d')!; x.fillStyle = '#1c2129'; x.fillRect(0, 0, 384, 64); x.font = `800 40px ${FONT}`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = '#efe6d6'; x.fillText(b.name.split('').join(' '), 192, 35); t.needsUpdate = true; };
    draw(); void document.fonts?.ready.then(draw);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(2.7, .45), new THREE.MeshBasicMaterial({ map: t })), f = b.door.face, u = b.door.at;
    if (f === 's') m.position.set(u, 2.85, b.z1 + .04); else if (f === 'e') m.position.set(b.x1 + .04, 2.85, u); else if (f === 'n') m.position.set(u, 2.85, b.z0 - .04); else m.position.set(b.x0 - .04, 2.85, u);
    m.rotation.y = RY[f]; g.add(m); return t;
  });

  // ── the data the road network and the residents will need ──
  const HUB: P2 = [FPX, ZP];
  const elmF: P2 = [-10, -5.4], elmD: P2 = [-10, -6.65], oakF: P2 = [-10, -33.8], oakD: P2 = [-10, -34.65], ashF: P2 = [-25.4, ZP], ashD: P2 = [-26.65, ZP];
  const doorPaths: { f: P2; d: P2; pav: P2[]; park: P2[] }[] = [
    { f: elmF, d: elmD, pav: [[-10, WZ], elmF, elmD], park: [HUB, [FPX, WZ], [-10, WZ], elmF, elmD] },
    { f: oakF, d: oakD, pav: [[CPX, WZ], [CPX, ZP], [-10, ZP], oakF, oakD], park: [HUB, [-10, ZP], oakF, oakD] },
    { f: ashF, d: ashD, pav: [[CPX, WZ], [CPX, ZP], ashF, ashD], park: [HUB, [CPX, ZP], ashF, ashD] },
  ];
  const doors: HomeDoor[] = BLOCKS.map((b, i) => ({ i, block: b.block, name: b.name, floors: b.floors, door: both2(doorPaths[i].d), front: both2(doorPaths[i].f), fromPavement: bothL(doorPaths[i].pav), fromParking: bothL(doorPaths[i].park) }));
  // join a spot's way to the hub with a door's way from it, cutting out any stretch walked there and back (a rider who came along the pavement goes straight on to Elm)
  const same = (a: P2, b: P2) => Math.abs(a[0] - b[0]) < 1e-6 && Math.abs(a[1] - b[1]) < 1e-6;
  const join = (A: P2[], B: P2[]): P2[] => { const P = [...A, ...B], out: P2[] = [];
    for (let i = 0; i < P.length; i++) { let j = P.length - 1; while (j > i && !same(P[j], P[i])) j--; out.push(P[i]); i = j; } return out; };
  const cars: HomeSpot[] = [], motos: HomeSpot[] = [];
  const spot = (i: number, kind: 'car' | 'moto', pose: Both<Pose>, hub: P2[], door: number): HomeSpot => ({ i, kind, pose, door, toHub: bothL(hub), walk: bothL(join(hub, doorPaths[door].park)) });
  // west row: nose to +x, the driver gets out on the left (-z) into the gap and walks to the walkway; east row: nose to -x, out on the left (+z)
  for (let i = 0; i < 8; i++) { const z = westZ(i), x = WCX; cars.push(spot(i, 'car', bothP(x, z, Math.PI / 2), [[x + .2, z - .95], [x + .2, z - CSW / 2], [WX, z - CSW / 2], [WX, ZP], HUB], i % 3)); }
  for (let i = 0; i < 8; i++) { const z = eastZ(i), x = ECX; cars.push(spot(8 + i, 'car', bothP(x, z, -Math.PI / 2), [[x - .2, z + .95], [x - .2, z + CSW / 2], [WX, z + CSW / 2], [WX, ZP], HUB], (8 + i) % 3)); }
  // motorcycles: nose to the pavement, the rider steps off on the left (+x) and walks onto the pavement, west to the footpath, up to the hub
  for (let i = 0; i < 6; i++) { const x = motoX(i); motos.push(spot(i, 'moto', bothP(x, MZ, 0), [[x + .6, MZ], [x + .6, WZ], [FPX, WZ], HUB], i % 3)); }
  const walkTo = (s: HomeSpot, d: number) => bothL(join(s.toHub.local, doorPaths[Math.max(0, Math.min(2, d))].park));

  const apts: Apartments = { group: g, origin: { ...origin }, cars, motos, doors, hub: both2(HUB),
    entry: bothP(IXX, 0, Math.PI), exit: bothP(OXX, 0, 0),
    lane: bothL([[IXX, 0], [IXX, XLZ + LHW], [IXX - LHW, XLZ], [OXX + LHW, XLZ], [OXX, XLZ + LHW], [OXX, 0]]),
    motoLane: bothL([[IXX, 0], [IXX, MAZ + LHW], [IXX - LHW, MAZ], [OXX + LHW, MAZ], [OXX, MAZ + LHW], [OXX, 0]]),
    paths: { pavement: bothL([[X0 + .6, WZ], [X1 - .6, WZ]]), footpath: bothL([[FPX, WZ], HUB]), walkway: bothL([[WX, SZ0], [WX, XLZ + LHW]]) },
    walkTo, windows: NW, setHome, winMesh: WIN, isLit, windowAt, toWorld,
    dispose() { scene.remove(g); g.traverse(o => { if (o instanceof THREE.Mesh) { o.geometry.dispose(); (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => { if (m !== VC) m.dispose(); }); } }); for (const t of signs) t.dispose(); } };
  return apts;
}
