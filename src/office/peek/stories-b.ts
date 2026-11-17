// Window stories, set B (see pen.ts for the kit and the Story shape; stories.ts collects every set).
import type { Pen, Story } from './pen.js';

type PO = NonNullable<Parameters<Pen['person']>[1]>;
type Body = ReturnType<Pen['person']>;
type Pt = [number, number];
const TAU = Math.PI * 2;

// ── small local drawing helpers (all on p.c, state saved and restored) ──
function ln(p: Pen, x0: number, y0: number, x1: number, y1: number, w: number, col: string) { const c = p.c; c.save(); c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.lineWidth = w; c.strokeStyle = col; c.lineCap = 'round'; c.stroke(); c.restore(); }
function dot(p: Pen, x: number, y: number, r: number, col: string) { const c = p.c; c.save(); c.beginPath(); c.arc(x, y, Math.max(0, r), 0, TAU); c.fillStyle = col; c.fill(); c.restore(); }
function oval(p: Pen, x: number, y: number, rx: number, ry: number, col: string, rot = 0) { const c = p.c; c.save(); c.beginPath(); c.ellipse(x, y, Math.max(0, rx), Math.max(0, ry), rot, 0, TAU); c.fillStyle = col; c.fill(); c.restore(); }
function block(p: Pen, x: number, y: number, w: number, h: number, r: number, col: string) { const c = p.c; c.save(); c.beginPath(); if (c.roundRect) c.roundRect(x, y, w, h, Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2)); else c.rect(x, y, w, h); c.fillStyle = col; c.fill(); c.restore(); }
function shape(p: Pen, P: number[], col: string) { const c = p.c; c.save(); c.beginPath(); c.moveTo(P[0], P[1]); for (let i = 2; i < P.length; i += 2) c.lineTo(P[i], P[i + 1]); c.closePath(); c.fillStyle = col; c.fill(); c.restore(); }
function alpha(p: Pen, a: number, fn: () => void) { if (a <= 0) return; p.c.save(); p.c.globalAlpha = p.clamp(a, 0, 1); fn(); p.c.restore(); }

/** Arm angles that put a hand of p.person(x, o) on (tx, ty): a two-bone reach (upper arm 20, forearm 19). Ignores lean.
 *  elbow -1 keeps the elbow below the line to the hand (the natural reach), +1 above. */
function reach(x: number, o: PO, side: 'L' | 'R', tx: number, ty: number, elbow = -1): { a: number; b: number } {
  const s = o.s ?? 1, f = o.face ?? 1, fr = !!o.front, pose = o.pose || 'stand';
  const base = o.y ?? (pose === 'sit' ? 208 : 248), hy = pose === 'sit' ? base - 2 : base - 50, sy = hy - 34, sd = side === 'L' ? -1 : 1;
  const sx = x + (fr ? sd * 15 : sd * 3 - f), dir = fr ? sd : f;
  const lx = x + (tx - x) / s, ly = base + (ty - base + (o.bob || 0)) / s;
  let dx = (lx - sx) * dir, dy = ly - sy; const d0 = Math.hypot(dx, dy) || 1e-6, d = Math.min(Math.max(d0, 2), 38.9);
  dx *= d / d0; dy *= d / d0;
  const phi = Math.atan2(dx, dy), al = Math.acos(Math.max(-1, Math.min(1, (400 + d * d - 361) / (40 * d)))), a = phi + elbow * al;
  let b = Math.atan2(dx - Math.sin(a) * 20, dy - Math.cos(a) * 20) - a; while (b > Math.PI) b -= TAU; while (b < -Math.PI) b += TAU;
  return { a, b };
}

/** Draw in head space: origin at the neck, the head's centre at (0, -15), scaled and tilted with the person. */
function onHead(p: Pen, B: Body, s: number, rot: number, fn: () => void) { const c = p.c; c.save(); c.translate(B.head[0], B.head[1] + 15 * s); c.rotate(rot); c.scale(s, s); fn(); c.restore(); }
function headphones(p: Pen, B: Body, s: number, rot: number, front: boolean, f: number, col = '#e8456b', cup = '#2c2a33') {
  onHead(p, B, s, rot, () => { const c = p.c;
    if (front) { c.beginPath(); c.arc(0, -15, 18.5, Math.PI + .2, TAU - .2); c.lineWidth = 3.6; c.strokeStyle = col; c.stroke(); block(p, -22, -22, 7, 14, 3, cup); block(p, 15, -22, 7, 14, 3, cup); block(p, -21, -20, 2, 10, 1, col); block(p, 19, -20, 2, 10, 1, col); }
    else { c.beginPath(); c.moveTo(-f * 2, -20); c.quadraticCurveTo(-f * 5, -36, -f * 1, -34); c.lineWidth = 3.6; c.strokeStyle = col; c.lineCap = 'round'; c.stroke(); oval(p, -f * 2, -14, 6, 7.5, cup); oval(p, -f * 2, -14, 2.5, 4, col); } });
}
function chefHat(p: Pen, B: Body, s: number, rot: number) {
  onHead(p, B, s, rot, () => { block(p, -12, -35, 24, 8, 2, '#f4f2ee'); dot(p, -8, -40, 7, '#ffffff'); dot(p, 8, -40, 7, '#ffffff'); dot(p, 0, -45, 9, '#ffffff'); ln(p, -11, -29, 11, -29, 1, '#d8d4cc'); });
}
function cap(p: Pen, B: Body, s: number, col: string) {
  onHead(p, B, s, 0, () => { const c = p.c; c.beginPath(); c.arc(0, -17, 16, Math.PI, TAU); c.closePath(); c.fillStyle = col; c.fill(); block(p, -18, -19, 36, 4, 2, col); });
}
/** A window curtain hanging from a rod, covering from edge to the right side. behind() draws on the fabric (a shadow). */
function curtain(p: Pen, edge: number, t: number, col: string, sway: number, behind?: () => void) {
  const c = p.c, W = p.W, H = p.H;
  if (edge < W) {
    const wob = (y: number) => Math.sin(y / 38 + t * 3) * sway;
    c.save(); c.beginPath(); c.moveTo(edge + wob(0), 4); for (let y = 16; y <= H; y += 12) c.lineTo(edge + wob(y) + (y / H) * 3, y); c.lineTo(W + 2, H + 2); c.lineTo(W + 2, 4); c.closePath();
    c.fillStyle = col; c.fill(); c.clip(); if (behind) behind();
    const w = W - edge, n = Math.max(2, Math.round(w / 15)), fw = w / n;
    for (let i = 0; i < n; i++) { const fx = edge + i * fw, g = c.createLinearGradient(fx, 0, fx + fw, 0); g.addColorStop(0, 'rgba(0,0,0,.2)'); g.addColorStop(.45, 'rgba(255,255,255,.12)'); g.addColorStop(1, 'rgba(0,0,0,.04)'); c.fillStyle = g; c.fillRect(fx, 0, fw + 1, H); }
    c.restore();
    for (let i = 0; i <= n; i++) { c.save(); c.beginPath(); c.arc(edge + i * (W - edge) / n + 2, 7, 3, 0, TAU); c.lineWidth = 1.4; c.strokeStyle = '#c9a64a'; c.stroke(); c.restore(); }
  }
  block(p, 0, 3, W, 4, 2, '#6b4a30');
}
function disco(p: Pen, x: number, y: number, t: number) {
  const c = p.c; ln(p, x, 0, x, y - 10, 1, '#555');
  c.save(); c.beginPath(); c.arc(x, y, 10, 0, TAU); c.fillStyle = '#9aa3ad'; c.fill(); c.clip();
  const sh = (t * 6) % 1;
  for (let r = 0; r < 6; r++) for (let q = -1; q < 6; q++) { const v = p.rnd(r * 9 + q + Math.floor(t * 6)); c.fillStyle = p.mix('#7d8590', '#ffffff', v); c.fillRect(x - 10 + (q + sh) * 4, y - 10 + r * 3.6, 3.4, 3); }
  c.restore();
  for (let i = 0; i < 3; i++) p.sym('spark', x + Math.cos(i * 2.1 + t) * 16, y + Math.sin(i * 2.1 + t) * 10, .5, .5 + .5 * Math.sin(t * 7 + i * 2));
}
/** Smoke puffs rising from (x, y): amt 0..1, dark 0..1 (white steam to black smoke). Spreads under the ceiling. */
function smoke(p: Pen, x: number, y: number, t: number, amt: number, dark: number, seed = 1, sz = 1, top = 14) {
  if (amt <= 0) return;
  for (let i = 0; i < 16; i++) { const r = p.rnd(seed * 17 + i), ph = (t * (.35 + r * .25) + r) % 1, yy = y - ph * (y - top), spread = Math.max(0, ph - .6) * 140 * sz;
    const xx = x + Math.sin(ph * 5 + i) * 8 + (r - .5) * spread * 2;
    alpha(p, amt * (1 - ph * .5) * .75, () => dot(p, xx, yy, (6 + ph * 14 * (.6 + r * .6)) * sz, p.mix('#d8d8d8', '#3b3734', dark))); }
}
function towel(p: Pen, x: number, y: number, rot: number) {
  const c = p.c; c.save(); c.translate(x, y); c.rotate(rot); const fl = Math.sin(rot * 6) * 4;
  shape(p, [-9, -2, 9, -2, 13 + fl, 28, -11 + fl, 30], '#f6f1e6');
  shape(p, [-10 + fl * .6, 18, 11 + fl * .6, 17, 11.6 + fl * .7, 21, -10.4 + fl * .7, 22], '#d9534f');
  shape(p, [-9.3, 4, 9.6, 4, 10, 6.5, -9.6, 6.5], '#d9534f'); c.restore();
}
function pizzaBox(p: Pen, x: number, y: number, open: number, slice = false) {
  const c = p.c; block(p, x - 19, y - 6, 38, 6, 1, '#d6b07a');
  if (open > 0) { c.save(); c.translate(x, y - 6); c.scale(1, -1 + 0 * open); shape(p, [-19, 0, 19, 0, 17, -28 * open, -17, -28 * open], '#e7c48e'); c.restore();
    oval(p, x, y - 6, 16, 3.5, '#e8a33c'); oval(p, x, y - 6.5, 13, 2.6, '#d9472f'); for (let i = 0; i < 5; i++) dot(p, x - 9 + i * 4.5, y - 6.5 + (i % 2) * 1.2, 1.3, '#8c1f1f');
    if (slice) shape(p, [x + 2, y - 6, x + 15, y - 8, x + 15, y - 4], '#d6b07a'); }
  else block(p, x - 19, y - 9, 38, 4, 1, '#e7c48e');
  p.text(x, y - 3, 'PIZZA', 4.5, '#a5452b');
}
function slice(p: Pen, x: number, y: number, rot: number) { const c = p.c; c.save(); c.translate(x, y); c.rotate(rot); shape(p, [0, 0, 16, -5, 16, 5], '#e8a33c'); shape(p, [2, 0, 14, -3.6, 14, 3.6], '#d9472f'); dot(p, 9, 0, 1.4, '#8c1f1f'); block(p, 14, -5, 3, 10, 1.5, '#c98a3a'); c.restore(); }
function wateringCan(p: Pen, x: number, y: number, rot: number): Pt {
  const c = p.c; c.save(); c.translate(x, y); c.rotate(rot);
  ln(p, 16, 6, 30, -6, 3, '#3f8f6b'); block(p, 27, -9, 6, 5, 2, '#3f8f6b');
  block(p, -2, 2, 20, 15, 3, '#4fae84'); c.beginPath(); c.arc(4, 4, 6, Math.PI, TAU); c.lineWidth = 2; c.strokeStyle = '#3f8f6b'; c.stroke(); c.restore();
  const cs = Math.cos(rot), sn = Math.sin(rot); return [x + 31 * cs + 7 * sn, y + 31 * sn - 7 * cs];
}
function pup(p: Pen, x: number, y: number, s: number, f: number, col: string, t: number) { // a puppy curled up asleep
  const c = p.c; c.save(); c.translate(x, y); c.scale(f * s, s);
  oval(p, 0, -9, 17, 9, col); dot(p, 13, -10, 8, col); oval(p, 9, -10, 4, 7, p.mix(col, '#000000', .3), .4); oval(p, 19, -7, 4.5, 3, p.mix(col, '#ffffff', .15)); dot(p, 22, -8, 1.5, '#222');
  ln(p, 13, -12, 17, -12, 1.2, '#2a2420'); ln(p, -15, -6, -20 - Math.sin(t * 2) * 1.5, -12, 4, col);
  c.restore();
}
function boxHoles(p: Pen, x: number, y: number, w: number, h: number) { for (const [dx, dy] of [[-.3, .35], [0, .62], [.28, .34], [-.12, .8], [.18, .78]]) dot(p, x + dx * w, y - h + dy * h, 2, '#4a3524'); }
function bow(p: Pen, x: number, y: number) { oval(p, x - 7, y - 3, 7, 4, '#d94f5c', -.4); oval(p, x + 7, y - 3, 7, 4, '#d94f5c', .4); dot(p, x, y - 2, 3, '#b83a47'); }

// ── 1. Dance break: wild dancing in headphones; then they notice us ──
const dance: Story = {
  id: 'dance-break', title: 'Dance like nobody is watching', dur: 20,
  beats: [[0, 'Headphones on. Nobody home.'], [2.4, 'Time for the moves nobody gets to see.'], [5.4, 'The hairbrush solo.'], [10.4, '…oh. Hello there.'], [14.6, 'Show’s over, folks.'], [17.6, '(The show is not over.)']],
  draw(p: Pen, t: number) {
    const { k, at, FLOOR } = p;
    p.room({ wall: '#e4d4ee', floor: '#8a5e44', paper: 'dots' });
    p.picture(92, 88, 44, 30, '#e7a2b4');
    p.floorLamp(20, 1);
    p.sofa(94, 104, '#5f8f8a');
    p.plant(190, FLOOR, 1.1);
    p.rug(120, 160, '#7b5ea7');
    disco(p, 158, 30, t);
    for (let i = 0; i < 4; i++) p.light(120 + Math.sin(t * .9 + i * 1.7) * 95, 84 + Math.cos(t * 1.3 + i * 2.1) * 45, 20, ['#ff6fa8', '#6fd3ff', '#ffe36f', '#9dff8a'][i], .26);
    const ph = t * TAU, hop = Math.abs(Math.sin(ph)), edge = at(t, [[15.1, 222], [17.3, -10]]);
    const look: PO = { front: true, skin: '#c68b5e', shirt: '#f2a03d', pants: '#3d4a6b', hair: 'short', hairC: '#3a2418', shoes: '#f4f1ea' };
    let x = 120, brush = false; const o: PO = { ...look };
    if (t < 2) { // warming up: a nod and a sway
      x = 120 + Math.sin(ph / 2) * 4; Object.assign(o, { bob: hop * 2, tilt: Math.sin(ph / 2) * .12, armL: .3 + Math.sin(ph) * .15, armR: .3 - Math.sin(ph) * .15, eyes: 'closed', mouth: 'smile' });
    } else if (t < 5.2) { // the disco point
      const u = (Math.sin(ph) + 1) / 2, env = k(t, 2, 2.5) * (1 - k(t, 4.7, 5.2));
      x = 120 + Math.sin(ph / 2) * 10 * env;
      Object.assign(o, { pose: 'walk', ph: ph, bob: hop * 6, tilt: (u - .5) * -.3, armR: { a: p.lerp(-.6, 2.8, u), b: p.lerp(.4, 0, u) }, armL: { a: .8, b: -1.9 }, eyes: 'closed', mouth: 'grin' });
    } else if (t < 8.5) { // the hairbrush solo
      brush = true; const base = FLOOR - hop * 2;
      Object.assign(o, { bob: hop * 2, tilt: -.14 + Math.sin(ph / 2) * .06, armL: { a: 1.8 + Math.sin(ph) * .4, b: .3 }, eyes: 'closed', mouth: Math.sin(ph * 1.5) > 0 ? 'open' : 'o' });
      o.armR = reach(x, o, 'R', x + 8, base - 80, 1);
    } else if (t < 9.4) { // the spin
      const sp = Math.floor((t - 8.5) / .15) % 4;
      Object.assign(o, { front: sp % 2 === 0, face: sp === 3 ? -1 : 1, armL: 1.5, armR: 1.5, eyes: 'closed', mouth: 'grin', bob: 3 });
    } else { // the big finish… and the freeze
      const down = k(t, 11.8, 12.8), wv = t > 12.8 && t < 13.7;
      Object.assign(o, { bob: t < 9.9 ? Math.sin((t - 9.4) / .5 * Math.PI) * 12 : 0, armL: { a: p.lerp(2.5, .12, down), b: p.lerp(.1, .25, down) }, armR: { a: p.lerp(2.5, .12, down), b: p.lerp(.1, .25, down) },
        eyes: t < 10.4 ? 'closed' : t < 12.6 ? 'wide' : 'open', mouth: t < 10.4 ? 'grin' : t < 12.6 ? 'o' : 'smile', blush: t > 11.2 });
      if (wv) o.armR = { a: 2.3 + Math.sin((t - 12.8) * 16) * .3, b: .5 };
      if (t > 13.7) { x = t < 14.7 ? at(t, [[13.7, 120], [14.7, 226]], p.ease.lin) : edge + 4 + 18 * k(t, 16.3, 17.1); if (t < 14.7) { o.pose = 'walk'; o.ph = t * 14; } o.armR = .1; o.armL = .1; }
    }
    const B = p.person(x, o);
    headphones(p, B, 1, (o.tilt || 0), o.front !== false, o.face || 1);
    if (brush) { ln(p, B.rh[0], B.rh[1] + 4, B.rh[0] - 2, B.rh[1] - 10, 3, '#8a5a3b'); oval(p, B.rh[0] - 2.5, B.rh[1] - 15, 4.5, 6, '#3a3330', -.15); }
    if (t < 10.4) for (let i = 0; i < 3; i++) { const q = (t * .9 + i / 3) % 1; p.sym('note', B.head[0] + (i - 1) * 18 + Math.sin(q * 6 + i) * 5, B.head[1] - 26 - q * 50, .9, (1 - q) * k(t, .3, .8), ['#e8456b', '#5b8fd6', '#7b5ea7'][i]); }
    if (t > 9.4 && t < 10.4) for (let i = 0; i < 4; i++) p.sym('star', x + Math.cos(i * 1.6 + t * 3) * 40, FLOOR - 140 + Math.sin(i * 1.6 + t * 3) * 22, .8, .9);
    p.sym('bang', B.head[0] + 18, B.head[1] - 26, 1.3, k(t, 10.4, 10.55) * (1 - k(t, 11.4, 11.8)));
    p.sym('drop', B.head[0] - 17, B.head[1] - 8, .8, k(t, 12, 12.3) * (1 - k(t, 13.5, 13.8)), '#9fd3f5');
    // the curtain: bunched at the right, then pulled shut; the dancer's shadow carries on behind it
    const col = '#d0587a';
    curtain(p, edge, t, col, t > 17.3 ? 1.2 + hop * .8 : 1, () => {
      if (t < 17) return; const env = 1 - .8 * k(t, 18.6, 19.4), sc = p.mix(col, '#3a0f22', .5 * k(t, 17.2, 17.9));
      const so: PO = { front: true, skin: sc, shirt: sc, pants: sc, hairC: sc, shoes: sc, eyes: 'closed', mouth: 'flat', bob: hop * 4 * env, tilt: Math.sin(ph / 2) * .15 * env,
        armR: { a: 2.3 + Math.sin(ph) * .5 * env, b: .2 }, armL: { a: .6 + (Math.sin(ph) + 1) * .7 * env, b: .4 } };
      const SB = p.person(118, so); headphones(p, SB, 1, so.tilt || 0, true, 1, sc, sc);
    });
    if (t > 15 && t < 17.3) for (let i = 0; i < 3; i++) oval(p, edge + 2, FLOOR - 82 + i * 5, 3.4, 2.4, '#c68b5e');
    if (t > 17.6) for (let i = 0; i < 2; i++) { const q = (t * .6 + i / 2) % 1; p.sym('note', 104 + i * 30 + Math.sin(q * 6) * 4, 104 - q * 50, 1, (1 - q) * k(t, 17.6, 18.2) * (1 - k(t, 19, 19.6)), '#fff2f6'); }
  },
};

// ── 2. Burnt dinner: the chef is very confident; the smoke alarm is not ──
const dinner: Story = {
  id: 'burnt-dinner', title: 'Chef’s special', dur: 22,
  beats: [[0, 'Tonight: a fancy home-cooked dinner.'], [4.6, 'Chef’s kiss. Nailed it.'], [8.4, 'BEEP! BEEP! BEEP!'], [13.8, 'Well. That was dinner.'], [14.6, 'Ding dong!'], [18, 'Dinner is served. Sort of.']],
  draw(p: Pen, t: number) {
    const { k, at, FLOOR } = p;
    p.room({ wall: '#f1e4c4', floor: '#a67b5b', paper: 'tiles' });
    p.shelf(60, 110, 84, 7);
    p.clock(122, 62, 19.2 + t / 600);
    const doorOpen = at(t, [[15, 0], [15.7, 1], [18, 1], [18.7, 0]]);
    p.door(206, doorOpen, '#7f9fb5');
    const top = p.counter(80, 150), burner = at(t, [[0, 1], [10, 1], [10.6, 0]]);
    p.stove(60, top, burner);
    // the alarm on the ceiling
    const beeping = t > 8.4 && t < 13.6, blink = beeping && Math.sin(t * 22) > 0;
    oval(p, 150, 12, 13, 5, '#f4f2ee'); oval(p, 150, 9, 13, 3, '#dcd8d0'); dot(p, 156, 13, 1.8, blink ? '#ff3030' : '#8a2a2a');
    // the smoke, from steam to black, then drifting away
    const amt = at(t, [[4.8, 0], [7.5, 1], [10.5, 1], [13.6, .5], [15.5, 0]]), drk = at(t, [[5, .3], [7.4, 1]]);
    const chef: PO = { face: -1, skin: '#e0ac7e', shirt: '#f4f2ee', pants: '#3b3f4a', hair: 'short', hairC: '#7a4a24', beard: true };
    let x = 98, B: Body, hold: 'spoon' | 'towel' | 'box' | 'slice' | '' = '', boxAt: Pt | null = null, boxOpen = 0;
    const o: PO = { ...chef };
    if (t < 4.5) { // stirring, humming, a shake of pepper
      const sx = 68 + Math.cos(t * 6) * 5, sy = top - 26 + Math.sin(t * 6) * 2; hold = 'spoon';
      Object.assign(o, { eyes: 'happy', mouth: 'smile', tilt: Math.sin(t * 3) * .06 });
      o.armR = reach(x, o, 'R', sx, sy); o.armL = t > 2.2 && t < 3.6 ? reach(x, o, 'L', 76, top - 44 + Math.abs(Math.sin(t * 14)) * 4) : .1;
    } else if (t < 8.4) { // front: the chef's kiss, then hands on hips
      x = 104; Object.assign(o, { front: true, face: 1, eyes: 'closed', mouth: t < 6.1 ? 'o' : 'smile', tilt: Math.sin(t * 2) * .05 });
      if (t < 5.9) o.armR = reach(x, o, 'R', x + 3, FLOOR - 92, 1); else if (t < 6.9) o.armR = { a: p.lerp(1, 2.1, k(t, 5.9, 6.3)), b: .1 }; else o.armR = { a: .8, b: -1.9 };
      o.armL = t < 6.9 ? .1 : { a: .8, b: -1.9 };
    } else if (t < 9.2) { // BEEP: a jump
      x = 104; Object.assign(o, { front: true, eyes: 'wide', mouth: 'o', bob: Math.sin(k(t, 8.4, 8.9, p.ease.lin) * Math.PI) * 14, armL: { a: 2.5, b: .2 }, armR: { a: 2.5, b: .2 } });
    } else if (t < 10) { // run under the alarm
      x = at(t, [[9.2, 104], [10, 150]], p.ease.lin); Object.assign(o, { face: 1, pose: 'walk', ph: t * 16, lean: .15, eyes: 'wide', mouth: 'open', armR: { a: 2.6, b: .1 }, armL: -.5 }); hold = 'towel';
    } else if (t < 13.6) { // wave the towel like mad
      x = 150; Object.assign(o, { front: true, eyes: 'wide', mouth: 'open', bob: Math.abs(Math.sin(t * 9)) * 3, armR: { a: 2.75 + Math.sin(t * 15) * .35, b: .1 }, armL: { a: 2.2 + Math.sin(t * 15 + 1) * .4, b: .3 } }); hold = 'towel';
    } else if (t < 15) { // silence; a sigh; ding dong
      x = 150; Object.assign(o, { front: t < 14.4, face: 1, eyes: 'open', mouth: t < 14.4 ? 'sad' : 'o', tilt: t < 14.4 ? .15 : 0, armR: .05, armL: .05 }); hold = 'towel';
    } else if (t < 16.2) { x = at(t, [[15, 150], [16.2, 168]], p.ease.lin); Object.assign(o, { pose: 'walk', ph: t * 9, mouth: 'o', armR: .2, armL: -.2 }); }
    else if (t < 18.4) { x = 168; Object.assign(o, { mouth: t > 17.2 ? 'grin' : 'o', eyes: t > 17.2 ? 'happy' : 'open' }); }
    else if (t < 19.6) { x = at(t, [[18.4, 168], [19.6, 104]], p.ease.lin); Object.assign(o, { face: -1, pose: 'walk', ph: t * 9, mouth: 'grin', eyes: 'happy' }); hold = 'box'; }
    else { x = 104; Object.assign(o, { front: true, eyes: 'happy', mouth: Math.sin(t * 9) > 0 ? 'grin' : 'smile', tilt: -.08 }); hold = 'slice'; }
    // the pizza: in the courier's hands, then the chef's, then open on the counter
    if (t > 15.4 && t < 17.4) boxAt = [p.lerp(206, 188, k(t, 16.6, 17.3)), FLOOR - 72 + 2 * k(t, 16.6, 17.3)];
    if (t >= 17.4 && t < 19.6) { boxAt = [x + 20 * (o.face || 1), FLOOR - 70]; }
    if (t >= 19.6) { boxAt = [140, top]; boxOpen = k(t, 19.7, 20.2); }
    if (boxAt && t >= 16.6 && t < 19.6) { o.armR = reach(x, o, 'R', boxAt[0] + 8 * (o.face || 1), boxAt[1] - 3); o.armL = reach(x, o, 'L', boxAt[0] - 6 * (o.face || 1), boxAt[1] - 3); }
    if (hold === 'slice') o.armR = reach(x, o, 'R', x + 10, FLOOR - 88 + Math.sin(t * 9) * 2, 1);
    // the courier, in the doorway, only the part not behind the door
    if (doorOpen > 0) { const c = p.c, vx = 206 - 21 + 42 * (1 - doorOpen * .8); c.save(); c.beginPath(); c.rect(vx, FLOOR - 137, 206 + 21 - vx, 140); c.clip();
      const co: PO = { front: true, skin: '#9b6640', shirt: '#d9473a', pants: '#2d2f3a', hair: 'short', hairC: '#1d1612', mouth: 'grin', eyes: 'happy' };
      if (boxAt && t < 17.4) { co.armR = reach(206, co, 'R', boxAt[0] + 14, boxAt[1] - 2); co.armL = reach(206, co, 'L', boxAt[0] - 14, boxAt[1] - 2); } else { co.armR = { a: 2.4 + Math.sin(t * 10) * .3, b: .4 }; }
      const CB = p.person(206, co); cap(p, CB, 1, '#d9473a');
      if (boxAt && t < 17.4) pizzaBox(p, boxAt[0], boxAt[1], 0);
      c.restore(); }
    B = p.person(x, o);
    chefHat(p, B, 1, (o.tilt || 0) + (t > 9.2 ? -.18 : 0));
    if (hold === 'spoon') { ln(p, B.rh[0], B.rh[1] - 3, B.rh[0] - 3, B.rh[1] + 16, 2.4, '#b07b4a'); }
    p.pot(60, top, 1 - k(t, 5, 6.5), t);
    if (t > 13.6) { oval(p, 60, top - 17, 11, 2.4, '#1d1714'); }
    smoke(p, 60, top - 22, t, amt, drk);
    if (hold === 'towel') towel(p, B.rh[0], B.rh[1], t > 10 && t < 13.6 ? Math.sin(t * 15) * 1.2 + Math.PI : .1);
    if (t < 4.5 && t > 2.2 && t < 3.6) { block(p, B.lh[0] - 3, B.lh[1] - 8, 6, 10, 2, '#3a3330'); for (let i = 0; i < 3; i++) dot(p, B.lh[0] - 2 + i * 2, B.lh[1] + 4 + ((t * 3 + i / 3) % 1) * 14, .9, '#3a3330'); }
    if (boxAt && t >= 17.4) pizzaBox(p, boxAt[0], boxAt[1], boxOpen, t > 19.6);
    if (hold === 'slice') slice(p, B.rh[0] - 2, B.rh[1], -2.3);
    // signs and sounds
    if (t < 4.5) p.sym('note', B.head[0] - 16, B.head[1] - 28 - ((t * .8) % 1) * 14, .8, 1 - (t * .8) % 1);
    p.sym('spark', 104 + 30, FLOOR - 112, 1, k(t, 6, 6.2) * (1 - k(t, 6.8, 7.1)));
    if (beeping) { const bk = (t * 2.2) % 1; p.light(150, 14, 60, '#ff3030', blink ? .55 : .1); p.text(150 + (Math.floor(t * 2.2) % 2 ? 40 : -40), 26 + bk * 6, 'BEEP!', 13, '#e0302a'); p.flash(blink ? .08 : 0, '#ff2020'); }
    p.sym('bang', 104 + 20, FLOOR - 150, 1.4, k(t, 8.4, 8.55) * (1 - k(t, 9.1, 9.3)));
    if (t > 14.4 && t < 15.6) { p.text(206, FLOOR - 154 - k(t, 14.4, 15) * 6, 'DING DONG', 11, '#3a3330'); p.sym('note', 186, FLOOR - 164, .8, 1); p.sym('note', 228, FLOOR - 160, .8, 1); }
    p.sym('q', B.head[0] + 16, B.head[1] - 26, 1.1, k(t, 14.5, 14.7) * (1 - k(t, 15.3, 15.6)));
    p.say(206, FLOOR - 128, 'Pizza!', { a: k(t, 15.9, 16.1) * (1 - k(t, 17, 17.2)), tail: -1 });
    p.sym('heart', 140, FLOOR - 104, 1, k(t, 20.2, 20.5) * (1 - k(t, 21.2, 21.6)));
    if (t > 14.5) smoke(p, 60, top - 20, t, .5 * k(t, 14.5, 15.5), .8, 3, .3, top - 70);
  },
};

// ── 3. New puppy: a box with holes, a kid, a surprise ──
const puppy: Story = {
  id: 'new-puppy', title: 'The box with holes', dur: 19,
  beats: [[0, 'A box. With little holes in it.'], [2.6, 'It moved. It definitely moved.'], [4.8, 'Just a tiny peek…'], [6.4, 'SURPRISE!'], [10.4, 'Love at first lick.'], [14.6, 'The cat would like a word.']],
  draw(p: Pen, t: number) {
    const { k, at, FLOOR } = p;
    p.room({ wall: '#cfe3d4', floor: '#b08560', paper: 'stripes' });
    p.window(118, 76, 54, 60, '#22305a');
    p.picture(40, 84, 34, 26, '#e8c46a', -.05);
    p.armchair(204, '#8a6fb0', -1);
    p.rug(100, 170, '#e2875c');
    // the cat on the armchair, unimpressed
    const catSleep = t > 17;
    p.cat(204, FLOOR - 40, { sit: !catSleep, sleep: catSleep, face: -1, color: '#4a4a52', tail: t > 14.4 ? Math.sin(t * 6) * 1.2 : p.wave(t, 2, .4) });
    // the box: wiggles, hops, bursts open
    const BX = 112, BW = 56, BH = 40;
    const wig = (t > 1 && t < 1.6 ? Math.sin((t - 1) * 30) * .06 : 0) + (t > 3 && t < 3.8 ? Math.sin((t - 3) * 34) * .09 : 0) + (t > 5.4 && t < 6.2 ? Math.sin((t - 5.4) * 40) * .12 : 0);
    const hopY = t > 5.7 && t < 6.1 ? Math.sin((t - 5.7) / .4 * Math.PI) * 8 : 0, flaps = t < 4.8 ? 0 : t < 5.4 ? .3 * k(t, 4.8, 5.1) : t < 6.2 ? .3 : k(t, 6.2, 6.35, p.ease.out);
    // the puppy: hidden, pops up, jumps out, runs, tackles, licks, sleeps
    const pupCol = '#e3b67a';
    const inBox = t < 8.2, popped = k(t, 6.2, 6.5, p.ease.back);
    const c = p.c;
    c.save(); c.translate(BX, FLOOR - hopY); c.rotate(wig);
    if (inBox && popped > .001) { c.save(); c.beginPath(); c.rect(-90, -150, 180, 150); c.clip(); const py = p.lerp(14, -26, popped) + Math.sin(t * 8) * 1.5 * (t > 6.6 ? 1 : 0); p.dog(0, py, { sit: true, face: -1, s: .78, color: pupCol, tongue: t > 6.6, wag: t * 20 }); c.restore(); }
    p.box(0, 0, BW, BH, '#c69a62', flaps); boxHoles(p, 0, 0, BW, BH); if (flaps < .05) bow(p, 0, -BH);
    if (inBox && popped > .6) { oval(p, -8, -BH - 1, 4, 3, pupCol); oval(p, 4, -BH - 1, 4, 3, pupCol); }
    c.restore();
    // the kid
    let x = 70; const kid: PO = { s: .62, face: 1, skin: '#f1c9a5', shirt: '#e8577a', pants: '#4a5a8a', hair: 'pony', hairC: '#6b3a1e', shoes: '#e8e2d6' };
    const o: PO = { ...kid };
    const lying = t > 10.1;
    if (t < 2) x = -30;
    else if (t < 3) { x = at(t, [[2, -30], [3, 66]], p.ease.lin); Object.assign(o, { pose: 'walk', ph: t * 10 }); }
    else if (t < 4.2) { x = 66; Object.assign(o, { bob: t > 3.1 && t < 3.5 ? Math.sin((t - 3.1) / .4 * Math.PI) * 8 : 0, eyes: 'wide', mouth: 'o', armL: { a: 1.6, b: .8 }, armR: { a: 1.4, b: .9 }, lean: -.1 }); }
    else if (t < 6.2) { x = at(t, [[4.2, 66], [4.8, 78]]); Object.assign(o, { pose: t < 4.8 ? 'walk' : 'stand', ph: t * 6, lean: .3 * k(t, 4.6, 5), eyes: 'open', mouth: 'flat', armR: t > 4.8 ? { a: 1.6, b: .4 } : .2, armL: .3 });
      if (t > 5.4) Object.assign(o, { lean: -.15, eyes: 'wide', mouth: 'o', armR: .4 }); }
    else if (!lying) { x = 72; const joy = t < 9.4; Object.assign(o, { bob: joy ? Math.abs(Math.sin(t * 9)) * 7 : 0, eyes: joy ? 'happy' : 'wide', mouth: joy ? 'grin' : 'open', armL: joy ? { a: 2.6, b: .2 } : { a: 1.8, b: .5 }, armR: joy ? { a: 2.6, b: .2 } : { a: 1.8, b: .5 }, lean: joy ? 0 : -.35 * k(t, 9.4, 10.1) }); }
    if (lying) { x = 128; Object.assign(o, { pose: 'lie', y: FLOOR + 30, eyes: t < 14 ? 'happy' : 'closed', mouth: t < 14 ? (Math.sin(t * 11) > 0 ? 'grin' : 'open') : 'smile', bob: t < 14 ? Math.abs(Math.sin(t * 11)) * 1.5 : 0, armL: { a: 2.4, b: .5 }, armR: t < 14 ? { a: 2.5 + Math.sin(t * 7) * .2, b: .6 } : { a: 1.3, b: 1.2 } }); }
    const B = p.person(x, o);
    // the puppy out of the box
    if (!inBox) {
      if (t < 9) { const q = k(t, 8.2, 8.8, p.ease.lin); p.dog(p.lerp(BX - 10, 140, q), p.lerp(FLOOR - 30, FLOOR + 16, q) - Math.sin(q * Math.PI) * 26, { face: 1, s: .78, color: pupCol, ph: t * 14, wag: t * 20, tongue: true }); }
      else if (t < 9.9) { const q = k(t, 9, 9.9, p.ease.lin), dx = p.lerp(150, 100, q); p.dog(dx + Math.sin(q * Math.PI * 2) * 0, FLOOR + 16 + Math.sin(q * Math.PI * 2) * 6, { face: q < .25 ? 1 : -1, s: .78, color: pupCol, ph: t * 16, wag: t * 20, tongue: true }); }
      else if (t < 10.3) { const q = k(t, 9.9, 10.3, p.ease.lin); p.dog(p.lerp(100, B.head[0] + 24, q), FLOOR + 16 - Math.sin(q * Math.PI) * 18, { face: -1, s: .78, color: pupCol, ph: 1, wag: t * 20 }); }
      else if (t < 14.2) { const lick = Math.sin(t * 9) * 3; p.dog(B.head[0] + 24 + lick, FLOOR + 26, { face: -1, s: .78, color: pupCol, ph: t * 3, wag: t * 22, tongue: Math.sin(t * 9) > -.3 }); }
      else pup(p, B.head[0] + 38, FLOOR + 22, .8, -1, pupCol, t);
    }
    // signs
    p.sym('q', 90, FLOOR - 60, 1, k(t, 1.1, 1.3) * (1 - k(t, 2, 2.3)), '#5a4a3a');
    p.sym('bang', B.head[0] + 6, B.head[1] - 22, 1.1, k(t, 3.1, 3.25) * (1 - k(t, 3.9, 4.2)));
    p.sym('bang', BX, FLOOR - 92, 1.3, k(t, 5.4, 5.5) * (1 - k(t, 6.1, 6.25)));
    for (let i = 0; i < 5; i++) p.sym('spark', BX + Math.cos(i * 1.26) * 36 * popped, FLOOR - 60 + Math.sin(i * 1.26) * 26 * popped, .8, popped * (1 - k(t, 7, 7.6)));
    p.say(BX - 10, FLOOR - 74, 'Yip!', { a: k(t, 6.5, 6.6) * (1 - k(t, 7.6, 7.8)), tail: -1 });
    for (let i = 0; i < 3; i++) { const q = (t * .5 + i / 3) % 1; p.sym('heart', B.head[0] - 10 + i * 24 + Math.sin(q * 6 + i) * 4, FLOOR + 6 - q * 60, .8, (1 - q) * k(t, 10.6, 11) * (1 - k(t, 15.5, 16.2))); }
    p.sym('heart', B.head[0], B.head[1] - 24, 1.1, k(t, 7.7, 7.9) * (1 - k(t, 8.8, 9.2)));
    p.sym('anger', 214, FLOOR - 82, 1, k(t, 14.6, 14.8) * (1 - k(t, 16.2, 16.6)), '#e0453a');
    p.sym('zzz', B.head[0] + 40, FLOOR + 2, .9, k(t, 15, 15.6));
    p.sym('zzz', 214, FLOOR - 70, .7, k(t, 17.4, 18), '#ffffff');
  },
};

// ── 4. Video call with Grandma: the camera has a mind of its own ──
const PX = 116, PY = 10, PW = 116, PH = 82; // the call window, top right
function grandma(p: Pen, t: number, mode: 'close' | 'forehead' | 'flip' | 'ok', wave: number, laugh: boolean) {
  const c = p.c, cx = PX + PW / 2, cy = PY + PH / 2;
  c.save(); c.beginPath(); c.rect(PX, PY, PW, PH); c.clip();
  c.fillStyle = '#cfe0d8'; c.fillRect(PX, PY, PW, PH); for (let x = PX + 6; x < PX + PW; x += 14) { c.fillStyle = '#c3d6cd'; c.fillRect(x, PY, 6, PH); }
  if (mode === 'flip') { c.translate(cx, cy); c.rotate(Math.PI); c.translate(-cx, -cy); }
  const g: PO = { front: true, skin: '#f1c9a5', hair: 'bun', hairC: '#e4e4ea', glasses: true, shirt: '#9b6fb0', mouth: laugh ? 'grin' : 'open', eyes: laugh ? 'happy' : 'open', blush: true };
  if (mode === 'close' || mode === 'forehead') { const s = 2.9, hyc = mode === 'close' ? cy + 10 + Math.sin(t * 2.3) * 5 : PY + PH + 8 + Math.sin(t * 1.7) * 4, hx = cx - 4 + Math.sin(t * 1.3) * 6;
    const r = 15 * s; dot(p, hx, hyc - r - 8, 17, '#d6d6de');
    p.person(hx, { ...g, s, hair: 'bald', y: hyc + 104 * s, mouth: Math.sin(t * 9) > 0 ? 'open' : 'o', eyes: mode === 'close' ? 'wide' : 'open' });
    for (const sd of [-1, 1]) { dot(p, hx + sd * (r - 2), hyc - 12, 13, '#e4e4ea'); dot(p, hx + sd * (r - 8), hyc - 26, 10, '#e4e4ea'); }
    const cc = p.c; cc.save(); cc.lineWidth = 1.6; cc.strokeStyle = '#d9a383'; for (let i = 0; i < 3; i++) { cc.beginPath(); cc.arc(hx, hyc - 6 + i * 7, 26 - i * 2, Math.PI * 1.35, Math.PI * 1.65); cc.stroke(); } cc.restore(); }
  else { p.picture(PX + 24, PY + 22, 22, 16, '#e7a2b4'); p.plant(PX + PW - 14, PY + PH, .7);
    p.person(cx, { ...g, s: .78, y: cy + 8 + 104 * .78, bob: laugh ? Math.abs(Math.sin(t * 9)) * 2 : 0, armR: wave > 0 ? { a: 2.5 + Math.sin(t * 9) * .35 * wave, b: .5 } : .1, armL: .1 }); }
  c.restore();
}
const call: Story = {
  id: 'video-call', title: 'Sunday call with Grandma', dur: 20,
  beats: [[0, 'Sunday evening: the call with Grandma.'], [2.8, 'Hi, Grandma! Bit close there…'], [6.4, 'Now it’s mostly forehead.'], [9.4, 'And now she’s upside down.'], [12.6, 'Nobody can stop laughing.'], [16, 'Same time next Sunday.']],
  draw(p: Pen, t: number) {
    const { k, FLOOR } = p;
    p.room({ wall: '#f1e2c6', floor: '#9a6a45', paper: 'stripes' });
    p.lamp(60, 1);
    p.picture(36, 92, 30, 24, '#7fa6c4');
    p.sofa(66, 120, '#c27a5a');
    const top = p.table(178, 66, 34, '#8a5a3b');
    p.laptop(178, top, 1, -1);
    p.cup(200, top, .8, t);
    const mode = t < 2.6 ? 'ring' : t < 6.2 ? 'close' : t < 9.2 ? 'forehead' : t < 12.4 ? 'flip' : 'ok';
    const laugh = t > 12.4 && t < 16, waving = t > 15.6 ? 1 - k(t, 18.6, 19.3) : 0;
    // the two on the sofa
    const adult: PO = { pose: 'sit', face: 1, skin: '#c68b5e', shirt: '#3f7f6f', pants: '#3b3f4a', hair: 'long', hairC: '#2b1d14' };
    const kid: PO = { pose: 'sit', face: 1, s: .62, skin: '#c68b5e', shirt: '#f2c94c', pants: '#5b6ea8', hair: 'curly', hairC: '#2b1d14' };
    const a: PO = { ...adult }, kd: PO = { ...kid };
    const lb = laugh ? Math.abs(Math.sin(t * 10)) * 2.5 : 0;
    if (mode === 'ring') { Object.assign(a, { mouth: 'smile', armR: { a: 1.2, b: .6 } }); Object.assign(kd, { bob: Math.abs(Math.sin(t * 8)) * 3, mouth: 'grin', armR: { a: 2.4, b: .3 } }); }
    else if (mode === 'close') { Object.assign(a, { lean: -.25 * k(t, 2.6, 3.1), eyes: 'wide', mouth: t > 3.8 ? 'grin' : 'o' }); Object.assign(kd, { lean: -.3 * k(t, 2.6, 3), eyes: 'wide', mouth: 'o', armL: { a: 2.6, b: .1 }, armR: { a: 2.6, b: .1 } }); }
    else if (mode === 'forehead') { Object.assign(a, { tilt: -.12, mouth: 'flat', eyes: 'open' }); Object.assign(kd, { mouth: 'open', armR: { a: 1.4 + Math.sin(t * 8) * .2, b: 1.3 } }); }
    else if (mode === 'flip') { const tl = k(t, 9.6, 10.4); Object.assign(a, { tilt: 1.15 * tl, mouth: 'o' }); Object.assign(kd, { tilt: -1.1 * k(t, 10, 10.8), mouth: 'grin', eyes: 'happy' }); }
    else { Object.assign(a, { eyes: laugh ? 'happy' : 'open', mouth: laugh ? 'grin' : 'smile', bob: lb, armR: waving > 0 ? { a: 2.4 + Math.sin(t * 8) * .3 * waving, b: .5 } : .15 });
      Object.assign(kd, { eyes: laugh ? 'happy' : 'open', mouth: laugh ? 'grin' : 'smile', bob: lb * 1.2, armR: waving > 0 ? { a: 2.5 + Math.sin(t * 9 + 1) * .35 * waving, b: .4 } : .15 }); }
    const A = p.person(44, a), K = p.person(96, kd);
    // the call window, with a hint of where it lives (the laptop)
    alpha(p, .18, () => { shape(p, [PX + 30, PY + PH, PX + PW - 10, PY + PH, 190, top - 6, 180, top - 22], '#ffffff'); });
    block(p, PX - 4, PY - 4, PW + 8, PH + 8, 6, '#1f232b');
    if (mode === 'ring') { const c = p.c; c.save(); c.fillStyle = '#2c3442'; c.fillRect(PX, PY, PW, PH); c.restore();
      for (let i = 0; i < 2; i++) { const q = (t * .9 + i / 2) % 1; alpha(p, (1 - q) * .6, () => { const cc = p.c; cc.beginPath(); cc.arc(PX + PW / 2, PY + 34, 12 + q * 22, 0, TAU); cc.lineWidth = 2; cc.strokeStyle = '#8fd4a8'; cc.stroke(); }); }
      dot(p, PX + PW / 2, PY + 34, 12, '#9b6fb0'); dot(p, PX + PW / 2, PY + 31, 5, '#f1c9a5'); dot(p, PX + PW / 2, PY + 24, 3.5, '#e4e4ea');
      p.text(PX + PW / 2, PY + 66, 'Calling Grandma…', 9, '#e8eef6'); }
    else grandma(p, t, mode, mode === 'ok' ? (laugh ? .3 : waving) : 0, laugh || (mode === 'ok' && t < 15.6));
    // own little picture, bottom right of the call
    if (mode !== 'ring') { block(p, PX + PW - 30, PY + PH - 22, 27, 19, 2, '#3a4250'); dot(p, PX + PW - 22, PY + PH - 12, 4, '#2b1d14'); dot(p, PX + PW - 11, PY + PH - 10, 3, '#2b1d14'); block(p, PX + PW - 27, PY + PH - 7, 22, 4, 1, '#3f7f6f'); }
    dot(p, PX + 7, PY + 7, 2.5, '#e8453a');
    // talk and feelings
    p.say(A.head[0] + 6, A.head[1] - 16, 'Too close!', { a: k(t, 3.9, 4.1) * (1 - k(t, 5.6, 5.8)) });
    p.say(K.head[0] + 4, K.head[1] - 12, 'Lower!', { a: k(t, 7, 7.2) * (1 - k(t, 8.6, 8.8)) });
    p.sym('bang', K.head[0] + 8, K.head[1] - 20, 1, k(t, 2.7, 2.85) * (1 - k(t, 3.6, 3.9)));
    p.sym('q', A.head[0] + 12, A.head[1] - 24, 1, k(t, 9.5, 9.7) * (1 - k(t, 11.6, 12)));
    for (let i = 0; i < 3; i++) { const q = (t * .45 + i / 3) % 1; p.sym('heart', 150 + i * 26 + Math.sin(q * 6 + i) * 4, PY + PH + 30 - q * 30, .8, (1 - q) * k(t, 16, 16.6)); }
    if (laugh) for (const [hx, hy] of [A.head, K.head] as Pt[]) p.text(hx + 20, hy - 18 - Math.abs(Math.sin(t * 10)) * 3, 'ha', 9, '#7a4a24');
  },
};

// ── 5. Plant parent: water a sprout, read a book, look up into a jungle ──
const VINES: [number, number[]][] = [ // [starts at growth, path]
  [0, [170, 232, 172, 200, 160, 166, 176, 128, 166, 92, 178, 56, 162, 24, 124, 13, 84, 15, 44, 11, 4, 20]],
  [.22, [170, 232, 192, 214, 210, 182, 224, 142, 232, 98, 238, 56, 244, 30]],
  [.32, [170, 230, 148, 220, 130, 198, 120, 164, 104, 130, 80, 110, 52, 104, 26, 112, 6, 132]],
  [.46, [170, 240, 196, 258, 222, 268, 246, 272]],
  [.52, [168, 242, 140, 264, 106, 278, 70, 286, 30, 294, -4, 298]],
  [.7, [124, 13, 118, 40, 124, 66, 118, 92]],
  [.76, [44, 11, 48, 40, 42, 64]],
  [.8, [216, 168, 200, 140, 196, 112]],
];
function vine(p: Pen, P: number[], f: number, g: number, seed: number, t: number) {
  if (f <= 0) return;
  let total = 0; const segs: number[] = []; for (let i = 2; i < P.length; i += 2) { const d = Math.hypot(P[i] - P[i - 2], P[i + 1] - P[i - 1]); segs.push(d); total += d; }
  const len = total * f, c = p.c, pts: Pt[] = [[P[0], P[1]]];
  let acc = 0; for (let i = 0; i < segs.length && acc < len; i++) { const q = Math.min(1, (len - acc) / segs[i]); pts.push([p.lerp(P[i * 2], P[i * 2 + 2], q), p.lerp(P[i * 2 + 1], P[i * 2 + 3], q)]); acc += segs[i]; }
  c.save(); c.beginPath(); c.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length - 1; i++) { const mx = (pts[i][0] + pts[i + 1][0]) / 2, my = (pts[i][1] + pts[i + 1][1]) / 2; c.quadraticCurveTo(pts[i][0], pts[i][1], mx, my); }
  const L = pts[pts.length - 1]; c.lineTo(L[0], L[1]); c.lineWidth = 1.5 + g * 2.5; c.strokeStyle = '#4c7a3a'; c.lineCap = 'round'; c.stroke(); c.restore();
  // leaves along the way, bigger the older they are
  acc = 0; let n = 0;
  for (let i = 0; i < segs.length; i++) { const ax = P[i * 2], ay = P[i * 2 + 1], bx = P[i * 2 + 2], by = P[i * 2 + 3], ang = Math.atan2(by - ay, bx - ax);
    for (let d = 6; d < segs[i]; d += 11) { const at = acc + d; if (at > len) return; const age = p.clamp((len - at) / 50, 0, 1), q = d / segs[i], lx = p.lerp(ax, bx, q), ly = p.lerp(ay, by, q), side = n % 2 ? 1 : -1, r = p.rnd(seed * 31 + n);
      const sz = (4 + g * 7 + r * 3) * age, la = ang + side * (1 + r * .5) + Math.sin(t * 1.5 + n) * .06, ox = lx + Math.cos(la) * sz * .8, oy = ly + Math.sin(la) * sz * .8;
      oval(p, ox, oy, sz, sz * .45, n % 3 ? '#4f9a4a' : '#3e8040', la); ln(p, lx, ly, ox + Math.cos(la) * sz * .7, oy + Math.sin(la) * sz * .7, .7, '#2f6a30');
      if (g > .85 && n % 5 === 2) { const fl = p.clamp((g - .85) / .15, 0, 1) * age; for (let j = 0; j < 5; j++) dot(p, lx + Math.cos(j * 1.26) * 3.5 * fl, ly + Math.sin(j * 1.26) * 3.5 * fl, 2.6 * fl, r > .5 ? '#f27aa0' : '#f7a64a'); dot(p, lx, ly, 1.6 * fl, '#f7d35c'); }
      n++; }
    acc += segs[i]; }
}
const plant: Story = {
  id: 'plant-parent', title: 'Plant parent', dur: 22,
  beats: [[0, 'A tiny sprout. A tiny watering can.'], [4.4, 'Now: patience, and a good book.'], [7, 'Days pass. Then weeks.'], [11.6, 'It’s doing… really well.'], [16.2, 'Home sweet jungle.']],
  draw(p: Pen, t: number) {
    const { k, at, FLOOR } = p;
    const hr = at(t, [[6.5, 10], [14, 10 + 24 * 6]], p.ease.io), day = p.clamp(.55 + .9 * Math.sin((hr - 6) / 24 * TAU), 0, 1), night = 1 - day;
    p.room({ wall: '#efe3cf', floor: '#9a7354', paper: 'plain' });
    p.window(196, 84, 50, 58, p.mix('#1b2440', '#8fc6ee', day));
    if (day > .3) alpha(p, day, () => dot(p, 184, 70, 6, '#ffe37a')); else dot(p, 208, 72, 4.5, '#eef0ff');
    p.clock(116, 46, hr);
    p.lamp(60, .3 + night * .7);
    p.armchair(48, '#5a7fb0', 1);
    // the pile of finished books
    const books = Math.floor(at(t, [[7, 0], [14, 7]], p.ease.lin));
    for (let i = 0; i < books; i++) block(p, 92 + (p.rnd(i * 5) - .5) * 6, FLOOR - 7 - i * 7, 26 - p.rnd(i * 3) * 6, 7, 1, ['#b44a3e', '#3e6db4', '#d6a640', '#5c8a4d', '#7a4f8f'][i % 5]);
    // the plant parent
    const g = at(t, [[6.6, 0], [14.5, 1]], p.ease.in);
    let x = 126; const who: PO = { face: 1, skin: '#e0ac7e', shirt: '#d9825b', pants: '#5a6b4a', hair: 'bun', hairC: '#5a3a24', glasses: true };
    const o: PO = { ...who }; let can: Pt | null = null, book = false;
    if (t < 4.2) { Object.assign(o, { eyes: t > 2.6 ? 'happy' : 'open', mouth: 'smile', lean: 0 }); o.armR = reach(x, o, 'R', 148, 196); o.armL = .1; can = [148, 196]; }
    else if (t < 6) { x = at(t, [[4.2, 126], [6, 52]], p.ease.lin); Object.assign(o, { face: -1, pose: 'walk', ph: t * 8, armR: .3, armL: -.3, mouth: 'smile' }); }
    else { x = 50; Object.assign(o, { pose: 'sit', y: FLOOR - 40, mouth: 'smile' }); book = true;
      const up = k(t, 14.6, 15.2) * (1 - k(t, 18.6, 19.4));
      Object.assign(o, { tilt: -.35 * up, eyes: up > .5 ? 'happy' : 'open', mouth: up > .5 ? 'grin' : 'smile' });
      o.armR = reach(x, o, 'R', 76, 182 - up * 4); o.armL = reach(x, o, 'L', 70, 180 - up * 4); }
    const B = p.person(x, o);
    if (can) { const tilt = at(t, [[.8, 0], [1.4, .75], [3.4, .75], [3.9, 0]]), tip = wateringCan(p, B.rh[0] - 4, B.rh[1] - 4, tilt);
      if (tilt > .5) for (let i = 0; i < 5; i++) { const q = (t * 2.4 + i / 5) % 1; p.sym('drop', p.lerp(tip[0], 169, q) + (i % 2) * 2, p.lerp(tip[1], 230, q), .8, 1); } }
    if (book) { const flip = (t * .7) % 1 < .08 && t < 14.4; p.book(B.rh[0] - 1, B.rh[1] - 4, true, '#3e6db4', -.25); if (flip) shape(p, [B.rh[0] - 1, B.rh[1] - 7, B.rh[0] + 8, B.rh[1] - 14, B.rh[0] + 4, B.rh[1] - 4], '#fffaf0'); }
    // the pot (it stays tiny) and the sprout that refuses to
    block(p, 161, FLOOR - 16, 18, 16, 3, '#b8643e'); block(p, 159, FLOOR - 18, 22, 5, 2, '#a35634');
    if (g < .05) { ln(p, 170, FLOOR - 16, 170, FLOOR - 26, 1.5, '#4c7a3a'); oval(p, 166, FLOOR - 27, 4, 2, '#5fae52', -.5); oval(p, 174, FLOOR - 28, 4, 2, '#5fae52', .5); }
    VINES.forEach(([s0, P], i) => vine(p, P, p.clamp((g - s0) / .42, 0, 1), g, i + 1, t));
    // night falls and lifts, quickly
    p.dark(night * .3);
    p.light(60, 70, 110, '#ffd890', .22 * night);
    // the bird who moves in
    if (t > 14.8) { const q = k(t, 14.8, 15.8, p.ease.out), bx = p.lerp(250, 104, q), by = p.lerp(60, 126, q) - Math.sin(q * Math.PI) * 14; p.bird(bx, by, { face: -1, flap: q < 1 ? t * 30 : 0, color: '#f2c94c' }); if (q >= 1) p.sym('note', 92, 104 - ((t * .8) % 1) * 16, .8, 1 - (t * .8) % 1); }
    p.sym('heart', 150, FLOOR - 80, 1, k(t, 2.6, 2.9) * (1 - k(t, 3.8, 4.2)));
    p.sym('heart', 72, 120, 1, k(t, 16.4, 16.8) * (1 - k(t, 18.2, 18.8)));
  },
};

export const STORIES_B: Story[] = [dance, dinner, puppy, call, plant];
