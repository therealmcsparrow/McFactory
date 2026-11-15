'use strict';
// New session: the "skip permission prompts" option must be a real boolean; anything else is refused before claude starts.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Harness } = require('./harness');

test('skipPermissions must be true or false', async () => {
  const h = new Harness();
  try {
    await h.start();
    const start = body => h.req('POST', '/api/chat/start', { headers: { 'x-chat-token': h.token }, body });
    for (const bad of ['yes', 'true', 1, 0, null, {}, []]) {
      const r = await start({ cwd: h.dir, prompt: 'hi', skipPermissions: bad });
      assert.equal(r.status, 400, JSON.stringify(bad));
      assert.match(r.json.error, /skipPermissions/);
    }
    // without the token nothing starts, flag or not
    const r = await h.req('POST', '/api/chat/start', { body: { cwd: h.dir, prompt: 'hi', skipPermissions: true } });
    assert.equal(r.status, 403);
  } finally { await h.stop(); }
});
