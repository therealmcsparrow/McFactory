// The drawing kit for the window stories (peek/): a small room seen straight through a lit apartment window, drawn on a 2D
// canvas in a flat, warm style. A story (Story) is a pure function of time: draw(p, t) paints the whole picture for second t,
// using only this pen, so it can be shown at any frame rate, scrubbed, or shown as stills (reduced motion: see window.ts).
// No imports: the tests load the built module on its own (test/peek.test.js).
//
// Canvas: W × H = 240 × 312 logical pixels (the window's 1 : 1.3), y down. The floor line is FLOOR (y = 248); the wall is above
// it, the floor below. A standing grown-up is about 112 px tall at scale 1 (feet on y, head top near y - 112).

/** What a window story is. dur: seconds; beats: the captions (shown under the window), each from its time on. */
export interface Story {
  id: string;
  title: string;
  dur: number;
  beats: [number, string][];
  draw(p: Pen, t: number): void;
}

export type Pose = 'stand' | 'walk' | 'sit' | 'lie';
export type Hair = 'short' | 'long' | 'bun' | 'bald' | 'curly' | 'pony' | 'spiky';
export type Mouth = 'smile' | 'grin' | 'o' | 'flat' | 'sad' | 'open';
/** An arm: its angle from hanging straight down, radians, positive is forwards (towards the way the person faces) and up;
 *  bend: the elbow, extra angle for the forearm (positive bends it forwards and up). A bare number is { a, b: 0.25 }. */
export type Arm = number | { a: number; b?: number };
export interface PersonOpts {
  y?: number;          // feet (stand, walk), seat (sit: the seat top), or the mattress top (lie). Default FLOOR (sit: FLOOR - 40)
  s?: number;          // scale (1 a grown-up, about .62 a child)
  face?: 1 | -1;       // 1 faces right (+x), -1 left
  front?: boolean;     // facing the window (the viewer): both eyes, symmetric; face is then only the lean of the arms
  pose?: Pose;
  ph?: number;         // walk: the step phase, radians (stories pass t * 8 or so)
  skin?: string; shirt?: string; pants?: string; hairC?: string; hair?: Hair; shoes?: string;
  dress?: boolean;     // a skirt instead of trousers
  armL?: Arm; armR?: Arm; // the far arm (L) and the near arm (R); with front, L is the person's right (viewer's left)
  tilt?: number;       // head tilt, radians
  lean?: number;       // the body's lean, radians (positive forwards)
  mouth?: Mouth; eyes?: 'open' | 'closed' | 'wide' | 'happy';
  blush?: boolean; glasses?: boolean; beard?: boolean;
  bob?: number;        // lift the whole person (a hop, a laugh), px
}
/** Where a drawn person's hands and head ended up, to hang props on them. */
export interface Body { lh: [number, number]; rh: [number, number]; head: [number, number]; hip: [number, number] }

export type Sym = 'heart' | 'note' | 'zzz' | 'bang' | 'q' | 'spark' | 'star' | 'drop' | 'anger' | 'bulb';

export interface Pen {
  c: CanvasRenderingContext2D; W: number; H: number; FLOOR: number;
  // ── time helpers ──
  /** Piecewise interpolation through [time, value] keys (held flat before the first and after the last), eased in-out. */
  at(t: number, keys: [number, number][], ease?: (k: number) => number): number;
  /** 0 → 1 between t0 and t1 (clamped), eased in-out. */
  k(t: number, t0: number, t1: number, ease?: (k: number) => number): number;
  ease: { io: (k: number) => number; in: (k: number) => number; out: (k: number) => number; back: (k: number) => number; lin: (k: number) => number };
  lerp(a: number, b: number, k: number): number;
  clamp(v: number, a: number, b: number): number;
  /** A sine of the given period (seconds) and amplitude. */
  wave(t: number, period: number, amp?: number): number;
  /** 0..1, the same for the same seed. */
  rnd(seed: number): number;
  /** Mix two #rrggbb colours. */
  mix(a: string, b: string, k: number): string;
  // ── the room ──
  room(o?: { wall?: string; floor?: string; trim?: string; paper?: 'plain' | 'stripes' | 'dots' | 'tiles' | 'bricks' }): void;
  lamp(x: number, on?: number, color?: string): void;             // a ceiling lamp hanging from the top, with its glow (on 0..1)
  floorLamp(x: number, on?: number): void;
  light(x: number, y: number, r: number, color: string, a: number): void; // a soft glow (additive)
  dark(a: number, color?: string): void;                          // the room darker (lights off): a 0..1
  flash(a: number, color?: string): void;                         // the whole picture washed with a colour
  // ── furniture: x is the centre, standing on the floor ──
  sofa(x: number, w?: number, color?: string): void;              // seat top at FLOOR - 40
  armchair(x: number, color?: string, face?: 1 | -1): void;       // seat top at FLOOR - 40
  chair(x: number, face?: 1 | -1, color?: string): void;          // seat top at FLOOR - 40
  stool(x: number, color?: string): void;                         // seat top at FLOOR - 52
  table(x: number, w?: number, h?: number, color?: string): number; // returns the table top y
  desk(x: number, w?: number): number;                            // a desk with a drawer; returns the top y
  bed(x: number, w?: number, color?: string): number;             // returns the mattress top y (lie a person on it)
  blanket(x: number, w: number, y: number, color?: string): void; // a blanket over whoever lies at y
  tv(x: number, y: number, on?: number, glow?: string, w?: number): void; // y: the screen's centre; on a stand when y is near the floor
  laptop(x: number, y: number, on?: number, face?: 1 | -1): void; // y: the surface it stands on
  fridge(x: number, open?: number): void;                         // open 0..1 (the door swings to the left)
  counter(x: number, w?: number): number;                         // kitchen counter with cupboards; returns the top y
  stove(x: number, y: number, on?: number): void;                 // a hob on a counter top at y
  pot(x: number, y: number, steam?: number, t?: number): void;    // on the hob at y
  shelf(x: number, y: number, w?: number, items?: number): void;  // a wall shelf with books and jars
  bookcase(x: number, w?: number): void;
  plant(x: number, y?: number, s?: number): void;
  picture(x: number, y: number, w?: number, h?: number, color?: string, tilt?: number): void;
  clock(x: number, y: number, h: number): void;                   // h: the hour shown (fractions move the hands)
  door(x: number, open?: number, color?: string): void;           // open 0..1 (dark doorway behind)
  window(x: number, y: number, w?: number, h?: number, sky?: string): void; // a window in the back wall (night outside)
  rug(x: number, w?: number, color?: string): void;
  bath(x: number, w?: number): number;                            // returns the water line y
  piano(x: number): number;                                       // returns the key height y
  crib(x: number): number;                                        // returns the mattress top y
  // ── people and animals ──
  person(x: number, o?: PersonOpts): Body;
  cat(x: number, y: number, o?: { face?: 1 | -1; sit?: boolean; ph?: number; color?: string; tail?: number; sleep?: boolean; s?: number }): void;
  dog(x: number, y: number, o?: { face?: 1 | -1; sit?: boolean; ph?: number; color?: string; wag?: number; s?: number; tongue?: boolean }): void;
  fish(x: number, y: number, t: number): void;                    // a fish bowl on a surface at y, a fish going round
  bird(x: number, y: number, o?: { face?: 1 | -1; flap?: number; color?: string }): void;
  // ── props (x, y: where it stands or hangs; y is the bottom unless said) ──
  cup(x: number, y: number, steam?: number, t?: number, color?: string): void;
  glass(x: number, y: number, fill?: number, color?: string): void;
  bottle(x: number, y: number, color?: string): void;
  plate(x: number, y: number, food?: string): void;
  cake(x: number, y: number, candles?: number, lit?: number, t?: number, slice?: number): void; // slice 0..1 taken out
  gift(x: number, y: number, color?: string, open?: number): void;
  box(x: number, y: number, w: number, h: number, color?: string, open?: number): void; // a cardboard box, flaps open 0..1
  balloon(x: number, y: number, color?: string, line?: number): void; // y: the string's end
  book(x: number, y: number, open?: boolean, color?: string, rot?: number): void; // y: its centre
  phone(x: number, y: number, glow?: number, rot?: number): void;    // y: its centre
  letter(x: number, y: number, rot?: number): void;               // y: its centre
  ring(x: number, y: number, open?: number): void;                // a ring box, y: its bottom
  candle(x: number, y: number, lit?: number, t?: number): void;
  flowers(x: number, y: number, color?: string): void;            // a bunch in a vase standing at y
  paint(x: number, y: number, w: number, h: number, k: number, color?: string): void; // an easel canvas, k 0..1 painted
  umbrella(x: number, y: number, open?: number, color?: string): void; // y: the handle
  // ── signs and talk ──
  sym(kind: Sym, x: number, y: number, s?: number, a?: number, color?: string): void;
  say(x: number, y: number, text: string, o?: { think?: boolean; a?: number; tail?: 1 | -1 }): void; // a speech bubble whose tail points at (x, y)
  confetti(t: number, seed?: number, a?: number): void;           // falling over the whole picture
  rain(t: number, a?: number): void;                              // rain running down the glass, in front of everything
  text(x: number, y: number, s: string, size?: number, color?: string): void;
}

export const W = 240, H = 312, FLOOR = 248;
const C = { skin: ['#f1c9a5', '#e0ac7e', '#c68b5e', '#9b6640', '#6e4a30'], wood: '#8a5a3b', woodD: '#5e3d28', ink: '#2a2420' };

function hex(s: string): [number, number, number] { const h = s.replace('#', ''), f = h.length === 3 ? h.split('').map(c => c + c).join('') : h; return [parseInt(f.slice(0, 2), 16), parseInt(f.slice(2, 4), 16), parseInt(f.slice(4, 6), 16)]; }
function mix(a: string, b: string, k: number): string { const A = hex(a), B = hex(b), m = (i: number) => Math.round(A[i] + (B[i] - A[i]) * Math.max(0, Math.min(1, k))).toString(16).padStart(2, '0'); return '#' + m(0) + m(1) + m(2); }
const shade = (c: string, k: number) => k < 0 ? mix(c, '#000000', -k) : mix(c, '#ffffff', k);

/** The pen for one canvas context drawn at W × H (the caller scales for the device pixel ratio). */
export function makePen(c: CanvasRenderingContext2D): Pen {
  const io = (k: number) => k < .5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
  const ease = { io, in: (k: number) => k * k, out: (k: number) => 1 - (1 - k) * (1 - k), lin: (k: number) => k, back: (k: number) => { const s = 1.70158; return 1 + (s + 1) * (k - 1) ** 3 + s * (k - 1) ** 2; } };
  const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
  const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
  const k = (t: number, t0: number, t1: number, e = io) => e(clamp((t - t0) / ((t1 - t0) || 1e-6), 0, 1));
  const at = (t: number, keys: [number, number][], e = io) => { if (!keys.length) return 0; if (t <= keys[0][0]) return keys[0][1];
    for (let i = 1; i < keys.length; i++) if (t <= keys[i][0]) return lerp(keys[i - 1][1], keys[i][1], k(t, keys[i - 1][0], keys[i][0], e)); return keys[keys.length - 1][1]; };
  const wave = (t: number, p: number, a = 1) => Math.sin(t / p * Math.PI * 2) * a;
  const rnd = (s: number) => { const x = Math.sin(s * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

  // ── primitives ──
  const fill = (col: string) => { c.fillStyle = col; c.fill(); };
  const rr = (x: number, y: number, w: number, h: number, r: number, col?: string) => { c.beginPath(); const R = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2); c.roundRect ? c.roundRect(x, y, w, h, R) : c.rect(x, y, w, h); if (col) fill(col); };
  const rect = (x: number, y: number, w: number, h: number, col: string) => { c.fillStyle = col; c.fillRect(x, y, w, h); };
  const circ = (x: number, y: number, r: number, col: string) => { c.beginPath(); c.arc(x, y, Math.max(0, r), 0, Math.PI * 2); fill(col); };
  const ell = (x: number, y: number, rx: number, ry: number, col: string, rot = 0) => { c.beginPath(); c.ellipse(x, y, Math.max(0, rx), Math.max(0, ry), rot, 0, Math.PI * 2); fill(col); };
  const line = (x0: number, y0: number, x1: number, y1: number, w: number, col: string) => { c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.lineWidth = w; c.strokeStyle = col; c.lineCap = 'round'; c.stroke(); };
  const poly = (P: number[], col: string) => { c.beginPath(); c.moveTo(P[0], P[1]); for (let i = 2; i < P.length; i += 2) c.lineTo(P[i], P[i + 1]); c.closePath(); fill(col); };
  const shadow = (x: number, w: number, y = FLOOR) => ell(x, y + 2, w / 2, 3, 'rgba(0,0,0,.18)');
  const armOf = (a: Arm | undefined, d: number) => a == null ? { a: d, b: .25 } : typeof a === 'number' ? { a, b: .25 } : { a: a.a, b: a.b ?? .25 };

  const P: Pen = {
    c, W, H, FLOOR, at, k, ease, lerp, clamp, wave, rnd, mix,

    room(o = {}) { const wall = o.wall || '#e9d3b0', fl = o.floor || '#9a6a45', trim = o.trim || shade(wall, -.25);
      rect(0, 0, W, FLOOR, wall); const pp = o.paper || 'plain';
      if (pp === 'stripes') for (let x = 6; x < W; x += 22) rect(x, 0, 8, FLOOR, shade(wall, -.05));
      else if (pp === 'dots') for (let y = 12; y < FLOOR - 20; y += 20) for (let x = (y / 20 % 2) * 10 + 8; x < W; x += 20) circ(x, y, 1.6, shade(wall, -.09));
      else if (pp === 'tiles') { for (let y = 0; y < FLOOR; y += 16) line(0, y, W, y, 1, shade(wall, -.08)); for (let x = 0; x < W; x += 16) line(x, 0, x, FLOOR, 1, shade(wall, -.08)); }
      else if (pp === 'bricks') for (let y = 0, r = 0; y < FLOOR; y += 12, r++) { line(0, y, W, y, 1, shade(wall, -.12)); for (let x = (r % 2) * 14; x < W; x += 28) line(x, y, x, y + 12, 1, shade(wall, -.12)); }
      const g = c.createLinearGradient(0, 0, 0, FLOOR); g.addColorStop(0, 'rgba(0,0,0,.18)'); g.addColorStop(.5, 'rgba(0,0,0,0)'); c.fillStyle = g; c.fillRect(0, 0, W, FLOOR);
      rect(0, FLOOR, W, H - FLOOR, fl); for (let y = FLOOR + 9, i = 0; y < H; y += 11 + i * 2, i++) line(0, y, W, y, 1, shade(fl, -.12));
      const g2 = c.createLinearGradient(0, FLOOR, 0, H); g2.addColorStop(0, 'rgba(0,0,0,.25)'); g2.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g2; c.fillRect(0, FLOOR, W, H - FLOOR);
      rect(0, FLOOR - 7, W, 7, trim); rect(0, FLOOR - 7, W, 1.5, shade(trim, .2)); },
    light(x, y, r, col, a) { if (a <= 0) return; const [R, G, B] = hex(col), g = c.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, `rgba(${R},${G},${B},${a})`); g.addColorStop(1, `rgba(${R},${G},${B},0)`);
      c.save(); c.globalCompositeOperation = 'lighter'; c.fillStyle = g; c.fillRect(x - r, y - r, r * 2, r * 2); c.restore(); },
    lamp(x, on = 1, col = '#ffd890') { line(x, 0, x, 34, 1.2, '#3a3330'); poly([x - 14, 48, x + 14, 48, x + 7, 33, x - 7, 33], mix('#6b5a4a', col, on * .5)); ell(x, 48, 14, 2.5, mix('#4a3f36', col, on)); if (on > 0) P.light(x, 70, 120, col, .22 * on); },
    floorLamp(x, on = 1) { line(x, FLOOR, x, FLOOR - 100, 2.5, '#3a3330'); ell(x, FLOOR, 12, 3, '#3a3330'); poly([x - 13, FLOOR - 98, x + 13, FLOOR - 98, x + 8, FLOOR - 122, x - 8, FLOOR - 122], mix('#cdb89a', '#ffe9b8', on)); if (on > 0) P.light(x, FLOOR - 105, 90, '#ffd890', .3 * on); },
    dark(a, col = '#0b0e1c') { if (a <= 0) return; c.save(); c.globalAlpha = clamp(a, 0, 1); c.fillStyle = col; c.fillRect(0, 0, W, H); c.restore(); },
    flash(a, col = '#ffffff') { if (a <= 0) return; c.save(); c.globalAlpha = clamp(a, 0, 1); c.fillStyle = col; c.fillRect(0, 0, W, H); c.restore(); },

    sofa(x, w = 110, col = '#6d7fa3') { shadow(x, w + 6); rr(x - w / 2, FLOOR - 78, w, 44, 10, shade(col, -.12)); rr(x - w / 2 + 8, FLOOR - 50, w - 16, 14, 5, col);
      for (let i = 0; i < 2; i++) rr(x - w / 2 + 8 + i * (w - 16) / 2 + 1, FLOOR - 52, (w - 16) / 2 - 2, 13, 5, shade(col, .06));
      rr(x - w / 2 - 4, FLOOR - 58, 14, 40, 6, shade(col, -.05)); rr(x + w / 2 - 10, FLOOR - 58, 14, 40, 6, shade(col, -.05)); rr(x - w / 2 + 2, FLOOR - 38, w - 4, 30, 6, shade(col, -.2)); rect(x - w / 2 + 4, FLOOR - 8, 4, 8, C.woodD); rect(x + w / 2 - 8, FLOOR - 8, 4, 8, C.woodD); },
    armchair(x, col = '#a5674f', face = 1) { shadow(x, 60); rr(x - 26 - face * 4, FLOOR - 82, 18, 60, 8, shade(col, -.12)); if (face < 0) { rr(x + 12, FLOOR - 82, 18, 60, 8, shade(col, -.12)); }
      rr(x - 24, FLOOR - 52, 48, 14, 6, col); rr(x - 30, FLOOR - 60, 12, 40, 6, shade(col, -.05)); rr(x + 18, FLOOR - 60, 12, 40, 6, shade(col, -.05)); rr(x - 28, FLOOR - 40, 56, 32, 6, shade(col, -.2)); rect(x - 24, FLOOR - 8, 4, 8, C.woodD); rect(x + 20, FLOOR - 8, 4, 8, C.woodD); },
    chair(x, face = 1, col = C.wood) { shadow(x, 34); const bx = x - face * 15; rect(bx - 2, FLOOR - 88, 4, 88, shade(col, -.15)); rr(bx - 3, FLOOR - 88, 6, 30, 2, shade(col, -.1)); rect(x - 16, FLOOR - 42, 32, 5, col); rect(x - 15, FLOOR - 37, 3, 37, shade(col, -.2)); rect(x + 12, FLOOR - 37, 3, 37, shade(col, -.2)); },
    stool(x, col = '#7c8a96') { shadow(x, 28); ell(x, FLOOR - 52, 14, 4, col); line(x - 9, FLOOR - 50, x - 13, FLOOR, 3, shade(col, -.3)); line(x + 9, FLOOR - 50, x + 13, FLOOR, 3, shade(col, -.3)); line(x - 11, FLOOR - 20, x + 11, FLOOR - 20, 2, shade(col, -.3)); },
    table(x, w = 90, h = 62, col = C.wood) { shadow(x, w); const y = FLOOR - h; rect(x - w / 2, y, w, 6, col); rect(x - w / 2, y + 6, w, 2, shade(col, -.3)); rect(x - w / 2 + 5, y + 6, 5, h - 6, shade(col, -.2)); rect(x + w / 2 - 10, y + 6, 5, h - 6, shade(col, -.2)); return y; },
    desk(x, w = 96) { const y = P.table(x, w, 64, '#b08a63'); rect(x + w / 2 - 40, y + 8, 30, 22, '#9b7752'); rect(x + w / 2 - 29, y + 18, 8, 2, '#5e4630'); return y; },
    bed(x, w = 130, col = '#8fa7c9') { shadow(x, w + 8); const y = FLOOR - 40; rr(x - w / 2 - 6, FLOOR - 84, 10, 84, 3, C.woodD); rect(x - w / 2, FLOOR - 26, w, 18, C.wood); rr(x - w / 2, y, w, 16, 5, '#f3ede2');
      rr(x - w / 2 + 4, y - 9, 30, 12, 6, '#fffaf0'); rect(x + w / 2 - 4, FLOOR - 52, 6, 52, C.woodD); rect(x - w / 2 + 2, FLOOR - 8, 4, 8, C.woodD); rect(x + w / 2 - 6, FLOOR - 8, 4, 8, C.woodD);
      rr(x - w / 2 + 38, y - 1, w - 40, 19, 4, col); line(x - w / 2 + 38, y + 3, x + w / 2 - 2, y + 3, 1.5, shade(col, -.15)); return y; }, // the duvet over the foot end (col)
    blanket(x, w, y, col = '#8fa7c9') { c.beginPath(); c.moveTo(x - w / 2, y + 16); c.bezierCurveTo(x - w / 2, y - 14, x + w / 2, y - 10, x + w / 2, y + 2); c.lineTo(x + w / 2, y + 20); c.lineTo(x - w / 2, y + 20); c.closePath(); fill(col);
      for (let i = 1; i < 4; i++) line(x - w / 2 + i * w / 4, y - 4, x - w / 2 + i * w / 4 + 4, y + 18, 1, shade(col, -.12)); },
    tv(x, y, on = 1, glow = '#8fb8ff', w = 66) { const h = w * .6; if (y > FLOOR - 70) { rect(x - w * .45, FLOOR - 30, w * .9, 30, C.woodD); y = FLOOR - 30 - h / 2 - 4; line(x, y + h / 2, x, FLOOR - 30, 4, '#222'); }
      rr(x - w / 2 - 3, y - h / 2 - 3, w + 6, h + 6, 3, '#1b1d22'); rect(x - w / 2, y - h / 2, w, h, mix('#14171e', glow, on * .75));
      if (on > 0) { c.save(); c.globalAlpha = on * .25; for (let i = 0; i < 5; i++) rect(x - w / 2, y - h / 2 + i * h / 5 + 2, w, 1, '#ffffff'); c.restore(); P.light(x, y + 10, 110, glow, .18 * on); } },
    laptop(x, y, on = 1, face = 1) { poly([x - 16, y, x + 16, y, x + 13, y - 3, x - 13, y - 3], '#9aa1ab'); const sx = x - face * 12; poly([sx, y - 3, sx + face * 4, y - 26, sx + face * 28, y - 26, sx + face * 24, y - 3], '#5d636d'); poly([sx + face * 2, y - 5, sx + face * 5.5, y - 24, sx + face * 26, y - 24, sx + face * 22.5, y - 5], mix('#20242b', '#bfe0ff', on * .8)); if (on) P.light(sx + face * 14, y - 14, 50, '#bfe0ff', .2 * on); },
    fridge(x, open = 0) { shadow(x, 54); rr(x - 26, FLOOR - 150, 52, 150, 5, '#e8ecef'); line(x - 26, FLOOR - 100, x + 26, FLOOR - 100, 1.5, '#b9c0c6');
      if (open > 0) { rect(x - 24, FLOOR - 98, 48, 96, '#fdf6d8'); P.light(x, FLOOR - 50, 70, '#fff4c4', .4 * open); for (const yy of [FLOOR - 70, FLOOR - 40]) rect(x - 24, yy, 48, 2, '#cfd5d9');
        circ(x - 10, FLOOR - 76, 6, '#e05a47'); rect(x + 4, FLOOR - 88, 9, 18, '#f4f4f4'); rr(x - 14, FLOOR - 52, 22, 12, 3, '#7fc26b'); rect(x + 10, FLOOR - 56, 8, 16, '#d2a24c');
        const dw = 52 * open; poly([x - 26, FLOOR - 100, x - 26 - dw * .55, FLOOR - 104, x - 26 - dw * .55, FLOOR + 2, x - 26, FLOOR], '#d4d9dd'); }
      else line(x + 20, FLOOR - 90, x + 20, FLOOR - 60, 3, '#aab2b9'); line(x + 20, FLOOR - 140, x + 20, FLOOR - 110, 3, '#aab2b9'); },
    counter(x, w = 110) { const y = FLOOR - 66; rect(x - w / 2, y + 6, w, 60, '#c9b79a'); rect(x - w / 2 - 3, y, w + 6, 7, '#7d746a'); for (let i = 0; i < Math.floor(w / 36); i++) { const cx = x - w / 2 + 4 + i * (w - 8) / Math.floor(w / 36); rect(cx, y + 12, (w - 8) / Math.floor(w / 36) - 4, 48, '#d8c8ac'); rect(cx + 6, y + 18, 10, 2, '#7d746a'); } return y; },
    stove(x, y, on = 0) { rect(x - 22, y - 2, 44, 3, '#2b2b2e'); for (const d of [-11, 11]) { ell(x + d, y - 2, 8, 2, on > 0 ? mix('#444', '#ff5a2a', on) : '#444'); if (on > 0) P.light(x + d, y - 2, 18, '#ff6a30', .3 * on); } },
    pot(x, y, steam = 0, t = 0) { rr(x - 13, y - 18, 26, 18, 3, '#9aa3ad'); rect(x - 15, y - 19, 30, 3, '#b8c0c8'); line(x - 18, y - 14, x - 13, y - 14, 3, '#333'); line(x + 13, y - 14, x + 18, y - 14, 3, '#333');
      if (steam > 0) for (let i = 0; i < 3; i++) { const ph = (t * .7 + i / 3) % 1; c.save(); c.globalAlpha = steam * (1 - ph) * .7; circ(x - 6 + i * 6 + Math.sin(ph * 6 + i) * 3, y - 24 - ph * 30, 3 + ph * 5, '#ffffff'); c.restore(); } },
    shelf(x, y, w = 70, n = 6) { rect(x - w / 2, y, w, 4, C.woodD); let bx = x - w / 2 + 3; for (let i = 0; i < n && bx < x + w / 2 - 6; i++) { const r = rnd(i + x), bw = 5 + r * 5, bh = 14 + r * 10; if (i % 4 === 3) { rr(bx, y - 14, 10, 14, 3, '#cfe3e8'); bx += 13; continue; } rect(bx, y - bh, bw, bh, ['#b44a3e', '#3e6db4', '#d6a640', '#5c8a4d', '#7a4f8f'][i % 5]); bx += bw + 1; } },
    bookcase(x, w = 64) { shadow(x, w); rect(x - w / 2, FLOOR - 150, w, 150, C.woodD); for (let i = 0; i < 4; i++) { rect(x - w / 2 + 4, FLOOR - 146 + i * 36, w - 8, 32, '#3d2a1d'); P.shelf(x, FLOOR - 146 + i * 36 + 32, w - 8, 8); } },
    plant(x, y = FLOOR, s = 1) { rr(x - 10 * s, y - 20 * s, 20 * s, 20 * s, 3, '#b8643e'); for (let i = 0; i < 6; i++) { const a = -Math.PI / 2 + (i - 2.5) * .45; ell(x + Math.cos(a) * 14 * s, y - 22 * s + Math.sin(a) * 16 * s, 10 * s, 4 * s, i % 2 ? '#4f8a4a' : '#3f7a3c', a); } },
    picture(x, y, w = 40, h = 30, col = '#7fa6c4', tilt = 0) { c.save(); c.translate(x, y); c.rotate(tilt); rect(-w / 2 - 3, -h / 2 - 3, w + 6, h + 6, '#6b4a30'); rect(-w / 2, -h / 2, w, h, col); poly([-w / 2, h / 2, -w / 6, 0, w / 8, h / 4, w / 3, -h / 6, w / 2, h / 2], shade(col, -.3)); circ(w / 4, -h / 4, 4, '#f3e3a0'); c.restore(); },
    clock(x, y, hr) { circ(x, y, 13, '#5a4637'); circ(x, y, 11, '#f6efe1'); const a = (hr % 12) / 12 * Math.PI * 2, m = (hr % 1) * Math.PI * 2; line(x, y, x + Math.sin(a) * 6, y - Math.cos(a) * 6, 2, '#222'); line(x, y, x + Math.sin(m) * 9, y - Math.cos(m) * 9, 1.2, '#222'); },
    door(x, open = 0, col = '#a77b54') { rect(x - 24, FLOOR - 140, 48, 140, shade(col, -.35)); if (open > 0) { rect(x - 21, FLOOR - 137, 42, 137, '#1d1a22'); poly([x - 21, FLOOR - 137, x - 21 + 42 * (1 - open * .8), FLOOR - 141, x - 21 + 42 * (1 - open * .8), FLOOR + 3, x - 21, FLOOR], col); }
      else { rect(x - 21, FLOOR - 137, 42, 137, col); rr(x - 15, FLOOR - 128, 30, 50, 2, shade(col, -.08)); rr(x - 15, FLOOR - 70, 30, 56, 2, shade(col, -.08)); circ(x + 14, FLOOR - 66, 2.5, '#e6c46a'); } },
    window(x, y, w = 56, h = 64, sky = '#1b2440') { rect(x - w / 2 - 4, y - h / 2 - 4, w + 8, h + 8, '#efe9de'); const g = c.createLinearGradient(0, y - h / 2, 0, y + h / 2); g.addColorStop(0, sky); g.addColorStop(1, shade(sky, .15)); c.fillStyle = g; c.fillRect(x - w / 2, y - h / 2, w, h);
      for (let i = 0; i < 5; i++) circ(x - w / 2 + rnd(i * 3 + x) * w, y - h / 2 + rnd(i * 7 + y) * h * .6, .9, '#ffffff'); line(x, y - h / 2, x, y + h / 2, 3, '#efe9de'); line(x - w / 2, y, x + w / 2, y, 3, '#efe9de'); rect(x - w / 2 - 6, y + h / 2 + 4, w + 12, 4, '#d9d0c2'); },
    rug(x, w = 120, col = '#b0503f') { ell(x, FLOOR + 22, w / 2, 11, col); ell(x, FLOOR + 22, w / 2 - 8, 7, shade(col, .15)); },
    bath(x, w = 120) { const y = FLOOR - 56; rr(x - w / 2, y, w, 50, 22, '#f2f4f6'); rect(x - w / 2 + 10, FLOOR - 8, 8, 8, '#c9a64a'); rect(x + w / 2 - 18, FLOOR - 8, 8, 8, '#c9a64a'); line(x + w / 2 - 6, y, x + w / 2 - 6, y - 30, 3, '#c0c6cc'); line(x + w / 2 - 6, y - 30, x + w / 2 - 18, y - 30, 3, '#c0c6cc'); return y + 6; },
    piano(x) { shadow(x, 100); rect(x - 50, FLOOR - 120, 100, 120, '#2a2020'); rect(x - 46, FLOOR - 70, 92, 8, '#f8f4ea'); for (let i = 0; i < 13; i++) rect(x - 44 + i * 7.2, FLOOR - 70, 3.5, 5, '#1a1414'); rect(x - 50, FLOOR - 62, 100, 6, '#3a2c2c'); return FLOOR - 70; },
    crib(x) { const y = FLOOR - 50; rect(x - 40, y + 14, 80, 6, '#f1e4cf'); for (let i = 0; i <= 10; i++) line(x - 40 + i * 8, FLOOR - 82, x - 40 + i * 8, FLOOR - 6, 2.5, '#efe6d6'); line(x - 42, FLOOR - 82, x + 42, FLOOR - 82, 4, '#efe6d6'); line(x - 42, FLOOR - 26, x + 42, FLOOR - 26, 4, '#efe6d6'); rect(x - 42, FLOOR - 26, 4, 26, '#d8ccb8'); rect(x + 38, FLOOR - 26, 4, 26, '#d8ccb8'); return y + 14; },

    person(x, o = {}) {
      const s = o.s ?? 1, f = o.face ?? 1, pose = o.pose || 'stand', fr = !!o.front, skin = o.skin || C.skin[1], shirt = o.shirt || '#4f7cac', pants = o.pants || '#3b3f4a', hairC = o.hairC || '#3b2a1e', shoes = o.shoes || '#26211e';
      const base = o.y ?? (pose === 'sit' ? FLOOR - 40 : pose === 'lie' ? FLOOR - 40 : FLOOR);
      c.save();
      if (pose === 'lie') { c.translate(x, base); c.rotate(-f * Math.PI / 2); c.translate(-x, -base); }
      c.translate(x, base - (o.bob || 0)); c.scale(s, s); c.translate(-x, -base); // scaled about the feet (the seat when sitting)
      const step = pose === 'walk' ? Math.sin(o.ph || 0) : 0, lean = o.lean || 0;
      const hy = pose === 'sit' ? base - 2 : base - 50, shY = hy - 40, hx = x;
      // legs
      if (pose !== 'sit') shadow(x, 30, base);
      const leg = (dx: number, sw: number, col: string) => {
        if (pose === 'sit') { const kx = hx + f * 26, ky = hy + 2; line(hx + dx, hy, kx + dx * .4, ky, 11, col); line(kx + dx * .4, ky, kx + dx * .4 + f * 2, ky + 36, 10, col); rr(kx + dx * .4 - 4 + f * 4, ky + 34, 14 * f, 6, 3, shoes); return; }
        const fx = hx + dx + Math.sin(sw) * 16 * (fr ? .2 : 1), fy = base - 3; line(hx + dx, hy, fx, fy, 11, col); rr(fx - (fr ? 6 : f < 0 ? 10 : 2), fy - 2, fr ? 12 : 12, 6, 3, shoes); };
      const sideW = fr ? 7 : 3;
      if (o.dress) { leg(-sideW, -step * .6, skin); leg(sideW, step * .6, skin); }
      else { leg(-sideW, -step * .6, shade(pants, -.1)); leg(sideW, step * .6, pants); }
      // the body: a little leaned
      c.save(); c.translate(hx, hy); c.rotate(f * lean); c.translate(-hx, -hy);
      const bw = fr ? 34 : 26;
      const arm = (side: number, A: { a: number; b: number }, near: boolean) => {
        const sx = hx + (fr ? side * (bw / 2 - 2) : side * 3 - f * 1), sy = shY + 6, dir = fr ? side : f, a = A.a, ux = sx + Math.sin(a) * 20 * dir, uy = sy + Math.cos(a) * 20, b = a + A.b, hxx = ux + Math.sin(b) * 19 * dir, hyy = uy + Math.cos(b) * 19;
        const col = near ? shirt : shade(shirt, -.15); line(sx, sy, ux, uy, 9, col); line(ux, uy, hxx, hyy, 8, col); circ(hxx, hyy, 4.2, skin); return [hxx, hyy] as [number, number]; };
      const AL = armOf(o.armL, .08), AR = armOf(o.armR, .08);
      // far arm behind the body for a side view: drawn first; when front, both drawn after
      let lh: [number, number] = [0, 0], rh: [number, number] = [0, 0];
      if (!fr) lh = arm(-1, AL, false);
      if (o.dress) poly([hx - bw / 2 - 6, hy + (pose === 'sit' ? 6 : 26), hx + bw / 2 + 6, hy + (pose === 'sit' ? 6 : 26), hx + bw / 2, shY + 6, hx - bw / 2, shY + 6], shirt);
      rr(hx - bw / 2, shY, bw, hy - shY + 4, 9, shirt);
      // head
      const hr = 15, hcx = hx + (fr ? 0 : f * 2), hcy = shY - hr + 1;
      c.save(); c.translate(hcx, hcy + hr); c.rotate(o.tilt || 0); c.translate(-hcx, -(hcy + hr));
      rect(hcx - 4, shY - 6, 8, 8, shade(skin, -.08));
      const hs = o.hair || 'short';
      if (hs === 'long') rr(hcx - hr - 2 - (fr ? 0 : f * 3), hcy - hr, hr * 2 + 4, hr * 2 + 14, 8, hairC);
      if (hs === 'pony' && !fr) ell(hcx - f * 17, hcy + 4, 6, 11, hairC, -f * .4);
      circ(hcx, hcy, hr, skin);
      // the face
      const ex = fr ? 0 : f * 6, eye = (dx: number) => { const X = hcx + ex + dx, Y = hcy - 1; const e = o.eyes || 'open';
        if (e === 'closed') line(X - 2.5, Y, X + 2.5, Y, 1.4, C.ink); else if (e === 'happy') { c.beginPath(); c.arc(X, Y + 1.5, 2.6, Math.PI * 1.1, Math.PI * 1.9); c.lineWidth = 1.4; c.strokeStyle = C.ink; c.stroke(); }
        else circ(X, Y, e === 'wide' ? 2.6 : 1.8, C.ink); };
      if (fr) { eye(-5.5); eye(5.5); } else eye(0);
      if (o.glasses) { c.lineWidth = 1.2; c.strokeStyle = '#222'; c.beginPath(); if (fr) { c.arc(hcx - 5.5, hcy - 1, 4.2, 0, Math.PI * 2); c.moveTo(hcx + 9.7, hcy - 1); c.arc(hcx + 5.5, hcy - 1, 4.2, 0, Math.PI * 2); } else c.arc(hcx + ex, hcy - 1, 4.2, 0, Math.PI * 2); c.stroke(); }
      if (o.blush) { c.save(); c.globalAlpha = .5; if (fr) { circ(hcx - 9, hcy + 4, 3, '#ff7f8a'); circ(hcx + 9, hcy + 4, 3, '#ff7f8a'); } else circ(hcx + ex - f * 2, hcy + 5, 3, '#ff7f8a'); c.restore(); }
      const mx = hcx + (fr ? 0 : f * 7), my = hcy + 7, m = o.mouth || 'smile';
      c.lineWidth = 1.4; c.strokeStyle = C.ink; c.beginPath();
      if (m === 'smile') { c.arc(mx, my - 2.5, 3.6, Math.PI * .2, Math.PI * .8); c.stroke(); }
      else if (m === 'grin') { c.arc(mx, my - 2, 4.2, 0, Math.PI); c.closePath(); fill('#5a2a2a'); }
      else if (m === 'sad') { c.arc(mx, my + 2.5, 3.4, Math.PI * 1.2, Math.PI * 1.8); c.stroke(); }
      else if (m === 'o') { circ(mx, my, 2.4, '#5a2a2a'); }
      else if (m === 'open') { ell(mx, my, 3.5, 3, '#5a2a2a'); }
      else { c.moveTo(mx - 3, my); c.lineTo(mx + 3, my); c.stroke(); }
      if (o.beard) { c.beginPath(); c.arc(hcx + (fr ? 0 : f * 3), hcy + 3, hr - 1, Math.PI * .1, Math.PI * .9); c.closePath(); fill(hairC); if (m !== 'flat') { c.beginPath(); c.arc(mx, my - 1, 2.6, 0, Math.PI); fill('#5a2a2a'); } }
      // hair on top
      const top = () => { c.beginPath(); c.arc(hcx, hcy, hr + 1.5, Math.PI * (fr ? 1.02 : f > 0 ? 1.0 : 1.05), Math.PI * (fr ? 1.98 : f > 0 ? 1.95 : 2.0)); c.closePath(); fill(hairC); };
      if (hs === 'short' || hs === 'long' || hs === 'pony') { top(); if (!fr) ell(hcx - f * 9, hcy - 2, 7, 9, hairC); }
      else if (hs === 'bun') { top(); circ(hcx - (fr ? 0 : f * 6), hcy - hr - 4, 7, hairC); }
      else if (hs === 'curly') for (let i = 0; i < 9; i++) { const a = Math.PI * (1.0 + i / 8); circ(hcx + Math.cos(a) * hr - (fr ? 0 : f * 2), hcy + Math.sin(a) * hr * .95, 6, hairC); }
      else if (hs === 'spiky') { c.beginPath(); for (let i = 0; i <= 8; i++) { const a = Math.PI * (1 + i / 8), r = i % 2 ? hr + 8 : hr + 1; c.lineTo(hcx + Math.cos(a) * r, hcy + Math.sin(a) * r); } c.closePath(); fill(hairC); }
      c.restore();
      const head: [number, number] = [hcx, hcy];
      if (fr) { lh = arm(-1, AL, true); rh = arm(1, AR, true); } else rh = arm(1, AR, true);
      c.restore(); // lean
      c.restore();
      // where things ended up, in canvas space (undo the scale about x and the lean roughly: good enough to hang props on)
      const tf = (p: [number, number]): [number, number] => { let [px, py] = p; if (lean) { const dx = px - hx, dy = py - hy, cs = Math.cos(f * lean), sn = Math.sin(f * lean); px = hx + dx * cs - dy * sn; py = hy + dx * sn + dy * cs; }
        px = x + (px - x) * s; py = base + (py - base) * s - (o.bob || 0); if (pose === 'lie') { const dx = px - x, dy = py - base, a = -f * Math.PI / 2; return [x + dx * Math.cos(a) - dy * Math.sin(a), base + dx * Math.sin(a) + dy * Math.cos(a)]; } return [px, py]; };
      return { lh: tf(lh), rh: tf(rh), head: tf(head), hip: tf([hx, hy]) };
    },

    cat(x, y, o = {}) { const f = o.face ?? 1, col = o.color || '#3a3a3f', s = o.s ?? 1, tl = o.tail ?? 0; c.save(); c.translate(x, y); c.scale(f * s, s);
      if (o.sleep) { ell(0, -8, 18, 9, col); circ(12, -9, 7, col); poly([8, -14, 10, -20, 14, -15], col); poly([14, -14, 17, -19, 18, -12], col); c.beginPath(); c.moveTo(-16, -4); c.quadraticCurveTo(-22, 2, -6, 0); c.lineWidth = 4; c.strokeStyle = col; c.stroke(); c.restore(); return; }
      c.beginPath(); c.moveTo(-12, -10); c.quadraticCurveTo(-26, -20 - tl * 8, -22 + Math.sin(tl * 3) * 4, -34); c.lineWidth = 4; c.strokeStyle = col; c.lineCap = 'round'; c.stroke();
      if (o.sit) { ell(-2, -14, 11, 14, col); } else { ell(0, -14, 16, 8, col); const st = Math.sin(o.ph || 0) * 4; for (const d of [-10, -5, 6, 11]) line(d, -10, d + (d % 2 ? st : -st), 0, 3.5, col); }
      circ(12, o.sit ? -28 : -22, 8, col); poly([6, o.sit ? -33 : -27, 8, o.sit ? -41 : -35, 12, o.sit ? -35 : -29], col); poly([13, o.sit ? -35 : -29, 17, o.sit ? -41 : -35, 18, o.sit ? -32 : -26], col);
      circ(15, o.sit ? -29 : -23, 1.4, '#c8e86a'); c.restore(); },
    dog(x, y, o = {}) { const f = o.face ?? 1, col = o.color || '#b07a45', s = o.s ?? 1, wg = o.wag ?? 0; c.save(); c.translate(x, y); c.scale(f * s, s);
      line(-18, -22, -26 + Math.sin(wg) * 4, -34, 4, col);
      if (o.sit) { ell(-6, -18, 14, 16, col); line(4, -6, 6, 0, 5, col); } else { ell(0, -20, 20, 10, col); const st = Math.sin(o.ph || 0) * 5; for (const d of [-13, -7, 8, 14]) line(d, -14, d + (d % 2 ? st : -st), 0, 5, col); }
      circ(16, o.sit ? -36 : -28, 9, col); ell(24, o.sit ? -33 : -25, 6, 4, shade(col, .1)); circ(28, o.sit ? -35 : -27, 2, '#222'); ell(11, o.sit ? -36 : -28, 4, 8, shade(col, -.3), .3);
      circ(18, o.sit ? -39 : -31, 1.5, '#222'); if (o.tongue) ell(24, o.sit ? -28 : -20, 2, 4, '#e56b7a'); c.restore(); },
    fish(x, y, t) { c.save(); c.globalAlpha = .85; circ(x, y - 14, 15, '#bfe4f2'); c.restore(); rect(x - 15, y - 2, 30, 2, '#9ab'); const a = t * 1.6, fx = x + Math.cos(a) * 7, fy = y - 15 + Math.sin(a * 1.3) * 3, d = Math.sin(a) > 0 ? -1 : 1; ell(fx, fy, 4, 2.5, '#ff8a2a'); poly([fx - d * 4, fy, fx - d * 8, fy - 3, fx - d * 8, fy + 3], '#ff8a2a'); },
    bird(x, y, o = {}) { const f = o.face ?? 1, col = o.color || '#f2c94c', fl = o.flap ?? 0; c.save(); c.translate(x, y); c.scale(f, 1); ell(0, -6, 7, 5, col); circ(6, -10, 4, col); poly([9, -11, 13, -10, 9, -9], '#e08a2a'); circ(7, -11, .9, '#222'); ell(-2, -7 - Math.sin(fl) * 4, 6, 2.5, shade(col, -.15), -.3 - Math.sin(fl) * .6); c.restore(); },

    cup(x, y, steam = 0, t = 0, col = '#f4efe6') { rr(x - 5, y - 9, 10, 9, 2, col); c.beginPath(); c.arc(x + 6, y - 5, 3, -Math.PI / 2, Math.PI / 2); c.lineWidth = 1.6; c.strokeStyle = col; c.stroke();
      if (steam > 0) for (let i = 0; i < 2; i++) { const ph = (t * .6 + i / 2) % 1; c.save(); c.globalAlpha = steam * (1 - ph) * .6; c.beginPath(); c.moveTo(x - 2 + i * 4, y - 11); c.quadraticCurveTo(x + 3 + i * 4 - ph * 4, y - 15 - ph * 8, x - 1 + i * 4, y - 20 - ph * 12); c.lineWidth = 1.5; c.strokeStyle = '#fff'; c.stroke(); c.restore(); } },
    glass(x, y, fl = .7, col = '#c2384a') { c.save(); c.globalAlpha = .5; rect(x - 4, y - 14, 8, 14, '#e6f2f8'); c.restore(); if (fl > 0) rect(x - 3.5, y - 14 * fl, 7, 14 * fl, col); line(x - 4, y - 14, x - 4, y, .8, '#cfe'); line(x + 4, y - 14, x + 4, y, .8, '#cfe'); },
    bottle(x, y, col = '#3f6e3a') { rr(x - 5, y - 22, 10, 22, 3, col); rect(x - 2, y - 32, 4, 11, col); rect(x - 5, y - 15, 10, 7, '#efe2c4'); },
    plate(x, y, food) { ell(x, y - 1, 13, 3, '#f7f4ee'); if (food) ell(x, y - 4, 7, 3.5, food); },
    cake(x, y, n = 3, lit = 1, t = 0, sl = 0) { rr(x - 22, y - 26, 44, 26, 4, '#f6d7e3'); rect(x - 22, y - 26, 44, 6, '#fff4f8'); for (let i = 0; i < 5; i++) circ(x - 18 + i * 9, y - 20, 2, '#e8577a'); if (sl > 0) poly([x, y - 26, x + 22, y - 26, x + 22, y, x, y].map((v, i) => i % 2 ? v : x + (v - x) * sl), '#5e3b2c');
      for (let i = 0; i < n; i++) { const cx = x - (n - 1) * 5 + i * 10; P.candle(cx, y - 26, lit, t + i); } },
    gift(x, y, col = '#d94f5c', open = 0) { rect(x - 13, y - 20, 26, 20, col); rect(x - 2, y - 20, 4, 20, '#f7d35c'); c.save(); c.translate(x - 15, y - 20); c.rotate(-open * 1.2); rect(0, -6, 30, 6, shade(col, .1)); rect(13, -6, 4, 6, '#f7d35c'); if (open < .5) { ell(11, -9, 5, 3, '#f7d35c', -.5); ell(19, -9, 5, 3, '#f7d35c', .5); } c.restore(); },
    box(x, y, w, h, col = '#c69a62', open = 0) { rect(x - w / 2, y - h, w, h, col); line(x - w / 2, y - h * .55, x + w / 2, y - h * .55, 1, shade(col, -.15)); rect(x - w / 2, y - h, w, 5, shade(col, -.1));
      if (open > 0) { poly([x - w / 2, y - h, x - w / 2 - w * .3 * open, y - h - w * .25 * open, x - w * .1, y - h - w * .3 * open, x, y - h], shade(col, .1)); poly([x + w / 2, y - h, x + w / 2 + w * .3 * open, y - h - w * .25 * open, x + w * .1, y - h - w * .3 * open, x, y - h], shade(col, .05)); } },
    balloon(x, y, col = '#e8456b', ln = 40) { c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x + 5, y - ln / 2, x, y - ln); c.lineWidth = .8; c.strokeStyle = '#555'; c.stroke(); ell(x, y - ln - 12, 10, 12.5, col); ell(x - 3, y - ln - 17, 2.5, 4, 'rgba(255,255,255,.45)'); poly([x - 2, y - ln + 1, x + 2, y - ln + 1, x, y - ln - 2], col); },
    book(x, y, open = false, col = '#3e6db4', rot = 0) { c.save(); c.translate(x, y); c.rotate(rot); if (open) { poly([-14, -6, 0, -3, 0, 6, -14, 3], '#f8f4e8'); poly([14, -6, 0, -3, 0, 6, 14, 3], '#efe9db'); line(0, -3, 0, 6, 1, '#999'); for (let i = 0; i < 3; i++) { line(-11, -3 + i * 2.5, -3, -1 + i * 2.5, .6, '#aaa'); line(3, -1 + i * 2.5, 11, -3 + i * 2.5, .6, '#aaa'); } } else { rect(-9, -6, 18, 12, col); rect(-9, -6, 3, 12, shade(col, -.25)); } c.restore(); },
    phone(x, y, glow = 1, rot = 0) { c.save(); c.translate(x, y); c.rotate(rot); rr(-4, -7, 8, 14, 1.5, '#1d1f24'); rect(-3, -6, 6, 11, mix('#20242b', '#bfe0ff', glow)); c.restore(); if (glow > 0) P.light(x, y, 26, '#bfe0ff', .25 * glow); },
    letter(x, y, rot = 0) { c.save(); c.translate(x, y); c.rotate(rot); rect(-10, -7, 20, 14, '#fbf7ee'); for (let i = 0; i < 3; i++) line(-7, -3 + i * 3.5, 7, -3 + i * 3.5, .7, '#888'); c.restore(); },
    ring(x, y, open = 1) { rr(x - 6, y - 7, 12, 7, 1.5, '#7a1f2e'); c.save(); c.translate(x - 6, y - 7); c.rotate(-open * 1.6); rr(0, -4, 12, 4, 1.5, '#8e2b3c'); c.restore(); if (open > .3) { c.beginPath(); c.arc(x, y - 9, 3, 0, Math.PI * 2); c.lineWidth = 1.4; c.strokeStyle = '#f2d16b'; c.stroke(); P.sym('spark', x + 5, y - 15, .6, open); } },
    candle(x, y, lit = 1, t = 0) { rect(x - 1.5, y - 10, 3, 10, '#fff2c8'); if (lit > 0) { const fl = 1 + Math.sin(t * 13) * .15; ell(x, y - 13, 2 * fl, 3.6 * fl, mix('#ffffff', '#ffb840', .6)); P.light(x, y - 13, 22, '#ffc060', .35 * lit); } },
    flowers(x, y, col = '#e8577a') { rr(x - 6, y - 16, 12, 16, 3, '#9fc6d8'); for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + (i - 2) * .35, fx = x + Math.cos(a) * 14, fy = y - 16 + Math.sin(a) * 14; line(x, y - 14, fx, fy, 1.2, '#4f8a4a'); circ(fx, fy, 3.5, i % 2 ? col : shade(col, .3)); circ(fx, fy, 1.2, '#f7d35c'); } },
    paint(x, y, w, h, kk, col = '#5b8fd6') { line(x - w / 2 + 4, y + h / 2, x - w / 2 - 6, FLOOR, 3, C.wood); line(x + w / 2 - 4, y + h / 2, x + w / 2 + 6, FLOOR, 3, C.wood); line(x, y - h / 2, x, FLOOR, 3, C.wood); rect(x - w / 2, y - h / 2, w, h, '#fbf8f0');
      c.save(); c.beginPath(); c.rect(x - w / 2, y - h / 2, w * clamp(kk, 0, 1), h); c.clip(); rect(x - w / 2, y - h / 2, w, h * .55, shade(col, .35)); rect(x - w / 2, y + h * .05, w, h * .45, '#6fae5e'); circ(x + w * .2, y - h * .2, h * .12, '#f3c84b'); poly([x - w / 2, y + h * .1, x - w * .15, y - h * .2, x + w * .1, y + h * .1], shade(col, -.2)); c.restore(); },
    umbrella(x, y, open = 1, col = '#d94f5c') { line(x, y, x, y - 40, 1.5, '#333'); if (open > 0) { c.beginPath(); c.moveTo(x - 26 * open, y - 34); c.quadraticCurveTo(x, y - 66, x + 26 * open, y - 34); c.closePath(); fill(col); } else poly([x - 3, y - 14, x + 3, y - 14, x, y - 42], col); },

    sym(kind, x, y, s = 1, a = 1, col) { if (a <= 0) return; c.save(); c.globalAlpha = clamp(a, 0, 1); c.translate(x, y); c.scale(s, s);
      if (kind === 'heart') { c.beginPath(); c.moveTo(0, 5); c.bezierCurveTo(-10, -3, -5, -11, 0, -5); c.bezierCurveTo(5, -11, 10, -3, 0, 5); fill(col || '#e8456b'); }
      else if (kind === 'note') { line(2, -10, 2, 2, 1.6, col || '#2a2420'); ell(-1, 3, 3.4, 2.4, col || '#2a2420', -.4); line(2, -10, 7, -7, 2, col || '#2a2420'); }
      else if (kind === 'zzz') { c.font = 'bold 11px system-ui, sans-serif'; c.fillStyle = col || '#ffffff'; c.fillText('z', 0, 0); c.font = 'bold 8px system-ui, sans-serif'; c.fillText('z', 7, -7); c.fillText('z', 12, -13); }
      else if (kind === 'bang' || kind === 'q') { c.font = 'bold 18px system-ui, sans-serif'; c.textAlign = 'center'; c.fillStyle = col || '#e0453a'; c.fillText(kind === 'bang' ? '!' : '?', 0, 6); }
      else if (kind === 'spark' || kind === 'star') { const n = kind === 'star' ? 5 : 4, r1 = kind === 'star' ? 7 : 8, r0 = kind === 'star' ? 3 : 1.6; c.beginPath(); for (let i = 0; i < n * 2; i++) { const an = -Math.PI / 2 + i * Math.PI / n, r = i % 2 ? r0 : r1; c.lineTo(Math.cos(an) * r, Math.sin(an) * r); } c.closePath(); fill(col || '#ffe37a'); }
      else if (kind === 'drop') { c.beginPath(); c.moveTo(0, -6); c.quadraticCurveTo(5, 1, 0, 4); c.quadraticCurveTo(-5, 1, 0, -6); fill(col || '#7cc4f2'); }
      else if (kind === 'anger') { c.lineWidth = 2; c.strokeStyle = col || '#e0453a'; for (let i = 0; i < 4; i++) { c.save(); c.rotate(i * Math.PI / 2); c.beginPath(); c.moveTo(2, -6); c.quadraticCurveTo(2, -2, 6, -2); c.stroke(); c.restore(); } }
      else if (kind === 'bulb') { circ(0, -3, 6, col || '#ffe37a'); rect(-3, 2, 6, 4, '#9a9a9a'); P.light(0, -3, 20, '#ffe37a', .4); }
      c.restore(); },
    say(x, y, text, o = {}) { const a = o.a ?? 1; if (a <= 0) return; c.save(); c.globalAlpha = clamp(a, 0, 1); c.font = '600 11px system-ui, sans-serif'; const tw = c.measureText(text).width, bw = tw + 14, bh = 20, td = o.tail ?? 1;
      const bx = clamp(x - bw / 2 + td * 14, 4, W - bw - 4), by = Math.max(4, y - 34);
      if (o.think) { rr(bx, by, bw, bh, 10, '#ffffff'); circ(x + td * 4, y - 10, 3, '#ffffff'); circ(x + td * 8, y - 16, 4, '#ffffff'); }
      else { rr(bx, by, bw, bh, 6, '#ffffff'); poly([clamp(x + td * 6, bx + 6, bx + bw - 6), by + bh - 1, clamp(x + td * 14, bx + 6, bx + bw - 6), by + bh - 1, x, y - 2], '#ffffff'); }
      c.fillStyle = '#2a2420'; c.textBaseline = 'middle'; c.fillText(text, bx + 7, by + bh / 2 + .5); c.restore(); },
    confetti(t, seed = 1, a = 1) { if (a <= 0) return; c.save(); c.globalAlpha = clamp(a, 0, 1); for (let i = 0; i < 46; i++) { const r = rnd(seed * 31 + i), sp = 40 + r * 50, yy = ((t * sp + r * H * 1.5) % (H + 40)) - 20, xx = (rnd(i + seed) * W + Math.sin(t * 2 + i) * 10) % W;
      c.save(); c.translate(xx, yy); c.rotate(t * 3 + i); rect(-2.5, -1.5, 5, 3, ['#e8456b', '#f7d35c', '#5b8fd6', '#6fc276', '#c17be0'][i % 5]); c.restore(); } c.restore(); },
    rain(t, a = 1) { if (a <= 0) return; c.save(); c.globalAlpha = .35 * clamp(a, 0, 1); for (let i = 0; i < 26; i++) { const r = rnd(i * 13), xx = r * W, yy = ((t * (30 + r * 40) + rnd(i) * H) % (H + 30)) - 15; line(xx, yy, xx + .5, yy + 8 + r * 6, 1.2, '#dbe8ff'); circ(xx + .5, yy + 9 + r * 6, 1.4, '#dbe8ff'); } c.restore(); },
    text(x, y, s, size = 11, col = '#2a2420') { c.save(); c.font = `700 ${size}px system-ui, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = col; c.fillText(s, x, y); c.restore(); },
  };
  return P;
}
