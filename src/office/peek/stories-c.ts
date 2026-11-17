// Window stories, set C (see pen.ts for the kit and the Story shape; stories.ts collects every set).
import type { Pen, Story } from './pen.js';

type C2 = CanvasRenderingContext2D;
const TAU = Math.PI * 2;

// ── small local drawing helpers (each saves and restores the context) ──
function circ(c: C2, x: number, y: number, r: number, col: string) { c.beginPath(); c.arc(x, y, Math.max(0, r), 0, TAU); c.fillStyle = col; c.fill(); }
function ell(c: C2, x: number, y: number, rx: number, ry: number, col: string, rot = 0) { c.beginPath(); c.ellipse(x, y, Math.max(0, rx), Math.max(0, ry), rot, 0, TAU); c.fillStyle = col; c.fill(); }
function seg(c: C2, x0: number, y0: number, x1: number, y1: number, w: number, col: string) { c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.lineWidth = w; c.strokeStyle = col; c.lineCap = 'round'; c.stroke(); }

/** A swaddled baby, head at +x (dir flips it). mood: 0 calm, 1 crying; sleep closes the eyes. */
function baby(p: Pen, x: number, y: number, rot: number, o: { cry?: number; sleep?: boolean; dir?: 1 | -1 } = {}) {
  const c = p.c, d = o.dir ?? 1, cry = o.cry ?? 0; c.save(); c.translate(x, y); c.rotate(rot); c.scale(d, 1);
  ell(c, -4, 1, 13, 7.5, '#f2bfd0');
  c.beginPath(); c.moveTo(-14, -2); c.quadraticCurveTo(-3, 6, 6, -4); c.lineWidth = 1.2; c.strokeStyle = '#d99ab0'; c.stroke();
  circ(c, 11, -3, 7.6, '#f2bfd0');           // the hood
  circ(c, 10, -2, 6.2, '#f6d2b4');           // the face
  c.lineWidth = 1.1; c.strokeStyle = '#3a2a24';
  if (o.sleep) { seg(c, 7, -3.4, 9, -3.4, 1, '#3a2a24'); seg(c, 11.4, -3.4, 13.4, -3.4, 1, '#3a2a24'); }
  else if (cry > .3) { c.beginPath(); c.moveTo(6.8, -5); c.lineTo(8.8, -3.6); c.lineTo(6.8, -2.4); c.moveTo(13.6, -5); c.lineTo(11.6, -3.6); c.lineTo(13.6, -2.4); c.stroke(); }
  else { circ(c, 8, -3.2, 1, '#3a2a24'); circ(c, 12.4, -3.2, 1, '#3a2a24'); }
  if (cry > .3) ell(c, 10.2, 1.2, 2.2, 1.5 + cry * 1.4, '#7a3434');
  else { c.beginPath(); c.arc(10.2, 0, 1.4, .2, Math.PI - .2); c.stroke(); }
  c.save(); c.globalAlpha = .45; circ(c, 6.8, 0, 1.4, '#ff8a9a'); circ(c, 13.6, 0, 1.4, '#ff8a9a'); c.restore();
  c.restore();
}

/** A mobile over the crib: a string from the ceiling, three little shapes going round. */
function mobile(p: Pen, x: number, y: number, t: number, spin: number) {
  const c = p.c; seg(c, x, 0, x, y, 1, '#5a5048'); seg(c, x - 22, y, x + 22, y, 1.4, '#7a6a5a');
  const kinds: ['star', 'heart', 'star'] = ['star', 'heart', 'star'];
  for (let i = 0; i < 3; i++) { const a = spin + i * TAU / 3, ox = Math.cos(a) * 20, sc = .75 + Math.sin(a) * .15, yy = y + 14 + i * 3;
    seg(c, x + ox, y, x + ox, yy - 6, .8, '#7a6a5a'); p.sym(kinds[i], x + ox, yy, sc, 1, i === 1 ? '#f29ab0' : '#ffe37a'); }
  void t;
}

/** A crescent moon in a back window. */
function moon(c: C2, x: number, y: number, sky: string) { circ(c, x, y, 7, '#fff3c4'); circ(c, x + 3.5, y - 2, 6.4, sky); }

/** A bowl, popcorn heaped on top (fill 0..1). */
function bowl(p: Pen, x: number, y: number, fill = 1, col = '#d9534f') {
  const c = p.c; c.save();
  for (let i = 0; i < 11 * fill; i++) { const r = p.rnd(i * 3.3 + 1); kernel(c, x - 13 + (i * 2.7) % 26, y - 3 - (i % 3) * 2.5 - r * 2, 2.6); }
  c.beginPath(); c.moveTo(x - 16, y - 2); c.quadraticCurveTo(x, y + 18, x + 16, y - 2); c.closePath(); c.fillStyle = col; c.fill();
  c.fillStyle = '#ffffff'; for (let i = 0; i < 4; i++) c.fillRect(x - 12 + i * 7, y + 1, 3, 5);
  c.restore();
}
function kernel(c: C2, x: number, y: number, r: number) { circ(c, x, y, r, '#fff3cf'); circ(c, x + r * .8, y - r * .4, r * .75, '#fde7a8'); circ(c, x - r * .7, y - r * .5, r * .7, '#fffaf0'); }

/** A paintbrush held at (x, y), pointing at angle a (0 = right), its tip in col. */
function brush(c: C2, x: number, y: number, a: number, col: string) { c.save(); c.translate(x, y); c.rotate(a); seg(c, -8, 0, 12, 0, 2.2, '#8a5a3b'); seg(c, 12, 0, 15, 0, 2.6, '#bcbcbc'); ell(c, 18, 0, 3.6, 1.8, col); c.restore(); }
/** An artist's palette at (x, y). */
function palette(c: C2, x: number, y: number) { c.save(); ell(c, x, y, 12, 7, '#d8b07a', -.2); circ(c, x - 6, y + 1, 1.8, '#d8b07a');
  const cols = ['#e8574a', '#f3c84b', '#e07ab0', '#4d86d6', '#ffffff']; for (let i = 0; i < 5; i++) circ(c, x - 6 + i * 3.6, y - 3 + Math.sin(i) * 2, 1.9, cols[i]); c.restore(); }
/** A paw print. */
function paw(c: C2, x: number, y: number, col: string, a = 1, s = 1) { if (a <= 0) return; c.save(); c.globalAlpha = Math.min(1, a); c.translate(x, y); c.scale(s, s);
  ell(c, 0, 1.5, 3, 2.5, col); for (let i = 0; i < 4; i++) circ(c, -3.4 + i * 2.3, -2.6 - (i === 1 || i === 2 ? 1 : 0), 1.2, col); c.restore(); }

/** A framed photo: two little people and a heart (the moving-in keepsake). y: its centre. */
function photo(c: C2, x: number, y: number, s: number, tilt: number) {
  c.save(); c.translate(x, y); c.rotate(tilt); c.scale(s, s);
  c.fillStyle = '#c9a25a'; c.fillRect(-17, -13, 34, 26); c.fillStyle = '#f5ecd8'; c.fillRect(-14, -10, 28, 20);
  c.fillStyle = '#bfe0ee'; c.fillRect(-12, -8, 24, 16);
  c.fillStyle = '#9fd08a'; c.fillRect(-12, 3, 24, 5);
  circ(c, -5, -2, 2.6, '#e0ac7e'); c.fillStyle = '#d9534f'; c.fillRect(-7.5, .5, 5, 5);
  circ(c, 5, -1, 2.2, '#9b6640'); c.fillStyle = '#4f7cac'; c.fillRect(3, 1, 4, 4.5);
  c.restore(); void s;
}
/** A sock lying at (x, y) with rotation. */
function sock(c: C2, x: number, y: number, rot: number, col = '#e86a5a') {
  c.save(); c.translate(x, y); c.rotate(rot);
  c.beginPath(); c.moveTo(-3, -9); c.lineTo(3, -9); c.lineTo(3, 2); c.quadraticCurveTo(3, 5, 7, 5); c.lineTo(9, 5); c.quadraticCurveTo(11, 8, 8, 9); c.lineTo(-1, 9); c.quadraticCurveTo(-3, 9, -3, 5); c.closePath(); c.fillStyle = col; c.fill();
  c.fillStyle = '#ffffff'; c.fillRect(-3, -9, 6, 2.2); c.fillRect(-3, -4, 6, 1.6); c.restore();
}
/** A folded shirt on a surface at y. */
function folded(c: C2, x: number, y: number, col: string) { c.save(); c.fillStyle = col; c.beginPath(); c.roundRect ? c.roundRect(x - 11, y - 5, 22, 5, 1.5) : c.rect(x - 11, y - 5, 22, 5); c.fill(); c.fillStyle = 'rgba(0,0,0,.12)'; c.fillRect(x - 11, y - 1.5, 22, 1.5); c.restore(); }
/** A laundry basket standing on the floor. */
function basket(c: C2, x: number, y: number, fill: number) { c.save();
  const cols = ['#9ec9e8', '#f2d36b', '#e86a5a', '#ffffff', '#b78fd6'];
  for (let i = 0; i < 6 * fill; i++) ell(c, x - 14 + (i % 3) * 14, y - 24 - Math.floor(i / 3) * 4, 9, 5, cols[i % 5]);
  c.beginPath(); c.moveTo(x - 22, y - 26); c.lineTo(x + 22, y - 26); c.lineTo(x + 18, y); c.lineTo(x - 18, y); c.closePath(); c.fillStyle = '#d6b37a'; c.fill();
  c.strokeStyle = '#b08a52'; c.lineWidth = 1; for (let i = 0; i < 4; i++) { c.beginPath(); c.moveTo(x - 21 + i, y - 20 + i * 5); c.lineTo(x + 21 - i, y - 20 + i * 5); c.stroke(); }
  c.restore(); }

// ── 1. Night feed: rock, sing, the baby sleeps… and so does the parent, standing up ──
const nightFeed: Story = {
  id: 'night-feed', title: 'The 3 a.m. lullaby', dur: 18,
  beats: [[0, '3 a.m. Someone very small has big feelings.'], [3, 'Rock, sway, hum the old song…'], [8, 'Shh… it is working. It is working!'], [10, 'Down she goes. Gently. Gently.'], [13.5, 'Mission accomplished. For both of them.']],
  draw(p: Pen, t: number) {
    const { k, at, wave, FLOOR } = p, c = p.c, sky = '#16203f';
    p.room({ wall: '#a9b8d0', floor: '#6f5a4a', paper: 'dots' });
    p.window(50, 74, 50, 58, sky); moon(c, 40, 62, sky);
    p.picture(214, 92, 26, 20, '#f2c6d2');
    mobile(p, 176, 118, t, t * .6);
    p.rug(150, 120, '#c78aa0');
    // the night light by the floor
    c.fillStyle = '#f4e3b0'; c.beginPath(); c.arc(224, FLOOR - 12, 6, Math.PI, 0); c.fill(); c.fillRect(218, FLOOR - 12, 12, 4);
    const cx = 172, release = 11.2, inCrib = t >= release;
    if (inCrib) baby(p, cx - 6, FLOOR - 42, 0, { sleep: true, dir: 1 });
    p.crib(cx);
    // the parent: rocking, then leaning over the crib, then a big yawn, then asleep on the rail
    const rocking = t < 9.6, sway = rocking ? wave(t, 2.4) : 0;
    const x = 102 + sway * 3;
    const lower = at(t, [[9.6, 0], [10.8, 1], [11.6, 1], [12.4, 0]]);
    const yawn = k(t, 12.6, 13.2) * (1 - k(t, 14, 14.4));
    const sleep = k(t, 14.4, 15.4);
    const breathe = wave(t, 3, 1) * sleep;
    const lean = rocking ? .04 + sway * .05 : lower > 0 ? lower * .42 : sleep * (.22 + breathe * .02);
    const holdR = { a: .55, b: 1.35 }, holdL = { a: .7, b: 1.3 };
    let armR: { a: number; b: number } = holdR, armL: { a: number; b: number } = holdL;
    if (!rocking && t < 12.4) { armR = { a: p.lerp(.55, .55, lower), b: p.lerp(1.35, .35, lower) }; armL = { a: p.lerp(.7, .65, lower), b: p.lerp(1.3, .35, lower) }; }
    if (t >= 12.4) { const st = yawn; armR = { a: p.lerp(.1, 2.9, st), b: .2 }; armL = { a: p.lerp(.05, 2.7, st), b: .2 };
      if (sleep > 0) { armR = { a: p.lerp(armR.a, 1.25, sleep), b: p.lerp(.2, .1, sleep) }; armL = { a: p.lerp(armL.a, 1.15, sleep), b: p.lerp(.2, .2, sleep) }; } }
    const B = p.person(x, { face: 1, shirt: '#7d8fb8', pants: '#5b5f7a', hair: 'bun', hairC: '#6b3f2a', skin: '#e0ac7e', armR, armL, lean,
      eyes: sleep > .5 ? 'closed' : yawn > .5 ? 'closed' : t > 8.5 && t < 12.6 ? 'happy' : 'open',
      mouth: yawn > .4 ? 'open' : sleep > .5 ? 'flat' : rocking && t > 3 ? 'o' : t > 11.6 ? 'smile' : 'flat',
      tilt: sleep * (.38 + breathe * .04) + (rocking ? sway * .06 : 0) });
    // the baby in the arms (head in the crook of the near arm)
    const cry = 1 - k(t, 5, 8.2);
    if (!inCrib) {
      const hx = (B.rh[0] + B.lh[0]) / 2, hy = (B.rh[1] + B.lh[1]) / 2;
      const bx = p.lerp(hx - 2, cx - 6, k(t, 10.6, release)), by = p.lerp(hy - 3, FLOOR - 42, k(t, 10.6, release));
      baby(p, bx + (cry > .3 ? p.wave(t, .25, 1) : 0), by, rocking ? sway * .12 - .1 : 0, { cry, sleep: t > 8.2, dir: -1 });
      // the near arm drawn again over the bundle so it looks held
      if (t < 10.6) { c.save(); c.lineCap = 'round'; c.strokeStyle = '#7d8fb8'; c.lineWidth = 7; c.beginPath(); c.moveTo(B.rh[0] - 14, B.rh[1] + 4); c.lineTo(B.rh[0], B.rh[1]); c.stroke(); circ(c, B.rh[0], B.rh[1], 4, '#e0ac7e'); c.restore(); }
    }
    // dark nursery; moonlight and the night light
    p.dark(.42);
    p.light(50, 80, 70, '#9fb8ff', .25);
    p.light(224, FLOOR - 14, 60, '#ffd890', .45);
    p.light(B.head[0] + 20, B.head[1] + 30, 70, '#ffd8a0', .12);
    // crying, singing, sleeping
    if (t < 3.2) { p.say(B.rh[0] - 6, B.rh[1] - 18, 'WAAAH!', { a: k(t, .2, .5) * (1 - k(t, 2.8, 3.2)), tail: -1 }); }
    if (cry > .3 && t > 3.2) p.sym('drop', B.rh[0] - 2 + wave(t, .5, 2), B.rh[1] - 14, .6, cry * .9);
    for (let i = 0; i < 4; i++) { const ph = ((t - 3) * .45 + i / 4) % 1; if (t > 3 && t < 10) p.sym('note', B.head[0] + 16 + ph * 26 + wave(t + i, 1.2, 4), B.head[1] - 6 - ph * 40, .8, Math.sin(ph * Math.PI) * k(t, 3, 3.6) * (1 - k(t, 9.4, 10)), '#fff4d0'); }
    if (t > 8.5) { const ph = (t * .4) % 1; p.sym('zzz', cx + 4 + ph * 10, FLOOR - 58 - ph * 14, .55, Math.sin(ph * Math.PI) * k(t, 8.5, 9.2), '#e8eeff'); }
    if (sleep > 0) { const ph = (t * .35 + .5) % 1; p.sym('zzz', B.head[0] + 10 + ph * 14, B.head[1] - 18 - ph * 22, 1, Math.sin(ph * Math.PI) * sleep, '#e8eeff'); }
    p.sym('spark', B.head[0] - 16, B.head[1] - 14, .7, k(t, 11.8, 12.1) * (1 - k(t, 12.4, 12.7)), '#fff4c0');
  },
};

// ── 2. Movie night: we are the telly; the scary scene, the jump, the popcorn — and the culprit ──
const movieNight: Story = {
  id: 'movie-night', title: 'Movie night', dur: 18,
  beats: [[0, 'Movie night. Lights off, popcorn on.'], [4, 'The scary part. Nobody breathe.'], [8.8, 'Something touches a shoulder…'], [9.6, 'AAAAH!'], [12.5, 'Oh. It was the cat. Of course it was.'], [15, 'The cat gets the good seat. And the popcorn.']],
  draw(p: Pen, t: number) {
    const { k, at, wave, FLOOR } = p, c = p.c;
    p.room({ wall: '#7f6f8f', floor: '#5a4636', paper: 'stripes' });
    p.picture(64, 92, 40, 28, '#6d86b8'); p.picture(176, 88, 30, 38, '#c48a5a');
    p.plant(222, FLOOR);
    p.sofa(120, 150, '#a14f5a');
    // tension: they lean in and clutch the bowl; then the jump
    const tense = k(t, 4, 6.5) * (1 - k(t, 9.4, 9.6));
    const jumpK = t > 9.4 && t < 10.4 ? Math.sin((t - 9.4) / 1 * Math.PI) : 0;
    const turn = t > 11.3 && t < 14.4; // looking round at the cat behind them
    const calm = k(t, 14.6, 15.4);
    // the cat: creeps along the sofa back from the right, taps a shoulder, then hops down into the bowl
    const catX = at(t, [[2.5, 250], [8.4, 124]], p.ease.lin);
    const hop = k(t, 14.2, 14.7, p.ease.lin);
    const bobJ = jumpK * 18;
    const back = FLOOR - 78;
    if (hop < 1) p.cat(p.lerp(catX, 121, hop), p.lerp(back, FLOOR - 46, hop) - Math.sin(hop * Math.PI) * 18 - jumpK * 10, { face: -1, ph: t * 6, color: '#ece6da', tail: wave(t, 1.5) + jumpK * 2, sit: t > 8.4 && hop === 0, s: .9 });
    // the couple
    const munch = t < 4 ? Math.max(0, Math.sin(t * 2.2 - .6)) : 0;
    const toBowl = { a: .5, b: .2 }, toChin = { a: -.4, b: 3.3 }, up = (d: number) => ({ a: 2.7 + d, b: .2 });
    const A = p.person(84, { pose: 'sit', front: !turn, face: 1, shirt: '#e3b04b', pants: '#4a4f66', hair: 'curly', hairC: '#3a2618', skin: '#9b6640',
      armR: jumpK > .1 ? up(.2) : turn ? { a: .4, b: .4 } : { a: p.lerp(toBowl.a, toChin.a, munch), b: p.lerp(toBowl.b, toChin.b, munch) },
      armL: jumpK > .1 ? up(0) : tense > .3 ? toChin : { a: .15, b: .5 },
      mouth: jumpK > .1 ? 'open' : tense > .3 ? 'o' : turn ? (t > 12.6 ? 'grin' : 'flat') : munch > .5 ? 'o' : 'smile',
      eyes: jumpK > .1 || (tense > .6 && t > 6) ? 'wide' : turn && t > 12.6 ? 'happy' : calm > .5 ? 'happy' : 'open', bob: bobJ });
    const Bp = p.person(158, { pose: 'sit', front: !turn, face: -1, shirt: '#5f9e8f', pants: '#3b3f4a', hair: 'long', hairC: '#c9853f', skin: '#f1c9a5',
      armL: jumpK > .1 ? up(.1) : turn ? { a: .4, b: .4 } : toBowl,
      armR: jumpK > .1 ? up(.2) : tense > .3 ? toChin : { a: .15, b: .5 },
      mouth: jumpK > .1 ? 'open' : tense > .3 ? 'flat' : turn ? (t > 12.6 ? 'grin' : 'o') : 'smile',
      eyes: jumpK > .1 || (tense > .6 && t > 6.5) ? 'wide' : turn && t > 12.6 ? 'happy' : calm > .5 ? 'happy' : 'open', bob: bobJ * .9 });
    // a shared blanket over their laps
    const bt = FLOOR - 50 - bobJ * .8;
    c.save(); c.beginPath(); c.moveTo(62, bt + 6); c.quadraticCurveTo(121, bt - 8, 182, bt + 6); c.lineTo(186, FLOOR - 2); c.quadraticCurveTo(150, FLOOR + 4, 121, FLOOR - 2); c.quadraticCurveTo(90, FLOOR + 4, 58, FLOOR - 2); c.closePath();
    c.fillStyle = '#d8c39a'; c.fill(); c.strokeStyle = '#b9a079'; c.lineWidth = 1; for (let i = 0; i < 5; i++) { c.beginPath(); c.moveTo(74 + i * 24, bt + 4); c.lineTo(70 + i * 25, FLOOR - 2); c.stroke(); } c.restore();
    // the bowl on their laps between them; it jumps too, and ends up with a cat in it
    const left = 1 - k(t, 9.5, 9.8) * .7;
    if (hop >= 1) { p.cat(121, FLOOR - 46, { sit: true, face: 1, color: '#ece6da', tail: wave(t, 2), s: .75 }); bowl(p, 121, FLOOR - 44, .3); }
    else bowl(p, 121, FLOOR - 44 - jumpK * 16, left);
    // popcorn flying
    if (t > 9.5) for (let i = 0; i < 20; i++) { const r = p.rnd(i + 7), r2 = p.rnd(i * 5 + 2), tt = t - 9.5 - r * .15; if (tt < 0) continue;
      const vx = (r - .5) * 160, vy = -120 - r2 * 80, xx = 121 + vx * tt, yy = FLOOR - 56 + vy * tt + 200 * tt * tt, ly = FLOOR + 8 + r2 * 40;
      kernel(c, xx, Math.min(yy, ly), 2.4); }
    // the telly is us: its back at the bottom of the window, its flicker on their faces
    const scary = k(t, 4, 5) * (1 - k(t, 10, 11));
    const glow = scary > .1 ? p.mix('#8fb8ff', '#ff6a5a', k(t, 8.6, 9.2) * (1 - k(t, 10, 11))) : '#8fb8ff';
    p.dark(.42 - calm * .05);
    const fl = .5 + .25 * Math.sin(t * 7) * Math.sin(t * 3.1) - scary * .2 + (t > 9.3 && t < 9.6 ? .6 : 0);
    p.light(120, FLOOR - 30, 160, glow, .28 * fl + .1);
    c.fillStyle = '#121218'; c.fillRect(82, 284, 76, 30); c.fillRect(110, 278, 20, 8);
    p.light(120, 300, 70, glow, .3);
    // signs
    if (t > 8.6 && t < 9.5) { p.sym('spark', 146, FLOOR - 96, .7, 1, '#ffffff'); p.sym('spark', 140, FLOOR - 104, .4, 1, '#ffffff'); }
    p.sym('bang', A.head[0] - 8, A.head[1] - 26, 1.3, k(t, 9.5, 9.6) * (1 - k(t, 11, 11.4)));
    p.sym('bang', Bp.head[0] + 8, Bp.head[1] - 26, 1.3, k(t, 9.5, 9.6) * (1 - k(t, 11, 11.4)));
    p.say(124, FLOOR - 112, 'mrrp?', { a: k(t, 11.8, 12.1) * (1 - k(t, 13.4, 13.8)), tail: 1 });
    p.sym('heart', 121, FLOOR - 92, .9, k(t, 15.4, 15.8));
  },
};

// ── 3. The painter: a sunset, a cat in the paint tray, and a happy accident ──
const painter: Story = {
  id: 'the-painter', title: 'A happy accident', dur: 21,
  beats: [[0, 'Sunday. A blank canvas. A brave idea.'], [4.5, 'A sunset. Very nearly finished.'], [7.5, 'Time for tea. What could go wrong?'], [9.5, 'The cat has some notes.'], [13.9, '…'], [16.6, 'You know what? It is better now. Signed by both.']],
  draw(p: Pen, t: number) {
    const { k, at, wave, FLOOR } = p, c = p.c;
    p.room({ wall: '#f0e2c8', floor: '#a7835e', paper: 'plain' });
    p.window(196, 80, 52, 60, '#f2a35c');
    p.plant(230, FLOOR, .8);
    const tableTop = p.table(26, 44, 66, '#8a5a3b'); if (t < 9.6) p.cup(20, tableTop, 1, t);
    // the easel and the painting
    const ex = 146, ey = 146, ew = 62, eh = 50;
    p.paint(ex, ey, ew, eh, 0);
    const pk = k(t, .8, 7);
    c.save(); c.beginPath(); c.rect(ex - ew / 2, ey - eh / 2, ew * pk, eh); c.clip();
    const g = c.createLinearGradient(0, ey - eh / 2, 0, ey + eh / 2); g.addColorStop(0, '#6b4a9a'); g.addColorStop(.45, '#f08a5a'); g.addColorStop(.62, '#ffd27a'); g.addColorStop(.64, '#3d5a8a'); g.addColorStop(1, '#22365e');
    c.fillStyle = g; c.fillRect(ex - ew / 2, ey - eh / 2, ew, eh);
    circ(c, ex + 4, ey + eh * .14, 10, '#ffd96a');
    c.fillStyle = '#3d5a8a'; c.fillRect(ex - ew / 2, ey + eh * .14, ew, eh * .36);
    c.fillStyle = '#ffd96a'; for (let i = 0; i < 4; i++) c.fillRect(ex - 6 + i * 2 - i * i, ey + eh * .18 + i * 4, 20 - i * 4 + i * i * 2, 1.6);
    c.restore();
    // the stool with the paint tray
    p.stool(202);
    const tray = [['#ffffff', 192], ['#5fd4f0', 202], ['#ff7fc8', 212]] as [string, number][];
    c.fillStyle = '#e6e6e6'; c.fillRect(188, FLOOR - 58, 28, 4); for (const [col, xx] of tray) ell(c, xx, FLOOR - 58, 4, 1.8, col);
    // the cat's trip: in from the right, into the tray, up across the canvas, down the other side, then sits to admire it
    const top = ey - 4;
    const cp = (tt: number): [number, number, 1 | -1] => { // x, y (its feet), face
      if (tt < 9.4) return [262, FLOOR, -1];
      if (tt < 10.2) return [at(tt, [[9.4, 262], [10.2, 222]], p.ease.lin), FLOOR, -1];
      if (tt < 10.6) { const q = (tt - 10.2) / .4; return [p.lerp(222, 204, q), p.lerp(FLOOR, FLOOR - 56, q) - Math.sin(q * Math.PI) * 16, -1]; }
      if (tt < 11) return [204, FLOOR - 56, -1];
      if (tt < 11.4) { const q = (tt - 11) / .4; return [p.lerp(204, 172, q), p.lerp(FLOOR - 56, top, q) - Math.sin(q * Math.PI) * 18, -1]; }
      if (tt < 12.8) { const q = (tt - 11.4) / 1.4; return [p.lerp(172, 120, q), top - Math.sin(q * Math.PI * 2) * 9, -1]; }
      if (tt < 13.2) { const q = (tt - 12.8) / .4; return [p.lerp(120, 108, q), p.lerp(top, FLOOR, q) - Math.sin(q * Math.PI) * 8, -1]; }
      if (tt < 13.8) return [p.lerp(108, 126, (tt - 13.2) / .6), FLOOR, 1];
      return [126, FLOOR, -1];
    };
    // paw prints on the canvas: wherever the cat stepped while crossing it
    for (let i = 0; i < 9; i++) { const ts = 11.45 + i * .16; if (t < ts) break; const [px, py] = cp(ts); paw(c, px + (i % 2 ? 3 : -3), py + 5 + (i % 2) * 5, tray[i % 3][0], 1, 1.25); }
    // the signature (bottom left), written at the end
    const sig = k(t, 17.6, 18.6, p.ease.lin);
    if (sig > 0) { c.save(); c.beginPath(); c.rect(ex - ew / 2, ey - eh / 2, ew * .1 + ew * .38 * sig, eh); c.clip(); c.beginPath(); c.moveTo(ex - ew / 2 + 6, ey + 18);
      for (let i = 1; i <= 12; i++) c.lineTo(ex - ew / 2 + 6 + i * 2, ey + 18 - Math.sin(i * 1.7) * 2.4); c.strokeStyle = '#ff7fc8'; c.lineWidth = 1.2; c.stroke(); c.restore(); }
    // the artist: paints, goes for tea, comes back, stares, ponders, decides
    const ax = at(t, [[0, 90], [6.5, 96], [7.4, 96], [8.6, 54], [12.8, 54], [13.8, 92]]);
    const walking = (t > 7.4 && t < 8.6) || (t > 12.8 && t < 13.8);
    const atTea = t > 8.6 && t < 12.8, faceA: 1 | -1 = (t > 7.4 && t < 12.8) ? -1 : 1;
    const dab = t < 7.2 ? Math.max(0, Math.sin(t * 5)) : 0;
    const shock = k(t, 13.9, 14.1) * (1 - k(t, 15, 15.3));
    const ponder = k(t, 15.3, 15.6) * (1 - k(t, 16.5, 16.7)), happy = k(t, 16.6, 17);
    const signing = t > 17.4 && t < 18.8;
    const sip = atTea ? k(t, 10.2, 10.6) * (1 - k(t, 11.6, 12)) : 0;
    const armR = t < 7.2 ? { a: 1.3 + dab * .35, b: .3 - dab * .2 } : atTea ? { a: t > 9.2 && t < 9.7 ? 1.2 : .6 + sip * .5, b: 1.1 + sip * .9 }
      : shock > .2 ? { a: 2.5, b: .3 } : ponder > .3 ? { a: .6, b: 2.3 } : signing ? { a: 1.5, b: .05 } : happy > .3 ? { a: 1.0, b: .9 } : { a: .5, b: .9 };
    const armL = t < 7.2 ? { a: .7, b: 1.0 } : shock > .2 ? { a: 2.3, b: .3 } : { a: .6, b: 1.0 };
    const A = p.person(ax, { pose: walking ? 'walk' : 'stand', ph: t * 8, face: faceA, shirt: '#f2f0ea', pants: '#5a6b8a', hair: 'short', hairC: '#2e2a28', skin: '#c68b5e', beard: true, armR, armL,
      mouth: shock > .3 ? 'o' : ponder > .3 ? 'flat' : happy > .3 ? 'grin' : 'smile', eyes: shock > .3 ? 'wide' : happy > .3 && !signing ? 'happy' : 'open', tilt: ponder * .3, lean: t < 7.2 ? .06 : signing ? .08 : 0, bob: shock > .5 && t < 14.5 ? Math.sin((t - 13.9) / .6 * Math.PI) * 5 : 0 });
    // a beret
    ell(c, A.head[0] - faceA * 2, A.head[1] - 13, 14, 5, '#c0392b', -faceA * .15); circ(c, A.head[0] - faceA * 2, A.head[1] - 19, 2, '#c0392b');
    const holdsPalette = (t < 7.4) || t > 13.8;
    if (holdsPalette && shock < .2) palette(c, A.lh[0], A.lh[1]);
    if (t < 7.4) brush(c, A.rh[0], A.rh[1], -.5 + dab * .2, '#f08a5a');
    if (t > 9.6 && t < 12.8) p.cup(A.rh[0], A.rh[1] + 4, .8, t);
    if (t > 15.3 && ponder < .3 || signing) brush(c, A.rh[0], A.rh[1], signing ? .15 : -1.0, '#ff7fc8');
    // the cat on top of it all
    const [cx, cy, cf] = cp(t);
    const catSit = (t > 10.6 && t < 11) || t > 13.8;
    p.cat(cx, cy, { face: cf, ph: t * 10, sit: catSit, color: '#2f2f35', tail: wave(t, 1.2) });
    if (t > 10.6) for (let i = 0; i < 2; i++) paw(c, cx - 5 + i * 9, cy - 1, tray[i + 1][0], .9, .6);
    // signs
    p.sym('note', A.head[0] + 14 + wave(t, 1, 3), A.head[1] - 20, .8, t > 1 && t < 7 ? .8 : 0);
    p.sym('bang', A.head[0], A.head[1] - 30, 1.3, shock);
    p.sym('q', A.head[0] + 6, A.head[1] - 30, 1, ponder);
    p.sym('bulb', A.head[0], A.head[1] - 32, 1, k(t, 16.6, 16.8) * (1 - k(t, 17.4, 17.7)));
    p.sym('heart', 112, FLOOR - 62, .9, k(t, 18.8, 19.2));
  },
};

// ── 4. Moving in: boxes, an old photo, and then it starts to feel like home ──
const movingIn: Story = {
  id: 'moving-in', title: 'Home, unpacked', dur: 20,
  beats: [[0, 'New flat. Forty boxes. No idea where anything is.'], [4, 'Box one: books, cables, one lonely mug…'], [7.5, 'And at the bottom, this.'], [11, 'It goes right here.'], [13.8, 'A lamp on. A cup of tea. Little by little…'], [16.5, 'Home. (And look who packed themselves.)']],
  draw(p: Pen, t: number) {
    const { k, at, wave, FLOOR } = p, c = p.c;
    const warm = k(t, 13.6, 16);
    p.room({ wall: p.mix('#cfcfc8', '#f2d9b0', warm), floor: '#b08a63', paper: 'plain' });
    p.window(60, 80, 50, 56, '#1e2a4a');
    // where the photo goes: a lonely nail
    const NX = 150, NY = 106, hung = t > 12.2;
    circ(c, NX, NY, 1.6, '#555');
    // boxes stacked about; a plant peeking out of the top one
    p.box(214, FLOOR, 40, 34, '#c69a62'); p.plant(212, FLOOR - 50, .75); p.box(212, FLOOR - 34, 34, 22, '#b98c55', .5);
    const popT = 16.3, catPop = t > popT ? p.ease.back(p.clamp((t - popT) / .5, 0, 1)) : 0;
    p.box(30, FLOOR, 42, 36, '#c69a62', p.clamp(catPop, 0, 1.2));
    // the lamp, dark until it is switched on
    const lampOn = k(t, 14.4, 14.7);
    p.floorLamp(70, lampOn);
    // the box being unpacked, in the middle (its flaps fold shut again before someone sits on it)
    const open = k(t, 3, 3.8) * (1 - k(t, 14.9, 15.3));
    p.box(112, FLOOR, 46, 38, '#d0a46c', open);
    // things lifted out: a book, a mug, then the photo
    const out1 = k(t, 4.2, 5.2), out2 = k(t, 5.6, 6.6), sitting = t > 15.6;
    if (out1 > 0) p.book(p.lerp(112, 160, out1), p.lerp(FLOOR - 40, FLOOR + 10, out1) - Math.sin(out1 * Math.PI) * 30, false, '#3e6db4', out1 * 4);
    if (out2 > 0 && !sitting) p.cup(p.lerp(112, 172, out2), p.lerp(FLOOR - 40, FLOOR + 12, out2) - Math.sin(out2 * Math.PI) * 26, 0, 0, '#e86a5a');
    // the person
    const px = at(t, [[0, 150], [2.4, 150], [3, 140], [10.4, 140], [11.4, 178], [12.6, 178], [12.9, 186], [13.2, 186], [14.2, 98], [14.9, 98], [15.5, 112]]);
    const walking = (t > 2.4 && t < 3) || (t > 10.4 && t < 11.4) || (t > 12.6 && t < 12.9) || (t > 13.2 && t < 14.2) || (t > 14.9 && t < 15.5);
    const face: 1 | -1 = t < 12.6 ? -1 : t < 12.9 ? 1 : t < 14.9 ? -1 : 1;
    const digging = t > 3.4 && t < 8.2, dig = digging ? Math.max(0, Math.sin(t * 4)) : 0;
    const holding = t > 8.2 && t < 12.2;
    const look = k(t, 8.6, 9.2) * (1 - k(t, 10.2, 10.4));
    const reachUp = k(t, 11.3, 11.8) * (1 - k(t, 12.3, 12.6));
    let armR: { a: number; b: number } = { a: .1, b: .2 }, armL: { a: number; b: number } = { a: .1, b: .2 };
    if (digging) { armR = { a: .9 + dig * .4, b: .2 }; armL = { a: .8 + dig * .3, b: .2 }; }
    else if (holding || reachUp > 0) { armR = { a: p.lerp(1.2 + look * .2, 2.5, reachUp), b: p.lerp(.6, .2, reachUp) }; armL = { a: p.lerp(1.1 + look * .2, 2.4, reachUp), b: p.lerp(.6, .2, reachUp) }; }
    else if (t > 14.2 && t < 14.9) armR = { a: 2.3, b: .1 };
    const P = p.person(px, { pose: sitting ? 'sit' : walking ? 'walk' : 'stand', y: sitting ? FLOOR - 38 : undefined, ph: t * 8, face,
      shirt: '#5c8a4d', pants: '#3e4a5e', hair: 'pony', hairC: '#7a4a2a', skin: '#f1c9a5', armR: sitting ? { a: 1.1, b: 1.1 } : armR, armL: sitting ? { a: .9, b: 1.2 } : armL,
      lean: digging ? .45 : t < 2.4 ? .12 : 0, mouth: t < 2.4 ? 'sad' : look > .5 ? 'o' : holding || t > 10.4 ? 'smile' : 'flat',
      eyes: t < 2.4 ? 'closed' : look > .5 && t > 9.4 ? 'happy' : sitting ? 'happy' : 'open', blush: look > .5 || sitting, tilt: t < 2.4 ? -.25 : sitting ? -.12 : 0 });
    if (sitting) p.cup(P.rh[0], P.rh[1] + 4, 1, t, '#e86a5a');
    // the photo: from the box into the hands, up to the nail, a little swing, then straight
    if (t > 7.8) { const hx = (P.rh[0] + P.lh[0]) / 2, hy = (P.rh[1] + P.lh[1]) / 2, rise = k(t, 7.8, 8.4), up = k(t, 11.5, 12.2);
      const fx = hung ? NX : p.lerp(p.lerp(112, hx + face * 4, rise), NX, up), fy = hung ? NY + 16 : p.lerp(p.lerp(FLOOR - 30, hy - 6, rise), NY + 16, up);
      const sw = hung ? at(t, [[12.2, .28], [12.7, -.14], [13.1, .05], [13.5, 0]]) : 0;
      c.save(); c.translate(NX, NY); c.rotate(hung ? sw : 0); c.translate(-NX, -NY);
      if (hung) { seg(c, NX, NY, NX - 14, NY + 2, .7, '#555'); seg(c, NX, NY, NX + 14, NY + 2, .7, '#555'); }
      photo(c, fx, fy, hung ? 1.2 : .9 + look * .25 + up * .05, 0); c.restore(); }
    // the stowaway: the cat pops out of the left box, then comes over to sit at her feet
    if (catPop > 0) { const cw = k(t, 17.2, 18.3, p.ease.lin); const cxp = p.lerp(30, 84, cw), cyp = cw > 0 ? p.lerp(FLOOR - 36, FLOOR, Math.min(1, cw * 3)) : FLOOR - 36 + (1 - Math.min(1, catPop)) * 22;
      p.cat(cxp, cyp, { sit: cw <= 0 || cw >= 1, ph: t * 9, face: 1, color: '#d9a066', tail: wave(t, 1.3) }); }
    // light: dim and grey first, the lamp warms it up
    p.dark(.36 - warm * .32, '#1a1e2a');
    if (lampOn > 0) p.light(70, FLOOR - 105, 130, '#ffd890', .28 * lampOn);
    p.sym('heart', P.head[0] - 30, P.head[1] - 30, .9, k(t, 9.4, 9.8) * (1 - k(t, 10.6, 11)));
    p.sym('bang', 34, FLOOR - 76, 1, k(t, 16.5, 16.7) * (1 - k(t, 17.2, 17.5)));
    p.sym('spark', NX + 22, NY + 4, .8, k(t, 13.3, 13.5) * (1 - k(t, 14, 14.4)));
    p.sym('heart', 100, FLOOR - 92, .8, k(t, 18.4, 18.8));
  },
};

// ── 5. Sock thief: one sock is missing; the dog knows; the chase; the dog wins ──
const sockThief: Story = {
  id: 'sock-thief', title: 'The sock thief', dur: 22,
  beats: [[0, 'Laundry day. Fold, fold, pair, fold…'], [4.5, 'One sock. Where is the other sock?'], [6.8, 'Oh, you did NOT.'], [8.5, 'Round the sofa! And round again!'], [15, 'The dog wins. The dog always wins.'], [18, 'Nap time. The sock stays with the champion.']],
  draw(p: Pen, t: number) {
    const { k, at, wave, FLOOR } = p, c = p.c;
    p.room({ wall: '#cfe0d6', floor: '#9a7a5a', paper: 'stripes' });
    p.window(176, 74, 54, 58, '#7fb6e6');
    p.shelf(56, 70, 70, 6);
    const RED = '#e86a5a', DOG = '#c98a4a';
    const look = { shirt: '#e2a33f', pants: '#45546e', hair: 'spiky' as const, hairC: '#2a1e18', skin: '#e0ac7e' };
    // the sofa and the loop round it: along the front left→right, round the back right→left
    const sx = 160, sw = 100, L = sx - sw / 2 - 18, R = sx + sw / 2 + 8;
    const lap = (u: number): [number, boolean, 1 | -1] => {
      const f = ((u % 1) + 1) % 1;
      if (f < .45) return [p.lerp(L, R, f / .45), false, 1];
      if (f < .5) return [R, f > .475, 1];
      if (f < .95) return [p.lerp(R, L, (f - .5) / .45), true, -1];
      return [L, f < .975, -1];
    };
    const dogRun = t > 8.5 && t < 14.2, manRun = t > 8.5 && t < 15;
    const uD = at(t, [[8.5, .4], [14.2, 2.0]], p.ease.lin), uP = at(t, [[9.3, 0], [15, 2.0]], p.ease.lin);
    const [dX, dBack, dF] = lap(uD);
    const [pLx, pBack, pLf] = t < 9.3 ? [p.lerp(62, L, k(t, 8.5, 9.3, p.ease.lin)), false, 1 as 1 | -1] : lap(uP);
    // ── the dog ──
    const sofaSeat = FLOOR - 40;
    const dogOnLap = t > 17.6;
    const drawDog = () => {
      if (dogOnLap) { // curled up on the lap, asleep with its prize
        const bx = 150, by = FLOOR - 50, br = 1 + Math.sin(t * 2.2) * .03;
        ell(c, bx, by, 18 * br, 9 * br, DOG); circ(c, bx - 13, by - 2, 8, DOG); ell(c, bx - 17, by - 4, 4, 8, '#8f5c2e', .4);
        seg(c, bx - 19, by - 3, bx - 15, by - 3, 1.2, '#222'); seg(c, bx + 14, by + 2, bx + 22, by - 6 + wave(t, .6) * 2, 4, DOG);
        sock(c, bx - 6, by - 1, 1.5, RED);
        return;
      }
      let x = 204, y = FLOOR, f: 1 | -1 = 1, sit = true, s = 1;
      if (t > 6.8) f = -1; // turns round: busted
      if (dogRun) { x = dX; f = dF; sit = false; if (dBack) { s = .9; y = FLOOR - 6 - Math.abs(Math.sin(t * 7)) * 34; } }
      if (t >= 14.2) { // trots to the sofa and hops up on the seat
        const hop = k(t, 14.7, 15.2, p.ease.lin); x = p.lerp(L, 185, k(t, 14.2, 15.2, p.ease.lin)); f = 1; sit = t > 15.2;
        y = p.lerp(FLOOR, sofaSeat, hop) - Math.sin(hop * Math.PI) * 18;
        if (t > 15.2) { f = -1; x = 185; y = sofaSeat; }
        if (t > 17) { const h = k(t, 17, 17.6, p.ease.lin); x = p.lerp(185, 156, h); y = sofaSeat - Math.sin(h * Math.PI) * 14; sit = false; }
      }
      p.dog(x, y, { face: f, sit, ph: t * 14, wag: t * (t > 6.8 ? 16 : 4), color: DOG, s, tongue: dogRun || (t > 15.4 && t < 17) });
      if (t > 6.8) { const mx = x + f * 28 * s, my = y - (sit ? 33 : 25) * s; sock(c, mx, my + 6, f > 0 ? -1.2 : 1.2, RED); }
    };
    // ── the person ──
    const foldK = t < 4.4 ? Math.sin(t * 5) : 0;
    const drawPerson = () => {
      if (t < 6.8) { // behind the table, facing us: folding, then one lonely sock
        const q = t > 4.5;
        const tl = q ? Math.sin((t - 4.5) * 2.6) * .28 : Math.sin(t * 2.5) * .06;
        return p.person(62, { front: true, ...look, armR: q ? { a: 2.7, b: .25 } : { a: .7 + foldK * .2, b: 1.3 - foldK * .3 }, armL: q ? { a: .3, b: .4 } : { a: .7 - foldK * .2, b: 1.3 + foldK * .3 },
          mouth: q ? 'flat' : 'smile', eyes: 'open', tilt: tl });
      }
      if (t < 8.5) { // side view: spots the dog
        const jump = t < 7.3 ? Math.sin(k(t, 6.8, 7.3, p.ease.lin) * Math.PI) * 8 : 0;
        return p.person(62, { face: 1, ...look, armR: { a: 1.7, b: .05 }, armL: { a: .4, b: .5 }, mouth: 'o', eyes: 'wide', bob: jump, lean: -.1 });
      }
      if (manRun) {
        const behind = t > 9.3 && pBack;
        return p.person(pLx, { pose: 'walk', ph: t * 15, face: pLf, ...look, s: behind ? .9 : 1, y: behind ? FLOOR - 6 : FLOOR,
          armR: { a: 1.7 + Math.sin(t * 15) * .15, b: .1 }, armL: { a: .9 + Math.sin(t * 15) * .4, b: .7 }, lean: .3, mouth: 'open', eyes: 'wide' });
      }
      // flops on the sofa, puffs, laughs, then the dog climbs on and they nap
      const flop = k(t, 15, 15.6), laugh = t > 15.9 && t < 17.2, doze = t > 18.6;
      if (flop < 1) return p.person(p.lerp(L, 128, flop), { pose: 'walk', ph: t * 7, face: 1, ...look, armR: { a: .2, b: .2 }, armL: { a: .2, b: .2 }, mouth: 'open', eyes: 'closed', lean: .2 });
      return p.person(128, { pose: 'sit', face: 1, ...look,
        armR: dogOnLap ? { a: 1.0, b: 1.1 } : laugh ? { a: .5, b: 1.9 } : { a: .25, b: .3 }, armL: dogOnLap ? { a: .9, b: 1.2 } : { a: .2, b: .3 },
        mouth: doze ? 'smile' : laugh ? 'grin' : 'open', eyes: doze || laugh ? (doze ? 'closed' : 'happy') : 'open',
        tilt: doze ? -.3 * k(t, 18.6, 19.4) : laugh ? Math.sin(t * 14) * .08 : 0, bob: laugh ? Math.abs(Math.sin(t * 14)) * 2 : 0, blush: laugh });
    };
    // ── draw, back to front ──
    let B: ReturnType<Pen['person']> | null = null;
    if (dogRun && dBack) drawDog();
    if (manRun && t > 9.3 && pBack) B = drawPerson();
    p.sofa(sx, sw, '#6d7fa3');
    if (!(manRun && t > 9.3 && pBack)) B = drawPerson();
    // the table with the laundry, in front of the person
    const top = p.table(62, 80, 62, '#9a6b48');
    const pile = Math.min(4, 1 + Math.floor(t * .8));
    const cols = ['#9ec9e8', '#f2d36b', '#b78fd6', '#ffffff'];
    for (let i = 0; i < pile; i++) folded(c, 38, top - i * 5, cols[i]);
    const pairs = Math.min(2, Math.floor(t / 1.8));
    for (let i = 0; i < pairs; i++) { sock(c, 80 + i * 11, top - 9, 0, i ? '#5b8fd6' : '#6fae5e'); sock(c, 83 + i * 11, top - 9, 0, i ? '#4a7cc2' : '#5d9a4e'); }
    // the lonely sock: on the table, then held up high
    if (t < 4.5) sock(c, 62, top - 9, 1.5, RED);
    else if (t < 6.8 && B) sock(c, B.rh[0], B.rh[1] + 11, 0, RED);
    else if (t < 8.5) sock(c, 56, top - 9, 1.4, RED);
    basket(c, 14, FLOOR, 1 - k(t, 0, 4.4));
    if (!(dogRun && dBack)) drawDog();
    // signs
    const hd = B ? B.head : [62, FLOOR - 104];
    if (t < 4.4) { const ph = (t * .7) % 1; p.sym('note', 84 + ph * 10, FLOOR - 132 - ph * 16, .7, Math.sin(ph * Math.PI)); }
    p.sym('q', hd[0] + 22, hd[1] - 24, 1, k(t, 4.6, 4.8) * (1 - k(t, 6.5, 6.8)));
    p.sym('bang', hd[0] + 4, hd[1] - 30, 1.3, k(t, 6.85, 7) * (1 - k(t, 8.2, 8.5)));
    p.sym('note', 206, FLOOR - 58, .8, k(t, 7.4, 7.6) * (1 - k(t, 8.3, 8.5)));
    if (manRun && t > 9.3) { const by = pBack ? FLOOR - 6 : FLOOR; for (let i = 0; i < 2; i++) p.sym('drop', pLx - pLf * (16 + i * 7), by - 112 + i * 5, .5, .7); }
    if (t > 15.4 && t < 16) p.sym('drop', hd[0] - 16, hd[1] - 8, .6, 1);
    p.say(176, FLOOR - 84, 'mine.', { a: k(t, 15.5, 15.7) * (1 - k(t, 16.8, 17)), tail: -1 });
    p.dark(k(t, 17.6, 20) * .22, '#2a2440');
    if (t > 19) { const ph = (t * .45) % 1; p.sym('zzz', 120 + ph * 12, FLOOR - 112 - ph * 18, 1, Math.sin(ph * Math.PI) * k(t, 19, 19.5)); const q = (t * .45 + .5) % 1; p.sym('zzz', 146 + q * 8, FLOOR - 66 - q * 14, .7, Math.sin(q * Math.PI) * k(t, 19.2, 19.7)); }
  },
};

export const STORIES_C: Story[] = [nightFeed, movieNight, painter, movingIn, sockThief];
