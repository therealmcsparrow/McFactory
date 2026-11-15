const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-gpu', '--use-angle=d3d11', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 480, height: 300 } });
  await p.goto('http://127.0.0.1:4583/'); await p.waitForFunction(() => window.__fac && window.__fac.stats().factories > 0, null, { timeout: 30000 }); await p.waitForTimeout(3000);
  const r = await p.evaluate(([T, DT]) => { const F = window.__fac, t0 = F.simT(); let f = 0; for (;;) { const el = F.simT() - t0; if (el >= T) break; if (el < 31 && f <= Math.floor(el / 5)) { F.flood(15); f++; } F.step(DT, DT); }
    return [JSON.stringify(F.tow())].concat(F.robots().filter(r => r.st !== 'park').map(r => [r.id, r.st, r.task, +r.x.toFixed(2), +r.z.toFixed(2), +r.v.toFixed(2), r.why, r.blk, r.wait, r.dk, +r.left.toFixed(1)].join(' '))); }, [+process.argv[2], +process.argv[3]]);
  console.log(r.join('\n')); await b.close();
})();
