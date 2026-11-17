import * as THREE from 'three';
import type { OSAtBank, OSAtBankStock } from '../state.js';
import type { Boom } from '../types.js';

export function makeBank(OS: OSAtBank) {
  const { BKX, BKZ, BFW, bx, BFX, BFZ, BBZ, BOX, BIX, MAXTRUCK, BAYN, BAYX, BAYW, bayZ, outZ, inZ, arrow, cy, mesh, merge, VC, M, FONT, drawSign, HIT, ctx } = OS;
  const { scene } = OS.ctx;
  // ── bank: east of the avenue, fenced, a gate on its in road and its out road; the bank stands at the back (BKZ), the yard with its two rows of
  // bays in front of it, the drives are stacked inside ──
  const STK = 240, stackAt = (i: number, out: THREE.Vector3) => { const w = i % 40; return out.set(BKX - 4.2 + (w % 8) * 1.2, .62 + Math.floor(i / 40) * .3, BKZ - 2.6 + Math.floor(w / 8) * .95); };
  const booms: Boom[] = [];
  { const L = [], AS = '#1b2029', LN = '#4d5460', ST = '#8d8674', SD = '#6f6a5e', CL = '#a59e8b', FN = '#59606c', GR = '#1d3024', z = BKZ;
    L.push(bx(BFX - BFW, .04, BKZ + 6.5 - BBZ, (BFW + BFX) / 2, .02, (BBZ + BKZ + 6.5) / 2, GR));                                                       // grass round the bank
    L.push(bx(BFX - BFW, .06, BFZ - BKZ - 6.5, (BFW + BFX) / 2, .03, (BFZ + BKZ + 6.5) / 2, AS));                                                       // the yard
    for (const x of [BOX, BIX]) L.push(bx(2.8, .06, .6, x, .03, BFZ + .2, AS));
    for (let i = 0; i < MAXTRUCK; i += BAYN) { for (let j = 0; j <= BAYN; j++) L.push(bx(.06, .012, 3.9, BAYX(i) + j * BAYW - BAYW / 2, .066, bayZ(i) + .1, LN));
      for (let x = BOX + 4; x < BIX - 3; x += 3) L.push(bx(1.4, .012, .08, x, .066, (outZ(i) + inZ(i)) / 2, LN));                                     // dashes between the row's two lanes
      for (const x of [BIX - 3, BOX + 12]) arrow(L, x, inZ(i), 0, LN); for (const x of [BOX + 8, BOX + 18]) arrow(L, x, outZ(i), 0, LN); }
    arrow(L, BIX, (inZ(0) + inZ(BAYN)) / 2, -Math.PI / 2, LN); arrow(L, BOX, (outZ(0) + outZ(BAYN)) / 2, Math.PI / 2, LN);                                // the east side (in, north) and the west side (out, south)
    L.push(bx(17, .4, 13, BKX, .2, z, SD), bx(16, 6, .4, BKX, 3.4, z - 5.8, ST), bx(.4, 6, 11.6, BKX - 7.8, 3.4, z, ST));                                   // plinth, back walls
    for (let i = 0; i < 7; i++) L.push(cy(.32, 5.8, BKX - 7.5 + i * 2.5, 3.3, z + 5.7, CL, 14)); for (let i = 0; i < 4; i++) L.push(cy(.32, 5.8, BKX + 7.6, 3.3, z + 3.2 - i * 2.5, CL, 14)); // colonnade
    L.push(bx(16.7, .7, .7, BKX, 6.55, z + 5.7, SD), bx(16.7, .7, .7, BKX, 6.55, z - 5.7, SD), bx(.7, .7, 12.1, BKX + 7.65, 6.55, z, SD), bx(.7, .7, 12.1, BKX - 7.65, 6.55, z, SD));
    for (const x of [-2.6, 2.6]) L.push(bx(.14, .16, 11.4, BKX + x, 6.82, z, SD));                                                                       // skylight bars
    L.push(bx(10.4, .22, 5.6, BKX, .51, z - .7, '#393f49'));                                                                                               // vault floor
    const rail = (x0: number, z0: number, x1: number, z1: number) => { const dx = x1 - x0, dz = z1 - z0, l = Math.hypot(dx, dz), ry = -Math.atan2(dz, dx); for (const y of [.55, 1.05]) L.push(bx(l, .07, .07, (x0 + x1) / 2, y, (z0 + z1) / 2, FN, ry));
      for (let i = 0, n = Math.max(1, Math.round(l / 2)); i <= n; i++) L.push(bx(.1, 1.2, .1, x0 + dx * i / n, .6, z0 + dz * i / n, FN)); };
    const x0 = BFW, x1 = BFX, zf = BFZ, GX = [BOX, BIX]; rail(x0, BBZ, x1, BBZ); rail(x0, BBZ, x0, zf); rail(x1, BBZ, x1, zf); rail(x0, zf, GX[0] - 1.5, zf); rail(GX[0] + 1.5, zf, GX[1] - 1.5, zf);
    GX.forEach((g, u) => { const hx = u ? g + 2.4 : g - 2.3; L.push(bx(.3, 1.2, .3, g + 1.5, .6, zf, '#d9b23c'), bx(1.1, 1.7, 1, hx, .85, zf - .6, '#394352'), bx(1.3, .1, 1.2, hx, 1.75, zf - .6, '#d9b23c')); }); // gate posts, gatehouses
    const site = mesh(merge(L), VC); scene.add(site);
    scene.add(new THREE.Mesh(merge([bx(15.4, .08, 11, BKX, 6.9, z, '#fff')]), M.glass));
    const bg = new THREE.BoxGeometry(2.9, .12, .12); bg.translate(-1.45, 0, 0); const bm = new THREE.MeshStandardMaterial({ color: '#e8e2d0', roughness: .6 });
    for (const g of GX) { const b = mesh(bg, bm); b.position.set(g + 1.5, 1.1, zf); scene.add(b); booms.push({ b, x: g, z: zf, o: 0 }); }
    const c = document.createElement('canvas'); c.width = 384; c.height = 72; const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    const draw = () => { const x = c.getContext('2d')!; x.fillStyle = '#6f6a5e'; x.fillRect(0, 0, 384, 72); x.font = `800 58px ${FONT}`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = '#f1e6c0'; x.fillText('B A N K', 192, 40); t.needsUpdate = true; };
    draw(); document.fonts?.ready.then(() => { draw(); for (const F of OS.bldgs.values()) drawSign(F); });
    const s = new THREE.Mesh(new THREE.PlaneGeometry(3.4, .62), new THREE.MeshBasicMaterial({ map: t })); s.position.set(BKX, 6.55, z + 6.07); scene.add(s);
    const hit = new THREE.Mesh(new THREE.BoxGeometry(16, 7, 12), HIT); hit.position.set(BKX, 3.5, z); scene.add(hit); ctx.addPickable(hit, { kind: 'total', id: 'total' });
  }
  return { STK, stackAt, booms };
}

export function makeBankStock(OS: OSAtBankStock) {
  const { G, M, STK, stackAt, tp, setM, NEUTRAL, label, BKX, BKZ, DOCKMAX, SLOTS } = OS;
  const { scene } = OS.ctx;
  const stack = new THREE.InstancedMesh(G.hdd, M.hdd, STK); stack.castShadow = true; stack.frustumCulled = false; stack.count = 0; scene.add(stack);
  for (let i = 0; i < STK; i++) { stackAt(i, tp); setM(stack, i, tp.x, tp.y, tp.z, 0, 1.6, 1.4, 1.6); stack.setColorAt(i, NEUTRAL); }
  const HDDN = DOCKMAX * SLOTS.length + 400; // every dock pile full, plus the drives in the air
  const hdd = new THREE.InstancedMesh(G.hdd, M.hdd, HDDN); hdd.castShadow = true; hdd.frustumCulled = false; hdd.count = 0; hdd.setColorAt(0, NEUTRAL); scene.add(hdd);
  const pkt = new THREE.InstancedMesh(G.pkt, M.pkt, 400); pkt.frustumCulled = false; pkt.count = 0; pkt.setColorAt(0, NEUTRAL); scene.add(pkt);
  const bankLab = label('sign wh obank', '<small>BANK · ALL PROJECTS</small><b>—</b><small class="u">—</small>', () => ['total', 'total']); bankLab.position.set(BKX, 9.2, BKZ); bankLab.center.set(.5, 1); scene.add(bankLab);
  return { stack, hdd, HDDN, pkt, bankLab };
}
