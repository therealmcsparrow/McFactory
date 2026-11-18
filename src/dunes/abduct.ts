// Now and then a saucer drifts in over the town, stops above one of the alien townsfolk and switches on a pale green
// lifting beam: the alien floats up, turning slowly, and is gone; the beam goes out and the saucer shoots off. People
// nearby stop and stare. Scenery: it shows no data, and only aliens are taken. Off with the "Abductions" setting, and
// with reduced motion; the Abduction button starts one now.
import * as THREE from 'three';
import type { SceneCtx } from '../common/types.js';
import { G, mat, own, part } from './models.js';
import type { Held } from './folk.js';

const BEAM = '#a6ffe0', H = 9; // the beam's colour; the saucer's hover height over town
type Phase = 'idle' | 'in' | 'beam' | 'lift' | 'close' | 'out';
interface Folk { grab(ok: (x: number, z: number) => boolean, strict: boolean): Held | null; release(h: Held, gone: boolean): void; stare(x: number, z: number, r: number): void }

function saucer() {
  const g = new THREE.Group(), hull = mat('#b9c0c8', { metalness: .75, roughness: .3 }), dark = mat('#4b525a', { metalness: .6, roughness: .4 });
  g.add(part(G.sph, hull, 2.2, .42, 2.2, 0, 0, 0));
  g.add(part(G.dome, mat('#7fd6c4', { emissive: '#3fae98', emissiveIntensity: .6, metalness: .2, roughness: .1, transparent: true, opacity: .85 }), .95, .75, .95, 0, .22, 0));
  const rim = part(G.ring, dark, 2.12, 2.12, 1.2, 0, 0, 0, false); rim.rotation.x = Math.PI / 2; g.add(rim);
  g.add(part(G.cyl, new THREE.MeshStandardMaterial({ color: BEAM, emissive: BEAM, emissiveIntensity: 2.2 }), .7, .06, .7, 0, -.4, 0, false)); // the beam port
  const lights = Array.from({ length: 10 }, (_, i) => {
    const a = i / 10 * Math.PI * 2, m = own('#ffd27a', { emissive: '#ffb347', emissiveIntensity: 0 });
    g.add(part(G.sph, m, .11, .11, .11, Math.cos(a) * 1.95, -.06, Math.sin(a) * 1.95, false)); return m;
  });
  return { g, lights };
}

export function makeAbduct(ctx: SceneCtx, folk: Folk, on: () => boolean) {
  const { scene, camera, reduced } = ctx;
  const S = saucer();
  // the beam: an open cone hanging from the saucer (scaled to its length), and a glow on the ground
  const beamGeo = new THREE.CylinderGeometry(.55, 1.25, 1, 24, 1, true); beamGeo.translate(0, -.5, 0);
  const beam = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({ color: BEAM, transparent: true, opacity: .26, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  const pool = new THREE.Mesh(new THREE.CircleGeometry(1.35, 28), new THREE.MeshBasicMaterial({ color: BEAM, transparent: true, opacity: .4, blending: THREE.AdditiveBlending, depthWrite: false }));
  pool.rotation.x = -Math.PI / 2;
  const light = new THREE.PointLight(BEAM, 0, 12, 1.6); scene.add(light); // always in the scene, so switching it on never recompiles shaders
  let phase: Phase = 'idle', pt = 0, wait = 40 + Math.random() * 60, held: Held | null = null, tx = 0, tz = 0;
  const from = new THREE.Vector3(), dir = new THREE.Vector3(), v = new THREE.Vector3();
  const ease = (k: number) => k * k * (3 - 2 * k);
  const inView = (x: number, z: number) => { v.set(x, 1, z).project(camera); return Math.abs(v.x) < .75 && Math.abs(v.y) < .75; };

  function start(force: boolean): boolean {
    held = folk.grab(inView, !force); if (!held) return false;
    tx = held.x; tz = held.z;
    if (force) ctx.flyTo(new THREE.Vector3(tx, H / 2, tz), { zoom: 1.3 }); // close enough to see, with the saucer and the ground both in frame
    const a = Math.random() * Math.PI * 2; dir.set(Math.cos(a), 0, Math.sin(a));
    from.set(tx - dir.x * 90, 42, tz - dir.z * 90);
    S.g.position.copy(from); scene.add(S.g); phase = 'in'; pt = 0; return true;
  }
  function frame(dt: number, t: number) {
    if (phase === 'idle') { if (reduced) return; wait -= dt; if (wait <= 0) { if (!(on() && start(false))) wait = 10; } return; }
    pt += dt;
    const P = S.g.position;
    if (phase === 'in') {
      const k = ease(Math.min(1, pt / 6)); P.lerpVectors(from, v.set(tx, H, tz), k); S.g.rotation.z = (1 - k) * .18;
      if (pt >= 6) { phase = 'beam'; pt = 0; scene.add(beam, pool); folk.stare(tx, tz, 7); }
    } else if (phase === 'beam' || phase === 'lift' || phase === 'close') {
      P.set(tx, H + Math.sin(t * 1.7) * .12, tz); S.g.rotation.z = 0;
      const grow = phase === 'beam' ? Math.min(1, pt / 1.1) : phase === 'close' ? Math.max(0, 1 - pt / .8) : 1;
      beam.position.set(tx, P.y - .42, tz); beam.scale.set(Math.max(.05, grow), (P.y - .42 - .13) * Math.max(.02, grow), Math.max(.05, grow));
      pool.position.set(tx, .15, tz); pool.scale.setScalar(Math.max(.01, grow)); light.position.set(tx, 2.5, tz); light.intensity = 9 * grow;
      if (phase === 'beam' && pt >= 1.4) { phase = 'lift'; pt = 0; }
      else if (phase === 'lift' && held) {
        const k = Math.min(1, pt / 4.2), y = .13 + (H - .9 - .13) * ease(k), g = held.F.g;
        g.position.set(tx, y, tz); g.rotation.y += dt * 1.6; g.rotation.z = Math.sin(pt * 2.3) * .12; g.scale.setScalar(k > .8 ? 1 - (k - .8) / .2 * .7 : 1);
        held.F.legL.rotation.x = Math.sin(pt * 3) * .3; held.F.legR.rotation.x = -Math.sin(pt * 3) * .3;
        if (k >= 1) { folk.release(held, true); held = null; phase = 'close'; pt = 0; }
      } else if (phase === 'close' && pt >= .8) { scene.remove(beam, pool); light.intensity = 0; phase = 'out'; pt = 0; }
    } else if (phase === 'out') {
      const k = pt / 3.5; P.set(tx + dir.x * 100 * k * k, H + 40 * k * k + Math.sin(t * 1.7) * .12, tz + dir.z * 100 * k * k); S.g.rotation.z = -.2 * Math.min(1, k * 3);
      if (pt >= 3.5) { scene.remove(S.g); phase = 'idle'; wait = 90 + Math.random() * 120; }
    }
    S.g.rotation.y += dt * .8;
    const lit = Math.floor(t * 8) % 10; S.lights.forEach((m, i) => { m.emissiveIntensity = i === lit ? 4 : .6; }); // a running light round the rim
  }
  /** Start one now (the HUD button): an alien in view if there is one, or else any, flying the camera there. */
  const force = () => !reduced && phase === 'idle' && start(true);
  const stats = () => ({ abduct: phase, wait: Math.round(wait) });
  return { frame, force, stats };
}
