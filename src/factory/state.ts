// The shared factory state FS that every maker in src/factory receives (see index.ts for the pattern).
//
// Each maker is typed by what exists when it runs: the shared values, the hand-typed late references below, and
// the merged returns of the makers before it (FSAt*). The full FactoryState is the chain after the last maker.
// The chain is acyclic because a maker's parameter type only names earlier makers; members a maker reads from a
// LATER maker at call time (FS.BRK, FS.dockFor ...) are typed by hand in FactoryLate, never derived.
import type * as THREE from 'three';
import type { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import type { SceneCtx } from '../common/types.js';
import type { Arm, BrkApi, Crate, Dock, Hall, Robot } from './types.js';
import type { makeLayout } from './layout.js';
import type { makeHalls } from './halls.js';
import type { makeWarehouse } from './warehouse.js';
import type { makeRoads } from './roads.js';
import type { makeSculptures } from './sculptures.js';
import type { makeArms } from './arms.js';
import type { makeCrew } from './crew.js';
import type { makeCrates } from './crates.js';
import type { makeAgvs } from './vehicles/agv.js';
import type { makeTowTruck } from './vehicles/tow-truck.js';
import type { makeSync } from './sync.js';
import type { makeFrame } from './frame.js';
import type { makeFocus } from './focus.js';

/** Values more than one part reassigns; they live on FS so every part sees the current value. */
export interface SharedFactoryState {
  ctx: SceneCtx;
  unit: number; shown: number; target: number;
  /** warehouse pile colours: [first pile slot, colour] runs */
  stackColors: [number, THREE.Color][];
  rateAcc: number; fleetWant: number; routeRoads: boolean;
  /** hovered agent id, hovered hall (project id), the hall the camera is focused on (project id) */
  hovered: string | null; hoverHall: string | null; focusF: string | null;
  /** the label the open-hall layout currently pushes aside */
  offLab: CSS2DObject | null;
  frameMs: number; simT: number;
}

/** Members a maker reads at call time from a maker that runs after it. Hand-typed to keep the chain acyclic. */
export interface FactoryLate {
  DT: number; DSL: number; // roads, read by warehouse
  dockFor(k: number): Dock; placeBin(f: Hall): void; cr: Crate[]; // warehouse / crew / crates, read by halls
  arms: Map<string, Arm>; dyingArms: Set<Arm>; freeArm(A: Arm): void; startDying(A: Arm, retire?: boolean): void; // arms, read by halls
  deckSpot(r: Robot, slot: number, out: THREE.Vector3): THREE.Vector3; // agv, read by crates
  crewJobs: Set<Arm>; dropCrate(A: Arm): void; // crew / crates, read by arms
  BRK: BrkApi; // tow truck, read by agv
}

type Base = SharedFactoryState & FactoryLate;
export type FSAtLayout = Base;
export type FSAtHalls = FSAtLayout & ReturnType<typeof makeLayout>;
export type FSAtWarehouse = FSAtHalls & ReturnType<typeof makeHalls>;
export type FSAtRoads = FSAtWarehouse & ReturnType<typeof makeWarehouse>;
export type FSAtSculptures = FSAtRoads & ReturnType<typeof makeRoads>;
export type FSAtArms = FSAtSculptures & ReturnType<typeof makeSculptures>;
export type FSAtCrew = FSAtArms & ReturnType<typeof makeArms>;
export type FSAtCrates = FSAtCrew & ReturnType<typeof makeCrew>;
export type FSAtAgvs = FSAtCrates & ReturnType<typeof makeCrates>;
export type FSAtTowTruck = FSAtAgvs & ReturnType<typeof makeAgvs>;
export type FSAtSync = FSAtTowTruck & ReturnType<typeof makeTowTruck>;
export type FSAtFrame = FSAtSync & ReturnType<typeof makeSync>;
export type FSAtFocus = FSAtFrame & ReturnType<typeof makeFrame>;
export type FactoryState = FSAtFocus & ReturnType<typeof makeFocus>;
