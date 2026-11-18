// Now and then two robed blade fighters meet on open sand in a gap between the inner farms, in view: they walk in, light
// their energy blades (amber against cyan), circle and trade blows with sparks and flashes, until one is disarmed and
// kneels. They bow to each other and walk off in opposite directions. Scenery: it shows no data. The Duel button in the
// HUD starts one at once and flies the camera there. Off with the "Blade duels" setting, and with reduced motion.
import * as THREE from 'three';
import type { SceneCtx } from '../common/types.js';
import { G, mat, part } from './models.js';
import { heightAt, DUEL_SPOTS } from './terrain.js';

const AMBER = '#ffb347', CYAN = '#5ff2ff';
interface Fighter { g: THREE.Group; body: THREE.Group; arm: THREE.Group; beam: THREE.Group; legL: THREE.Object3D; legR: THREE.Object3D; x: number; z: number; yaw: number; ph: number; fade: number }

function fighter(robe: string, hood: string, blade: string): Fighter {
  const g = new THREE.Group(), body = new THREE.Group(); g.add(body);
  const robeM = mat(robe, { roughness: .95 }), dark = mat('#2f2823', { roughness: .9 }), metal = mat('#9aa0a6', { metalness: .7, roughness: .3 });
  const leg = (x: number) => { const l = new THREE.Group(); l.position.set(x, .5, 0); l.add(part(G.box, dark, .12, .5, .14, 0, -.25, 0)); return l; };
  const legL = leg(-.1), legR = leg(.1); g.add(legL, legR);
  body.add(part(G.cone, robeM, .36, 1.15, .36, 0, .78, 0));
  body.add(part(G.cyl, dark, .2, .07, .2, 0, 1.0, 0, false)); // belt
  body.add(part(G.cyl, robeM, .18, .3, .16, 0, 1.2, 0)); // shoulders
  body.add(part(G.sph, mat('#c99b76'), .12, .13, .12, 0, 1.43, .02));
  body.add(part(G.sph, mat(hood, { roughness: .95 }), .16, .17, .17, 0, 1.46, -.04)); // hood
  body.add(part(G.box, robeM, .09, .42, .1, -.22, 1.0, 0)); // the free arm, hanging
  const arm = new THREE.Group(); arm.position.set(.21, 1.24, .02); body.add(arm);
  arm.add(part(G.box, robeM, .1, .46, .1, 0, -.22, 0)); arm.add(part(G.sph, mat('#c99b76'), .05, .05, .05, 0, -.46, 0, false));
  const hilt = new THREE.Group(); hilt.position.y = -.47; hilt.rotation.x = 1.69; arm.add(hilt);
  hilt.add(part(G.cyl8, metal, .03, .24, .03, 0, 0, 0, false));
  const beam = new THREE.Group(); beam.position.y = .12; beam.scale.y = .001; hilt.add(beam);
  beam.add(part(G.cyl8, new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: blade, emissiveIntensity: 4.5 }), .022, 1.1, .022, 0, .55, 0, false));
  beam.add(part(G.cyl8, new THREE.MeshBasicMaterial({ color: blade, transparent: true, opacity: .4, blending: THREE.AdditiveBlending, depthWrite: false }), .065, 1.14, .065, 0, .55, 0, false));
  return { g, body, arm, beam, legL, legR, x: 0, z: 0, yaw: 0, ph: 0, fade: 0 };
}

type Phase = 'idle' | 'walk' | 'ignite' | 'fight' | 'yield' | 'bow' | 'leave';

export function makeDuel(ctx: SceneCtx, on: () => boolean) {
  const { scene, camera, reduced } = ctx;
  const A = fighter('#d9c9a8', '#bfae8c', AMBER), B = fighter('#3a302b', '#2a221e', CYAN), both = [A, B];
  const light = new THREE.PointLight('#ffffff', 0, 10, 1.6); scene.add(light); // always in the scene, so adding it never recompiles shaders
  const sparkM = new THREE.MeshStandardMaterial({ color: '#fff4cc', emissive: '#fff0b0', emissiveIntensity: 5 });
  const sparks = Array.from({ length: 36 }, () => { const m = part(G.sph, sparkM, .04, .04, .04, 0, 0, 0, false); m.visible = false; scene.add(m); return { m, v: new THREE.Vector3(), life: 0 }; });
  let phase: Phase = 'idle', pt = 0, wait = 15 + Math.random() * 15, cx = 0, cz = 0, ax = 1, az = 0, psi = 0, spin = 1, loser = A;
  let swing = -1, attacker = A, nextSwing = 0, flash = 0;
  const v = new THREE.Vector3(), cA = new THREE.Color(AMBER), cB = new THREE.Color(CYAN);

  function burst(x: number, y: number, z: number, n: number) {
    let k = 0;
    for (const s of sparks) if (s.life <= 0 && k < n) { k++; s.life = .3 + Math.random() * .35; s.m.position.set(x, y, z); s.v.set(Math.random() - .5, Math.random() * .9 + .2, Math.random() - .5).multiplyScalar(5); s.m.visible = true; }
    flash = 1;
  }
  const seen = () => DUEL_SPOTS.filter(([x, z]) => { v.set(x, heightAt(x, z) + 1, z).project(camera); return Math.abs(v.x) < .8 && Math.abs(v.y) < .8; });
  function start(at?: [number, number]): boolean {
    const s = at ? [at] : seen();
    if (!s.length) return false;
    [cx, cz] = s[Math.floor(Math.random() * s.length)];
    const r = Math.hypot(cx, cz), radial = Math.random() < .5; ax = radial ? cx / r : -cz / r; az = radial ? cz / r : cx / r; // walk in along or across the gap
    A.x = cx - ax * 9; A.z = cz - az * 9; B.x = cx + ax * 9; B.z = cz + az * 9; psi = Math.atan2(-az, -ax); spin = Math.random() < .5 ? 1 : -1;
    for (const F of both) { F.fade = 0; F.beam.scale.y = .001; F.body.position.y = 0; F.body.rotation.x = 0; F.arm.rotation.set(-.9, 0, 0); scene.add(F.g); }
    loser = Math.random() < .5 ? A : B; phase = 'walk'; pt = 0; return true;
  }
  function stop() { for (const F of both) scene.remove(F.g); light.intensity = 0; phase = 'idle'; wait = 45 + Math.random() * 75; }

  /** Walk toward (gx, gz); true when there. */
  function step(F: Fighter, gx: number, gz: number, speed: number, dt: number): boolean {
    const dx = gx - F.x, dz = gz - F.z, d = Math.hypot(dx, dz);
    if (d < .03) return true;
    const s = Math.min(d, speed * dt); F.x += dx / d * s; F.z += dz / d * s; if (d > .3) F.yaw = Math.atan2(dx, dz); F.ph += dt * 9 * Math.min(1, speed / 1.5);
    return false;
  }
  function frame(dt: number, t: number) {
    for (const s of sparks) if (s.life > 0) { s.life -= dt; s.v.y -= 9 * dt; s.m.position.addScaledVector(s.v, dt); if (s.life <= 0) s.m.visible = false; }
    flash = Math.max(0, flash - dt * 6);
    if (phase === 'idle') { if (reduced) return; wait -= dt; if (wait <= 0) { if (on() && start()) return; wait = 8; } return; }
    if (reduced) { stop(); return; }
    pt += dt;
    const face = (F: Fighter, O: Fighter) => { F.yaw = Math.atan2(O.x - F.x, O.z - F.z); };
    const moving = [false, false];
    if (phase === 'walk') {
      const dA = step(A, cx - ax * 1.6, cz - az * 1.6, 1.5, dt), dB = step(B, cx + ax * 1.6, cz + az * 1.6, 1.5, dt);
      moving[0] = !dA; moving[1] = !dB;
      if (dA && dB) { face(A, B); face(B, A); phase = 'ignite'; pt = 0; }
    } else if (phase === 'ignite') {
      const k = Math.min(1, pt / .45); A.beam.scale.y = k; B.beam.scale.y = Math.min(1, Math.max(.001, (pt - .35) / .45));
      if (pt > 1.4) { phase = 'fight'; pt = 0; nextSwing = .4; }
    } else if (phase === 'fight') {
      // circle each other, trading blows; lunge in on a strike
      psi += spin * dt * (.45 + .35 * Math.sin(t * .8)); if (Math.random() < dt * .25) spin = -spin;
      const lunge = swing >= 0 ? Math.sin(Math.min(1, swing) * Math.PI) : 0, half = .8 - .22 * lunge;
      const ox = Math.cos(psi) * half, oz = Math.sin(psi) * half;
      moving[0] = !step(A, cx + ox, cz + oz, 3, dt); moving[1] = !step(B, cx - ox, cz - oz, 3, dt); face(A, B); face(B, A);
      nextSwing -= dt;
      if (swing < 0 && nextSwing <= 0) { swing = 0; attacker = Math.random() < .5 ? A : B; attacker.arm.userData.side = (Math.random() - .5) * .9; }
      for (const F of both) {
        let th = -.9 + Math.sin(t * 3 + (F === A ? 0 : 2)) * .08, rz = 0;
        if (swing >= 0) {
          const p = Math.min(1, swing);
          if (F === attacker) { th = p < .45 ? -.9 - p / .45 * .95 : -1.85 + (p - .45) / .55 * 1.5; rz = F.arm.userData.side; }
          else { th = -1.45; rz = -attacker.arm.userData.side * .8; }
        }
        F.arm.rotation.x += (th - F.arm.rotation.x) * Math.min(1, dt * 22); F.arm.rotation.z += (rz - F.arm.rotation.z) * Math.min(1, dt * 18);
      }
      if (swing >= 0) {
        const before = swing; swing += dt / .42;
        if (before < .72 && swing >= .72) { burst((A.x + B.x) / 2, heightAt(cx, cz) + 1.55, (A.z + B.z) / 2, 7); }
        if (swing >= 1) { swing = -1; nextSwing = .25 + Math.random() * .55; }
      }
      if (pt > 14 && swing < 0) { phase = 'yield'; pt = 0; burst(loser.x, heightAt(cx, cz) + 1.2, loser.z, 14); }
    } else if (phase === 'yield') {
      // the loser's blade goes out and they sink to one knee; the winner holds, then puts the blade away
      const W = loser === A ? B : A;
      loser.beam.scale.y = Math.max(.001, loser.beam.scale.y - dt * 4); loser.body.position.y = Math.max(-.28, loser.body.position.y - dt * .9);
      loser.arm.rotation.x += (-.2 - loser.arm.rotation.x) * Math.min(1, dt * 6); W.arm.rotation.x += (-1.1 - W.arm.rotation.x) * Math.min(1, dt * 6);
      if (pt > 1.6) W.beam.scale.y = Math.max(.001, W.beam.scale.y - dt * 2.5);
      if (pt > 2.6) { phase = 'bow'; pt = 0; }
    } else if (phase === 'bow') {
      loser.body.position.y = Math.min(0, loser.body.position.y + dt * .9);
      const b = Math.sin(Math.min(1, pt / 1.8) * Math.PI) * .45; for (const F of both) F.body.rotation.x = b;
      if (pt > 2) { phase = 'leave'; pt = 0; }
    } else if (phase === 'leave') {
      moving[0] = !step(A, cx - ax * 11, cz - az * 11, 1.4, dt); moving[1] = !step(B, cx + ax * 11, cz + az * 11, 1.4, dt);
      if (pt > 3.5) for (const F of both) F.fade = Math.max(0, F.fade - dt * .8);
      if (pt > 3.5 && A.fade <= 0) { stop(); return; }
    }
    if (phase !== 'leave') for (const F of both) F.fade = Math.min(1, F.fade + dt * 1.2);
    both.forEach((F, i) => {
      F.g.position.set(F.x, heightAt(F.x, F.z), F.z); F.g.rotation.y = F.yaw; F.g.scale.setScalar(Math.max(.001, F.fade));
      const sw = moving[i] ? Math.sin(F.ph) * .5 : 0; F.legL.rotation.x = sw; F.legR.rotation.x = -sw;
    });
    // the blades light the sand; every clash flashes white
    const lit = Math.max(A.beam.scale.y, B.beam.scale.y);
    light.position.set(cx, heightAt(cx, cz) + 1.8, cz); light.color.copy(cA).lerp(cB, .5).lerp(new THREE.Color('#ffffff'), flash);
    light.intensity = lit > .01 ? 6 * lit + 30 * flash : 0;
  }
  const stats = () => ({ duel: phase, at: phase === 'idle' ? null : [Math.round(cx), Math.round(cz)], wait: Math.round(wait) });
  /** Start one now (for checks); false when no duel ground is in view. */
  const now = () => phase === 'idle' && start();
  /** Start one now (the HUD button): on duel ground in view, or else on the ground nearest the view, flying the camera there. */
  function force(): boolean {
    if (reduced || phase !== 'idle') return false;
    // the gap nearest the view centre, and fly in close: from the overview the fighters are a few pixels tall
    const t = ctx.controls.target; let best = DUEL_SPOTS[0];
    for (const p of DUEL_SPOTS) if (Math.hypot(p[0] - t.x, p[1] - t.z) < Math.hypot(best[0] - t.x, best[1] - t.z)) best = p;
    ctx.flyTo(new THREE.Vector3(best[0], heightAt(best[0], best[1]), best[1]), { zoom: Math.max(camera.zoom, 2.4) });
    return start(best);
  }
  return { frame, stats, now, force };
}
