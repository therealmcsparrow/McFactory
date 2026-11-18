// The farms: one per project (up to MAXF), each with a domed homestead, a canister pad on the depot side and one
// condenser row per open session. Each agent is a condenser tower (band = role, cap = model, glow ring = effort,
// lamp = status) tended by a farmhand in a robe of the role colour. Finished subagents leave: the tower sinks and
// the farmhand walks back into the homestead.
import * as THREE from 'three';
import { damp } from '../common/math.js';
import { DS, modelOf, armOrder } from '../app/data.js';
import type { Agent, AgentDelta, DashState, Project, SceneCtx } from '../common/types.js';
import type { Farm, Row, Tower } from './types.js';
import { G, homestead, pad, tower, farmhand, banner, mat, part, invisM } from './models.js';
import { SLOTS, MAXF, MAXROW, CAP, CAN_TOK, ROW0, ROWDZ, TOWDX, PADZ, HOMEZ, DOOR_Z, handPath, pathLen, pathAt } from './terrain.js';

const colCache = new Map<string, THREE.Color>();
export const col = (h: string) => { let c = colCache.get(h); if (!c) { c = new THREE.Color(h); colCache.set(h, c); } return c; };

export function makeFarms(ctx: SceneCtx, emit: (F: Farm, c: THREE.Color, from: THREE.Vector3) => void) {
  const { scene, reduced } = ctx;
  const farms = new Map<string, Farm>(), towers = new Map<string, Tower>(), rowIdx = new Map<string, Row>();
  const used = new Set<number>(); let hidden = 0;

  function addFarm(p: Project): Farm | null {
    let slot = 0; while (slot < SLOTS.length && used.has(slot)) slot++; if (slot >= SLOTS.length) return null; used.add(slot);
    const S = SLOTS[slot], grp = new THREE.Group(); grp.position.set(S.x, 0, S.z); grp.rotation.y = Math.atan2(S.fx, S.fz); scene.add(grp);
    const H = homestead(p.color); H.g.position.z = HOMEZ; grp.add(H.g);
    const pd = pad(); pd.position.z = PADZ; grp.add(pd);
    grp.add(part(G.box, mat('#c9a676', { roughness: 1 }), CAP * TOWDX + 1.4, .05, MAXROW * ROWDZ + .6, 0, .025, ROW0 + (MAXROW - 1) * ROWDZ / 2, false)); // the field
    const hit = part(G.box, invisM, 8.4, 5, 10, 0, 2.5, HOMEZ - 1, false); grp.add(hit); ctx.addPickable(hit, { kind: 'project', id: p.id });
    const el = document.createElement('div'); el.className = 'sign dn'; el.style.setProperty('--c', p.color);
    el.innerHTML = `<i class="sw" style="--c:${p.color}"></i><small></small><b class="need"></b>`;
    el.addEventListener('click', () => ctx.focus('project', p.id));
    const lab = new ctx.CSS2DObject(el); lab.center.set(.5, 1); lab.position.set(0, 5.4, HOMEZ); grp.add(lab);
    const F: Farm = { id: p.id, slot, S, grp, color: p.color, beaconM: H.beacon.material as THREE.MeshStandardMaterial, hit, rows: new Map(), q: [], acc: 0, sled: null,
      scale: reduced ? 1 : 0, dying: null, el, name: p.name, subT: el.querySelector('small')!, needT: el.querySelector<HTMLElement>('.need')!, lab, run: 0, wait: 0, need: 0, fail: 0,
      flags: [-1, 1].map(s => { const B = banner(p.color); B.g.position.set(s * 2.4, 0, HOMEZ - 3.6); grp.add(B.g); return B; }) }; // either side of the door, inside the yard
    F.flags.forEach(B => B.name(p.name)); grp.scale.setScalar(Math.max(F.scale, .001));
    farms.set(p.id, F); return F;
  }
  function removeFarm(F: Farm) {
    for (const R of F.rows.values()) removeRow(R);
    ctx.removePickable(F.hit); scene.remove(F.grp); farms.delete(F.id); used.delete(F.slot);
  }
  function addRow(F: Farm, id: string, idx: number): Row {
    const grp = new THREE.Group(), z = ROW0 + idx * ROWDZ; grp.position.z = z; F.grp.add(grp);
    const L = CAP * TOWDX; const pipe = part(G.cyl8, mat('#8d8f94', { metalness: .5, roughness: .4 }), .09, L, .09, 0, .14, -.75); pipe.rotation.z = Math.PI / 2; grp.add(pipe);
    grp.add(part(G.box, mat('#b48f60', { roughness: 1 }), L, .04, 1.5, 0, .06, 0, false));
    const hit = part(G.box, invisM, L, 1, 2.6, 0, .5, 0, false); grp.add(hit); ctx.addPickable(hit, { kind: 'task', id });
    const R: Row = { id, F, idx, z, grp, hit, slots: [], dying: null }; F.rows.set(id, R); rowIdx.set(id, R); return R;
  }
  function removeRow(R: Row) { ctx.removePickable(R.hit); R.F.grp.remove(R.grp); R.F.rows.delete(R.id); if (rowIdx.get(R.id) === R) rowIdx.delete(R.id); }
  function addTower(F: Farm, R: Row, a: Agent): Tower {
    const P = tower(); F.grp.add(P.g); ctx.addPickable(P.hit, { kind: 'agent', id: a.id });
    const hp = farmhand(DS.roleColor(a.role)); F.grp.add(hp.g);
    const T: Tower = { id: a.id, F, row: R, P, tx: 0, tz: R.z, x: 0, z: R.z, rise: reduced ? 1 : 0, dying: null, st: a.status, needs: a.needsHuman, main: a.kind === 'main',
      hand: { P: hp, x: 0, z: DOOR_Z, yaw: 0, ang: Math.random() * 6, ph: 0, fade: reduced ? 1 : 0, s: reduced ? 1e9 : 0 } };
    towers.set(a.id, T); return T;
  }
  function removeTower(T: Tower) { ctx.removePickable(T.P.hit); T.F.grp.remove(T.P.g, T.hand.P.g); towers.delete(T.id); }
  function paint(T: Tower, a: Agent) {
    T.P.bandM.color.set(DS.roleColor(a.role)); T.P.capM.color.set(modelOf(a.model).color);
    const e = DS.effortColor(a.effort); T.P.ringM.color.set(e); T.P.ringM.emissive.set(e);
    T.hand.P.robeM.color.set(DS.roleColor(a.role));
  }

  const v3 = new THREE.Vector3();
  function sync(state: DashState, deltas: Map<string, AgentDelta>, _initial: boolean) {
    const want: Project[] = [];
    for (const p of state.projects) if (farms.has(p.id) && !farms.get(p.id)!.dying) want.push(p);
    for (const p of state.projects) if (!farms.has(p.id) && want.length < MAXF) want.push(p);
    hidden = Math.max(0, state.projects.length - want.length);
    const keep = new Set(want.map(p => p.id));
    for (const F of farms.values()) if (!keep.has(F.id) && F.dying === null) { F.dying = 0; ctx.removePickable(F.hit); }
    const seen = new Set<string>();
    for (const p of want) {
      let F = farms.get(p.id) || null; if (!F) F = addFarm(p); if (!F) continue;
      if (F.name !== p.name) { F.name = p.name; F.flags.forEach(B => B.name(p.name)); }
      const open = p.tasks.filter(t => !t.closed).sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0)).slice(0, MAXROW).sort((a, b) => (a.startedAt || 0) - (b.startedAt || 0));
      const rowsNow = new Set(open.map(t => t.id));
      for (const R of F.rows.values()) if (!rowsNow.has(R.id) && R.dying === null) R.dying = 0;
      let run = 0, wait = 0, need = 0, fail = 0, idx = 0;
      for (const t of open) {
        let R = F.rows.get(t.id); if (!R || R.dying !== null) { if (R) removeRow(R); R = addRow(F, t.id, idx); }
        R.idx = idx++; if (t.needsHuman) need++;
        const shown = t.agents.filter(a => a.kind === 'main' || (a.status !== 'done' && a.status !== 'failed')).sort(armOrder).slice(0, CAP);
        R.slots = shown.map(a => a.id);
        shown.forEach((a, j) => {
          let T = towers.get(a.id); if (T && (T.dying !== null || T.row !== R)) { if (T.dying === null) T.dying = 0; T = undefined; }
          if (!T) T = addTower(F!, R!, a);
          T.tx = (j - (shown.length - 1) / 2) * TOWDX; T.tz = R!.z; T.st = a.status; T.needs = a.needsHuman; T.main = a.kind === 'main'; paint(T, a); seen.add(a.id);
        });
      }
      for (const t of p.tasks) for (const a of t.agents) {
        if (a.status === 'running') run++; else if (a.status === 'waiting' || a.status === 'queued') wait++; else if (a.status === 'failed') fail++;
        const d = deltas.get(a.id); if (!d || !(d.dTokens > 0) || reduced) continue;
        F.acc += d.dTokens; let k = 0;
        for (; F.acc >= CAN_TOK && k < 12; k++) {
          F.acc -= CAN_TOK; const T = towers.get(a.id);
          if (T && T.F === F) F.grp.localToWorld(v3.set(T.x, 2.2, T.z)); else F.grp.localToWorld(v3.set(0, 1.5, HOMEZ - 3));
          emit(F, col(DS.roleColor(a.role)), v3.clone());
        }
        if (k >= 12) F.acc %= CAN_TOK; // a burst: the pile still shows the total
      }
      F.run = run; F.wait = wait; F.need = need; F.fail = fail;
      const sub = `${run} working · ${open.length} row${open.length === 1 ? '' : 's'}`; if (F.subT.textContent !== sub) F.subT.textContent = sub;
      F.el.classList.toggle('ask', need > 0); const nt = need > 0 ? 'needs you' : ''; if (F.needT.textContent !== nt) F.needT.textContent = nt;
    }
    for (const T of towers.values()) if (!seen.has(T.id) && T.dying === null) T.dying = 0;
  }

  // ── per frame: farms grow in and fade out, rows slide to their place, towers rise and sink, farmhands work
  const BLUE = new THREE.Color('#3d8bff'), AMBER = new THREE.Color('#ffb020'), GREEN = new THREE.Color('#36d07a'), RED = new THREE.Color('#ff3a2a'), OFF = new THREE.Color('#000000');
  function frame(dt: number, t: number) {
    const flash = Math.sin(t * 9) > 0 ? 1 : .15;
    const cp = ctx.camera.position, ct = ctx.controls.target, camYaw = Math.atan2(cp.x - ct.x, cp.z - ct.z);
    for (const F of [...farms.values()]) {
      if (F.dying !== null) { F.dying += dt; F.scale = reduced ? 0 : damp(F.scale, 0, 5, dt); if (F.scale < .02 || F.dying > 3) { removeFarm(F); continue; } }
      else F.scale = reduced ? 1 : damp(F.scale, 1, 4, dt);
      F.grp.scale.setScalar(Math.max(F.scale, .001));
      // the name banners turn their cloth to the camera (so the name always reads), and stir in the wind
      const fy = camYaw - F.grp.rotation.y;
      F.flags.forEach((B, i) => { B.g.rotation.y = fy; if (!reduced) { const w = t * 1.3 + F.slot * 1.7 + i * 2.1; B.cloth.rotation.x = .05 + Math.sin(w) * .05; B.cloth.rotation.z = Math.sin(w * .8 + 1) * .03; } });
      const bc = F.need ? BLUE : F.fail && !F.run ? RED : F.wait && !F.run ? AMBER : F.run ? GREEN : OFF;
      F.beaconM.emissive.copy(bc); F.beaconM.emissiveIntensity = F.need ? 3 * flash : 1.6; F.beaconM.color.copy(bc === OFF ? col('#333333') : bc);
      for (const R of [...F.rows.values()]) {
        const tz = ROW0 + R.idx * ROWDZ; R.z = reduced ? tz : damp(R.z, tz, 4, dt); R.grp.position.z = R.z;
        if (R.dying !== null) { R.dying += dt; R.grp.scale.x = Math.max(.001, 1 - R.dying / .8); if (R.dying > .8) removeRow(R); }
      }
    }
    for (const T of [...towers.values()]) {
      const P = T.P, H = T.hand;
      if (T.dying !== null) T.dying += dt;
      if (T.dying === null) { T.tz = T.row.z; T.rise = reduced ? 1 : Math.min(1, T.rise + dt / 1.2); }
      else T.rise = reduced ? 0 : Math.max(0, T.rise - dt / 1.2);
      T.x = reduced ? T.tx : damp(T.x, T.tx, 4, dt); T.z = reduced ? T.tz : damp(T.z, T.tz, 4, dt);
      P.g.position.set(T.x, -3.6 * (1 - T.rise), T.z);
      const run = T.st === 'running' && T.dying === null;
      if (run && !reduced) P.spin.rotation.y += dt * 3;
      P.ringM.emissiveIntensity = run ? 1.7 : T.st === 'waiting' || T.st === 'queued' ? .35 : 0;
      const lc = T.needs ? BLUE : T.st === 'failed' ? RED : T.st === 'waiting' || T.st === 'queued' ? AMBER : run ? GREEN : OFF;
      P.lampM.emissive.copy(lc); P.lampM.emissiveIntensity = T.needs ? 3.2 * flash : T.st === 'failed' ? 2.6 * (Math.sin(t * 14) > 0 ? 1 : 0) : 1.4;
      // the farmhand walks a path from the door round the dome, up the lane and along the aisle behind its row, chasing
      // a point that moves along it; at the end it paces behind the running tower or stands by it, and walks the path
      // back into the homestead when the tower goes
      const path = handPath(T.x, T.z), L = pathLen(path), home = T.dying !== null;
      let [gx, gz] = pathAt(path, H.s), speed = 1.7;
      if (Math.hypot(gx - H.x, gz - H.z) < .45 || reduced) H.s = home ? Math.max(0, Math.min(H.s, L) - dt * 2.4) : Math.min(L, H.s + dt * 2.4);
      if (reduced) H.s = home ? 0 : L;
      if (!home && H.s >= L) {
        if (run) { H.ang += dt * 1.1; const a = Math.PI / 2 + Math.sin(H.ang) * 1.2; gx = T.x + Math.cos(a) * .8; gz = T.z + Math.sin(a) * .8; speed = 1.2; }
        else { gx = T.x + .75; gz = T.z + .6; }
      } else [gx, gz] = pathAt(path, H.s);
      const dx = gx - H.x, dz = gz - H.z, d = Math.hypot(dx, dz), moving = d > .06;
      if (reduced) { H.x = gx; H.z = gz; }
      else if (moving) { const s = Math.min(d, speed * dt * (d > 2 ? 1.6 : 1)); H.x += dx / d * s; H.z += dz / d * s; H.yaw = Math.atan2(dx, dz); H.ph += dt * 9; }
      else H.yaw = T.needs ? Math.PI : Math.atan2(T.x - H.x, T.z - H.z);
      H.fade = home ? ((H.s <= 0 && d < .5) || T.dying! > 30 ? Math.max(0, H.fade - dt * 2) : H.fade) : Math.min(1, H.fade + dt * 1.5);
      const g = H.P.g; g.position.set(H.x, 0, H.z); g.rotation.y = H.yaw; g.scale.setScalar(Math.max(.001, reduced ? (T.dying !== null ? 0 : 1) : H.fade));
      const sw = moving && !reduced ? Math.sin(H.ph) * .5 : 0; H.P.legL.rotation.x = sw; H.P.legR.rotation.x = -sw;
      H.P.body.position.y = T.needs && !reduced ? Math.abs(Math.sin(t * 6)) * .1 : 0;
      H.P.body.scale.y = !run && T.st === 'done' ? damp(H.P.body.scale.y, .72, 4, dt) : damp(H.P.body.scale.y, 1, 4, dt);
      if (T.dying !== null && T.rise <= 0 && H.fade <= 0) removeTower(T);
    }
  }
  const towerWorld = (id: string) => { const T = towers.get(id); return T ? T.F.grp.localToWorld(new THREE.Vector3(T.x, 1.6, T.z)) : null; };
  const handWorld = (id: string) => { const T = towers.get(id); return T ? T.F.grp.localToWorld(new THREE.Vector3(T.hand.x, 1.7, T.hand.z)) : null; };
  return { farms, towers, rowIdx, sync, frame, towerWorld, handWorld, hiddenN: () => hidden };
}
export type Farms = ReturnType<typeof makeFarms>;
