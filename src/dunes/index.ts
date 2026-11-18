// The Dunes view: an overview of a desert planet under twin suns. Each project is a moisture farm on the dunes around a
// desert town; each open session is a row of condenser towers, each agent a tower with its farmhand. Tokens become water
// canisters that hover-sleds haul into the depot hall, onto the pile (the window total). Warden squads walk the patrol
// ring and stand guard by any farm that needs you; dune crawlers plod the outer ring. Scenery on top: townsfolk, ships
// landing at the town's spaceport, flybys overhead, now and then a blade duel out on the dunes and a saucer lifting an
// alien out of town.
import * as THREE from 'three';
import { clamp } from '../common/math.js';
import { DS, fmt, costTxt } from '../app/data.js';
import { carryOnLeave, takeCarry, type Carry } from '../app/carry.js';
import type { SceneApi, SceneCtx, PickKind } from '../common/types.js';
import { makeWorld, YARD, DEPOT } from './world.js';
import { makeFarms, col } from './farms.js';
import { makeHaul } from './haul.js';
import { makePatrol } from './patrol.js';
import { makeSky } from './sky.js';
import { makeDuel } from './duel.js';
import { makePort } from './port.js';
import { makeFolk } from './folk.js';
import { makeAbduct } from './abduct.js';
import { pileN, PILE, SETTLE_R, FARM_HX, FARM_Z0, FARM_Z1, ROW0, ROWDZ, HOMEZ, CAN_TOK } from './terrain.js';

export function buildDunes(ctx: SceneCtx): SceneApi {
  const { camera, reduced } = ctx;
  const W = makeWorld(ctx);
  let total = 0;
  // farms emit canisters into the haul, which reads the farms: the haul is made second and reached through a closure
  let haul!: ReturnType<typeof makeHaul>;
  const F = makeFarms(ctx, (f, c, from) => haul.emit(f, c, from));
  haul = makeHaul(ctx, F.farms, () => total);
  const H = { get h() { return haul; } };
  const P = makePatrol(ctx, F.farms);
  const fun = (k: string) => { try { return window.CWFun.get(k) !== false; } catch { return true; } };
  const folkN = () => { try { return window.CWFun.get('townsfolk'); } catch { return 24; } };
  const Sky = makeSky(ctx, () => fun('flybys')), Duel = makeDuel(ctx, () => fun('duels')), Port = makePort(ctx, () => fun('port'));
  const Folk = makeFolk(ctx, folkN), Abd = makeAbduct(ctx, Folk, () => fun('abductions'));

  // "+N more" when there are more projects than farm plots
  const moreEl = document.createElement('div'); moreEl.className = 'sign more'; moreEl.style.display = 'none';
  const moreLab = new ctx.CSS2DObject(moreEl); moreLab.position.set(DEPOT.x - SETTLE_R * .75, 4, DEPOT.z - SETTLE_R * .75); ctx.scene.add(moreLab);

  let carry: Carry | null = takeCarry(), shownPile = 0, wantPile = 0;
  function sync(state: Parameters<SceneApi['sync']>[0], _ev: Parameters<SceneApi['sync']>[1], deltas: Parameters<SceneApi['sync']>[2], initial: boolean) {
    F.sync(state, deltas, initial);
    if (carry) { for (const [id, cols] of carry) { const f = F.farms.get(id); if (f) H.h.restore(f, cols.map(h => new THREE.Color(h))); } carry = null; }
    const T = DS.totals(), roles = DS.byRole(); total = T.tokens;
    wantPile = pileN(T.tokens); if (initial || reduced) shownPile = wantPile;
    let acc = 0, i = 0; const tot = roles.reduce((n, r) => n + r.tokens, 0) || 1;
    for (const r of roles) { acc += r.tokens; const end = Math.round(acc / tot * PILE), c = col(r.color); for (; i < end; i++) W.pile.setColorAt(i, c); }
    if (W.pile.instanceColor) W.pile.instanceColor.needsUpdate = true;
    W.depEl.querySelector('b')!.textContent = fmt.tokens(T.tokens);
    W.depEl.querySelector('.u')!.textContent = `${costTxt(T.cost, T.costKnown)} · 1 canister = ${fmt.tokens(CAN_TOK)} tokens`;
    const more = F.hiddenN(); moreEl.style.display = more > 0 ? '' : 'none'; if (more > 0) moreEl.textContent = `+${more} more farm${more === 1 ? '' : 's'} beyond the ridge`;
  }
  carryOnLeave(() => { const m: Carry = new Map(); for (const [id, c] of H.h.inTransit()) { let a = m.get(id); if (!a) m.set(id, a = []); a.push('#' + c.getHexString()); } return m; });

  function frame(dt: number, t: number) {
    W.updateSuns();
    F.frame(dt, t); H.h.frame(dt, t); P.frame(dt, t);
    Sky.frame(dt); Duel.frame(dt, t); Port.frame(dt, t); Folk.frame(dt); Abd.frame(dt, t);
    shownPile = reduced ? wantPile : shownPile + (wantPile - shownPile) * Math.min(1, dt * 2);
    W.pile.count = clamp(Math.round(shownPile), 0, PILE);
  }

  const fw = (f: { grp: THREE.Group }, x: number, y: number, z: number) => f.grp.localToWorld(new THREE.Vector3(x, y, z));
  function focusOf(kind: PickKind, id: string) {
    if (kind === 'project') { const f = F.farms.get(id); if (!f) return null; return { target: fw(f, 0, 0, (FARM_Z0 + FARM_Z1) / 2), zoom: 1.1 }; }
    if (kind === 'task') { const R = F.rowIdx.get(id); if (!R) return null; return { target: fw(R.F, 0, 0, R.z), zoom: 2.2 }; }
    if (kind === 'agent') { const T = F.towers.get(id); if (!T) return null; return { target: fw(T.F, T.x, 1, T.z), zoom: 3.5 }; }
    return { target: new THREE.Vector3(DEPOT.x, 0, DEPOT.z), zoom: .62 };
  }
  const anchorOf = (id: string) => F.handWorld(id);

  // home: the classic iso view fitted to the used plots plus the settlement, in the free gap between the side columns
  const ISO = new THREE.Vector3(1, 1, 1).normalize(), R = new THREE.Vector3(1, 0, -1).normalize(), U = new THREE.Vector3(-1, 2, -1).normalize(), HP = new THREE.Vector3();
  function home() {
    const pts: [number, number][] = [[-SETTLE_R - 3, -SETTLE_R - 3], [SETTLE_R + 3, SETTLE_R + 3], [-SETTLE_R - 3, SETTLE_R + 3], [SETTLE_R + 3, -SETTLE_R - 3]];
    for (const f of F.farms.values()) { if (f.dying !== null) continue; for (const x of [-FARM_HX, FARM_HX]) for (const z of [FARM_Z0, FARM_Z1]) { const v = fw(f, x, 0, z); pts.push([v.x, v.z]); } }
    const w = innerWidth, h = innerHeight; let l = 0, r = w;
    if (w >= 820) { l = document.querySelector('.col.l')?.getBoundingClientRect().right || 0; r = document.querySelector('.col.r')?.getBoundingClientRect().left || w; if (r - l < 300) { l = 0; r = w; } }
    let u0 = 1e9, u1 = -1e9, s0 = 1e9, s1 = -1e9;
    for (const [x, z] of pts) for (const y of [0, 5]) { HP.set(x, y, z); const u = HP.dot(R), s = HP.dot(U); u0 = Math.min(u0, u); u1 = Math.max(u1, u); s0 = Math.min(s0, s); s1 = Math.max(s1, s); }
    const ppu = h / (30 * (w / h < 1 ? 1.6 : 1)), mx = 32, mt = 76, mb = 28;
    const zoom = clamp(Math.min((r - l - 2 * mx) / (ppu * (u1 - u0)), (h - mt - mb) / (ppu * (s1 - s0))), .12, 1.6);
    const t = R.clone().multiplyScalar((u0 + u1) / 2).addScaledVector(U, (s0 + s1) / 2 + (mt - mb) / 2 / (ppu * zoom));
    t.addScaledVector(ISO, -t.y / ISO.y);
    return { target: t, pos: t.clone().addScaledVector(ISO, 52), zoom };
  }

  window.__dunes = {
    stats: () => {
      let pads = 0, rows = 0; for (const f of F.farms.values()) { pads += f.q.length; rows += f.rows.size; }
      return { farms: F.farms.size, rows, towers: F.towers.size, pads, sleds: H.h.sleds.map(s => s.st), canisters: H.h.canisters(), pile: W.pile.count, zoom: camera.zoom, ...P.stats(),
        ships: Sky.kinds(), duel: Duel.stats(), port: Port.stats(), ...Folk.stats(), ...Abd.stats() };
    },
    events: () => ({ duel: Duel.stats().duel, abduct: Abd.stats().abduct, rm: reduced, aliens: Folk.aliens() }),
    duel: () => Duel.force(), abduct: () => Abd.force(),
    flyby: (k?: string) => Sky.launch(k as never),
    folkAt: () => Folk.where(),
    homes: () => [...F.farms.values()].map(f => { const v = f.grp.localToWorld(new THREE.Vector3(0, 0, HOMEZ - 3)); return [f.name, v.x, v.z]; }),
    look: (x: number, y: number, z: number, zoom: number) => ctx.flyTo(new THREE.Vector3(x, y, z), { zoom }),
    yard: YARD, row0: ROW0, rowdz: ROWDZ, homez: HOMEZ,
  };
  return {
    sync, frame, focusOf, anchorOf, home, layoutLabels() { }, driveRobot: () => false,
    onFloor: (id: string) => F.farms.has(id),
    lineSlots: (id: string) => { const R = F.rowIdx.get(id); return R ? new Set(R.slots) : null; },
  };
}
