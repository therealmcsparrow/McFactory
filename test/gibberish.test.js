'use strict';
// gibberish.ts (the speech-bubble nonsense): deterministic per seed, different per tone, punctuated, pronounceable.
// The built module is an ES module (dist/ is not "type":"module"), and it has no imports, so it is loaded from its source text.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const DIST = path.join(__dirname, '..', 'dist');
const load = () => import('data:text/javascript,' + encodeURIComponent(fs.readFileSync(path.join(DIST, 'office', 'gibberish.js'), 'utf8')));
const SEEDS = Array.from({ length: 300 }, (_, i) => i);
const WORDS = s => s.replace(/[#@%&!$*?.,]+/g, ' ').trim().split(/\s+/).filter(Boolean);

test('the same seed, word count and tone give the same line', async () => {
  const { gibberish, grawlix } = await load();
  for (const tone of ['cop', 'driver', 'neutral']) for (const s of [1, 42, 'abc', 99999]) {
    assert.equal(gibberish(s, 3, tone), gibberish(s, 3, tone));
    assert.equal(gibberish(s, undefined, tone), gibberish(s, undefined, tone));
  }
  assert.equal(grawlix(7), grawlix(7));
  assert.ok(new Set(SEEDS.map(s => gibberish(s, 3, 'cop'))).size > 250, 'different seeds give different lines');
});

test('every line is capitalised and ends in punctuation', async () => {
  const { gibberish } = await load();
  for (const tone of ['cop', 'driver', 'neutral']) for (const s of SEEDS) {
    const l = gibberish(s, undefined, tone);
    assert.match(l, /[.?!]$/, `${tone} ${s}: ${l}`);
    assert.ok(/^[A-Z#@%&$*]/.test(l), `${tone} ${s} starts with a capital or a symbol: ${l}`);
  }
});

test('words are pronounceable: letters only, a vowel in each, short', async () => {
  const { gibberish } = await load();
  for (const tone of ['cop', 'driver', 'neutral']) for (const s of SEEDS) for (const w of WORDS(gibberish(s, 4, tone))) {
    assert.match(w, /^[A-Za-z]{1,9}$/, `${tone} ${s}: ${w}`);
    assert.match(w, /[aeiouy]/i, `${tone} ${s}: ${w} has a vowel`);
    assert.doesNotMatch(w, /[^aeiouy]{4}/i, `${tone} ${s}: ${w} has no run of 4 consonants`);
    assert.doesNotMatch(w, /[aeiou]{4}/i, `${tone} ${s}: ${w} has no run of 4 vowels`);
  }
});

test('the word count is kept (when the line is not a comic swear)', async () => {
  const { gibberish } = await load();
  for (const n of [1, 2, 3, 5, 8]) for (const s of SEEDS.slice(0, 80)) {
    const l = gibberish(s, n, 'cop');
    assert.equal(WORDS(l).length, n, `cop ${s} n=${n}: ${l}`);
  }
  assert.equal(WORDS(gibberish(3, 20, 'cop')).length, 8, 'clamped to 8');
  assert.equal(WORDS(gibberish(3, 0, 'cop')).length, 1, 'at least 1');
});

test('cop and driver sound different; the driver swears in symbols now and then', async () => {
  const { gibberish, grawlix } = await load();
  const cop = SEEDS.map(s => gibberish(s, 3, 'cop')), drv = SEEDS.map(s => gibberish(s, 3, 'driver'));
  assert.ok(cop.every(l => !/[#@%&$]/.test(l)), 'a cop never swears');
  const sw = drv.filter(l => /[#@%&$]{2}/.test(l)).length;
  assert.ok(sw > 30 && sw < 120, `some driver lines swear (${sw}/300)`);
  const dots = ls => ls.filter(l => /\w\.$/.test(l)).length, bang = ls => ls.filter(l => /(\?!|!!)$/.test(l)).length;
  assert.ok(dots(cop) > 150 && dots(drv) < 30, 'a cop states, a driver does not');
  assert.ok(bang(drv) > 90 && bang(cop) === 0, 'a driver protests ("?!", "!!"), a cop does not');
  const dbl = ls => ls.join(' ').match(/oo|ee|ai|ow|oi/g)?.length || 0;
  assert.ok(dbl(drv) > 3 * dbl(cop), 'the driver drawls (oo, ee, ai...)');
  for (const s of SEEDS) { const g = grawlix(s); assert.match(g, /^[#@%&$*]{3,5}!$/); assert.doesNotMatch(g, /(.)\1/); }
});
