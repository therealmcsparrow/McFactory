// Window stories, set D (see pen.ts for the kit and the Story shape; stories.ts collects every set).
import type { Pen, Story } from './pen.js';

type Opts = NonNullable<Parameters<Pen['person']>[1]>;
type ArmK = { a: number; b: number };
type Pt = [number, number];
const TAU = Math.PI * 2;

// ── small local helpers (each saves and restores the context) ──

/** Runs fn with the context moved to (x, y), turned by rot and scaled by s. */
function at0(p: Pen, x: number, y: number, rot: number, s: number, fn: () => void) { const c = p.c; c.save(); c.translate(x, y); c.rotate(rot); c.scale(s, s); fn(); c.restore(); }
function disc(p: Pen, x: number, y: number, r: number, col: string) { const c = p.c; c.beginPath(); c.arc(x, y, Math.max(0, r), 0, TAU); c.fillStyle = col; c.fill(); }
function oval(p: Pen, x: number, y: number, rx: number, ry: number, col: string, rot = 0) { const c = p.c; c.beginPath(); c.ellipse(x, y, Math.max(0, rx), Math.max(0, ry), rot, 0, TAU); c.fillStyle = col; c.fill(); }
function seg(p: Pen, x0: number, y0: number, x1: number, y1: number, w: number, col: string) { const c = p.c; c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.lineWidth = w; c.strokeStyle = col; c.lineCap = 'round'; c.stroke(); }
function shape(p: Pen, P: number[], col: string) { const c = p.c; c.beginPath(); c.moveTo(P[0], P[1]); for (let i = 2; i < P.length; i += 2) c.lineTo(P[i], P[i + 1]); c.closePath(); c.fillStyle = col; c.fill(); }
function alpha(p: Pen, a: number, fn: () => void) { if (a <= 0) return; const c = p.c; c.save(); c.globalAlpha *= Math.min(1, a); fn(); c.restore(); }

/** Two-link arm solve: the Arm that puts a side-view hand (facing +x, scale 1) from shoulder (sx, sy) at (tx, ty). */
function reach(sx: number, sy: number, tx: number, ty: number, elbow: 1 | -1): ArmK {
  const dx = tx - sx, dy = ty - sy, d = Math.max(4, Math.min(38.6, Math.hypot(dx, dy)));
  const phi = Math.atan2(dx, dy), al = Math.acos(Math.max(-1, Math.min(1, (400 + d * d - 361) / (40 * d))));
  const a = phi + elbow * al, ux = sx + Math.sin(a) * 20, uy = sy + Math.cos(a) * 20;
  return { a, b: Math.atan2(tx - ux, ty - uy) - a };
}

/** A soap bubble. */
function bubble(p: Pen, x: number, y: number, r: number, a = 1) {
  if (r <= .5 || a <= 0) return; const c = p.c; c.save(); c.globalAlpha *= Math.min(1, a);
  disc(p, x, y, r, 'rgba(246,250,255,.88)'); c.beginPath(); c.arc(x, y, r, 0, TAU); c.lineWidth = 1; c.strokeStyle = 'rgba(150,185,225,.9)'; c.stroke();
  c.beginPath(); c.arc(x, y, r * .72, Math.PI * 1.1, Math.PI * 1.45); c.lineWidth = Math.max(1, r * .12); c.strokeStyle = 'rgba(255,255,255,1)'; c.stroke();
  oval(p, x + r * .35, y + r * .4, r * .18, r * .1, 'rgba(255,190,230,.55)', -.6); c.restore();
}
/** A rubber duck, (x, y) the waterline under it. */
function duck(p: Pen, x: number, y: number, f: 1 | -1 = 1, s = 1, rot = 0) {
  at0(p, x, y, rot, s, () => { p.c.scale(f, 1); oval(p, 0, -6, 10, 6.5, '#f7cf3c'); shape(p, [-9, -9, -14, -13, -8, -4], '#f7cf3c'); disc(p, 5, -15, 6, '#f7cf3c');
    shape(p, [10, -16, 16, -14, 10, -12.5], '#ef8a2a'); disc(p, 7, -17, 1.2, '#2a2420'); oval(p, -2, -7, 5, 2.6, '#e8b92c', -.2); });
}
/** A crumpled paper ball. */
function paperBall(p: Pen, x: number, y: number, r = 6, seed = 1) {
  disc(p, x, y, r, '#f6f1e4'); for (let i = 0; i < 3; i++) { const a = p.rnd(seed * 7 + i) * TAU; seg(p, x + Math.cos(a) * r * .7, y + Math.sin(a) * r * .7, x + Math.cos(a + 2) * r * .3, y + Math.sin(a + 2) * r * .3, .8, '#b9b0a0'); }
  oval(p, x - r * .3, y - r * .35, r * .35, r * .2, '#ffffff');
}
/** A sheet of paper held up (or crumpling: k 0 flat → 1 a ball). */
function sheet(p: Pen, x: number, y: number, k: number, lines: number, seed: number) {
  if (k >= .85) { paperBall(p, x, y, 6, seed); return; }
  const w = 22 * (1 - k * .7), h = 28 * (1 - k * .7); at0(p, x, y, (p.rnd(seed) - .5) * .2 + k * .8, 1, () => {
    shape(p, [-w / 2, -h / 2, w / 2, -h / 2 + k * 4, w / 2 - k * 3, h / 2, -w / 2 + k * 2, h / 2 - k * 3], '#fbf7ee');
    for (let i = 0; i < Math.min(5, lines); i++) seg(p, -w / 2 + 3, -h / 2 + 5 + i * 4.5, -w / 2 + 3 + (w - 7) * (i === Math.floor(lines) ? lines % 1 : 1) * (.6 + p.rnd(seed + i) * .4), -h / 2 + 5 + i * 4.5, .8, '#6a7ba8');
  });
}
/** A desk lamp standing at (x, y), its head facing left. */
function deskLamp(p: Pen, x: number, y: number, on: number) {
  oval(p, x, y - 1.5, 10, 3, '#3a4552'); seg(p, x, y - 2, x + 6, y - 30, 2.5, '#3a4552'); seg(p, x + 6, y - 30, x - 8, y - 44, 2.5, '#3a4552');
  shape(p, [x - 4, y - 50, x - 18, y - 36, x - 6, y - 32], '#4f6a86'); if (on > 0) p.light(x - 14, y - 20, 70, '#ffe2a0', .35 * on);
}
/** A wire waste basket on the floor at x. */
function basket(p: Pen, x: number, front: boolean) {
  const y0 = p.FLOOR - 30, y1 = p.FLOOR + 2;
  if (!front) { oval(p, x, y0, 15, 3.5, '#4b5358'); return; }
  shape(p, [x - 15, y0, x + 15, y0, x + 11, y1, x - 11, y1], 'rgba(120,135,140,.92)');
  for (let i = -2; i <= 2; i++) seg(p, x + i * 6, y0, x + i * 4.4, y1, .8, '#5d686d'); seg(p, x - 15, y0, x + 15, y0, 2, '#5d686d');
}
/** An upside-down top hat on a table at (x, y): its open crown up. inner: drawn before what sits inside it. */
function hat(p: Pen, x: number, y: number, part: 'inner' | 'outer', wob = 0) {
  at0(p, x, y, wob, 1, () => {
    if (part === 'inner') { oval(p, 0, -24, 12.5, 3.2, '#0e0d12'); return; }
    shape(p, [-12, -24, 12, -24, 11, -2, -11, -2], '#24222c'); oval(p, 0, -24, 12.5, 3.2, 'rgba(0,0,0,0)'); p.c.strokeStyle = '#3a3846'; p.c.lineWidth = 1.2; p.c.stroke();
    shape(p, [-11.6, -9, 11.6, -9, 11.3, -4, -11.3, -4], '#8e2b52'); oval(p, 0, -2, 19, 3.6, '#18171d');
  });
}
/** A wand in a hand at (x, y) pointing at angle a (0 = up, positive leans right). */
function wand(p: Pen, x: number, y: number, a: number, sp = 0) {
  const ex = x + Math.sin(a) * 22, ey = y - Math.cos(a) * 22; seg(p, x - Math.sin(a) * 4, y + Math.cos(a) * 4, ex, ey, 2.4, '#16151a'); seg(p, ex - Math.sin(a) * 4, ey + Math.cos(a) * 4, ex, ey, 2.6, '#f4f1ea');
  if (sp > 0) p.sym('spark', ex + Math.sin(a) * 6, ey - Math.cos(a) * 6, .7 + sp * .4, sp);
}
/** A smoke puff of radius r. */
function smoke(p: Pen, x: number, y: number, r: number, a: number, seed = 3) {
  alpha(p, a, () => { for (let i = 0; i < 9; i++) { const an = p.rnd(seed + i) * TAU, d = p.rnd(seed * 3 + i) * r * .6; disc(p, x + Math.cos(an) * d, y + Math.sin(an) * d * .8, r * (.35 + p.rnd(seed * 5 + i) * .3), i % 2 ? '#c9c6cf' : '#aeaab6'); } });
}
/** A striped sock hanging from (x, y). */
function sock(p: Pen, x: number, y: number) {
  seg(p, x, y, x, y + 16, 7, '#f4efe6'); seg(p, x, y + 16, x + 7, y + 19, 7, '#f4efe6'); for (const d of [3, 8]) seg(p, x - 3.5, y + d, x + 3.5, y + d, 1.6, '#d9475a'); oval(p, x + 8, y + 19, 3, 3, '#d9475a');
}
/** A cape behind a front-facing person at x (scale s, feet y). */
function cape(p: Pen, x: number, y: number, s: number, sw: number, col: string) {
  const top = y - 90 * s, bot = y - 8 * s; shape(p, [x - 11 * s, top, x + 11 * s, top, x + (24 + sw) * s, bot, x - (24 - sw) * s, bot], col);
  shape(p, [x - 12 * s, top - 4 * s, x + 12 * s, top - 4 * s, x + 16 * s, top + 4 * s, x - 16 * s, top + 4 * s], p.mix(col, '#000000', .3));
}
/** A towel draped over a head at (hx, hy). */
function towelHead(p: Pen, hx: number, hy: number, f: number, col: string) {
  const c = p.c; c.beginPath(); c.arc(hx, hy, 18, Math.PI * 1.02, Math.PI * 1.98); c.lineTo(hx + 18 - f * 4, hy + 18); c.lineTo(hx + 12, hy + 20); c.lineTo(hx + 12, hy - 2);
  c.lineTo(hx - 12, hy - 2); c.lineTo(hx - 13, hy + 22); c.lineTo(hx - 19, hy + 20); c.closePath(); c.fillStyle = col; c.fill(); seg(p, hx - 16, hy + 14, hx - 13, hy + 14, 2, '#ffffff'); seg(p, hx + 13, hy + 13, hx + 16, hy + 13, 2, '#ffffff');
}
/** A broken umbrella held at (x, y), turned inside out. */
function brokenBrolly(p: Pen, x: number, y: number, rot: number, col: string) {
  at0(p, x, y, rot, 1, () => {
    const c = p.c; seg(p, 0, 0, 2, -40, 1.6, '#333'); c.beginPath(); c.arc(3, 0, 3.5, 0, Math.PI); c.lineWidth = 1.6; c.strokeStyle = '#333'; c.stroke();
    c.beginPath(); c.moveTo(-20, -60); c.quadraticCurveTo(0, -36, 2, -40); c.quadraticCurveTo(14, -40, 26, -66); c.lineTo(10, -54); c.lineTo(4, -62); c.lineTo(-6, -52); c.closePath(); c.fillStyle = col; c.fill();
    for (const [ex, ey] of [[-24, -64], [30, -70], [12, -66], [-8, -58]] as Pt[]) seg(p, 2, -40, ex, ey, .9, '#444');
  });
}
/** A rainy night seen through a back-wall window. */
function windowRain(p: Pen, x: number, y: number, w: number, h: number, t: number, flash: number) {
  const c = p.c; c.save(); c.beginPath(); c.rect(x - w / 2, y - h / 2, w, h); c.clip();
  if (flash > 0) { c.globalAlpha = flash; c.fillStyle = '#dfe8ff'; c.fillRect(x - w / 2, y - h / 2, w, h); c.globalAlpha = 1; }
  for (let i = 0; i < 18; i++) { const r = p.rnd(i * 5.3 + 1), xx = x - w / 2 + r * w, yy = y - h / 2 + ((t * 140 + p.rnd(i) * h * 3) % (h + 20)) - 10; seg(p, xx, yy, xx - 2, yy + 9, 1, 'rgba(200,215,240,.55)'); }
  c.restore();
}
/** An exercise mat seen from the front, its front edge at y. */
function mat(p: Pen, x0: number, x1: number, y: number, col: string) {
  oval(p, (x0 + x1) / 2, y + 4, (x1 - x0) / 2 + 4, 4, 'rgba(0,0,0,.2)');
  shape(p, [x0 + 6, y - 9, x1 - 6, y - 9, x1, y, x0, y], col); shape(p, [x0, y, x1, y, x1, y + 3, x0, y + 3], p.mix(col, '#000000', .3));
  shape(p, [x0 + 6, y - 9, x1 - 6, y - 9, x1 - 5, y - 7.5, x0 + 5, y - 7.5], p.mix(col, '#ffffff', .2));
}

// ── Home workout: push-ups on the mat; the cat climbs aboard; both end up napping ──
const MAT = 280;
/** A person in a plank, face down, feet at (fx, fy), the body turned up by th (radians): drawn in a transposed frame. */
function plank(p: Pen, fx: number, fy: number, th: number, o: Opts, hand: number | null) {
  const cs = Math.cos(th), sn = Math.sin(th);
  const toW = (lx: number, ly: number): Pt => [fx + ly * cs - lx * sn, fy + ly * sn + lx * cs];
  const toL = (wx: number, wy: number): Pt => { const dx = wx - fx, dy = wy - fy, X = dx * cs + dy * sn, Y = -dx * sn + dy * cs; return [Y, X]; };
  let armL: Opts['armL'] = o.armL, armR: Opts['armR'] = o.armR;
  if (hand != null) { const [lx, ly] = toL(hand, MAT - 1), [lx2, ly2] = toL(hand - 6, MAT - 2); armR = reach(2, -84, lx, ly, -1); armL = reach(-4, -84, lx2, ly2, -1); }
  const c = p.c; c.save(); c.translate(fx, fy); c.rotate(th); c.transform(0, 1, 1, 0, 0, 0);
  p.person(0, { ...o, y: 0, pose: 'stand', face: 1, front: false, armL, armR }); c.restore();
  return { head: toW(2, -104), back: (ly: number) => toW(-13, ly) };
}
const workout: Story = {
  id: 'home-workout', title: 'The personal trainer', dur: 19,
  beats: [[0, 'Day one of the new, fitter me.'], [3.4, 'Push-ups. Easy! One, two, three…'], [7.2, 'A personal trainer walks in.'], [9.4, 'The trainer adds extra weight.'], [12.4, 'Okay. That is enough for day one.'], [14.8, 'Rest is part of the program.']],
  draw(p: Pen, t: number) {
    const { k, at, FLOOR } = p;
    p.room({ wall: '#cfe0d6', floor: '#a9825e', paper: 'stripes' });
    p.window(56, 92, 56, 64, '#1d2a48'); p.plant(20, FLOOR - 2, .9); p.clock(122, 44, 7.1 + t / 900);
    // a workout video on the telly: the trainer on screen never gets tired
    p.tv(184, 100, 1, '#9fd6ff', 64);
    { const d = Math.max(0, Math.sin(t * Math.PI / .8)) * 4, sx = 184, sy = 110; seg(p, sx - 16, sy, sx + 8, sy - 6 + d * .8, 2, '#1d3550'); disc(p, sx + 12, sy - 8 + d, 3, '#1d3550'); seg(p, sx + 6, sy - 5 + d * .7, sx + 6, sy + 2, 1.6, '#1d3550'); }
    mat(p, 64, 222, MAT, '#4fa39a');
    const who: Opts = { shirt: '#e0645a', pants: '#3b3f4a', hair: 'pony', hairC: '#5a3a22', skin: '#f1c9a5', shoes: '#f4f4f4' };
    // the plank's angle: three push-ups, a held plank, then the cat's weight, a heroic struggle, the collapse
    const reps = t > 3.4 && t < 7 ? (1 - Math.cos((t - 3.4) / 1.2 * TAU)) / 2 * .22 : 0;
    let th = at(t, [[3.4, .36], [9.4, .36], [9.9, .14], [11.3, .25], [12.1, .23], [12.5, 0]]) - reps;
    const strain = k(t, 9.4, 9.6) * (1 - k(t, 12.3, 12.5)); th += p.wave(t, .09, .012) * strain;
    if (t > 12.5) th = Math.max(0, p.wave(t, 3.2, .006) + .006);
    const fx = 204, fy = MAT - 11, flat = t > 12.5;
    let head: Pt = [140, 140], backAt: ((ly: number) => Pt) | null = null;
    if (t < 3.3) {
      // jumping jacks, facing the window
      const J = (1 - Math.cos(t * TAU / .75)) / 2, B = p.person(140, { ...who, front: true, y: MAT - 4, armL: { a: .2 + J * 2.6, b: .1 }, armR: { a: .2 + J * 2.6, b: .1 }, bob: J * 6, mouth: 'grin', eyes: t > 2.4 ? 'happy' : 'open' });
      head = B.head;
    } else {
      const R = plank(p, fx, fy, th, { ...who, mouth: strain > .5 ? 'o' : flat ? 'flat' : 'grin', eyes: flat ? 'closed' : t > 9.3 && t < 10 ? 'wide' : strain > .5 ? 'closed' : 'open', armL: { a: 2.9, b: .05 }, armR: { a: 2.8, b: .1 } }, flat ? null : 116);
      head = R.head; backAt = R.back;
      if (t < 3.6) p.sym('spark', 150, MAT - 40, 1, 1 - k(t, 3.3, 3.6));
    }
    // the cat: watches from the corner, strolls over, hops on the back, rides it, then naps there
    const cy = MAT + 14;
    if (t < 7.2) p.cat(36, MAT + 6, { sit: true, face: 1, tail: p.wave(t, 1.6), color: '#e0a15a', s: .9 });
    else if (t < 8.8) p.cat(p.lerp(36, 132, k(t, 7.2, 8.8, p.ease.lin)), cy, { face: 1, ph: t * 11, color: '#e0a15a', s: .9 });
    else if (backAt) {
      const [bx, by] = backAt(-72), j = k(t, 8.8, 9.35, p.ease.lin), x = p.lerp(132, bx, j), y = p.lerp(cy, by, j) - Math.sin(j * Math.PI) * 34;
      at0(p, x, y, j < 1 ? 0 : th, 1, () => { if (t > 13.6) p.cat(0, 1, { sleep: true, face: 1, color: '#e0a15a', s: .9 }); else p.cat(0, 1, { sit: j >= 1, face: 1, ph: t * 11, tail: p.wave(t, 1.2), color: '#e0a15a', s: .9 }); });
      p.sym('zzz', bx + 14, by - 26 - p.wave(t, 2, 2), .8, k(t, 15, 15.6));
      if (j >= 1 && t < 12.5) p.sym('heart', bx + 10, by - 40, .7, k(t, 10, 10.3) * (1 - k(t, 11, 11.4)));
    }
    // counting, sweat, the collapse, the snooze
    const [hx, hy] = head;
    if (t > 3.4 && t < 7.6) { const n = Math.floor((t - 3.4) / 1.2); const ph = ((t - 3.4) / 1.2) % 1; if (ph > .5 || t > 7) p.say(hx + 4, hy - 16, ['One!', 'Two!', 'Three!', 'Three!'][Math.min(3, n)], { a: 1 }); }
    if (t > 10.4 && t < 12.2) p.say(hx + 4, hy - 16, 'Four…?', { a: k(t, 10.4, 10.6) });
    if (strain > 0) for (let i = 0; i < 3; i++) { const ph = (t * 1.3 + i / 3) % 1; p.sym('drop', hx - 6 + i * 10, hy - 14 + ph * 24, .7, strain * (1 - ph)); }
    p.sym('bang', hx + 6, hy - 22, 1.2, k(t, 9.3, 9.45) * (1 - k(t, 9.9, 10.1)));
    if (t > 12.5 && t < 13.8) p.say(hx + 4, hy - 12, 'Oof.', { a: k(t, 12.5, 12.7) * (1 - k(t, 13.5, 13.8)) });
    p.sym('zzz', hx - 4, hy - 18 - p.wave(t, 2.4, 2), .9, k(t, 14.4, 15));
  },
};

// ── Bath time: one kid, one duck, too much bubble soap ──
const bath: Story = {
  id: 'bath-time', title: 'A little more bubbles', dur: 20,
  beats: [[0, 'Bath time. One kid, one duck.'], [3, 'Just a little bubble soap…'], [6, '…okay, a lot of bubble soap.'], [8.6, 'Someone comes to check.'], [12, 'Where did everyone go?'], [15.2, 'Found them!']],
  draw(p: Pen, t: number) {
    const { k, at, FLOOR, W, H } = p, c = p.c;
    p.room({ wall: '#cfe8ec', floor: '#b9a891', paper: 'tiles', trim: '#8fb7bf' });
    // a mirror, a towel bar, a shelf of bottles
    p.c.fillStyle = '#e9f4f6'; p.c.fillRect(116, 54, 40, 50); seg(p, 116, 54, 156, 54, 3, '#9fb9bf'); oval(p, 128, 66, 4, 9, 'rgba(255,255,255,.6)', .4);
    p.shelf(60, 96, 56, 4);
    const doorOpen = at(t, [[8.4, 0], [9, .95]]);
    p.door(210, doorOpen, '#e9e2d4');
    const bx = 92, bw = 136, rim = FLOOR - 56;
    // the kid, behind the bath's front: bare shoulders above the rim
    const kidX = 84, splash = t < 3 ? p.wave(t, .5) : 0, pour = k(t, 3, 3.4) * (1 - k(t, 7.2, 7.6)), reveal = k(t, 14.8, 15.6);
    const kidHappy = t > 15.2;
    const kid = p.person(kidX, { front: true, s: .62, y: FLOOR - 18 - (t < 3 ? Math.abs(splash) * 2 : 0), skin: '#9b6640', shirt: '#9b6640', pants: '#9b6640', hair: 'curly', hairC: '#1e1610',
      armL: kidHappy ? { a: 2.6 + p.wave(t, .4, .2), b: .2 } : t < 3 ? { a: 1.2 + splash * .6, b: .5 } : pour > 0 ? { a: 1.1, b: .6 } : { a: 1.3, b: .5 },
      armR: kidHappy ? { a: 2.6 - p.wave(t, .4, .2), b: .2 } : t < 3 ? { a: 1.2 - splash * .6, b: .5 } : pour > 0 ? { a: 2.2 + p.wave(t, .6, .15), b: .5 } : { a: 1.3, b: .5 },
      mouth: kidHappy ? 'grin' : t > 5.6 && t < 8 ? 'open' : 'grin', eyes: kidHappy ? 'happy' : t > 9 ? 'wide' : 'open', blush: true });
    // the bottle of bubble soap, tipped over the water
    if (pour > 0) { const [x, y] = kid.rh; at0(p, x, y, 2.3 + p.wave(t, .6, .15), 1, () => p.bottle(0, 12, '#d65aa0'));
      for (let i = 0; i < 3; i++) { const ph = (t * 2 + i / 3) % 1; p.sym('drop', x + 14 + i * 2, y + 6 + ph * 18, .5, pour * (1 - ph), '#f19ad0'); } }
    // the parent: opens the door, steps in, looks… then is gone in the foam; found again soaked and laughing
    const parentX = at(t, [[8.8, 212], [10.4, 182]], p.ease.lin), walking = t > 8.8 && t < 10.4;
    const soaked = t > 13, laugh = reveal > 0 ? Math.abs(p.wave(t, .7, 3)) * (1 - k(t, 18, 19.4)) : 0;
    let P: { head: Pt } | null = null;
    if (t > 8.6) P = p.person(parentX, { pose: walking ? 'walk' : 'stand', ph: t * 8, face: -1, front: reveal > .5, skin: '#9b6640', hair: 'bun', hairC: soaked ? '#120c08' : '#2b1d14',
      shirt: soaked ? '#5a7f8a' : '#7fa06a', pants: soaked ? '#363648' : '#4a4a58', mouth: reveal > .5 ? 'grin' : t > 10.6 ? 'o' : 'smile', eyes: reveal > .5 ? 'happy' : t > 10.6 ? 'wide' : 'open',
      armL: reveal > .5 ? { a: .5 + laugh * .05, b: 1.6 } : t > 10.6 ? { a: 2.5, b: .2 } : .2, armR: reveal > .5 ? { a: .5, b: 1.6 } : t > 10.6 ? { a: 2.7, b: .1 } : .3, bob: laugh });
    p.bath(bx, bw);
    // the duck: bobbing on the water, sails over the sea of foam, lands on a head
    const foamH = at(t, [[3.8, 0], [6, 8], [8, 15], [9.5, 20]]);
    // foam piled on the bath
    for (let i = 0; i < 15; i++) { const xx = bx - bw / 2 + 8 + i * (bw - 16) / 14, hh = foamH * (.6 + p.rnd(i * 3) * .5) * Math.min(1, Math.sin((i + .5) / 15 * Math.PI) * 1.6);
      bubble(p, xx, rim + 4 - hh * .5, 5 + hh * .45, k(t, 3.6, 4.4) * (1 - reveal)); }
    if (t < 4) duck(p, 128 + p.wave(t, 3, 6), rim + 6 + p.wave(t, .9, 1.2), 1);
    // the room fills with bubbles
    const fill = k(t, 10.2, 12) * (1 - k(t, 14.8, 15.6));
    if (fill > 0) { c.save(); c.globalAlpha = fill * .92; c.fillStyle = '#eef5fb'; c.fillRect(0, 0, W, H); c.restore(); }
    for (let i = 0; i < 110; i++) {
      const r0 = p.rnd(i * 3.1), r1 = p.rnd(i * 7.7 + 2), r2 = p.rnd(i * 5.3 + 4), r3 = p.rnd(i * 2.3 + 9);
      const t0 = 9.2 + r3 * 1.4, sp = k(t, t0, t0 + 2.2, p.ease.out);
      if (sp <= 0) continue;
      const sx = bx - 50 + r2 * 100, x = p.lerp(sx, -20 + r0 * (W + 40), sp), y = p.lerp(rim - 6, -20 + r1 * (H + 30), sp);
      const pop = 14.7 + p.rnd(i * 9.1) * 1.2, keep = i < 7;
      let r = p.lerp(5, 18 + r3 * 18, sp) * (keep ? .45 : 1 - k(t, pop, pop + .18, p.ease.lin));
      const yy = keep && t > pop ? y - (t - pop) * 14 : y; if (keep && t > 18.4) r *= 1 - k(t, 18.4, 19);
      bubble(p, x + p.wave(t + i, 2.4, 2), yy + p.wave(t + i * .7, 3, 2), r);
    }
    // the duck rides the foam, then lands on the parent's head
    if (t > 9.6) {
      const sail = k(t, 11.6, 14.6, p.ease.lin), hd = P ? P.head : [182, 140] as Pt;
      const x = t < 11.6 ? p.lerp(110, 50, k(t, 9.6, 11.6)) : p.lerp(50, hd[0], sail), yS = t < 11.6 ? p.lerp(rim - 34, 96, k(t, 9.6, 11.6)) : 96 + p.wave(t, 1.1, 4);
      const land = k(t, 14.8, 15.5), y = p.lerp(yS, hd[1] - 24, land);
      if (reveal > 0 && P) { for (let i = 0; i < 7; i++) bubble(p, hd[0] - 15 + i * 5, hd[1] - 14 - (i % 2) * 5, 7.5, reveal); }
      duck(p, x, y, t < 11.6 ? -1 : 1, 1, land < 1 ? p.wave(t, 1.1, .12) : 0);
    }
    if (P && reveal > 0) { const [hx, hy] = P.head; for (let i = 0; i < 5; i++) { const ph = (t * .9 + i / 5) % 1; p.sym('drop', hx - 20 + i * 10, hy + 10 + ph * 60, .6, reveal * (1 - ph) * (1 - k(t, 18.5, 19.4))); }
      p.sym('heart', (hx + kid.head[0]) / 2, 118 - k(t, 16.5, 18) * 14, 1, k(t, 16.5, 17) * (1 - k(t, 18.6, 19.2))); }
    if (t > 5.6 && t < 8) p.sym('bang', kid.head[0] + 12, kid.head[1] - 18, 1, k(t, 5.6, 5.8));
  },
};

// ── The letter: words are hard; paper piles up; the phone says it first ──
const letterStory: Story = {
  id: 'the-letter', title: 'Dear you', dur: 21,
  beats: [[0, 'A letter to someone special.'], [3.8, 'Hmm. No. Too much.'], [7.6, 'Not enough. Again.'], [10.6, 'Paper: 7. Words that work: 0.'], [14.8, 'Then the phone lights up…'], [16.8, '…a heart. From them. They went first.']],
  draw(p: Pen, t: number) {
    const { k, at, FLOOR } = p;
    p.room({ wall: '#e6d2b8', floor: '#8a6446', paper: 'dots' });
    p.window(54, 86, 52, 60, '#18203a'); p.picture(176, 70, 34, 26, '#c9a0b8'); p.clock(120, 40, 23.2 + t / 60);
    p.dark(.25);
    const top = p.desk(134, 104);
    deskLamp(p, 172, top, 1);
    basket(p, 212, false);
    // the tries: [start writing, hold up to read, crumple, throw, land]; each one quicker and crosser than the last
    const tries: [number, number, number, number, number][] = [[.6, 3.6, 4.4, 4.9, 5.6], [5.8, 7.6, 8.1, 8.4, 9.0], [9.2, 10.2, 10.2, 10.5, 11.0], [11.1, 11.7, 11.7, 11.9, 12.3],
      [12.3, 12.7, 12.7, 12.85, 13.2], [12.9, 13.2, 13.2, 13.3, 13.65], [13.35, 13.6, 13.6, 13.7, 14.05]];
    const lands: Pt[] = [[210, 214], [190, 258], [228, 262], [204, 268], [178, 264], [214, 256], [196, 252]];
    // balls already landed: in the basket first, then a growing pile
    if (t > tries[0][4]) paperBall(p, 210, FLOOR - 28, 6.5, 0);
    basket(p, 212, true);
    tries.forEach((T, i) => { if (t > T[4] && i > 0) paperBall(p, lands[i][0], lands[i][1], 6.5, i); });
    // which try is on now (the latest one started)
    let cur = -1; tries.forEach((T, i) => { if (t >= T[0] && t < T[4]) cur = i; });
    const T = cur >= 0 ? tries[cur] : null;
    const writing = !!T && t < T[1], reading = !!T && t >= T[1] && t < T[2], crumple = !!T && t >= T[2] && t < T[3], throwing = !!T && t >= T[3];
    const slump = k(t, 14.1, 14.6) * (1 - k(t, 15.2, 15.7)), phoneUp = k(t, 15.8, 16.5), hug = k(t, 18.4, 19.2);
    const frus = cur >= 2 ? 1 : 0;
    // the phone on the desk: buzzes, glows, shows a heart
    const buzz = t > 14.8 && t < 15.8 ? p.wave(t, .06, 1.2) : 0, glow = k(t, 14.8, 15) * (1 - hug * .6);
    // the writer
    const wr = writing ? p.wave(t, cur >= 2 ? .09 : .18, .08) : 0;
    let armR: Opts['armR'] = { a: 1.25 + wr, b: .45 }, armL: Opts['armL'] = { a: 1.35, b: .25 };
    if (reading || crumple) { armR = { a: 1.55, b: .9 }; armL = { a: 1.6, b: .8 }; }
    if (throwing && T) { const q = k(t, T[3], T[3] + .25); armR = { a: p.lerp(2.6, 1.7, q), b: .1 }; armL = { a: 1.3, b: .3 }; }
    if (slump > 0) { armR = { a: p.lerp(1.25, 1.6, slump), b: .2 }; armL = { a: p.lerp(1.35, 1.7, slump), b: .2 }; }
    if (phoneUp > 0) { armR = { a: p.lerp(1.4, 1.5, phoneUp), b: p.lerp(.4, 1.3, phoneUp) - hug * .5 }; armL = { a: 1.3 + hug * .4, b: .4 + hug * .5 }; }
    p.chair(64, 1, '#6e4a33');
    const B = p.person(78, { pose: 'sit', face: 1, skin: '#c68b5e', shirt: '#c9a14a', pants: '#4e4a5e', hair: 'short', hairC: '#1e1612', glasses: true,
      lean: writing ? .22 : slump > 0 ? .22 + slump * .4 : .05, tilt: slump * .5 + (phoneUp > 0 ? p.wave(t, 1.6, .06) * hug : 0),
      mouth: phoneUp > .5 ? 'grin' : slump > .3 ? 'sad' : reading ? 'flat' : crumple || throwing ? (frus ? 'flat' : 'sad') : 'smile',
      eyes: phoneUp > .5 ? 'happy' : slump > .5 && t < 15.1 ? 'closed' : t > 15.1 && t < 15.9 ? 'wide' : 'open', blush: phoneUp > .6, armL, armR });
    // pencil and paper on the desk while writing
    const [rx, ry] = B.rh;
    if (writing && T) { shape(p, [rx - 14, top - 1, rx + 12, top - 1, rx + 14, top + 1, rx - 12, top + 1], '#fbf7ee'); seg(p, rx, ry, rx + 6, ry - 9, 1.6, '#e0a43a'); }
    if (reading && T) sheet(p, (B.lh[0] + rx) / 2 + 2, Math.min(B.lh[1], ry) - 12, 0, 5, cur + 1);
    if (crumple && T) sheet(p, (B.lh[0] + rx) / 2 + 2, Math.min(B.lh[1], ry) - 10, k(t, T[2], T[3] - .05), 5, cur + 1);
    tries.forEach((U, i) => { if (t >= U[3] && t < U[4]) { const q = k(t, U[3], U[4], p.ease.lin), [lx, ly] = lands[i]; paperBall(p, p.lerp(112, lx, q), p.lerp(150, ly, q) - Math.sin(q * Math.PI) * 44, 6.5, i); } });
    if (cur === 1 && t > 8.75 && t < 9.0) p.sym('bang', 212, FLOOR - 44, .7, 1, '#6d7880');
    // the phone
    if (phoneUp <= 0) { p.phone(150 + buzz, top - 7, glow); if (glow > 0) { seg(p, 141, top - 12, 138, top - 14, 1, '#bfe0ff'); seg(p, 159, top - 12, 162, top - 14, 1, '#bfe0ff'); } }
    else { const x = p.lerp(150, rx + 3, phoneUp), y = p.lerp(top - 7, ry - 4, phoneUp); p.phone(x, y, glow, p.lerp(0, -.25, phoneUp)); p.sym('heart', x, y - 1, .3, glow, '#ff6b8a'); }
    if (glow > 0 && phoneUp <= 0) p.sym('heart', 150 + buzz, top - 8, .3, 1, '#ff6b8a');
    // signs: a sigh, a heart
    if (reading && cur === 0) p.sym('q', B.head[0] + 14, B.head[1] - 20, .9, 1);
    if (cur >= 3 && (crumple || throwing || reading)) p.sym('anger', B.head[0] + 12, B.head[1] - 16, .9, 1);
    p.sym('bang', 150, top - 32, 1, k(t, 14.9, 15.1) * (1 - k(t, 15.9, 16.2)), '#ff6b8a');
    if (t > 16.5) { const r = k(t, 16.5, 17.3, p.ease.back); p.sym('heart', 150, top - 40 - r * 20, .5 + r * .9, k(t, 16.5, 16.8)); }
    for (let i = 0; i < 3; i++) { const ph = (t * .4 + i / 3) % 1; p.sym('heart', B.head[0] + 6 + i * 14 + p.wave(t + i, 1.4, 4), B.head[1] - 20 - ph * 40, .5, k(t, 18, 18.6) * (1 - ph) * .9); }
  },
};

// ── Magic show: the Great Pip's hat trick, third time lucky ──
const magic: Story = {
  id: 'magic-show', title: 'The Great Pip', dur: 22,
  beats: [[0, 'Tonight only: the Great Pip!'], [2.5, 'Trick one: a rabbit… no, a sock.'], [7.2, 'Trick two: mostly smoke.'], [12, 'Trick three. Last chance.'], [14.6, 'Not a rabbit. Even better.'], [17, 'Standing ovation!']],
  draw(p: Pen, t: number) {
    const { k, at, FLOOR } = p;
    p.room({ wall: '#dccbe6', floor: '#8a6a52', paper: 'stripes' });
    p.lamp(64, 1, '#ffe2a8'); p.picture(52, 100, 36, 28, '#e3b07a', -.04);
    // a homemade stage: a starry bedsheet pegged to a string
    { const c = p.c; c.beginPath(); c.moveTo(118, 58); c.quadraticCurveTo(178, 70, 238, 58); c.lineTo(236, FLOOR - 10); c.quadraticCurveTo(178, FLOOR - 4, 120, FLOOR - 10); c.closePath(); c.fillStyle = '#34417e'; c.fill();
      for (let i = 0; i < 4; i++) seg(p, 136 + i * 28, 70, 140 + i * 26, FLOOR - 10, 1, 'rgba(255,255,255,.08)');
      for (let i = 0; i < 9; i++) p.sym('star', 128 + p.rnd(i * 4.1) * 100, 80 + p.rnd(i * 2.7) * 90, .5 + p.rnd(i) * .4, .9, '#f3d36b');
      seg(p, 112, 56, 240, 56, 1, '#4a3a2a'); for (let i = 0; i < 5; i++) { const x = 124 + i * 27; seg(p, x, 58 + Math.sin(i / 4 * Math.PI) * 5, x, 66 + Math.sin(i / 4 * Math.PI) * 5, 3, '#d9b36a'); } }
    p.rug(120, 190, '#6a4f8a');
    // the audience of one: on the sofa, then on their feet
    p.sofa(56, 100, '#5f8b7a');
    const ov = k(t, 16.6, 17.2), clap = (sp: number) => p.wave(t, sp, .22);
    if (ov < .5) p.person(40, { pose: 'sit', face: 1, skin: '#f1c9a5', shirt: '#5b7fa8', pants: '#3b3f4a', hair: 'short', hairC: '#7a5a3a', beard: true, glasses: true,
      armL: t > 5 && t < 6.6 ? { a: 1.2 + clap(.5), b: .9 } : { a: .6, b: 1.2 }, armR: t > 5 && t < 6.6 ? { a: 1.2 - clap(.5), b: .9 } : t > 13.6 && t < 16.6 ? { a: 1.4, b: 1.6 } : { a: .5, b: 1.3 },
      mouth: t > 14.8 ? 'o' : t > 9.4 && t < 11.4 ? 'flat' : 'smile', eyes: t > 14.8 ? 'wide' : 'open' });
    else { const B = p.person(48, { front: true, skin: '#f1c9a5', shirt: '#5b7fa8', pants: '#3b3f4a', hair: 'short', hairC: '#7a5a3a', beard: true, glasses: true, y: FLOOR + 4,
      armL: { a: 2.4 + p.wave(t, .3, .25) * (1 - k(t, 19.5, 20.5)), b: .6 }, armR: { a: 2.4 - p.wave(t, .3, .25) * (1 - k(t, 19.5, 20.5)), b: .6 }, mouth: 'grin', eyes: 'happy', bob: Math.abs(p.wave(t, .6, 3)) * (1 - k(t, 19.5, 20.5)) });
      p.sym('heart', B.head[0] + 14, B.head[1] - 26 - k(t, 18, 19) * 8, .9, k(t, 18, 18.4)); }
    // the stage: a little table with a cloth and the hat
    const hx = 148, top = p.table(hx, 64, 40, '#6b3f5e');
    shape(p, [hx - 34, top - 1, hx + 34, top - 1, hx + 37, top + 24, hx - 37, top + 24], '#8a2f5e'); for (let i = 0; i < 3; i++) p.sym('star', hx - 16 + i * 16, top + 12, .55, 1, '#f3c84b');
    const wob = t > 13.6 && t < 14.4 ? p.wave(t, .12, .12) : 0;
    hat(p, hx, top, 'inner', wob);
    // the cat: tail peeks out during trick two; pops out for trick three, then sits on the table
    const rise = k(t, 14.2, 15, p.ease.out), out = k(t, 15.2, 15.9);
    if (t > 9.6 && t < 10.8) { const c = p.c; c.save(); c.beginPath(); c.rect(hx - 20, 0, 40, top - 24); c.clip(); const u = k(t, 9.6, 9.9) * (1 - k(t, 10.5, 10.8));
      c.beginPath(); c.moveTo(hx + 4, top - 20); c.quadraticCurveTo(hx + 10, top - 30 - u * 6, hx + 4 + p.wave(t, .5, 4), top - 24 - u * 16); c.lineWidth = 4; c.strokeStyle = '#3a3a3f'; c.lineCap = 'round'; c.stroke(); c.restore(); }
    if (t > 14 && out < 1) { const c = p.c; c.save(); c.beginPath(); c.rect(hx - 40, 0, 80, top - 3); c.clip();
      p.cat(p.lerp(hx - 4, hx - 22, out), p.lerp(top + 14, top - 4, rise) - Math.sin(out * Math.PI) * 10, { sit: true, face: 1, s: .75, tail: p.wave(t, 1) }); c.restore(); }
    hat(p, hx, top, 'outer', wob);
    if (out >= 1) p.cat(hx - 22, top, { sit: true, face: 1, s: .75, tail: p.wave(t, 1.3), color: '#3a3a3f' });
    if (t > 15 && t < 17) p.sym('heart', hx - 16, top - 34, .7, k(t, 15.6, 16) * (1 - k(t, 16.6, 17)));
    // the Great Pip
    const kx = 196, kidBow = k(t, 18, 18.5) * (1 - k(t, 19.2, 19.7));
    const tricks = [2.5, 7.2, 12.6], wav = (t0: number) => t > t0 && t < t0 + 1.2 ? Math.sin((t - t0) / 1.2 * Math.PI * 4) * .5 : 0;
    const waving = wav(tricks[0]) + wav(tricks[1]) + wav(tricks[2]);
    const sockUp = k(t, 4.0, 4.6) * (1 - k(t, 6.4, 6.8)), sooty = k(t, 8.5, 8.7) * (1 - k(t, 11.4, 12));
    const reachHat = Math.max(k(t, 3.7, 3.9) * (1 - k(t, 6.4, 6.8)), k(t, 9.4, 9.6) * (1 - k(t, 10.2, 10.6)));
    const amazed = t > 14.2 && t < 16.8, tada = t > 15.9;
    cape(p, kx, FLOOR, .68, p.wave(t, 1.8, 2) + (tada ? 3 : 0), '#c0283e');
    const bowing = kidBow > .3;
    const kid = p.person(kx, { front: !bowing, face: -1, lean: kidBow * .55, s: .68, skin: sooty > .5 ? '#6f6a6a' : '#e0ac7e', shirt: '#f2c14e', pants: '#2f2f4a', hair: 'spiky', hairC: sooty > .5 ? '#3a3a3a' : '#c9772f', dress: false,
      armL: bowing ? { a: .3, b: .2 } : tada ? { a: 2.7 + p.wave(t, .5, .1), b: .1 } : sockUp > 0 ? { a: p.lerp(1.5, 2.55, sockUp), b: .1 } : reachHat > 0 ? { a: p.lerp(1.0, 1.5, reachHat), b: .35 } : { a: .4, b: .5 },
      armR: bowing ? { a: -.4, b: .2 } : tada ? { a: 2.7 - p.wave(t, .5, .1), b: .1 } : { a: 1.9 + waving, b: .2 },
      mouth: amazed ? 'open' : tada ? 'grin' : sooty > .5 ? 'o' : t > 4.6 && t < 6.6 ? 'flat' : 'grin', eyes: amazed ? 'wide' : tada ? 'happy' : sooty > .5 ? 'wide' : t > 12 && t < 13.2 ? 'closed' : 'open',
      bob: tada && !bowing ? Math.abs(p.wave(t, .8, 3)) * (1 - k(t, 20, 20.8)) : 0 });
    // the wand in the right hand (viewer's right), the sock in the left
    if (!bowing) wand(p, kid.rh[0], kid.rh[1], tada ? .3 : -.6 - waving * .8, Math.max(k(t, tricks[0] + .9, tricks[0] + 1.2) * (1 - k(t, tricks[0] + 1.3, tricks[0] + 1.6)), k(t, 13.3, 13.6) * (1 - k(t, 14, 14.4))));
    if (sockUp > 0) sock(p, kid.lh[0] - 2, kid.lh[1] + 2);
    // trick two goes up in smoke
    const sm = k(t, 8.4, 8.6) * (1 - k(t, 9.6, 10.6));
    smoke(p, hx + 10, top - 34, 18 + k(t, 8.4, 9.4) * 22, sm);
    if (sooty > .5 && t < 10) p.say(kid.head[0], kid.head[1] - 12, 'Cough!', { a: k(t, 9.4, 9.6), tail: -1 });
    p.sym('q', 58, 120, .9, k(t, 5, 5.2) * (1 - k(t, 6.2, 6.5)));
    p.sym('bang', kid.head[0] + 10, kid.head[1] - 18, 1.1, k(t, 14.4, 14.6) * (1 - k(t, 15.6, 15.9)));
    if (t < 2.4) p.say(kid.head[0], kid.head[1] - 12, 'Ta-da!', { a: k(t, .4, .6) * (1 - k(t, 2, 2.3)), tail: -1 });
    if (t > 12.1 && t < 13.3) p.sym('note', kid.head[0] - 16, kid.head[1] - 18 - p.wave(t, .3, 2), .8, 1, '#5a3a7a');
    p.confetti(t, 4, k(t, 16.8, 17.3) * (1 - k(t, 20.6, 21.6)));
  },
};

const TOWEL = '#6fa8d6';

// ── Rainy reunion: a long wait, a soaked return, a towel, a hug, two cups ──
const rainy: Story = {
  id: 'rainy-reunion', title: 'Caught in the rain', dur: 21,
  beats: [[0, 'Rain all evening. Tea going cold.'], [3.6, 'Late. Later. Very late.'], [6.4, 'Then: the door.'], [8.2, 'One soaked partner. One ex-umbrella.'], [11.2, 'A towel first. Then a hug.'], [15.6, 'Two cups. Rain outside. All fine.']],
  draw(p: Pen, t: number) {
    const { k, at, FLOOR } = p;
    p.room({ wall: '#c9b49a', floor: '#7a5a40', paper: 'plain' });
    const flash = k(t, 3.1, 3.2) * (1 - k(t, 3.25, 3.7));
    p.window(88, 90, 64, 76, '#1f2838'); windowRain(p, 88, 90, 64, 76, t, flash);
    p.clock(164, 46, 21.6 + k(t, 0, 7, p.ease.lin) * .9);
    p.floorLamp(16, 1);
    p.sofa(88, 112, '#b5814e');
    const doorOpen = at(t, [[6.9, 0], [7.7, .9]]); p.door(210, doorOpen, '#8f6a4a');
    // the side table: one cup in a hand, one cup already waiting
    const tt = p.table(160, 30, 52, '#6e4a33');
    const towelOff = t > 9.6;
    if (!towelOff) { seg(p, 158, 114, 166, 114, 2, '#5e3d28'); shape(p, [152, 114, 172, 114, 172, 150, 152, 150], TOWEL); for (const y of [122, 142]) seg(p, 152, y, 172, y, 2.5, '#ffffff'); }
    // A: waits by the window, turns to the clock, to the door, fetches the towel, hugs, takes the cups to the sofa
    const aX = at(t, [[8.6, 128], [9.6, 160], [10.4, 176], [13.6, 176], [15.4, 66]], p.ease.lin);
    const bX = at(t, [[8.4, 210], [10.2, 194], [13.6, 194], [15.4, 112]], p.ease.lin);
    const aWalk = (t > 8.6 && t < 10.4) || (t > 13.6 && t < 15.4), bWalk = (t > 8.4 && t < 10.2) || (t > 13.6 && t < 15.4);
    const seated = t > 15.4, hug = k(t, 11.2, 11.6) * (1 - k(t, 13.4, 13.7));
    const cupsTaken = t > 14.2, cupA0 = t < 9.4; // A's cup: in hand, then on the table
    const aFace: 1 | -1 = seated ? 1 : t < 3.6 ? -1 : t < 6.2 ? 1 : aWalk && t > 13.6 ? -1 : 1;
    const sip = t < 3.6 ? k(t, 1.2, 1.6) * (1 - k(t, 2.4, 2.8)) : 0;
    const pass = k(t, 16, 16.6), sipEnd = seated ? k(t, 17.4, 17.9) * (1 - k(t, 19.6, 20.2)) : 0;
    let aL: Opts['armL'] = .15, aR: Opts['armR'] = { a: .5 + sip * .7, b: 1.6 + sip * .4 };
    if (!cupA0 && t < 10.4) aR = { a: 1.0, b: .5 };
    if (t >= 10.4 && t < 11.2) { const q = k(t, 10.4, 11); aR = { a: 1.4 + q * 1.4, b: .2 }; aL = { a: 1.4 + q * 1.4, b: .2 }; }
    if (hug > 0) { aR = { a: 1.4, b: 1.1 }; aL = { a: 1.5, b: 1.2 }; }
    if (cupsTaken && !seated) { aR = { a: .9, b: .9 }; aL = { a: .9, b: .9 }; }
    if (seated) { aR = { a: p.lerp(.9, 1.4, pass) * (1 - pass) + (pass > 0 ? .5 + sipEnd * .7 : 0) + .0, b: pass > 0 ? 1.6 + sipEnd * .4 : .9 }; aL = { a: .4, b: 1 }; if (pass > 0 && pass < 1) aR = { a: 1.4, b: .5 }; }
    const bR: Opts['armR'] = hug > 0 ? { a: 1.5, b: 1.1 } : seated ? { a: .5 + (pass >= 1 ? sipEnd * .7 : 0), b: 1.6 + sipEnd * .4 } : t < 11.2 ? { a: .9, b: .4 } : .2;
    const bL: Opts['armL'] = hug > 0 ? { a: 1.4, b: 1.2 } : .15;
    const soak = { shirt: '#2f4a66', pants: '#262a36', skin: '#9b6640', hair: 'short' as const, hairC: '#120d0a' };
    const B = t > 7.4 ? p.person(bX, { ...soak, pose: seated ? 'sit' : bWalk ? 'walk' : 'stand', ph: t * 8, face: seated ? 1 : bWalk && t > 13.6 ? -1 : -1, armL: bL, armR: bR,
      mouth: t < 8.8 ? 'flat' : hug > 0 || seated ? 'smile' : 'grin', eyes: hug > 0 || sipEnd > .5 ? 'closed' : 'open', tilt: seated ? -.06 : 0 }) : null;
    const A = p.person(aX, { pose: seated ? 'sit' : aWalk ? 'walk' : 'stand', ph: t * 8 + 1, face: aFace, skin: '#f1c9a5', shirt: '#b5525a', pants: '#4a4038', hair: 'long', hairC: '#6a3a22',
      y: seated ? undefined : FLOOR + (t < 8.6 ? 10 : 4), armL: aL, armR: aR, tilt: seated ? .22 * k(t, 18, 19) : t > 4.2 && t < 6 ? -.15 : 0,
      mouth: t > 6.4 && t < 8.8 ? 'o' : hug > 0 || seated ? 'smile' : t > 8.8 ? 'grin' : 'flat', eyes: hug > 0 || (seated && t > 18.4) ? 'closed' : t > 6.4 && t < 7.6 ? 'wide' : 'open', lean: aWalk ? .1 : 0 });
    // cups: A's (steaming), the waiting one; then both by the sofa
    if (cupA0) p.cup(A.rh[0] + 2, A.rh[1] + 4, 1, t, '#f4efe6');
    else if (!cupsTaken) { p.cup(152, tt, .6, t, '#f4efe6'); }
    if (!cupsTaken) p.cup(166, tt, 0, t, '#d98a5a');
    if (cupsTaken) {
      p.cup(A.rh[0] + 2, A.rh[1] + 4, seated ? 1 : .5, t, '#f4efe6');
      if (pass < .5) p.cup(A.lh[0] + 2, A.lh[1] + 4, .5, t + 1, '#d98a5a'); else if (B) p.cup(B.rh[0] + 2, B.rh[1] + 4, 1, t + 1, '#d98a5a');
    }
    if (towelOff && t < 10.9) seg(p, A.rh[0], A.rh[1], A.lh[0], A.lh[1], 8, TOWEL);
    if (B) {
      // drips and a puddle until the towel comes off the hook
      const dry = k(t, 11, 14);
      oval(p, p.lerp(206, 194, k(t, 8.4, 10.2)), FLOOR + 6, 6 + k(t, 7.6, 11) * 18, 3 + k(t, 7.6, 11) * 3, 'rgba(120,150,190,.45)');
      for (let i = 0; i < 5; i++) { const ph = (t * 1.3 + i / 5) % 1; p.sym('drop', B.head[0] - 14 + i * 7, B.head[1] + 18 + ph * 70, .55, (1 - ph) * (1 - dry) * (seated ? 0 : 1)); }
      if (t > 10.9) towelHead(p, B.head[0], B.head[1], seated ? 1 : -1, TOWEL);
      if (t < 11.2) brokenBrolly(p, B.lh[0], B.lh[1], -.1, '#d9475a'); else brokenBrolly(p, 230, FLOOR + 8, -1.3, '#d9475a');
      p.say(B.head[0] - 4, B.head[1] - 12, 'Hi…', { a: k(t, 8.2, 8.4) * (1 - k(t, 9.4, 9.7)), tail: -1 });
      p.sym('heart', (A.head[0] + B.head[0]) / 2, A.head[1] - 30 - k(t, 11.6, 13) * 10, 1, k(t, 11.6, 12) * (1 - k(t, 13, 13.5)));
      if (seated) p.sym('heart', (A.head[0] + B.head[0]) / 2, A.head[1] - 34, .8, k(t, 18.4, 19) * (1 - k(t, 20, 20.5)));
    }
    p.sym('q', A.head[0] + 10, A.head[1] - 22, .9, k(t, 4.2, 4.4) * (1 - k(t, 5.6, 5.9)));
    p.sym('bang', A.head[0] + 10, A.head[1] - 22, 1.1, k(t, 6.4, 6.55) * (1 - k(t, 7.3, 7.6)));
    if (doorOpen <= 0 && t > 5.8) p.sym('spark', 226, FLOOR - 66, .6, Math.abs(p.wave(t, .2)));
    p.flash(flash * .25, '#dfe8ff');
    p.rain(t, 1);
  },
};

export const STORIES_D: Story[] = [workout, bath, letterStory, magic, rainy];
