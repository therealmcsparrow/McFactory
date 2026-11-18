// The Dunes view's shared shapes. Type-only: this file emits an empty module.
import type * as THREE from 'three';
import type { AgentStatus } from '../common/types.js';
import type { Slot } from './terrain.js';
import type { SledParts, TowerParts, farmhand } from './models.js';

/** A water canister: its colour, and while it hops into place, where it hops from (t runs 0 → 1). */
export interface Can { c: THREE.Color; from: THREE.Vector3 | null; t: number }
/** A farm = a project: homestead, pad, one condenser row per open session. */
export interface Farm {
  id: string; slot: number; S: Slot; grp: THREE.Group; color: string; beaconM: THREE.MeshStandardMaterial; hit: THREE.Mesh;
  rows: Map<string, Row>; q: Can[]; acc: number; sled: Sled | null; scale: number; dying: number | null;
  el: HTMLElement; name: string; subT: HTMLElement; needT: HTMLElement; lab: THREE.Object3D;
  /** The two name banners by the homestead door. */
  flags: { g: THREE.Group; cloth: THREE.Group; name(n: string): void }[];
  run: number; wait: number; need: number; fail: number;
}
/** A condenser row = an open session. */
export interface Row { id: string; F: Farm; idx: number; z: number; grp: THREE.Group; hit: THREE.Mesh; slots: string[]; dying: number | null }
/** A condenser tower and its farmhand = an agent. Positions are farm-local. */
export interface Tower {
  id: string; F: Farm; row: Row; P: TowerParts; tx: number; tz: number; x: number; z: number; rise: number; dying: number | null;
  st: AgentStatus; needs: boolean; main: boolean; hand: Hand;
}
/** A farmhand; s is how far along its path (door to tower) it is heading. */
export interface Hand { P: ReturnType<typeof farmhand>; x: number; z: number; yaw: number; ang: number; ph: number; fade: number; s: number }
export interface Sled {
  id: number; P: SledParts; x: number; z: number; y: number; yaw: number; v: number; home: number;
  /** back: to the hall with a load (to the bay over the roof opening once it is free, else to its pad to wait); home: empty, to its pad */
  st: 'park' | 'out' | 'load' | 'back' | 'unload' | 'home'; F: Farm | null; from: string | null; cargo: Can[]; tm: number; bay: boolean;
}
