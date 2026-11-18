'use strict';
// dunes/terrain.ts: the Dunes view's site plan and ground (pure math, loaded from the build on its own).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const load = () => import('data:text/javascript,' + encodeURIComponent(fs.readFileSync(path.join(__dirname, '..', 'dist', 'dunes', 'terrain.js'), 'utf8')));

test('there is a farm slot per farm and no two farms overlap', async () => {
  const T = await load();
  assert.equal(T.SLOTS.length, T.MAXF);
  const zc = (T.FARM_Z0 + T.FARM_Z1) / 2, zh = (T.FARM_Z1 - T.FARM_Z0) / 2;
  const R = Math.hypot(T.FARM_HX, zh); // each farm fits in a circle of this radius round its centre
  const centres = T.SLOTS.map(s => T.farmToWorld(s, 0, zc));
  for (let i = 0; i < centres.length; i++) for (let j = i + 1; j < centres.length; j++) {
    const d = Math.hypot(centres[i][0] - centres[j][0], centres[i][1] - centres[j][1]);
    assert.ok(d > 2 * R, `slots ${i} and ${j} are ${d.toFixed(1)} apart`);
  }
  for (const [x, z] of centres) assert.ok(Math.hypot(x, z) - R > T.SETTLE_R, 'no farm on the settlement');
});

test('farms face away from the depot and the patrol ring runs between the farm rings', async () => {
  const T = await load();
  for (const s of T.SLOTS) {
    const [hx, hz] = T.farmToWorld(s, 0, T.HOMEZ), [rx, rz] = T.farmToWorld(s, 0, T.ROW0 + 4 * T.ROWDZ);
    assert.ok(Math.hypot(hx, hz) < Math.hypot(rx, rz), 'the homestead is on the depot side of the rows');
    for (const lx of [-T.FARM_HX, T.FARM_HX]) for (const lz of [T.FARM_Z0, T.FARM_Z1]) {
      const r = Math.hypot(...T.farmToWorld(s, lx, lz));
      assert.ok(Math.abs(r - T.PATROL_R) > 1, 'the patrol ring does not cross a farm');
      assert.ok(r < T.WALKER_R - 8, 'the crawlers walk outside every farm');
    }
  }
});

test('the ground is flat under the settlement and every farm, and never below zero', async () => {
  const T = await load();
  assert.equal(T.heightAt(0, 0), 0);
  for (const s of T.SLOTS) for (const lx of [-T.FARM_HX, 0, T.FARM_HX]) for (const lz of [T.FARM_Z0, T.HOMEZ, 0, T.FARM_Z1]) {
    const [x, z] = T.farmToWorld(s, lx, lz);
    assert.ok(T.heightAt(x, z) < 1e-9, `farm ground at ${x.toFixed(1)},${z.toFixed(1)}`);
  }
  let max = 0;
  for (let x = -220; x <= 220; x += 7) for (let z = -220; z <= 220; z += 7) { const h = T.heightAt(x, z); assert.ok(h >= 0); max = Math.max(max, h); }
  assert.ok(max > 2, 'there are dunes');
});

test('the pile grows with the total, monotonic and capped', async () => {
  const T = await load();
  assert.equal(T.pileN(0), 0);
  assert.equal(T.pileN(1), 1);
  let last = 0;
  for (const t of [1e3, 1e4, 1e5, 1e6, 1e7, 1e8, 1e9, 1e10, 1e12]) { const n = T.pileN(t); assert.ok(n >= last); assert.ok(n <= T.PILE); last = n; }
  assert.equal(T.pileN(1e12), T.PILE);
});

test('pad and pile spots never share a place', async () => {
  const T = await load();
  const uniq = (n, f) => new Set(Array.from({ length: n }, (_, i) => f(i).map(v => v.toFixed(3)).join())).size;
  assert.equal(uniq(T.PADCAP, T.padSpot), T.PADCAP);
  assert.equal(uniq(T.PILE, T.pileSpot), T.PILE);
});

test('warden routes never pass through a building, a homestead, a field or a pad', async () => {
  const T = await load();
  for (const used of [[0, 1, 2, 3, 4, 5], [0, 2, 5, 6, 9, 13], T.SLOTS.map((_, i) => i)]) {
    const obs = T.walkObs(used), nav = T.makeNav(obs);
    const starts = [T.GARRISON_OUT, ...Array.from({ length: 12 }, (_, k) => { const a = k / 12 * Math.PI * 2; return [Math.cos(a) * T.PATROL_R, Math.sin(a) * T.PATROL_R]; })];
    for (const i of used) {
      const goal = T.postSpot(T.SLOTS[i], 3);
      for (let k = 0; k < 4; k++) assert.ok(!obs.some(o => T.inside(o, ...T.postSpot(T.SLOTS[i], k), .3)), `post ${k} of slot ${i} is clear`);
      for (const a of [...starts, T.postSpot(T.SLOTS[(i + 3) % T.SLOTS.length], 0)]) {
        const p = [a, ...nav.route(a[0], a[1], goal[0], goal[1])];
        for (let s = 1; s < p.length; s++) for (const o of obs) {
          if (T.inside(o, a[0], a[1], .7)) continue; // a squad standing at a post of another farm starts inside its margin
          assert.ok(!T.segHits(o, p[s - 1][0], p[s - 1][1], p[s][0], p[s][1], .4), `route to slot ${i} from ${a.map(v => v.toFixed(0))} crosses an obstacle`);
        }
      }
    }
  }
});

test('farmhands walk round the homestead and behind the rows, never through a tower', async () => {
  const T = await load();
  for (let r = 0; r < T.MAXROW; r++) for (let j = 0; j < T.CAP; j++) {
    const tz = T.ROW0 + r * T.ROWDZ, tx = (j - (T.CAP - 1) / 2) * T.TOWDX, p = T.handPath(tx, tz);
    for (let s = 1; s < p.length; s++) {
      const [ax, az] = p[s - 1], [bx, bz] = p[s];
      if (s > 1) assert.ok(!T.segHits({ x: 0, z: T.HOMEZ, r: 3.3 }, ax, az, bx, bz), 'clear of the dome');
      for (let rr = 0; rr < T.MAXROW; rr++) for (let jj = 0; jj < T.CAP; jj++) { // every tower, and its row's pipe in front of it
        const ox = (jj - (T.CAP - 1) / 2) * T.TOWDX, oz = T.ROW0 + rr * T.ROWDZ;
        assert.ok(!T.segHits({ x: ox, z: oz, r: .45 }, ax, az, bx, bz), `row ${r} tower ${j}: segment ${s} hits tower ${rr}/${jj}`);
        assert.ok(!T.segHits({ x: 0, z: oz - .75, ux: 1, uz: 0, hx: T.CAP * T.TOWDX / 2, hz: .12 }, ax, az, bx, bz), `row ${r} tower ${j}: segment ${s} crosses the pipe of row ${rr}`);
      }
    }
  }
});

test('sled parking spots and duel grounds are clear', async () => {
  const T = await load();
  assert.ok(T.PARK.length >= 8);
  for (const [x, z] of T.PARK) {
    assert.ok(!T.SETTLE_OBS.some(o => T.inside(o, x, z, 1.4)), `park ${x.toFixed(1)},${z.toFixed(1)}`);
    for (const [x2, z2] of T.PARK) if (x2 !== x || z2 !== z) assert.ok(Math.hypot(x2 - x, z2 - z) >= 3.2);
  }
  const farms = T.SLOTS.flatMap(s => T.farmObs(s));
  for (const [x, z] of T.DUEL_SPOTS) {
    assert.ok(!farms.some(o => T.inside(o, x, z, 3)), 'no farm on a duel ground');
    assert.ok(Math.hypot(x, z) > T.SETTLE_R + 6);
  }
});

test('the town: buildings inside it and apart, spots clear, and townsfolk routes clear of every building', async () => {
  const T = await load();
  assert.ok(T.BUILDINGS.length >= 20, `${T.BUILDINGS.length} buildings`);
  for (const k of ['house', 'shop', 'dome', 'cantina', 'tank']) assert.ok(T.BUILDINGS.some(b => b.k === k), `a ${k}`);
  for (const b of T.BUILDINGS) assert.ok(Math.hypot(b.x, b.z) < T.SETTLE_R, 'inside the town');
  for (const [x, z] of T.PORTS) assert.ok(Math.hypot(x, z) + T.PORT_R < T.SETTLE_R, 'bays inside the town');
  for (let i = 0; i < T.PORTS.length; i++) for (let j = i + 1; j < T.PORTS.length; j++)
    assert.ok(Math.hypot(T.PORTS[i][0] - T.PORTS[j][0], T.PORTS[i][1] - T.PORTS[j][1]) > 2 * T.PORT_R + 2, 'bays apart');
  assert.ok(T.TOWN_SPOTS.length >= 30);
  // the same obstacles as folk.ts: buildings, counters, awning poles, porches, and the landing pads
  const obs = [...T.TOWN_OBS, ...T.PARK.map(([x, z]) => ({ x, z, r: 1 }))], nav = T.makeNav(obs, .45);
  for (const [x, z] of T.TOWN_SPOTS) assert.ok(!obs.some(o => T.inside(o, x, z, .5)), `spot ${x.toFixed(1)},${z.toFixed(1)} is clear`);
  for (let i = 0; i < T.TOWN_SPOTS.length; i++) for (let j = 0; j < T.TOWN_SPOTS.length; j++) if (i !== j) { // every spot reachable from every other
    const a = T.TOWN_SPOTS[i], b = T.TOWN_SPOTS[j], p = [a, ...nav.route(a[0], a[1], b[0], b[1])];
    for (let s = 1; s < p.length; s++) for (const o of obs)
      assert.ok(!T.segHits(o, p[s - 1][0], p[s - 1][1], p[s][0], p[s][1], .25), `town route ${i} -> ${j} crosses an obstacle`);
  }
});

test('route and path helpers', async () => {
  const T = await load();
  const nav = T.makeNav([{ x: 0, z: 0, r: 2 }]);
  assert.deepEqual(nav.route(-5, 5, 5, 5), [[5, 5]], 'a clear line is one step');
  const p = nav.route(-5, 0, 5, 0);
  assert.ok(p.length > 1); assert.deepEqual(p[p.length - 1], [5, 0]);
  assert.equal(T.pathLen([[0, 0], [3, 4], [3, 0]]), 9);
  assert.deepEqual(T.pathAt([[0, 0], [3, 4], [3, 0]], 7), [3, 2]);
  assert.deepEqual(T.pathAt([[0, 0], [3, 4]], 99), [3, 4]);
});

test('assignNearest pairs each target with the nearest unused source', async () => {
  const { assignNearest } = await load();
  assert.deepEqual(assignNearest([[0, 0], [10, 0]], [[9, 0], [1, 0]]), [1, 0]);
  assert.deepEqual(assignNearest([[0, 0]], [[5, 0], [1, 0]]), [-1, 0]);
  assert.deepEqual(assignNearest([], [[1, 1]]), [-1]);
});
