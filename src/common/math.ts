// Math and easing helpers shared by every scene (no DOM, no three.js).
export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
export const damp = (c: number, t: number, l: number, dt: number) => c + (t - c) * (1 - Math.exp(-l * dt));
export const easeIO = (t: number) => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
export const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
export const hashf = (s: string, k = 0) => { let h = 2166136261 ^ k; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return ((h >>> 0) % 10000) / 10000; };
