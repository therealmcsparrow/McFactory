// Shapes of the office scene's runtime objects (buildings, seats, people, vehicles, the road network, packets, the
// police and the robbery). Type-only: this file emits an empty module.
import type * as THREE from 'three';
import type { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import type { Agent, Task, P2 } from '../common/types.js';

// ───────────── seats and walking paths (seats.ts)
/** [x, y, z, w, h, d|rot]: a desk top or screen box (seats.ts). */
export type Box6 = [number, number, number, number, number, number];
/** One seat in a building (seats.ts SEATS): a team or manager desk (zone 'r0'..'r3'), a meeting chair or a kitchen stool. */
export interface Seat {
  zone: string; ri?: number; i: number; mgr?: boolean; x: number; z: number; rot: number; sy: number;
  top?: Box6; scr?: Box6; eye?: [number, number, number]; look?: [number, number, number]; sw?: number;
}
/** A point on a walking path; gate marks the building's door lane, fn runs on arrival. */
export interface WalkPt { x: number; z: number; gate?: 'in' | 'out'; pre?: boolean; wait?: number; fn?: () => void }

// ───────────── shared geometry (props.ts)
/** [x, y, z, rotY]: where a window sits on the shell. */
export type WinAt = [number, number, number, number];
/** props.ts G: the geometry every building, person and vehicle shares. */
export interface OfficeGeo {
  shell: THREE.BufferGeometry; winAt: WinAt[]; win: THREE.BufferGeometry; sign: THREE.BufferGeometry; siren: THREE.BufferGeometry;
  inner: THREE.BufferGeometry; glass: THREE.BufferGeometry; outer: THREE.BufferGeometry; srv: THREE.BufferGeometry;
  torso: THREE.BufferGeometry; arm: THREE.BufferGeometry; body: THREE.BufferGeometry; guard: THREE.BufferGeometry;
  leg: THREE.BufferGeometry; head: THREE.BufferGeometry; // body split (gait.ts): one leg, origin at the hip; the head and hair
  cup: THREE.BufferGeometry; bulb: THREE.BufferGeometry;
  car: THREE.BufferGeometry; truck: THREE.BufferGeometry; pcar: THREE.BufferGeometry; swat: THREE.BufferGeometry; van: THREE.BufferGeometry;
  moto: { ride: THREE.BufferGeometry; park: THREE.BufferGeometry }[]; // the motorcycle variants (vehicles/motorcycle.ts): with its rider, and parked without
  suv: THREE.BufferGeometry[]; hatch: THREE.BufferGeometry[]; pickup: THREE.BufferGeometry[]; // the colour variants (vehicles/suv.ts, hatchback.ts, pickup.ts)
  box: THREE.BufferGeometry[]; // the box truck liveries (vehicles/box-truck.ts)
  kit_cop: THREE.BufferGeometry; kit_swat: THREE.BufferGeometry; kit_bandit: THREE.BufferGeometry;
  unit: THREE.BufferGeometry; plane: THREE.BufferGeometry; hdd: THREE.BufferGeometry; pkt: THREE.BufferGeometry;
}
/** props.ts label(): the click handler of a sign; returns what to focus, or null. */
export type LabelPick = (e: MouseEvent) => [string, string] | null;

// ───────────── buildings (buildings/offices.ts)
/** A building's seat: the seat layout plus who sits there, its desk instance index (-1: none) and its pick box. */
export interface OfficeSeat extends Seat { who: string | null; idx: number; hit: THREE.Mesh }
/** The drives waiting at a dock: colours in arrival order, how many an armoured car has claimed, how long they wait. */
/** n / acc: drives added since the last rate sample, seconds since then; rate: drives a second (smoothed); trip: a car's round trip for this office, seconds (smoothed). */
export interface DockState { q: THREE.Color[]; res: number; age: number; n?: number; acc?: number; rate?: number; trip?: number }
/** why: the first open session's need reason ('' when none needs you; null when that session gave no reason). */
export interface OfficeCounts { run: number; wait: number; need: boolean; why: string | null }
/** One moving vehicle at a time (a forecourt, the bank apron). */
/** who: the vehicle that holds it; nx: the one next in line (an armoured car that only waits for the lock), nobody else takes it before it does. */
export interface Lock { who: AnyVehicle | null; nx?: AnyVehicle | null }
/** A desk-row, meeting-room or kitchen sign; task: the session it shows. */
export type ZoneLabel = CSS2DObject & { task?: string | null };
/** One office building = one project. */
export interface Office {
  id: string; k: number; c: number; r: number; name: string; color: string; ox: number; oz: number;
  open: number; openT: number; pickOn: boolean | null;
  rows: (string | null)[]; rowOf: Map<string, number>; spots: (SportsCar | null)[];
  dock: DockState; counts: OfficeCounts; srv: number; clockT: number; clockC: THREE.Color;
  closed: Task[]; labs: CSS2DObject[]; hits: THREE.Mesh[]; wDirty: boolean; lock: Lock; truck: ArmouredCar | null;
  g: THREE.Group; shell: THREE.Group; inner: THREE.Group; shellMesh: THREE.Mesh;
  mSrv: THREE.MeshBasicMaterial; mShell: THREE.MeshStandardMaterial; mWin: THREE.MeshBasicMaterial;
  mSign: THREE.MeshBasicMaterial; mSiren: THREE.MeshBasicMaterial; mLed: THREE.MeshBasicMaterial;
  win: THREE.InstancedMesh; wl: Float32Array; wVar: Float32Array; wOrder: Uint16Array;
  signCv: HTMLCanvasElement; signTex: THREE.CanvasTexture; signKey: string;
  tops: THREE.InstancedMesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
  screens: THREE.InstancedMesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  seats: OfficeSeat[]; hit: THREE.Mesh;
  lab: CSS2DObject; cbLab: CSS2DObject; moreLab: CSS2DObject; zoneLab: Record<string, ZoneLabel>;
}
/** A bank gate boom: its mesh, where it stands, how far it is open (0..1). */
export interface Boom { b: THREE.Mesh; x: number; z: number; o: number }

// ───────────── people (people.ts)
export type PersonState = 'seat' | 'walk' | 'car';
export type Gate = 'in' | 'out';
/** One person = one agent (or, in a meeting room or kitchen, one role: ids are the agents it stands for). */
export interface Person {
  id: string; a: Agent; ids: string[] | null; nocar: boolean; f: Office; zk: string; seat: OfficeSeat | null;
  g: THREE.Group; aL: THREE.Mesh; aR: THREE.Mesh; cup: THREE.Mesh; bulb: THREE.Mesh; bal: THREE.Sprite;
  lL: THREE.Mesh; lR: THREE.Mesh; ph: number; ga: number; // the legs, the stride phase and swing (gait.ts)
  sp: number; // their own walking pace: a factor (.85..1.15) on the office walking speed (people.ts)
  x: number; z: number; y: number; rot: number; path: WalkPt[]; wait: number; state: PersonState; phase: number;
  car: SportsCar | null; leaving: boolean; gone: boolean; talk: number; pk: number; hold: boolean;
  // set on the way (absent, so falsy, until then)
  fast: boolean; gin: boolean; tok: Gate | null; gd: Gate | null; gw: number; og: boolean; lq: boolean;
  by: Person | null; pass: Person | null; passT: number; dodge: number; side: number; stuck: number;
  segN: WalkPt; sx0: number; sz0: number; segT: number; ghost: boolean; vx: number; vz: number; held: number;
  lost: number; oldSeat: OfficeSeat | null;
}
/** sync.ts: where an agent (or a role in a room) should be. key: the person's id when it is not the agent's. */
export interface Want { a: Agent; F: Office; zk: string; ids?: string[]; nocar?: boolean; key?: string }

// ───────────── vehicles (vehicles/traffic.ts and the vehicle files)
/** A dense, smoothed line a vehicle drives along (traffic.ts mkLeg). */
export interface OfficeLeg {
  pts: P2[]; cum: Float32Array; vp: Float32Array; len: number; rev: boolean; fin: boolean; fout: boolean;
  end: (() => void) | null; ev: LegEvent[];
  lz?: { s0: number; s1: number; z: LaneZone }[]; // the lane changes on this leg (found once, traffic.ts)
}
/** Something on a leg at s: a wait (it stops there until wait() is true) and/or fn (run when passed). */
export interface LegEvent {
  s: number; wait?: (() => boolean) | null; fn?: (() => void) | null; near?: number | null; re?: boolean;
  done?: boolean; ok?: boolean; fx?: boolean; tag?: string; // tag: what the wait is for (probe)
  ag?: number; // asked again after it passed, while the vehicle stands (held by something else) less than ag metres past it
}
export interface LegOpts { v?: number; rev?: boolean; fin?: boolean; fout?: boolean; end?: () => void }
/** A pose on a leg (atL / pose write into one). */
export interface LegPos { x: number; z: number; i: number; rot?: number }
export type VehKind = 'car' | 'truck' | 'police' | 'swat' | 'van' | 'moto' | 'suv' | 'hatch' | 'pickup' | 'box';
/** What an agent drives to work (vehicles/sports-car.ts rideOf); kind 'car' is the sports car. */
export type AgentRide = 'car' | 'suv' | 'hatch' | 'pickup' | 'moto';
/** What every vehicle has (traffic.ts veh). */
export interface Vehicle {
  kind: VehKind; g: THREE.Object3D; x: number; z: number; rot: number; r: number; off: number; y: number;
  legs: OfficeLeg[]; leg: OfficeLeg | null; s: number; v: number; k: number; gk: number;
  ghost: boolean; gt: number; stuck: number; parked: boolean; by: AnyVehicle | null;
  lat: number; latT: number | null; sig: number; sigT: number; ind: THREE.Mesh[];
  wave?: number; rb?: AnyVehicle | null; yl?: AnyVehicle | null; sg?: boolean; sq?: number; yw?: boolean; yb?: boolean; lm?: number; wl?: boolean; haz?: boolean; hz?: boolean; scene?: boolean; inb?: boolean; // yw: moved over for a siren unit, it stands on the shoulder (or in the outer lane, lm = how far it moved) until the lane beside it is clear; yb: on its way back into the lane
  wt?: number; spin?: number; F?: Office | null; unit?: boolean; U?: PoliceUnit; wr?: string; // wr: what it stands for right now (probe)
  lw?: { x: number; z: number; h: number; c?: Ring } | null; // waiting to move into the lane through this point (heading h): a slow vehicle coming up in that lane leaves it room
  cw?: number; // polcut: when it started waiting at a short cut's line
  jc?: Junction | null; jI?: { t: number; leg: OfficeLeg | null; v: JInfo | null }; // jc: the junction it has gone into (traffic.ts); jI: the next junction on its leg (cached per tick)
  cj?: [number, number, number, number] | null; // a siren unit about to cross the street on a short cut: the point where it joins the lane, that lane's heading, and until when traffic holds for it there
}
export type SportsCarState = 'parked' | 'wait' | 'in' | 'out';
/** An agent's own vehicle (vehicles/sports-car.ts): a sports car, SUV, hatchback, pickup or motorcycle. pz: its z in the spot
 *  (a long one parks with its nose at the kerb), vr: its colour variant. */
export interface SportsCar extends Vehicle { kind: AgentRide; F: Office; spot: number; sx: number; pz: number; vr: number; P: Person | null; st: SportsCarState; end?: boolean; cm?: boolean; gi?: string } // gi: the in road it waits for (its spawn queue)
export type TruckState = 'idle' | 'out' | 'load' | 'back' | 'unload';
/** Armoured car (kind 'truck'). rvg: when it claimed its bay area (0: not), mv: moving in it now; staged: robbery scenery. */
export interface ArmouredCar extends Vehicle {
  kind: 'truck'; bay: number; gd: THREE.Mesh; st: TruckState; load: THREE.Color[]; F: Office | null;
  want: number; tmr: number; gdk: number; flying: number; slot: number; ret: boolean; rvg: number; mv: boolean; hold: number; staged?: boolean;
  /** q: sent ahead for a lay-by slot another car still holds (it waits on the in road until the slot is free); t0: when it set off */
  q?: boolean; t0?: number; /** cl: it has claimed its lay-by slot (at the in road, first come first served) */ cl?: boolean;
}
export interface PatrolCar extends Vehicle { kind: 'police'; unit: true; U: PoliceUnit }
export interface SwatVan extends Vehicle { kind: 'swat'; unit: true; U: PoliceUnit }
export interface BanditVan extends Vehicle { kind: 'van' }
/** A box truck (vehicles/delivery.ts): a delivery to the shops' loading bay, or through traffic.
 *  st: in (on its way), lot (along the car park's first aisle), bay (up the service drive and reversing into the bay),
 *  unload (standing in the bay), out (on its way out), pass (through traffic). */
export type BoxTruckState = 'in' | 'lot' | 'bay' | 'unload' | 'out' | 'pass';
export interface BoxTruck extends Vehicle { kind: 'box'; st: BoxTruckState; vr: number }
/** A shop visitor (vehicles/shop-visitor.ts): a car or a motorcycle that parks at the shops while its driver shops.
 *  st: in (on its way), park (in the car park, parking), shop (parked, driver away), back (reversing out), out (on its way out). */
export type ShopVisitorState = 'in' | 'park' | 'shop' | 'back' | 'out';
export interface ShopVisitor extends Vehicle { kind: 'car' | 'moto'; st: ShopVisitorState; shop: true; spot: { kind: 'car' | 'moto'; i: number }; sx: number }
export type AnyVehicle = SportsCar | ArmouredCar | PatrolCar | SwatVan | BanditVan | ShopVisitor | BoxTruck;
export type VehOf<K extends VehKind> = Extract<AnyVehicle, { kind: K }>;

// ───────────── road network (roads.ts)
/** A short cut's wait: [x, z, heading] of the lane it joins, [x, z] where it waits. */
export type SirenWait = [number, number, number, number, number];
/** A lane edge: ln the lane (0 inner, 1 outer) on a street or a roundabout, t the turn on a roundabout (R right, S straight on, L left, U back),
 *  c the cost for route() when it is not the length (a lane change costs a little more, so a vehicle keeps its lane unless it has to change). */
export interface NetEdge { to: string; pts: P2[]; len: number; w?: SirenWait; ln?: number; t?: 'R' | 'S' | 'L' | 'U'; c?: number; lc?: boolean; sc?: 'island' | 'cut' | 'tin'; j?: boolean } // tin: an armoured car's left turn into an in road (roads.ts truckNet)
export interface NetNode { x: number; z: number; e: NetEdge[] }
/** The road network: graph nodes, roundabout centres, and the key of the building set it was built for. */
/** A roundabout: centre x, z, outer lane radius, inner lane radius, number of arms. */
export type Ring = [number, number, number, number, number];
/** A straight stretch of the eastbound outer lane on an office street, from x0 to x1 (row r, after the roundabout of office F); u: a node on it. */
/** The road network: graph nodes, roundabouts, keep-clear boxes [x, z, half length, half width] at the out roads, robbery stretches, and the key of the building set it was built for. */
/** An in road at the south edge of the town: i the node where traffic comes in, o where it leaves, x its line. */
export interface InRoad { i: string; o: string; x: number }
/** rq: the rings near a point (a bucket grid over R); gates: the in roads, the avenue's (gate:in / gate:out) first. */
export interface RoadNet { key: string | null; N: Map<string, NetNode>; R: Ring[]; rq?: (x: number, z: number) => Ring[]; kc: [number, number, number, number][]; lz?: LaneZone[]; zg?: number; zn?: number; x0?: number; gates?: InRoad[]; J?: Junction[]; jq?: (x: number, z: number) => Junction[] }
/** A T-junction or a crossing with lights (roads.ts): centre, its arms (0 east, 1 south, 2 west, 3 north), lit: traffic lights; main: the
 *  through road's axis on a T without lights (0 east–west, 1 north–south; the other arm gives way); ph: the lights' phase offset (s);
 *  c: a stand-in ring over the box (traffic.ts ringAt, so nobody stops in it). */
export interface Junction { x: number; z: number; arms: number[]; lit: boolean; main: number; ph: number; c: Ring }
/** The next junction on a vehicle's leg (traffic.ts): where it goes in and out (s on the leg), its stop line, the arms in and out and its turn. */
export interface JInfo { J: Junction; sIn: number; sOut: number; sLine: number; ai: number; ao: number; t: 'R' | 'S' | 'L' | 'U' }
/** A lane change (roads.ts): where the S-curve starts (x0, z0) and ends (x1, z1), the heading h of the street; c: on a roundabout (the inner lane moving over to the outer one). */
export interface LaneZone { x0: number; z0: number; x1: number; z1: number; h: number; c?: Ring }
/** A route: its points, plus the waits of the short cuts it takes. */
export type RouteP = P2[] & { w: SirenWait[]; k?: string[]; es?: [string, NetEdge][] }; // k: the short cuts on it (island, cut, uturn); es: the edges taken
/** A point every .5 m along a lane (police.ts samples): heading h, edge e from node u, segment i, a/b metres before/after on it. */
export interface LaneSample { x: number; z: number; h: number; u: string; e: NetEdge; i: number; a: number; b: number }
/** Where a police unit stops; lane: in the lane itself (no shoulder). */
export type Spot = LaneSample & { lane?: boolean };

// ───────────── packets (packets.ts)
export interface Pulse { F: Office; pts: P2[]; cum: number[]; s: number; c: THREE.Color; deco?: boolean }
export interface Hop { a: THREE.Vector3; b: THREE.Vector3; t: number; dur: number; c: THREE.Color; fn: (() => void) | null }

// ───────────── street people, police, robbery (folk.ts, police.ts, robbery.ts)
export type FolkKind = 'cop' | 'swat' | 'bandit';
export type FolkPose = 'stand' | 'walk' | 'aim' | 'up' | 'wave';
export interface Folk {
  kind: FolkKind; g: THREE.Group; aL: THREE.Mesh; aR: THREE.Mesh; x: number; z: number; rot: number; k: number; kT: number;
  path: P2[]; pose: FolkPose; then: ((f: Folk) => void) | null; face: number | null; ph: number; U: PoliceUnit | null;
  lL: THREE.Mesh; lR: THREE.Mesh; ga: number; // the legs and their swing (gait.ts)
  sp: number; // their walking speed (m/s; folk.ts): each their own, never slower than the scenes were timed for
}
export interface Fade { g: THREE.Object3D; k: number }
export type UnitDir = 'home' | 'out' | 'post' | 'in';
export interface PoliceUnit {
  i: number; b: number; sw: boolean; A: PatrolCar | SwatVan; mB: THREE.MeshBasicMaterial; mR: THREE.MeshBasicMaterial;
  dir: UnitDir; spot: Spot | null; ret: boolean; retAt: number; S: Station;
}
/** A police station (police-station.ts): k 0 the first one (south of row 0's street, its in road off roundabout E), k >= 1 one more for every
 *  20 offices, on grid cell [c, r] at (ox, oz) north of its street (z zs), its in and out roads where an office has them. s: the side of the
 *  street it lies on (1 south, -1 north); the yard lane at z yz runs west from the in road (x inX, node in) to the out road (outX, node out);
 *  the bays at x bays, z bz (the units nose towards the street); the back lane at rz; door: the step the crews walk in at; roof: where its
 *  alarm stands. units: its three patrol cars and SWAT van (police.ts); g: its mesh (extra stations); gone: fewer offices now, it goes once
 *  its units are home */
export interface Station {
  id: string; k: number; c: number; r: number; ox: number; oz: number; zs: number; s: 1 | -1; yz: number; bz: number; rz: number;
  inX: number; outX: number; in: string; out: string; bays: number[]; door: P2; roof: P2; units: PoliceUnit[]; g: THREE.Group | null; gone: boolean;
}
export interface PoliceState {
  ph: 'idle' | 'out' | 'post' | 'back'; tk: number; cool: number; jam: { x: number; z: number; until: number } | null;
  force: P2 | null; U: PoliceUnit | null; off: Folk | null; quiet: number; t0: number; waved: number; n: number; mv: number;
}
export type RobPhase = 'idle' | 'drive' | 'wait' | 'cut' | 'hold' | 'swat' | 'arrest' | 'clear' | 'home';
/** The robbery spot: row r, lane heading h, position, a node u on the stretch it lies on. */
/** u, v: where the stretch it lies on starts and ends (one or more straight edges in a row); pts: that stretch; ho: head on (the van comes the other way) */
export interface RobSpot { r: number; h: number; x: number; z: number; u: string; v: string; pts?: P2[]; ho?: boolean }
export interface RobState {
  /** hoF: head on or not for every robbery from now on (probe; undefined: a third of them) */
  hoF?: boolean;
  ph: RobPhase; next: number; pend: boolean; tk: number; T: ArmouredCar | null; L: OfficeLeg | null; S: { go: boolean } | null;
  sT: number; P: RobSpot | null; ws: Spot | null; van: BanditVan | null; st: ArmouredCar | null; gang: Folk[]; crew: Folk[];
  sent: Set<number>; t0: number; bc: THREE.Mesh | null; ex: THREE.Sprite | null; mA: THREE.MeshBasicMaterial;
  n: number; aborts: number; load: number; staged?: boolean;
  cops: PoliceUnit[]; why: string; // the units sent (two patrol cars, the SWAT van; from the nearest station with free units); why the last robbery ended early
}

// ───────────── camera (focus.ts)
/** A desk view: whose eyes, and the camera there. */
export interface Pov { id: string; target: THREE.Vector3; pos: THREE.Vector3; zoom: number }
