// Ambient life on the dunes: squads of four white-armoured wardens walking the patrol ring between the two rings of
// farms, and two dune crawlers plodding the outer ring. When a farm has a session that needs you, the nearest free squad
// marches there in single file, round every building, field and pad, and stands guard by its door until the farm no
// longer needs you; then it marches back to the ring. More squads come out of the garrison hall when every squad is
// busy (up to MAXSQ).
import type { SceneCtx } from '../common/types.js';
import type { Farm } from './types.js';
import { warden, crawler, poseCrawler, type FigureParts, type CrawlerParts } from './models.js';
import { heightAt, assignNearest, makeNav, walkObs, postSpot, farmToWorld, pathAt, pathLen, PATROL_R, WALKER_R, HOMEZ, GARRISON_DOOR, GARRISON_OUT } from './terrain.js';

const MAXSQ = 6, N = 4, GAP = .9; // squads, men per squad, spacing in the file
type P2 = [number, number];
interface Member { P: FigureParts; x: number; z: number; yaw: number; ph: number; moving: boolean }
/** order[j] = the member at place j in the file (0 leads). While marching, place j follows the path at s - j * GAP. */
interface Squad { id: number; men: Member[]; order: number[]; mode: 'loop' | 'go' | 'guard' | 'return'; th: number; dir: number; F: Farm | null; path: P2[]; s: number; L: number; dest: P2 }
interface Crawler { P: CrawlerParts; th: number; dir: number; ph: number }

export function makePatrol(ctx: SceneCtx, farms: Map<string, Farm>) {
  const { scene, reduced } = ctx;
  const squads: Squad[] = [], crawlers: Crawler[] = [];

  // the router, rebuilt when the set of farms changes
  let navKey = '', nav = makeNav(walkObs([]));
  function navNow() {
    const slots = [...farms.values()].map(F => F.slot).sort((a, b) => a - b), k = slots.join();
    if (k !== navKey) { navKey = k; nav = makeNav(walkObs(slots)); for (const Q of squads) if (Q.mode === 'go' || Q.mode === 'return') march(Q, Q.dest, Q.mode === 'go' && Q.F ? posts(Q.F).slice(1) : []); }
    return nav;
  }
  const posts = (F: Farm): P2[] => [3, 2, 1, 0].map(i => postSpot(F.S, i));

  function addSquad(th: number, dir: number, fromGarrison = false): Squad {
    const men: Member[] = Array.from({ length: N }, (_, i) => { const P = warden(i === 0); scene.add(P.g); return { P, x: 0, z: 0, yaw: 0, ph: Math.random() * 6, moving: false }; });
    const Q: Squad = { id: squads.length + 1, men, order: [0, 1, 2, 3], mode: 'loop', th, dir, F: null, path: [], s: 0, L: 0, dest: [0, 0] }; squads.push(Q);
    men.forEach((m, i) => { const [x, z] = fromGarrison ? GARRISON_DOOR : ringPos(Q, i); m.x = x; m.z = z; });
    return Q;
  }
  /** Place j of a squad walking the ring: in single file behind the leader. */
  function ringPos(Q: Squad, j: number): P2 { const a = Q.th - Q.dir * j * GAP / PATROL_R; return [Math.cos(a) * PATROL_R, Math.sin(a) * PATROL_R]; }
  /** Set a squad marching from where its men stand to dest, then through the extra points. */
  function march(Q: Squad, dest: P2, tail: P2[], via: P2[] = []) {
    const pts = Q.order.map(k => [Q.men[k].x, Q.men[k].z] as P2).reverse(), head = pts[pts.length - 1];
    let from = head; const mid: P2[] = [];
    for (const v of via) { mid.push(...navNow().route(from[0], from[1], v[0], v[1])); from = v; }
    Q.path = [...pts, ...mid, ...navNow().route(from[0], from[1], dest[0], dest[1]), ...tail];
    Q.s = pathLen(pts); Q.L = pathLen(Q.path); Q.dest = dest;
  }
  addSquad(.3, 1); addSquad(2.4, -1); addSquad(4.4, 1);
  for (const [th, dir] of [[.8, 1], [3.9, -1]] as const) { const P = crawler(); scene.add(P.g); crawlers.push({ P, th, dir, ph: 0 }); }

  function assign() {
    const needing = [...farms.values()].filter(F => F.dying === null && F.need > 0);
    for (const Q of squads) if (Q.F && (Q.mode === 'go' || Q.mode === 'guard') && !needing.includes(Q.F)) {
      // back to the ring: the file turns round, so the last man at the posts leads
      Q.F = null; Q.mode = 'return'; Q.order.reverse();
      const h = Q.men[Q.order[0]], a = Math.atan2(h.z, h.x); Q.th = a;
      march(Q, [Math.cos(a) * PATROL_R, Math.sin(a) * PATROL_R], []);
    }
    const open = needing.filter(F => !squads.some(Q => Q.F === F));
    if (!open.length) return;
    const free = squads.filter(Q => !Q.F);
    const pick = assignNearest(free.map(Q => [Q.men[Q.order[0]].x, Q.men[Q.order[0]].z]), open.map(F => [F.grp.position.x, F.grp.position.z]));
    open.forEach((F, j) => {
      let Q = pick[j] >= 0 ? free[pick[j]] : null, via: P2[] = [];
      if (!Q && squads.length < MAXSQ) { Q = addSquad(0, 1, true); via = [GARRISON_OUT]; }
      if (!Q) return;
      const P = posts(F); Q.F = F; Q.mode = 'go'; march(Q, P[0], P.slice(1), via);
    });
  }

  function walk(m: Member, gx: number, gz: number, speed: number, dt: number) {
    const dx = gx - m.x, dz = gz - m.z, d = Math.hypot(dx, dz);
    m.moving = d > .05;
    if (reduced) { m.x = gx; m.z = gz; m.moving = false; return d; }
    if (m.moving) { const s = Math.min(d, speed * dt * (d > 2 ? 1.5 : 1)); m.x += dx / d * s; m.z += dz / d * s; m.yaw = Math.atan2(dx, dz); m.ph += dt * 8; }
    return d;
  }
  function frame(dt: number, t: number) {
    navNow(); assign();
    for (const Q of squads) {
      let far = 0, lag = 0;
      if (Q.mode === 'loop' && !reduced) Q.th += Q.dir * 1.25 / PATROL_R * dt;
      if ((Q.mode === 'go' || Q.mode === 'return') && reduced) Q.s = Q.L;
      Q.order.forEach((k, j) => {
        const m = Q.men[k], marching = Q.mode !== 'loop';
        const g = marching ? pathAt(Q.path, Q.s - j * GAP) : ringPos(Q, j);
        const d = walk(m, g[0], g[1], marching ? 2.4 : 1.6, dt);
        far = Math.max(far, d); if (j === 0) lag = d; else lag = Math.max(lag, d - 1);
        if (!m.moving && Q.mode === 'guard' && Q.F) { const [hx, hz] = farmToWorld(Q.F.S, 0, HOMEZ); m.yaw = Math.atan2(hx - m.x, hz - m.z); }
        const g0 = m.P.g; g0.position.set(m.x, heightAt(m.x, m.z), m.z); g0.rotation.y = m.yaw;
        const sw = m.moving ? Math.sin(m.ph) * .55 : 0; m.P.legL.rotation.x = sw; m.P.legR.rotation.x = -sw; m.P.body.position.y = m.moving ? Math.abs(Math.cos(m.ph)) * .04 : 0;
      });
      // the carrot moves on while the file keeps up
      if ((Q.mode === 'go' || Q.mode === 'return') && Q.s < Q.L && lag < .6) Q.s = Math.min(Q.L, Q.s + 2.2 * dt);
      if (Q.mode === 'go' && Q.s >= Q.L && far < .1) Q.mode = 'guard';
      if (Q.mode === 'return' && Q.s >= Q.L && far < .3) Q.mode = 'loop';
    }
    for (const C of crawlers) {
      if (!reduced) { C.th += C.dir * .8 / WALKER_R * dt; C.ph += dt * 2.2; }
      const x = Math.cos(C.th) * WALKER_R, z = Math.sin(C.th) * WALKER_R;
      C.P.g.position.set(x, heightAt(x, z), z); C.P.g.rotation.y = Math.atan2(-Math.sin(C.th) * C.dir, Math.cos(C.th) * C.dir);
      poseCrawler(C.P, 2.6, C.ph, !reduced);
      C.P.eyeM.emissiveIntensity = 1.8 + Math.sin(t * 3 + C.th) * .6;
    }
  }
  const stats = () => ({ squads: squads.length, guarding: squads.filter(Q => Q.mode === 'guard').map(Q => Q.F && Q.F.id), modes: squads.map(Q => Q.mode), crawlers: crawlers.length });
  /** Where every warden stands, for checks: [x, z]. */
  const men = () => squads.flatMap(Q => Q.men.map(m => [m.x, m.z] as P2));
  return { frame, stats, men };
}
