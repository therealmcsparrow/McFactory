import * as THREE from 'three';
import { hashf } from '../../common/math.js';
import type { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import type { Project } from '../../common/types.js';
import type { OSAtOffices } from '../state.js';
import type { Office, OfficeSeat, Person, SportsCar } from '../types.js';

export function makeOffices(OS: OSAtOffices) {
  const { SLOTS, cellX, CD, MAXROW, NSPOT, NSIDE, GREEN, mesh, G, VC, CYAN, setM, DARKW, drawSign, M, NDESK, scrTex, SEATS, NEUTRAL, OFFC, HIT, BW, BH, BD, cy, label, HZ, HX, ROWZ, ctx } = OS;
  const { scene } = OS.ctx;
  // desk screens: the instance colour multiplies the text texture. aInk = 1 inverts that: a black screen with the text lines in the
  // instance colour (max effort is black, and a plain black screen would look switched off). Each office gets its own plane geometry for the attribute.
  function screenMesh() {
    const geo = G.plane.clone(), ink = new THREE.InstancedBufferAttribute(new Float32Array(NDESK), 1); geo.setAttribute('aInk', ink);
    const mat = new THREE.MeshBasicMaterial({ map: scrTex });
    mat.onBeforeCompile = sh => {
      sh.vertexShader = 'attribute float aInk;\nvarying float vInk;\n' + sh.vertexShader.replace('#include <color_vertex>', '#include <color_vertex>\n  vInk = aInk;');
      sh.fragmentShader = 'varying float vInk;\n' + sh.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\n  if (vInk > .5) diffuseColor.rgb *= sampledDiffuseColor.r > .6 ? 1. : .06;');
    };
    return new THREE.InstancedMesh(geo, mat, NDESK);
  }
  // ── buildings ──
  const bldgs = new Map<string, Office>(), slotUsed = new Array<string | null>(SLOTS.length).fill(null), people = new Map<string, Person>(), byAgent = new Map<string, string>(), leavers = new Set<Person>(), cars = new Set<SportsCar>();
  const who = (id: string) => people.get(id) || people.get(byAgent.get(id)!); // no byAgent entry: get(undefined) just misses
  function addBuilding(p: Project, k: number) {
    // the literal holds the plain values (checked against Partial<Office>); the meshes, materials and labels are set right below
    const [c, r] = SLOTS[k], F = { id: p.id, k, c, r, name: p.name, color: p.color, ox: cellX(c), oz: r * CD, open: 0, openT: 0, pickOn: null,
      rows: new Array(MAXROW).fill(null), rowOf: new Map(), spots: new Array(NSPOT + NSIDE).fill(null), dock: { q: [], res: 0, age: 0 }, counts: { run: 0, wait: 0, need: false, why: '' },
      srv: 0, clockT: 0, clockC: GREEN, closed: [], labs: [], hits: [], wDirty: true, lock: { who: null }, truck: null } as Partial<Office> as Office;
    const g = F.g = new THREE.Group(); g.position.set(F.ox, 0, F.oz); scene.add(g);
    g.add(mesh(G.outer, VC));
    F.mSrv = new THREE.MeshBasicMaterial({ color: CYAN.clone().multiplyScalar(.25) }); g.add(new THREE.Mesh(G.srv, F.mSrv));
    // shell
    const sh = F.shell = new THREE.Group(); g.add(sh);
    F.mShell = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .85, metalness: .05 }); F.shellMesh = mesh(G.shell, F.mShell); sh.add(F.shellMesh);
    const NW = G.winAt.length; F.mWin = new THREE.MeshBasicMaterial(); F.win = new THREE.InstancedMesh(G.win, F.mWin, NW);
    G.winAt.forEach(([x, y, z, ry], i) => { setM(F.win, i, x, y, z, ry); F.win.setColorAt(i, DARKW); }); sh.add(F.win);
    F.wl = new Float32Array(NW); F.wVar = Float32Array.from({ length: NW }, (_, i) => .7 + .6 * hashf(p.id, i + 50));
    const ord = [...Array(NW).keys()].sort((a, b) => hashf(p.id, a) - hashf(p.id, b)); F.wOrder = new Uint16Array(NW); ord.forEach((w, rank) => { F.wOrder[w] = rank; });
    F.signCv = document.createElement('canvas'); F.signCv.width = 800; F.signCv.height = 92; F.signTex = new THREE.CanvasTexture(F.signCv); F.signTex.colorSpace = THREE.SRGBColorSpace;
    F.mSign = new THREE.MeshBasicMaterial({ map: F.signTex }); sh.add(new THREE.Mesh(G.sign, F.mSign)); drawSign(F);
    F.mSiren = new THREE.MeshBasicMaterial({ color: '#2a2d33' }); sh.add(new THREE.Mesh(G.siren, F.mSiren));
    // workfloor
    const inn = F.inner = new THREE.Group(); inn.visible = false; g.add(inn);
    inn.add(mesh(G.inner, VC), new THREE.Mesh(G.glass, M.glass));
    F.tops = new THREE.InstancedMesh(G.unit, new THREE.MeshStandardMaterial({ roughness: .55, metalness: .1 }), NDESK); F.tops.castShadow = true; F.tops.receiveShadow = true;
    F.screens = screenMesh();
    F.mLed = new THREE.MeshBasicMaterial({ color: '#0c2014' }); const led = new THREE.Mesh(G.unit, F.mLed); led.scale.set(.03, .12, .3); led.position.set(8.3, 1.52, 5.92); inn.add(led);
    F.seats = SEATS.map(s => Object.assign({ who: null, idx: -1 }, s) as OfficeSeat); // hit: set in the loop below
    let n = 0; for (const s of F.seats) {
      if (s.top) { s.idx = n++; setM(F.tops, s.idx, s.top[0], s.top[1], s.top[2], 0, s.top[3], s.top[4], s.top[5]); F.tops.setColorAt(s.idx, NEUTRAL); setM(F.screens, s.idx, s.scr![0], s.scr![1], s.scr![2], s.scr![5], s.scr![3], s.scr![4], 1); F.screens.setColorAt(s.idx, OFFC); }
      const h = new THREE.Mesh(G.unit, HIT); h.scale.set(1.1, 1.7, 1.2); h.position.set(s.x, .85, s.z + (s.ri != null && !s.mgr ? -.1 : 0)); h.visible = false; inn.add(h); s.hit = h; ctx.addPickable(h, { kind: 'agent', id: '' }); F.hits.push(h);
    }
    inn.add(F.tops, F.screens);
    F.hit = new THREE.Mesh(new THREE.BoxGeometry(BW, BH, BD), HIT); F.hit.position.y = BH / 2; g.add(F.hit); ctx.addPickable(F.hit, { kind: 'project', id: p.id }); F.hits.push(F.hit);
    // signs
    const add = (o: CSS2DObject, x: number, y: number, z: number, cx: number, cy: number) => { o.position.set(x, y, z); o.center.set(cx, cy); o.element.dataset.p = p.id; g.add(o); F.labs.push(o); o.visible = false; return o; };
    F.lab = add(label('sign ob', '<b></b><small></small>', () => ['project', F.id]), 0, BH + 3.4, HZ, .5, 1); F.lab.element.style.setProperty('--c', p.color);
    F.cbLab = add(label('sign cb', '<div class="h"><span>Closed sessions</span><small></small></div><div class="g"></div><div class="more2"></div>', e => { const c = (e.target as Element).closest<HTMLElement>('[data-task]'); return c ? ['task', c.dataset.task!] : null; }), -HX, 2.6, -HZ, 1, 1);
    F.cbLab.element.style.setProperty('--c', p.color);
    F.zoneLab = {}; const rowHTML = '<i class="dot"></i><span></span><b class="nd">needs you</b><small></small>';
    for (let ri = 0; ri < MAXROW; ri++) F.zoneLab['r' + ri] = add(label('sign ln orow', rowHTML, () => F.zoneLab['r' + ri].task ? ['task', F.zoneLab['r' + ri].task!] : null), -HX - .2, 1.1, ROWZ[ri] + .3, 1, .5);
    F.zoneLab.meet = add(label('sign ln orow', rowHTML, () => F.zoneLab.meet.task ? ['task', F.zoneLab.meet.task] : null), -4.9, 2.5, -HZ + .4, .5, 1);
    F.zoneLab.kit = add(label('sign ln orow', rowHTML, () => F.zoneLab.kit.task ? ['task', F.zoneLab.kit.task] : null), 5.4, 2.5, -HZ + .4, .5, 1);
    F.moreLab = add(label('sign more omore', ''), 0, .6, HZ + .4, .5, 0);
    bldgs.set(p.id, F); slotUsed[k] = p.id; return F;
  }
  function removeBuilding(F: Office) {
    for (const P of [...people.values(), ...leavers]) if (P.f === F) OS.dropPerson(P);
    for (const c of [...cars]) if (c.F === F) OS.dropCar(c);
    for (const h of F.hits) ctx.removePickable(h); for (const o of F.labs) o.removeFromParent();
    scene.remove(F.g); for (const m of [F.mShell, F.mWin, F.mSign, F.mSiren, F.mSrv, F.mLed, F.tops.material, F.screens.material]) m.dispose(); F.signTex.dispose();
    for (const im of [F.win, F.tops, F.screens]) im.dispose(); F.screens.geometry.dispose(); // the screens have their own geometry (screenMesh)
    bldgs.delete(F.id); slotUsed[F.k] = null; if (OS.focusF === F) OS.focusF = null;
  }
  function refreshVis(F: Office) { // what is clickable and which signs show depends on open/closed
    const on = F.open > .5; F.hit.visible = F.openT < .5;
    for (const s of F.seats) { const P = s.who && people.get(s.who); s.hit.visible = on && !!P; if (P) s.hit.userData.pick.id = P.a.id; }
    for (const k in F.zoneLab) { const o = F.zoneLab[k]; o.visible = on && !!o.task; o.element.classList.toggle('on', !!o.task && o.task === OS.markedTask); }
    F.cbLab.visible = on && F.closed.length > 0; F.cbLab.element.classList.toggle('show', F.cbLab.visible);
    F.moreLab.visible = on && !!F.moreLab.element.textContent; F.lab.visible = on || F.counts.need;
  }
  return { bldgs, slotUsed, people, byAgent, leavers, cars, who, addBuilding, removeBuilding, refreshVis };
}
