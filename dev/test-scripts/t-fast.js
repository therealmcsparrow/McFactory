const { chromium } = require('playwright');
const DUR = +(process.argv[2] || 75), FLOODN = +(process.argv[3] || 15);
(async () => {
  const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-gpu', '--use-angle=d3d11', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 480, height: 300 } });
  const errs = []; p.on('pageerror', e => errs.push('PAGEERR ' + e.message));
  await p.goto('http://127.0.0.1:4583/'); await p.waitForFunction(() => window.__fac && window.__fac.stats().factories > 0, null, { timeout: 30000 });
  await p.waitForTimeout(3000);
  const r = await p.evaluate(([DUR, FN, DT]) => {
    const F = window.__fac, s0 = F.stats(), t0 = F.simT(); const stop = {}; let minB = 1e9, evs = []; let minD = 1e9, minPair = null, still = 0, busy = 0, floods = 0, tMin = 1e9, tPair = null, d60 = null; const out = [];
    const ov = []; // overlap frames (d<.92)
    for (;;) { const el = F.simT() - t0; if (el >= DUR) break;
      if (el < 31 && floods <= Math.floor(el / 5)) { F.flood(FN); floods++; }
      F.step(DT, DT);
      const rs = F.robots(), st = F.stats(), tw = F.tow(); const live = rs.filter(r => r.born > .5 && !r.dying); const lv2 = live.filter(r => r.st !== 'broken'); for (const q of live) if (q.st === 'broken') for (const o of lv2) { const d = Math.hypot(o.x - q.x, o.z - q.z); if (d < minB) minB = d; }
      for (let i = 0; i < lv2.length; i++) for (let j = i + 1; j < lv2.length; j++) { const d = Math.hypot(lv2[i].x - lv2[j].x, lv2[i].z - lv2[j].z); if (d < .92 && evs.length < 12 && !evs.some(e => e[0] === lv2[i].id && e[1] === lv2[j].id && el - e[8] < 3)) evs.push([lv2[i].id, lv2[j].id, +d.toFixed(2), lv2[i].x.toFixed(1), lv2[i].z.toFixed(1), lv2[i].st + ':' + lv2[i].task + ':' + lv2[i].v.toFixed(1) + ':' + lv2[i].wait, lv2[j].st + ':' + lv2[j].task + ':' + lv2[j].v.toFixed(1) + ':' + lv2[j].wait, tw.ph, el]); if (d < minD) { minD = d; minPair = [lv2[i].id, lv2[j].id]; } if (d < .92) ov.push(1); }
      if (tw.ph === 'out' || tw.ph === 'tow' || tw.ph === 'hook') for (const r of rs) { if (r.id === tw.id) continue; const d = Math.hypot(r.x - tw.truck[0], r.z - tw.truck[1]); if (d < tMin) { tMin = d; tPair = [r.id, r.st, tw.ph]; } }
      if (st.queued > 0) for (const r of rs) { busy++; if (r.st === 'park' || (r.st === 'go' && r.v < .05)) { still++; const k = r.st === 'park' ? 'park' : ('why' + r.why) + '@' + Math.round(r.x / 2) * 2 + ',' + Math.round(r.z / 2) * 2; stop[k] = (stop[k] || 0) + 1; } }
      if (d60 === null && el >= 60) d60 = st.delivered - s0.delivered;
      if (Math.floor(el / 10) !== out.length) out.push(`${out.length * 10}s del ${st.delivered - s0.delivered} wait ${st.queued} car ${st.carried} drop ${st.dropping} dock ${st.docked - s0.docked}`);
    }
    const s1 = F.stats();
    return { stop: Object.entries(stop).sort((a, b) => b[1] - a[1]).slice(0, 12).map(e => e.join('=')).join(' '), out, minB, evs, minD, minPair, ovFrames: ov.length, tMin, tPair, still: 100 * still / Math.max(1, busy), d60, delivered: s1.delivered - s0.delivered, docked: s1.docked - s0.docked, bal: s1.docked - s1.delivered - s1.queued - s1.carried - s1.dropping, tow: F.tow(), sim: F.simT() - t0 };
  }, [DUR, FLOODN, +(process.argv[4] || 1 / 30)]);
  console.log(r.out.join('\n')); delete r.out; console.log(JSON.stringify(r)); console.log('errors', errs.slice(0, 4));
  await b.close();
})();
