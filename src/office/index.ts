// The office scene: the same live data as the factory view, drawn as office buildings west of an avenue and a gated
// bank east of it. building = project · desk row = open session · person = agent (clothes = role) · desk top = model ·
// screen = effort; manager's office = the main agents · meeting room = aico brainstorm · kitchen = aico cooler.
// Data lines carry token packets to the server at the dock; armoured cars take the drives to the bank. Roads: one-way
// lanes, keep right, roundabouts where streets meet; every forecourt has an in road and an out road.
// buildOffice(ctx, kit) is called once by startApp (app/stage.ts) and returns the scene API.
//
// Module pattern (the same as src/factory): each part is a maker makeX(OS) that takes the shared office state OS,
// builds its meshes and returns what the later parts need; buildOffice merges every result into OS in order. Values
// that more than one part reassigns (focusF, pov, net, simT, stackN ...) live on OS itself, and a part that calls into
// a later part does so through OS at call time (OS.walkIn, OS.rob ...), never at build time.
import { reduced } from '../common/dom.js';
import { agentIndex, taskById } from '../app/data.js';
import type { PickKind, SceneApi, SceneCtx } from '../common/types.js';
import type { OfficeKit, OfficeState } from './state.js';
import type { AnyVehicle, ArmouredCar, Person, Vehicle } from './types.js';
import { makeLayout } from './layout.js';
import { makeSeats } from './seats.js';
import { makeProps } from './props.js';
import { makeBank, makeBankStock } from './buildings/bank.js';
import { makePoliceStation } from './buildings/police-station.js';
import { makeOffices } from './buildings/offices.js';
import { makeRoads } from './roads.js';
import { makeTraffic } from './vehicles/traffic.js';
import { makeSportsCars } from './vehicles/sports-car.js';
import { makePeople } from './people.js';
import { makePackets } from './packets.js';
import { makeArmouredCars, makeDispatch } from './vehicles/armoured-car.js';
import { makeFolk } from './folk.js';
import { makePolice } from './police.js';
import { makeRobbery } from './robbery.js';
import { makeSync } from './sync.js';
import { makeFrame } from './frame.js';
import { makeFocus } from './focus.js';
import { makeShops, SHOP_SITE } from './buildings/shops.js';
import { makeShoppers, busyness } from './shoppers.js';
import { makeShopVisitors } from './vehicles/shop-visitor.js';
import { makeDeliveries } from './vehicles/delivery.js';
import { makeApartments, HOME_SITE } from './buildings/apartments.js';
import { makeHomes } from './homes.js';
import { makePeek } from './peek/window.js';
import { makeKids, MAXKIDS } from './kids.js';
import { makeDogWalkers, DOG_DEFAULT, type DogWalkers } from './dogs.js';
import { walkNet, roadTest } from './walknet.js';
import { makeBubbles } from './bubbles.js';
import { makeCrossings } from './crossings.js';
import { makePatrols } from './patrol.js';
import type { P2 } from '../common/types.js';

/** The probes' view of a vehicle of any kind: they print the armoured car's fields for every vehicle (absent ones read undefined). */
type ProbeVeh = Omit<Vehicle, 'by'> & { st?: string; bay?: ArmouredCar['bay']; rvg?: ArmouredCar['rvg']; mv?: ArmouredCar['mv']; by: ProbeVeh | null };

export function buildOffice(ctx: SceneCtx, kit: OfficeKit): SceneApi {
  const OS = { ctx, kit, stackN: 0, stackShown: 0, moreLab: null, focusF: null, markedTask: null, pov: null,
    net: { key: null, N: new Map(), R: [], kc: [] }, pForced: 0, simT: 0, tMin: Infinity, tMinAt: null } as unknown as OfficeState;
  Object.assign(OS, makeLayout(OS)); // lights, layout constants, geometry helpers
  Object.assign(OS, makeSeats(OS)); // desk seats and the walking paths to them
  Object.assign(OS, makeProps(OS)); // shared geometry (people, vehicle models), materials, signs and labels
  Object.assign(OS, makeBank(OS)); // the bank site east of the avenue
  Object.assign(OS, makePoliceStation(OS)); // the police station and its yard
  Object.assign(OS, makeBankStock(OS)); // the drive stack in the bank, packet and drive instances
  Object.assign(OS, makeOffices(OS)); // one office building per project
  Object.assign(OS, makeRoads(OS)); // road network, roundabouts, routing
  Object.assign(OS, makeTraffic(OS)); // shared vehicle driving: legs, lanes, giving way
  Object.assign(OS, makeSportsCars(OS)); // the staff cars
  Object.assign(OS, makePeople(OS)); // one person per agent: walking, seats, balloons
  Object.assign(OS, makePackets(OS)); // token packets along the data lines
  Object.assign(OS, makeArmouredCars(OS)); // armoured cars between the docks and the bank
  Object.assign(OS, makeDispatch(OS)); // sends an armoured car to a dock with drives waiting
  Object.assign(OS, makeFolk(OS)); // street people: police officers, SWAT, bandits
  Object.assign(OS, makePolice(OS)); // patrol cars and the SWAT van clearing jams
  Object.assign(OS, makeRobbery(OS)); // the bandits' van holding up an armoured car
  Object.assign(OS, makeSync(OS)); // data sync, signs, boards
  Object.assign(OS, makeFrame(OS)); // per-frame update
  Object.assign(OS, makeFocus(OS)); // focus, desk view, camera framing
  // ── the shops east of the east roundabout (buildings/shops.ts), the shoppers on foot (shoppers.ts) and the visiting cars and
  //    motorcycles (vehicles/shop-visitor.ts), the box trucks (vehicles/delivery.ts): frame and sync are wrapped here so they also step them and pass on the busyness ──
  const shops = makeShops(OS, SHOP_SITE), life = makeShoppers(OS, shops), visit = makeShopVisitors(OS, shops, life), deliv = makeDeliveries(OS, shops, visit);
  let shopForce: number | null = null; // probe shops(b): hold the busyness at b (null: follow the snapshots again)
  { const f0 = OS.frame, s0 = OS.sync;
    OS.frame = (dt, t) => { f0(dt, t); life.frame(dt, t); visit.frame(dt); deliv.frame(dt); };
    OS.sync = (st, ev, d, i) => { s0(st, ev, d, i); const b = shopForce ?? busyness(st); life.setBusy(b); visit.setBusy(b); deliv.setBusy(b); }; }
  // ── patrol cars cruising the town, now and then a speeder pulled over for a ticket (patrol.ts; setting patrols): stepped after the frame (after stepFolk) ──
  const patrols = makePatrols(OS); { const f0 = OS.frame; OS.frame = (dt, t) => { f0(dt, t); patrols.frame(dt, t); }; }
  // ── ?carsPreview=1: the vehicle models parked in rows on empty ground (vehicles/cars-preview.ts); loaded only then ──
  if (new URLSearchParams(location.search).has('carsPreview')) void import('./vehicles/cars-preview.js').then(m => m.carsPreview(OS));
  if (new URLSearchParams(location.search).has('parkPreview')) void import('./park-preview.js').then(m => m.parkPreview(OS)); // ?parkPreview=1: a playground with kids playing (park-preview.ts, kids.ts) at (96, -40)
  // ── ?stopPreview=1: a patrol car and a pulled-over car near x=96 z=10, the traffic stop on a loop (stop-preview.ts); loaded only then, stepped after the frame ──
  if (new URLSearchParams(location.search).has('stopPreview')) { const f1 = OS.frame; let st: ((dt: number) => void) | null = null; OS.frame = (dt, t) => { f1(dt, t); st?.(dt); }; void import('./stop-preview.js').then(m => { st = m.stopPreview(OS); }); }
  if (new URLSearchParams(location.search).has('dogsPreview')) { const f2 = OS.frame; let dw: ((dt: number, t: number) => void) | null = null; OS.frame = (dt, t) => { f2(dt, t); dw?.(dt, t); }; void import('./dogs-preview.js').then(m => { dw = m.dogsPreview(OS).frame; }); } // ?dogsPreview=1: six dog walkers on a grid of footpaths at (96, 40) (dogs-preview.ts, dogs.ts), stepped after the frame
  // ── the apartment complex north of the top office row, on its own road off the avenue (roads.ts); some windows lit ──
  const flats = makeApartments(OS, HOME_SITE); flats.setHome(14);
  // ── click a lit window: a short story plays in that home, seen through the window (peek/window.ts, the stories in peek/stories-*.ts) ──
  const peek = makePeek(OS, flats); { const f4 = OS.frame; OS.frame = (dt, t) => { f4(dt, t); peek.frame(); }; }
  // ── finished agents drive home to it (or to the shops first), park, walk in, their windows light up (homes.ts; OS.homeTrip, read by sports cars) ──
  const homes = makeHomes(OS, flats, visit); { const f3 = OS.frame; OS.frame = (dt, t) => { f3(dt, t); homes.frame(dt); }; }
  // ── kids in the park (kids.ts, more the busier town is), dog walkers on the sidewalks (dogs.ts on walknet.ts's graph of the sidewalks roads.ts
  //    draws, made again when the road net changes; setting dogWalkers), one set of speech bubbles (bubbles.ts, OS.bubbles: the robbery's shouting) ──
  const kids = makeKids(OS, OS.park), bubbles = OS.bubbles ??= makeBubbles(OS);
  const zeb = OS.zeb ??= makeCrossings(OS); // people on foot have the right of way at the zebras (crossings.ts: the dog walkers claim them, traffic stops)
  const dogCap = () => { try { return window.CWFun ? window.CWFun.get('dogWalkers') : DOG_DEFAULT; } catch (e) { return DOG_DEFAULT; } };
  const flatDoors = flats.doors.map(d => { const P = d.fromPavement.world.slice().reverse(), q = P[P.length - 1]; return { path: [...P, [q[0], HOME_SITE.z + 6.5 - OS.RW - .7] as P2] }; }); // door → pavement → the road's sidewalk
  let dogs: DogWalkers | null = null, dogKey: unknown = null, kidForce: number | null = null, dogN: number[] = [];
  const kidCap = () => { try { return window.CWFun ? window.CWFun.get('kids') : 12; } catch (e) { return 12; } };
  let kidBusy = 3; const kidN = () => kidForce ?? Math.min(kidCap(), kidBusy); // the busyness says how many, the kids setting caps it (0: empty, the parents go too)
  window.addEventListener('cw-fun', e => { const d = (e as CustomEvent<{ key: string }>).detail; if (d && d.key === 'dogWalkers') dogs?.setMax(dogCap()); if (d && d.key === 'kids') kids.setCount(kidN()); });
  { const f0 = OS.frame, s0 = OS.sync;
    OS.frame = (dt, t) => { f0(dt, t);
      if (OS.net.key !== dogKey && OS.walks().lines.length) { dogKey = OS.net.key; dogs?.dispose(); const W = walkNet(OS.walks(), flatDoors); W.road = roadTest([...OS.net.N.values()].flatMap(n => n.e.map(e => e.pts))); dogN =[W.nodes.length, W.edges.length, W.ends?.length ?? 0, W.doors?.length ?? 0]; dogs = makeDogWalkers(OS, W); dogs.setMax(dogCap()); }
      kids.frame(dt, t); dogs?.frame(dt, t); bubbles.frame(dt); };
    OS.sync = (st, ev, d, i) => { s0(st, ev, d, i); kidBusy = Math.round(3 + busyness(st) * (MAXKIDS - 3)); kids.setCount(kidN(), true); }; } // soft: no kids or parents fading in and out as the count wobbles
  const { bldgs, people, leavers, cars, trucks, pulses, PGAP, pLog, at, vehs, gap, spawnQ, frame, BFW, BFX, BBZ, STZ, pol, units, folk, rob, fun, ISO, who, sync, focusOf, anchorOf, home, unfocus, tstat, whyLay } = OS;
  const { controls, camera } = ctx;
  // read-only probe for tests and debugging
  let probeT = 0;
  window.__office = { stats: () => ({ buildings: bldgs.size, people: people.size, leaving: leavers.size, cars: cars.size, trucks: trucks.length, packets: pulses.length, queued: [...bldgs.values()].reduce((n, F) => n + F.dock.q.length, 0), maxDock: [...bldgs.values()].reduce((n, F) => Math.max(n, F.dock.q.length), 0), docks: [...bldgs.values()].map(F => [F.id, F.ox, F.oz, F.dock.q.length, F.dock.res]), perOffice: [...bldgs.values()].reduce((n, F) => Math.max(n, trucks.filter(T => T.F === F && (T.st === 'out' || T.st === 'load' || (T.st === 'back' && !T.ret))).length), 0), open: OS.focusF ? OS.focusF.id : null, pov: OS.pov ? OS.pov.id : null }),
    seats: () => [...people.values()].map(P => ({ id: P.a.id, key: P.id, zone: P.zk, seat: P.seat ? P.seat.i : null, state: P.state, talk: P.bal.visible })),
    people: () => { let min = Infinity, close = null; const L = [...people.values(), ...leavers].filter(P => P.state !== 'seat' && P.state !== 'car' && !P.hold);
      const tag = (P: Person): unknown[] => [+P.x.toFixed(2), +P.z.toFixed(2), P.leaving ? 'out' : 'in', P.path[0] ? +P.path[0].x.toFixed(2) + ',' + +P.path[0].z.toFixed(2) : '-', P.path.length, +(P.stuck || 0).toFixed(1), +(P.passT || 0).toFixed(1), +(P.dodge || 0).toFixed(1), P.wait > 0 ? 'wait' : ''];
      for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) if (L[i].f === L[j].f) { const d = Math.hypot(L[i].x - L[j].x, L[i].z - L[j].z); if (d < min) { min = d; close = [L[i], L[j]]; } }
      return { close: close && min < PGAP - .01 ? close.map(tag) : null, walking: L.length, held: [...people.values(), ...leavers].filter(P => P.hold && P.state === 'walk').length, minGap: min === Infinity ? null : +min.toFixed(3), stuck: L.filter(P => (P.stuck || 0) > 1.5).length, maxStuck: +L.reduce((m, P) => Math.max(m, P.stuck || 0), 0).toFixed(2), forced: OS.pForced, log: pLog.slice(), front: { in: L.filter(P => P.tok === 'in').length, out: L.filter(P => P.tok === 'out').length, maxWait: +[...people.values(), ...leavers].reduce((m, P) => Math.max(m, P.gd ? P.gw || 0 : 0), 0).toFixed(1), atDesk: [...leavers].filter(P => P.lq).length, holders: [...people.values(), ...leavers].filter(P => P.tok).slice(0, 6).map(P => [P.tok, ...tag(P), +(P.segT || 0).toFixed(1), !!P.hold, !!P.lq, P.by ? tag(P.by).concat(!!P.by.og, P.by.gd || '') : null]) }, jam: L.filter(P => (P.segT || 0) > 12).slice(0, 3).map(P => [...tag(P), +P.segT.toFixed(1), P.tok || '', P.by ? tag(P.by).concat(P.by.tok || '', P.by.state, !!P.by.hold) : null]),
        slow: L.filter(P => (P.stuck || 0) > 1.5).slice(0, 12).map(P => [P.f.id, +P.x.toFixed(2), +P.z.toFixed(2), P.path[0] && +P.path[0].x.toFixed(2), P.path[0] && +P.path[0].z.toFixed(2), P.path.length, P.leaving ? 'out' : 'in', +P.stuck.toFixed(1)]) }; },
    traffic: () => { let min = Infinity, at = null; const L = vehs.filter(A => !A.ghost && A.k * A.gk > .05); for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) { const g = gap(L[i], L[j]); if (g < min) { min = g; at = [L[i], L[j]].map(A => [A.kind, +A.x.toFixed(1), +A.z.toFixed(1), A.sig, A.parked ? 'p' : A.leg && A.leg.rev ? 'r' : 'f']); } }
      OS.tMin = Math.min(OS.tMin, min); if (min <= OS.tMin) OS.tMinAt = at;
      return { vehicles: vehs.length, moving: vehs.filter(A => !A.parked).length, ghosts: vehs.filter(A => A.ghost).length, stuck: vehs.filter(A => A.stuck > 5).length, waiting: spawnQ.length, minGap: min === Infinity ? null : +min.toFixed(3), minAt: OS.tMinAt, at, trucks: trucks.map(T => T.st), layby: trucks.map(T => +(T.hold || 0).toFixed(1)), waits: (vehs as ProbeVeh[]).filter(A => !A.parked && A.wt! > 8).map(A => [A.kind, A.st, A.bay, +A.x.toFixed(1), +A.z.toFixed(1), +A.wt!.toFixed(0), A.leg && A.leg.rev ? 'rev' : 'fwd', A.leg && +(A.s / A.leg.len).toFixed(2), A.rvg ? 'rvg' : '', A.by && A.by.kind + '/' + A.by.st + '@' + A.by.x.toFixed(1) + ',' + A.by.z.toFixed(1)]), spin: +vehs.reduce((m, A) => Math.max(m, A.spin || 0), 0).toFixed(2), spinT: +trucks.reduce((m, A) => Math.max(m, A.spin || 0), 0).toFixed(2), nodes: OS.net.N.size,
        held: (vehs as ProbeVeh[]).filter(A => A.stuck > 5).map(A => [A.kind, A.st, A.bay, A.mv ? 'mv' : A.rvg ? 'rvg' : '', +A.x.toFixed(1), +A.z.toFixed(1), A.by && A.by.kind, A.by && A.by.bay, A.by && (A.by.mv ? 'mv' : A.by.rvg ? 'rvg' : ''), A.by && A.by.st, A.by && +A.by.x.toFixed(1), A.by && +A.by.z.toFixed(1)]) }; },
    // jams(): vanish count; every vehicle held or standing > 5 s with what it stands for (wr) and the vehicle at the front of its queue; loaded cars waiting in a lay-by and why
    sirnet: () => { const r1 = (v: number) => +v.toFixed(1), N = OS.net.N, out: unknown[] = []; for (const [u, L] of OS.sirenNet() || []) for (const e of L) out.push([u, e.sc, e.to, e.pts[0].map(r1), e.pts[e.pts.length - 1].map(r1)]);
      return { out, pol: [...N.entries()].filter(([k, n]) => /^pol/.test(k) || Math.abs(n.x - OS.POX) < 14 && Math.abs(n.z - OS.STZ) < 8).map(([k, n]) => [k, r1(n.x), r1(n.z), n.e.map(e => [e.to, e.t || '', e.lc ? 'lc' : '', e.pts[e.pts.length - 1].map(r1)])]) }; }, // siren short cuts (probe)
    rings: () => OS.net.R.map(c => [+c[0].toFixed(1), +c[1].toFixed(1), c[4]]), // roundabouts [x, z, arms] (probe)
    junctions: () => (OS.net.J || []).map(j => [+j.x.toFixed(1), +j.z.toFixed(1), j.arms.join(''), j.lit ? 'lit' : '', j.main, OS.lightAt(j, 0)[0] + OS.lightAt(j, 1)[0]]), // T-junctions and crossings [x, z, arms, lit, main, lights] (probe)
    jams: () => { const r1 = (v: number) => +v.toFixed(1), tag = (A: AnyVehicle) => [A.kind, 'st' in A ? A.st : '', r1(A.x), r1(A.z), r1(A.wt || 0), r1(A.stuck), A.wr || '', A.kind === 'truck' ? A.bay : null];
      const front = (A: AnyVehicle) => { let f = A; for (let n = 0; f.by && n < 40; n++) f = f.by; return f; };
      return { vanish: tstat.vanish, sq: tstat.sq, gates: OS.gstat, zg: OS.net.zg, held: vehs.filter(A => !A.parked && !A.ghost && (A.stuck > 5 || (A.wt || 0) > 5)).map(A => { const f = front(A); return [...tag(A), f !== A ? tag(f) : null, f.wr === 'polout' || f.wr === 'by' ? vehs.filter(O => O !== f && !O.ghost && !O.parked && Math.hypot(O.x - f.x, O.z - f.z) < (f.wr === 'by' ? 8 : 18)).map(O => [O.kind, 'st' in O ? O.st : '', r1(O.x), r1(O.z), r1(O.rot), r1(O.v), O.wr || '', O.by ? O.by.kind + '@' + r1(O.by.x) + ',' + r1(O.by.z) : '']) : null]; }),
        lay: trucks.filter(T => T.st === 'back' && !T.ret && T.hold > 5).map(T => [T.F ? T.F.id : null, T.slot, r1(T.hold), whyLay(T), T.load.length]) }; },
    step(sec: number, dt = 1 / 30) { for (let n = Math.round(sec / dt); n > 0; n--) frame(dt, probeT += dt); },
    // yard(): every vehicle in or by the bank yard: kind, state, bay, x, z, heading (deg), reversing, stuck, who holds it up, the wait it stands at
    yard: () => (vehs as ProbeVeh[]).filter(A => !A.parked && A.x > BFW - 4 && A.x < BFX + 4 && A.z > BBZ && A.z < STZ + 2).map(A => { const L = A.leg, w = L && L.ev.find(e => !e.done && e.wait && !e.ok);
      return [A.kind, A.st, A.bay, +A.x.toFixed(1), +A.z.toFixed(1), Math.round(A.rot * 57.3), L && L.rev ? 'r' : 'f', A.mv ? 'mv' : A.rvg ? 'rvg' : '', +A.stuck.toFixed(0), +(A.wt || 0).toFixed(0), A.by ? [A.by.kind, A.by.bay, +A.by.x.toFixed(1), +A.by.z.toFixed(1)] : null, w && L ? [+(w.s - A.s).toFixed(1), w.near || 7] : null]; }),
    // police(): state; police('call', x, z): send a patrol car to the road nearest (x, z) as if traffic were jammed there; police('jam', x, z): the nearest roundabout lets nobody in for 35 s
    // and a patrol car is called to it. A call waits while a robbery is on or a unit is still out, then goes. x and z are only read with a cmd
    police(cmd: 'call' | 'jam' | undefined, x: number, z: number) { if (cmd === 'call') pol.force = [x, z], pol.cool = 0; else if (cmd === 'jam') { const c = OS.net.R.slice().sort((a, b) => Math.hypot(a[0] - x, a[1] - z) - Math.hypot(b[0] - x, b[1] - z))[0]; if (c) { pol.jam = { x: c[0], z: c[1], until: OS.simT + 35 }; pol.force = [c[0], c[1]]; pol.cool = 0; } }
      return { ph: pol.ph, n: pol.n, waved: pol.waved, moved: pol.mv, cool: +Math.max(0, pol.cool - OS.simT).toFixed(1), jam: pol.jam && OS.simT < pol.jam.until ? [pol.jam.x, pol.jam.z] : null, unit: pol.U && pol.U.i, spot: pol.U && pol.U.spot ? [+pol.U.spot.x.toFixed(1), +pol.U.spot.z.toFixed(1)] : null,
        officer: pol.off && pol.off.pose, sir: { ...OS.sirP, held: +OS.sirP.held.toFixed(1), heldMax: +OS.sirP.heldMax.toFixed(1), gave: +OS.sirP.gave.toFixed(1), why: Object.fromEntries(Object.entries(OS.sirP.why).map(([k, v]) => [k, +v.toFixed(1)])), net: [...(OS.sirenNet()?.values() ?? [])].flat().reduce((n, e) => { n[e.sc || '-']++; return n; }, { island: 0, cut: 0, '-': 0 } as Record<string, number>) }, units: units.map(U => [U.dir, +U.A.x.toFixed(1), +U.A.z.toFixed(1), +U.A.lat.toFixed(2), U.S.id]), folk: folk.length,
        stations: OS.stns.map(S => ({ id: S.id, cell: [S.c, S.r], at: [+S.outX.toFixed(1), +S.yz.toFixed(1)], gone: S.gone, units: S.units.map(U => U.dir).join(','), trips: OS.sirP.stn[S.id] || 0 })) }; }, // stations: each one, where its out road leaves the yard, its units, the trips they made
    // robbery(): state; robbery('start'): the bandits' van sets off as soon as the police are at the station (pends until then) and stops the next
    // loaded armoured car on that office street; at: the spot, vanAt: where the van is, staged: an extra armoured car was sent; robbery('soon'): the timer runs out now
    robbery(cmd) { if (cmd === 'head' || cmd === 'side') rob.hoF = cmd === 'head'; if ((cmd === 'start' || cmd === 'head' || cmd === 'side') && rob.ph === 'idle') rob.pend = true; // head / side: like start, and every robbery from now on head on / from the side
 if (cmd === 'soon' && rob.ph === 'idle') rob.next = OS.simT;
      const vn = rob.van, r2 = (v: number) => +v.toFixed(1), xtra = { at: rob.P && [r2(rob.P.x), r2(rob.P.z)], vanAt: vn && [r2(vn.x), r2(vn.z), +vn.lat.toFixed(2)], staged: !!rob.staged, ho: !!(rob.P && rob.P.ho), stagedAt: rob.st && vehs.includes(rob.st) ? [r2(rob.st.x), r2(rob.st.z)] : null };
      return { ph: rob.ph, pend: rob.pend, rm: !!reduced, police: pol.ph !== 'idle' || units.some(U => U.dir !== 'home'), n: rob.n, aborts: rob.aborts, next: +Math.max(0, rob.next - OS.simT).toFixed(0), on: fun('robbery'), truck: rob.T && [+rob.T.x.toFixed(1), +rob.T.z.toFixed(1), rob.T.load.length, rob.load, +rob.T.lat.toFixed(2)], van: !!rob.van, gang: rob.gang.filter(f => folk.includes(f)).map(f => f.pose), crew: rob.crew.filter(f => folk.includes(f)).length, sent: [...rob.sent], cops: rob.cops.map(U => U.S.id + '.' + U.S.units.indexOf(U)), why: rob.why, ...xtra }; }, // cops: the units sent (station.bay); why: why the last one ended early
    // shops(): the shop visitors and the shoppers; shops(b): hold the busyness at b (0..1) from now on, shops(null): follow the snapshots again
    shops(b?: number | null) { if (b !== undefined) { shopForce = b; if (b != null) { life.setBusy(b); visit.setBusy(b); deliv.setBusy(b); } } return { force: shopForce, ...visit.stats(), walkers: life.stats(), boxes: deliv.stats() }; },
    // kids(n): hold the number of kids at n (null: follow the busyness again); dogs(): the dog walkers and the size of their graph; bubbles(): what is said
    kids(n?: number | null) { if (n !== undefined) { kidForce = n; kids.setCount(kidN()); } return { force: kidForce, cap: kidCap(), busy: kidBusy, obstacles: OS.park.obstacles || [], ...kids.stats() }; },
    // bubbles(x, z): also put two test bubbles 0.6 m apart at (x, z), to see them kept apart on screen
    dogs: () => dogs ? { ...dogs.stats(), net: dogN } : null,
    // zebras(): zebras in town and claimed now; vehicles that stopped for one (longest stop, stopped now); walkers that waited at the kerb (longest wait, waiting now); holds at a roundabout's line
    zebras: (on?: boolean) => { if (on === false) Object.assign(zeb, { pass: () => true, stopAt: () => null, ringHold: () => false }); return zeb.stats(); }, // zebras(false): nobody gives way any more, for A/B runs (until reload)
    bubbles(x?: number, z?: number) { if (x != null && z != null) { const p = controls.target.clone(); bubbles.say(() => p.set(x, 1.75, z), 'Blorp grenk fazoo!', { ms: 6000, tone: 'cop' }); const q = controls.target.clone(); bubbles.say(() => q.set(x + .6, 1.75, z + .2), 'Skrim?! %&#@!', { ms: 6000, tone: 'driver' }); } return bubbles.stats(); },
    // homes(): finished agents on their way home, shopping, parked at the apartments, at home, lit windows; homes('force', 'home' | 'shop'):
    // the first seated agent whose car is parked finishes now and goes (home, shop, or either at the usual odds), past the odds and the limit
    // homes('off') / homes('on'): no new trips (finished agents drive off out of town, as before) / trips again
    homes(cmd?: 'force' | 'on' | 'off', how?: 'home' | 'shop') { let forced: string | null = null; if (cmd === 'on' || cmd === 'off') homes.setOn(cmd === 'on');
      if (cmd === 'force') { const P = [...people.values()].find(Q => Q.state === 'seat' && Q.car && Q.car.st === 'parked' && !leavers.has(Q)); if (P) { homes.force(how || 'any'); forced = P.a.id; OS.leave(P); } }
      return { ...homes.stats(), forced }; },
    // patrol(): the patrol cars (phase, x, z, speed, lat), the stop going on and the counts; patrol('speed'): a speeder and a stop now (a patrol car comes out first if none is)
    patrol: (cmd?: 'speed') => patrols.probe(cmd),
    // peek(): the window story showing (window, story id, time), how many stories and lit windows; peek('open', i | storyId), peek('seek', t), peek('close')
    peek: (cmd?: 'open' | 'close' | 'seek' | 'where', a?: number | string) => peek.probe(cmd, a),
    // gates(): the bank's two gate booms (where, how far open) and the vehicles within 8 m of each (kind, x, z); the armoured cars (state, x,
    // z, speed, its left turns still ahead: leftin / leftout); docks: per office its pile, drives a minute, round trip (s), cars on a run for it, sent ahead
    pile: (i: number, n: number) => { const F = [...OS.bldgs.values()][i]; if (F) for (let k = 0; k < n; k++) OS.dockPush(F, OS.AMBER.clone()); return !!F; }, // pile(i, n): n drives onto office i's pile now (probe)
    robspots: (dbg?: boolean) => OS.spots(dbg),
    // layjam(id): office id's lay-by: its cars (slot, state, q, ret, x, z, wait tag), the lock (who / next), vehicles in the merge box (probe)
    layjam: (id: string) => { const F = OS.bldgs.get(id); if (!F) return null; const d = (A: unknown) => { const B = A as { kind: string; st?: string; slot?: number; x: number; z: number } | null; return B ? [B.kind, B.st, B.slot, +B.x.toFixed(1), +B.z.toFixed(1)] : null; };
      return { o: [F.ox, F.oz], lock: [d(F.lock.who), d(F.lock.nx)], cars: OS.trucks.filter(T => T.F === F).map(T => { const w = T.leg && T.leg.ev.find(e => !e.done && e.wait && !e.ok); return [T.slot, T.st, !!T.q, !!T.ret, +T.x.toFixed(1), +T.z.toFixed(1), w ? w.tag : '', T.load.length]; }),
        box: OS.vehs.filter(O => !O.parked && Math.abs(O.x - F.ox) < 20 && Math.abs(O.z - F.oz) < 12).map(d) }; },
    // dockprobe(): per armoured car on a run: its number, 'load' / 'lay' (loaded, still in the lay-by) / its state, what holds it (whyLay, or the wait it
    // stands at), drives on board, the pile at its office
    dockprobe: () => OS.trucks.filter(T => T.F).map((T, i) => { const L = T.leg, w = L && T.v < .05 && L.ev.find(e => !e.done && e.wait && !e.ok), lay = T.st === 'back' && !T.ret;
      return [OS.trucks.indexOf(T), lay ? 'lay' : T.st, lay ? whyLay(T) : w ? w.tag || '?' : '', T.load.length, T.F!.dock.q.length, i]; }), // every street stretch a robbery spot can be picked on (probe)
    gates: () => ({ docks: [...OS.bldgs.values()].map(F => [F.id, F.dock.q.length, +((F.dock.rate || 0) * 60).toFixed(1), +(F.dock.trip || 0).toFixed(0),
        OS.trucks.filter(T => T.F === F && (T.st === 'out' || T.st === 'load' || T.st === 'back')).length, OS.trucks.filter(T => T.F === F && T.q).length]), booms: OS.booms.map(B => ({ x: B.x, z: B.z, o: +B.o.toFixed(2), near: OS.vehs.filter(A => Math.hypot(A.x - B.x, A.z - B.z) < 8).map(A => [A.kind, +A.x.toFixed(1), +A.z.toFixed(1)]) })),
      trucks: OS.trucks.map(T => [T.st, +T.x.toFixed(1), +T.z.toFixed(1), +T.v.toFixed(1), ...(T.leg ? T.leg.ev.filter(e => e.tag === 'leftin' || e.tag === 'leftout').filter(e => e.s > T.s - 1).map(e => e.tag + '@' + (e.s - T.s).toFixed(0)) : [])]) }),
    look(x: number, z: number, zoom = 3) { controls.target.set(x, 0, z); camera.position.copy(controls.target).addScaledVector(ISO, 52); camera.zoom = zoom; camera.updateProjectionMatrix(); controls.update && controls.update(); return true; } };

  // one step back out of a person's desk view: their office building (not the whole site)
  const parentOf = (kind: PickKind, id: string) => { if (kind !== 'agent') return null; const P = who(id), a = agentIndex.get(id), F = P ? P.f : a && bldgs.get(a.projectId); return F ? { kind: 'project', id: F.id } : null; };
  return { sync, frame, layoutLabels() { }, focusOf, anchorOf, hover() { }, home, parentOf, robotAt: () => null, driveRobot: () => false, unfocus, onFloor: (id: string) => bldgs.has(id),
    clickAt: (x: number, y: number) => peek.clickAt(x, y), pointerAt: (x: number, y: number) => peek.pointerAt(x, y),
    lineSlots: (id: string) => { const t = taskById(id); if (!t || t.closed) return null; const s = new Set<string>(); for (const P of people.values()) if (P.a.taskId === id) { s.add(P.a.id); if (P.ids) for (const i of P.ids) s.add(i); } return s; } };
}
