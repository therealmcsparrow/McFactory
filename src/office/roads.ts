import * as THREE from 'three';
import type { OSAtRoads } from './state.js';
import type { P2 } from '../common/types.js';
import type { Office, NetNode, NetEdge, RouteP, SirenWait, Ring, LaneSample, LaneZone, InRoad, Station, Junction } from './types.js';
import { SHOP_GATES, SHOP_SITE } from './buildings/shops.js';
import { HOME_SITE, HOME_LOT, HOME_BOX } from './buildings/apartments.js';
import { SANDBOX, BENCH, loop, swingFrameGeometry, swingSeatGeometry, swingPoses, slideGeometry, slidePoses, sandboxGeometry, seesawBaseGeometry, seesawBeamGeometry, seesawPoses, climberGeometry, benchGeometry } from './park-preview.js';
import type { KidSpec, Pose } from './kids.js';
import type { WalkLines, Zebra } from './walknet.js';

/** A target for a left turn across the street: a roundabout entry (id) or a lane sample (b, e, i). */
type TurnTarget = { id?: string; x: number; z: number; h: number; b?: number; e?: NetEdge; i?: number };
type Turn = 'R' | 'S' | 'L' | 'U';
/** A corner (a crossing of two roads at right angles): drawn with a rounded kerb. */
type Corner = { x: number; z: number; arms: number[] };
const SEED = Math.random();

export function makeRoads(OS: OSAtRoads) {
  const { bldgs, RO, RIN, RT, LA, LO, cy, sp, SLIPX, SVZ, CD, STZ, EX, BIX, BOX, BZ, AZ, PLZ, POX, bx, RW, mesh, merge, VC, BFW, BFX, BFZ, BBZ, PRZ, NSIDE, LOTZ, LOTK, LOTX, parkAt: park, lineX, PIX } = OS;
  const { scene } = OS.ctx;
  // ── road network: two lanes each way (keep right), two-lane roundabouts at the avenue, after every office and at the street ends ──
  // node ids: A<row> avenue roundabout, <id>:R the roundabout west of an office, E the east roundabout; on a roundabout <ring>:i<arm> / :o<arm>
  // where an arm's lanes come in / go out. <id>:a / :b where the in / out road meets the street, <id>:in / :out where it meets the forecourt lane;
  // gate:in / gate:out (the avenue's in road) and gate<line>:in / :out (the in road below every other south-edge roundabout) where traffic
  // enters and leaves the site; each arrival and departure picks one at random (see gateIn / gateOut in traffic.ts). A node on a street or roundabout arm is the outer lane (lane 1); the same id
  // with '.0' is the inner lane by the centre line. In roads leave from the outer lane, out roads join it (right turns only): to go the other way
  // a vehicle goes round the roundabout just past the office.
  const AL = 8.5, RL = [RIN, RO], LN = [LA, LO], BE = [.6, .65]; // arm length (where its lanes meet the street, outside the yield line); per lane: ring radius, offset from the centre line, where it joins the ring
  const LC = 12, LCE = 7, LCC = 2.5, INC = 1.08; // a lane change: an S-curve of 12 m that ends 7 m before the end of a stretch (so it is done before the queue at the next roundabout), costs 2.5 m more; the inner lane costs 8 % more (keep right unless you turn left)
  const SPR = 1.1; // on a roundabout the inner lane moves over to the outer lane over the last 1.1 rad before its exit (it leaves into the outer lane)
  const lid = (id: string, l: number) => l ? id : id + '.0';
  const TURN: Turn[] = ['U', 'R', 'S', 'L'];
  // junctions (not every crossing is a roundabout): a seed drawn once per map (a new one each time the town is built, the same while it is
  // looked at), hashed with a crossing's place: which T-junctions get lights, which crossings of four roads are lit crossings, the lights' phase
  const hsh = (x: number, z: number, k: number) => { const h = Math.sin(x * 12.9898 + z * 78.233 + SEED * 1000 + k * 37.719) * 43758.5453; return h - Math.floor(h); };
  const SL = 9.2, ZJ = 7.6, CYC = 27; // the stop line and the zebra on a junction's arm (from its centre); the lights' cycle (s)
  let roadM: THREE.Mesh | null = null, greenM: THREE.Mesh | null = null, treeM: THREE.InstancedMesh[] = [], lampG: THREE.Group | null = null, LAMPS: { J: Junction; m: THREE.Mesh[] }[] = [];
  // the lights: axis 0 (east–west) green 0–9 s, amber to 11.5; axis 1 (north–south) green 13.5–22.5, amber to 25; red otherwise (all red between).
  // [state, seconds into it]
  function lightAt(J: Junction, axis: number): ['g' | 'a' | 'r', number] { const t = ((OS.simT + J.ph) % CYC + CYC) % CYC, g0 = axis ? 13.5 : 0;
    if (t >= g0 && t < g0 + 9) return ['g', t - g0]; if (t >= g0 + 9 && t < g0 + 11.5) return ['a', t - g0 - 9]; return ['r', 0]; }
  const LMAT = ['#ff3b2e', '#ffb020', '#3dff7a'].map(c => new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(1.6), toneMapped: false }));
  function lightTick() { for (const { J, m } of LAMPS) for (const a of [0, 1]) { const [s] = lightAt(J, a); m[a * 3].visible = s === 'r'; m[a * 3 + 1].visible = s === 'a'; m[a * 3 + 2].visible = s === 'g'; } }
  // the sidewalks and footpaths as centre lines, the zebras end to end, sniff spots by the verge (buildGreen fills it; walknet.ts makes the dog walkers' graph of it)
  let walkL: WalkLines = { lines: [], cross: [], spots: [] };
  const PAV = '#3e444e', GRS = '#284430', GF = '#1c2e23', ASP = '#1b2029', HDG = '#20402a', TRK = '#4a3a2c', LEAF = ['#2c5a36', '#346640', '#28502f'];
  // sidewalks, verges and trees along every straight road: a 1.4 m sidewalk just off the tarmac, then a 1 m grass verge. Round every
  // roundabout both run on as arcs between its arms and meet the arms' sidewalks; a zebra crosses each arm a few metres back from the
  // yield line. They stop (a gap, the dropped kerb) where an in or out road crosses, and wherever a lot or yard lies (bank, police, shops, apartments)
  const ZB = RT + 2.4; // the zebra's centre, from the roundabout's centre
  // the park between the bank, the shops and roundabout E (layout.ts park: where everything is): footpaths off the shops' footpath to the
  // roundabout's sidewalk, the shops' out road and round a loop; a playground (swings, a slide, a climbing frame, a sandbox, a see-saw) on a
  // soft floor; benches and lamps; a hedge on the street and roundabout sides (open where the paths go through), a low fence by the service drive
  function buildPark(L: THREE.BufferGeometry[]) {
    const MT = '#8a9098', RB = '#5a3a30', LMP = '#59606c';
    for (const P of park.paths.slice(1)) for (let i = 1; i < P.length; i++) { const [ax, az] = P[i - 1], [bx2, bz] = P[i], dx = bx2 - ax, dz = bz - az, d = Math.hypot(dx, dz);
      L.push(bx(d + 1.4, .07, 1.4, (ax + bx2) / 2, .035, (az + bz) / 2, PAV, Math.atan2(-dz, dx))); } // (the first is the shops' footpath, drawn with the shops' walks)
    const [g0, g1, h0, h1] = park.ground; L.push(bx(g1 - g0, .05, h1 - h0, (g0 + g1) / 2, .025, (h0 + h1) / 2, RB)); // (the playground and the benches: play below, built once)
    for (const [x, z] of park.lamps) L.push(cy(.06, 3, x, 1.5, z, LMP, 6), bx(.36, .1, .36, x, 3.02, z, LMP), sp(.16, x, 2.9, z, '#ffd9a0'));
    // the hedge: along the street (z hz) to where it meets the roundabout's circle, round the circle, on to the east edge, then up the east edge
    const [, bxe, bz0] = park.box, hz = 12, hr = 10.4;
    const gapsX = park.paths.flatMap(P => P.slice(1).map((p, i) => [P[i], p] as [P2, P2])); // where a path crosses a hedge line, leave it open
    const cut = (t0: number, t1: number, at: (t: number) => P2, pc: number) => { const out: [number, number][] = []; let a = t0;
      for (let t = t0; t <= t1 + 1e-6; t += .05) { const [x, z] = at(t), hit = gapsX.some(([p, q]) => { const dx = q[0] - p[0], dz = q[1] - p[1], l = dx * dx + dz * dz, u = Math.max(0, Math.min(1, ((x - p[0]) * dx + (z - p[1]) * dz) / l)); return Math.hypot(x - p[0] - u * dx, z - p[1] - u * dz) < pc; });
        if (hit) { if (t - a > .3) out.push([a, t]); a = t + .05; } } if (t1 - a > .3) out.push([a, t1]); return out; };
    const ex = Math.sqrt(hr * hr - (STZ - hz) ** 2), xw = EX - ex, xe = EX + ex, aw = Math.atan2(hz - STZ, -ex), ae = Math.atan2(hz - STZ, ex);
    for (const [a, b] of [[park.box[0] + .4, xw], [xe, bxe]]) for (const [u, v] of cut(a, b, t => [t, hz], 1.1)) L.push(bx(v - u, .9, .8, (u + v) / 2, .45, hz, HDG));
    for (const [u, v] of cut(aw, ae, t => [EX + hr * Math.cos(t), STZ + hr * Math.sin(t)], 1.1 + .05 * hr)) for (let t = u; t < v - 1e-6; t += .1) { const t1 = Math.min(v, t + .1), m = (t + t1) / 2;
      L.push(bx(hr * (t1 - t) + .03, .9, .8, EX + hr * Math.cos(m), .45, STZ + hr * Math.sin(m), HDG, -m - Math.PI / 2)); }
    for (const [u, v] of cut(bz0 + .4, hz, t => [bxe, t], 1.3)) L.push(bx(.8, .9, v - u, bxe, .45, (u + v) / 2, HDG));
    // the low fence by the service drive (open where the shops' footpath crosses)
    for (const [u, v] of cut(park.box[0] + .4, bxe, t => [t, bz0], 1.1)) { L.push(bx(v - u, .05, .04, (u + v) / 2, .35, bz0, MT), bx(v - u, .05, .04, (u + v) / 2, .65, bz0, MT));
      for (let x = u; x <= v + 1e-6; x += Math.max(.5, (v - u) / Math.ceil((v - u) / 2))) L.push(bx(.06, .7, .06, x, .35, bz0, MT)); }
  }
  // the playground and the benches (park-preview.ts builders), built once (they do not change with the road network): one merged mesh, plus
  // the swing seats and the see-saw beam on their own, which the kids (kids.ts) move. park: what the kids need, in the KidSpec shape
  const park_: KidSpec = (() => {
    const Y = .05, P = { bx, cy, sp, merge }, L: THREE.BufferGeometry[] = [], grp = new THREE.Group(); grp.name = 'playground'; scene.add(grp);
    const at = (g: THREE.BufferGeometry, [x, z]: P2, rot: number, y = Y) => { if (rot) g.rotateY(rot); g.translate(x, y, z); L.push(g); };
    const own = (g: THREE.BufferGeometry, x: number, z: number, rot: number, y: number) => { const m = mesh(g, VC); m.position.set(x, y, z); m.rotation.order = 'YXZ'; m.rotation.y = rot; grp.add(m); return m; };
    const { swings: W, slide: S, seesaw: E, sandbox: B, climb: C, run } = park;
    at(swingFrameGeometry(P, W.n, undefined, W.gap), W.c, W.rot);
    const swings = swingPoses(W.c[0], W.c[1], W.rot, W.n, undefined, undefined, W.gap); for (const s of swings) s.seat = own(swingSeatGeometry(P), s.x, s.z, s.rot, Y + s.h);
    at(slideGeometry(P), S.c, S.rot); at(sandboxGeometry(P, B.half), B.c, 0); at(climberGeometry(P, C.half, C.h), C.c, 0); at(seesawBaseGeometry(P), E.c, E.rot);
    const seesaw = seesawPoses(E.c[0], E.c[1], E.rot); seesaw.beam = own(seesawBeamGeometry(P), seesaw.x, seesaw.z, seesaw.rot, Y + seesaw.h);
    const benches: Pose[] = park.benches.map(([x, z, f]) => ({ x, z, rot: f })); for (const b of benches) at(benchGeometry(P), [b.x, b.z], b.rot);
    grp.add(mesh(merge(L), VC));
    return { swings, slide: slidePoses(S.c[0], S.c[1], S.rot), sandbox: { c: B.c, half: B.half, y: SANDBOX.sand }, seesaw, climber: { c: C.c, half: C.half, h: C.h },
      run: loop(run.c[0], run.c[1], run.r[0], run.r[1]), benches, seatH: BENCH.seat, y: Y,
      // what the kids walk round: tree crowns, lamp posts, benches, and the hedge's curve round roundabout E (buildPark: radius 10.4, 0.8 thick).
      // The straight hedges and the fence are the park's edge; every kid spot is inside it, so a straight leg never crosses them
      obstacles: [...park.trees.map(([x, z]) => [x, z, 1.2] as [number, number, number]), ...park.lamps.map(([x, z]) => [x, z, .4] as [number, number, number]),
        ...park.benches.map(([x, z]) => [x, z, 1] as [number, number, number]), [EX, STZ, 10.4 + .4 + .4]] };
  })();
  // a bucket grid over items that each reach a box (x, z, half width[, half depth]): look up the few near a point (the town grows to 100 offices)
  function index<T>(items: T[], at: (t: T) => [number, number, number, number?]) { const H = 16, M = new Map<number, T[]>(), K = (i: number, k: number) => (i + 4096) * 8192 + k + 4096, E: T[] = [];
    for (const t of items) { const [x, z, a, b = a] = at(t); for (let i = Math.floor((x - a) / H); i <= Math.floor((x + a) / H); i++) for (let k = Math.floor((z - b) / H); k <= Math.floor((z + b) / H); k++) { const key = K(i, k); let A = M.get(key); if (!A) M.set(key, A = []); A.push(t); } }
    return (x: number, z: number) => M.get(K(Math.floor(x / H), Math.floor(z / H))) || E; }
  function buildGreen(RS: [number, number, number, number][], R: Ring[], RA: [number, number, number[]][], cross: P2[], zg: number, gX: number[], extra: [number, number, number, number][], walk: P2[][], lanes: P2[][], J: Junction[], CR: Corner[]) {
    const L: THREE.BufferGeometry[] = [], cs = Math.cos(SHOP_SITE.rot), sn = Math.sin(SHOP_SITE.rot), WL: P2[][] = [], WX: P2[][] = [], WS: P2[] = [], ZS: Zebra[] = []; // ZS: every zebra's stripes, for who gives way to whom (crossings.ts)
    const lots: [number, number, number, number][] = [[BFW - .3, BFX + .3, BBZ - .3, BFZ + .6], [POX - 1.3, PIX + 1.3, STZ + RW + 1.4, PRZ + 1.4],
      [HOME_SITE.x + HOME_BOX.X0, HOME_SITE.x + HOME_BOX.X1, HOME_SITE.z + HOME_BOX.Z1, HOME_SITE.z]];
    const lz0 = LOTZ(NSIDE - 1) - 4.9; // the side car park's north edge (room to reverse out of the last spot)
    for (const S of OS.stns) if (S.k) lots.push([S.ox - 20.5, S.inX + 1.3, S.rz - 1.8, S.oz + 13.3]); // the extra police stations (police-station.ts): block, bays, yard (the sidewalk covers the verge, as at an office)
    for (const F of bldgs.values()) lots.push([F.ox - 15.4, F.ox + 15.4, F.oz + 6.2, F.oz + 13.3], [F.ox - 9.6, F.ox + 9.6, F.oz - 8.2, F.oz + 6.6], [F.ox + 9.6, F.ox + LOTK + 1.3, F.oz + lz0 - .1, F.oz + 6.6]); // forecourt (the sidewalk covers its verge), building, side car park
    const shop = (x: number, z: number) => { const dx = x - SHOP_SITE.x, dz = z - SHOP_SITE.z, lx = dx * cs - dz * sn, lz = dx * sn + dz * cs; return lx > -45.8 && lx < 14.8 && lz > -8.8 && lz < (lx < -26.8 ? 67.8 : 19.5); }; // the east leg and car park (front edge local z 19), the north leg with its service drive
    const lotQ = index(lots, b => [(b[0] + b[1]) / 2, (b[2] + b[3]) / 2, (b[1] - b[0]) / 2, (b[3] - b[2]) / 2]), ringQ = index(R, c => [c[0], c[1], ZB + 3]), crossQ = index(cross, k => [k[0], k[1], 1.9, 4.6]);
    const lot = (x: number, z: number) => lotQ(x, z).some(b => x > b[0] && x < b[1] && z > b[2] && z < b[3]) || shop(x, z);
    const gate = (x: number, z: number) => z > zg - 3 && gX.some(g => Math.abs(x - g) < 8);
    // junctions and corners: the box in the middle, the roads off it, and the rounded kerb between two arms (xa / za: the arm on the point's side)
    const JC: Corner[] = [...J, ...CR], jcQ = index(JC, c => [c.x, c.z, AL + 6]);
    const onJ = (x: number, z: number) => jcQ(x, z).some(c => { const dx = x - c.x, dz = z - c.z, ax = Math.abs(dx), az = Math.abs(dz); if (ax >= AL || az >= AL) return false;
      const xa = c.arms.includes(dx > 0 ? 0 : 2), za = c.arms.includes(dz > 0 ? 1 : 3); return (ax < RW && az < RW) || (az < RW && xa) || (ax < RW && za) || (ax >= RW && az >= RW && xa && za); });
    const free = (x: number, z: number) => !ringQ(x, z).some(c => Math.hypot(x - c[0], z - c[1]) < RT) && !crossQ(x, z).some(k => Math.abs(x - k[0]) < 1.9 && Math.abs(z - k[1]) < 4.6)
      && !onJ(x, z) && !lot(x, z) && !gate(x, z);
    // a quarter ring round (px, pz) from angle t0, radius r0 to r1 (a sidewalk adds its centre line to the walkers' lines)
    const qa = (px: number, pz: number, t0: number, r0: number, r1: number, h: number, c: string) => { const n = 12, rm = (r0 + r1) / 2, du = Math.PI / 2 / n;
      for (let i = 0; i < n; i++) { const um = t0 + (i + .5) * du; if (lot(px + rm * Math.cos(um), pz + rm * Math.sin(um))) continue; L.push(bx(rm * du + .03, h, r1 - r0, px + rm * Math.cos(um), h / 2, pz + rm * Math.sin(um), c, -um - Math.PI / 2)); }
      if (c === PAV) WL.push(Array.from({ length: n + 1 }, (_, i): P2 => [px + rm * Math.cos(t0 + i * du), pz + rm * Math.sin(t0 + i * du)])); };
    // a strip from off to off + w beside the road on side s, in runs where both its edges are free
    const strip = (x0: number, z0: number, x1: number, z1: number, s: number, off: number, w: number, h: number, c: string) => { const d = Math.hypot(x1 - x0, z1 - z0), ux = (x1 - x0) / d, uz = (z1 - z0) / d, nx = -uz * s, nz = ux * s; let a = -1;
      const ok = (t: number) => { const x = x0 + ux * t, z = z0 + uz * t; return free(x + nx * off, z + nz * off) && free(x + nx * (off + w), z + nz * (off + w)); };
      const put = (t0: number, t1: number) => { const m = (t0 + t1) / 2, x = x0 + ux * m + nx * (off + w / 2), z = z0 + uz * m + nz * (off + w / 2); L.push(ux ? bx(t1 - t0, h, w, x, h / 2, z, c) : bx(w, h, t1 - t0, x, h / 2, z, c));
        if (c === PAV && w === 1.4) { const o = off + .7; WL.push([[x0 + ux * t0 + nx * o, z0 + uz * t0 + nz * o], [x0 + ux * t1 + nx * o, z0 + uz * t1 + nz * o]]); } };
      for (let t = .05; t < d; t += .1) { const on = ok(t); if (on && a < 0) a = t - .05; if (!on && a >= 0) { if (t - .05 - a > 1) put(a, t - .05); a = -1; } } if (a >= 0 && d - a > 1) put(a, d); };
    // an arc from radius r0 to r1 round a roundabout, between its arms (a0: the half angle left open at each arm), in pieces that are not on a lot
    const arc = (x: number, z: number, arms: number[], r0: number, r1: number, a0: number, h: number, c: string) => { const rm = (r0 + r1) / 2;
      const gap = (t: number) => arms.some(k => Math.abs(((t - k * Math.PI / 2) % (2 * Math.PI) + 3 * Math.PI) % (2 * Math.PI) - Math.PI) < a0);
      for (let i = 0, n = 64; i < n; i++) { const t0 = i * 2 * Math.PI / n, t1 = t0 + 2 * Math.PI / n, tm = (t0 + t1) / 2;
        if (gap(t0) && gap(t1)) continue; let u0 = t0, u1 = t1; while (gap(u0) && u0 < t1) u0 += .005; while (gap(u1) && u1 > u0) u1 -= .005; if (u1 - u0 < .01 || lot(x + rm * Math.cos(tm), z + rm * Math.sin(tm))) continue;
        const um = (u0 + u1) / 2; L.push(bx(rm * (u1 - u0) + .03, h, r1 - r0, x + rm * Math.cos(um), h / 2, z + rm * Math.sin(um), c, -um - Math.PI / 2));
        if (c === PAV) WL.push([[x + rm * Math.cos(u0), z + rm * Math.sin(u0)], [x + rm * Math.cos(u1), z + rm * Math.sin(u1)]]); } };
    // a zebra over arm k of a roundabout: stripes along the road, across its full width
    const zebra = (x: number, z: number, k: number, D = ZB) => { const f = k * Math.PI / 2, cu = Math.cos(f), su = Math.sin(f), q = RW + .7;
      WX.push([[x + D * cu + q * su, z + D * su - q * cu], [x + D * cu - q * su, z + D * su + q * cu]]); ZS.push([x + D * cu, z + D * su, cu, su, 1, RW]);
      for (let o = -RW + .45; o < RW - .2; o += .9) L.push(bx(2, .012, .45, x + D * cu - o * su, .047, z + D * su + o * cu, '#a3a8b0', -f)); };
    const TP: [number, number][][] = [[], [], []], tree = (x: number, z: number, k: number) => { TP[k % 3].push([x, z]); };
    let k = 0;
    for (const [x, z, arms] of RA) { arc(x, z, arms, RT, RT + 1.4, Math.asin(RW / RT) - .02, .07, PAV); arc(x, z, arms, RT + 1.4, RT + 2.4, Math.asin((RW + 1.4) / (RT + 1.4)), .03, GRS);
      for (const a of arms) zebra(x, z, a); }
    // junctions and corners: the sidewalk and verge round each rounded kerb (round P, AL out along both arms); a corner's outer side round its
    // centre; a zebra over every arm of a junction
    for (const c of JC) { const { x, z, arms } = c, cor = !(c as Junction).c;
      for (const a of arms) { const b = (a + 1) % 4; if (!arms.includes(b)) continue; const fa = a * Math.PI / 2, fb = b * Math.PI / 2, px = x + AL * (Math.cos(fa) + Math.cos(fb)), pz = z + AL * (Math.sin(fa) + Math.sin(fb)), t0 = fa + Math.PI;
        qa(px, pz, t0, AL - RW - 1.4, AL - RW, .07, PAV); qa(px, pz, t0, AL - RW - 2.4, AL - RW - 1.4, .03, GRS);
        if (cor) { qa(x, z, t0, RW, RW + 1.4, .07, PAV); qa(x, z, t0, RW + 1.4, RW + 2.4, .03, GRS); } }
      if (!cor) for (const a of arms) zebra(x, z, a, ZJ); }
    for (const [x0, z0, x1, z1] of extra) for (const s of [-1, 1]) strip(x0, z0, x1, z1, s, RW, 1.4, .07, PAV);
    // the shops: a sidewalk on the outer side of the car park's in and out roads (one lane each, right-hand side), along the car park's front
    // edge between them with a zebra over each, joining the east footpath at the south end; and a footpath from the north leg's west end,
    // over the service drive (a zebra), down to the street's sidewalk
    for (const P of walk) for (let i = 1; i < P.length; i++) { const [ax, az] = P[i - 1], [bx2, bz] = P[i], dx = bx2 - ax, dz = bz - az, d = Math.hypot(dx, dz); if (d < 1e-3) continue;
      const o = (RW - .2) / 2 + .7, nx = -dz / d * o, nz = dx / d * o; L.push(bx(d + .25, .07, 1.4, (ax + bx2) / 2 + nx, .035, (az + bz) / 2 + nz, PAV, Math.atan2(-dz, dx))); }
    for (const P of walk) { const o = (RW - .2) / 2 + .7, Q = P.filter((p, i) => !i || Math.hypot(p[0] - P[i - 1][0], p[1] - P[i - 1][1]) > 1e-3), n = (i: number): P2 => { const a = Q[Math.max(0, i - 1)], b = Q[Math.min(Q.length - 1, i + (i ? 0 : 1))], d = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; return [-(b[1] - a[1]) / d, (b[0] - a[0]) / d]; };
      WL.push(Q.map((p, i) => { const a = n(i), b = n(Math.min(Q.length - 1, i + 1)), mx = a[0] + b[0], mz = a[1] + b[1], ml = Math.hypot(mx, mz) || 1, k = o / Math.max(.5, (mx * a[0] + mz * a[1]) / ml); return [p[0] + mx / ml * k, p[1] + mz / ml * k] as P2; })); } // (mitred at the corners)
    const gx = SHOP_GATES.entry.p[0] - 1.1, zi = SHOP_GATES.entry.p[1], zo = SHOP_GATES.exit.p[1], lh = (RW - .2) / 2, z0 = Math.min(zi, zo), z1 = Math.max(zi, zo);
    for (const [a, b] of [[z0 - lh - 1.4, z0 - lh], [z0 + lh, z1 - lh], [z1 + lh, z1 + lh + 2]]) L.push(bx(1.4, .07, b - a, gx, .035, (a + b) / 2, PAV));
    const zeb = (x: number, z: number, along: boolean, half: number) => { ZS.push(along ? [x, z, 1, 0, .7, half] : [x, z, 0, 1, .7, half]); for (let o = -half + .45; o < half - .2; o += .9) L.push(along ? bx(1.4, .012, .45, x, .047, z + o, '#a3a8b0') : bx(.45, .012, 1.4, x + o, .047, z, '#a3a8b0')); };
    zeb(gx, zi, true, lh); zeb(gx, zo, true, lh); WL.push([[gx, z0 - lh - 1.4], [gx, z1 + lh + 2]]);
    { const fx = SHOP_SITE.x - 57, fz0 = SHOP_SITE.z - 34, fz1 = STZ - RW, sd0 = SHOP_SITE.z - 34, sd1 = SHOP_SITE.z - 30.5; // the north leg's pavement edge (world z), the street's north sidewalk; the service drive
      L.push(bx(1.4, .07, sd0 - fz0 + .01, fx, .035, (fz0 + sd0) / 2, PAV), bx(1.4, .07, fz1 - sd1, fx, .035, (sd1 + fz1) / 2, PAV)); zeb(fx, (sd0 + sd1) / 2, true, (sd1 - sd0) / 2); WL.push([[fx, fz0], [fx, fz1]]); }
    for (const [x0, z0, x1, z1] of RS) for (const s of [-1, 1]) { strip(x0, z0, x1, z1, s, RW, 1.4, .07, PAV); strip(x0, z0, x1, z1, s, RW + 1.4, 1, .03, GRS);
      const d = Math.hypot(x1 - x0, z1 - z0), ux = (x1 - x0) / d, uz = (z1 - z0) / d, o = RW + 3.4; // trees: every 16 m where a 1.4 m circle round the trunk is free
      for (let t = 8; t < d - 4; t += 16) { const x = x0 + ux * t - uz * s * o, z = z0 + uz * t + ux * s * o; if ([[0, 0], [1.4, 0], [-1.4, 0], [0, 1.4], [0, -1.4]].every(([a, b]) => free(x + a, z + b))) { tree(x, z, k++); WS.push([x + uz * s * 1.9, z - ux * s * 1.9]); } } // (a sniff spot at the verge by each tree)
      for (let t = s > 0 ? 12 : 24; t < d - 6; t += 24) { const x = x0 + ux * t - uz * s * (RW + 1.9), z = z0 + uz * t + ux * s * (RW + 1.9); // lanterns on the verge, every 24 m on each side (the sides in turn)
        if ([[0, 0], [.6, 0], [-.6, 0], [0, .6], [0, -.6]].every(([a, b]) => free(x + a, z + b))) L.push(cy(.06, 3, x, 1.5, z, '#59606c', 6), bx(.36, .1, .36, x, 3.02, z, '#59606c'), sp(.16, x, 2.9, z, '#ffd9a0')); } }
    // each office's side car park: tarmac east of the building from the forecourt to lz0, spot lines, a footpath by the building, a hedge on the east
    for (const F of bldgs.values()) { const x0 = F.ox + LOTX - 1.1, x1 = F.ox + LOTK + .2, z0 = F.oz + lz0, z1 = F.oz + 6.5;
      L.push(bx(x1 - x0, .04, z1 - z0, (x0 + x1) / 2, .02, (z0 + z1) / 2, ASP), bx(x0 - F.ox - 9.6, .07, z1 - z0, (F.ox + 9.6 + x0) / 2, .035, (z0 + z1) / 2, PAV), bx(.8, .9, z1 - z0 - .6, x1 + .7, .45, (z0 + z1) / 2 - .3, HDG));
      for (let j = 0; j <= NSIDE; j++) L.push(bx(3.3, .012, .06, F.ox + LOTK - 1.65, .046, F.oz + LOTZ(j) + .825, '#59606c')); }
    // grass on all the open ground: rows 1 m deep, in runs off every lot and yard (under the roads, sidewalks and verges, which sit higher)
    const xs: number[] = [], zz: number[] = []; for (const [x0, z0, x1, z1] of RS) { xs.push(x0, x1); zz.push(z0, z1); } for (const { x, z } of [...RA.map(([x, z]) => ({ x, z })), ...JC]) { xs.push(x); zz.push(z); }
    const gx0 = Math.floor(Math.min(...xs) - 14), gx1 = Math.ceil(Math.max(...xs) + 14), gz0 = Math.floor(Math.min(...zz) - 14), gz1 = Math.ceil(Math.max(...zz) + 14);
    for (let z = gz0 + .5; z < gz1; z += 1) { let a = NaN; for (let x = gx0; x <= gx1; x += .5) { const on = x < gx1 && !lot(x + .25, z) && !gate(x + .25, z);
      if (on && isNaN(a)) a = x; else if (!on && !isNaN(a)) { L.push(bx(x - a, .012, 1, (a + x) / 2, .006, z, GF)); a = NaN; } } }
    // trees on the open grass: about every 11 m, clear of every lane (and its sidewalk and verge), the footpaths and the lots
    const segs: [number, number, number, number, number][] = []; for (const P of lanes) for (let i = 1; i < P.length; i++) segs.push([P[i - 1][0], P[i - 1][1], P[i][0], P[i][1], 6.4]);
    for (const P of walk) for (let i = 1; i < P.length; i++) segs.push([P[i - 1][0], P[i - 1][1], P[i][0], P[i][1], 6.4]);
    segs.push([SHOP_SITE.x - 57, SHOP_SITE.z - 36, SHOP_SITE.x - 57, STZ, 2.2]);
    const inPark = (x: number, z: number) => x > park.box[0] - 1 && x < park.box[1] + 1 && z > park.box[2] - 1 && z < park.box[3] + 1;
    const segQ = index(segs, ([ax, az, bx2, bz, p]) => [(ax + bx2) / 2, (az + bz) / 2, Math.abs(bx2 - ax) / 2 + p, Math.abs(bz - az) / 2 + p]);
    const sd = (x: number, z: number, [ax, az, bx2, bz]: number[]) => { const dx = bx2 - ax, dz = bz - az, l = dx * dx + dz * dz, t = l ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l)) : 0; return Math.hypot(x - ax - t * dx, z - az - t * dz); };
    for (let gz = gz0 + 6; gz < gz1 - 4; gz += 11) for (let gx = gx0 + 6; gx < gx1 - 4; gx += 11) { const h = Math.sin(gx * 12.9898 + gz * 78.233) * 43758.5453, j = h - Math.floor(h);
      const x = gx + (j - .5) * 6, z = gz + ((j * 7.31) % 1 - .5) * 6; if (gate(x, z) || ringQ(x, z).some(c => Math.hypot(x - c[0], z - c[1]) < ZB + 3) || jcQ(x, z).some(c => Math.abs(x - c.x) < AL + 4 && Math.abs(z - c.z) < AL + 4) || inPark(x, z)) continue;
      if (![[0, 0], [2, 0], [-2, 0], [0, 2], [0, -2]].every(([a, b]) => !lot(x + a, z + b)) || segQ(x, z).some(g => sd(x, z, g) < g[4])) continue; tree(x, z, k++); }
    buildPark(L); for (const [x, z] of park.trees) tree(x, z, k++);
    for (const P of park.paths.slice(1)) WL.push(P.map(p => p.slice() as P2)); for (const p of park.lamps) WS.push([p[0], p[1]]);
    walkL = { lines: WL, cross: WX, spots: WS, zebras: ZS, ends: ([x, z]) => z > zg - 7 && gX.some(g => Math.abs(x - g) < 10) };
    L.push(bx(.8, .9, BFZ - BBZ - 1, BFW - .9, .45, (BBZ + BFZ - 1) / 2, HDG), bx(.8, .9, PRZ + 1.1 - (STZ + RT), POX - 2, .45, (PRZ + 1.1 + STZ + RT) / 2, HDG)); // hedges west of the bank and the police yard
    for (const z of [BBZ + 2.5, BBZ + 10]) tree(BFW - 3, z, k++);
    if (greenM) { scene.remove(greenM); greenM.geometry.dispose(); } greenM = mesh(merge(L), VC, true, true); scene.add(greenM);
    for (const t of treeM) { scene.remove(t); t.geometry.dispose(); t.dispose(); } // one instanced mesh per tree size and leaf colour
    const m4 = new THREE.Matrix4(); treeM = TP.map((P, v) => { const r = 1 + v * .15, t = new THREE.InstancedMesh(merge([cy(.14, 1.6, 0, .8, 0, TRK, 6), sp(r, 0, 1.6 + r * .8, 0, LEAF[v])]), VC, Math.max(1, P.length));
      t.count = P.length; P.forEach(([x, z], i) => t.setMatrixAt(i, m4.makeTranslation(x, 0, z))); t.castShadow = true; t.receiveShadow = true; scene.add(t); return t; });
  }
  function buildNet() {
    // the extra police stations (police-station.ts) stand on grid cells as offices do, with an office's in and out roads: in the rows as
    // stand-ins (stn set; no robbery stretch past them)
    const SO = OS.stns.filter(S => S.k).map(S => ({ id: S.id, c: S.c, r: S.r, ox: S.ox, oz: S.oz, stn: S }) as unknown as Office & { stn?: Station });
    const rows = new Map<number, (Office & { stn?: Station })[]>([[0, []]]); for (const F of [...bldgs.values(), ...SO]) { if (!rows.has(F.r)) rows.set(F.r, []); rows.get(F.r)!.push(F); }
    const OF = [...bldgs.values(), ...SO], nm = Math.min(0, ...OF.map(F => F.r)), eaUse = OF.some(F => F.c < 0 && F.r <= 1);
    if (nm <= -2) for (let r = nm; r <= -1; r++) if (!rows.has(r)) rows.set(r, []); // (an office north of row -1: every row from there to row -1, the avenue runs up through them all, see below)
    if (eaUse && !rows.has(1)) rows.set(1, []); // (an office east of the centre in row 1 or north of it: row 1 carries the east avenue's link to the town)
    const rs = [...rows.keys()].sort((a, b) => a - b), key = rs.map(r => r + ':' + rows.get(r)!.map(F => F.c + F.id).sort().join()).join('|'); if (key === OS.net.key) return;
    const N = new Map<string, NetNode>(), L: THREE.BufferGeometry[] = [], RD = '#1f242d', LNC = '#4d5460', IS = '#18251d', KB = '#59606c', KC = '#3a404b';
    const R: Ring[] = [], RA: [number, number, number[]][] = [], kc: [number, number, number, number][] = [], lz: LaneZone[] = [], J: Junction[] = [], CR: Corner[] = [];
    const node = (id: string, x: number, z: number) => N.set(id, { x, z, e: [] });
    const edge = (a: string, b: string, pts?: P2[] | null, o: Partial<NetEdge> = {}) => { const A = N.get(a)!, B = N.get(b)!, P: P2[] = pts || [[A.x, A.z], [B.x, B.z]]; let len = 0; for (let i = 1; i < P.length; i++) len += Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]);
      const e: NetEdge & { c: number } = Object.assign({ to: b, pts: P, len }, o, { c: len * (o.ln === 0 ? INC : 1) + (o.lc ? LCC : 0) }); A.e.push(e); return e; };
    // a lane change from node a to node b in the other lane: on along a's lane, then an S-curve of LC metres that ends LCE metres before b (on a
    // short stretch: at its end, or over all of it) (end: b's partner in a's lane). Each S-curve is kept in lz: traffic.ts lets a vehicle start it only when the other lane has a gap
    const lcPts = (a: string, end: string, b: string): P2[] => { const A = N.get(a)!, E = N.get(end)!, B = N.get(b)!, d = Math.hypot(E.x - A.x, E.z - A.z), ux = (E.x - A.x) / d, uz = (E.z - A.z) / d, h = Math.atan2(ux, uz);
      if (d < LC + 2) { lz.push({ x0: A.x, z0: A.z, x1: B.x, z1: B.z, h }); return bez([A.x, A.z], h, [B.x, B.z], h, d * .4); }
      const e = d >= LC + LCE + 4 ? LCE : 0, q: P2 = [A.x + ux * (d - LC - e), A.z + uz * (d - LC - e)], qb: P2 = [B.x - ux * e, B.z - uz * e]; lz.push({ x0: q[0], z0: q[1], x1: qb[0], z1: qb[1], h });
      return [[A.x, A.z], ...bez(q, h, qb, h, LC * .4), ...(e ? [[B.x, B.z] as P2] : [])]; };
    // both lanes from a to b; lc: a vehicle may change lanes on the way
    const seg = (a: string, b: string, lc: boolean) => { for (const l of [0, 1]) { edge(lid(a, l), lid(b, l), null, { ln: l }); if (lc) edge(lid(a, l), lid(b, 1 - l), lcPts(lid(a, l), lid(b, l), lid(b, 1 - l)), { ln: 1 - l, lc: true }); } };
    const dash = (x0: number, z0: number, x1: number, z1: number, skip: (x: number, z: number) => boolean) => { const d = Math.hypot(x1 - x0, z1 - z0), ux = (x1 - x0) / d, uz = (z1 - z0) / d;
      for (let s = 2; s < d - 1; s += 4) { const x = x0 + ux * s, z = z0 + uz * s; if (!skip(x, z)) L.push(ux ? bx(1.6, .012, .08, x, .046, z, LNC) : bx(.08, .012, 1.6, x, .046, z, LNC)); } };
    const inRing = (x: number, z: number) => R.some(c => Math.hypot(x - c[0], z - c[1]) < ZB + 1.1) // (lines stop short of the zebra; at a junction at the stop line, a corner has its own)
      || J.some(j => Math.abs(x - j.x) < SL + .2 && Math.abs(z - j.z) < SL + .2) || CR.some(c => Math.abs(x - c.x) < AL && Math.abs(z - c.z) < AL);
    // paint on a straight two-way road: a solid centre line (broken where a road joins or leaves: the keep-clear boxes and brk) and
    // dashed lines between the two lanes of each direction. brk: [x, z, half length] gaps in the centre line at in roads
    const brk: [number, number, number][] = [], inKc = (x: number, z: number) => kc.some(k => Math.abs(x - k[0]) < k[2] + 1 && Math.abs(z - k[1]) < k[3] + .2);
    const solid = (x0: number, z0: number, x1: number, z1: number, skip: (x: number, z: number) => boolean) => { const d = Math.hypot(x1 - x0, z1 - z0), ux = (x1 - x0) / d, uz = (z1 - z0) / d; let a = -1;
      const put = (s0: number, s1: number) => { const m = (s0 + s1) / 2, x = x0 + ux * m, z = z0 + uz * m; L.push(ux ? bx(s1 - s0, .012, .1, x, .046, z, LNC) : bx(.1, .012, s1 - s0, x, .046, z, LNC)); };
      for (let s = .25; s < d; s += .5) { const x = x0 + ux * s, z = z0 + uz * s, on = !skip(x, z); if (on && a < 0) a = s - .25; if (!on && a >= 0) { put(a, s - .25); a = -1; } } if (a >= 0) put(a, d); };
    const paint = (x0: number, z0: number, x1: number, z1: number) => { const nx = z1 !== z0 ? 1 : 0, nz = 1 - nx, ring = (x: number, z: number) => inRing(x, z) || inKc(x, z);
      solid(x0, z0, x1, z1, (x, z) => ring(x, z) || brk.some(b => Math.abs(x - b[0]) < b[2] && Math.abs(z - b[1]) < RW));
      for (const s of [-1, 1]) dash(x0 + nx * s * RW / 2, z0 + nz * s * RW / 2, x1 + nx * s * RW / 2, z1 + nz * s * RW / 2, ring); };
    const road = (x0: number, z0: number, x1: number, z1: number) => { L.push(z1 !== z0 ? bx(RW * 2, .04, Math.abs(z1 - z0), x0, .02, (z0 + z1) / 2, RD) : bx(Math.abs(x1 - x0), .04, RW * 2, (x0 + x1) / 2, .02, z0, RD)); RS.push([x0, z0, x1, z1]); }, RS: [number, number, number, number][] = []; // every straight two-way road (painted once the net is done)
    // a roundabout: arm k points to angle k·90° (0 east, 1 south, 2 west, 3 north); traffic circles towards smaller angles. Two lanes: the outer
    // one turns right or goes straight on, the inner one goes straight on, turns left or back (on a roundabout with one or two arms both lanes may do anything)
    // A crossing (rb) is a roundabout only where it has to be or the map's seed says so: one arm (a turning circle), four arms unlit, or
    // forced (ring, or a turn rule ok). Two arms: plain road (straight on or a rounded corner). Three arms: a T-junction (the through road has
    // priority, the side road gives way at shark teeth; some get lights). Four arms lit: a crossing with lights. All share the nodes :i<k> / :o<k>
    const rb = (id: string, x: number, z: number, arms: number[], ok?: (a: number, b: number, l: number) => boolean, mn?: boolean, ring?: boolean) => {
      for (const k of arms) { const f = k * Math.PI / 2, cu = Math.cos(f), su = Math.sin(f);
        for (const l of [0, 1]) { node(lid(id + ':i' + k, l), x + AL * cu + LN[l] * su, z + AL * su - LN[l] * cu); node(lid(id + ':o' + k, l), x + AL * cu - LN[l] * su, z + AL * su + LN[l] * cu); } }
      const n = arms.length;
      if (!(ring || ok || n === 1 || (n === 4 && hsh(x, z, 2) >= .5))) {
        const lit = n === 4 || (n === 3 && hsh(x, z, 1) < .35);
        const tr = (a: number, b: number, li: number, lo: number, t: Turn, extra = 0) => { const E = N.get(lid(id + ':i' + a, li))!, X = N.get(lid(id + ':o' + b, lo))!, fa = a * Math.PI / 2, fb = b * Math.PI / 2, d = Math.hypot(X.x - E.x, X.z - E.z);
          const P: P2[] = t === 'S' ? [[E.x, E.z], [X.x, X.z]] : bez([E.x, E.z], Math.atan2(-Math.cos(fa), -Math.sin(fa)), [X.x, X.z], Math.atan2(Math.cos(fb), Math.sin(fb)), t === 'U' ? AL * .9 : d * .39);
          const e = edge(lid(id + ':i' + a, li), lid(id + ':o' + b, lo), P, { ln: lo, t, j: true }); e.c += extra; };
        if (n === 2) { for (const a of arms) for (const b of arms) if (a !== b) for (const l of [0, 1]) tr(a, b, l, l, TURN[((a - b) % 4 + 4) % 4]); if (Math.abs(arms[0] - arms[1]) !== 2) CR.push({ x, z, arms: [...arms] }); return; }
        for (const a of arms) for (const b of arms) { const t = TURN[((a - b) % 4 + 4) % 4];
          if (t === 'S') { tr(a, b, 0, 0, t); tr(a, b, 1, 1, t); } else if (t === 'R') tr(a, b, 1, 1, t); else if (t === 'L') tr(a, b, 0, 0, t); else tr(a, b, 0, 1, t, 60); }
        J.push({ x, z, arms: [...arms], lit, main: arms.includes(0) && arms.includes(2) ? 0 : 1, ph: hsh(x, z, 3) * CYC, c: [x, z, 4.2, 0, n] }); return; }
      R.push([x, z, RO, RIN, arms.length]); RA.push([x, z, arms]); // mn: false keeps the "both lanes may do anything" rule on a roundabout with more arms (ok then decides)
      ok = ok || (() => true);
      const many = mn ?? arms.length > 2;
      const C = R[R.length - 1];
      for (const a of arms) for (const b of arms) for (const l of [0, 1]) { const t = TURN[((a - b) % 4 + 4) % 4]; if ((many && (l ? t !== 'R' && t !== 'S' : t === 'R')) || !ok(a, b, l)) continue;
        // the inner lane leaves into the outer lane of the exit arm: it moves over to the outer lane before its exit (SPR, a lane change kept in lz);
        // on a very short way round (a right turn on a roundabout with two arms) it drives the outer lane's line
        const fa = a * Math.PI / 2, fb = b * Math.PI / 2, t0 = fa - BE[l]; let t1 = fb + BE[1]; while (t1 >= t0) t1 -= 2 * Math.PI;
        const sp = l ? 0 : Math.min(SPR, (t0 - t1) * .6), r = l || sp < .5 ? RO : RIN, ts = t1 + sp;
        const E = N.get(lid(id + ':i' + a, l))!, X = N.get(id + ':o' + b)!, p0: P2 = [x + r * Math.cos(t0), z + r * Math.sin(t0)], p1: P2 = [x + RO * Math.cos(t1), z + RO * Math.sin(t1)];
        const tg = (t: number) => Math.atan2(Math.sin(t), -Math.cos(t)), P: P2[] = bez([E.x, E.z], Math.atan2(-Math.cos(fa), -Math.sin(fa)), p0, tg(t0), Math.hypot(p0[0] - E.x, p0[1] - E.z) * .4);
        if (r === RO) { const n = Math.max(2, Math.ceil((t0 - t1) / .12)); for (let i = 1; i <= n; i++) { const tt = t0 + (t1 - t0) * i / n; P.push([x + RO * Math.cos(tt), z + RO * Math.sin(tt)]); } }
        else { const n = Math.max(1, Math.ceil((t0 - ts) / .12)), m = Math.max(4, Math.ceil(sp / .1)); for (let i = 1; i <= n; i++) { const tt = t0 + (ts - t0) * i / n; P.push([x + RIN * Math.cos(tt), z + RIN * Math.sin(tt)]); }
          for (let i = 1; i <= m; i++) { const f = i / m, tt = ts + (t1 - ts) * f, rr = RIN + (RO - RIN) * f * f * (3 - 2 * f); P.push([x + rr * Math.cos(tt), z + rr * Math.sin(tt)]); }
          lz.push({ x0: x + RIN * Math.cos(ts), z0: z + RIN * Math.sin(ts), x1: p1[0], z1: p1[1], h: 0, c: C }); }
        P.push(...bez(p1, tg(t1), [X.x, X.z], Math.atan2(Math.cos(fb), Math.sin(fb)), Math.hypot(p1[0] - X.x, p1[1] - X.z) * .4).slice(1)); edge(lid(id + ':i' + a, l), id + ':o' + b, P, { ln: l, t }); }
      L.push(cy(RT, .06, x, .03, z, RD, 40), cy(RIN - 1.05, .16, x, .08, z, KB, 28), cy(RIN - 1.2, .3, x, .15, z, IS, 28), cy(.1, 3.2, x, 1.6, z, KB, 8), sp(.28, x, 3.3, z, '#ffd9a0'));
      const rm = (RO + RIN) / 2; for (let i = 0; i < 24; i++) { const th = (i + .5) * Math.PI / 12; L.push(bx(.8, .012, .08, x + rm * Math.cos(th), .046, z + rm * Math.sin(th), LNC, -th - Math.PI / 2)); } // the line between the two lanes
    };
    // shark teeth: a row of white triangles across a lane (centre x, z, half width hw across the direction (ux, uz) they point to: at the
    // driver who gives way)
    const teeth = (x: number, z: number, ux: number, uz: number, hw: number) => { for (let o = -hw + .45; o < hw - .2; o += .9) { const g = cy(.42, .012, 0, 0, 0, '#c8ccd2', 3); g.rotateY(Math.atan2(ux, uz)); g.translate(x - uz * o, .047, z + ux * o); L.push(g); } };
    const keep = (x: number, z: number, s = -1) => { kc.push([x, z, 2.6, RW / 2]); for (const [w, d, dx, dz] of [[5.2, .08, 0, -RW / 2 + .04], [5.2, .08, 0, RW / 2 - .04], [.08, RW, -2.56, 0], [.08, RW, 2.56, 0]]) L.push(bx(w, .012, d, x + dx, .047, z + dz, KC));
      teeth(x, z + s * (RW / 2 + .7), 0, s, (RW - .2) / 2); }; // a box kept clear where an out road joins (s: the out road's side), shark teeth across the out road
    const access = (F: Office, zs: number) => { const id = F.id, ox = F.ox; for (const l of [0, 1]) { node(lid(id + ':a', l), ox + SLIPX, zs - LN[l]); node(lid(id + ':b', l), ox - SLIPX, zs - LN[l]); edge(lid(id + ':a', l), lid(id + ':b', l), null, { ln: l }); }
      node(id + ':in', ox + SLIPX, F.oz + SVZ); node(id + ':out', ox - SLIPX, F.oz + SVZ); edge(id + ':a', id + ':in'); edge(id + ':out', id + ':b'); keep(ox - SLIPX, zs - RW / 2); brk.push([ox + SLIPX, zs, 3.6]); };
    // the grid round the town centre (layout.ts SLOTS, cellX, lineX): lattice line j runs north–south at x lineX(j) (0: the avenue, j > 0 west,
    // j < 0 east). Office c stands between lines c + 1 and c with its own roundabout (<id>:R) on its far side from the avenue, line own(c). A
    // row's street runs in one piece from its west end to its east end, except in the centre's rows (row 0 and north of it), which have a west
    // part and an east part: the west part ends at the avenue (row 0: on past the bank to E); the east part starts on line EA (the east
    // avenue, B<row>, east of the shops). Every row has an avenue roundabout A<row> (with an office north of row -1 every row from there to
    // row -1 is built, empty or not; row -2's has an east arm, the apartments road). Two rows next to each other link where both have an
    // office in the same column (a cross road), and the rows with an east part link on line EA down to row 1, whose street runs on east from
    // the avenue. Roundabout E's south arm runs down line -1 (x EX) to the first row south of row 0, and on to the row below that where it has
    // an office in column -1. A filler roundabout J<row>:<line> stands on a line that links without an office there
    const EA = -2, shopArm: [number, number, number, number][] = [], shopWalk: P2[][] = [], south = rs[rs.length - 1], zOf = (r: number) => r * CD + STZ, own = (c: number) => c >= 0 ? c + 1 : c;
    const topA = rs[0], lk = new Set<string>(), LK: [number, number, number][] = [], lkS = new Set<string>();
    const addLK = (rn: number, r: number, j: number) => { if (lkS.has(rn + ':' + r + ':' + j)) return; lkS.add(rn + ':' + r + ':' + j); LK.push([rn, r, j]); lk.add(r + ':' + j + ':3'); lk.add(rn + ':' + j + ':1'); }; // [north row, south row, line]; '<row>:<line>:<arm>'
    for (let i = 1; i < rs.length; i++) { const rn = rs[i - 1], r = rs[i]; for (const F of rows.get(r)!) if (rows.get(rn)!.some(G => G.c === F.c)) addLK(rn, r, own(F.c)); }
    const RE = rs.filter(r => r === 1 ? eaUse : r <= 0 && rows.get(r)!.some(F => F.c < 0)); for (let i = 1; i < RE.length; i++) addLK(RE[i - 1], RE[i], EA); // the east avenue
    const rES = rs.find(r => r >= 1); // the row E's south arm runs down to (on line -1: lineX(-1) = EX)
    if (rES != null) { lk.add(rES + ':-1:3'); const nx = rs[rs.indexOf(rES) + 1]; if (nx === rES + 1 && rows.get(nx)!.some(F => F.c === -1)) addLK(rES, nx, -1); }
    const stops = new Map<number, number[]>(); for (const r of rs) { const S = new Set(rows.get(r)!.map(F => own(F.c)));
      S.add(0); if (r === rES) S.add(-1); if (RE.includes(r)) S.add(EA); if (r <= -2 && rows.get(r)!.some(F => F.c === EA)) S.add(EA + 1);
      for (const [rn, rr, j] of LK) { if (rn === r) S.add(j); if (rr === r) S.add(j); } stops.set(r, [...S].sort((a, b) => lineX(a) - lineX(b))); }
    const parts = (r: number) => { const S = stops.get(r)!; return (r <= 0 ? [S.filter(j => j >= 0), S.filter(j => j < 0)] : [S]).filter(P => P.length); }; // each part's lines, west to east
    const span = (r: number) => parts(r).map(P => [lineX(P[0]), r === 0 && P[P.length - 1] === 0 ? EX : lineX(P[P.length - 1])]);
    const sid = (r: number, j: number) => { const F = rows.get(r)!.find(G => own(G.c) === j); return F ? F.id + ':R' : !j ? 'A' + r : j === EA && RE.includes(r) ? 'B' + r : 'J' + r + ':' + j; };
    // the in roads: every roundabout on the south edge (the southmost on its line, with no street south of it across that line) has a road south
    // to the edge of the town, where traffic comes in (gate<line>:in, the avenue's is gate:in) and leaves (:out)
    const GL: [number, number][] = [[0, south]]; for (const j of new Set([...stops.values()].flat())) { if (!j) continue; const x = lineX(j); let rr = -Infinity; for (const r of rs) if (stops.get(r)!.includes(j)) rr = r;
      if (rs.every(r => r <= rr || !span(r).some(([a, b]) => x > a - 1 && x < b + 1))) GL.push([j, rr]); }
    const gateAt = (r: number, j: number) => GL.some(g => g[0] === j && g[1] === r);
    const xeH = HOME_SITE.x + 44; let P0E: number | null = null; // the apartments road's east end (home:E); row -2's east part starts on line P0E: the road runs on east to it
    for (const r of rs) { const zs = zOf(r), offs = rows.get(r)!;
      for (const P of parts(r)) {
        const toH = r === -2 && P[0] < 0 && lineX(P[0]) > xeH + 12; if (toH) P0E = P[0];
        // a roundabout on each line: east and west along the street (not past the part's ends; the avenue's in row 0 also east, to the bank),
        // the avenue's north and south, else south and north where it links to the row below / above (or an in road)
        P.forEach((j, i) => rb(sid(r, j), lineX(j), zs, [...(i < P.length - 1 || (!j && (!r || r === -2)) ? [0] : []), ...(i || toH ? [2] : []),
          ...(!j ? [1, ...(r > topA || topA >= -1 ? [3] : [])] : [...(lk.has(r + ':' + j + ':1') || gateAt(r, j) ? [1] : []), ...(lk.has(r + ':' + j + ':3') ? [3] : [])])]));
        for (let i = 1; i < P.length; i++) { const w = sid(r, P[i - 1]), e = sid(r, P[i]), xw = lineX(P[i - 1]), xe = lineX(P[i]), F = offs.find(G => G.ox > xw && G.ox < xe);
          // westbound: past the office's in road, then its out road (both off the outer lane); eastbound back (a vehicle may change lanes on the way)
          if (F) { access(F, zs); seg(e + ':o2', F.id + ':a', true); seg(F.id + ':b', w + ':i0', false); } else seg(e + ':o2', w + ':i0', true);
          if (F && F.stn) { edge(F.id + ':in', F.id + ':out'); edge(F.id + ':out', F.id + ':b.0'); } // a station: along its yard lane; its out road joins either lane (as the first station's does)
          seg(w + ':o0', e + ':i2', true);
        }
        const [x0, x1] = [lineX(P[0]), r === 0 && P[P.length - 1] === 0 ? EX : lineX(P[P.length - 1])]; if (x1 > x0) road(x0, zs, x1, zs); }
      if (r === 0) { rb('E', EX, zs, [2, 1, 0], (a, b) => !(a === 0 && b === 0)); // the east roundabout: the street from the west, the road south (line -1), the shops arm east (no turning back into the shops)
        { // the shops arm: one lane each way from the roundabout's east arm, splitting to the car park entry (south) and exit (north)
          const [ix, iz] = SHOP_GATES.entry.p, [ox, oz] = SHOP_GATES.exit.p, O = N.get('E:o0')!, I = N.get('E:i0')!, xs = EX + AL + 1.5, k = (ix - xs) * .45;
          node('shop:in', ix, iz); node('shop:out', ox, oz);
          const Pin: P2[] = [[O.x, O.z], ...bez([xs, O.z], Math.PI / 2, [ix, iz], Math.PI / 2, k)], Pout: P2[] = [...bez([ox, oz], -Math.PI / 2, [xs, I.z], -Math.PI / 2, k), [I.x, I.z]];
          edge('E:o0', 'shop:in', Pin); edge('shop:out', 'E:i0', Pout); shopWalk.push(Pin, Pout);
          const x0 = EX + RT - 1; shopArm.push([EX, zs, xs + .3, zs]); L.push(bx(xs + .3 - x0, .04, RW * 2, (x0 + xs + .3) / 2, .02, zs, RD)); dash(x0, zs, xs + .3, zs, (x, z) => inRing(x, z));
          for (const P of [Pin, Pout]) for (let i = 1; i < P.length; i++) { const [ax, az] = P[i - 1], [bx2, bz] = P[i], dx = bx2 - ax, dz = bz - az, d = Math.hypot(dx, dz); if (d > 1e-3) L.push(bx(d + .25, .04, RW - .2, (ax + bx2) / 2, .021, (az + bz) / 2, RD, Math.atan2(-dz, dx))); } }
        for (const l of [0, 1]) { node(lid('bank:a', l), BIX, zs - LN[l]); node(lid('bank:b', l), BOX, zs - LN[l]); node(lid('pol:b', l), POX, zs + LN[l]); node(lid('pol:a', l), PIX, zs + LN[l]); }
        node('bank:in', BIX, BZ); node('bank:out', BOX, AZ); seg('E:o2', 'bank:a', false); seg('bank:a', 'bank:b', true); seg('bank:b', 'A0:i0', false); edge('bank:a', 'bank:in'); edge('bank:out', 'bank:b'); edge('bank:out', 'bank:b.0'); keep(BOX, zs - RW / 2); brk.push([BIX, zs, 3.6]); // the bank's out road joins either lane (the inner one to turn left at the avenue)
        node('pol:in', PIX, PLZ); node('pol:out', POX, PLZ); edge('pol:a', 'pol:in'); edge('pol:in', 'pol:out'); edge('pol:out', 'pol:b'); edge('pol:out', 'pol:b.0'); seg('A0:o0', 'pol:b', false); seg('pol:b', 'pol:a', true); seg('pol:a', 'E:i2', false); keep(POX, zs + RW / 2, 1); brk.push([PIX, zs, 3.6]); } // police station: in off the eastbound lanes (a right turn, PIX), along the yard, out onto the street
    }
    // north–south: the avenue between the rows, and a cross road between two office roundabouts in the same column of two rows next to each other
    const link = (s: string, n: string) => { seg(s + ':o3', n + ':i1', true); seg(n + ':o1', s + ':i3', true); };
    for (let i = 1; i < rs.length; i++) link('A' + rs[i], 'A' + rs[i - 1]);
    if (rES != null && rows.has(0)) { link(sid(rES, -1), 'E'); road(EX, zOf(0), EX, zOf(rES)); } // E's south arm: down line -1 to the rows south
    for (const [rn, r, j] of LK) { link(sid(r, j), sid(rn, j)); road(lineX(j), zOf(rn), lineX(j), zOf(r)); }
    // the apartments road: east off the avenue on row -2's line (its roundabout A-2, or with no row -2 a roundabout home:N there, linked
    // to the top avenue roundabout) along the apartments' front, behind the bank and the park, to a turning roundabout (home:E) past the
    // site's east end; the in road (east) and the out road (west) are off the westbound lane, on the way back
    { const zh = HOME_SITE.z + 6.5, xe = HOME_SITE.x + 44, H = rows.has(-2) ? 'A-2' : 'home:N', toW = (x: number, z: number): P2 => [HOME_SITE.x + x, HOME_SITE.z + z];
      if (H === 'home:N') { rb('home:N', 0, zh, [1, 0]); link('A' + topA, 'home:N'); road(0, zh, 0, zOf(topA)); } rb('home:E', xe, zh, P0E != null ? [2, 0] : [2], undefined, undefined, true);
      if (P0E != null) { const b = sid(-2, P0E); seg('home:E:o0', b + ':i2', true); seg(b + ':o2', 'home:E:i0', true); road(xe, zh, lineX(P0E), zh); } // on east along row -2's line to its east part (B-2)
      const [ix] = toW(HOME_LOT.IXX, 0), [ox] = toW(HOME_LOT.OXX, 0);
      for (const l of [0, 1]) { node(lid('apt:a', l), ix, zh - LN[l]); node(lid('apt:b', l), ox, zh - LN[l]); edge(lid('apt:a', l), lid('apt:b', l), null, { ln: l }); }
      const { IXX, OXX, LHW, XLZ } = HOME_LOT, lane = ([[IXX, 0], [IXX, XLZ + LHW], [IXX - LHW, XLZ], [OXX + LHW, XLZ], [OXX, XLZ + LHW], [OXX, 0]] as P2[]).map(p => toW(p[0], p[1]));
      node('apt:in', ix, HOME_SITE.z); node('apt:out', ox, HOME_SITE.z); edge('apt:a', 'apt:in'); edge('apt:in', 'apt:out', lane); edge('apt:out', 'apt:b');
      seg(H + ':o0', 'home:E:i2', true); seg('home:E:o2', 'apt:a', true); seg('apt:b', H + ':i0', false); keep(ox, zh - RW / 2); brk.push([ix, zh, 3.6]);
      road(0, zh, xe, zh); }
    const zg = zOf(south) + 26, zn = zOf(topA), gates: InRoad[] = [];
    for (const [j, r] of GL) { const s = sid(r, j), x = lineX(j), gi = j ? 'gate' + j + ':in' : 'gate:in', go = j ? 'gate' + j + ':out' : 'gate:out'; node(gi, x + LO, zg); node(go, x - LO, zg); gates.push({ i: gi, o: go, x });
      edge(gi, s + ':i1', null, { ln: 1 }); edge(gi, s + ':i1.0', lcPts(gi, s + ':i1', s + ':i1.0'), { ln: 0, lc: true }); edge(s + ':o1', go, null, { ln: 1 }); edge(s + ':o1.0', go, lcPts(s + ':o1.0', s + ':o1.0', go), { ln: 1, lc: true });
      road(x, j ? zOf(r) : zn, x, zg + 4); }
    // junctions and corners: tarmac in each rounded kerb between two arms (a quarter ring round P, AL out along both arms, out to the box's
    // corner); a corner's outer side a quarter disc; a junction's stop lines, shark teeth on an unlit side road, posts with lights; a corner's
    // lines as arcs. Shark teeth at every roundabout entry
    const qr = (px: number, pz: number, t0: number, r0: number, r1: number, h: number, c: string, n = 20) => { const rm = (r0 + r1) / 2, du = Math.PI / 2 / n;
      for (let i = 0; i < n; i++) { const um = t0 + (i + .5) * du; L.push(bx(r1 * du + .04, h, r1 - r0, px + rm * Math.cos(um), h / 2, pz + rm * Math.sin(um), c, -um - Math.PI / 2)); } };
    const qdash = (px: number, pz: number, t0: number, r: number, w: number, on: number, off: number) => { const n = Math.max(1, Math.round(r * Math.PI / 2 / (on + off)));
      for (let i = 0; i < n; i++) { const um = t0 + (i + .5) * Math.PI / 2 / n, len = off ? on : r * Math.PI / 2 / n + .02; L.push(bx(len, .012, w, px + r * Math.cos(um), .046, pz + r * Math.sin(um), LNC, -um - Math.PI / 2)); } };
    if (lampG) { scene.remove(lampG); lampG.traverse(o => { if (o instanceof THREE.Mesh) o.geometry.dispose(); }); } lampG = new THREE.Group(); LAMPS = [];
    for (const c of [...J, ...CR]) { const { x, z, arms } = c, jn = (c as Junction).c ? c as Junction : null;
      for (const a of arms) { const b = (a + 1) % 4; if (!arms.includes(b)) continue; const fa = a * Math.PI / 2, fb = b * Math.PI / 2, px = x + AL * (Math.cos(fa) + Math.cos(fb)), pz = z + AL * (Math.sin(fa) + Math.sin(fb));
        qr(px, pz, fa + Math.PI, AL - RW, (AL - RW) * Math.SQRT2 + .1, .041, RD);
        if (!jn) { qr(x, z, fa + Math.PI, .01, RW, .04, RD, 12); qdash(px, pz, fa + Math.PI, AL, .1, 1, 0); for (const s of [-1, 1]) qdash(px, pz, fa + Math.PI, AL + s * RW / 2, .08, 1.6, 2.4); } } // (a corner's outer side: opposite the kerb, round its centre)
      if (!jn) continue;
      const G: THREE.BufferGeometry[][] = [[], [], [], [], [], []];
      for (const k of arms) { const f = k * Math.PI / 2, cu = Math.cos(f), su = Math.sin(f), ax = k % 2, side = !jn.lit && ax !== jn.main && arms.length === 3;
        if (jn.lit || side) L.push(bx(.3, .012, RW - .2, x + SL * cu + (RW / 2) * su, .047, z + SL * su - (RW / 2) * cu, '#c8ccd2', -f));
        if (side) teeth(x + (SL + .7) * cu + (RW / 2) * su, z + (SL + .7) * su - (RW / 2) * cu, cu, su, (RW - .2) / 2);
        if (!jn.lit) continue; const qx = x + SL * cu + (RW + .5) * su, qz = z + SL * su - (RW + .5) * cu; // a post on the right of the lanes in
        L.push(cy(.07, 2.6, qx, 1.3, qz, '#3a404b', 6), bx(.32, .9, .32, qx, 2.85, qz, '#22262d', -f));
        [3.15, 2.85, 2.55].forEach((y, i) => { L.push(sp(.1, qx + cu * .14, y, qz + su * .14, '#15181d')); G[ax * 3 + i].push(sp(.105, qx + cu * .15, y, qz + su * .15, '#ffffff')); }); }
      const m = G.map((g, i) => { const M = new THREE.Mesh(g.length ? merge(g) : new THREE.BufferGeometry(), LMAT[i % 3]); M.visible = false; lampG!.add(M); return M; }); LAMPS.push({ J: jn, m }); }
    scene.add(lampG); lightTick();
    for (const [x, z, arms] of RA) for (const k of arms) { const f = k * Math.PI / 2, cu = Math.cos(f), su = Math.sin(f); teeth(x + (RT + .6) * cu + (RW / 2) * su, z + (RT + .6) * su - (RW / 2) * cu, cu, su, (RW - .2) / 2); }
    for (const [x0, z0, x1, z1] of RS) paint(x0, z0, x1, z1);
    if (roadM) { scene.remove(roadM); roadM.geometry.dispose(); } roadM = mesh(merge(L), VC, false, true); scene.add(roadM);
    buildGreen(RS, R, RA, [...kc.map(k => [k[0], k[1]] as P2), ...brk.map(b => [b[0], b[1] - RW / 2] as P2)], zg, gates.map(g => g.x), shopArm, shopWalk, [...N.values()].flatMap(n => n.e.map(e => e.pts)), J, CR); // (every in road leaves on the north side)
    { // the ground, the fog and the camera's depth range grow with the town. In the isometric view a screen corner lies far out along the
      // diagonal: at the widest zoom-out (a bit past the whole-town fit, with the side columns) it is about 1.6 town widths from the middle.
      // So the ground reaches 300 m plus 1.5 town widths past the town all round, the fog starts past that, and nothing on it is clipped
      const X = [...R.map(c => c[0]), ...J.map(j => j.x), ...CR.map(c => c.x)], Z = [...R.map(c => c[1]), ...J.map(j => j.z), ...CR.map(c => c.z)], tx0 = Math.min(...X), tx1 = Math.max(...X), tz0 = Math.min(...Z), tz1 = Math.max(zg, ...Z);
      const span = Math.max(tx1 - tx0, tz1 - tz0, 200), M = 300 + 1.5 * span, x0 = tx0 - M, x1 = tx1 + M, z0 = tz0 - M, z1 = tz1 + M, half = Math.max(x1 - x0, z1 - z0) / 2;
      OS.ground.scale.set((x1 - x0) / 900, (z1 - z0) / 900, 1); OS.ground.position.set((x0 + x1) / 2, -.02, (z0 + z1) / 2);
      const fg = scene.fog as THREE.Fog | null, far = Math.max(460, half * 1.5); if (fg) { fg.far = far; fg.near = far - 220; }
      const cam = OS.ctx.camera, d = Math.max(600, half * 1.6); if (cam.far !== d) { cam.near = -d; cam.far = d; cam.updateProjectionMatrix(); } } // (stage.ts starts at -600..600)
    OS.net = { key, N, R, rq: index(R, c => [c[0], c[1], ZB + 3]), kc, lz, zg, zn, x0: Math.min(0, ...[...R.map(c => c[0]), ...J.map(j => j.x), ...CR.map(c => c.x)].map(x => x - RT - 1)), gates, J, jq: index(J, j => [j.x, j.z, AL + 2]) };
  }
  function route(a: string, b: string, sir?: boolean | 'truck'): RouteP | null { // cheapest way over the lanes: a list of [x, z] (sir: a unit with its lights on, which may also take the short cuts; 'truck': an armoured car, which may turn left in and out, truckNet)
    const N = OS.net.N, X = sir === 'truck' ? truckNet() : sir ? sirenNet() : null; if (!N.has(a) || !N.has(b)) return null; const D = new Map<string, number>([[a, 0]]), prev = new Map<string, [string, NetEdge]>(), done = new Set<string>();
    const Hd: number[] = [0], Hk: string[] = [a]; // a binary heap of [cost, node] (the net has thousands of nodes with a big town)
    const push = (d: number, k: string) => { let i = Hd.length; Hd.push(d); Hk.push(k); while (i) { const p = (i - 1) >> 1; if (Hd[p] <= d) break; Hd[i] = Hd[p]; Hk[i] = Hk[p]; i = p; } Hd[i] = d; Hk[i] = k; };
    const pop = () => { const k = Hk[0], d = Hd.pop()!, s = Hk.pop()!, n = Hd.length; if (n) { let i = 0; for (;;) { let c = 2 * i + 1; if (c >= n) break; if (c + 1 < n && Hd[c + 1] < Hd[c]) c++; if (Hd[c] >= d) break; Hd[i] = Hd[c]; Hk[i] = Hk[c]; i = c; } Hd[i] = d; Hk[i] = s; } return k; };
    for (;;) { if (!Hk.length) return null; const u = pop(); if (done.has(u)) continue; const du = D.get(u)!; if (u === b) break; done.add(u);
      for (const e of X && X.has(u) ? [...(N.has(u) ? N.get(u)!.e : []), ...X.get(u)!] : N.get(u)?.e ?? []) { const d = du + (e.c ?? e.len); if (d < (D.get(e.to) ?? Infinity)) { D.set(e.to, d); prev.set(e.to, [u, e]); push(d, e.to); } } }
    const P = [] as unknown as RouteP, W: SirenWait[] = [], K: string[] = [], ES: [string, NetEdge][] = []; for (let k = b; k !== a;) { const [u, e] = prev.get(k)!; P.unshift(...e.pts.slice(1)); ES.unshift([u, e]); if (e.w) W.push(e.w); if (e.sc) K.push(e.sc); k = u; } P.unshift([N.get(a)!.x, N.get(a)!.z]); P.w = W; P.k = K; P.es = ES; return P; // w: lanes a short cut joins; es: the edges taken (from node, edge)
  }
  // short cuts for a unit with its lights on, built from the lanes as they are (no fixed lane positions): a left turn straight over the
  // island of a roundabout, and a left turn from an out road across the near lanes into a lane the other way (or into the roundabout entry there)
  const hOf = (P: P2[], end: boolean) => { const n = P.length, a = end ? P[n - 2] : P[0], b = end ? P[n - 1] : P[1]; return Math.atan2(b[0] - a[0], b[1] - a[1]); };
  const plen = (P: P2[]) => { let l = 0; for (let i = 1; i < P.length; i++) l += Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]); return l; };
  const bez = (p0: P2, h0: number, p3: P2, h3: number, k: number) => { const c1 = [p0[0] + Math.sin(h0) * k, p0[1] + Math.cos(h0) * k], c2 = [p3[0] - Math.sin(h3) * k, p3[1] - Math.cos(h3) * k], P: P2[] = [];
    for (let i = 0; i <= 24; i++) { const t = i / 24, u = 1 - t; P.push([u * u * u * p0[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * p3[0], u * u * u * p0[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * p3[1]]); } return P; };
  let SIR: { key: string | null; E: Map<string, NetEdge[]> | null } = { key: null, E: null };
  function sirenNet() { if (SIR.key === OS.net.key) return SIR.E; const N = OS.net.N, E = new Map<string, NetEdge[]>(), add = (u: string, e: NetEdge) => { if (!E.has(u)) E.set(u, []); E.get(u)!.push(e); };
    const hin = new Map<string, number>(); for (const n of N.values()) for (const e of n.e) if (!e.t && !hin.has(e.to)) hin.set(e.to, hOf(e.pts, true));
    const hout = (id: string) => { const n = N.get(id); for (const e of n ? n.e : []) if (!e.t) return hOf(e.pts, false); return null; };
    const entries: { id: string; x: number; z: number; h: number }[] = [], jEnt: typeof entries = []; // roundabout entries, as targets for a left turn across the street; junction entries (for a police station's out road only)
    for (const [u, n] of N) for (const e of n.e) { if (e.j && hin.has(u) && !jEnt.some(p => p.id === u)) jEnt.push({ id: u, x: n.x, z: n.z, h: hin.get(u)! });
      if (!e.t || e.j) continue; const B = N.get(e.to)!; // (a junction has no island to cut over)
      if (!entries.some(p => p.id === u) && hin.has(u)) entries.push({ id: u, x: n.x, z: n.z, h: hin.get(u)! });
      const h0 = hin.get(u), h3 = hout(e.to); if (h0 == null || h3 == null || e.t !== 'L') continue; // only a left turn (three quarters of the way round)
      const P = bez([n.x, n.z], h0, [B.x, B.z], h3, Math.hypot(B.x - n.x, B.z - n.z) / 3); add(u, { to: e.to, pts: P, len: plen(P), sc: 'island' }); } // over the island, past the lamp post in the middle
    const L = OS.samples(), hIn = (id: string) => { const H: { e: NetEdge; h: number }[] = []; for (const n of N.values()) for (const e of n.e) if (e.to === id && !e.lc) H.push({ e, h: hOf(e.pts, true) }); return H; };
    for (const [u, n] of N) { if (OS.ringAt(n.x, n.z)) continue; for (const e of n.e) { const J = N.get(e.to); if (!J || e.t || e.lc || OS.ringAt(J.x, J.z)) continue; const hj = hOf(e.pts, true), H = hIn(e.to);
      for (const f of J.e) { if (f.lc || f.t) continue; const ho = hOf(f.pts, false); if (Math.abs(OS.adiff(hj, ho)) < .8 || !H.some(g => g.e !== e && Math.abs(OS.adiff(g.h, ho)) < .3)) continue; // e joins a lane that runs on through J: e is an out road
        if (n.e.some(g => g !== e && N.get(g.to) && N.get(g.to)!.e.some(k => Math.abs(OS.adiff(hOf(k.pts, false), ho + Math.PI)) < .3))) continue; // it can already turn the other way
        // the other way: a straight lane sample or a roundabout entry, 1..4.5 m across and 2..9 m on in its own direction. A police station's out road
        // may also cut to a junction's entry up to 6.5 m across (the far lanes of a wide street), as well: else a unit called the other way drives round the block
        const pol = /^pol[^:]*:out$/.test(u);
        for (const [T, am] of (pol ? [[[...entries, ...L], 4.5], [jEnt, 6.5]] : [[[...entries, ...L], 4.5]]) as [TurnTarget[], number][]) { let best: TurnTarget | null = null, bs = Infinity;
        for (const p of T) { if (Math.abs(OS.adiff(p.h, ho + Math.PI)) > .2 || (!p.id && (p.b! < 3 || OS.ringAt(p.x, p.z)))) continue; const dx = p.x - J.x, dz = p.z - J.z, al = dx * Math.sin(p.h) + dz * Math.cos(p.h), ac = Math.abs(dx * Math.cos(p.h) - dz * Math.sin(p.h));
          if (ac < 1 || ac > am || al < 2 || al > 9) continue; const sc = Math.abs(al - 4.5) - (p.id ? 1 : 0); if (sc < bs) { bs = sc; best = p; } }
        if (!best) continue; const P = bez([n.x, n.z], hOf(e.pts, false), [best.x, best.z], best.h, Math.hypot(best.x - n.x, best.z - n.z) / 2.5);
        const w: SirenWait = [best.x, best.z, best.h, J.x - Math.sin(hj) * 2.4, J.z - Math.cos(hj) * 2.4]; // it waits at the line until the lane it joins is clear there
        if (best.id) { add(u, { to: best.id, pts: P, len: plen(P), w, sc: 'cut' }); continue; }
        const v = 'x:' + best.x.toFixed(2) + ',' + best.z.toFixed(2), Q: P2[] = [[best.x, best.z], ...best.e!.pts.slice(best.i! + 1)]; add(u, { to: v, pts: P, len: plen(P), w, sc: 'cut' }); if (!E.has(v)) add(v, { to: best.e!.to, pts: Q, len: plen(Q) }); } } } }
    SIR ={ key: OS.net.key, E }; return E; }
  // an armoured car's left turns (it has no lights to go first: it waits for a gap, armoured-car.ts): out of an office's or the bank's out road
  // across the near lanes into the far inner lane (sirenNet's out road cuts, sc 'cut'), and from the far inner lane, 4..12 m before the in road,
  // across the near lanes into an office's or the bank's in road (sc 'tin': it waits where that edge starts, in its lane)
  let TKN: { key: string | null; E: Map<string, NetEdge[]> | null } = { key: null, E: null };
  function truckNet() { if (TKN.key === OS.net.key && TKN.E) return TKN.E; const N = OS.net.N, S = sirenNet()!, E = new Map<string, NetEdge[]>(), add = (u: string, e: NetEdge) => { if (!E.has(u)) E.set(u, []); E.get(u)!.push(e); };
    // a left turn counts as a quarter of its length, so it beats going on round the roundabout next to the door and back (which costs about
    // the same in metres: without this it never turns across)
    for (const [u, es] of S) for (const e of es) if (e.sc === 'cut' ? /:out$/.test(u) && !/^pol/.test(u) : u.startsWith('x:')) add(u, e.sc === 'cut' ? { ...e, c: e.len * .25 } : e);
    const L = OS.samples();
    for (const id of [...[...bldgs.values()].map(F => F.id + ':in'), 'bank:in', 'apt:in']) { const T = N.get(id), A = N.get(id.slice(0, -3) + ':a'), g = A && A.e.find(e => e.to === id); if (!T || !A || !g) continue;
      const hf = hOf(g.pts, false) - Math.PI / 2; // the far lanes run the other way to the near lane the in road comes off
      for (const [k, a0, a1] of [[0, 2, 4.4], [1, 4.4, 7]] as const) { let best: LaneSample | null = null, bs = Infinity; // from each far lane (k 1: the outer one, also across the inner), about 7 m before
        for (const p of L) { if (p.e.lc || p.e.t || p.e.sc || Math.abs(OS.adiff(p.h, hf)) > .2 || OS.ringAt(p.x, p.z)) continue;
          const dx = A.x - p.x, dz = A.z - p.z, al = dx * Math.sin(hf) + dz * Math.cos(hf), ac = Math.abs(dx * Math.cos(hf) - dz * Math.sin(hf));
          if (ac < a0 || ac > a1 || al < 4 || al > 12) continue; const sc = Math.abs(al - 7); if (sc < bs) { bs = sc; best = p; } }
        if (!best) continue; const v = 'tx:' + k + ':' + id, pre: P2[] = [...best.e.pts.slice(0, best.i + 1), [best.x, best.z]], P = bez([best.x, best.z], best.h, [T.x, T.z], hOf(g.pts, true), Math.hypot(T.x - best.x, T.z - best.z) / 2.5);
        add(best.u, { to: v, pts: pre, len: plen(pre) }); add(v, { to: id, pts: P, len: plen(P), c: plen(P) * .25, sc: 'tin' }); } }
    TKN = { key: OS.net.key, E }; return E; }
  const arc = (cx: number, cz: number, r: number, a0: number, a1: number, n = 10) => Array.from({ length: n + 1 }, (_, i): P2 => { const t = a0 + (a1 - a0) * i / n; return [cx + r * Math.cos(t), cz + r * Math.sin(t)]; });
  return { buildNet, route, plen, bez, arc, sirenNet, park: park_, walks: () => walkL, lightAt, lightTick };
}
