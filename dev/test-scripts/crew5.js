const { chromium } = require('playwright');
const SP = 'P:/Temp/claude/6f3f9e048af54318/19f138dd-28ab-4442-854b-2cd20bb83707/scratchpad/';
(async () => {
  const b = await chromium.launch({ channel: 'chrome' }); const errs = [];
  try {
    const pg = await b.newPage({ viewport: { width: 1280, height: 800 } });
    pg.on('console', m => { if (m.type() === 'error') errs.push(m.text()); }); pg.on('pageerror', e => errs.push('PE ' + e.message));
    await pg.goto('http://localhost:4589/'); await pg.waitForFunction(() => window.__crew && window.__crew.focus, null, { timeout: 30000 });
    await pg.waitForTimeout(2500);
    console.log('focus', await pg.evaluate(() => window.__crew.focus())); await pg.waitForTimeout(3000);
    await pg.mouse.move(520,465); for (let z = 0; z < 12; z++) { await pg.mouse.wheel(0, -400); await pg.waitForTimeout(80); } await pg.waitForTimeout(800); console.log('retire', JSON.stringify(await pg.evaluate(() => window.__crew.retire(3, [0]))));
    const log = []; let shots = { carry: 0, dump: 0 }, maxW = 0, seen = new Set(), minD = 9, trips = 0, prevCarry = false;
    const t0 = Date.now();
    while (Date.now() - t0 < 100000) {
      const i = await pg.evaluate(() => window.__crew.info()); maxW = Math.max(maxW, i.workers);
      const ph = i.ph[0] || ''; const sts = ph.split(':')[1] || '';
      const tag = ph.split(':')[0]; if (log[log.length - 1] !== ph.replace(/,/g, ' ')) log.push(ph.replace(/,/g, ' '));
      for (let a = 0; a < i.wpos.length; a++) for (let c = a + 1; c < i.wpos.length; c++) { const d = Math.hypot(i.wpos[a][0] - i.wpos[c][0], i.wpos[a][2] - i.wpos[c][2]); const S = sts.split(','); if (d < minD && S[a] !== 'home' && S[c] !== 'home' && S[a] !== 'wait' && S[c] !== 'wait') { minD = d; globalThis.mi = ph; } if (0) console.log('CLOSE', d.toFixed(2), a, c, ph, JSON.stringify(i.wpos)); }
      if (!shots.carry && sts.split(',').filter(s => s === 'carry').length >= 3) { shots.carry = 1; await pg.screenshot({ path: SP + 'crew5-carry.png' }); }
      if (!shots.dump && sts.includes('toss')) { shots.dump = 1; await pg.screenshot({ path: SP + 'crew5-dump.png' }); }
      const carrying = sts.includes('carry'); if (carrying && !prevCarry) trips++; prevCarry = carrying;
      if (i.workers === 0 && i.jobs === 0 && seen.size) break; if (i.workers) seen.add(1);
      if (i.workers && !globalThis.sp) { globalThis.sp = 1; await pg.evaluate(() => window.__crew.speed(1)); }
      await pg.waitForTimeout(150);
    }
    const end = await pg.evaluate(() => window.__crew.info());
    console.log('maxWorkers', maxW, 'trips', trips, 'minDist', minD.toFixed(2), globalThis.mi, 'shots', JSON.stringify(shots)); console.log(log.join('\n')); console.log('end', JSON.stringify({ c: end.crews, w: end.workers, j: end.jobs, d: end.dying, h: end.holds }), 'errs', JSON.stringify(errs));
  } finally { await b.close(); }
})();
