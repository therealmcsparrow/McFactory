import { clamp } from '../common/math.js';
import type * as THREE from 'three';
import type { OSAtPackets } from './state.js';
import type { P2 } from '../common/types.js';
import type { ArmouredCar, Hop, Office, Pulse } from './types.js';

export function makePackets(OS: OSAtPackets) {
  const { linePath, DOCKMAX, TRAY } = OS;
  // ── data packets, drives, armoured cars ──
  const pulses: Pulse[] = [], hops: Hop[] = [], trucks: ArmouredCar[] = [];
  const W = (F: Office, x: number, y: number, z: number, out: THREE.Vector3) => out.set(F.ox + x, y, F.oz + z);
  const dockPush = (F: Office, c: THREE.Color) => { if (F.dock.q.length < DOCKMAX) F.dock.q.push(c); F.dock.n = (F.dock.n || 0) + 1; }; // the pile at the dock grows until the cars catch up (safety cap: DOCKMAX); n counts drives for the pile's growth rate (armoured-car.ts dispatch)
  function emit(F: Office, zone: string | null | undefined, x: number | null | undefined, c: THREE.Color, delay: number, deco?: boolean) { // deco: a block that only shows the flow; counted blocks become a drive at the dock
    if (pulses.length >= 380) { if (!deco) dockPush(F, c); return; } const pts = linePath(zone, x), cum = [0]; for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])); pulses.push({ F, pts, cum, s: -delay * 5, c, deco }); }
  const at = <T extends number[]>(pts: P2[], cum: ArrayLike<number>, s: number, out: T): T => { let i = 1; while (i < cum.length - 1 && cum[i] < s) i++; const l = cum[i] - cum[i - 1] || 1, k = clamp((s - cum[i - 1]) / l, 0, 1), a = pts[i - 1], b = pts[i]; out[0] = a[0] + (b[0] - a[0]) * k; out[1] = a[1] + (b[1] - a[1]) * k; return out; };
  const hop = (from: THREE.Vector3, to: THREE.Vector3, c: THREE.Color, fn: (() => void) | null, dur = .5) => hops.push({ a: from.clone(), b: to.clone(), t: 0, dur, c, fn });
  // the dock pile: on a pallet by the building corner, between the server and the lay-by; 4 x 3 drives per layer (TRAY), as high as it gets
  const trayAt = (F: Office, j: number, out: THREE.Vector3) => W(F, -11 + (j % 4) * .6, .6 + Math.floor(j / TRAY) * .2, 7.25 + Math.floor((j % TRAY) / 4) * .4, out);
  return { pulses, hops, trucks, W, dockPush, emit, at, hop, trayAt };
}
