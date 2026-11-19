import * as THREE from 'three';
import { reduced } from '../common/dom.js';
import type { OSAtRobbery } from './state.js';
import type { P2 } from '../common/types.js';
import type { ArmouredCar, NetEdge, PoliceUnit, RobSpot, RobState } from './types.js';
import { gibberish, grawlix } from './gibberish.js';

export function makeRobbery(OS: OSAtRobbery) {
  const { FONT, expo, AMBER, POX, PLZ, trucks, spawnQ, vehs, nearS, route, routeTo, V, veh, mesh, G, VC, mkLeg, SH, fades, dropVeh, laneFree, adiff, atL, q1, vanish, walk, fun, pol, at, mkFolk, unitOut, folk, stns, cops } = OS;
  // ── armoured car robbery (setting 'robbery', never with reduced motion): a van cuts in, bandits stop a loaded armoured car on the shoulder,
  // two patrol cars and the SWAT van come, SWAT aims, the bandits give up and are taken away, the armoured car drives on with its load ──
  const EXCL = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d')!; x.fillStyle = '#d9962f'; x.beginPath(); x.arc(32, 32, 29, 0, 7); x.fill();
    x.fillStyle = '#10141b'; x.font = `900 46px ${FONT}`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('!', 32, 35); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return new THREE.SpriteMaterial({ map: t, depthWrite: false }); })();
  // the alarm on the roof of the police station whose units answer (it moves to that station's roof): a light bar, dark until an armoured car
  // has been pulled over, then flashing blue and red until the scene clears
  const SIR = (() => { const g = new THREE.Group(), dk = new THREE.MeshLambertMaterial({ color: '#2b3038' }), mb = new THREE.MeshBasicMaterial({ color: '#16233d' }), mr = new THREE.MeshBasicMaterial({ color: '#3a1518' });
    const cv = document.createElement('canvas'); cv.width = cv.height = 64; const x = cv.getContext('2d')!, gr0 = x.createRadialGradient(32, 32, 0, 32, 32, 32); gr0.addColorStop(0, 'rgba(255,255,255,1)'); gr0.addColorStop(.35, 'rgba(255,255,255,.45)'); gr0.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = gr0; x.fillRect(0, 0, 64, 64);
    const gt = new THREE.CanvasTexture(cv), glow = (c: string) => new THREE.Sprite(new THREE.SpriteMaterial({ map: gt, color: c, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    const base = new THREE.Mesh(new THREE.BoxGeometry(2.4, .14, .5), dk), lb = new THREE.Mesh(new THREE.BoxGeometry(1, .3, .42), mb), lr = new THREE.Mesh(new THREE.BoxGeometry(1, .3, .42), mr), gb = glow('#3d8bff'), gr = glow('#ff3b3b');
    base.position.y = .07; lb.position.set(-.6, .29, 0); lr.position.set(.6, .29, 0); gb.position.set(-.6, .45, 0); gr.position.set(.6, .45, 0); gb.scale.setScalar(2.6); gr.scale.setScalar(2.6);
    g.add(base, lb, lr, gb, gr); g.position.set(POX + 12, 3.02, PLZ + 4.5); OS.ctx.scene.add(g); return { g, mb, mr, gb: gb.material, gr: gr.material }; })();
  const robGap = () => 60 + expo(360); // seconds to the next robbery: at least a minute, 7 minutes on average
  const rob: RobState = { ph: 'idle', next: robGap(), pend: false, tk: 0, T: null, L: null, S: null, sT: 0, P: null, ws: null, van: null, st: null, gang: [], crew: [], sent: new Set<number>(), t0: 0, bc: null, ex: null, mA: new THREE.MeshBasicMaterial({ color: AMBER }), n: 0, aborts: 0, load: 0, cops: [], why: '' };
  // where: on any straight street stretch in town, in the outer lane, either heading; half the time (when there is one) on the way a loaded
  // armoured car takes from an office it is at or on its way to (its own route to the bank), else anywhere (an extra armoured car comes by
  // then, robStage). Far from the police station: the police drive over.
  // A spot P is a point in that lane and its heading; scene positions are given as metres along the lane (a) and to its right (lat).
  // A stretch is straight outer lane (no roundabout, no lane change, not the bank's or a police station's own road) of 32 m or more:
  // the spot lies 11 m or more into it (the car must be on the straight 10..22 m before it: it stops in 7 m) and 21 m before its end (the van
  // stops again 5 m past the spot, the second patrol car 14 m past it, on the shoulder)
  const AMIN = 11, AEND = 21;
  const straight = (P: P2[]) => { const [ax, az] = P[0], [bx, bz] = P[P.length - 1], d = Math.hypot(bx - ax, bz - az); return d > 1 && P.every(([x, z]) => Math.abs((x - ax) * (bz - az) - (z - az) * (bx - ax)) / d < .05); };
  const own = (id: string) => /^(bank|pol)/.test(id);
  // A stretch is one or more such edges in a row on the same line (an office's in and out roads cut a street into short edges; the street
  // runs on straight past them, so the spot can be anywhere along it, by a building or between two)
  const okE = (u: string, e: NetEdge) => e.ln === 1 && !e.lc && !e.t && !e.sc && !own(u) && !own(e.to) && straight(e.pts);
  const hOf = (P: P2[]) => Math.atan2(P[P.length - 1][0] - P[0][0], P[P.length - 1][1] - P[0][1]);
  const goesOn = (a: NetEdge, b: NetEdge) => Math.abs(adiff(hOf(a.pts), hOf(b.pts))) < .02 && Math.hypot(a.pts[a.pts.length - 1][0] - b.pts[0][0], a.pts[a.pts.length - 1][1] - b.pts[0][1]) < .05;
  type Run = [string, NetEdge][];
  function spotOn(C: Run): RobSpot | null { const pts: P2[] = [C[0][1].pts[0]]; let len = 0; for (const [, e] of C) { pts.push(e.pts[e.pts.length - 1]); len += e.len; } if (len < AMIN + AEND || !straight(pts)) return null;
    const [ax, az] = pts[0], h = hOf(pts), a = AMIN + Math.random() * (len - AMIN - AEND);
    const x = ax + Math.sin(h) * a, z = az + Math.cos(h) * a;
    // not beside an office's forecourt: the scene stands on the shoulder (SH), only 1.55 m from the forecourt lane (SVZ), and the armoured cars there would stand stuck against it
    for (let d = -26; d <= 16; d += 2) { const px = x + Math.sin(h) * d, pz = z + Math.cos(h) * d;
      for (const F of OS.bldgs.values()) if (px > F.ox + OS.DOCKX - 4 && px < F.ox + OS.SLIPX + 4 && pz > F.oz + OS.SVZ - 1 && pz < F.oz + OS.STZ) return null; }
    return { r: 0, h, x, z, u: C[0][0], v: C[C.length - 1][1].to, pts }; }
  // the stretches in a row of edges (a route): the longest runs of usable edges that go on in a line
  const runsOf = (es: Run) => { const out: Run[] = []; let cur: Run = []; for (const ue of es) { if (!okE(...ue)) { if (cur.length) out.push(cur); cur = []; continue; }
    if (cur.length && !goesOn(cur[cur.length - 1][1], ue[1])) { out.push(cur); cur = []; } cur.push(ue); } if (cur.length) out.push(cur); return out; };
  // every stretch in town: from each usable edge no usable edge leads into in a line, on along the edges that go on from it
  function allRuns() { const into = new Set<NetEdge>(), N = OS.net.N, runs: Run[] = [];
    for (const [u, n] of N) for (const e of n.e) if (okE(u, e)) for (const f of N.get(e.to)?.e ?? []) if (okE(e.to, f) && goesOn(e, f)) into.add(f);
    for (const [u, n] of N) for (const e of n.e) { if (!okE(u, e) || into.has(e)) continue; const C: Run = [[u, e]], seen = new Set([e]);
      for (;;) { const [, l] = C[C.length - 1], nx = (N.get(l.to)?.e ?? []).find(f => okE(l.to, f) && goesOn(l, f) && !seen.has(f)); if (!nx) break; seen.add(nx); C.push([l.to, nx]); }
      runs.push(C); }
    return runs; }
  let last: RobSpot | null = null;
  const rp = (P: RobSpot, a: number, lat = 0): P2 => [P.x + Math.sin(P.h) * a - Math.cos(P.h) * lat, P.z + Math.cos(P.h) * a + Math.sin(P.h) * lat];
  const alongP = (P: RobSpot, x: number, z: number) => (x - P.x) * Math.sin(P.h) + (z - P.z) * Math.cos(P.h), acrossP = (P: RobSpot, x: number, z: number) => (z - P.z) * Math.sin(P.h) - (x - P.x) * Math.cos(P.h);
  function robPick() { // not the last spot again (30 m off it) when there is a choice
    const busy = new Set(trucks.filter(T => T.F && (T.st === 'out' || T.st === 'load')).map(T => T.F!.id)), onWay: RobSpot[] = [], all: RobSpot[] = [];
    for (const id of busy) { const R = route(id + ':out', 'bank:in', 'truck'); for (const C of runsOf((R?.es ?? []) as Run)) { const P = spotOn(C); if (P) onWay.push(P); } }
    for (const C of allRuns()) { const P = spotOn(C); if (P) all.push(P); }
    const fresh = (c: RobSpot[]) => c.filter(P => !last || Math.hypot(P.x - last.x, P.z - last.z) > 30), any = (c: RobSpot[]) => c[Math.floor(Math.random() * c.length)];
    const pool = [onWay, all].map(c => fresh(c).length ? fresh(c) : c), pick = pool[0].length && Math.random() < .5 ? any(pool[0]) : pool[1].length ? any(pool[1]) : null;
    if (pick) last = pick; return pick; }
  // a random in road that is clear, with no staff car waiting for it (they come first): its id and node
  const gateFree = () => { const id = OS.gateIn(), g = id && OS.net.N.get(id); return g ? { id: id!, x: g.x, z: g.z } : null; };
  // the bandits' van comes in at a random in road (fading in like the cars), drives by a random place first to look it over (past the bank, or
  // past an office's in road), and on to the shoulder 4 m before the spot, where it waits until a loaded armoured car comes
  // head on (a third of the time, where the street has its other lanes beside this one): it waits on the far shoulder 14 m past the spot,
  // facing the armoured car, and swings across the street into its way
  const HO = 5.7; // the other direction's outer lane: this far left of this one (both 2.85 m off the middle of the street)
  function farLane(P: RobSpot) { const [wx, wz] = rp(P, 14, -HO), s = nearS(wx, wz, P.h + Math.PI); return s && Math.hypot(s.x - wx, s.z - wz) < .5 && Math.abs(adiff(s.h, P.h + Math.PI)) < .05 && !s.e.lc && !s.e.t ? s : null; }
  function robVan(P: RobSpot) { const far = (rob.hoF ?? Math.random() < 1 / 3) ? farLane(P) : null; P.ho = !!far;
    const [wx, wz] = rp(P, -4), s = far || nearS(wx, wz, P.h); if (!s || (!far && Math.hypot(s.x - wx, s.z - wz) > .5)) return false;
    const g = gateFree(); if (!g) return false;
    const via = ['bank:a', ...[...OS.bldgs.values()].map(F => F.id + ':a')].sort(() => Math.random() - .5); let r1: P2[] | null = null, r2: P2[] | null = null;
    for (const m of via) { r1 = route(g.id, m); r2 = r1 && routeTo(m, s); if (r2) break; } if (!r1 || !r2) return false;
    const V = rob.van = veh('van', mesh(G.van, VC), g.x, g.z, Math.PI); V.k = 0;
    const L = mkLeg([...r1, ...r2.slice(1)], { fin: true, v: 8, end: () => { V.scene = true; if (rob.ph === 'drive') { rob.ph = 'wait'; rob.t0 = OS.simT; } } }); // waiting on purpose: no jam, no fading out
    L.ev.push({ s: Math.max(0, L.len - 5), fn: () => { V.latT = SH; } }); L.ev.sort((a, b) => a.s - b.s); V.legs.push(L); rob.ws = s; return true; }
  function robGone() { // given up: the van pulls back onto the lane when it is clear behind and leaves the site by the gate
    const V = rob.van, s = rob.ws!, r = V && s && vehs.includes(V) && !V.leg && !V.legs.length && route(s.e.to, OS.gateOut()); rob.van = null; if (!V) return;
    if (!r) { const i = vehs.indexOf(V); if (i >= 0) vehs.splice(i, 1); for (const m of V.ind) m.visible = false; fades.push({ g: V.g, k: 1 }); return; } // (out of traffic: no more blink(), lamps off)
    const L = mkLeg([[s.x, s.z], ...s.e.pts.slice(s.i + 1), ...r.slice(1)], { fout: true, end: () => dropVeh(V) });
    L.ev.push({ s: 0, fx: true, tag: 'vanout', wait: () => V.lat < .3 || laneFree(V, s.x, s.z, s.h) }); V.scene = false; V.latT = 0; V.legs.push(L); }
  // a loaded armoured car 10..22 m before the spot, in the lane and heading along it, its leg running on past the spot, nobody else in the lane up to 15 m past it
  const robOK = (T: ArmouredCar) => { const P = rob.P, V = rob.van; if (!P || !V || !(T.st === 'back' && T.ret && T.load.length > 0 && T.leg && !T.leg.rev && T.v > 2 && !T.ghost && T.k >= 1)) return false;
    const a = alongP(P, T.x, T.z); if (a < -(AMIN + 11) || a > -(AMIN - 1) || Math.abs(acrossP(P, T.x, T.z)) > .3 || Math.abs(adiff(T.rot, P.h)) > .25) return false;
    atL(T.leg, T.s - a, q1); if (Math.hypot(q1.x - P.x, q1.z - P.z) > .3 || T.leg.len < T.s - a + 20) return false;
    // (head on: the far lanes too, from the spot to well past the van, which crosses them)
    return !vehs.some(O => { if (O === T || O === V || O.ghost) return false; const b = alongP(P, O.x, O.z), c = acrossP(P, O.x, O.z); return P.ho ? b > a - 1 && b < 40 && c > -HO - SH - 1.3 && c < SH + 1.3 : b > a - 1 && b < 15 && c > -1.3 && c < SH + 1.3; }); };
  function robStart(T: ArmouredCar) { // the van pulls out in front of it and back onto the shoulder 5 m past the spot; the armoured car pulls over and stops at the spot
    const P = rob.P!, V = rob.van!, sT = T.s - alongP(P, T.x, T.z), L = T.leg!, S = { go: false };
    Object.assign(rob, { ph: 'cut', T, L, S, sT, t0: OS.simT, pend: false, gang: [], crew: [], sent: new Set(), load: T.load.length }); rob.n++; T.scene = true;
    L.ev.push({ s: sT - 6, fn: () => { if (!S.go) T.latT = SH; } }, { s: sT, fx: true, tag: 'robbed', wait: () => { const [x, z] = rp(P, alongP(P, T.x, T.z)); return S.go && (T.lat < .3 || laneFree(T, x, z, P.h)); } }); L.ev.sort((a, b) => a.s - b.s); // pulls over and stops; back onto the lane when released and the lane (not the shoulder) is clear behind
    if (P.ho) { const s = rob.ws!, VL = mkLeg([[s.x, s.z], rp(P, 12, -2.8), rp(P, 9.4, .9), rp(P, 6.3, SH)], { v: 6 }); V.latT = 0; V.legs.push(VL); return; } // head on: across the street, nose to nose with it on its shoulder
    const a0 = alongP(P, V.x, V.z), VL = mkLeg([rp(P, a0), rp(P, 5.2)], { v: 6 }); VL.ev.push({ s: Math.max(0, .6 - a0), fn: () => { V.latT = SH; } }); V.latT = 0; V.legs.push(VL); // out into the lane, then back onto the shoulder
  }
  // no loaded armoured car within 25 s of the van waiting: an extra one (scenery, it carries no drives of yours) comes in at a random in road,
  // drives along the stretch past the spot and leaves the town by a random in road
  function robStage(P: RobSpot) { const g = gateFree(), pts = P.pts ?? OS.net.N.get(P.u)?.e.find(e => e.to === P.v && e.ln === 1 && !e.lc)?.pts, r1 = g && pts && route(g.id, P.u), r3 = r1 && route(P.v, OS.gateOut()); if (!r3 || !g || !pts) return;
    const r2 = [...pts, ...r3.slice(1)]; // (from u: r1 ends there)
    const T = rob.st = veh('truck', mesh(G.truck, VC), g.x, g.z, Math.PI); Object.assign(T, { st: 'back', ret: true, load: [0, 1, 2].map(() => new THREE.Color('#7a808a')), staged: true, k: 0 });
    T.legs.push(mkLeg([...r1, ...r2.slice(1)], { fin: true, fout: true, end: () => { if (rob.st === T) rob.st = null; dropVeh(T); } })); }
  // where a unit stops: the nearest lane sample heading along the street, not on a lane change (the curve from the inner lane meets the outer
  // lane near the next roundabout, and its start node is not on any route, so a unit sent there could not get there)
  function unitSpot(x: number, z: number, h: number) { let b: ReturnType<typeof nearS> = null, bd = Infinity; for (const s of OS.samples()) { if (s.e.lc || Math.abs(adiff(s.h, h)) >= .3) continue; const d = (s.x - x) ** 2 + (s.z - z) ** 2; if (d < bd) { bd = d; b = s; } } return b; }
  function robClear(abort: boolean, why = '') { // van gone, beacon off, armoured car released, everybody back in, the units drive home one after another (why: why it ended early, probe)
    const T = rob.T, P = rob.P, ph0 = rob.ph; rob.ph = 'clear'; rob.t0 = OS.simT; if (abort) { rob.aborts++; rob.why = why || ph0; } hush(); // (only the robbery's own bubbles)
    if (rob.van) { const i = vehs.indexOf(rob.van); if (i >= 0) vehs.splice(i, 1); for (const m of rob.van.ind) m.visible = false; fades.push({ g: rob.van.g, k: 1 }); rob.van = null; } // after the arrest (or at once when it ends early) the van fades away
    if (rob.bc) { rob.bc.removeFromParent(); rob.ex!.removeFromParent(); rob.bc = rob.ex = null; }
    for (const f of rob.gang) vanish(f);
    for (const f of rob.crew) { const A = f.U!.A; walk(f, [P ? rp(P, alongP(P, A.x, A.z) + (f.U!.sw ? -.6 : .2), acrossP(P, A.x, A.z) + 1) : [A.x, A.z]], vanish); }
    for (const [i, d] of [[1, 1], [0, 3], [2, 5]]) { const U = rob.cops[i]; if (U && (U.dir === 'out' || U.dir === 'post')) { U.ret = true; U.retAt = OS.simT + d; } }
    if (T) { T.scene = false; rob.S!.go = true; if (T.leg !== rob.L) { T.lat = 0; T.latT = null; } else if (T.lat || T.latT) T.latT = 0; }
  }
  // ── the shouting (OS.bubbles, gibberish.ts): while they hold the armoured car the bandits shout at its crew, now and then a grawlix; when SWAT is out
  // the officers bark orders; at the arrest a bandit protests and an officer answers. One line every couple of seconds, taking turns, never a flood ──
  let talkPh = '', talkAt = 0, talkN = 0;
  const talkers = new Set<THREE.Object3D>();
  function say(g: THREE.Object3D, text: string, tone: 'cop' | 'driver' | 'neutral') { const B = OS.bubbles; if (!B) return; talkers.add(g); B.say(g, text, { tone, ms: 1500 + text.length * 40 }); }
  function hush() { const B = OS.bubbles; if (B) for (const g of talkers) B.clear(g); talkers.clear(); talkPh = ''; }
  function chatter() {
    if (rob.ph !== talkPh) { talkPh = rob.ph; talkN = 0; talkAt = OS.simT + (rob.ph === 'hold' ? 1.4 : .5); }
    if (OS.simT < talkAt) return;
    const gang = rob.gang.filter(f => folk.includes(f)), crew = rob.crew.filter(f => folk.includes(f)), n = talkN++, seed = rob.n * 1000 + n;
    if (rob.ph === 'hold' && gang.length) { const b = gang[n % gang.length]; say(b.g, Math.random() < .3 ? grawlix(seed) : gibberish(seed, undefined, 'driver') + (n % 2 ? '!' : '!!'), 'driver'); talkAt = OS.simT + 2.6 + Math.random() * 1.6; }
    else if (rob.ph === 'swat' && crew.length) { const c = crew[n % crew.length]; say(c.g, gibberish(seed, 2, 'cop') + '!', 'cop'); talkAt = OS.simT + 1.5 + Math.random() * .6; }
    else if (rob.ph === 'arrest') { const b = gang.length && n % 2 === 0 ? gang[(n >> 1) % gang.length] : null, c = crew.length ? crew[(n >> 1) % crew.length] : null;
      if (b) say(b.g, Math.random() < .35 ? grawlix(seed) : gibberish(seed, undefined, 'driver') + '?!', 'driver'); else if (c) say(c.g, gibberish(seed, undefined, 'cop') + '.', 'cop');
      talkAt = OS.simT + 1.8 + Math.random() * .8; }
    else talkAt = OS.simT + .5;
  }
  function robStep(dt: number, t: number) {
    if (rob.bc) rob.mA.color.copy(AMBER).multiplyScalar((t * 2.2) % 1 < .5 ? 2.8 : .3);
    { const on = rob.ph === 'hold' || rob.ph === 'swat' || rob.ph === 'arrest', ph = (t * 3) % 1, b = on && ph < .5, r = on && ph >= .5; // the station alarm
      SIR.mb.color.set(b ? '#5aa2ff' : '#16233d'); SIR.mr.color.set(r ? '#ff5050' : '#3a1518'); SIR.gb.opacity = b ? .85 : 0; SIR.gr.opacity = r ? .85 : 0; }
    if (rob.ph === 'idle') { if ((rob.tk += dt) < .5) return; rob.tk = 0; // due (timer or button), police at home: pick the street and send the van in
      if (reduced || !fun('robbery') || (OS.simT < rob.next && !rob.pend) || pol.ph !== 'idle' || !stns.some(S => !S.gone && S.units.length && [0, 1, 3].every(i => S.units[i].dir === 'home'))) return; // (some station has its two patrol cars and the SWAT van at home)
      const P = robPick(); if (P && robVan(P)) Object.assign(rob, { ph: 'drive', P, t0: OS.simT, pend: false, T: null, L: null, why: '' }); return; } // gate busy: tried again in .5 s
    const T = rob.T!, el = OS.simT - rob.t0, P = rob.P, z = SH, xs = 0, R = (a: number, l: number) => rp(P!, a, l), A = (O: { x: number; z: number }) => alongP(P!, O.x, O.z), h = P! && P.h; // scene positions: metres along the lane from the spot, metres right of the lane
    if ((rob.ph === 'drive' || rob.ph === 'wait') && (reduced || !fun('robbery') || !vehs.includes(rob.van!))) { robClear(true, 'van'); return; } // setting off: the van fades at once
    if (rob.ph === 'drive') { if (el > 240) robClear(true, 'drive'); return; } // never got there
    if (rob.ph === 'wait') { const T2 = pol.ph === 'idle' && (trucks.find(robOK) || (rob.st && vehs.includes(rob.st) && robOK(rob.st) && rob.st)); if (T2) { robStart(T2); return; } // not while a patrol car is out on a jam
      if (el > 25 && !rob.st && !rob.staged) { robStage(P!); if (rob.st) rob.staged = true; }
      if ((!rob.st && (rob.staged || el > 100)) || el > 240) { robGone(); rob.aborts++; Object.assign(rob, { ph: 'idle', P: null, staged: false, pend: false, next: OS.simT + robGap() }); } // nothing came by: the van leaves
      return; }
    if ((rob.ph === 'cut' || rob.ph === 'hold' || rob.ph === 'swat' || rob.ph === 'arrest') && (!fun('robbery') || !vehs.includes(T) || T.leg !== rob.L)) { robClear(true, !vehs.includes(T) ? 'truck gone' : T.leg !== rob.L ? 'truck leg' : 'off'); return; } // setting off, or the armoured car went elsewhere: end it
    if (rob.ph === 'hold' || rob.ph === 'swat' || rob.ph === 'arrest') chatter();
    if (rob.ph === 'cut') { if (T.v < .05 && T.s >= rob.sT - .3 && !rob.van!.leg && !rob.van!.legs.length) { // stopped: bandits out of the van, beacon on
        const C = cops(T.x, T.z); if (!C) { robClear(true, 'no units'); return; } // the nearest station with its two patrol cars and SWAT van at home; its roof alarm
        rob.cops = C; SIR.g.position.set(C[0].S.roof[0], 3.02, C[0].S.roof[1]);
        rob.ph = 'hold'; rob.t0 = OS.simT; rob.bc = new THREE.Mesh(G.unit, rob.mA); rob.bc.scale.set(.3, .18, .3); rob.bc.position.set(0, 1.86, .2); rob.ex = new THREE.Sprite(EXCL); rob.ex.position.set(0, 3, 0); rob.ex.scale.set(.9, .9, 1); T.g.add(rob.bc, rob.ex);
        const V = rob.van!, av = A(V), at = [[xs - 2.55, z + .2, h], [xs - 1.3, z + 1.45, h + Math.PI / 2], [xs + 1.1, z + 1.35, h + Math.PI / 2]].slice(0, 2 + (Math.random() < .5 ? 1 : 0));
        at.forEach((p, i) => { const b = mkFolk('bandit', ...R(av - .4 + i * .5, z + 1), h); rob.gang.push(b); walk(b, [R(p[0] + .3, z + 1.7 + i * .1), R(p[0], p[1])], null, p[2]); }); }
      else if (el > 20) robClear(true, 'cut'); }
    else if (rob.ph === 'hold') { // patrol cars at 3 s and 5 s, the SWAT van at 7 s: behind the armoured car, ahead of the van, at the back. They drive over from their station
      const K = rob.cops; for (const [i, at, dx] of [[0, 3, -6.2], [1, 5, 14], [2, 7, -11.6]]) if (el >= at && !rob.sent.has(i)) { rob.sent.add(i); const s = unitSpot(...R(xs + dx, 0), h); if (!s || !unitOut(K[i], s)) { robClear(true, (s ? 'route ' + i + ' ' + K[i].S.id + ' ' + s.u + '>' + s.e.to + ' ' + s.x.toFixed(1) + ',' + s.z.toFixed(1) + ' h' + s.h.toFixed(2) + ' xs' + xs.toFixed(1) : 'spot ' + i)); return; } }
      if (rob.sent.size === 3 && K.every(U => U.dir === 'post')) { rob.ph = 'swat'; rob.t0 = OS.simT; // SWAT and the two officers get out and aim
        const sw = K[2], as = A(sw.A), c = rob.gang.reduce<P2>((a, b) => [a[0] + b.x / rob.gang.length, a[1] + b.z / rob.gang.length], [0, 0]), to = (p: P2) => Math.atan2(c[0] - p[0], c[1] - p[1]);
        [[xs - 5.4, z + 1.8], [xs - 4.3, z + 2.4], [xs - 3.1, z + 2.6]].forEach(([a, l], i) => { const p = R(a, l), f = mkFolk('swat', ...R(as - .6 + i * .6, z + 1), h); f.U = sw; rob.crew.push(f); walk(f, [R(as + 1.8, z + 1.4 + i * .4), p], g => { g.pose = 'aim'; }, to(p)); });
        for (const [U, a, l] of [[K[0], xs - 3.8, z + 1.05], [K[1], xs + 12.2, z + 1.1]] as [PoliceUnit, number, number][]) { const p = R(a, l), f = mkFolk('cop', ...R(A(U.A), z + .95), h); f.U = U; rob.crew.push(f); walk(f, [p], g => { g.pose = 'aim'; }, to(p)); } }
      else if (el > 150) robClear(true, 'late'); } // the drive over from the station can be long when the street has many offices
    else if (rob.ph === 'swat') { if (el > 3.5) for (const b of rob.gang) if (b.pose !== 'up') b.pose = 'up';
      if (el > 6.5) { rob.ph = 'arrest'; rob.t0 = OS.simT; const p1 = rob.cops[0].A, p2 = rob.cops[1].A; // hands up, walked to the patrol cars, gone
        rob.gang.forEach((b, i) => { const a = A(i < 2 ? p1 : p2) - .55; walk(b, [R(A(b), z + 1.75), R(a, z + 1.75), R(a, z + 1)], vanish, null, 'up'); }); } }
    else if (rob.ph === 'arrest') { if (!rob.gang.some(f => folk.includes(f)) || el > 15) robClear(false); }
    else if (rob.ph === 'clear') { if (!folk.some(f => rob.gang.includes(f) || rob.crew.includes(f))) rob.ph = 'home'; }
    else if (rob.ph === 'home' && rob.cops.every(U => U.dir === 'home')) { rob.ph = 'idle'; rob.cops = []; rob.T = null; rob.L = null; rob.P = null; rob.staged = false; rob.next = OS.simT + robGap(); if (rob.st && !vehs.includes(rob.st)) rob.st = null; }
  }
  // probe: every stretch a spot can be picked on [from, to, length, start x, z, end x, z]
  const spots = (dbg?: boolean) => { if (dbg) { const r1 = (v: number) => +v.toFixed(1), o: unknown[] = []; for (const [u, n] of OS.net.N) for (const e of n.e) if (e.ln === 1 && !e.t) o.push([u, e.to, r1(e.len), e.lc ? 'lc' : '', e.sc || '', own(u) || own(e.to) ? 'own' : '', straight(e.pts) ? '' : 'bent', ...e.pts[0].map(r1), ...e.pts[e.pts.length - 1].map(r1)]); return o as (string | number)[][]; }
    const out: (string | number)[][] = [], r1 = (v: number) => +v.toFixed(1); for (const C of allRuns()) { const P = spotOn(C); if (P && P.pts) out.push([P.u, P.v, C.length, r1(Math.hypot(P.pts[P.pts.length - 1][0] - P.pts[0][0], P.pts[P.pts.length - 1][1] - P.pts[0][1])), ...P.pts[0].map(r1), ...P.pts[P.pts.length - 1].map(r1)]); } return out; };
  return { rob, robStep, spots };
}
