// Globals shared between the classic scripts (live-data, chat, usage, settings) and the modules.
import type { DashSim } from '../common/types.js';

declare global {
  /** settings.ts: the numeric settings (each has its own range and default). */
  type FunNumKey = 'shopWalkers' | 'shopCars' | 'officeMax' | 'patrols' | 'dogWalkers' | 'kids';
  /** settings.ts: the "fun elements": on/off toggles (unknown keys read as true) and a few numbers (kept in their range). */
  interface FunSettings {
    get(key: FunNumKey): number; get(key: string): boolean;
    set(key: FunNumKey, value: number): void; set(key: string, value: boolean): void;
    on(fn: (key: string, value: boolean | number) => void): () => void;
  }
  /** office.js robbery(): the robbery state the office HUD button reads (more fields exist; only these are typed). */
  interface RobberyState { ph: 'idle' | 'drive' | 'wait' | 'cut' | 'hold' | 'swat' | 'arrest' | 'clear' | 'home' | (string & {}); pend: boolean; rm: boolean; police: boolean; [k: string]: unknown }
  /** window.__office (office.js): read-only test probes plus robbery(cmd) for the HUD button. */
  /** office.js patrol(): the patrol state the Speeder button reads (more fields exist; only these are typed). */
  interface PatrolState { want: number; out: number; force: boolean; busy: boolean; stop: { phase: string } | null | undefined; [k: string]: unknown }
  interface OfficeProbe { robbery(cmd?: 'start' | 'soon' | 'head' | 'side'): RobberyState; patrol?(cmd?: 'speed'): PatrolState; [k: string]: unknown }
  interface Window {
    DashSim: DashSim;
    CWFun: FunSettings;
    /** chat.js: open a session card from outside */
    __focus(kind: string, id: string): void;
    /** the time window changed: reset the feed */
    __onWindow(): void;
    /** read-only test probes */
    __fac?: Record<string, unknown>;
    __office?: OfficeProbe;
    __crew?: Record<string, unknown>;
    __labObs?: unknown;
  }
}
export {};
