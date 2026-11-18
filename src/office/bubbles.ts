// Comic speech bubbles with text, above a person's head (or a car window), for scenes such as a traffic stop
// (traffic-stop.ts). Each bubble is an HTML element in the CSS2D label layer, like the .sign labels (props.ts label()):
// the text stays sharp at every zoom, the app font is used, and a handful of elements cost next to nothing. A canvas
// sprite would need a texture per line and blurs when zoomed. The bubble follows its target every frame. It is hidden
// while its anchor is off-screen, in the desk view, or when the camera is so far out that a person is a few pixels tall.
// It pops in and out (scale), or just shows and hides with reduced motion. At most MAX at once: a new one drops the oldest.
//
//   const B = makeBubbles(OS); B.say(officer.g, 'Zorp krat?', { tone: 'cop' }); ... B.frame(dt) once per frame, after
//   the targets have moved; B.clear(target); B.dispose().
import * as THREE from 'three';
import type { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { reduced } from '../common/dom.js';
import type { OfficeState } from './state.js';

export type BubbleTone = 'cop' | 'driver' | 'neutral';
/** Who speaks: an object (the bubble sits y metres above its origin, default 1.75: over a person's head) or a function giving the point the tail touches. */
export type BubbleTarget = THREE.Object3D | (() => THREE.Vector3);
export interface SayOpts { ms?: number; tone?: BubbleTone; y?: number }
export interface Bubbles {
  say(target: BubbleTarget, text: string, opts?: SayOpts): void;
  clear(target?: BubbleTarget): void;
  frame(dt: number): void;
  dispose(): void;
  /** How many bubbles are up, and how many of them are visible now (probe). */
  stats(): { up: number; shown: number };
}
type BubbleOS = Pick<OfficeState, 'ctx' | 'pov'>;

const MAX = 6, POP = .18, MIN_PPM = 20; // most at once; pop-out time (s); hidden below this many screen pixels per metre
const CSS = `.cw-bub{pointer-events:none!important}
.cw-bub>div{position:relative;max-width:170px;padding:5px 9px 6px;border-radius:12px;background:#f7f4ec;color:#15181e;font:700 14px/1.15 var(--font-ui);letter-spacing:.01em;
text-align:center;white-space:normal;overflow-wrap:anywhere;box-shadow:0 0 0 2px #15181e,0 3px 0 2px rgba(0,0,0,.35);transform-origin:50% calc(100% + 9px);transform:scale(.3);opacity:0;
transition:transform .18s cubic-bezier(.3,1.6,.5,1),opacity .12s}
.cw-bub>div::after{content:"";position:absolute;left:50%;bottom:-9px;width:12px;height:12px;margin-left:-6px;background:inherit;box-shadow:2px 2px 0 0 #15181e;transform:skewX(18deg) rotate(45deg) scaleY(.85)}
.cw-bub.in>div{transform:none;opacity:1}
.cw-bub.cop>div{background:#e4ecff;box-shadow:0 0 0 2px #1d3f8f,0 3px 0 2px rgba(0,0,0,.35)}.cw-bub.cop>div::after{box-shadow:2px 2px 0 0 #1d3f8f}
.cw-bub.driver>div{background:#fff3df;box-shadow:0 0 0 2px #7a3b12,0 3px 0 2px rgba(0,0,0,.35)}.cw-bub.driver>div::after{box-shadow:2px 2px 0 0 #7a3b12}
.cw-bub.rm>div{transition:none}
@media (prefers-reduced-motion:reduce){.cw-bub>div{transition:none}}`;
let styled = false;

// Bubbles near each other on screen are nudged apart: each frame the lowest anchor keeps its place and every bubble above
// whose box would overlap one already placed moves up above it. A bubble also stays between the side columns (.col) and
// below the top edge; its tail then no longer points straight down at the speaker but it is still the nearest bubble.
// The nudge eases (snaps with reduced motion) and is applied as left/top on the inner box, so the CSS2D layer's transform and
// the pop-in scale stay as they are.
interface Bub { t: BubbleTarget; o: CSS2DObject; el: HTMLDivElement; tx: HTMLDivElement; y: number; life: number; out: number;
  w: number; h: number; dx: number; dy: number; sx: number; sy: number; fresh: boolean }
const GAP = 4, EDGE = 8;

export function makeBubbles(OS: BubbleOS): Bubbles {
  const { scene, camera, view, CSS2DObject } = OS.ctx;
  if (!styled) { const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st); styled = true; }
  const L: Bub[] = [], v = new THREE.Vector3(), nd = new THREE.Vector3();
  const anchor = (b: Bub, out: THREE.Vector3) => typeof b.t === 'function' ? out.copy(b.t()) : b.t.getWorldPosition(out).setY(out.y + b.y);
  const kill = (b: Bub) => { b.o.removeFromParent(); b.el.remove(); const i = L.indexOf(b); if (i >= 0) L.splice(i, 1); };
  const leave = (b: Bub) => { if (b.out >= 0) return; if (reduced) { kill(b); return; } b.out = POP; b.el.classList.remove('in'); };
  function say(t: BubbleTarget, text: string, o: SayOpts = {}) {
    const ms = o.ms ?? 1200 + text.length * 55, tone = o.tone || 'neutral', y = o.y ?? 1.75;
    let b = L.find(b => b.t === t && b.out < 0);
    if (!b) { const live = L.filter(b => b.out < 0); if (live.length >= MAX) leave(live[0]); // a handful at most: the oldest goes
      const el = document.createElement('div'), tx = document.createElement('div'); el.appendChild(tx); el.setAttribute('aria-hidden', 'true'); // decoration: the text means nothing
      const ob = new CSS2DObject(el); ob.center.set(.5, 1); scene.add(ob); b = { t, o: ob, el, tx, y, life: 0, out: -1, w: 0, h: 0, dx: 0, dy: 0, sx: 0, sy: 0, fresh: true }; L.push(b);
      anchor(b, ob.position); requestAnimationFrame(() => b && b.out < 0 && b.el.classList.add('in')); if (reduced) el.classList.add('in'); }
    b.el.className = 'cw-bub ' + tone + (reduced ? ' rm in' : b.el.classList.contains('in') ? ' in' : ''); if (b.tx.textContent !== text) { b.tx.textContent = text; b.w = 0; } b.life = ms / 1000; b.y = y;
  }
  let safeL = 0, safeR = 0, safeAt = -1, clock = 0;
  function safe() { // the open stage between the side columns, looked up once a second
    if (clock - safeAt < 1 && safeR) return; safeAt = clock; safeL = 0; safeR = innerWidth;
    for (const c of document.querySelectorAll<HTMLElement>('.col')) { const r = c.getBoundingClientRect(); if (r.width < 1 || r.height < 1) continue;
      if (r.left + r.width / 2 < innerWidth / 2) safeL = Math.max(safeL, r.right); else safeR = Math.min(safeR, r.left); }
    if (safeR - safeL < 200) { safeL = 0; safeR = innerWidth; } }
  const b0 = (b: Bub) => b.w > 0;
  function spread(dt: number) {
    const S = L.filter(b => b.out < 0 && b.o.visible); if (!S.length) return; safe();
    for (const b of S) if (!b.w) { b.w = b.tx.offsetWidth; b.h = b.tx.offsetHeight; } // layout size, not the pop-in scale (0 until the label layer first shows it)
    for (let i = S.length - 1; i >= 0; i--) if (!b0(S[i])) S.splice(i, 1);
    S.sort((a, b) => b.sy - a.sy); // the lowest anchor first: it keeps its place
    const placed: [number, number, number, number][] = [], k = reduced ? 1 : 1 - Math.exp(-dt * 14);
    for (const b of S) {
      const lo = safeL + EDGE + b.w / 2, hi = safeR - EDGE - b.w / 2, cx = lo > hi ? (safeL + safeR) / 2 : Math.min(hi, Math.max(lo, b.sx));
      const fit = (up: boolean) => { let bot = Math.max(b.sy, EDGE + b.h); // above the boxes in the way, or (near the top edge) below them
        for (let pass = 0; pass < 8; pass++) { let hit = false;
          for (const [l, t, r, bt] of placed) if (cx - b.w / 2 < r + GAP && cx + b.w / 2 > l - GAP && bot - b.h < bt + GAP && bot > t - GAP) { bot = up ? t - GAP : bt + GAP + b.h; hit = true; }
          if (!hit) break; }
        return bot; };
      let bot = fit(true); if (bot - b.h < EDGE) bot = fit(false);
      placed.push([cx - b.w / 2, bot - b.h, cx + b.w / 2, bot]);
      const tx = cx - b.sx, ty = bot - b.sy; if (b.fresh) { b.dx = tx; b.dy = ty; b.fresh = false; } else { b.dx += (tx - b.dx) * k; b.dy += (ty - b.dy) * k; }
      b.tx.style.left = b.dx.toFixed(1) + 'px'; b.tx.style.top = b.dy.toFixed(1) + 'px'; }
  }
  function frame(dt: number) {
    clock += dt;
    const h = camera instanceof THREE.OrthographicCamera ? (camera.top - camera.bottom) / camera.zoom : 0, ppm = h ? innerHeight / h : MIN_PPM, far = ppm < MIN_PPM || !!OS.pov;
    for (const b of [...L]) {
      if (b.out >= 0) { if ((b.out -= dt) <= 0) kill(b); continue; }
      if ((b.life -= dt) <= 0) { leave(b); continue; }
      anchor(b, v); b.o.position.copy(v); nd.copy(v).project(view);
      b.o.visible = !far && Math.abs(nd.x) < 1.05 && Math.abs(nd.y) < 1.1 && nd.z > -1 && nd.z < 1;
      b.sx = (nd.x + 1) / 2 * innerWidth; b.sy = (1 - nd.y) / 2 * innerHeight;
    }
    spread(dt);
  }
  return {
    say, frame,
    clear(t) { for (const b of [...L]) if (!t || b.t === t) leave(b); },
    dispose() { for (const b of [...L]) kill(b); },
    stats: () => ({ up: L.filter(b => b.out < 0).length, shown: L.filter(b => b.out < 0 && b.o.visible).length }),
  };
}
