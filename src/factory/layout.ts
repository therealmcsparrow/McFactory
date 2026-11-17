import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { clamp, easeIO } from '../common/math.js';
import { DS } from '../app/data.js';
import type { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import type { Agent } from '../common/types.js';
import type { FSAtLayout } from './state.js';
import type { Hall, Roller } from './types.js';

export function makeLayout(FS: FSAtLayout) {
  const { ctx } = FS;
  const { scene, reduced, camera, controls } = ctx;
  const BG = '#121418';
  scene.background = new THREE.Color(BG);
  scene.fog = new THREE.Fog(BG, 220, 420);
  scene.add(new THREE.HemisphereLight('#aab6cc', '#0c0d10', 0.55));
  const sun = new THREE.DirectionalLight('#fff1dc', 1.9); sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048); sun.shadow.camera.near = 1; sun.shadow.camera.far = 300; sun.shadow.bias = -.0004; sun.shadow.normalBias = .03;
  scene.add(sun, sun.target);
  const SUNO = new THREE.Vector3(-12, 34, 20).normalize().multiplyScalar(120); let shHalf = 0;
  function updateSun() { // shadow box follows the view; wider when zoomed out
    sun.position.copy(controls.target).add(SUNO); sun.target.position.copy(controls.target);
    const half = clamp(Math.ceil(24 / camera.zoom / 8) * 8, 24, 104);
    if (half !== shHalf) { shHalf = half; Object.assign(sun.shadow.camera, { left: -half, right: half, top: half, bottom: -half }); sun.shadow.camera.updateProjectionMatrix(); }
  }
  const rim = new THREE.DirectionalLight('#7aa2ff', 0.55); rim.position.set(20, 10, -18); scene.add(rim);
  const mat = (c: THREE.ColorRepresentation, o: THREE.MeshStandardMaterialParameters = {}) => new THREE.MeshStandardMaterial(Object.assign({ color: c, roughness: .6, metalness: .1 }, o));

  // ── layout constants (factory local frame: belts run +x toward the exit wall and the dock)
  const DOCKCAP = 24, FW = 17, HX = FW / 2, BX0 = -7.4, BX1 = HX + .45, BY = .62, ARMS = 10, ARMDZ = -1.3, PITCH = 3.2, MAXL = 6, MAXF = 12;
  const XC = HX + .85, XD = HX + 1.95, XP = HX + 3.2;         // cross conveyor, dock rack, robot pick spot
  const CW = 25, CD = 27, OX1 = 23.1, RZ = 13.5, WHX = 7, WHZ = 9, BAYZ = 11.4, NB = 12, CARRY = 3, CRATE_TOK = 20000;
  const ARM_PITCH = 1.45, armX = (i: number) => -6.2 + i * ARM_PITCH; // slot pitch: with the swing tuck (ARM_XL) neighbouring arms never touch, even at max scale
  const rowZ = (r: number, n: number) => (r - (n - 1) / 2) * PITCH + 1.0;
  const SD = 2.4; // sign strip along the far wall (closed-session info board); rows shift toward the near side
  const lineZ = (f: { d: number }, r: number, n: number) => rowZ(r, n) + f.d * SD / 2;
  const MAXCS = 6; // closed-session cards on a hall's info board
  // grid cells around the warehouse (column 0); nearest cells first
  const SLOTS: [number, number][] = [[-1, 0], [1, 0], [-1, -1], [1, -1], [-1, 1], [1, 1], [-2, 0], [2, 0], [-2, -1], [2, -1], [-2, 1], [2, 1]];
  const laneOf = (c: number) => OX1 + (c - 1) * CW - XP - 1.4;
  const LX1 = laneOf(1);
  const slotInfo = (k: number) => { const [i, j] = SLOTS[k], s = Math.sign(i), c = Math.abs(i), ox = s * (OX1 + (c - 1) * CW), oz = j * CD;
    return { k, i, j, ox, oz, d: s < 0 ? 1 : -1, rot: s < 0 ? 0 : Math.PI, lane: s * laneOf(c) }; };
  const W = (f: { ox: number; oz: number; d: number }, lx: number, ly: number, lz: number, out = new THREE.Vector3()) => out.set(f.ox + f.d * lx, ly, f.oz + f.d * lz);

  // ── ground: no visible slab; a shadow-only catcher so the scene sits on the dark background
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000).rotateX(-Math.PI / 2), new THREE.ShadowMaterial({ opacity: .45, depthWrite: false })); floor.receiveShadow = true; scene.add(floor);
  const yellowM = new THREE.MeshStandardMaterial({ color: '#8f7410', roughness: .85, envMapIntensity: .4 }); // floor paint: muted, never glaring
  const L = (arr: THREE.BufferGeometry[], x0: number, z0: number, x1: number, z1: number, w = .1, y = .005) => { const len = Math.hypot(x1 - x0, z1 - z0); const g = new THREE.PlaneGeometry(len, w).rotateX(-Math.PI / 2); g.rotateY(-Math.atan2(z1 - z0, x1 - x0)); g.translate((x0 + x1) / 2, y, (z0 + z1) / 2); arr.push(g); };

  const beltTexC = document.createElement('canvas'); beltTexC.width = 128; beltTexC.height = 64; { const g = beltTexC.getContext('2d')!; g.fillStyle = '#1b1d20'; g.fillRect(0, 0, 128, 64); g.strokeStyle = '#2c2f34'; g.lineWidth = 6; for (let x = 0; x < 128; x += 32) { g.beginPath(); g.moveTo(x, 4); g.lineTo(x + 14, 32); g.lineTo(x, 60); g.stroke(); } }
  const steel = mat('#6f777f', { metalness: .75, roughness: .35 }), dark = mat('#24272b', { metalness: .4, roughness: .5 }), rail = mat('#d9ad00', { roughness: .5 });
  const wallM = mat('#2b2f36', { roughness: .85, envMapIntensity: .5 }), roofM = mat('#3a4654', { metalness: .6, roughness: .4 }), slabM = mat('#18191d', { roughness: .95, envMapIntensity: .35 });
  const invisM = new THREE.MeshBasicMaterial({ visible: false });
  // closed hall shell: corrugated panel texture (one rib per tile, uv in world units), door lamps
  const ribC = document.createElement('canvas'); ribC.width = 32; ribC.height = 8; { const g = ribC.getContext('2d')!, gr = g.createLinearGradient(0, 0, 32, 0);
    gr.addColorStop(0, '#2a2e35'); gr.addColorStop(.35, '#3b414a'); gr.addColorStop(.55, '#30353d'); gr.addColorStop(.8, '#23272d'); gr.addColorStop(1, '#2a2e35'); g.fillStyle = gr; g.fillRect(0, 0, 32, 8); }
  const ribT = new THREE.CanvasTexture(ribC); ribT.colorSpace = THREE.SRGBColorSpace; ribT.wrapS = ribT.wrapT = THREE.RepeatWrapping; ribT.anisotropy = 4;
  const shellM = new THREE.MeshStandardMaterial({ color: '#ffffff', map: ribT, metalness: .45, roughness: .55, envMapIntensity: .6 });
  const pierM = mat('#1d2025', { metalness: .5, roughness: .5 });
  const doorM = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffb84d').multiplyScalar(2.2), toneMapped: false });
  const wuv = (g: THREE.BufferGeometry, k = 3.2) => { const p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv; // world-unit uvs so ribs keep their pitch on any panel
    for (let i = 0; i < p.count; i++) { const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)); uv.setXY(i, (ay > .5 ? p.getX(i) : ax > .5 ? p.getZ(i) : p.getX(i)) * k, (ay > .5 ? p.getZ(i) : p.getY(i)) * .5); } return g; };
  const CH = 3.9; // closed hall height (tall arms stay under the roof)
  const Z0 = new THREE.Matrix4().makeScale(0, 0, 0);
  const mQ = new THREE.Quaternion(), mS = new THREE.Vector3(), mM = new THREE.Matrix4(), mP = new THREE.Vector3(), tv = new THREE.Vector3(), YAX = new THREE.Vector3(0, 1, 0), QI = new THREE.Quaternion();
  const R = reduced ? 0 : 1;
  const crateCols = new Map<string, THREE.Color>(); const crateCol = (role: string) => { let c = crateCols.get(role); if (!c) { c = new THREE.Color(DS.roleColor(role)).lerp(new THREE.Color('#c9a77a'), .12); crateCols.set(role, c); } return c; };
  const seg = (u: number, a: number, b: number) => clamp((u - a) / (b - a), 0, 1), bump = (u: number, a: number, b: number) => { const x = seg(u, a, b); return Math.sin(x * Math.PI); };
  const arc = (a: THREE.Vector3, b: THREE.Vector3, u: number, h: number, out: THREE.Vector3) => { out.lerpVectors(a, b, easeIO(u)); out.y += Math.sin(u * Math.PI) * h; return out; };
  const isLive = (a: { status: string }) => a.status === 'running' || a.status === 'waiting';
  const isFin = (a: Agent) => a.kind !== 'main' && (a.status === 'done' || a.status === 'failed'); // finished subagent: no arm, listed on its line's sign
  const MAXFIN = 4; // rows on a line's finished-agents sign
  const extraLabs: CSS2DObject[] = []; // labels outside the halls that the open-hall label layout must also keep clear

  // ── belt rollers: one InstancedMesh per hall; unit drum (r 1, length 1 along z) with a stripe across both caps so spin reads
  const rollerG = (() => { const tint = (g: THREE.BufferGeometry, c: THREE.ColorRepresentation) => { const col = new THREE.Color(c), n = g.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) col.toArray(a, i * 3); g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g; };
    return mergeGeometries([tint(new THREE.CylinderGeometry(1, 1, 1, 10).rotateX(Math.PI / 2), '#8a929a'), tint(new THREE.BoxGeometry(1.6, .32, 1.06), '#d9ad00')]); })();
  const rollerM = new THREE.MeshStandardMaterial({ color: '#ffffff', vertexColors: true, metalness: .6, roughness: .4 });
  const LROL: Roller[] = []; // per-line template (line-local): side rollers outside the frame + a drum at the feed end
  for (let x = BX0 + .6; x < BX1 - .1; x += 1.3) for (const s of [-1, 1]) LROL.push({ x, y: BY - .11, z: s * .58, r: .075, len: .07 });
  LROL.push({ x: BX0, y: BY - .1, z: 0, r: .11, len: .98 });
  const NLR = LROL.length, XCAP = 48, RCAP = MAXL * NLR + XCAP;
  const ZAX = new THREE.Vector3(0, 0, 1), XAX = new THREE.Vector3(1, 0, 0), QBX = new THREE.Quaternion().setFromAxisAngle(YAX, Math.PI / 2);
  function rollersFrame(f: Hall, dt: number) { // only moving belts rewrite their rollers (plus a full pass after layout changes); reduced motion: R = 0, never spins
    const all = f.rolDirty, im = f.rol; let dirty = all; f.rolDirty = false;
    for (let i = 0; i < Math.min(f.lines.length, MAXL); i++) { const l = f.lines[i], v = f.speed * R * l.sp; if (v) l.rd += dt * v; else if (!all) continue; dirty = true;
      for (let k = 0; k < NLR; k++) { const p = LROL[k]; mP.set(p.x, p.y, l.z + p.z); mQ.setFromAxisAngle(ZAX, -l.rd / p.r); mS.set(p.r, p.r, p.len); mM.compose(mP, mQ, mS); im.setMatrixAt(i * NLR + k, mM); } }
    if (all) for (let j = Math.min(f.lines.length, MAXL) * NLR; j < MAXL * NLR; j++) im.setMatrixAt(j, Z0);
    const v = 1.4 * R * f.cs; if (v) f.cd += dt * v;
    if (v || all) { dirty = true; const B = MAXL * NLR;
      for (let k = 0; k < XCAP; k++) { const p = f.crossR[k]; if (!p) { if (all) im.setMatrixAt(B + k, Z0); continue; }
        mP.set(p.x, p.y, p.z); mQ.setFromAxisAngle(XAX, (p.z < 0 ? 1 : -1) * f.cd / p.r).multiply(QBX); mS.set(p.r, p.r, p.len); mM.compose(mP, mQ, mS); im.setMatrixAt(B + k, mM); } }
    if (dirty) im.instanceMatrix.needsUpdate = true;
  }
  return { scene, reduced, camera, controls, updateSun, mat, DOCKCAP, FW, HX, BX0, BX1, BY, ARMS, ARMDZ, PITCH, MAXL, MAXF, XC, XD, XP, CW, CD, OX1, WHX, WHZ, BAYZ, NB, CARRY, CRATE_TOK, ARM_PITCH, armX, SD, lineZ, MAXCS, SLOTS, slotInfo, W, yellowM, L, beltTexC, steel, dark, rail, wallM, roofM, slabM, invisM, shellM, pierM, doorM, wuv, CH, Z0, mQ, mS, mM, mP, tv, YAX, QI, R, crateCol, seg, bump, arc, isLive, isFin, MAXFIN, extraLabs, rollerG, rollerM, XCAP, RCAP, ZAX, XAX, rollersFrame };
}
