// Shared types: the live data (window.DashSim), the scene context every scene gets from the stage, and the base
// shapes for buildings, vehicles, people and roads that the factory and (phase 2) the office scenes build on.
// Type-only: this file emits an empty module.
import type * as THREE from 'three';
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import type { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import type { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import type { HUD } from '../app/hud.js';

// ───────────── live data (server.js buildSnapshot → live-data.js → window.DashSim)
export type AgentStatus = 'running' | 'waiting' | 'queued' | 'done' | 'failed';
export type NeedReason = 'approval' | 'question' | 'your reply' | 'input' | (string & {});

export interface Agent {
  id: string; taskId: string; projectId: string; kind: 'main' | 'sub'; role: string; label: string;
  model: string; effort: string; status: AgentStatus; pending?: boolean;
  startedAt: number; endedAt: number | null; lastActivity: number;
  input: number; output: number; cacheWrite: number; cacheRead: number; cache: number; tokens: number;
  cost: number; costKnown: boolean; toolCalls: number; tool: string; rate: number; ctx: number; progress: number;
  parentId: string | null; depth: number; dispatch?: string;
  needsHuman: boolean; needReason: NeedReason | null; needSince: number | null; activity: string;
}
export interface Task {
  id: string; projectId: string; title: string; status: AgentStatus; startedAt: number; endedAt: number | null; lastActivity: number;
  agents: Agent[]; aicoId: string | null; aicoIdSource: string | null; mode: 'brainstorm' | 'cooler' | null;
  needsHuman: boolean; needReason: NeedReason | null; needSince: number | null;
  owned: boolean; chat: { alive: boolean; busy: boolean; pending: number } | null; ext: { pending: number } | null;
  peer: { live: boolean; canSend: boolean; rc?: boolean } | null; openBy: 'process' | 'recent' | null; closed: boolean;
}
export interface Project { id: string; name: string; cwd: string; branch: string; color: string; tasks: Task[]; lastActivity: number; needsHuman: number }
export interface DashEvent { id: string; t: number; type: 'start' | 'done' | 'failed' | 'needs' | 'wait'; agentId: string; projectId: string; level: 'ok' | 'warn' | 'error' | 'human'; text: string }
export interface DashState { projects: Project[]; events: DashEvent[]; now: number; startedAt: number; hours: number; loading: boolean; ready: boolean }
/** A project as server.js buildSnapshot sends it; live-data adds the color. */
export type RawProject = Omit<Project, 'color'>;
/** One SSE message from /api/stream (server.js buildSnapshot). */
export interface Snapshot {
  now: number; since: number; hours: number; startedAt: number; loading: boolean; pendingBytes: number; root: string;
  projects: RawProject[]; events: DashEvent[]; history: { t: number; rate: number }[]; models: Record<string, ModelSpec & { id: string }>;
}
export interface ModelInfo { id: string; label: string; family: string; color: string; speed: number; priced: boolean; ctxWindow: number }
export interface ModelSpec { label?: string; family?: string; version?: string | number; priced?: boolean; ctxWindow?: number }
export interface RoleInfo { id: string; label: string; color: string }
export interface EffortInfo { id: string; label: string; color: string }
export interface Conn { status: 'connecting' | 'live' | 'reconnecting' | 'offline'; lastAt: number }
export interface HistoryPoint { t: number; rate: number; tokens: number; running: number }
export interface Totals {
  tokens: number; input: number; output: number; cache: number; cacheWrite: number; cacheRead: number; cost: number; costKnown: boolean;
  running: number; queued: number; waiting: number; done: number; failed: number; agents: number; tasks: number; projects: number;
  toolCalls: number; needs: number; needReasons: Record<string, number>;
}
export interface Group { tokens: number; cost: number; running: number; agents: number; costKnown: boolean; label: string; color: string }
export interface ProjectSummary {
  id: string; name: string; color: string; branch: string; cwd: string; lastActivity: number; tokens: number; cost: number; costKnown: boolean;
  running: number; waiting: number; needs: number; tasks: number; agents: number;
}
export interface Fmt { tokens(n: number): string; cost(n: number): string; dur(ms: number): string; ago(ts: number): string }
export type Subscriber = (state: DashState, events: DashEvent[]) => void;
export interface DashSim {
  state: DashState; MODELS: Record<string, ModelInfo>; ROLES: Record<string, RoleInfo>; EFFORTS: EffortInfo[]; EFFORT_DEFAULT: EffortInfo;
  history: HistoryPoint[]; conn: Conn; fmt: Fmt;
  subscribe(fn: Subscriber): () => boolean; onConn(fn: (c: Conn) => void): () => boolean;
  totals(): Totals; byModel(): (Group & { model: string })[]; byProject(): ProjectSummary[]; byRole(): (Group & { role: string })[]; agents(): Agent[];
  roleColor(role?: string | null): string; modelColor(id: string): string; effortColor(e?: string | null): string; effortInfo(e?: string | null): EffortInfo;
  ensureModel(id: string, info?: ModelSpec): ModelInfo;
  readonly hours: number; setHours(h: number | string): void; reconnect(): void; tick(): void;
}

// ───────────── scene context (app/stage.ts → buildScene(ctx))
export type PickKind = 'project' | 'task' | 'agent' | (string & {});
export interface Pick { kind: PickKind; id: string }
export interface SceneCtx {
  THREE: typeof THREE; scene: THREE.Scene; camera: THREE.OrthographicCamera; renderer: THREE.WebGLRenderer; controls: OrbitControls;
  CSS2DObject: typeof CSS2DObject; reduced: boolean; composer: EffectComposer; bloom: UnrealBloomPass;
  addPickable(m: THREE.Object3D, pick: Pick): void; removePickable(m: THREE.Object3D): void;
  focus(kind: PickKind, id: string): void;
  /** Fly the camera (target, and optionally its position and zoom) as a focus does; flying() is true until it lands. */
  flyTo(target: THREE.Vector3, o?: { toPos?: THREE.Vector3; zoom?: number; dur?: number }): void;
  flying(): boolean;
  /** The HUD boards; scenes use hud.tip() for their own HTML overlays. */
  hud: HUD;
}
/** What the HUD and chat.js call on the stage. focus/unfocus always exist; onFloor/lineSlots only once a scene runs (WebGL). */
export interface AppApi {
  focus(kind: PickKind, id: string): void;
  unfocus(): void;
  onFloor?(id: string): boolean;
  lineSlots?(id: string): Set<string> | null;
}
/** The stage config (APP in app/main.ts): camera frustum and limits, overview and intro camera, post effects. */
export interface AppOptions {
  frustum: number; exposure?: number; envIntensity?: number; orbitSpeed?: number;
  minPolar?: number; maxPolar?: number; minZoom?: number; maxZoom?: number;
  home: { target: THREE.Vector3; pos: THREE.Vector3; zoom?: number };
  intro?: { pos: THREE.Vector3; target?: THREE.Vector3; zoom?: number; dur?: number };
  bloom?: { strength?: number; radius?: number; threshold?: number };
  vignette?: { offset?: number; darkness?: number };
}
export interface FocusView { target: THREE.Vector3; zoom?: number; dist?: number; pos?: THREE.Vector3 }
export interface HomeView { target: THREE.Vector3; pos: THREE.Vector3; zoom: number }
export interface RobotHit { id: number; canDrive: boolean }
/** What a scene's build function returns to the stage. */
export interface SceneApi {
  sync(state: DashState, events: DashEvent[], deltas: Map<string, AgentDelta>, initial: boolean): void;
  frame(dt: number, t: number): void;
  layoutLabels(): void;
  focusOf(kind: PickKind, id: string): FocusView | null | undefined;
  anchorOf?(id: string): THREE.Vector3 | null | undefined;
  hover?(p: Pick | null): void;
  home?(): HomeView | null | undefined;
  unfocus?(): void;
  onFloor(id: string): boolean;
  lineSlots(id: string): Set<string> | null;
  parentOf?(kind: PickKind, id: string): Pick | null | undefined;
  robotAt?(x: number, y: number): RobotHit | null | undefined;
  driveRobot(id: number): boolean;
  /** A click (screen point) that hit nothing pickable: the scene may act on it (office: a lit apartment window opens its story). True if it did. */
  clickAt?(x: number, y: number): boolean;
  /** The screen point is over something clickAt acts on (the stage shows a pointer cursor). */
  pointerAt?(x: number, y: number): boolean;
}
export interface AgentDelta { isNew: boolean; dTokens: number; dTools: number; prevStatus: AgentStatus | null; changed: boolean; prevNeeds: boolean }

// ───────────── world shapes shared by the scenes
/** A 2D point on the ground plane: [x, z]. */
export type P2 = [number, number];
/** One leg of a route: a polyline on the ground with its cumulative lengths (cum[0] = 0, cum[last] = len). */
export interface Leg { pts: P2[]; cum: number[]; len: number }
export type Route = Leg[];
/** A road (or lane) edge of a road network: a leg with its heading h and left normal n (straight roads). */
export interface Road extends Leg { h?: P2; n?: P2; kind?: string }
export interface Roundabout { x: number; z: number; r: number }

/**
 * Base of every moving vehicle: position, heading (yaw, radians), speed, the heading unit vector (hx, hz),
 * progress along its current path (s, pi = point index), size (scale, eased in and out) and the leave timer.
 * The `kind` brands are optional and type-only: the scenes never write a kind field; the factory tells the
 * tow truck apart by its runtime `isTruck` flag.
 */
export interface VehicleBase {
  x: number; z: number; yaw: number; v: number; hx: number; hz: number;
  s?: number; pi?: number; scale: number; dying?: number;
}
export interface Agv extends VehicleBase { kind?: 'agv'; id: number }
export interface TowTruck extends VehicleBase { kind?: 'tow-truck'; isTruck: true }
// phase 2 adds: SportsCar, ArmouredCar, PatrolCar, SwatVan, BanditVan, Motorcycle
export type Vehicle = Agv | TowTruck;

/** Base of every building: its origin on the ground, the side it faces (d = +1 or -1) and its rotation. */
export interface BuildingBase { ox: number; oz: number; d: number; rot: number }
export interface Hall extends BuildingBase { kind?: 'hall'; id: string }
export interface Warehouse extends BuildingBase { kind?: 'warehouse' }
// phase 2 adds: Office, Bank, PoliceStation
export type Building = Hall | Warehouse;

/** A person walking on the ground (removal crew, mechanics; office staff in phase 2). */
export interface Person { x: number; z: number; yaw: number; path?: { x: number; z: number }[] }
