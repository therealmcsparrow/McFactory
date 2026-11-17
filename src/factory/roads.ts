import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { clamp } from '../common/math.js';
import type { Leg, P2 } from '../common/types.js';
import type { FSAtRoads } from './state.js';
import type { Net, NetEdge, NetNode, Robot } from './types.js';

export function makeRoads(FS: FSAtRoads) {
  const { OX1, CW, XP, CD, scene, mat, extraLabs, docks, SLOTS, WHX, SX, L, arc, yellowM, ctx } = FS;
  // ── road network: plain two-lane roads, keep right. Corridor 1 runs between the warehouse and the inner halls,
  // corridor 2 between the hall columns, joined by the gaps between hall rows; every crossing and dead end is a roundabout (U-turns only there).
  // Docks and parking spots are drive-through lay-bys on the lane that passes them; the warehouse is a straight
  // pass-through: south passage eastbound, north passage westbound, three parallel one-way unload lanes each, no turning inside.
  // corridors follow the hall geometry: the road runs 1.7 inside the dock pick spot (so a resized hall keeps its dock lane)
  const CXc = (c: number) => OX1 + (c - 1) * CW - XP - 1.7;
  const LO = .6, LB = 1.6, CX1 = CXc(1), CX2 = CXc(2), ZG = 6.75, ZR = 13.5, ZF = ZR, ZT = CD + 8, JR = 1.5;
  // docks: a long side lane parallel to the bay (taper DT, straight DSL before and after the pick spot); crossings: roundabouts
  const DT = 1.6, DSL = 2.3, LBD = DT + DSL, RR = 1.6, RLEAD = RR + 1.0, RIN = 1.0, ROUT = 2.2;
  const PX = [-3, -1.8, -.6, .6, 1.8, 3]; // parking spots, one row each side of the front road
  const NET: Net = { key: '', ver: 0, nodes: new Map(), edges: [], out: new Map(), strips: {}, spots: [] };
  const spotClaim = new Array<Robot | null>(PX.length * 2).fill(null);
  const bayG = new THREE.Group(); scene.add(bayG);
  { const pads: THREE.BufferGeometry[] = [], posts2: THREE.BufferGeometry[] = [], lights: THREE.BufferGeometry[] = [];
    PX.forEach(x => { for (const [z, pz] of [[ZF + LO + 1.4, .75], [ZF - LO - 1.4, -.75]]) { pads.push(new THREE.BoxGeometry(.86, .03, 1.0).translate(x, .015, z)); posts2.push(new THREE.BoxGeometry(.3, .5, .12).translate(x, .25, z + pz)); lights.push(new THREE.BoxGeometry(.14, .06, .03).translate(x, .4, z + pz * .9)); } });
    const pm = new THREE.Mesh(mergeGeometries(pads), mat('#1a2621', { roughness: .9, envMapIntensity: .4 })); pm.receiveShadow = true;
    const cm = new THREE.Mesh(mergeGeometries(posts2), mat('#2a2d32', { metalness: .5, roughness: .4 })); cm.castShadow = true;
    const lm = new THREE.Mesh(mergeGeometries(lights), new THREE.MeshBasicMaterial({ color: new THREE.Color(.3, 1.3, .55), toneMapped: false }));
    bayG.add(pm, cm, lm);
    const be = document.createElement('div'); be.className = 'sign more'; be.textContent = 'Parking'; const bl = new ctx.CSS2DObject(be); bl.position.set(0, .1, ZF + 3.2); bl.center.set(.5, 0); bayG.add(bl); extraLabs.push(bl); }
  const polyE = (e: NetEdge, pts: P2[]) => { e.pts = pts; e.cum = [0]; for (let k = 1; k < pts.length; k++) e.cum.push(e.cum[k - 1] + Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1])); e.len = e.cum[e.cum.length - 1]; return e; };
  const eAt = (e: Leg, t: number): P2 => { t = clamp(t, 0, e.len); let k = 1; while (k < e.pts.length - 1 && e.cum[k] < t) k++; const a = e.pts[k - 1], b = e.pts[k], l = e.cum[k] - e.cum[k - 1] || 1, u = (t - e.cum[k - 1]) / l; return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u]; };
  const eSlice = (e: Leg, t0: number, t1: number) => { const o = [eAt(e, t0)]; for (let k = 1; k < e.pts.length - 1; k++) if (e.cum[k] > t0 + 1e-3 && e.cum[k] < t1 - 1e-3) o.push(e.pts[k]); o.push(eAt(e, t1)); return o; };
  let roadMesh: THREE.Mesh | null = null;
  const rbG = new THREE.Group(); scene.add(rbG); const islandM = mat('#2a2d32', { roughness: .8 }), grassM = mat('#1f3a2a', { roughness: .95, envMapIntensity: .3 });
  function roads() { // (re)build when the used grid grows to the second hall column; node objects are kept (junction locks live on them)
    let maxC = 1; for (const dk of docks) if (dk) maxC = Math.max(maxC, Math.abs(SLOTS[dk.k][0]));
    const key = String(maxC); if (key === NET.key) return; NET.key = key; NET.ver++;
    const node = (x: number, z: number) => { const k = x.toFixed(2) + ',' + z.toFixed(2); let n = NET.nodes.get(k); if (!n) NET.nodes.set(k, n = { id: k, x, z, hs: new Set(), deg: 0, roads: 0 }); return n; };
    for (const n of NET.nodes.values()) { n.deg = 0; n.roads = 0; }
    const E: NetEdge[] = NET.edges = [], out: Map<NetNode, NetEdge[]> = NET.out = new Map(), pairs: [NetNode, NetNode][] = [];
    const add = (e: NetEdge) => { e.id = E.length; E.push(e); if (!out.has(e.a)) out.set(e.a, []); out.get(e.a)!.push(e); e.a.deg++; return e; };
    const road = (a: NetNode, b: NetNode) => { const l = Math.hypot(b.x - a.x, b.z - a.z), h = [(b.x - a.x) / l, (b.z - a.z) / l], n = [-h[1], h[0]];
      const f = add(polyE({ kind: 'road', a, b, h, n } as NetEdge, [[a.x + n[0] * LO, a.z + n[1] * LO], [b.x + n[0] * LO, b.z + n[1] * LO]]));
      const r = add(polyE({ kind: 'road', a: b, b: a, h: [-h[0], -h[1]], n: [-n[0], -n[1]] } as NetEdge, [[b.x - n[0] * LO, b.z - n[1] * LO], [a.x - n[0] * LO, a.z - n[1] * LO]]));
      a.roads++; b.roads++; pairs.push([a, b]); return f; };
    NET.strips = {};
    for (const s of [-1, 1]) {
      const n = (x: number, z: number) => node(s * x, z);
      const T1N = n(CX1, -ZT), R1N = n(CX1, -ZR), J1N = n(CX1, -ZG), J1S = n(CX1, ZG), R1S = n(CX1, ZR), T1S = n(CX1, ZT);
      road(T1N, R1N); road(R1N, J1N); road(J1N, J1S); road(J1S, R1S); // front road meets the corridor at the row gap (one crossing)
      road(R1S, T1S);
      if (maxC >= 2) { const R2N = n(CX2, -ZR), R2S = n(CX2, ZR); road(R1N, R2N); road(R1S, R2S); road(n(CX2, -ZT), R2N); road(R2N, R2S); road(R2S, n(CX2, ZT)); }
    }
    // pass-through unload lanes (s = +1 south passage, eastbound; s = -1 north passage, westbound): corridor to corridor, straight past the pile
    for (const s of [-1, 1]) { const Ai = node(-s * CX1, s * ZG), Bo = node(s * CX1, s * ZG), xe = WHX + .9;
      NET.strips[s] = SX.map(dz => { const z = s * (ZG + dz), e = add(polyE({ kind: 'strip', a: Ai, b: Bo } as NetEdge, [[Ai.x, Ai.z], [-s * xe, z], [s * xe, z], [Bo.x, Bo.z]])); e.tStop = e.cum[1] + xe + 1.2; e.transit = dz === SX[2]; return e; }); } // outer lane (away from the pile) also carries empty robots straight through
    const fr = road(node(-CX1, ZF), node(CX1, ZF)); // front road; parking lay-bys off both lanes
    NET.spots = []; for (const [e, z] of [[fr, ZF + LO + 1.4], [E[fr.id + 1], ZF - LO - 1.4]] as [NetEdge, number][]) for (const x of PX) NET.spots.push({ e, t: Math.abs(x - e.pts[0][0]), spot: [x, z] });
    const ind = new Map<NetNode, number>(); for (const e of E) ind.set(e.b, (ind.get(e.b) || 0) + 1);
    for (const n of NET.nodes.values()) { n.leaf = n.roads === 1 && n.deg === 1; n.rb = n.roads >= 3 || n.leaf; // every road crossing and dead end is a roundabout (yield rule, no lock)
      n.box = !n.rb && (n.deg >= 3 || (ind.get(n) || 0) >= 3); // warehouse entry/exit (corridor meets the unload lanes): plain junction with a conflict lock, no roundabout
      n.r = n.box ? JR : 0; }
    NET.rbs = [...NET.nodes.values()].filter(n => n.rb);
    // floor paint: dashed centre line + edge lines per road (stopping at the ring), a thin guide line per unload lane
    if (roadMesh) { scene.remove(roadMesh); roadMesh.geometry.dispose(); }
    const g: THREE.BufferGeometry[] = []; const dash = (x0: number, z0: number, x1: number, z1: number) => { const len = Math.hypot(x1 - x0, z1 - z0), n = Math.floor(len / 1.8); for (let k = 0; k < n; k++) { const a = (k * 1.8 + .4) / len, b = (k * 1.8 + 1.4) / len; L(g, x0 + (x1 - x0) * a, z0 + (z1 - z0) * a, x0 + (x1 - x0) * b, z0 + (z1 - z0) * b, .08, .006); } };
    for (const [a, b] of pairs) { const l = Math.hypot(b.x - a.x, b.z - a.z), ux = (b.x - a.x) / l, uz = (b.z - a.z) / l, nx = -uz * 1.25, nz = ux * 1.25;
      const ta = a.rb ? Math.sqrt(ROUT * ROUT - 1.25 * 1.25) : 0, tb = l - (b.rb ? Math.sqrt(ROUT * ROUT - 1.25 * 1.25) : 0), da = a.rb ? ROUT : 0, db = l - (b.rb ? ROUT : 0);
      dash(a.x + ux * da, a.z + uz * da, a.x + ux * db, a.z + uz * db);
      for (const sg of [1, -1]) L(g, a.x + ux * ta + nx * sg, a.z + uz * ta + nz * sg, a.x + ux * tb + nx * sg, a.z + uz * tb + nz * sg, .05, .006);
      for (const [v, u] of [[a, 1], [b, -1]] as [NetNode, number][]) if (v.rb) { // yield line (shark teeth) across the entry lane, right of the centre line
        const ex = ux * u, ez = uz * u, rx = ez, rz = -ex, d0 = ROUT + .25; // entry lane heads toward v, i.e. along -e; its right side is +r... lane offset LO to the right of travel
        for (let k = 0; k < 3; k++) { const o = .2 + k * .38, cx = v.x + ex * d0 + rx * o, cz = v.z + ez * d0 + rz * o;
          L(g, cx - rx * .12, cz - rz * .12, cx + ex * .22, cz + ez * .22, .05, .007); L(g, cx + ex * .22, cz + ez * .22, cx + rx * .12, cz + rz * .12, .05, .007); } } }
    for (const s of [-1, 1]) for (const e of NET.strips[s]) for (let k = 1; k < e.pts.length; k++) L(g, e.pts[k - 1][0], e.pts[k - 1][1], e.pts[k][0], e.pts[k][1], .05, .006);
    // roundabouts: outer + inner ring paint, dashed lane arrows, raised central island
    rbG.clear(); const isl: THREE.BufferGeometry[] = [];
    const arc = (n: { x: number; z: number }, r: number, w: number, a0 = 0, a1 = 2 * Math.PI, k = 40) => { for (let i = 0; i < k; i++) { const p = a0 + (a1 - a0) * i / k, q = a0 + (a1 - a0) * (i + 1) / k; L(g, n.x + Math.cos(p) * r, n.z + Math.sin(p) * r, n.x + Math.cos(q) * r, n.z + Math.sin(q) * r, w, .006); } };
    for (const n of NET.rbs) { arc(n, ROUT, .05); arc(n, RIN, .05);
      for (let i = 0; i < 4; i++) { const p = i * Math.PI / 2 + Math.PI / 4; arc(n, RR, .07, p, p - .35, 3); const q = p - .35; // chevron head points along the circulation (decreasing angle)
        const hx = Math.cos(q) * RR, hz = Math.sin(q) * RR, tx = Math.sin(q), tz = -Math.cos(q), ox = Math.cos(q) * .14, oz = Math.sin(q) * .14;
        L(g, n.x + hx - tx * .18 + ox, n.z + hz - tz * .18 + oz, n.x + hx, n.z + hz, .06, .007); L(g, n.x + hx - tx * .18 - ox, n.z + hz - tz * .18 - oz, n.x + hx, n.z + hz, .06, .007); }
      isl.push(new THREE.CylinderGeometry(RIN - .12, RIN - .05, .14, 28).translate(n.x, .07, n.z)); }
    if (isl.length) { const im = new THREE.Mesh(mergeGeometries(isl), islandM); im.castShadow = im.receiveShadow = true; rbG.add(im);
      const gr = isl.map(q => q.clone()); gr.forEach((q, i) => { q.scale(.82, 1, .82); const n = NET.rbs![i]; q.translate(n.x * .18, .02, n.z * .18); }); const gm = new THREE.Mesh(mergeGeometries(gr), grassM); gm.receiveShadow = true; rbG.add(gm); }
    roadMesh = new THREE.Mesh(mergeGeometries(g), yellowM); scene.add(roadMesh);
  }
  return { LO, LB, CX1, ZG, DT, DSL, LBD, RR, RLEAD, ROUT, NET, spotClaim, eAt, eSlice, roads };
}
