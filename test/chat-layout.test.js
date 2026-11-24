'use strict';
// Chat panel layout: with an inline form (permission card or question) showing, the user's input row must stay
// inside the panel instead of being pushed over or out of it. No browser in this project's tests, so this reads
// src/chat.css (build.js copies it unchanged to dist/chat.css, so this never judges a stale dist) and checks the flex rules.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const css = fs.readFileSync(path.join(__dirname, '..', 'src', 'chat.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
// declarations of every top-level rule whose selector list contains exactly `sel`, in source order
function decls(sel) {
  const out = [];
  for (const m of css.matchAll(/([^{}@]+)\{([^{}]*)\}/g))
    if (m[1].split(',').map(s => s.trim()).includes(sel)) out.push(...m[2].split(';').map(s => s.trim()).filter(Boolean));
  return out;
}
const last = (list, prop) => { const hit = list.filter(d => d.split(':')[0].trim() === prop).pop(); return hit ? hit.slice(hit.indexOf(':') + 1).trim() : null; };

test('chat panel: the pending-form area shrinks inside the panel, so the input row is not pushed out or over it', () => {
  const pend = decls('.chat-pend');
  assert.ok(pend.length, '.chat-pend rule exists');
  const flex = last(pend, 'flex'), shrink = last(pend, 'flex-shrink');
  assert.ok(flex !== 'none' && !/^\d+\s+0\b/.test(flex || '') && shrink !== '0',
    `.chat-pend must be allowed to shrink (found flex:${flex}, flex-shrink:${shrink}); a fixed 46vh block that cannot shrink overflows the panel and the input row ends up over/outside it`);
  assert.match(last(pend, 'overflow') || last(pend, 'overflow-y') || '', /auto|scroll/, '.chat-pend scrolls when it shrinks');
  assert.equal(last(pend, 'min-height'), '0', '.chat-pend has min-height:0 so it can shrink below its content');
});

// flex-basis a rule body gives its element: `flex-basis`, or the 3rd token of `flex` (0% when omitted)
function basisOf(body) {
  let b = null;
  for (const d of body.split(';').map(x => x.trim()).filter(Boolean)) {
    const i = d.indexOf(':'), prop = d.slice(0, i).trim(), val = d.slice(i + 1).trim();
    if (prop === 'flex-basis') b = val;
    else if (prop === 'flex') { const t = val.split(/\s+/); b = t.length >= 3 ? t[2] : (t[0] === 'auto' || t[0] === 'none' ? 'auto' : '0%'); }
  }
  return b;
}
const zeroLength = b => b !== null && /^0(px)?$/.test(b);

test('chat panel: with no form open the log keeps a content basis and is not collapsed to its min-height', () => {
  const rules = [];
  for (const m of css.matchAll(/([^{}@]+)\{([^{}]*)\}/g)) {
    const sels = m[1].split(',').map(s => s.trim());
    if (sels.some(s => /\.chat-log\b/.test(s))) rules.push({ sels, basis: basisOf(m[2]) });
  }
  const base = rules.filter(r => r.sels.includes('.chat-log')).map(r => r.basis).filter(b => b !== null).pop();
  assert.ok(base, '.chat-log sets a flex basis');
  assert.ok(!zeroLength(base), `.chat-log base flex-basis is ${base}: a 0px basis collapses the log to its 48px min-height even with no form open (desktop panel height is not fixed); use auto or 0%`);
  // a zero-length basis is allowed only in a rule scoped to a form being open (.chat-pend)
  for (const r of rules) if (zeroLength(r.basis))
    assert.ok(r.sels.every(s => /\.chat-pend/.test(s)), `zero flex-basis on ${r.sels.join(', ')} must only apply while a form (.chat-pend) is open`);
});

test('chat panel: the input row never shrinks away', () => {
  const inRow = decls('.chat-in');
  const flex = last(inRow, 'flex'), shrink = last(inRow, 'flex-shrink');
  assert.ok(flex === 'none' || /\b0\s+0\b/.test(flex || '') || shrink === '0', `.chat-in must keep its size (flex:none); found flex:${flex}, flex-shrink:${shrink}`);
});
