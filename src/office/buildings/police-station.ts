import * as THREE from 'three';
import type { OSAtPoliceStation } from '../state.js';
import type { Station } from '../types.js';

export function makePoliceStation(OS: OSAtPoliceStation) {
  const { POX, PIX, bx, PRZ, PLZ, STZ, RW, RT, PBAY, PSZ, arrow, cy, PDOOR, sp, mesh, merge, VC, FONT, STNC, cellX, CD, SVZ, SLIPX } = OS;
  const { scene } = OS.ctx;
  const AS = '#1f242d', LN = '#4d5460', WH = '#bfc6cf', PB = '#1f4fb8', GL = '#1a2a44', TR = '#9aa2ad';
  // the sign: one canvas for every station
  const c = document.createElement('canvas'); c.width = 448; c.height = 72; const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const draw = () => { const x = c.getContext('2d')!; x.fillStyle = PB; x.fillRect(0, 0, 448, 72); x.font = `800 58px ${FONT}`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = '#ffffff'; x.fillText('P O L I C E', 224, 40); t.needsUpdate = true; };
  draw(); document.fonts?.ready.then(draw);
  const sm = new THREE.MeshBasicMaterial({ map: t }), signG = new THREE.PlaneGeometry(4.2, .68);
  /** The block (one storey, a blue band, the roof with its box and mast), its windows, the door on the east face (door z dz), the blue lamp and the
   *  two signs: centre (BX, BZ); the front with its windows faces south (+z, the way the view looks) */
  function block(S: THREE.BufferGeometry[], parent: THREE.Object3D, BX: number, BZ: number, m: number) { const BE = BX + 7.03, dz = BZ + 1.5 * m; // m: 1, or -1 mirrored (door and roof box the other way round)
    S.push(bx(16, .05, 7.2, BX, .025, BZ + .35 * m, '#2a2f37'), bx(14, 2.8, 6, BX, 1.4, BZ, WH), bx(14.1, .72, 6.1, BX, 2.45, BZ, PB), bx(14.4, .22, 6.4, BX, 2.91, BZ, TR), bx(2, .6, 1.6, BX - 4, 3.3, BZ - .5 * m, '#8b939e'), cy(.05, 2.6, BX - 6, 4.2, BZ - 2.1 * m, '#8b939e', 6)); // pad, block, blue band, roof
    for (let i = 0; i < 5; i++) S.push(bx(1.5, .95, .06, BX - 5.6 + i * 2.6, 1.4, BZ + 3.03, GL));
    S.push(bx(.06, .95, 1.4, BE, 1.4, BZ - 1.9 * m, GL), bx(.06, 1.95, 1.7, BE, .98, dz, GL), bx(.9, .1, 2.2, BE + .42, 2.03, dz, PB), bx(.7, .1, 2, BE + .32, .05, dz, TR)); // east face: window, door, canopy, step
    S.push(cy(.06, 2.6, BE + .77, 1.3, BZ - .1 * m, '#2b3038', 8), sp(.24, BE + .77, 2.75, BZ - .1 * m, '#3d8bff'));                                       // the blue lamp by the door
    const s1 = new THREE.Mesh(signG, sm), s2 = s1.clone(); s1.position.set(BX, 2.45, BZ + 3.08); s2.position.set(BE + .05, 2.45, BZ); s2.rotation.y = Math.PI / 2; parent.add(s1, s2); }
  // ── the first police station: south of the street east of the avenue; its in road (PIX) comes off the street's eastbound lanes west of
  // the east roundabout (whose south arm is a road on to the rows south), its out road joins the street ──
  // (the block stands west of the bays, between the yard lane and the back lane: centre BX, BZ)
  { const L = [], S: THREE.BufferGeometry[] = [], x0 = POX - 1.1, x1 = PIX + 1.1, z0 = STZ + RW;
    const BX = POX + 10;
    L.push(bx(2.2, .04, PRZ + 1.1 - z0, PIX, .02, (PRZ + 1.1 + z0) / 2, AS), bx(x1 - x0, .04, 2.2, (x0 + x1) / 2, .02, PLZ, AS), bx(2.2, .04, PLZ - STZ - RW, POX, .02, (PLZ + STZ + RW) / 2, AS)); // in road, yard lane, out road
    L.push(bx(x1 - PBAY[0] + 1.6, .04, 2.2, (x1 + PBAY[0] - 1.6) / 2, .02, PRZ, AS), bx(PBAY[3] - PBAY[0] + 3.2, .04, PRZ - PLZ - 2.2, (PBAY[0] + PBAY[3]) / 2, .02, (PRZ + PLZ) / 2, AS), bx(2.2, .012, .1, POX, .046, STZ + RW + .2, LN)); // back lane, bay apron, stop line
    for (const x of [PBAY[0] - 1.25, (PBAY[0] + PBAY[1]) / 2, (PBAY[1] + PBAY[2]) / 2, (PBAY[2] + PBAY[3]) / 2, PBAY[3] + 1.6]) L.push(bx(.06, .012, 3.2, x, .046, PSZ + .1, LN));
    arrow(L, BX + 26, PLZ, 0, LN); arrow(L, BX, PLZ, 0, LN); arrow(L, POX, (STZ + RW + PLZ) / 2, -Math.PI / 2, LN); arrow(L, PIX, (STZ + RW + PLZ) / 2, Math.PI / 2, LN); arrow(L, PIX, (PLZ + PRZ) / 2, Math.PI / 2, LN); arrow(L, BX + 26, PRZ, 0, LN);
    block(S, scene, BX, PLZ + 4.5, 1);
    scene.add(mesh(merge(L), VC, false, true), mesh(merge(S), VC));
  }
  const MAIN: Station = { id: 'pol', k: 0, c: 0, r: 0, ox: (POX + PIX) / 2, oz: 0, zs: STZ, s: 1, yz: PLZ, bz: PSZ, rz: PRZ, inX: PIX, outX: POX, in: 'pol:in', out: 'pol:out',
    bays: PBAY, door: [PDOOR[0], PDOOR[1]], roof: [POX + 12, PLZ + 4.5], units: [], g: null, gone: false };
  // ── one more station for every 20 offices (layout.ts STNC: its cell): on an office's cell, north of the street, with an office's in and out
  // roads (in road east, out road west, both off the westbound lanes). The yard lane runs west from the in road to the out road 6.5 m off the
  // street, the four bays north of it (the units nose towards the street), the back lane behind them (in off the in road, west to the bays),
  // the block west of the bays. Built and dropped as the town grows and shrinks (police.ts drops one once its units are home) ──
  const stns: Station[] = [MAIN];
  function mkStation(k: number): Station { const [cc, r] = STNC[k - 1], ox = cellX(cc), oz = r * CD, zs = oz + STZ, yz = oz + SVZ, inX = ox + SLIPX, outX = ox - SLIPX;
    const bays = [-1, 1.5, 4, 7].map(d => ox + d), BX = bays[0] - 3.97 - 7.03, BZ = yz - 4.5, S: Station = { id: 'pol' + k, k, c: cc, r, ox, oz, zs, s: -1, yz, bz: yz - (PSZ - PLZ), rz: yz - (PRZ - PLZ),
      inX, outX, in: 'pol' + k + ':in', out: 'pol' + k + ':out', bays, door: [BX + 7.6, BZ - 1.5], roof: [BX + 2, BZ], units: [], g: new THREE.Group(), gone: false };
    const L: THREE.BufferGeometry[] = [], B: THREE.BufferGeometry[] = [], rz = S.rz, x0 = outX - 1.1, x1 = inX + 1.1, ze = zs - RW;
    L.push(bx(2.2, .04, ze - rz + 1.1, inX, .02, (ze + rz - 1.1) / 2, AS), bx(x1 - x0, .04, 2.2, (x0 + x1) / 2, .02, yz, AS), bx(2.2, .04, ze - yz, outX, .02, (ze + yz) / 2, AS)); // in road, yard lane, out road
    L.push(bx(x1 - bays[0] + 1.6, .04, 2.2, (x1 + bays[0] - 1.6) / 2, .02, rz, AS), bx(bays[3] - bays[0] + 3.2, .04, yz - rz - 2.2, (bays[0] + bays[3]) / 2, .02, (yz + rz) / 2, AS), bx(2.2, .012, .1, outX, .046, ze - .2, LN)); // back lane, bay apron, stop line
    for (const x of [bays[0] - 1.25, (bays[0] + bays[1]) / 2, (bays[1] + bays[2]) / 2, (bays[2] + bays[3]) / 2, bays[3] + 1.6]) L.push(bx(.06, .012, 3.2, x, .046, S.bz - .1, LN));
    arrow(L, ox - 7, yz, 0, LN); arrow(L, ox + 7, yz, 0, LN); arrow(L, inX, (yz + rz) / 2, -Math.PI / 2, LN); arrow(L, (bays[3] + inX) / 2 + .4, rz, 0, LN);
    block(B, S.g!, BX, BZ, -1);
    S.g!.add(mesh(merge(L), VC, false, true), mesh(merge(B), VC)); scene.add(S.g!); return S; }
  /** n offices: the stations for them (one for every 20); those no longer wanted are marked gone (police.ts drops them once their units are home). */
  function syncStations(n: number) { const want = Math.min(STNC.length, Math.max(0, Math.ceil(n / 20) - 1));
    for (let k = 1; k <= want; k++) { const S = stns.find(S => S.k === k); if (S) S.gone = false; else stns.push(mkStation(k)); }
    for (const S of stns) if (S.k > want) S.gone = true; stns.sort((a, b) => a.k - b.k); }
  function dropStation(S: Station) { const i = stns.indexOf(S); if (i < 1) return; stns.splice(i, 1); if (S.g) { scene.remove(S.g); S.g.traverse(o => { if (o instanceof THREE.Mesh && o.geometry !== signG) o.geometry.dispose(); }); } }
  return { stns, syncStations, dropStation };
}
