// Browser helpers shared by the HUD and every scene.
export const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
export const $ = <E extends Element = HTMLElement>(s: string) => document.querySelector<E>(s);
export function webglOK() { try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2')); } catch (e) { return false; } }
