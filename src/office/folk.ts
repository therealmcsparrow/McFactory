import * as THREE from 'three';
import { reduced } from '../common/dom.js';
import type { P2 } from '../common/types.js';
import type { OSAtFolk } from './state.js';
import { addLegs, gait, gaitDip } from './gait.js';
import type { Fade, Folk, FolkKind, FolkPose } from './types.js';

export function makeFolk(OS: OSAtFolk) {
  const { FOLKM, mesh, G, BODY, VC, pose, st, dA } = OS;
  const { scene } = OS.ctx;
  // ── street people: police officers, SWAT, bandits. Purely for show: they walk, stand and wave, nobody checks them against traffic ──
  const folk: Folk[] = [], fades: Fade[] = [];
  function mkFolk(kind: FolkKind, x: number, z: number, rot: number) {
    const g = new THREE.Group(), m = FOLKM[kind], aL = mesh(G.arm, m, true, false), aR = mesh(G.arm, m, true, false); g.rotation.order = 'YXZ';
    aL.position.set(-.29, 1.05, .04); aR.position.set(.29, 1.05, .04); g.add(mesh(G.torso, m, true, false), aL, aR, mesh(G[('kit_' + kind) as `kit_${FolkKind}`], VC, true, false));
    const { lL, lR } = addLegs(g, (geo, mt) => mesh(geo, mt, true, false), BODY[1], G.leg, G.head);
    const f: Folk = { kind, g, aL, aR, lL, lR, ga: 0, x, z, rot, k: reduced ? 1 : 0, kT: 1, path: [], pose: 'stand', then: null, face: null, ph: Math.random() * 6, U: null, sp: 2.4 + Math.random() * .5 };
    g.position.set(x, .04, z); g.rotation.y = rot; g.scale.setScalar(Math.max(.001, f.k)); scene.add(g); folk.push(f); return f;
  }
  const walk = (f: Folk, P: P2[], then?: ((f: Folk) => void) | null, face: number | null = null, pose: FolkPose = 'walk') => { f.path = P.map(p => p.slice() as P2); f.then = then || null; f.face = face; f.pose = pose; };
  const vanish = (f: Folk) => { f.kT = 0; f.path.length = 0; };
  function stepFolk(dt: number, t: number) {
    for (let i = fades.length - 1; i >= 0; i--) { const o = fades[i]; o.k = reduced ? 0 : o.k - dt * 1.5; o.g.scale.setScalar(Math.max(.001, o.k)); if (o.k <= 0) { scene.remove(o.g); fades.splice(i, 1); } }
    for (let i = folk.length - 1; i >= 0; i--) { const f = folk[i];
      f.k = reduced ? f.kT : f.kT > f.k ? Math.min(f.kT, f.k + dt * 3) : Math.max(f.kT, f.k - dt * 3); // stops at kT (faded in it must stay at 1, not drop a step and come back each frame: the whole body pulsed in size)
      if (!f.kT && !f.k) { scene.remove(f.g); folk.splice(i, 1); continue; } // faded out: gone (the scenes wait for this before the cars drive on)
      let mv = 0; // walk at their own speed, 2.4..2.9 m/s (never under the 2.4 the scenes were timed for; with reduced motion: straight to the next point); mv: how far this frame
      if (f.path.length) { const p = f.path[0], dx = p[0] - f.x, dz = p[1] - f.z, d = Math.hypot(dx, dz), st = reduced ? d : f.sp * dt;
        if (d > .01) f.rot = reduced ? Math.atan2(dx, dz) : dA(f.rot, Math.atan2(dx, dz), 12, dt);
        if (d <= st) { mv = d; f.x = p[0]; f.z = p[1]; f.path.shift(); if (!f.path.length) { if (f.pose === 'walk') f.pose = 'stand'; const fn = f.then; f.then = null; if (fn) fn(f); } } else { f.x += dx / d * st; f.z += dz / d * st; mv = st; } }
      else if (f.face != null) f.rot = reduced ? f.face : dA(f.rot, f.face, 8, dt);
      const sw = gait(f, mv, dt); // the legs walk in any pose, the arms swing only in 'walk'
      if (f.pose === 'aim') { f.aL.rotation.set(-1.4, 0, 0); f.aR.rotation.set(-1.4, 0, 0); }                                   // weapon raised
      else if (f.pose === 'up') { f.aL.rotation.set(-2.9, 0, .25); f.aR.rotation.set(-2.9, 0, -.25); }                          // hands up
      else if (f.pose === 'wave') { f.aL.rotation.set(0, 0, 0); f.aR.rotation.set(-2.7, 0, reduced ? .3 : .5 * Math.sin(t * 7)); } // waving traffic on (static with reduced motion)
      else { f.aL.rotation.set(sw, 0, 0); f.aR.rotation.set(-sw, 0, 0); }
      f.g.position.set(f.x, .04 + gaitDip(f), f.z); f.g.rotation.y = f.rot; f.g.scale.setScalar(Math.max(.001, f.k)); }
  }
  return { folk, fades, mkFolk, walk, vanish, stepFolk };
}
