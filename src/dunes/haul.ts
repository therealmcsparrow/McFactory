// Water on its way to the depot. Every CAN_TOK tokens a farm makes, a canister (role colour) hops from the tower to
// the farm's pad. A hover-sled from the depot ring picks the pad up (six at a time), flies back over the dunes and town,
// hovers over the depot hall's roof opening (one sled at a time) and drops them onto the pile inside. All canisters, wherever they are, are one instanced mesh redrawn each frame.
import * as THREE from 'three';
import { damp } from '../common/math.js';
import type { SceneCtx } from '../common/types.js';
import type { Can, Farm, Sled } from './types.js';
import { G, sled } from './models.js';
import { heightAt, padSpot, pileSpot, pileN, PADCAP, PADZ, LOAD, HALL_H } from './terrain.js';
import { YARD, DEPOT, FLOOR, parkSpot } from './world.js';

const MAXS = 8, CAPI = 1200, LOADN = 6, VMAX = 11, HOVER = 1.15, CRUISE = 8.5, BAY_Y = HALL_H + .3; // BAY_Y: the hall's roof, sleds unload hovering over its opening
interface Drop { c: THREE.Color; from: THREE.Vector3; to: THREE.Vector3; t: number }

export function makeHaul(ctx: SceneCtx, farms: Map<string, Farm>, total: () => number) {
  const { scene, reduced } = ctx;
  const inst = new THREE.InstancedMesh(G.can, new THREE.MeshStandardMaterial({ roughness: .45, metalness: .3 }), CAPI);
  inst.castShadow = true; inst.receiveShadow = true; inst.frustumCulled = false; inst.count = 0; scene.add(inst);
  inst.setColorAt(0, new THREE.Color('#fff'));
  const sleds: Sled[] = [], drops: Drop[] = [];

  function newSled(): Sled {
    const i = sleds.length, [x, z] = parkSpot(i), P = sled(); scene.add(P.g);
    const S: Sled = { id: i + 1, P, x, z, y: heightAt(x, z) + HOVER, yaw: Math.atan2(DEPOT.x - x, DEPOT.z - z), v: 0, home: i, st: 'park', F: null, from: null, cargo: [], tm: 0, bay: false };
    sleds.push(S); return S;
  }
  for (let i = 0; i < 3; i++) newSled();

  /** A new canister from a tower: it hops onto the farm's pad (when the pad is full, it goes straight to the total). */
  function emit(F: Farm, c: THREE.Color, from: THREE.Vector3) { if (F.q.length < PADCAP) F.q.push({ c, from, t: 0 }); }
  /** Carried over from the last view: canisters waiting on this farm's pad. */
  function restore(F: Farm, cols: THREE.Color[]) { for (const c of cols) if (F.q.length < PADCAP) F.q.push({ c, from: null, t: 1 }); }

  const tgt = new THREE.Vector3();
  /** Fly to (tx, tz): lift straight up to cruise height (above every building), fly level, stop over the spot and
   * settle straight down. True once it hovers there. */
  function moveTo(S: Sled, tx: number, tz: number, dt: number, base = heightAt(tx, tz)): boolean {
    const dx = tx - S.x, dz = tz - S.z, d = Math.hypot(dx, dz), ty = base + HOVER;
    if (reduced) { S.x = tx; S.z = tz; S.y = ty; S.v = 0; return true; }
    if (d < .15) { S.x = tx; S.z = tz; S.v = 0; S.y = Math.max(ty, S.y - 3.2 * dt); return S.y - ty < .02; }
    const want = Math.atan2(dx, dz); let dy = want - S.yaw; while (dy > Math.PI) dy -= Math.PI * 2; while (dy < -Math.PI) dy += Math.PI * 2; S.yaw += dy * Math.min(1, dt * 4);
    const cy = heightAt(S.x, S.z) + CRUISE;
    S.y = S.y < cy ? Math.min(cy, S.y + 3.6 * dt) : Math.max(cy, S.y - 2 * dt);
    if (S.y < cy - .5) return false; // still lifting
    S.v = Math.min(VMAX, S.v + 9 * dt, Math.sqrt(2 * 7 * d) + .4); const s = Math.min(d, S.v * dt); S.x += dx / d * s; S.z += dz / d * s;
    return false;
  }
  const padWorld = (F: Farm, k: number, out: THREE.Vector3) => { const [x, y, z] = padSpot(k); return F.grp.localToWorld(out.set(x, y, PADZ + z)); };
  const pileTop = () => { const n = pileN(total()), [x, y, z] = pileSpot(Math.max(0, n - 1)); return tgt.set(YARD.x + x, y + FLOOR + .45, YARD.z + z).clone(); };

  function frame(dt: number, t: number) {
    // send a parked sled (or a new one) to every pad with canisters and no sled on its way
    for (const F of farms.values()) {
      if (F.dying !== null || F.sled || !F.q.length) continue;
      let best: Sled | null = null, bd = Infinity;
      for (const S of sleds) if (S.st === 'park') { const d = Math.hypot(S.x - F.grp.position.x, S.z - F.grp.position.z); if (d < bd) { bd = d; best = S; } }
      if (!best && sleds.length < MAXS) best = newSled();
      if (best) { best.st = 'out'; best.F = F; best.from = F.id; F.sled = best; }
    }
    for (const S of sleds) {
      S.tm += dt;
      if (S.F && S.F.dying !== null && (S.st === 'out' || S.st === 'load')) { S.F.sled = null; S.F = null; S.st = 'back'; }
      if (S.st === 'out' && S.F) { S.F.grp.localToWorld(tgt.set(LOAD[0], 0, LOAD[1])); if (moveTo(S, tgt.x, tgt.z, dt)) { S.st = 'load'; S.tm = 0; } }
      else if (S.st === 'load' && S.F) {
        const F = S.F; const fx = F.grp.position.x, fz = F.grp.position.z; let dy = Math.atan2(fx - S.x, fz - S.z) - S.yaw; while (dy > Math.PI) dy -= Math.PI * 2; while (dy < -Math.PI) dy += Math.PI * 2; S.yaw += dy * Math.min(1, dt * 4);
        if (S.tm > (reduced ? 0 : .26)) {
          S.tm = 0;
          if (F.q.length && S.cargo.length < LOADN) { const k = F.q.length - 1, c = F.q.pop()!; S.cargo.push({ c: c.c, from: padWorld(F, k, new THREE.Vector3()), t: reduced ? 1 : 0 }); }
          else { F.sled = null; S.F = null; S.st = 'back'; }
        }
      } else if (S.st === 'back') {
        // one sled at a time over the roof opening; the others wait over their pads
        if (!S.bay && !sleds.some(o => o.bay)) S.bay = true;
        if (S.bay) { if (moveTo(S, YARD.x, YARD.z, dt, BAY_Y)) { S.st = 'unload'; S.tm = 0; } }
        else { const [x, z] = parkSpot(S.home); moveTo(S, x, z, dt); }
      } else if (S.st === 'unload') {
        if (S.tm > (reduced ? 0 : .2)) {
          S.tm = 0; const c = S.cargo.pop();
          if (c) { if (!reduced) drops.push({ c: c.c, from: S.P.g.localToWorld(S.P.slots[S.cargo.length].clone()), to: pileTop(), t: 0 }); }
          else { S.st = 'home'; S.bay = false; S.from = null; }
        }
      } else if (S.st === 'home') { const [x, z] = parkSpot(S.home); if (moveTo(S, x, z, dt)) S.st = 'park'; }
      if (S.st === 'park' || S.st === 'load' || S.st === 'unload' || (S.st === 'back' && !S.bay && S.v === 0 && S.y < heightAt(S.x, S.z) + HOVER + .3)) { // hovering in place, bobbing a little
        const gy = (S.st === 'unload' ? BAY_Y : heightAt(S.x, S.z)) + HOVER + (reduced ? 0 : Math.sin(t * 2.1 + S.id) * .09);
        S.y = reduced ? gy : damp(S.y, gy, 5, dt);
      }
      S.P.g.position.set(S.x, S.y, S.z); S.P.g.rotation.y = S.yaw; S.P.g.rotation.z = reduced ? 0 : Math.sin(t * 1.3 + S.id) * .03;
      S.P.glowM.emissiveIntensity = S.st === 'park' ? .8 : 1.9;
      S.P.g.updateMatrixWorld();
    }
    // draw every canister: on pads, hopping, on sleds, dropping into the pile
    let n = 0; const m4 = new THREE.Matrix4(), p = new THREE.Vector3(), q = new THREE.Vector3();
    const put = (v: THREE.Vector3, c: THREE.Color) => { if (n >= CAPI) return; m4.makeTranslation(v.x, v.y, v.z); inst.setMatrixAt(n, m4); inst.setColorAt(n, c); n++; };
    const hop = (c: Can, to: THREE.Vector3, dur: number) => {
      if (c.from && c.t < 1) { c.t = Math.min(1, c.t + dt / dur); const k = c.t; p.lerpVectors(c.from, to, k); p.y += Math.sin(k * Math.PI) * Math.max(1.2, c.from.distanceTo(to) * .35); return p; }
      return to;
    };
    for (const F of farms.values()) { F.grp.updateMatrixWorld(); F.q.forEach((c, k) => put(hop(c, padWorld(F, k, q), 1.1), c.c)); }
    for (const S of sleds) S.cargo.forEach((c, k) => put(hop(c, S.P.g.localToWorld(q.copy(S.P.slots[k])), .3), c.c));
    for (let i = drops.length - 1; i >= 0; i--) { const D = drops[i]; D.t += dt / .5; if (D.t >= 1) { drops.splice(i, 1); continue; } p.lerpVectors(D.from, D.to, D.t); p.y += Math.sin(D.t * Math.PI) * Math.max(1.5, D.from.distanceTo(D.to) * .35); put(p, D.c); }
    inst.count = n; inst.instanceMatrix.needsUpdate = true; if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
  }
  /** Canisters still on their way, by project: pads and sled loads (for the hand-over to the next view). */
  function inTransit(): [string, THREE.Color][] {
    const out: [string, THREE.Color][] = [];
    for (const F of farms.values()) for (const c of F.q) out.push([F.id, c.c]);
    for (const S of sleds) if (S.from && S.st !== 'unload') for (const c of S.cargo) out.push([S.from, c.c]);
    return out;
  }
  return { sleds, emit, restore, frame, inTransit, canisters: () => inst.count };
}
