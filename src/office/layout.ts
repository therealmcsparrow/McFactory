import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { clamp } from '../common/math.js';
import type { OSAtLayout } from './state.js';
import type { P2 } from '../common/types.js';

export function makeLayout(OS: OSAtLayout) {
  const { kit } = OS;
  const { scene, controls, camera } = OS.ctx;
  const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z), col = (c: THREE.ColorRepresentation) => new THREE.Color(c);
  const dA = (c: number, t: number, l: number, dt: number) => { const d = ((t - c + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI; return c + d * (1 - Math.exp(-l * dt)); };

  // ── layout constants (building-local unless noted) ──
  const CW = 60, CD = 33, OX0 = 33, BKX = 27.4, BKZ = -10, EX = 70, BW = 18, BD = 13, BH = 9.2, HX = BW / 2, HZ = BD / 2, FL = .15; // column and row pitch, first column, bank, east turnaround, building box, floor top
  // the office grid round the town centre (the bank, the park, the shops, the police station, the apartments): cells [column, row], an office
  // at x cellX(c), z r·CD (its street STZ south of it). Column c >= 0 lies west of the avenue (x -(OX0 + c·CW)), c < 0 east of it (x
  // -(XE + c·CW): 40, 100, 160, ...). Lattice line j (roads.ts) runs north–south at lineX(j): 0 the avenue, j > 0 west, j < 0 east; office c
  // stands between lines c + 1 (west) and c (east), its own roundabout on the far side from the avenue (line c + 1 west, line c east), so
  // traffic towards the avenue passes its in road first on either side. Cells under the centre are left out: columns -1 and -2 north
  // of row 2 (the bank, the police station, the park, the shops, and behind them the apartments and their road). The rest fill ring by ring: nearest a centre building first (the gap between the office and the nearest one, then the
  // distance to the centre). MAXOFF: cells in all (the top of the officeMax setting)
  const MAXOFF = 100, NROW = 6, XE = 20, cellX = (c: number) => c >= 0 ? -(OX0 + c * CW) : -(XE + c * CW);
  const lineX = (j: number) => j > 0 ? cellX(j - 1) - CW / 2 : j < 0 ? cellX(j) + CW / 2 : 0;
  const CENTRE: [number, number, number, number][] = [[12, 43, -18, 15], [43.6, 80, -8, 12.3], [44.5, 120, -27, 33], [12, 68, 25.6, 39], [14, 83.5, -100.9, -53.9]]; // bank and yard, park, shops, police station, apartments: [x0, x1, z0, z1]
  const cellOk = (c: number, r: number) => c === -1 || c === -2 ? r >= 2 : true;
  // the cells of the extra police stations (police-station.ts; one more for every 20 offices, the first at 21): spread over the town (west,
  // north-east, east, south-west of the centre; the first station stands south of the centre), each at about the ring the town has grown to
  // when it comes, so it stands at the town's edge then. No office takes these cells
  const STNC: P2[] = [[2, -1], [-3, -4], [-5, 0], [2, 4]];
  const SLOTS: P2[] = (() => { const L: [number, number, number][] = [];
    for (let c = -12; c < 12; c++) for (let r = -NROW; r <= NROW; r++) if (cellOk(c, r) && !STNC.some(s => s[0] === c && s[1] === r)) { const x = cellX(c), z = r * CD;
      const gap = Math.min(...CENTRE.map(([x0, x1, z0, z1]) => Math.hypot(Math.max(0, x0 - x - HX, x - HX - x1), Math.max(0, z0 - z - HZ, z - HZ - z1))));
      L.push([c, r, gap + Math.hypot(x - 20, z + 15) * .02]); }
    return L.sort((a, b) => a[2] - b[2]).slice(0, MAXOFF).map(([c, r]) => [c, r] as P2); })();
  const offCap = () => { try { return window.CWFun ? Math.max(1, Math.min(MAXOFF, window.CWFun.get('officeMax'))) : 50; } catch (e) { return 50; } }; // the officeMax setting
  const MAXROW = 4, MAXDESK = 8, MAXROOM = 8, MAXCLOSED = 6;
  const ROWZ = [-.9, .95, 2.8, 4.65], DESKX = (i: number) => 2.1 - (i - 1) * 1.55, AISLE = 7.6, TEAMX = 3.3;   // team desks 1..7; the manager's desk of the row is seat 0
  const SPOTX = (i: number) => -2.6 + i * 1.65, NSPOT = 8, SPOTZ = 9.1, SVZ = 12.1, STZ = 18.6, SLIPX = 13.2, MDOOR = 5.6; // parking spots, forecourt lane, street centre line, where the in and out roads meet the street
  // the armoured cars' service drive round the building (one way): up the side car park's aisle (SLIPX), west along the back of the building
  // (BDZ, between its back wall and the next street's sidewalk), south down the west side on the out road's line (-SLIPX) to the lay-by
  // beside the drive pile (front slot LB0, rear slot LB1: nose south, the front one nearest the out road), then straight on down the out road.
  // BDR: the drive's corners
  const BDZ = -7.9, BDR = 3.6, LB0 = 7, LB1 = 2.6;
  // the side car park east of the building (spots NSPOT .. NSPOT + NSIDE - 1): up the in road's line (SLIPX) past the forecourt, nose-in
  // to the east (kerb at LOTK), out by reversing into the lane at LOTX and down it to the forecourt lane; LOTZ: a side spot's z
  const NSIDE = 6, LOTZ = (j: number) => 5.2 - j * 1.65, LOTK = 18.4, LOTX = 11.5;
  // the park on the lot between the bank, the shops and roundabout E (world coordinates; drawn in roads.ts, which gives the kids' OS.park
  // from it). box/ground: [x0, x1, z0, z1]; paths: footpath centre lines (joined to the street and roundabout sidewalks and the shops'
  // footpath); each piece of the playground (park-preview.ts builders): c its origin, rot its turn (swings: n seats gap apart, swinging
  // along z; slide: the run goes down along +x; see-saw: the beam along x); run: the loop on the grass for tag (centre, radii);
  // benches: [x, z, the way it faces (rad, 0 = +z)]
  const park = {
    box: [43.6, 80, -8, 12.3] as const, ground: [57, 67.6, -6.4, .9] as const,
    paths: [[[54.5, -8], [54.5, 14.8]], [[54.5, 2], [76, 2], [83.2, 10.5]], [[66.3, 2], [66.25, 10.4]], [[54.5, -4], [46.8, -4], [46.8, 7], [54.5, 7]]] as P2[][],
    swings: { c: [63.5, -4.6] as P2, rot: 0, n: 2, gap: 1.4 }, slide: { c: [61.9, -.6] as P2, rot: Math.PI / 2 },
    sandbox: { c: [58.8, -4.4] as P2, half: 1.4 }, climb: { c: [58.8, -.6] as P2, half: 1, h: 1.6 }, seesaw: { c: [65.9, -2.6] as P2, rot: Math.PI / 2 },
    run: { c: [70.3, 6.05] as P2, r: [2.6, 1.25] as P2 }, // open grass: clear of the bench and lamp by the path, the tree to the east and the hedge's curve to the north
    benches: [[50.6, -5.3, 0], [60, 3.4, Math.PI], [71, 3.4, Math.PI], [56, -2.6, Math.PI / 2]] as [number, number, number][],
    lamps: [[53.3, 3.2], [63, 3.2], [73, 3.2], [55.7, -6.5], [64.5, 7], [45.6, 1.5]] as P2[],
    trees: [[45, -6.6], [50.5, -6.9], [50.6, 1.5], [45.4, 10], [50.5, 10.2], [58.5, 7.5], [60.5, 9.8], [71.5, -4], [75.5, -6], [75.8, 6.2], [70, -6.6], [60.5, -7.2],
      [66, -7.2], [73.5, -1], [78, -2.5]] as P2[],
  };
  // every road has two lanes each way: lane 0 (inner, by the centre line) and lane 1 (outer, keep right); LO is the outer lane, the one out roads join
  // roundabouts have two lanes too: RO the outer lane's radius, RI the inner one's; RT the tarmac, RY the line a vehicle waits at
  const LA = .95, LO = 2.85, LN2 = [LA, LO], RW = 3.8, RO = 6, RIN = 4.1, RT = 7.4, RY = RO + 1.15, RR = RO;
  const PKT_TOK = 20000, CARRY = 10, TRAY = 12, DOCKMAX = 300, MAXTRUCK = 16, BAYW = 2, BAYR = 2.6; // one packet = one drive ≈ 20,000 tokens; drives per layer of the dock pile, most drives a dock holds; bays at the bank
  // bank yard: two rows of BAYN bays, one behind the other, each with its own pair of lanes in front of it (row 0 by the street, row 1 behind it,
  // in front of the bank). Bays 0..7 are row 0, 8..15 row 1. A car comes in at the in road (east), drives north along the east side to its row,
  // west along the row's in lane and reverses into its bay; it leaves west along the row's out lane and south along the west side to the out road
  const BAYN = 8, BAYD = 9, BAYZ = 8.2, AZ = 11.6, BZ = 13.9, BOX = 15, BIX = BOX + 24.6, BFX = BIX + 3.1, BFW = BOX - 2.9, BFZ = 14.75, BBZ = BKZ - 7.8; // front row: bays, lane out (near the bays), lane in; out road, in road, east and west fence, front and back fence
  const rowOf = (i: number) => Math.floor(i / BAYN), BAYX = (i: number) => BOX + 5.6 + (i % BAYN) * BAYW, bayZ = (i: number) => BAYZ - rowOf(i) * BAYD, outZ = (i: number) => AZ - rowOf(i) * BAYD, inZ = (i: number) => BZ - rowOf(i) * BAYD;
  const PLZ = 30, POX = 13, PR = 2.6, PSZ = PLZ + PR + 1, PRZ = PSZ + 3.4, PBAY = [34, 36.5, 39, 42], PDOOR = [30.6, 36], SH = 2.1, PIX = 56; // PIX: the police station's in road, off the street's eastbound lanes west of roundabout E; police station: yard lane (out), out road, turn radius, parking row, back lane (in), bays (3 patrol cars, the SWAT van), door step; shoulder: a stop this far right of the lane
  const LINGER = 240e3;                                                                   // a colleague stays in the meeting room or kitchen this long after their last turn
  const ISO = V(1, 1, 1).normalize(), RI = V(1, 0, -1).normalize(), UI = V(-1, 2, -1).normalize();
  const F0 = () => kit.frustum * (innerWidth / innerHeight < 1 ? 1.6 : 1);

  const st = document.createElement('style');
  st.textContent = `.sign.ob{font-size:12px;pointer-events:auto;box-shadow:0 0 0 1px var(--color-edge),inset 0 -2px 0 var(--c,transparent)}
.sign.ob.nd{box-shadow:0 0 0 2px #3d8bff;color:#d6e6ff}
.sign.orow{pointer-events:auto}.sign.orow .nd{display:none;font:700 10px var(--font-mono);text-transform:uppercase;color:#8fbcff}
.sign.orow.ask{box-shadow:0 0 0 2px #3d8bff}.sign.orow.ask .nd{display:inline}.sign.orow.on{box-shadow:0 0 0 2px var(--color-signal)}
.sign.wh.obank{pointer-events:auto}.sign.more.omore{pointer-events:none}`;
  document.head.appendChild(st);

  // ── light and ground ──
  const BG = '#10141b';
  scene.background = col(BG); scene.fog = new THREE.Fog(BG, 240, 460);
  scene.add(new THREE.HemisphereLight('#aab6cc', '#0c0d10', .62));
  const sun = new THREE.DirectionalLight('#fff1dc', 1.8); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 1; sun.shadow.camera.far = 300; sun.shadow.bias = -.0004; sun.shadow.normalBias = .03; scene.add(sun, sun.target);
  const rim = new THREE.DirectionalLight('#6f8fd0', .5); rim.position.set(-30, 20, -20); scene.add(rim);
  let shHalf = 0;
  function updateSun() {
    const t = controls.target; sun.position.set(t.x + 22, 60, t.z + 36); sun.target.position.set(t.x, 0, t.z);
    const h = clamp(38 / camera.zoom, 8, 85); if (Math.abs(h - shHalf) > shHalf * .08) { shHalf = h; const c = sun.shadow.camera; c.left = -h; c.right = h; c.top = h; c.bottom = -h; c.updateProjectionMatrix(); }
  }
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), new THREE.MeshStandardMaterial({ color: '#1c2e23', roughness: .8, metalness: .05 })); // the open grass's colour (roads.ts GF): the field round the town runs on to every screen edge (roads.ts sizes it)
  ground.rotation.x = -Math.PI / 2; ground.position.y = -.02; ground.receiveShadow = true; scene.add(ground);

  // ── geometry helpers: every part carries a vertex colour so whole props merge into one mesh ──
  function tint<G extends THREE.BufferGeometry>(g: G, c: THREE.ColorRepresentation) { const k = col(c), n = g.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) { a[i * 3] = k.r; a[i * 3 + 1] = k.g; a[i * 3 + 2] = k.b; } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g; }
  const bx = (w: number, h: number, d: number, x: number, y: number, z: number, c: THREE.ColorRepresentation, ry = 0) => { const g = new THREE.BoxGeometry(w, h, d); if (ry) g.rotateY(ry); g.translate(x, y, z); return tint(g, c); };
  const cy = (r: number, h: number, x: number, y: number, z: number, c: THREE.ColorRepresentation, seg = 12, rz = 0) => { const g = new THREE.CylinderGeometry(r, r, h, seg); if (rz) g.rotateZ(rz); g.translate(x, y, z); return tint(g, c); };
  const sp = (r: number, x: number, y: number, z: number, c: THREE.ColorRepresentation) => { const g = new THREE.SphereGeometry(r, 12, 8); g.translate(x, y, z); return tint(g, c); };
  const ring = (L: THREE.BufferGeometry[], y: number, h: number, out: number, c: THREE.ColorRepresentation) => { L.push(bx(BW + out * 2, h, .12, 0, y, HZ + out - .06, c), bx(BW + out * 2, h, .12, 0, y, -HZ - out + .06, c), bx(.12, h, BD + out * 2, HX + out - .06, y, 0, c), bx(.12, h, BD + out * 2, -HX - out + .06, y, 0, c)); };
  const arrow = (L: THREE.BufferGeometry[], x: number, z: number, ry: number, c: THREE.ColorRepresentation) => { const s = Math.sin(ry), k = Math.cos(ry), at = (dx: number, dz: number, w: number, r: number) => L.push(bx(w, .012, .1, x + dx * k + dz * s, .066, z - dx * s + dz * k, c, ry + r)); at(0, 0, .9, 0); at(-.27, -.13, .45, .6); at(-.27, .13, .45, -.6); }; // lane arrow, pointing to -x when ry = 0
  const merge = (L: THREE.BufferGeometry[]) => mergeGeometries(L, false);
  const VC = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .8, metalness: .05 });
  const HIT = new THREE.MeshBasicMaterial({ visible: false });
  const mesh = <G extends THREE.BufferGeometry, M extends THREE.Material | THREE.Material[]>(g: G, m: M, cast = true, recv = true) => { const o = new THREE.Mesh(g, m); o.castShadow = cast; o.receiveShadow = recv; return o; };
  return { ground, V, col, dA, SLOTS, STNC, MAXOFF, cellX, lineX, offCap, CW, CD, OX0, BKX, BKZ, EX, BW, BD, BH, HX, HZ, FL, MAXROW, MAXDESK, MAXROOM, MAXCLOSED, ROWZ, DESKX, AISLE, TEAMX, SPOTX, NSPOT, SPOTZ, NSIDE, LOTZ, LOTK, LOTX, parkAt: park, SVZ, STZ, SLIPX, BDZ, BDR, LB0, LB1, MDOOR, LA, LO, LN2, RW, RO, RIN, RT, RY, RR, PKT_TOK, CARRY, TRAY, DOCKMAX, MAXTRUCK, BAYW, BAYX, BAYZ, BAYR, BAYN, BAYD, rowOf, bayZ, outZ, inZ, AZ, BZ, BIX, BOX, BFX, BFW, BFZ, BBZ, PLZ, POX, PR, PSZ, PRZ, PBAY, PDOOR, SH, PIX, LINGER, ISO, RI, UI, F0, st, updateSun, bx, cy, sp, ring, arrow, merge, VC, HIT, mesh };
}
