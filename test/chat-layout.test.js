'use strict';
// Chat panel layout: with an inline form (permission card or question) showing, the user's input row must stay
// inside the panel instead of being pushed over or out of it. No browser in this project's tests, so this reads
// the built stylesheet (dist/chat.css, written by npm run build) and checks the flex rules that decide it.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const css = fs.readFileSync(path.join(__dirname, '..', 'dist', 'chat.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
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

test('chat panel: the input row never shrinks away', () => {
  const inRow = decls('.chat-in');
  const flex = last(inRow, 'flex'), shrink = last(inRow, 'flex-shrink');
  assert.ok(flex === 'none' || /\b0\s+0\b/.test(flex || '') || shrink === '0', `.chat-in must keep its size (flex:none); found flex:${flex}, flex-shrink:${shrink}`);
});
