import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { FSAtSculptures } from './state.js';
import type { Sculpture } from './types.js';

export function makeSculptures(FS: FSAtSculptures) {
  const { scene, mat, NET, reduced } = FS;
  // ── decor: one playful low-poly sculpture per roundabout island, placed on the CURRENT NET.rbs list (rebuilt when it changes).
  //    Shared materials, a few merged meshes each, only the main body casts a shadow; stays inside the grass disc (r < .6). Reduced motion: still.
  const sculG = new THREE.Group(); sculG.name = 'sculptures'; scene.add(sculG); let sculKey: string | null = null, sculT = 0, sculs: Sculpture[] = [];
  const SM = { duck: mat('#c99a1c', { roughness: .55, envMapIntensity: .5 }), hat: mat('#ff8a1f', { roughness: .5 }), beak: mat('#e0562a'), dark: mat('#1c1e22', { roughness: .5 }),
    steel: mat('#8b939b', { metalness: .6, roughness: .35 }), blue: mat('#3987e5', { roughness: .45 }), wood: mat('#a0703f', { roughness: .8 }), wood2: mat('#6e4a29', { roughness: .85 }),
    gold: mat('#e0b032', { metalness: .85, roughness: .28 }), red: mat('#d8604b'), cat: mat('#9a8f84', { roughness: .9 }), cone: mat('#ff7a1a', { roughness: .55 }), white: mat('#e8e6e1', { roughness: .6 }),
    eye: new THREE.MeshBasicMaterial({ color: new THREE.Color(.4, 1.6, 1.8), toneMapped: false }) };
  function buildSculptures() {
    sculG.traverse(o => { if ((o as THREE.Mesh).geometry) (o as THREE.Mesh).geometry.dispose(); }); sculG.clear(); sculs = [];
    const sp = (r: number, w = 10, h = 7) => new THREE.SphereGeometry(r, w, h), bx = (x: number, y: number, z: number) => new THREE.BoxGeometry(x, y, z), cy = (a: number, b: number, h: number, k = 10) => new THREE.CylinderGeometry(a, b, h, k);
    const M = (gs: THREE.BufferGeometry[], m: THREE.Material, sh?: boolean) => { const me = new THREE.Mesh(gs.length > 1 ? mergeGeometries(gs) : gs[0], m); me.castShadow = !!sh; return me; };
    const G = (...c: THREE.Object3D[]) => { const q = new THREE.Group(); if (c.length) q.add(...c); return q; };
    const crate = (s: number, x = 0, y = 0, z = 0) => [bx(s, s, s).translate(x, y, z)], slats = (s: number, x = 0, y = 0, z = 0) => [bx(s * 1.02, s * .18, s * 1.02).translate(x, y + s * .3, z), bx(s * 1.02, s * .18, s * 1.02).translate(x, y - s * .3, z)];
    const D: (() => Sculpture)[] = [
      () => { // rubber duck in a hard hat
        const a = G(M([sp(.28, 10, 6).scale(1.3, .78, 1).translate(0, .22, 0), sp(.16, 8, 6).translate(.2, .5, 0), new THREE.ConeGeometry(.08, .2, 6).rotateZ(Math.PI / 3).translate(-.36, .34, 0)], SM.duck, true),
          M([new THREE.ConeGeometry(.065, .16, 6).rotateZ(-Math.PI / 2).translate(.39, .47, 0)], SM.beak), M([sp(.025, 6, 4).translate(.32, .54, .09), sp(.025, 6, 4).translate(.32, .54, -.09)], SM.dark),
          M([new THREE.SphereGeometry(.15, 8, 3, 0, 2 * Math.PI, 0, Math.PI / 2).translate(.2, .6, 0), cy(.2, .2, .025, 10).translate(.24, .6, 0), bx(.03, .04, .2).translate(.2, .74, 0)], SM.hat));
        return { g: G(a), tick: t => { a.position.y = Math.sin(t * 1.6) * .03; a.rotation.z = Math.sin(t * 1.6 + 1) * .07; a.rotation.x = Math.sin(t * 1.1) * .04; } }; },
      () => { // robot doing a handstand, kicking its legs
        const legs = [-1, 1].map(s => { const p = G(M([bx(.08, .28, .08).translate(0, .14, 0), bx(.11, .06, .14).translate(0, .3, .02)], SM.steel)); p.position.set(s * .08, .66, 0); return p; });
        const a = G(M([bx(.06, .3, .06).translate(-.17, .15, 0), bx(.06, .3, .06).translate(.17, .15, 0), bx(.12, .03, .1).translate(-.17, .015, 0), bx(.12, .03, .1).translate(.17, .015, 0)], SM.steel),
          M([bx(.2, .17, .18).translate(0, .14, 0)], SM.dark), M([bx(.04, .03, .02).translate(-.05, .11, .09), bx(.04, .03, .02).translate(.05, .11, .09)], SM.eye),
          M([bx(.34, .32, .2).translate(0, .46, 0)], SM.blue, true), ...legs);
        return { g: G(a), tick: t => { a.rotation.z = Math.sin(t * 1.3) * .05; legs[0].rotation.z = .35 + Math.sin(t * 2.2) * .3; legs[1].rotation.z = -.35 - Math.sin(t * 2.2) * .3; } }; },
      () => { // crates balancing on one corner
        const s1 = .26, h1 = s1 * Math.sqrt(3) / 2, s2 = .18, h2 = s2 * Math.sqrt(3) / 2, tip = new THREE.Euler(-Math.atan(1 / Math.SQRT2), 0, Math.PI / 4, 'XYZ');
        const c1 = G(M([...crate(s1), ...[]], SM.wood, true), M(slats(s1), SM.wood2)); c1.children.forEach(m => { m.rotation.copy(tip); m.position.y = h1; });
        const c2 = G(M(crate(s2), SM.wood), M(slats(s2), SM.wood2)); c2.children.forEach(m => { m.rotation.copy(tip); m.position.y = h2; }); c2.position.y = 2 * h1;
        const ball = M([sp(.06, 8, 6).translate(0, .06, 0)], SM.red); ball.position.y = 2 * h2; c2.add(ball);
        c1.add(c2); return { g: G(c1), tick: t => { c1.rotation.z = Math.sin(t * .9) * .05; c1.rotation.x = Math.sin(t * .7) * .04; c2.rotation.z = -Math.sin(t * 1.3) * .1; ball.rotation.z = Math.sin(t * 2) * .2; ball.position.x = Math.sin(t * 1.3) * .01; } }; },
      () => { // spinning token coin on a plinth
        const coin = G(M([cy(.24, .24, .05, 20).rotateX(Math.PI / 2), bx(.2, .05, .08).translate(0, .08, 0), bx(.05, .2, .08).translate(0, -.02, 0)], SM.gold)); coin.position.y = .46;
        return { g: G(M([cy(.16, .22, .12, 8).translate(0, .06, 0), cy(.03, .03, .1, 6).translate(0, .17, 0)], SM.dark, true), coin), tick: (t, dt) => { coin.rotation.y += dt * 1.6; coin.position.y = .46 + Math.sin(t * 1.8) * .03; } }; },
      () => { // wobbly spring-neck robot head
        const spring = G(M([0, 1, 2, 3, 4, 5].map(k => new THREE.TorusGeometry(.07, .016, 3, 8).rotateX(Math.PI / 2).translate(0, k * .045, 0)), SM.steel)); spring.position.y = .14;
        const head = G(M([bx(.32, .22, .26)], SM.red, true), M([bx(.06, .05, .02).translate(-.07, .02, .13), bx(.06, .05, .02).translate(.07, .02, .13), sp(.035, 6, 4).translate(0, .21, 0)], SM.eye),
          M([cy(.012, .012, .1, 4).translate(0, .14, 0), bx(.04, .1, .1).translate(-.18, 0, 0), bx(.04, .1, .1).translate(.18, 0, 0)], SM.steel));
        return { g: G(M([cy(.18, .2, .12, 8).translate(0, .06, 0)], SM.dark, true), spring, head), tick: t => { const b = Math.sin(t * 3.1), k = 1 + .22 * b; spring.scale.y = k; head.position.y = .14 + .225 * k + .12; head.rotation.z = Math.sin(t * 2.3) * .22; head.rotation.x = Math.sin(t * 1.7) * .1; } }; },
      () => { // cat asleep on a crate, breathing
        const cat = G(M([sp(.15, 10, 7).scale(1.45, .65, 1).translate(0, .09, 0), sp(.09, 8, 6).translate(.17, .1, .06), new THREE.TorusGeometry(.16, .028, 4, 10, Math.PI * 1.1).rotateX(Math.PI / 2).translate(0, .04, 0),
          new THREE.ConeGeometry(.03, .06, 4).translate(.2, .19, .02), new THREE.ConeGeometry(.03, .06, 4).translate(.15, .19, .12)], SM.cat, true)); cat.position.y = .26;
        return { g: G(M([bx(.46, .26, .34).translate(0, .13, 0)], SM.wood, true), M([bx(.47, .04, .35).translate(0, .21, 0), bx(.47, .04, .35).translate(0, .05, 0)], SM.wood2), cat),
          tick: t => { const b = (Math.sin(t * 1.3) + 1) / 2; cat.scale.set(1, 1 + b * .1, 1 + b * .04); } }; },
      () => { // the giant wrench in the stone
        const w = G(M([bx(.06, .5, .03).translate(0, .25, 0), cy(.1, .1, .04, 6).rotateX(Math.PI / 2).translate(0, .52, 0)], SM.steel), M([bx(.08, .06, .06).translate(0, .6, 0)], SM.dark)); w.position.y = .16; w.rotation.z = .18;
        return { g: G(M([new THREE.DodecahedronGeometry(.22).scale(1.3, .75, 1.1).translate(0, .12, 0)], SM.dark, true), w), tick: t => { w.rotation.z = .18 + Math.sin(t * 7) * Math.max(0, Math.sin(t * .8)) * .05; } }; },
      () => { // traffic-cone tower with a robot face, swaying
        const a = G(M([0, 1, 2].map(k => new THREE.ConeGeometry(.18 - k * .03, .3, 8).translate(0, .15 + k * .17, 0)), SM.cone, true), M([0, 1, 2].map(k => cy(.13 - k * .03, .14 - k * .03, .05, 8).translate(0, .14 + k * .17, 0)), SM.white),
          M([sp(.03, 6, 4).translate(-.05, .2, .12), sp(.03, 6, 4).translate(.05, .2, .12)], SM.eye));
        return { g: G(a), tick: t => { a.rotation.z = Math.sin(t * 1.4) * .07; a.rotation.x = Math.cos(t * 1.1) * .05; } }; } ];
    const list = [...(NET.rbs || [])].sort((p, q) => p.x - q.x || p.z - q.z);
    list.forEach((n, i) => { const s = D[i % D.length](); s.g.position.set(n.x, .16, n.z); s.g.rotation.y = Math.atan2(n.z, -n.x) + (i % 3 - 1) * .5; s.g.scale.setScalar(1.1); sculG.add(s.g); sculs.push(s); });
    if (reduced) for (const s of sculs) s.tick(1, 0); // reduced motion: one still pose
  }
  function tickSculptures(dt: number) {
    const key = (NET.rbs || []).map(n => n.id).join('|'); if (key !== sculKey) { sculKey = key; buildSculptures(); }
    if (reduced) return; sculT += dt; for (const s of sculs) s.tick(sculT, dt);
  }
  return { tickSculptures };
}
