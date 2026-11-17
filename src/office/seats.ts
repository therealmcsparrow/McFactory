import type { OSAtSeats } from './state.js';
import type { P2 } from '../common/types.js';
import type { Seat, WalkPt } from './types.js';

export function makeSeats(OS: OSAtSeats) {
  const { MAXROW, ROWZ, MAXDESK, DESKX, MAXROOM, TEAMX } = OS;
  // seats: the same layout in every building
  const SEATS: Seat[] = [];
  for (let ri = 0; ri < MAXROW; ri++) { const z0 = ROWZ[ri], mz = z0 + .15;                 // seat 0: the manager's desk of this row, in the glass office, facing the team
    SEATS.push({ zone: 'r' + ri, ri, i: 0, mgr: true, x: 7.7, z: mz, rot: -Math.PI / 2, sy: -.2, top: [6.9, .75, mz, .75, .06, 1.4], scr: [6.72, 1.13, mz, .62, .37, Math.PI / 2], eye: [7.52, 1.2, mz], look: [6.72, 1.13, mz], sw: .62 });
    for (let i = 1; i < MAXDESK; i++) { const x = DESKX(i);
      SEATS.push({ zone: 'r' + ri, ri, i, x, z: z0 + .8, rot: Math.PI, sy: -.2, top: [x, .75, z0, 1.3, .06, .75], scr: [x, 1.13, z0 - .17, .62, .37, 0], eye: [x, 1.2, z0 + .62], look: [x, 1.13, z0 - .17], sw: .62 }); } }
  for (let j = 0; j < MAXROOM; j++) { const back = j < 4, x = -6.55 + (j % 4) * 1.1, z = back ? -5.3 : -2.9, d = back ? 1 : -1;
    SEATS.push({ zone: 'meet', i: j, x, z, rot: back ? 0 : Math.PI, sy: -.2, top: [x, .795, z + d * .8, .5, .03, .34], scr: [x, .97, z + d * 1, .44, .28, back ? Math.PI : 0], eye: [x, 1.08, z + d * .12], look: [x, .97, z + d * 1], sw: .44 }); }
  for (let j = 0; j < MAXROOM; j++) { const a = j * Math.PI / 4; SEATS.push({ zone: 'kit', i: j, x: 5.4 + Math.sin(a) * 1.2, z: -3.8 + Math.cos(a) * 1.2, rot: a + Math.PI, sy: 0 }); }
  const NDESK = MAXROW * MAXDESK + MAXROOM;
  function seatPath(s: Seat): WalkPt[] { // walking route from the corridor inside the front door to a seat; the manager's office is against the east wall, its door opens onto the floor
    return [{ x: OS.INX, z: 5.95 }, ...(s.ri != null && !s.mgr ? [{ x: TEAMX, z: 5.95 }] : []), ...inTail(s)]; }
  function inTail(s: Seat): WalkPt[] { // the last part of the way to a seat, from its junction on the open floor east of the desks (people moving seats cross straight between junctions)
    if (s.mgr) return [{ x: OS.INX, z: 2 }, { x: 8.3, z: 2 }, { x: 8.3, z: s.z }, { x: s.x, z: s.z }];
    if (s.ri != null) { const z = ROWZ[s.ri] + 1.3; return [{ x: TEAMX, z }, { x: s.x, z }, { x: s.x, z: s.z }]; }
    if (s.zone === 'meet') return s.i < 4 ? [{ x: OS.INX, z: -1.65 }, { x: -1.75, z: -1.65 }, { x: -1.75, z: -5.8 }, { x: s.x, z: -5.8 }, { x: s.x, z: s.z }] : [{ x: OS.INX, z: -1.65 }, { x: -1.75, z: -1.65 }, { x: -1.75, z: -2.5 }, { x: s.x, z: -2.5 }, { x: s.x, z: s.z }];
    return [{ x: OS.INX, z: -1.65 }, { x: s.x, z: s.z }];
  }
  function outPath(s: Seat): WalkPt[] { // from a seat to the out gate: over the out lane (x OGX), so the way out never meets the way in head-on
    const G: WalkPt[] = [{ x: OS.OGX, z: OS.OGZ, gate: 'out' }];
    if (s.mgr) return [{ x: 8.3, z: s.z }, { x: 8.3, z: 2 }, { x: OS.OGX, z: 2 }, ...G];
    if (s.ri != null) { const z = ROWZ[s.ri] + 1.3; return [{ x: s.x, z }, { x: TEAMX, z }, { x: OS.OGX, z: Math.min(z, 3.7) }, ...G]; }
    return [...inTail(s).reverse().slice(1, -1), { x: OS.OGX, z: -1.65 }, ...G];
  }
  function deskPath(s: Seat, z0: number): WalkPt[] { const z = ROWZ[s.ri!] + 1.3; return [{ x: TEAMX, z: z0 }, { x: TEAMX, z }, { x: s.x, z }, { x: s.x, z: s.z }]; } // down the aisle to a team desk
  const TRUNK: P2[] = [[-8.3, 6.6], [-8.3, 7.05], [-8, 7.55]]; // out of the front wall into the server by the dock
  function linePath(zone: string | null | undefined, x?: number | null): P2[] { // data line from a seat to the server
    if (zone === 'meet') return [[-7.3, -4.1], [-8.3, -4.1], ...TRUNK];
    if (zone === 'kit') return [[5.4, -3.8], [5.4, -1.72], [-8.3, -1.72], ...TRUNK];
    if (zone && zone[0] === 'r') { const z = ROWZ[+zone.slice(1)] - .52; return [[Math.min(x ?? 6.9, 7), z], [-8.3, z], ...TRUNK]; }
    return [[-8.3, 0], ...TRUNK];
  }
  return { SEATS, NDESK, seatPath, inTail, outPath, deskPath, linePath };
}
