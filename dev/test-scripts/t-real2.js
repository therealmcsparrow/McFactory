const { chromium } = require('playwright');
const SP = 'P:/Temp/claude/6f3f9e048af54318/19f138dd-28ab-4442-854b-2cd20bb83707/scratchpad/';
(async () => {
  const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-gpu', '--use-angle=d3d11', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = []; p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); }); p.on('pageerror', e => errs.push('PAGEERR ' + e.message));
  await p.goto('http://127.0.0.1:4587/'); await p.waitForFunction(() => window.__fac && window.__fac.stats().factories > 0, null, { timeout: 30000 });
  const s0 = await p.evaluate(() => __fac.stats()); const W0 = Date.now(); let minD = 1e9, still = 0, busy = 0, last = -1;
  while (Date.now() - W0 < 80000) {
    const { rs, st } = await p.evaluate(() => ({ rs: __fac.robots(), st: __fac.stats() }));
    for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) minD = Math.min(minD, Math.hypot(rs[i].x - rs[j].x, rs[i].z - rs[j].z));
    if (st.queued > 0) for (const r of rs) { busy++; if (r.st === 'park' || (r.st === 'go' && r.v < .05)) still++; }
    const k = Math.floor((Date.now() - W0) / 10000); if (k !== last) { last = k; console.log(k * 10 + 's delivered', st.delivered - s0.delivered, 'docked', st.docked - s0.docked, 'waiting', st.queued, 'carried', st.carried, 'dropping', st.dropping, 'robots', st.robots); }
    await p.waitForTimeout(250);
  }
  const s1 = await p.evaluate(() => __fac.stats());
  console.log('REAL end delivered', s1.delivered - s0.delivered, 'docked', s1.docked - s0.docked, 'waiting', s1.queued, 'carried', s1.carried, 'dropping', s1.dropping, 'balance(docked-delivered-waiting-carried-dropping, rel start)', (s1.docked - s0.docked) - (s1.delivered - s0.delivered) - (s1.queued - s0.queued) - (s1.carried - s0.carried) - (s1.dropping - s0.dropping));
  console.log('REAL minDist', minD.toFixed(3), 'still%', (100 * still / Math.max(1, busy)).toFixed(1), still + '/' + busy);
  console.log('errors', errs.length, errs.slice(0, 5)); await b.close();
})();
