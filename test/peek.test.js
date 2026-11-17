'use strict';
// The window stories (office/peek/): 20 of them, well formed, and every one draws from start to end without throwing or
// passing a non-finite number to the canvas. The built modules import each other, so they are copied to a temp folder
// marked "type":"module" (dist/ is not) and loaded from there; the canvas is a stub that records bad arguments.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const SRC = path.join(__dirname, '..', 'dist', 'office', 'peek');
let TMP, STORIES, makePen;
before(async () => {
  TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'peek-test-'));
  fs.writeFileSync(path.join(TMP, 'package.json'), '{"type":"module"}');
  for (const f of fs.readdirSync(SRC).filter(f => f.endsWith('.js') && f !== 'window.js')) fs.copyFileSync(path.join(SRC, f), path.join(TMP, f));
  ({ makePen } = await import(pathToFileURL(path.join(TMP, 'pen.js')).href));
  ({ STORIES } = await import(pathToFileURL(path.join(TMP, 'stories.js')).href));
});
after(() => { if (TMP) fs.rmSync(TMP, { recursive: true, force: true }); });

function stubCtx(bad) {
  const grad = { addColorStop() { } }, o = {};
  return new Proxy(o, {
    get(_, k) { if (k in o) return o[k]; if (k === 'measureText') return s => ({ width: String(s).length * 6 });
      if (k === 'createLinearGradient' || k === 'createRadialGradient') return (...a) => { if (a.some(v => !Number.isFinite(v))) bad.push(String(k)); return grad; };
      return (...a) => { if (a.some(v => typeof v === 'number' && !Number.isFinite(v))) bad.push(String(k)); }; },
    set(_, k, v) { o[k] = v; return true; },
  });
}

test('there are 20 stories with unique ids', () => {
  assert.equal(STORIES.length, 20);
  assert.equal(new Set(STORIES.map(s => s.id)).size, 20);
  for (const S of STORIES) assert.match(S.id, /^[a-z0-9-]+$/);
});

test('each story has a title, a length and captions in order', () => {
  for (const S of STORIES) {
    assert.ok(S.title && S.title.length <= 32, S.id + ': title');
    assert.ok(S.dur >= 10 && S.dur <= 30, S.id + ': dur ' + S.dur);
    assert.ok(S.beats.length >= 2, S.id + ': captions');
    assert.equal(S.beats[0][0], 0, S.id + ': the first caption at 0');
    S.beats.forEach((b, i) => { assert.ok(b[0] < S.dur, S.id + ': caption before the end'); if (i) assert.ok(b[0] > S.beats[i - 1][0], S.id + ': captions in order'); assert.ok(b[1].length > 0 && b[1].length <= 70, S.id + ': caption length'); });
  }
});

test('every story draws from start to end without throwing or NaN coordinates', () => {
  for (const S of STORIES) {
    const bad = [], p = makePen(stubCtx(bad));
    for (let i = 0; i <= 120; i++) { const t = S.dur * i / 120; assert.doesNotThrow(() => S.draw(p, t), S.id + ' at ' + t.toFixed(2)); }
    assert.deepEqual([...new Set(bad)], [], S.id + ': non-finite numbers passed to the canvas');
  }
});

test('a story is a function of time: the same t draws the same calls', () => {
  for (const S of STORIES) {
    const rec = () => { const log = [], o = {}; const c = new Proxy(o, { get(_, k) { if (k in o) return o[k]; if (k === 'measureText') return s => ({ width: String(s).length * 6 }); if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop() { } }); return (...a) => log.push(String(k) + a.map(v => typeof v === 'number' ? v.toFixed(3) : '').join()); }, set(_, k, v) { o[k] = v; log.push(String(k) + '=' + v); return true; } }); return { c, log }; };
    const A = rec(), B = rec(), t = S.dur * .55;
    S.draw(makePen(A.c), t); S.draw(makePen(B.c), S.dur * .2); S.draw(makePen(B.c), t);
    const second = B.log.slice(B.log.length - A.log.length);
    assert.deepEqual(second, A.log, S.id + ': drawing t again gives the same picture');
  }
});
