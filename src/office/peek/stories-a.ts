// Window stories, set A (see pen.ts for the kit and the Story shape; stories.ts collects every set).
import type { Pen, Story, PersonOpts, Body } from './pen.js';

// ── small local helpers (shapes the pen does not have) ──
const ln = (p: Pen, x0: number, y0: number, x1: number, y1: number, w: number, col: string) => { const c = p.c; c.save(); c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.lineWidth = w; c.strokeStyle = col; c.lineCap = 'round'; c.stroke(); c.restore(); };
const dot = (p: Pen, x: number, y: number, r: number, col: string) => { const c = p.c; c.save(); c.beginPath(); c.arc(x, y, Math.max(0, r), 0, Math.PI * 2); c.fillStyle = col; c.fill(); c.restore(); };
const shape = (p: Pen, P: number[], col: string, a = 1) => { const c = p.c; c.save(); c.globalAlpha = a; c.beginPath(); c.moveTo(P[0], P[1]); for (let i = 2; i < P.length; i += 2) c.lineTo(P[i], P[i + 1]); c.closePath(); c.fillStyle = col; c.fill(); c.restore(); };
const box = (p: Pen, x: number, y: number, w: number, h: number, col: string, a = 1) => { const c = p.c; c.save(); c.globalAlpha = a; c.fillStyle = col; c.fillRect(x, y, w, h); c.restore(); };

/** A cone party hat sitting on a head (head: the head centre from person()). */
function partyHat(p: Pen, head: [number, number], col: string, tilt = 0, s = 1) {
  const c = p.c; c.save(); c.translate(head[0], head[1]); c.rotate(tilt); c.scale(s, s);
  shape(p, [-9, -11, 9, -11, 1, -34], col); ln(p, -5, -18, 6, -20, 2, '#ffffff'); ln(p, -2, -26, 4, -27, 2, '#ffffff'); dot(p, 1, -35, 3.4, '#f7d35c');
  c.restore();
}
/** A string of little flags across the wall. */
function bunting(p: Pen, y: number) {
  const c = p.c; c.save(); c.beginPath(); c.moveTo(0, y); c.quadraticCurveTo(p.W / 2, y + 22, p.W, y); c.lineWidth = 1; c.strokeStyle = '#6b5a4a'; c.stroke(); c.restore();
  const cols = ['#e8456b', '#f7d35c', '#5b8fd6', '#6fc276', '#c17be0'];
  for (let i = 0; i < 11; i++) { const x = 10 + i * 22, u = x / p.W, yy = y + 4 * u * (1 - u) * 11; shape(p, [x - 7, yy, x + 7, yy, x, yy + 13], cols[i % 5]); }
}
/** Thin smoke curling up from a blown-out wick; age in seconds. */
function smoke(p: Pen, x: number, y: number, age: number) {
  if (age < 0 || age > 1.8) return; const c = p.c; c.save(); c.globalAlpha = .55 * (1 - age / 1.8); c.beginPath(); c.moveTo(x, y);
  for (let i = 1; i <= 6; i++) c.lineTo(x + Math.sin(age * 4 + i) * (2 + i), y - i * 4 - age * 10);
  c.lineWidth = 1.3; c.strokeStyle = '#d8d8d8'; c.stroke(); c.restore();
}
/** A candle with a small flame and a soft, small glow (the pen's candle glow washes out a brightly lit room). */
function flame(p: Pen, x: number, y: number, lit: number, t: number, glow = .12) {
  box(p, x - 1.5, y - 10, 3, 10, '#fff2c8');
  if (lit <= 0) return; const fl = 1 + Math.sin(t * 13) * .15, c = p.c;
  c.save(); c.beginPath(); c.ellipse(x, y - 13, 2.1 * fl, 3.8 * fl, 0, 0, Math.PI * 2); c.fillStyle = '#ffb840'; c.fill();
  c.beginPath(); c.ellipse(x, y - 12.4, 1, 2, 0, 0, Math.PI * 2); c.fillStyle = '#fff6d8'; c.fill(); c.restore();
  p.light(x, y - 13, 14, '#ffc060', glow * lit);
}
/** A light switch on the wall. */
function lightSwitch(p: Pen, x: number, y: number, on: boolean) { box(p, x - 5, y - 8, 10, 16, '#f4efe6'); box(p, x - 2, on ? y - 5 : y, 4, 5, '#b9b0a4'); }
/** Someone down on one knee, facing o.face. Their hip is about 26 px above the floor. */
function kneel(p: Pen, x: number, o: PersonOpts): Body {
  const f = o.face ?? 1, F = p.FLOOR, pants = o.pants || '#3b3f4a', shoes = o.shoes || '#26211e', c = p.c, sink = 24, hy = F + sink - 50;
  c.save(); c.globalAlpha = .18; c.beginPath(); c.ellipse(x + f * 4, F + 2, 22, 3, 0, 0, Math.PI * 2); c.fillStyle = '#000'; c.fill(); c.restore();
  ln(p, x - f * 1, F - 7, x - f * 24, F - 5, 10, p.mix(pants, '#000000', .12)); box(p, f > 0 ? x - 30 : x + 22, F - 9, 8, 6, shoes); // the back shin along the floor
  c.save(); c.beginPath(); c.rect(0, 0, p.W, F - 5); c.clip();
  const B = p.person(x, { ...o, pose: 'stand', y: F + sink }); c.restore();
  ln(p, x, hy + 1, x + f * 22, hy + 1, 11, pants); ln(p, x + f * 22, hy + 1, x + f * 23, F - 4, 10, pants); // the front leg
  box(p, f > 0 ? x + 20 : x - 33, F - 6, 13, 6, shoes);
  return B;
}
/** A spider: round body, big eyes, eight wiggly legs. y: its centre. */
function spider(p: Pen, x: number, y: number, t: number, s = 1, walk = 0) {
  const c = p.c; c.save(); c.translate(x, y); c.scale(s, s); c.strokeStyle = '#2a2420'; c.lineWidth = 1.4; c.lineCap = 'round'; c.lineJoin = 'round';
  for (const side of [-1, 1]) for (let i = 0; i < 4; i++) { const w = Math.sin(t * (6 + walk * 10) + i * 1.7 + side) * (1 + walk * 1.5);
    c.beginPath(); c.moveTo(side * 2, -1 + i * 1.2); c.lineTo(side * 8, -6 + i * 3 + w * .4); c.lineTo(side * 12, 1 + i * 3.2 + w); c.stroke(); }
  c.beginPath(); c.ellipse(0, -1, 5.5, 5, 0, 0, Math.PI * 2); c.fillStyle = '#2a2420'; c.fill();
  for (const d of [-2, 2]) { dot(p, d, 0, 1.9, '#ffffff'); dot(p, d + .4, .4, .9, '#111111'); }
  c.restore();
}
/** A drinking glass held upside down (rim at the bottom, y). */
function tumbler(p: Pen, x: number, y: number) {
  box(p, x - 9, y - 20, 18, 20, '#dff0f8', .32); box(p, x - 9, y - 22, 18, 3, '#cfe6ef', .9);
  ln(p, x - 9, y - 20, x - 9, y, 1, '#bcd7e3'); ln(p, x + 9, y - 20, x + 9, y, 1, '#bcd7e3'); ln(p, x - 5, y - 17, x - 5, y - 5, 1.5, 'rgba(255,255,255,.7)');
}
/** A metronome; ang: the arm's swing, radians. y: where it stands. */
function metronome(p: Pen, x: number, y: number, ang: number) {
  shape(p, [x - 9, y, x + 9, y, x + 4, y - 26, x - 4, y - 26], '#7a4a2a'); box(p, x - 5, y - 9, 10, 6, '#e9dcc4');
  const ex = x + Math.sin(ang) * 22, ey = y - 6 - Math.cos(ang) * 22; ln(p, x, y - 6, ex, ey, 1.4, '#d8d8d8'); box(p, x + Math.sin(ang) * 14 - 2.5, y - 6 - Math.cos(ang) * 14 - 2, 5, 4, '#c9a64a');
}
/** A sitting dog that can raise its head to howl (howl 0..1). */
function singingDog(p: Pen, x: number, y: number, howl: number, o: { face: 1 | -1; wag: number; tongue?: boolean; color?: string }) {
  const c = p.c, f = o.face; c.save(); c.translate(x, y); c.rotate(-f * howl * .42); c.translate(-x, -y);
  p.dog(x, y, { sit: true, face: f, wag: o.wag, tongue: !!o.tongue && howl < .3, color: o.color });
  if (howl > .3) { c.save(); c.translate(x, y); c.scale(f, 1); c.beginPath(); c.ellipse(24, -29, 2.6, 3.4 * howl, 0, 0, Math.PI * 2); c.fillStyle = '#4a1f1f'; c.fill(); c.restore(); }
  c.restore();
}

// ── Midnight snack: the lights off, someone tiptoes to the fridge; its light shows the cat got there first ──
const snack: Story = {
  id: 'midnight-snack', title: 'Midnight snack', dur: 16,
  beats: [[0, 'Past midnight. Everyone is asleep.'], [3, 'Almost everyone.'], [7.5, 'The fridge light comes on…'], [10, '…and someone got there first.'], [13, 'Fine. Half each.']],
  draw(p: Pen, t: number) {
    const { k, at } = p;
    p.room({ wall: '#cdbb9c', floor: '#7d5a3e', paper: 'tiles' });
    p.clock(52, 40, 0.6 + t / 3600);
    const top = p.counter(70, 120); p.stove(50, top, 0); p.cup(96, top, 0); p.bottle(110, top);
    const open = at(t, [[7, 0], [8, 1], [14.6, 1], [15.4, 0]]);
    p.fridge(196, open);
    // the cat, sitting by the fridge (in its light), turns round when the door opens
    const seen = k(t, 8.4, 8.8);
    p.cat(170, p.FLOOR, { sit: true, face: seen > .5 ? 1 : -1, tail: p.wave(t, 1.4), color: '#e0a15a' });
    if (t > 11.5) { p.c.save(); p.c.translate(160, p.FLOOR - 26); p.c.fillStyle = '#e8a0a0'; p.c.fillRect(0, 0, 9, 4); p.c.restore(); } // its half of the ham
    // the person: tiptoes in from the left, stops at the fridge, jumps, then laughs and shares
    const x = at(t, [[2.5, -30], [7, 140]], p.ease.lin), walking = t > 2.5 && t < 7, jump = t > 8.6 && t < 9.4 ? Math.sin((t - 8.6) / .8 * Math.PI) * 10 : 0;
    const B = p.person(x, { pose: walking ? 'walk' : 'stand', ph: t * 7, face: 1, shirt: '#8aa4d6', pants: '#8aa4d6', hair: 'curly', hairC: '#2b1d14', skin: '#c68b5e',
      armR: t > 11 && t < 12.5 ? { a: .9, b: .3 } : walking ? .3 : t > 8.6 && t < 10 ? { a: 2.6, b: .2 } : { a: .5, b: 1 }, armL: t > 8.6 && t < 10 ? { a: 2.4, b: .2 } : .15,
      mouth: t > 8.6 && t < 10.5 ? 'o' : t > 12.5 ? 'grin' : 'flat', eyes: t > 8.6 && t < 10 ? 'wide' : t > 12.5 ? 'happy' : 'open', lean: walking ? .12 : 0, bob: jump });
    if (t > 10.8 && t < 12.6) { p.c.save(); p.c.fillStyle = '#e8a0a0'; p.c.fillRect(B.rh[0] - 5, B.rh[1] - 3, 10, 5); p.c.restore(); }
    if (walking) p.sym('note', x + 12, p.FLOOR - 130 - p.wave(t, .8, 3), .8, .0); // (tiptoeing: no tune)
    // dark kitchen, the fridge light on them
    p.dark(.62 - open * .25);
    if (open > 0) p.light(196, p.FLOOR - 50, 150, '#fff2c0', .35 * open);
    p.sym('bang', B.head[0] + 4, B.head[1] - 26, 1.2, k(t, 8.6, 8.8) * (1 - k(t, 9.8, 10.2)));
    p.sym('q', 186, p.FLOOR - 48, .9, k(t, 8.8, 9) * (1 - k(t, 10, 10.4)));
    p.sym('heart', 168, p.FLOOR - 52, .9, k(t, 13, 13.4) * (1 - k(t, 15, 15.6)));
  },
};

// ── Birthday surprise: home late in the dark, the light goes on, the friends pop up from behind the sofa. Trick candles. ──
const birthday: Story = {
  id: 'birthday-surprise', title: 'Surprise!', dur: 18,
  beats: [[0, 'Home late after a very long day.'], [4.1, 'SURPRISE!'], [8.4, 'Make a wish… and blow!'], [12.2, 'Trick candles. Of course they are.'], [15.2, 'Happy birthday, anyway.']],
  draw(p: Pen, t: number) {
    const { k, at, FLOOR } = p, c = p.c;
    const on = k(t, 4.0, 4.12, p.ease.lin), popped = t > 4.1;
    p.room({ wall: '#cbd8e8', floor: '#8a6446', paper: 'stripes' });
    p.lamp(120, on);
    bunting(p, 16);
    p.picture(112, 92, 40, 28, '#e7b36a');
    const door = at(t, [[1.1, 0], [1.8, 1], [3.2, 1], [3.8, 0]]);
    p.door(28, door);
    lightSwitch(p, 90, FLOOR - 82, on > .5);
    p.balloon(230, FLOOR - 58, '#e8456b', 48); p.balloon(218, FLOOR - 58, '#5b8fd6', 62);
    // the friends, crouched behind the sofa until the light goes on
    const pop = at(t, [[4.1, 44], [4.5, 0]], p.ease.back);
    const aX = at(t, [[6.4, 166], [8.4, 130]], p.ease.lin), aWalk = t > 6.4 && t < 8.4;
    const candleLit = (i: number) => t < 10.8 ? 1 : t < 12.2 + i * .18 ? 0 : t < 13.4 ? 1 : t < 14.4 + i * .25 ? 0 : 1;
    const friendA = () => {
      const B = p.person(aX, { y: FLOOR + (aWalk || t > 8.4 ? 0 : pop), face: -1, pose: aWalk ? 'walk' : 'stand', ph: t * 8, shirt: '#e08a3c', pants: '#4a4f63', hair: 'curly', hairC: '#1f1712', skin: '#9b6640',
        armL: { a: 1.45, b: .05 }, armR: { a: 1.5, b: 0 }, mouth: t > 15 ? 'grin' : t > 11 && t < 12.2 ? 'grin' : 'smile', eyes: t > 15 ? 'happy' : 'open', bob: t > 15.2 && t < 16.4 ? Math.abs(p.wave(t, .5, 3)) : 0 });
      partyHat(p, B.head, '#5b8fd6', -.15);
      const cx = B.rh[0] - 2, cy = B.rh[1] + 3;
      p.cake(cx, cy, 0);
      for (let i = 0; i < 3; i++) { const lx = cx - 10 + i * 10, L = candleLit(i); flame(p, lx, cy - 26, L, t + i); if (!L) smoke(p, lx, cy - 37, t < 12.2 ? t - 10.8 : t - 13.4); }
      return { cx, cy };
    };
    // behind the sofa: clipped to above the floor, so a crouching friend's legs do not show below it
    c.save(); c.beginPath(); c.rect(popped ? 0 : 131, 0, p.W, FLOOR - 30); c.clip();
    const bB = p.person(220, { y: FLOOR + pop, face: -1, shirt: '#6fae5e', hair: 'pony', hairC: '#8a4a22', skin: '#f1c9a5', dress: true,
      armL: popped ? { a: 2.7 + p.wave(t, .45, .25), b: .2 } : .1, armR: popped ? { a: 2.9 + p.wave(t, .4, .25), b: .1 } : .1,
      mouth: popped ? 'grin' : 'flat', eyes: t > 15 ? 'happy' : 'open', bob: popped && t < 7 ? Math.abs(p.wave(t, .6, 4)) : t > 15.2 && t < 16.4 ? Math.abs(p.wave(t, .5, 3)) : 0 });
    partyHat(p, bB.head, '#e8456b', .12);
    let cake = { cx: 0, cy: 0 };
    if (aX > 148) cake = friendA();
    c.restore();
    p.sofa(185, 100, '#7a6aa8');
    // the dog was in on it all along
    p.dog(198, FLOOR - 48, { sit: true, face: -1, wag: popped ? t * 14 : 0, tongue: popped, color: '#d9b27c' });
    partyHat(p, [182, FLOOR - 84], '#f7d35c', -.25, .75);
    // the birthday person
    const x = at(t, [[1.6, 24], [3.3, 48]], p.ease.lin), walk = t > 1.6 && t < 3.3, inside = t > 1.6;
    const jump = t > 4.12 && t < 4.6 ? Math.sin((t - 4.12) / .48 * Math.PI) * 12 : 0;
    const blow1 = k(t, 10.2, 10.6) * (1 - k(t, 11, 11.4)), blow2 = k(t, 12.9, 13.2) * (1 - k(t, 13.6, 14));
    const shock = t > 4.12 && t < 5.8, wish = t > 8.6 && t < 10.2, puzzled = (t > 12.3 && t < 12.9) || (t > 14.5 && t < 15.2), laugh = t > 15.2;
    const armUp = { a: 2.7, b: .3 };
    const P = !inside ? null : p.person(x, { pose: walk ? 'walk' : 'stand', ph: t * 7, face: 1, shirt: '#5f6f82', pants: '#2f3540', hair: 'short', hairC: '#6b4a2e', skin: '#e0ac7e', glasses: true,
      armR: shock ? armUp : t > 3.4 && t < 4.3 ? { a: 1.55, b: 0 } : wish ? { a: .9, b: 1.9 } : puzzled ? { a: .6, b: 1.6 } : laugh ? { a: .7, b: 1.2 } : walk ? .3 + p.wave(t, .9, .3) : .1,
      armL: shock ? { a: 2.5, b: .3 } : wish ? { a: .9, b: 1.8 } : puzzled ? { a: .6, b: 1.5 } : walk ? .1 : .05,
      mouth: blow1 + blow2 > .2 ? 'o' : shock ? 'open' : t < 4 ? 'flat' : puzzled ? 'flat' : laugh ? 'grin' : 'smile',
      eyes: shock ? 'wide' : wish || laugh ? (laugh ? 'happy' : 'closed') : blow2 > .2 ? 'wide' : 'open',
      lean: walk ? .06 : blow1 * .2 + blow2 * .32, bob: jump + (laugh && t < 16.4 ? Math.abs(p.wave(t, .5, 3)) : 0), tilt: puzzled ? .18 : 0 });
    // a bag in the far hand, dropped in the fright
    if (!P) { /* still in the hallway */ } else if (t < 4.2) box(p, P.lh[0] - 7, P.lh[1], 14, 16, '#3c3a44'); else { const fy = Math.min(FLOOR - 14, 0 + at(t, [[4.2, P.lh[1] + 4], [4.5, FLOOR - 14]], p.ease.in)); c.save(); c.translate(26, fy + 7); c.rotate(-k(t, 4.2, 4.5) * .3); box(p, -7, -7, 14, 14, '#3c3a44'); c.restore(); }
    if (aX <= 148) cake = friendA();
    // the puff of breath
    const blow = Math.max(blow1, blow2 * 1.4);
    const hd = P ? P.head : [x, -99];
    if (blow > .05) for (let i = 0; i < 3; i++) { const ph = (t * 3 + i / 3) % 1, mx = hd[0] + 11; ln(p, mx + ph * 14, hd[1] + 6 + (i - 1) * 4 * ph, mx + ph * 14 + 6, hd[1] + 6 + (i - 1) * 5 * ph, 1.4, `rgba(255,255,255,${(.8 * blow * (1 - ph)).toFixed(2)})`); }
    // the dark before the switch, and the hallway light when the door is open
    p.dark(.9 * (1 - on));
    if (door > 0 && on < 1) { shape(p, [8, FLOOR, 48, FLOOR, 60 + 50 * door, p.H, 0, p.H], '#ffe2a0', .2 * door * (1 - on)); box(p, 7, FLOOR - 137, 42 * door, 137, '#ffe2a0', .12 * door * (1 - on)); } // the hallway light
    if (on < 1) for (const d of [-3, 3]) dot(p, 180 + d, FLOOR - 87, 1.1, `rgba(255,240,180,${(.9 * (1 - on)).toFixed(2)})`); // the dog's eyes in the dark
    p.flash(.6 * (1 - k(t, 4.05, 4.6, p.ease.out)) * (t > 4.05 ? 1 : 0));
    p.confetti(t, 3, k(t, 4.15, 4.4) * (1 - k(t, 8.5, 9.5)));
    p.confetti(t, 8, k(t, 15.2, 15.5) * (1 - k(t, 16.6, 17.4)));
    p.say(bB.head[0] - 8, bB.head[1] - 18, 'Surprise!', { tail: -1, a: k(t, 4.25, 4.4) * (1 - k(t, 6.6, 7)) });
    p.sym('bang', hd[0] + 2, hd[1] - 28, 1.2, k(t, 4.15, 4.3) * (1 - k(t, 5.4, 5.8)));
    p.sym('q', hd[0] + 4, hd[1] - 28, 1, k(t, 12.35, 12.5) * (1 - k(t, 12.8, 12.95)) + k(t, 14.55, 14.7) * (1 - k(t, 15.05, 15.2)));
    p.sym('spark', hd[0] - 10, hd[1] - 30, .7, wish ? .5 + p.wave(t, .6, .4) : 0);
    for (let i = 0; i < 3; i++) p.sym('heart', 70 + i * 50, 120 - ((t - 15.4) * 18 + i * 12) % 60, .8, k(t, 15.4, 15.8) * (1 - k(t, 16.6, 17)));
    void cake;
  },
};

// ── The proposal: dinner by candlelight, down on one knee, no ring in the pocket… the cat brings it. Yes. ──
const proposal: Story = {
  id: 'the-proposal', title: 'The question', dur: 21,
  beats: [[0, 'A candle-lit dinner for two.'], [3.4, 'One of them has been fidgeting all evening.'], [6.6, 'Down on one knee… where is the ring?'], [9.4, 'The cat had it. The cat always has it.'], [12.4, 'Will you…?'], [14.6, 'Yes! A thousand times yes.']],
  draw(p: Pen, t: number) {
    const { k, at, FLOOR } = p, c = p.c;
    p.room({ wall: '#b98f8a', floor: '#6e4a36', paper: 'stripes' });
    p.window(120, 82, 64, 70, '#18203a');
    dot(p, 136, 64, 7, '#f6edc8'); dot(p, 139, 62, 6, '#1f2944'); // a crescent moon
    p.picture(40, 96, 30, 38, '#9fb7d0'); p.plant(214, FLOOR, 1.1);
    const top = FLOOR - 54;
    const A = { shirt: '#3e4c6e', pants: '#2b2f3a', hair: 'short' as const, hairC: '#2a1d14', skin: '#c68b5e' };
    const Bo = { shirt: '#c84a5a', hair: 'long' as const, hairC: '#5a3320', skin: '#f1c9a5', dress: true };
    const stoodA = t > 5.2, kneeling = t > 6.5 && t < 15.8, hug = t > 15.8;
    p.chair(66, 1, '#6b4530'); p.chair(174, -1, '#6b4530');
    // B at the table (until the hug)
    const gasp = k(t, 12.8, 13.1) * (1 - k(t, 14.4, 14.7)), yes = t > 14.5;
    let bHand: [number, number] = [0, 0];
    if (!hug) {
      const sip = t < 6 ? k(t, 1.2, 1.6) * (1 - k(t, 2.6, 3)) : 0, startle = t > 6.6 && t < 8 ? 1 : 0;
      const Bb = p.person(170, { ...Bo, pose: 'sit', face: -1,
        armR: gasp > .3 ? { a: 1.7, b: 2.3 } : startle ? { a: 1.7, b: 1.6 } : yes ? { a: 1.2, b: 1.4 } : sip > .2 ? { a: 1.0, b: 2.1 } : { a: 1.25, b: .6 },
        armL: gasp > .3 ? { a: .9, b: 1.6 } : yes ? { a: 1.3, b: 1.2 } : { a: 1.2, b: .5 },
        mouth: gasp > .3 ? 'o' : yes ? 'grin' : startle ? 'o' : t > 9.4 && t < 12 ? 'smile' : 'smile', eyes: gasp > .3 ? 'wide' : yes ? 'happy' : 'open',
        blush: t > 12.6, tilt: t > 7 && t < 12 ? -.12 : 0, bob: yes && t < 15.6 ? Math.abs(p.wave(t, .45, 3)) : 0 });
      bHand = Bb.rh;
      if (sip > .2) p.glass(Bb.rh[0], Bb.rh[1] + 6, .5, '#b8304a');
    }
    // A at the table first
    if (!stoodA) {
      const fork = t < 3 ? p.wave(t, .9, .25) : 0, nervous = t > 3.4;
      const Ab = p.person(70, { ...A, pose: 'sit', face: 1, armR: nervous ? { a: .4 + Math.abs(p.wave(t, .5, .2)), b: .3 } : { a: 1.2 + fork, b: .9 - fork }, armL: { a: 1.2, b: .6 },
        mouth: nervous ? 'flat' : 'smile', eyes: 'open', tilt: nervous ? .1 : 0, lean: nervous ? -.05 : 0 });
      p.sym('drop', Ab.head[0] - 12, Ab.head[1] - 10 + ((t - 3.4) * 14) % 12, .8, nervous ? .9 : 0);
    }
    // the table with a cloth, the candles, the dinner
    p.table(120, 96, 54, '#5e3d28');
    shape(p, [70, top - 1, 170, top - 1, 174, top + 26, 66, top + 26], '#f4efe6');
    for (let i = 0; i < 9; i++) dot(p, 70 + i * 12.5, top + 26, 6.4, '#f4efe6');
    p.plate(92, top - 1, t < 3.4 ? '#c7703f' : '#a35a35'); p.plate(148, top - 1, '#7fae5e');
    if (!(t < 6 && t > 1.3 && t < 3)) p.glass(160, top - 1, .5, '#b8304a');
    p.glass(82, top - 1, .4, '#b8304a');
    p.flowers(120, top - 1, '#e8577a');
    flame(p, 106, top - 1, 1, t, .25); flame(p, 134, top - 1, 1, t + 2, .25);
    // the cat: trots in from the right with the ring box, sits, drops it
    const catX = at(t, [[9.0, 262], [10.8, 152]], p.ease.lin), catWalk = t > 9.0 && t < 10.8, catSit = t >= 10.8;
    const ringOnFloor = t >= 10.9 && t < 11.7, ringX = at(t, [[10.8, catX - 20], [11.1, 136]]);
    // A: stands, steps round to the front, kneels
    let ringHand: [number, number] | null = null, ringOpen = 0;
    if (stoodA && !kneeling && !hug) {
      const ax = at(t, [[5.4, 72], [6.4, 102]], p.ease.lin), w = t > 5.4 && t < 6.4;
      p.person(ax, { ...A, pose: w ? 'walk' : 'stand', ph: t * 7, face: 1, armR: .2, armL: .1, mouth: 'flat', bob: t > 6.3 ? -k(t, 6.3, 6.5) * 10 : 0 });
    } else if (kneeling) {
      const pat = t > 7.4 && t < 9.3, pick = t > 11.1 && t < 11.9, offer = t >= 11.9;
      const Ab = kneel(p, 102, { ...A, face: 1,
        armR: pat ? { a: .25 + Math.abs(p.wave(t, .5, .35)), b: -.2 } : pick ? { a: .55, b: 0 } : offer ? { a: 1.45, b: .1 } : { a: .5, b: .9 },
        armL: pat ? { a: -.1 + Math.abs(p.wave(t, .6, .3)), b: -.1 } : offer ? { a: 1.2, b: .3 } : .1,
        lean: pick ? .55 : offer ? .05 : 0, mouth: pat ? 'o' : offer ? 'smile' : t > 9.4 && t < 11.1 ? 'flat' : 'smile', eyes: pat ? 'wide' : yes ? 'happy' : 'open', blush: offer,
        tilt: t > 9.6 && t < 11 ? .25 : 0 });
      if (pat) { p.sym('drop', Ab.head[0] - 14, Ab.head[1] - 8, .8, .9); p.sym('drop', Ab.head[0] + 14, Ab.head[1] - 14, .7, .8); }
      p.sym('q', Ab.head[0] + 2, Ab.head[1] - 28, 1, k(t, 8, 8.3) * (1 - k(t, 9.4, 9.8)));
      if (pick || (offer && t < 14.6)) { ringHand = Ab.rh; ringOpen = k(t, 12.2, 12.8); }
    }
    if (ringOnFloor) p.ring(ringX, FLOOR, 0);
    if (ringHand) p.ring(ringHand[0] + 2, ringHand[1] + 4, ringOpen);
    p.cat(catX, FLOOR, { face: -1, sit: catSit, ph: t * 12, color: '#e0a15a', tail: p.wave(t, 1.6, catSit ? 1 : .5) });
    if (catWalk) p.ring(catX - 22, FLOOR - 13, 0);
    // the hug at the end
    if (hug) {
      const sway = p.wave(t, 2.4, 1.5);
      p.person(132 + sway, { ...Bo, face: -1, armL: { a: 1.6, b: .5 }, armR: { a: 1.45, b: .7 }, mouth: 'grin', eyes: 'happy', blush: true, tilt: -.15 });
      const Ah = p.person(108 + sway, { ...A, face: 1, armL: { a: 1.6, b: .5 }, armR: { a: 1.5, b: .55 }, mouth: 'smile', eyes: 'happy', blush: true, tilt: .1 });
      bHand = [Ah.rh[0], Ah.rh[1]];
    }
    // dim room, the candles glowing over it
    p.dark(.42);
    p.light(120, top - 14, 110, '#ffb860', .3);
    // the sparkle of the ring on its new finger
    if (t > 14.6 && !hug) p.sym('spark', bHand[0] - 2, bHand[1] - 6, .7, .6 + p.wave(t, .5, .4));
    p.say(170, 120, 'Yes!', { tail: -1, a: k(t, 14.6, 14.8) * (1 - k(t, 16, 16.3)) });
    for (let i = 0; i < 6; i++) { const ph = ((t - 14.6) * .35 + i / 6) % 1; p.sym('heart', 80 + p.rnd(i) * 90 + Math.sin(t * 2 + i) * 6, 170 - ph * 140, .7 + p.rnd(i + 9) * .5, (t > 14.6 ? 1 : 0) * k(t, 14.6, 15) * Math.sin(ph * Math.PI)); }
    p.sym('bang', catX - 12, FLOOR - 52, .9, k(t, 10.8, 11) * (1 - k(t, 11.6, 11.9)), '#f7d35c');
    void c;
  },
};

// ── Piano practice: clang, clonk, the dog howls along and the picture slides crooked; slowly, with the metronome, it comes right ──
const piano: Story = {
  id: 'piano-practice', title: 'Piano practice', dur: 20,
  beats: [[0, 'Piano practice, day forty-three.'], [2.4, 'It is not going well. The dog agrees.'], [7.6, 'Slowly now. Tick, tock.'], [10.6, 'Oh! There it is!'], [15, 'Bravo! The dog would like credit too.']],
  draw(p: Pen, t: number) {
    const { k, at, FLOOR } = p;
    p.room({ wall: '#e6d9b8', floor: '#9a6a45', paper: 'dots' });
    p.rug(150, 150, '#5b7fa8');
    p.window(200, 70, 48, 56, '#26355e');
    const bad = t > 2.2 && t < 6.9, good = t > 9.8 && t < 15;
    const tilt = at(t, [[2.4, 0], [3, .07], [4, .14], [5.2, .22], [6.5, .3], [11, .3], [12, 0]]) + (bad ? p.wave(t, .12, .02) : 0);
    p.picture(146, 56, 34, 24, '#9cc0a8', tilt);
    p.door(26, 1);
    const top = p.piano(108);
    box(p, 96, top - 34, 24, 17, '#fbf8f0'); for (let i = 0; i < 4; i++) ln(p, 99, top - 30 + i * 3.4, 117, top - 30 + i * 3.4, .6, '#8a8a8a'); // the sheet music
    const swing = t > 9.2 ? Math.sin((t - 9.2) * Math.PI * 1.25) * .5 * (1 - k(t, 15.2, 16)) : 0;
    metronome(p, 76, p.FLOOR - 120, swing);
    p.plant(146, FLOOR - 120, .6);
    // the parent: in the doorway, then sets the metronome going, then applauds
    const px = at(t, [[7.6, 28], [8.4, 42]], p.ease.lin), pw = t > 7.6 && t < 8.4;
    const ears = t > 3.9 && t < 7.3, reach = t > 8.4 && t < 9.5, clap = t > 15 && t < 17.6;
    const cl = clap ? Math.abs(p.wave(t, .32, .28)) : 0;
    const Pp = p.person(px, { pose: pw ? 'walk' : 'stand', ph: t * 7, face: 1, shirt: '#b6576a', pants: '#3b3f4a', hair: 'bun', hairC: '#3a2618', skin: '#e0ac7e',
      armR: ears ? { a: 2.5, b: 2.1 } : reach ? { a: 2.35, b: .3 } : clap ? { a: 1.3 + cl, b: .6 } : { a: .12, b: .2 },
      armL: ears ? { a: 2.3, b: 2.2 } : clap ? { a: 1.35, b: .8 } : { a: .05, b: .2 },
      mouth: ears ? 'sad' : clap ? 'grin' : t > 10.6 ? 'smile' : 'smile', eyes: ears ? 'closed' : t > 11 ? 'happy' : 'open', tilt: t > 10.6 && t < 15 ? .12 : 0 });
    // the kid on the stool
    p.stool(172);
    const bang = bad ? p.wave(t, .28, .45) : 0, play = good ? p.wave(t, .7, .1) : 0;
    const glare = t > 6.9 && t < 8.2, done = t > 15.1 && t < 16.6;
    const Kb = p.person(170, { pose: 'sit', y: FLOOR - 52, s: .64, face: glare ? 1 : -1, shirt: '#f2c94c', pants: '#4f7cac', hair: 'spiky', hairC: '#6b3e1e', skin: '#f1c9a5',
      armR: done ? { a: 2.8, b: .2 } : glare ? { a: .3, b: 1.6 } : bad ? { a: 1.55 + bang, b: .2 } : good ? { a: 1.45 + play, b: .35 } : t < 2.2 ? { a: 2.4 + p.wave(t, .3, .2), b: .6 } : { a: 1.3, b: .4 },
      armL: done ? { a: 2.6, b: .2 } : glare ? { a: .3, b: 1.6 } : bad ? { a: 1.55 - bang, b: .2 } : good ? { a: 1.4 - play, b: .4 } : t < 2.2 ? { a: 2.4 - p.wave(t, .3, .2), b: .6 } : { a: 1.25, b: .4 },
      mouth: bad ? (t > 5 ? 'open' : 'flat') : glare ? 'flat' : good ? 'smile' : t > 15 ? 'grin' : 'smile', eyes: good ? 'closed' : t > 15 ? 'happy' : glare ? 'open' : 'open',
      lean: bad ? .12 : 0, bob: done ? Math.abs(p.wave(t, .5, 2)) : 0 });
    // the dog: howls along with the bad bit, sings one clean note with the good bit
    const howl = k(t, 3.5, 3.9) * (1 - k(t, 6.8, 7.1)) + .75 * k(t, 12.4, 12.8) * (1 - k(t, 14.2, 14.6));
    singingDog(p, 204, FLOOR, howl, { face: -1, wag: t > 14.6 || (t > 7 && t < 8.4) ? t * 14 : t * 3, tongue: true, color: '#b07a45' });
    // the sounds
    for (let i = 0; i < 6; i++) {
      const ph = (t * .9 + i / 6) % 1, a = Math.sin(ph * Math.PI) * k(t, 2.3, 2.6) * (1 - k(t, 6.6, 7));
      if (bad) { p.sym('note', 70 + i * 16 + p.wave(t, .09, 3), top - 40 - ph * 70, .9 + p.rnd(i) * .5, a, '#6a2f2f'); if (i % 3 === 0) p.sym('anger', 80 + i * 14, top - 60 - ph * 50, .7, a, '#b0453a'); }
      const g = Math.sin(ph * Math.PI) * k(t, 9.9, 10.4) * (1 - k(t, 14.6, 15));
      if (good) p.sym('note', 64 + ph * 110, top - 56 - ph * 50 + Math.sin(ph * 7 + i) * 9, 1, g, '#c9961e');
    }
    if (howl > .5 && t < 7.2) p.say(188, FLOOR - 62, 'Awooo!', { tail: -1, a: k(t, 3.9, 4.1) * (1 - k(t, 6.5, 6.8)) });
    p.sym('note', 190 - (t - 12.6) * 6, FLOOR - 66 - (t - 12.6) * 14, 1.1, t > 12.6 && t < 14.6 ? Math.sin((t - 12.6) / 2 * Math.PI) : 0, '#c9961e');
    p.sym('anger', Kb.head[0] + 6, Kb.head[1] - 14, .8, glare ? 1 : 0);
    p.sym('drop', 180, FLOOR - 70, .7, glare ? .9 : 0, '#7cc4f2');
    for (let i = 0; i < 3; i++) p.sym('star', Pp.head[0] + 18 + i * 14, Pp.head[1] - 18 - (i % 2) * 10, .8, clap ? .5 + p.wave(t + i * .3, .6, .4) : 0);
    p.sym('star', 186, FLOOR - 66, .8, t > 15.4 && t < 18 ? .6 + p.wave(t, .7, .3) : 0);
    p.sym('spark', 108, top - 50, .9, t > 10.6 && t < 11.6 ? Math.sin((t - 10.6) * Math.PI) : 0);
    void Kb;
  },
};

// ── Spider: a quiet read, a spider drops in, a leap onto the armchair; the calm one carries it out under a glass. The other one. ──
const spiderStory: Story = {
  id: 'spider', title: 'A small visitor', dur: 21,
  beats: [[0, 'A quiet evening with a good book.'], [3, 'Someone small is dropping in.'], [6.6, 'Absolutely not.'], [9.6, 'Enter the calm one, with a glass.'], [12.8, 'Gently does it. Out you go.'], [17.4, 'Nobody mention the other one.']],
  draw(p: Pen, t: number) {
    const { k, at, FLOOR } = p, c = p.c;
    p.room({ wall: '#c9d6c0', floor: '#8a6446', paper: 'plain' });
    p.rug(110, 140, '#a65a48');
    p.picture(60, 70, 36, 28, '#d9a86a'); p.clock(190, 50, 21.5 + t / 3600);
    const doorOpen = at(t, [[8.9, 0], [9.4, 1], [15, 1], [15.6, 0], [15.9, 0], [16.3, .8]]);
    p.door(214, doorOpen);
    p.floorLamp(30, 1);
    p.cat(46, FLOOR, { sit: true, face: 1, tail: p.wave(t, 1.8), color: '#5a5a62' });
    const top = p.table(158, 50, 48, '#7a5236');
    p.cup(176, top, 1 - k(t, 6, 14), t, '#f4efe6');
    p.armchair(96, '#4f7a8a', 1);
    // the spider: down on its thread, a pause at eye level, down onto the table, a stroll, then the glass
    const sx = at(t, [[9.6, 138], [10.8, 158]], p.ease.io);
    const sy = at(t, [[3, -10], [6.0, FLOOR - 100], [8.0, FLOOR - 100], [9.4, top - 6]], p.ease.io) + (t > 6 && t < 8 ? p.wave(t, 1.2, 1.5) : 0);
    const caught = t > 12.6;
    if (t > 3 && t < 9.8) ln(p, 138, 0, 138, sy - 4, .7, '#7d7d7d');
    if (!caught && t > 3) spider(p, sx, sy, t, 1, t > 9.6 && t < 10.8 ? 1 : 0);
    // the reader
    const skin = '#f1c9a5', who = { shirt: '#e3a33b', pants: '#5b6d8a', hair: 'bun' as const, hairC: '#8a4a22', skin };
    const onChair = t > 7 && t < 15.6, pick = t > 15.6 && t < 16.2;
    let bookAt: [number, number] | null = null;
    if (!onChair) {
      const see = t > 6.3, rd = !see || t > 16.2;
      const R = p.person(92, { ...who, pose: 'sit', face: 1,
        armR: pick ? { a: .55, b: .1 } : rd ? { a: 1.0, b: 1.0 } : { a: .7, b: .6 }, armL: pick ? { a: .5, b: .1 } : rd ? { a: .9, b: 1.1 } : { a: .6, b: .6 },
        lean: pick ? .5 : 0, mouth: see && t < 7 ? 'o' : t > 16.6 ? 'smile' : 'smile', eyes: see && t < 7 ? 'wide' : t > 16.6 && t < 17.6 ? 'happy' : 'open', blush: t > 16.6 && t < 18 });
      if (rd || (see && t < 7)) bookAt = R.rh;
      p.sym('bang', R.head[0] + 4, R.head[1] - 28, 1.2, t < 7.2 ? k(t, 6.4, 6.55) : 0);
    } else {
      const jump = t < 7.5 ? Math.sin((t - 7) / .5 * Math.PI) * 14 : 0, shake = t < 12.8 ? p.wave(t, .07, 1.2) : 0, point = t > 8.6 && t < 10;
      const R = p.person(96 + shake, { ...who, y: FLOOR - 50, front: true,
        armL: { a: 2.6 + p.wave(t, .2, .1), b: .3 }, armR: point ? { a: 1.6, b: 0 } : { a: 2.7 + p.wave(t, .23, .1), b: .3 },
        mouth: t < 12.8 ? 'open' : 'flat', eyes: t < 13.4 ? 'wide' : 'open', bob: jump, tilt: t > 13.4 ? .12 : 0 });
      p.say(R.head[0] + 12, R.head[1] - 16, 'Eek!', { tail: 1, a: k(t, 7.1, 7.2) * (1 - k(t, 8.4, 8.6)) });
      p.say(R.head[0] + 12, R.head[1] - 16, 'Help!', { tail: 1, a: k(t, 8.8, 8.9) * (1 - k(t, 9.9, 10.1)) });
      p.sym('drop', R.head[0] - 20, R.head[1] - 6 + ((t * 18) % 12), .8, t < 12.6 ? .9 : 0);
      p.sym('drop', R.head[0] + 20, R.head[1] - 10 + ((t * 18 + 5) % 12), .7, t < 12.6 ? .9 : 0);
    }
    // the book: in the hands, flung in the leap, on the floor, back in the hands
    if (bookAt) p.book(bookAt[0] + 2, bookAt[1] - 4, true, '#3e6db4', -.25);
    else if (t > 7) { const f = k(t, 7, 7.6, p.ease.lin), bx = p.lerp(130, 124, f), by = p.lerp(FLOOR - 80, FLOOR + 12, f) - Math.sin(f * Math.PI) * 30; p.book(bx, by, f < 1, '#3e6db4', f * 4.6); }
    // the calm one: in through the door, glass over the spider, paper under, out the door; back for the end
    const out = t > 13.4 && t < 15.2, back = t > 16.2;
    const qx = out ? at(t, [[13.4, 186], [15.2, 252]], p.ease.lin) : back ? at(t, [[16.2, 236], [17, 200]], p.ease.lin) : at(t, [[9.4, 236], [10.6, 186]], p.ease.lin);
    const qWalk = (t > 9.4 && t < 10.6) || out || (t > 16.2 && t < 17);
    if (t > 9.4 && !(t > 15.2 && t < 16.2)) {
      const place = t > 10.8 && t < 12.6, lift = k(t, 12.6, 13.2);
      const Q = p.person(qx, { face: out ? 1 : -1, pose: qWalk ? 'walk' : 'stand', ph: t * 6, shirt: '#6a5a8a', pants: '#33363f', hair: 'short', hairC: '#c9c2b4', skin: '#9b6640', glasses: true, beard: true,
        armR: out ? { a: 1.35, b: 0 } : place ? { a: .9, b: 0 } : t > 12.6 && !back ? { a: .9 + lift * .45, b: 0 } : back ? { a: .3, b: .4 } : { a: 1.15, b: 0 },
        armL: t > 11.5 && t < 12.6 ? { a: .95, b: 0 } : out || back ? .1 : { a: .7, b: .4 },
        mouth: back ? 'smile' : 'flat', eyes: back ? 'happy' : 'open', lean: place ? .08 : 0 });
      if (!back) {
        const gx = Q.rh[0], gy = Q.rh[1] + 11;
        if (caught) { spider(p, gx, gy - 7, t, .9, 0); box(p, gx - 12, gy, 24, 2.5, '#fbf7ee'); }
        else if (t > 11.5) box(p, p.lerp(Q.lh[0], gx - 12, k(t, 11.6, 12.4)), top - 2.5, 24, 2.5, '#fbf7ee');
        else if (t < 11.5) p.letter(Q.lh[0] - 4, Q.lh[1] + 2, .3);
        tumbler(p, gx, gy);
      }
    }
    // the other one
    const y2 = at(t, [[17.6, -8], [19.4, 108]]);
    if (t > 17.6) { ln(p, 66, 0, 66, y2 - 3, .6, '#7d7d7d'); spider(p, 66, y2, t, .55); }
    p.sym('bang', 58, FLOOR - 52, .9, k(t, 18.6, 18.8));
    p.sym('heart', 132, 112, .9, k(t, 16.8, 17.1) * (1 - k(t, 18.2, 18.6)));
    p.light(30, FLOOR - 105, 60, '#ffd890', .12);
    void c;
  },
};

export const STORIES_A: Story[] = [snack, birthday, proposal, piano, spiderStory];
