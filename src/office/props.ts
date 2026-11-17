import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { DS, modelOf } from '../app/data.js';
import { hashf } from '../common/math.js';
import type { OSAtProps } from './state.js';
import type { Office, OfficeGeo, LabelPick, WinAt, FolkKind } from './types.js';
import { sportsCarGeometry } from './vehicles/sports-car.js';
import { armouredCarGeometry } from './vehicles/armoured-car.js';
import { patrolCarGeometry } from './vehicles/patrol-car.js';
import { swatVanGeometry } from './vehicles/swat-van.js';
import { banditVanGeometry } from './vehicles/bandit-van.js';
import { motorcycleGeometry, MOTO_VARIANTS } from './vehicles/motorcycle.js';
import { suvGeometry, SUV_VARIANTS } from './vehicles/suv.js';
import { hatchbackGeometry, HATCH_VARIANTS } from './vehicles/hatchback.js';
import { pickupGeometry, PICKUP_VARIANTS } from './vehicles/pickup.js';
import { boxTruckGeometry, BOX_VARIANTS } from './vehicles/box-truck.js';
import { legGeo, headGeo } from './gait.js';

export function makeProps(OS: OSAtProps) {
  const { BH, bx, BW, HZ, BD, HX, ring, cy, AISLE, merge, FL, SEATS, ROWZ, SLIPX, NSPOT, SPOTX, SPOTZ, LBZ, arrow, SVZ, sp, col, V, ctx } = OS;
  const G = {} as OfficeGeo; // filled in the blocks below
  { // building shell: walls, roof, door, sign boards on poles (fades away when the building is open)
    const L = [], W1 = '#2b3342', W2 = '#3a4458', RF = '#1c2129', PL = '#59606c', SY = BH + 1.9;
    L.push(bx(BW, BH, .2, 0, BH / 2, HZ - .1, W1), bx(BW, BH, .2, 0, BH / 2, -HZ + .1, W1), bx(.2, BH, BD - .4, HX - .1, BH / 2, 0, W1), bx(.2, BH, BD - .4, -HX + .1, BH / 2, 0, W1));
    L.push(bx(BW + .3, .25, BD + .3, 0, BH + .125, 0, RF)); ring(L, BH + .45, .5, .12, W2); ring(L, 2.9, .2, .04, W2); ring(L, 5.35, .2, .04, W2); ring(L, 7.6, .14, .04, W2);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) L.push(bx(.5, BH, .5, sx * (HX - .08), BH / 2, sz * (HZ - .08), W2));
    L.push(bx(2.4, .8, 1.7, -4, BH + .65, -2, '#3d4450'), bx(1.3, .5, 1.3, 3, BH + .5, 1.5, '#3d4450'), cy(.5, .12, -4, BH + 1.1, -2, '#20252d'));
    L.push(bx(1.3, 2.15, .1, AISLE, 1.08, HZ + .03, '#0d1117'), bx(1.9, .1, .9, AISLE, 2.32, HZ + .45, '#4b566f'));
    L.push(bx(10.3, 1.4, .1, 0, SY, HZ - .4, RF), bx(.1, 1.4, 10.3, HX - .4, SY, 0, RF));                       // roof sign boards
    for (const u of [-4.2, 0, 4.2]) L.push(cy(.08, 1.5, u, BH + .95, HZ - .5, PL, 8), cy(.08, 1.5, HX - .5, BH + .95, u, PL, 8));
    L.push(bx(.8, .3, .8, -6.9, BH + .4, 4.5, '#3d4450'), cy(.09, .5, -6.9, BH + .8, 4.5, PL, 8));              // siren plinth
    G.shell = merge(L);
    const WP: WinAt[] = []; // window places: [x, y, z, rotY]
    for (const y of [1.55, 4.1, 6.5]) {
      for (let j = 0; j < 9; j++) { const x = -7.2 + j * 1.8; if (!(y < 2 && j === 8)) WP.push([x, y, HZ + .02, 0]); WP.push([x, y, -HZ - .02, Math.PI]); }
      for (let j = 0; j < 6; j++) { const z = -4.5 + j * 1.8; WP.push([HX + .02, y, z, Math.PI / 2], [-HX - .02, y, z, -Math.PI / 2]); }
    }
    G.winAt = WP; G.win = new THREE.PlaneGeometry(1.25, 1.5);
    const a = new THREE.PlaneGeometry(10, 1.15); a.translate(0, SY, HZ - .34); const b = new THREE.PlaneGeometry(10, 1.15); b.rotateY(Math.PI / 2); b.translate(HX - .34, SY, 0);
    G.sign = mergeGeometries([a, b], false);
    G.siren = new THREE.CylinderGeometry(.3, .3, .46, 14); G.siren.translate(-6.9, BH + 1.25, 4.5);
  }
  { // workfloor: floor, low walls, furniture, cables (one mesh, same for every building)
    const L = [], WL = '#3c424d', DK = '#15181e', CH = '#262b34', CB = '#1d6c88';
    L.push(bx(BW, FL, BD, 0, FL / 2, 0, '#2a2f38'), bx(7.5, .012, 4.2, -4.95, FL + .006, -4.2, '#27323f'), bx(7.3, .012, 4.2, 5.15, FL + .006, -4.2, '#3b352f'), bx(1.6, .012, 7.9, 5.3, FL + .006, 2, '#313742'), bx(2.7, .012, 7.1, 7.45, FL + .006, 2.05, '#2b3a36'));
    L.push(bx(BW - .5, 1.5, .15, 0, .75 + FL, -HZ + .28, WL), bx(.15, 1.5, BD - .5, -HX + .28, .75 + FL, 0, WL), bx(.15, .3, BD - .5, HX - .28, .15 + FL, 0, WL), bx(BW - 2.4, .3, .15, -1, .15 + FL, HZ - .28, WL));
    for (const s of SEATS) { const { x, z } = s;
      if (s.mgr) {                                                                                                         // manager's desk: along z, monitor on the west edge
        for (const dz of [-.66, .66]) L.push(bx(.66, .72 - FL, .06, 6.9, (.72 + FL) / 2, z + dz, DK));
        L.push(bx(.05, .47, .72, 6.68, 1.13, z, DK), bx(.06, .2, .08, 6.66, .86, z, DK), bx(.2, .02, .3, 6.68, .79, z, DK), bx(.14, .02, .44, 7.04, .79, z, '#3a404b'));
        L.push(bx(.5, .07, .5, x, .5, z, '#3a2f26'), bx(.07, .62, .5, x + .25, .86, z, '#3a2f26'), cy(.04, .36, x, .3, z, DK, 6));
      } else if (s.ri != null) { const z0 = ROWZ[s.ri];
        for (const dx of [-.58, .58]) L.push(bx(.06, .72 - FL, .66, x + dx, (.72 + FL) / 2, z0, DK));                       // desk sides
        L.push(bx(.72, .47, .05, x, 1.13, z0 - .2, DK), bx(.08, .2, .06, x, .86, z0 - .22, DK), bx(.3, .02, .2, x, .79, z0 - .2, DK)); // monitor
        L.push(bx(.44, .02, .14, x, .79, z0 + .14, '#3a404b'));                                                             // keyboard
        L.push(bx(.46, .07, .46, x, .5, z, CH), bx(.46, .5, .07, x, .8, z + .23, CH), cy(.04, .36, x, .3, z, DK, 6));        // chair
      } else if (s.zone === 'meet') { const d = s.i < 4 ? -1 : 1; L.push(bx(.44, .07, .44, x, .5, z, CH), bx(.44, .46, .07, x, .78, z + d * .22, CH), cy(.04, .36, x, .3, z, DK, 6)); }
    }
    L.push(bx(4.4, .08, 1.4, -4.9, .74, -4.1, '#6b5540'), bx(.14, .56, .9, -6.6, .44, -4.1, DK), bx(.14, .56, .9, -3.2, .44, -4.1, DK), bx(2.4, .95, .06, -4.9, 1.15, -HZ + .4, '#0b0e13')); // meeting table, wall screen
    L.push(bx(4.6, .9, .62, 5.7, .45 + FL, -5.75, '#474c56'), bx(4.7, .05, .7, 5.7, .93 + FL, -5.75, '#8d929b'), bx(.42, .5, .36, 4.3, 1.33, -5.75, '#17191e'), bx(.1, .05, .02, 4.3, 1.4, -5.56, '#ff5a3c'), bx(.5, .5, .4, 6.4, 1.33, -5.75, '#22262e')); // counter, coffee machine
    L.push(bx(.42, 1, .42, 2.3, .5 + FL, -5.7, '#c5ced8'), cy(.17, .46, 2.3, 1.38, -5.7, '#4c9be0'), cy(.5, .05, 5.4, 1.02, -3.8, '#8d929b', 16), cy(.05, .88, 5.4, .58, -3.8, DK, 6));       // water cooler, high table
    L.push(bx(.12, 1.25, .12, 8.38, .62 + FL, 5.92, DK), bx(.1, .42, .5, 8.36, 1.45, 5.92, '#1b1e25'));                                                                               // time clock
    for (const u of [[6.1, -1.5], [6.1, 5.6], [6.1, 1.5], [6.1, 2.5]]) L.push(bx(.1, 1.75, .1, u[0], .875 + FL, u[1], '#4b566f'));                                                       // manager's office frame, door to the floor
    for (const z0 of ROWZ) L.push(bx(15.3, .03, .08, -.65, FL + .015, z0 - .52, CB));
    L.push(bx(13.7, .03, .08, -1.45, FL + .015, -1.72, CB), bx(.08, .03, 2.1, 5.4, FL + .015, -2.75, CB), bx(1, .03, .08, -7.8, FL + .015, -4.1, CB), bx(.08, .03, 10.8, -8.3, FL + .015, 1.2, CB));
    G.inner = merge(L);
    G.glass = merge([bx(6.3, 1.5, .06, -5.55, .9, -2.1, '#fff'), bx(.06, 1.5, 4.1, -1.2, .9, -4.2, '#fff'),
      bx(2.7, 1.6, .06, 7.45, .95, -1.5, '#fff'), bx(2.7, 1.6, .06, 7.45, .95, 5.6, '#fff'), bx(.06, 1.6, 3, 6.1, .95, 0, '#fff'), bx(.06, 1.6, 3.1, 6.1, .95, 4.05, '#fff')]);
  }
  { // outside: forecourt with an in road and an out road, car park, server dock
    const L = [], LN = '#59606c', AS = '#1b2029';
    L.push(bx(30, .06, 6.8, 0, .03, 9.9, AS), bx(BW, .1, 1.1, 0, .05, HZ + .55, '#333945'), bx(23.6, .05, 1.5, 0, .025, 14.05, '#18251d'));
    for (const u of [-1, 1]) L.push(bx(2.8, .06, 1.6, u * SLIPX, .03, 14.05, AS), bx(.5, .05, 1.5, u * 14.85, .025, 14.05, '#18251d'));
    for (let i = 0; i <= NSPOT; i++) L.push(bx(.06, .012, 3.3, (SPOTX(i) + SPOTX(i - 1)) / 2, .066, SPOTZ + .25, LN));                               // spot lines: long enough for a pickup (3.3)
    for (const x of [9.5, 5.5, 1.5, -2.5, -11]) arrow(L, x, SVZ, 0, LN);
    arrow(L, SLIPX, 14, -Math.PI / 2, LN); arrow(L, -SLIPX, 14, Math.PI / 2, LN);
    L.push(bx(1.7, 2.2, 1, -7.9, 1.1, 7.55, '#12151b'), bx(1.8, .08, 1.1, -7.9, 2.24, 7.55, '#2a303a'), bx(2.6, .5, 1.3, -10.1, .25, 7.65, '#393f49'), bx(.08, .03, .5, -8.3, .075, 6.8, '#1d6c88')); // server, pallet for the drive pile, cable
    for (let x = -13.2; x < -4.5; x += 1.2) L.push(bx(.7, .012, .06, x, .066, LBZ + 1.2, LN));                                                         // lay-by for two armoured cars, off the lane
    G.outer = merge(L);
    const S = []; for (let r = 0; r < 6; r++) for (const x of [-8.45, -7.9, -7.35]) { const g = new THREE.PlaneGeometry(.4, .09); g.translate(x, .45 + r * .3, 8.06); S.push(g); }
    G.srv = mergeGeometries(S, false);
  }
  { // people, cars, trucks, small props
    G.torso = bx(.44, .52, .26, 0, .86, 0, '#fff'); G.arm = bx(.12, .46, .14, 0, -.19, 0, '#fff');
    G.body = merge([bx(.17, .6, .2, -.11, .3, 0, '#20242c'), bx(.17, .6, .2, .11, .3, 0, '#20242c'), sp(.17, 0, 1.3, 0, '#e2b08a'), bx(.3, .1, .3, 0, 1.44, -.03, '#2a2018')]);
    G.leg = legGeo(bx); G.head = headGeo(bx, sp, merge); // G.body split for walking (gait.ts): one leg on its hip pivot, the head and hair
    G.guard = merge([bx(.44, .52, .26, 0, .86, 0, '#1f3350'), bx(.12, .46, .14, -.29, .86, .04, '#1f3350'), bx(.12, .46, .14, .29, .86, .04, '#1f3350'), bx(.46, .1, .28, 0, .95, 0, '#d9b23c'),
      bx(.17, .6, .2, -.11, .3, 0, '#141c2b'), bx(.17, .6, .2, .11, .3, 0, '#141c2b'), sp(.17, 0, 1.3, 0, '#e2b08a'), bx(.36, .09, .4, 0, 1.45, .03, '#101826')]);
    G.cup = new THREE.CylinderGeometry(.05, .04, .11, 8); G.bulb = new THREE.SphereGeometry(.09, 10, 8);
    const P = { bx, cy, merge }; // vehicle models: see vehicles/*.ts
    G.car = sportsCarGeometry(P); G.truck = armouredCarGeometry(P, G.guard); G.pcar = patrolCarGeometry(P); G.swat = swatVanGeometry(P); G.van = banditVanGeometry(P);
    G.moto = MOTO_VARIANTS.map((_, i) => ({ ride: motorcycleGeometry({ ...P, sp }, i, true), park: motorcycleGeometry({ ...P, sp }, i, false) }));
    G.suv = SUV_VARIANTS.map((_, i) => suvGeometry(P, i)); G.hatch = HATCH_VARIANTS.map((_, i) => hatchbackGeometry(P, i)); G.pickup = PICKUP_VARIANTS.map((_, i) => pickupGeometry(P, i));
    G.box = BOX_VARIANTS.map((_, i) => boxTruckGeometry(P, i));
    G.kit_cop = merge([bx(.38, .1, .4, 0, 1.47, 0, '#13234a'), bx(.3, .03, .16, 0, 1.43, .22, '#0c1530'), bx(.46, .08, .28, 0, .63, 0, '#101420')]);       // cap, belt
    G.kit_swat = merge([sp(.21, 0, 1.36, 0, '#15181c'), bx(.3, .08, .05, 0, 1.32, .19, '#5d6c80'), bx(.48, .4, .3, 0, .9, 0, '#2f3640')]);               // helmet, visor, vest
    G.kit_bandit = merge([sp(.185, 0, 1.3, 0, '#0d0e10'), bx(.26, .05, .05, 0, 1.34, .17, '#e2b08a'), bx(.36, .12, .38, 0, 1.47, 0, '#0d0e10')]);         // balaclava with an eye slit
    G.unit = new THREE.BoxGeometry(1, 1, 1); G.plane = new THREE.PlaneGeometry(1, 1); G.hdd = new THREE.BoxGeometry(.6, .18, .42); G.pkt = new THREE.BoxGeometry(.26, .26, .26);
  }
  const M = { cup: new THREE.MeshStandardMaterial({ color: '#f1efe9', roughness: .5 }), bulb: new THREE.MeshBasicMaterial({ color: col('#3d8bff').multiplyScalar(2.2) }),
    glass: new THREE.MeshStandardMaterial({ color: '#9fd0e8', transparent: true, opacity: .2, roughness: .1, depthWrite: false }),
    hdd: new THREE.MeshStandardMaterial({ roughness: .4, metalness: .5 }), pkt: new THREE.MeshBasicMaterial() };
  const BODY = ['#ffffff', '#d2b3a2', '#9a7a6a'].map(c => new THREE.MeshStandardMaterial({ vertexColors: true, color: c, roughness: .85 }));
  // FOLKM starts as colours and is turned into materials in place right away, so it is typed as the end result (the casts cover the colour step).
  const FOLKM = { cop: '#2c52a8', swat: '#2a2f37', bandit: '#1a1c21' } as unknown as Record<FolkKind, THREE.MeshStandardMaterial>; for (const k in FOLKM) FOLKM[k as FolkKind] = new THREE.MeshStandardMaterial({ color: FOLKM[k as FolkKind] as unknown as string, roughness: .8 }); // street people: police, SWAT, bandits
  const cache = new Map<string, unknown>(), memo = <T,>(k: string, f: () => T): T => { let v = cache.get(k) as T | undefined; if (!v) cache.set(k, v = f()); return v; };
  const roleCol = (r: string) => memo('rc' + r, () => col(DS.roleColor(r))), modelCol = (m: string) => memo('mc' + m, () => col(modelOf(m).color)), effCol = (e: string) => memo('ec' + e, () => col(DS.effortColor(e)));
  const clothMat = (r: string) => memo('cm' + r, () => new THREE.MeshStandardMaterial({ color: DS.roleColor(r), roughness: .8 }));
  const carMat = (r: string) => memo('km' + r, () => new THREE.MeshStandardMaterial({ vertexColors: true, color: DS.roleColor(r), roughness: .32, metalness: .45 }));
  const NEUTRAL = col('#565d68'), OFFC = col('#0b0d11'), BLUE = col('#3d8bff'), RED = col('#ff3b2b'), WARM = col('#ffd9a0'), AMBER = col('#d9962f'), DARKW = col('#0d1219'), CYAN = col('#34d6f0'), GREEN = col('#36d07a');
  const tc = new THREE.Color(), tc2 = new THREE.Color(), tm = new THREE.Matrix4(), tq = new THREE.Quaternion(), tp = V(), ts = V(), YA = V(0, 1, 0);
  const setM = (im: THREE.InstancedMesh, i: number, x: number, y: number, z: number, ry = 0, sx = 1, sy = 1, sz = 1) => { tq.setFromAxisAngle(YA, ry); tm.compose(tp.set(x, y, z), tq, ts.set(sx, sy, sz)); im.setMatrixAt(i, tm); };

  // screen texture: a few lines of "text", multiplied by the effort colour
  const scrTex = (() => { const c = document.createElement('canvas'); c.width = 256; c.height = 160; const x = c.getContext('2d')!; x.fillStyle = '#7d7d7d'; x.fillRect(0, 0, 256, 160); x.fillStyle = '#ffffff';
    for (let i = 0; i < 9; i++) x.fillRect(14 + (i % 3 === 1 ? 16 : 0), 14 + i * 15, 60 + hashf('scr', i) * 150, 6); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
  // speech balloon: one, two, three dots (no text is ever shown)
  const BAL = [1, 2, 3].map(n => { const c = document.createElement('canvas'); c.width = 128; c.height = 96; const x = c.getContext('2d')!; x.fillStyle = '#f4f1ea'; x.beginPath(); x.roundRect(6, 6, 116, 62, 22); x.fill();
    x.beginPath(); x.moveTo(40, 64); x.lineTo(34, 92); x.lineTo(64, 66); x.fill(); x.fillStyle = '#20242c'; for (let i = 0; i < n; i++) { x.beginPath(); x.arc(38 + i * 26, 37, 8, 0, 7); x.fill(); }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false }); });
  const FONT = getComputedStyle(document.documentElement).getPropertyValue('--font-ui').trim() || 'sans-serif';
  function drawSign(F: Office) {
    const c = F.signCv, x = c.getContext('2d')!, need = F.counts.need; x.fillStyle = need ? '#1b5fd6' : '#0d1116'; x.fillRect(0, 0, c.width, c.height); x.fillStyle = F.color; x.fillRect(0, 0, 24, c.height);
    x.font = `800 62px ${FONT}`; x.textBaseline = 'middle'; x.fillStyle = need ? '#ffffff' : '#e9e6df'; let s = (F.name + (need ? '  ·  needs you' : '')).toUpperCase();
    while (s.length > 4 && x.measureText(s).width > c.width - 60) s = s.slice(0, -2) + '…'; x.fillText(s, 44, c.height / 2 + 4); F.signTex.needsUpdate = true; F.signKey = F.name + '|' + need;
  }
  function label(cls: string, html: string, pick?: LabelPick) {
    const el = document.createElement('div'); el.className = cls; el.innerHTML = html; const o = new ctx.CSS2DObject(el);
    if (pick) el.addEventListener('click', e => { e.stopPropagation(); const p = pick(e); if (p) ctx.focus(p[0], p[1]); });
    return o;
  }
  return { G, M, BODY, FOLKM, roleCol, modelCol, effCol, clothMat, carMat, NEUTRAL, OFFC, BLUE, RED, WARM, AMBER, DARKW, CYAN, GREEN, tc, tc2, tp, YA, setM, scrTex, BAL, FONT, drawSign, label };
}
