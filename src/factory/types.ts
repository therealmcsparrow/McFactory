// Shapes of the factory scene's runtime objects (halls, lines, arms, crates, docks, robots, the road network, the
// removal crew). Type-only: this file emits an empty module.
import type * as THREE from 'three';
import type { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import type { Agent, Task, P2, Hall as HallBase, Agv, TowTruck, Person, Road } from '../common/types.js';

/** One belt or cross-conveyor roller (line-local or hall-local). */
export interface Roller { x: number; y: number; z: number; r: number; len: number }

/** A project's hall (halls.ts makeFactory): the grid cell from slotInfo plus its meshes, signs and lines. */
export interface Hall extends HallBase {
  k: number; i: number; j: number; lane: number;
  name: string; color: string; lines: Line[];
  /** line count the fixtures were built for; -1 before the first build */
  n: number; D: number; more: number; speed: number; det: boolean; fix: THREE.Group | null; q: number; backlog: number;
  grp: THREE.Group; bt: THREE.CanvasTexture; ct: THREE.CanvasTexture; beltM: THREE.MeshStandardMaterial; ctM: THREE.MeshStandardMaterial;
  cs: number; crossLoad: number; rol: THREE.InstancedMesh; crossR: Roller[]; cd: number; rolDirty: boolean;
  accentM: THREE.MeshStandardMaterial; padM: THREE.MeshStandardMaterial; roofM: THREE.MeshStandardMaterial; roofDM: THREE.MeshStandardMaterial;
  skyM: THREE.MeshStandardMaterial; beaconM: THREE.MeshBasicMaterial; smoke: THREE.Mesh<THREE.IcosahedronGeometry, THREE.MeshBasicMaterial>[];
  signW: number; nameTex: THREE.CanvasTexture; signM: THREE.MeshBasicMaterial;
  op: number; run: number; wait: number; need: number; hit: THREE.Mesh;
  nameT: HTMLElement; needT: HTMLElement; nameEl: HTMLDivElement; nameLab: CSS2DObject;
  subB: HTMLElement; subS: HTMLElement; subQ: HTMLElement; signHov?: boolean; subLab: CSS2DObject; clT: HTMLElement;
  cbName: HTMLElement; cbN: HTMLElement; cbG: HTMLElement; cbMore: HTMLElement; cbKey: string; cbLab: CSS2DObject;
  closed: Task[]; fixS: number; dock: Dock;
  /** set by buildFixtures */
  shell: THREE.Group; roofG: THREE.Group; smokeAt: P2; cbZ: number; crossTop?: number; signHit?: THREE.Mesh; subAt: THREE.Vector3[];
  /** set by crew.ts placeBin */
  bin?: Bin; junk?: Arm[];
  cbOn?: boolean; subOn?: boolean;
}

/** One session's conveyor line inside a hall (halls.ts makeLine). */
export interface Line {
  id: string; f: Hall; row: number; z: number; zt?: number; slots: (string | null)[];
  el: HTMLDivElement; wrap: HTMLDivElement; lab: CSS2DObject; hit: THREE.Mesh;
  finEl: HTMLDivElement; finH: HTMLElement | null; finS: HTMLElement | null; finL: HTMLElement | null; finM: HTMLElement | null; finC: HTMLElement | null;
  finKey: string; finN: number; dot: HTMLElement | null; title: HTMLElement | null; small: HTMLElement | null;
  sp: number; load: number; work: boolean; rd: number;
  bt: THREE.CanvasTexture; beltM: THREE.MeshStandardMaterial; belt: THREE.Mesh; parts: THREE.Group;
  closing?: boolean; placed?: boolean;
  /** arms being removed by the crew: the line's other arms keep their places until it is empty */
  hold?: Set<Arm>;
}

/** The Object3D nodes of one arm, named as in arms.ts AP. */
export type ArmNode = 'root' | 'sc' | 'turn' | 'sh' | 'el' | 'wr' | 'f1' | 'f2' | 'held' | 'beacon' | 'gauge' | 'gfill';

/** One agent's robot arm on a line (arms.ts makeArm). */
export interface Arm extends Record<ArmNode, THREE.Object3D> {
  a: Agent; line: Line; si: number; ax: number; ii: number;
  gauge01: number; hit: THREE.Mesh; heldVis: boolean; key: string;
  roleC: THREE.Color; modelC: THREE.Color; effC: THREE.Color; effGlow: number;
  ph: number; yaw: number; r: number; h: number; grip: number; credit: number; cycling: boolean; u: number; dropped: boolean;
  born: number; wait: boolean; scale: number; dying: number; flash: number; flashCol: THREE.Color; sag: number;
  retire?: boolean; fin?: boolean; leaving?: boolean; dis?: boolean; queued?: boolean;
}
/** One instanced arm part (arms.ts AIM). */
export interface AimPart { im: THREE.InstancedMesh; node: ArmNode; ck: string }

export type CrateStage = 'belt' | 'cross' | 'hop' | 'dock' | 'deck' | 'agv' | 'drop';
/** One crate (crates.ts newCrate): belt, cross conveyor, dock, robot deck, warehouse pile. The fields after `dead` are set per stage, not at creation. */
export interface Crate {
  i: number; st: CrateStage; w: THREE.Vector3; born: number; t: number; dead: boolean;
  line: Line | null; lx: number; lz: number; f: Hall | null; dock: Dock; from: THREE.Vector3; to: THREE.Vector3; qi: number;
  robot: Robot; slot: number;
}

/** An outbound dock (warehouse.ts dockFor): one per grid cell, it outlives its hall until every crate is picked up. */
export interface Dock {
  k: number; rx: number; oz: number; px: number; lane: number; side: number; queue: Crate[]; reserved: number; f: Hall | null;
  claims?: number; st?: Stop | null; sv?: number;
}

// ───────────── road network (roads.ts)
/** A road node: a junction, roundabout or dead end. hs holds the junction locks. */
export interface NetNode {
  id: string; x: number; z: number; hs: Set<BoxHold>; deg: number; roads: number;
  leaf?: boolean; rb?: boolean; box?: boolean; r?: number;
}
/** A directed lane: one side of a road, or a one-way unload strip through the warehouse. */
export interface NetEdge extends Road {
  /** heading and right-hand normal: set on road lanes only (strips have none, and the code reads them on roads only) */
  h: P2; n: P2;
  kind: 'road' | 'strip'; id: number; a: NetNode; b: NetNode; cum: number[]; tStop?: number; transit?: boolean;
}
export interface NetSpot { e: NetEdge; t: number; spot: P2 }
export interface Net {
  key: string; ver: number; nodes: Map<string, NetNode>; edges: NetEdge[]; out: Map<NetNode, NetEdge[]>;
  strips: Record<number, NetEdge[]>; spots: NetSpot[]; rbs?: NetNode[];
}
/** A place on the network: edge, distance along it, and the off-road spot (lay-by) if any. */
export interface Stop { e: NetEdge; t: number; spot: P2 | null; dock?: boolean }
/** Where a robot is headed or parked. */
export type StopRef =
  | { kind: 'dock'; dk: Dock }
  | { kind: 'drop'; side: number; k: number; t?: number }
  | { kind: 'here'; st: Stop; v?: number }
  | { kind: 'park'; i: number };
export type RobotTask =
  | { kind: 'pick'; dk: Dock; k: number }
  | { kind: 'drop'; side: number; k: number; z: number; key: string }
  | { kind: 'home'; i: number }
  | { kind: 'test' };
export type PickTask = Extract<RobotTask, { kind: 'pick' }>;
export type DropTask = Extract<RobotTask, { kind: 'drop' }>;
/** The lane point under a driving robot (agv.ts hereStop). */
export type HereRef = Extract<StopRef, { kind: 'here' }>;
/** A driven path: points, speed cap per point, cumulative length. */
export interface Path { pts: P2[]; cap: number[]; cum: number[]; len: number }
/** A junction lock: footprint the holder sweeps through the box at node n. */
export interface BoxHold { n: NetNode; a: number; b: number; fp: [number, number, number][]; r: Mover; held: boolean; done: boolean }
/** A roundabout passage on a planned route (path distances). */
export interface RbVisit { n: NetNode; ai: number; ao: number; a: number; q: number; b: number; done: boolean }
/** A roundabout passage as routePts plans it (points; setPath turns them into an RbVisit). */
export interface RbPlan { n: NetNode; ai: number; ao: number; li: P2; qo: P2; lo: P2 }
/** A merge point after a lay-by: yield to traffic before s. */
export interface MergePt { s: number; x: number; z: number }
/** routePts result: raw points, merge points, roundabout passages. */
export interface RoutePlan { pts: P2[]; M: P2[]; V: RbPlan[] }

// ───────────── vehicles
/** An AGV robot (vehicles/agv.ts). spawnRobot leaves s, pi, path, to, wait, back, force and nextDrop unset: the code reads them only
 *  once setPath (or the stage that sets them) has run, so they are typed as always present. */
export interface Robot extends Agv {
  ii: number; st: string; lift: number; load: Crate[]; at: StopRef | null; task: RobotTask | null;
  Ms: MergePt[]; mi: number; J: BoxHold[]; born: number; dying: number; idle: number; ph: number; q: THREE.Quaternion; t: number;
  s: number; pi: number; path: Path; to: StopRef; wait: boolean; back: number; force: number; nextDrop: number;
  RB?: RbVisit[]; blk?: Mover | null;
  broken?: boolean; shoulder?: boolean; towed?: boolean; ry?: number; pitch?: number; stillT?: number; unstuck?: number;
  why?: string; rpT?: number; dropT?: number; took?: boolean; isTruck?: false;
}
/** The tow truck (vehicles/tow-truck.ts). It shares the robots' driving helpers; shoulder/towed never apply to it. */
export interface TowTruckState extends TowTruck {
  st: string; RB: RbVisit[]; Ms: MergePt[]; mi: number; J: BoxHold[]; P: Path | null; path?: Path | null;
  s: number; pi: number; stuck: number; dying: number; wait?: boolean; blk?: Mover | null;
  shoulder?: never; towed?: never;
}
/** Anything that drives on the network and takes junction locks. */
export type Mover = Robot | TowTruckState;
/** A breakdown in progress (tow-truck.ts). */
export interface Breakdown {
  r: Robot; ph: string; t: number; L: Stop; lx: number; lz: number; lh: P2; ver: number;
  p0: P2; p1: P2; y0: number; h0?: [number, number, number];
}
/** What the tow truck exposes on FS.BRK. */
export interface BrkInfo {
  on: boolean; ph: string | null; id: number | null; t: number; n: number; pending: boolean; sending: boolean;
  truck: unknown; robot: unknown; garage: unknown;
}
export interface BrkApi {
  frame(dt: number, t: number): void;
  /** obstacles the robots must yield to (the truck, a broken robot) */
  OBST: Mover[];
  force(id?: number): Record<string, unknown>;
  info(): BrkInfo;
}

// ───────────── removal crew (crew.ts)
export interface Worker extends Person {
  ii: number; k: number; root: THREE.Object3D; body: THREE.Object3D; head: THREE.Object3D; hat: THREE.Object3D;
  l1: THREE.Object3D; l2: THREE.Object3D; a1: THREE.Object3D; a2: THREE.Object3D;
  st: string; wait: number; sc: number; ph: number; path: { x: number; z: number }[]; then: string; t: number;
  piece: Piece | null; spot: { x: number; z: number } | null; out: number;
}
/** One carried piece of a dismantled arm. */
export interface Piece {
  parts: { i: number; M: THREE.Matrix4 }[]; c: THREE.Vector3; qt: THREE.Quaternion; sc: number; low: number; st: string; u: number;
  w: Worker | null; p: THREE.Vector3; q: THREE.Quaternion; s: number; yaw0: number; from: THREE.Vector3;
}
/** A hall's removal crew. */
export interface Crew { f: Hall; ws: Worker[]; job: Arm | null; ph: string; t: number; pieces: Piece[] | null; next: number; dump?: number }
/** A hall's scrap bin. */
export interface Bin { g: THREE.Group; hinge: THREE.Object3D; puffs: THREE.Mesh[]; door: THREE.Object3D; open: number; puff: number }

/** A screen rectangle in CSS px (focus.ts label layout). */
export interface Rect { l: number; t: number; r: number; b: number }
/** A camera move from focus.ts; fit: fitHall already framed it for the free area. */
export interface FocusFit { target: THREE.Vector3; zoom: number; fit?: boolean }

/** A roundabout sculpture (sculptures.ts). */
export interface Sculpture { g: THREE.Group; tick(t: number, dt: number): void }
