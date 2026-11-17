import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Project, Task } from '../common/types.js';
import type { FSAtHalls } from './state.js';
import type { Hall, Line } from './types.js';

export function makeHalls(FS: FSAtHalls) {
  const { SLOTS, slotInfo, scene, beltTexC, BX1, BX0, mat, rollerG, rollerM, RCAP, Z0, invisM, PITCH, SD, lineZ, FW, slabM, HX, wallM, roofM, CH, wuv, shellM, pierM, doorM, XC, BY, XCAP, dark, rail, W, L, armX, ARMS, ARMDZ, steel, yellowM, isLive, MAXL, reduced, ctx } = FS;
  // ── factories: one hall per project, in grid cells around the central warehouse
  const smokeG = new THREE.IcosahedronGeometry(.3, 1);
  const facs = new Map<string, Hall>(), slotUsed: (string | null)[] = Array(SLOTS.length).fill(null), lineIdx = new Map<string, Line>();
  function makeFactory(p: Project, k: number) {
    const f = Object.assign(slotInfo(k), { id: p.id, name: p.name, color: p.color, lines: [], n: -1, D: 0, more: 0, speed: .5, det: false, fix: null, q: -1, backlog: 0 }) as unknown as Hall;
    f.grp = new THREE.Group(); f.grp.position.set(f.ox, 0, f.oz); f.grp.rotation.y = f.rot; scene.add(f.grp);
    f.bt = new THREE.CanvasTexture(beltTexC); f.bt.colorSpace = THREE.SRGBColorSpace; f.bt.wrapS = f.bt.wrapT = THREE.RepeatWrapping; f.bt.repeat.set((BX1 - BX0) / 1.2, 1);
    f.beltM = mat('#ffffff', { map: f.bt, roughness: .85 });
    // cross conveyor: own texture (uv u in world units), runs only while it carries crates
    f.ct = f.bt.clone(); f.ct.needsUpdate = true; f.ct.repeat.set(1 / 1.2, 1); f.ctM = mat('#ffffff', { map: f.ct, roughness: .85 }); f.cs = 0; f.crossLoad = 0;
    f.rol = new THREE.InstancedMesh(rollerG, rollerM, RCAP); f.rol.frustumCulled = false; for (let j = 0; j < RCAP; j++) f.rol.setMatrixAt(j, Z0); f.grp.add(f.rol); f.crossR = []; f.cd = 0; f.rolDirty = true;
    f.accentM = new THREE.MeshStandardMaterial({ color: p.color, emissive: p.color, emissiveIntensity: .25, roughness: .5 });
    f.padM = mat(new THREE.Color(p.color).lerp(new THREE.Color('#141519'), .7), { roughness: .9, envMapIntensity: .4 });
    f.roofM = mat('#2e343c', { metalness: .55, roughness: .5, transparent: true }); f.roofDM = mat('#22262c', { metalness: .5, roughness: .45, transparent: true });
    f.skyM = new THREE.MeshStandardMaterial({ color: '#1a2230', emissive: '#ffd08a', emissiveIntensity: .1, roughness: .2, metalness: .3, transparent: true });
    f.beaconM = new THREE.MeshBasicMaterial({ color: '#222222', toneMapped: false, transparent: true });
    f.smoke = [0, 1, 2].map(i => { const m = new THREE.Mesh(smokeG, new THREE.MeshBasicMaterial({ color: '#f4f2ee', transparent: true, opacity: 0, depthWrite: false })); m.userData.ph = i / 3; m.visible = false; return m; });
    // roof name sign: the name painted on a canvas texture (a real panel in the scene, so it keeps its place and angle as the camera moves)
    { const SPX = 120, cv = document.createElement('canvas'), g = cv.getContext('2d')!, FONT = `800 ${SPX * .7}px "Barlow Condensed", "Arial Narrow", sans-serif`, txt = p.name.toUpperCase();
      g.font = FONT; const wPx = Math.min(SPX * 6, Math.max(SPX * 2.6, Math.ceil(g.measureText(txt).width + SPX * .9)));
      cv.width = wPx; cv.height = SPX; f.signW = wPx / SPX; // panel size in world units (1 unit high)
      const draw = () => { g.fillStyle = '#16181d'; g.fillRect(0, 0, cv.width, cv.height);
        g.fillStyle = p.color; g.fillRect(0, cv.height - SPX * .1, cv.width, SPX * .1); g.fillRect(0, 0, cv.width, SPX * .04);
        g.font = FONT; g.fillStyle = '#f2f0ea'; g.textAlign = 'center'; g.textBaseline = 'middle';
        const tw = g.measureText(txt).width, room = cv.width - SPX * .6, sx = tw > room ? room / tw : 1;
        g.save(); g.translate(cv.width / 2, cv.height * .47); g.scale(sx, 1); g.fillText(txt, 0, 0); g.restore(); if (f.nameTex) f.nameTex.needsUpdate = true; };
      draw(); f.nameTex = new THREE.CanvasTexture(cv); f.nameTex.colorSpace = THREE.SRGBColorSpace; f.nameTex.anisotropy = 4;
      if (document.fonts) document.fonts.ready.then(draw); // redraw once the web font is in
      f.signM = new THREE.MeshBasicMaterial({ map: f.nameTex, transparent: true, toneMapped: false }); }
    f.op = 0; f.run = 0; f.wait = 0; f.need = 0;
    f.hit =new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), invisM); f.grp.add(f.hit); ctx.addPickable(f.hit, { kind: 'project', id: p.id });
    const ne = document.createElement('div'); ne.className = 'sign fac'; ne.style.setProperty('--c', p.color); ne.innerHTML = `<i class="sw" style="--c:${p.color}"></i><span></span><small class="cl"></small><b class="need"></b>`;
    ne.addEventListener('click', () => ctx.focus('project', p.id));
    f.nameT = ne.querySelector('span')!; f.needT = ne.querySelector<HTMLElement>('.need')!; f.nameEl = ne; f.nameT.textContent = p.name; f.nameLab = new ctx.CSS2DObject(ne); f.nameLab.center.set(.5, 1); f.grp.add(f.nameLab);
    const se = document.createElement('div'); se.className = 'sign sub'; se.style.setProperty('--c', p.color); se.innerHTML = '<b>—</b><small></small><small class="q"></small>';
    se.addEventListener('click', () => ctx.focus('project', p.id));
    f.subB = se.querySelector('b')!; f.subS = se.querySelector('small')!; f.subQ = se.querySelector<HTMLElement>('.q')!;
    for (const el of [ne, se]) { el.addEventListener('pointerenter', () => { f.signHov = true; }); el.addEventListener('pointerleave', () => { f.signHov = false; }); } // the hall's own signs count as the hall
    f.subLab = new ctx.CSS2DObject(se); f.subLab.center.set(.5, 1); f.grp.add(f.subLab);
    f.clT = ne.querySelector<HTMLElement>('.cl')!; ne.dataset.h = se.dataset.h = p.id; ne.dataset.p = '50'; se.dataset.p = '45';
    // closed sessions: one info board on the far wall (shown while the hall is open), cards open the session card
    const be = document.createElement('div'); be.className = 'sign cb'; be.style.setProperty('--c', p.color);
    be.innerHTML = `<div class="h"><i class="sw" style="--c:${p.color}"></i><span></span><small></small></div><div class="g"></div><div class="more2"></div>`;
    f.cbName = be.querySelector<HTMLElement>('.h span')!; f.cbN = be.querySelector<HTMLElement>('.h small')!; f.cbG = be.querySelector<HTMLElement>('.g')!; f.cbMore = be.querySelector<HTMLElement>('.more2')!; f.cbKey = '';
    const csOf = (e: Event) => (e.target as HTMLElement).closest && (e.target as HTMLElement).closest<HTMLElement>('.cs');
    be.addEventListener('click', e => { const c = csOf(e); if (c) ctx.focus('task', c.dataset.task!); });
    be.addEventListener('keydown', e => { const c = csOf(e); if (c && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); ctx.focus('task', c.dataset.task!); } });
    be.addEventListener('pointermove', e => { const c = csOf(e); ctx.hud.tip(c ? { kind: 'task', id: c.dataset.task! } : null, e.clientX, e.clientY); });
    be.addEventListener('pointerleave', () => ctx.hud.tip(null));
    be.dataset.h = p.id; be.dataset.p = '60'; be.dataset.up = '1'; // the board only moves up (away from the lines)
    f.cbLab = new ctx.CSS2DObject(be); f.cbLab.center.set(.5, 1); f.grp.add(f.cbLab); f.closed = []; f.fixS = 1;
    f.dock = FS.dockFor(k); f.dock.f = f;
    facs.set(p.id, f); slotUsed[k] = p.id; return f;
  }
  function buildFixtures(f: Hall, n: number) {
    if (f.fix) { f.grp.remove(f.fix); f.fix.traverse(o => (o as THREE.Mesh).geometry && (o as THREE.Mesh).geometry.dispose()); }
    const D = n * PITCH + 1.8 + SD, hz = D / 2; f.D = D; f.n = n;
    const zs = [...Array(n).keys()].map(r => lineZ(f, r, n));
    const fix = new THREE.Group(); f.fix = fix; f.grp.add(fix);
    const add = (geoms: THREE.BufferGeometry[], m: THREE.Material, cast = true, recv = true) => { if (!geoms.length) return; const me = new THREE.Mesh(mergeGeometries(geoms), m); me.castShadow = cast; me.receiveShadow = recv; fix.add(me); };
    add([new THREE.BoxGeometry(FW + .3, .05, D + .3).translate(0, .025, 0)], slabM, false, true);
    // low walls, project-color accent along the top, belt openings in the exit wall
    const WHt = .8, WT = .16, wall: THREE.BufferGeometry[] = [], acc: THREE.BufferGeometry[] = [];
    const wseg = (x0: number, z0: number, x1: number, z1: number) => { const lx = Math.abs(x1 - x0) + WT, lz = Math.abs(z1 - z0) + WT;
      wall.push(new THREE.BoxGeometry(lx, WHt, lz).translate((x0 + x1) / 2, WHt / 2, (z0 + z1) / 2)); acc.push(new THREE.BoxGeometry(lx + .02, .08, lz + .02).translate((x0 + x1) / 2, WHt + .04, (z0 + z1) / 2)); };
    wseg(-HX, -hz, -HX, hz); wseg(-HX, -hz, HX, -hz); wseg(-HX, hz, HX, hz);
    let zc = -hz; for (const z of zs) { if (z - .62 > zc + .05) wseg(HX, zc, HX, z - .62); zc = z + .62; } if (hz > zc + .05) wseg(HX, zc, HX, hz);
    add(wall, wallM); add(acc, f.accentM, false, false);
    // roof outline (open-top cutaway): corner posts, perimeter beams, light trusses
    const RH = 3.0, roof: THREE.BufferGeometry[] = [];
    for (const [x, z] of [[-HX, -hz], [HX, -hz], [-HX, hz], [HX, hz]]) roof.push(new THREE.BoxGeometry(.16, RH, .16).translate(x, RH / 2, z));
    for (const z of [-hz, hz]) roof.push(new THREE.BoxGeometry(FW, .12, .12).translate(0, RH, z));
    for (const x of [-HX, HX]) roof.push(new THREE.BoxGeometry(.12, .12, D).translate(x, RH, 0));
    for (let x = -HX + 4.25; x < HX - .5; x += 4.25) roof.push(new THREE.BoxGeometry(.06, .06, D).translate(x, RH, 0));
    add(roof, roofM, false, false);
    add([new THREE.BoxGeometry(FW + .14, .05, .16).translate(0, RH + .09, -hz), new THREE.BoxGeometry(FW + .14, .05, .16).translate(0, RH + .09, hz)], f.accentM, false, false);
    // closed building: upper walls (sink into the low walls when the hall opens) + roof (lifts and fades)
    const SH2 = CH - WHt, shell = new THREE.Group(); shell.position.y = WHt; fix.add(shell); f.shell = shell;
    const sadd = (grp: THREE.Object3D, geoms: THREE.BufferGeometry[], m: THREE.Material, cast = true, recv = true) => { if (!geoms.length) return; const me = new THREE.Mesh(mergeGeometries(geoms), m); me.castShadow = cast; me.receiveShadow = recv; grp.add(me); };
    const sw: THREE.BufferGeometry[] = [], piers: THREE.BufferGeometry[] = [], band: THREE.BufferGeometry[] = [], lamps: THREE.BufferGeometry[] = [];
    const sseg = (x0: number, z0: number, x1: number, z1: number, y0 = 0) => { const lx = Math.abs(x1 - x0) + WT, lz = Math.abs(z1 - z0) + WT; sw.push(wuv(new THREE.BoxGeometry(lx, SH2 - y0, lz).translate((x0 + x1) / 2, (SH2 + y0) / 2, (z0 + z1) / 2))); };
    sseg(-HX, -hz, -HX, hz); sseg(-HX, -hz, HX, -hz); sseg(-HX, hz, HX, hz);
    const DOORH = 1.5 - WHt; zc = -hz;
    for (const z of zs) { if (z - .62 > zc + .05) sseg(HX, zc, HX, z - .62); sseg(HX, z - .62, HX, z + .62, DOORH); zc = z + .62;
      lamps.push(new THREE.BoxGeometry(.08, .07, 1.3).translate(HX + .12, DOORH + .02, z)); // lit lintel over each belt door
      for (const s2 of [-1, 1]) piers.push(new THREE.BoxGeometry(.14, DOORH + .1, .1).translate(HX + .1, (DOORH + .1) / 2 - .05, z + s2 * .67)); }
    if (hz > zc + .05) sseg(HX, zc, HX, hz);
    for (let x = -HX; x <= HX + .01; x += FW / 4) for (const z of [-hz, hz]) piers.push(new THREE.BoxGeometry(.24, SH2 + .02, .24).translate(x, SH2 / 2, z));
    for (let z = -hz; z <= hz + .01; z += D / Math.max(2, Math.round(D / 4.5))) piers.push(new THREE.BoxGeometry(.24, SH2 + .02, .24).translate(-HX, SH2 / 2, z), new THREE.BoxGeometry(.24, .5, .24).translate(HX, SH2 - .25, z));
    for (const [x, z, lx, lz] of [[0, -hz, FW + .3, .3], [0, hz, FW + .3, .3], [-HX, 0, .3, D + .3], [HX, 0, .3, D + .3]]) band.push(new THREE.BoxGeometry(lx, .16, lz).translate(x, SH2 - .5, z));
    sadd(shell, sw, shellM); sadd(shell, piers, pierM); sadd(shell, band, f.accentM, false, false); sadd(shell, lamps, doorM, false, false);
    const roofG = new THREE.Group(); roofG.position.y = CH; fix.add(roofG); f.roofG = roofG;
    const rs: THREE.BufferGeometry[] = [], rd: THREE.BufferGeometry[] = [], sky: THREE.BufferGeometry[] = [], SL = BX1 - BX0 - 3, SC = (BX0 + BX1) / 2 - 1;
    rs.push(new THREE.BoxGeometry(FW + .5, .16, D + .5).translate(0, .08, 0));
    for (const [x, z, lx, lz] of [[0, -hz - .2, FW + .5, .1], [0, hz + .2, FW + .5, .1], [-HX - .2, 0, .1, D + .5], [HX + .2, 0, .1, D + .5]]) rd.push(new THREE.BoxGeometry(lx, .28, lz).translate(x, .22, z)); // parapet
    for (const z of zs) { sky.push(new THREE.BoxGeometry(SL, .08, .7).translate(SC, .2, z - .4)); rd.push(new THREE.BoxGeometry(SL + .2, .14, .1).translate(SC, .2, z - .8), new THREE.BoxGeometry(SL + .2, .14, .1).translate(SC, .2, z)); }
    if (!n) sky.push(new THREE.BoxGeometry(FW - 5, .08, .7).translate(0, .2, 0));
    for (const [x, z] of [[-HX + 1.4, hz - 1.2], [HX - 1.4, hz - 1.2], [HX - 1.4, -hz + 1.6]]) rd.push(new THREE.BoxGeometry(.9, .45, .9).translate(x, .38, z), new THREE.BoxGeometry(1.1, .08, 1.1).translate(x, .64, z)); // roof vents
    const chx = -HX + 1.4, chz = -hz + 1.2; rd.push(new THREE.CylinderGeometry(.26, .32, 2.2, 12).translate(chx, 1.2, chz));
    sadd(roofG, rs, f.roofM, true, true); sadd(roofG, rd, f.roofDM, true, false); sadd(roofG, sky, f.skyM, false, false);
    sadd(roofG, [new THREE.CylinderGeometry(.5, .55, .16, 16).translate(0, .3, 0)], f.roofDM, true, false); // siren plinth, centre of the roof
    const bcn = new THREE.Mesh(new THREE.CylinderGeometry(.34, .34, .55, 16).translate(0, .38 + .275, 0), f.beaconM); roofG.add(bcn);
    f.smokeAt = [chx, chz]; f.smoke.forEach(m => f.grp.add(m));
    // session lines: frames, rails, pads and floor paint are per line (lineParts) so they slide when lines re-layout
    const stl: THREE.BufferGeometry[] = [], rails: THREE.BufferGeometry[] = [], pads: THREE.BufferGeometry[] = [], paint: THREE.BufferGeometry[] = [], dk: THREE.BufferGeometry[] = [];
    // closed-session info board: a standing panel along the far wall (its cards are the CSS board above it)
    const bz = -f.d * (hz - .3), bw = FW - 2.4;
    stl.push(new THREE.BoxGeometry(bw, 1.0, .07).translate(0, .95, bz));
    for (const x of [-bw / 2 + .2, bw / 2 - .2]) stl.push(new THREE.BoxGeometry(.09, .5, .09).translate(x, .25, bz));
    paint.push(new THREE.BoxGeometry(bw + .06, .06, .1).translate(0, 1.48, bz));
    f.cbZ = bz;
    // cross conveyor outside the exit wall: collects every line and feeds the dock
    if (n) { const z0 = Math.min(zs[0] - .45, -.45), z1 = Math.max(zs[n - 1] + .45, .45), len = z1 - z0;
      stl.push(new THREE.BoxGeometry(.72, .2, len).translate(XC, BY - .11, (z0 + z1) / 2));
      for (let z = z0 + .3; z < z1; z += 2.4) stl.push(new THREE.BoxGeometry(.08, BY - .2, .5).translate(XC, (BY - .2) / 2, z));
      // two halves, chevrons pointing at the feed point z = 0 (texture u runs along each half's travel)
      const half = (a: number, b: number, ang: number) => { const L2 = Math.abs(b - a), g = new THREE.PlaneGeometry(L2, .64); const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * L2); return g.rotateX(-Math.PI / 2).rotateY(ang).translate(XC, BY, (a + b) / 2); };
      dk.push(half(z0, 0, -Math.PI / 2), half(0, z1, Math.PI / 2));
      { const g = dk[dk.length - 1]; g.computeBoundingBox(); f.crossTop = g.boundingBox!.max.y; } // crates ride on the cross belt's top face
      f.crossR = [{ x: XC, y: BY - .1, z: z0, r: .11, len: .76 }, { x: XC, y: BY - .1, z: z1, r: .11, len: .76 }];
      for (let z = z0 + .6; z < z1 - .2 && f.crossR.length < XCAP - 1; z += 1.2) if (Math.abs(z) > .05) for (const s of [-1, 1]) f.crossR.push({ x: XC + s * .42, y: BY - .11, z, r: .075, len: .07 }); }
    else f.crossR = [];
    f.rolDirty = true;
    add(dk, f.ctM, false, true); add(stl, dark); add(rails, rail, false, false); add(pads, f.padM, false, true); add(paint, f.accentM, false, false);
    f.hit.geometry.dispose(); f.hit.geometry = new THREE.BoxGeometry(FW, 1, D).translate(0, .5, 0);
    // roof name sign: a fixed panel along the front edge of the roof, on poles with back struts; it lifts and fades with the roof
    { const SH = 2, W = f.signW * SH, y0 = .8, yc = y0 + SH / 2, sg = new THREE.Group(), st: THREE.BufferGeometry[] = [];
      sg.position.set(0, 0, f.d * (hz - .55)); sg.rotation.y = f.d > 0 ? 0 : Math.PI; roofG.add(sg); // the panel faces the front (world +z) for every hall
      const px = W > 6 ? [-W / 2 + .5, 0, W / 2 - .5] : [-W / 2 + .4, W / 2 - .4];
      for (const x of px) { st.push(new THREE.BoxGeometry(.12, y0 + SH - .1, .12).translate(x, .16 + (y0 + SH - .26) / 2, -.12)); // pole
        st.push(new THREE.BoxGeometry(.09, .09, 2).rotateX(-.78).translate(x, .95, -.8)); } // back strut down to the roof
      st.push(new THREE.BoxGeometry(W + .14, SH + .14, .08).translate(0, yc, -.06)); // backing board
      sadd(sg, st, f.roofDM, true, false);
      const face = new THREE.Mesh(new THREE.PlaneGeometry(W, SH).translate(0, yc, -.015), f.signM); sg.add(face);
      if (f.signHit) ctx.removePickable(f.signHit); f.signHit = face; ctx.addPickable(face, { kind: 'project', id: f.id });
      f.nameLab.position.set(0, CH + 1.4, 0); } // the CSS tag only shows "needs you", above the siren
    f.subAt = [new THREE.Vector3(-HX + 3.2, 1.0, f.d * (hz + .2)), new THREE.Vector3(HX - 3.2, CH + .45, -f.d * hz)]; // overview: front corner; open hall: above the far wall toward the exit
    f.subLab.position.copy(f.subAt[f.det ? 1 : 0]);
    f.cbLab.position.set(0, 1.55, bz);
    FS.placeBin(f);
  }
  function killFactory(f: Hall) {
    for (const l of [...f.lines]) killLine(l);
    for (const c of FS.cr) if (c.st === 'cross' && c.f === f) c.dead = true;
    if (f.fix) f.fix.traverse(o => (o as THREE.Mesh).geometry && (o as THREE.Mesh).geometry.dispose());
    f.hit.geometry.dispose(); ctx.removePickable(f.hit); if (f.signHit) ctx.removePickable(f.signHit); scene.remove(f.grp);
    for (const lab of [f.nameLab, f.subLab, f.cbLab]) lab.element.remove();
    [f.bt, f.beltM, f.ct, f.ctM, f.accentM, f.padM, f.rol, f.roofM, f.roofDM, f.skyM, f.beaconM, f.signM, f.nameTex, ...f.smoke.map(m => m.material)].forEach(d => d.dispose());
    slotUsed[f.k] = null; if (f.dock.f === f) f.dock.f = null; facs.delete(f.id);
  }
  // ── lines: one conveyor per session
  const beltTopG = new THREE.PlaneGeometry(BX1 - BX0, .9).rotateX(-Math.PI / 2).translate((BX0 + BX1) / 2, BY, 0);
  beltTopG.computeBoundingBox(); const BELT_TOP = beltTopG.boundingBox!.max.y; // crates rest on the belt mesh's top face
  const lineHitG = new THREE.BoxGeometry(BX1 - BX0 + .6, 1.3, 3.4).translate((BX0 + BX1) / 2, .65, -1.1);
  const lineParts = (() => { // line-local static parts at z = 0: steel frame + legs + feed drum, rails, arm pad, floor paint
    const BL = BX1 - BX0, BC = (BX0 + BX1) / 2, stl: THREE.BufferGeometry[] = [], rails: THREE.BufferGeometry[] = [], paint: THREE.BufferGeometry[] = [];
    stl.push(new THREE.BoxGeometry(BL + .2, .2, 1.06).translate(BC, BY - .11, 0));
    for (let x = BX0 + .4; x < BX1; x += 2.6) for (const s of [-1, 1]) stl.push(new THREE.BoxGeometry(.08, BY - .2, .08).translate(x, (BY - .2) / 2, s * .42));
    stl.push(new THREE.CylinderGeometry(.1, .1, .96, 12).rotateX(Math.PI / 2).translate(BX0, BY - .1, 0));
    for (const s of [-1, 1]) rails.push(new THREE.BoxGeometry(BL + .2, .1, .05).translate(BC, BY + .02, s * .5));
    L(paint, BX0 - .3, .8, HX - .4, .8, .08, .056); L(paint, BX0 - .3, -2.95, HX - .4, -2.95, .08, .056);
    return { stl: mergeGeometries(stl), rails: mergeGeometries(rails), paint: mergeGeometries(paint),
      pad: new THREE.BoxGeometry(armX(ARMS - 1) - armX(0) + 1.2, .04, .8).translate((armX(0) + armX(ARMS - 1)) / 2, .07, ARMDZ - 1.1) };
  })();
  function makeLine(f: Hall, t: Task, row: number) {
    const el = document.createElement('div'); el.className = 'sign ln'; el.innerHTML = '<i class="dot"></i><span></span><b class="need">needs you</b><small></small>';
    el.addEventListener('click', () => ctx.focus('task', t.id));
    // one sign per line at the line start: line row on top, finished-agents chip row under it (same CSS2D object)
    const wrap = document.createElement('div'); wrap.className = 'lsign' + (f.d > 0 ? '' : ' r'); wrap.dataset.h = f.id; wrap.appendChild(el);
    const lab = new ctx.CSS2DObject(wrap); lab.center.set(f.d > 0 ? 0 : 1, .5); lab.visible = f.det; f.grp.add(lab); // signs extend over their own hall
    const hit = new THREE.Mesh(lineHitG, invisM); hit.visible = f.det; f.grp.add(hit); ctx.addPickable(hit, { kind: 'task', id: t.id });
    // finished agents: a small sign under the line sign; rows open the agent card, hover = tooltip
    const fe = document.createElement('div'); fe.className = 'sign fin'; fe.innerHTML = '<div class="fh"><span></span><small></small></div><div class="fc"></div><div class="fl"></div><div class="fm"></div>';
    const faOf = (e: Event) => (e.target as HTMLElement).closest && (e.target as HTMLElement).closest<HTMLElement>('.fa');
    fe.addEventListener('click', e => { const r = faOf(e); if (r) ctx.focus('agent', r.dataset.agent!); });
    fe.addEventListener('keydown', e => { const r = faOf(e); if (r && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); ctx.focus('agent', r.dataset.agent!); } });
    fe.addEventListener('pointermove', e => { const r = faOf(e); ctx.hud.tip(r ? { kind: 'agent', id: r.dataset.agent! } : null, e.clientX, e.clientY); });
    fe.addEventListener('pointerleave', () => ctx.hud.tip(null));
    fe.hidden = true; wrap.appendChild(fe); // shown when the line has finished agents (renderFin)
    const l = { id: t.id, f, row, z: 0, slots: Array(ARMS).fill(null), el, wrap, lab, hit, finEl: fe, finH: fe.querySelector('.fh span'), finS: fe.querySelector('.fh small'), finL: fe.querySelector('.fl'), finM: fe.querySelector('.fm'), finC: fe.querySelector('.fc'), finKey: '', finN: 0, dot: el.querySelector('.dot'), title: el.querySelector('span'), small: el.querySelector('small'), sp: 0, load: 0, work: false, rd: 0 } as unknown as Line; f.rolDirty = true;
    // own belt surface + texture so each line can stop on its own
    l.bt = f.bt.clone(); l.bt.needsUpdate = true; l.beltM = mat('#ffffff', { map: l.bt, roughness: .85 });
    l.belt = new THREE.Mesh(beltTopG, l.beltM); l.belt.receiveShadow = true; f.grp.add(l.belt);
    l.parts = new THREE.Group(); f.grp.add(l.parts);
    for (const [g, m, cast, recv] of [[lineParts.stl, steel, true, true], [lineParts.rails, rail, false, false], [lineParts.pad, f.padM, false, true], [lineParts.paint, yellowM, false, false]] as [THREE.BufferGeometry, THREE.Material, boolean, boolean][]) { const me = new THREE.Mesh(g, m); me.castShadow = cast; me.receiveShadow = recv; l.parts.add(me); }
    f.lines.push(l); lineIdx.set(t.id, l); return l;
  }
  function posLine(l: Line) { l.hit.position.set(0, 0, l.z); l.lab.position.set(BX0 - .1, 1.05, l.z); l.belt.position.set(0, 0, l.z); l.parts.position.z = l.z; l.f.rolDirty = true; }
  function killLine(l: Line) {
    for (const A of [...FS.arms.values(), ...FS.dyingArms]) if (A.line === l) FS.freeArm(A);
    for (const c of FS.cr) if (c.st === 'belt' && c.line === l) c.dead = true;
    ctx.removePickable(l.hit); l.f.grp.remove(l.hit, l.lab, l.belt, l.parts); l.wrap.remove(); l.bt.dispose(); l.beltM.dispose();
    lineIdx.delete(l.id); l.f.lines.splice(l.f.lines.indexOf(l), 1); l.f.rolDirty = true;
  }
  // only open sessions get a line; a line whose session closed retires: arms leave, its crates ride out, then it is removed
  function layoutLines(f: Hall, p: Project, initial: boolean) {
    const open = p.tasks.filter(t => !t.closed).sort((a, b) => ((isLive(b) as unknown as number) - (isLive(a) as unknown as number)) || b.lastActivity - a.lastActivity);
    const retiring = f.lines.filter(l => l.closing && !open.some(t => t.id === l.id)).length;
    const top = open.slice(0, Math.max(0, MAXL - retiring)), ids = new Set(top.map(t => t.id)); f.more = open.length - top.length;
    for (const l of [...f.lines]) { if (ids.has(l.id)) { if (l.closing) { l.closing = false; l.el.classList.remove('closing'); } } else if (initial) killLine(l); else if (!l.closing) retireLine(l); }
    const used = new Set(f.lines.map(l => l.row)); let added = false;
    for (const t of top) if (!lineIdx.has(t.id)) { let r = 0; while (used.has(r)) r++; used.add(r); makeLine(f, t, r); added = true; }
    if (added || f.lines.length !== f.n) relayout(f);
    f.closed = p.tasks.filter(t => t.closed).sort((a, b) => (b.endedAt || b.lastActivity) - (a.endedAt || a.lastActivity));
  }
  function retireLine(l: Line) { l.closing = true; l.el.classList.add('closing'); for (const A of [...FS.arms.values()]) if (A.line === l) FS.startDying(A); }
  function relayout(f: Hall) { // compact rows; the hall resizes (eased via fix scale), lines slide to their new rows, new lines start in place
    f.lines.sort((a, b) => a.row - b.row).forEach((l, i) => { l.row = i; }); const n = f.lines.length;
    if (n !== f.n) { const D0 = f.D; buildFixtures(f, n); f.fixS = D0 && !reduced ? D0 / f.D : 1; f.fix!.scale.z = f.fixS; f.cbLab.position.z = f.cbZ * f.fixS; }
    for (const l of f.lines) { l.zt = lineZ(f, l.row, n); if (!l.placed || reduced) l.z = l.zt; l.placed = true; posLine(l); }
  }
  return { facs, slotUsed, lineIdx, makeFactory, killFactory, BELT_TOP, posLine, killLine, layoutLines, relayout };
}
