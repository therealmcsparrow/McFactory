/* usage.js: the "Usage" full view. Plan limits (from our status line) and token/cost charts per model (GET /api/usage).
 * Plain script after live-data.js and chat.js. Puts a button in .chat-acts and opens a modal <dialog>.
 * All text goes in via textContent; charts are SVG built with createElementNS. */
(() => {
  'use strict';
  const DS = window.DashSim; if (!DS) return;
  const SVGNS = 'http://www.w3.org/2000/svg';
  const DAY = 864e5, HOUR = 36e5;
  const LS = { get: k => { try { return localStorage.getItem(k) || ''; } catch { return ''; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch { } } };
  function h(tag, a, ...kids) {
    const e = document.createElement(tag);
    if (a) for (const k in a) { const v = a[k]; if (v == null || v === false) continue; if (k === 'class') e.className = v; else if (k === 'text') e.textContent = v; else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else e.setAttribute(k, v === true ? '' : v); }
    for (const c of kids.flat()) if (c != null && c !== false) e.append(c.nodeType ? c : document.createTextNode(String(c)));
    return e;
  }
  function s(tag, a) { const e = document.createElementNS(SVGNS, tag); if (a) for (const k in a) if (a[k] != null) e.setAttribute(k, a[k]); return e; }
  const fmtTok = n => n >= 1e9 ? (n / 1e9).toFixed(2) + 'B' : n >= 1e6 ? (n / 1e6).toFixed(n >= 1e8 ? 0 : 1) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(n >= 1e5 ? 0 : 1) + 'k' : String(Math.round(n));
  const fmtUsd = n => n >= 100 ? '$' + Math.round(n) : n >= 1 ? '$' + n.toFixed(2) : '$' + n.toFixed(n ? 3 : 0);
  const pad = n => String(n).padStart(2, '0');
  const dayStart = t => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
  const nextDay = t => { const d = new Date(t); d.setDate(d.getDate() + 1); return d.getTime(); };
  const wd = t => new Date(t).toLocaleDateString(undefined, { weekday: 'short' });
  const dm = t => new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  const clock = t => { const d = new Date(t); return pad(d.getHours()) + ':' + pad(d.getMinutes()); };
  const when = t => { const d = dayStart(t), today = dayStart(Date.now()); return (d === today ? 'today' : d === nextDay(today) ? 'tomorrow' : wd(t) + ' ' + dm(t)) + ' ' + clock(t); };
  const WIN_NAMES = { five_hour: '5-hour window', seven_day: 'Weekly', seven_day_opus: 'Weekly · Opus', seven_day_sonnet: 'Weekly · Sonnet' };
  const winName = k => WIN_NAMES[k] || k.replace(/_/g, ' ');

  let data = null, days = +LS.get('usage.days') || 14, metric = LS.get('usage.metric') === 'cost' ? 'cost' : 'tokens', seq = 0, retry = 0;
  if (![7, 14, 31].includes(days)) days = 14;

  // ───────── dialog
  const tip = h('div', { class: 'us-tip', role: 'status', hidden: true });
  const body = h('div', { class: 'us-body' });
  const msg = h('p', { class: 'us-msg', 'aria-live': 'polite' });
  const daysSel = h('select', { 'aria-label': 'Period' }, [7, 14, 31].map(d => h('option', { value: d, text: 'Last ' + d + ' days' })));
  daysSel.value = String(days);
  daysSel.addEventListener('change', () => { days = +daysSel.value; LS.set('usage.days', days); load(); });
  const segBtn = (v, l) => h('button', { type: 'button', 'data-v': v, 'aria-pressed': String(metric === v), onclick: () => { metric = v; LS.set('usage.metric', v); for (const b of seg.children) b.setAttribute('aria-pressed', String(b.dataset.v === v)); render(); } }, l);
  const seg = h('div', { class: 'us-seg', role: 'group', 'aria-label': 'Measure' }, segBtn('tokens', 'Tokens'), segBtn('cost', 'Cost'));
  const closeBtn = h('button', { type: 'button', class: 'us-x', 'aria-label': 'Close usage', onclick: () => dlg.close() });
  const dlg = h('dialog', { class: 'us', 'aria-labelledby': 'us-title' },
    h('div', { class: 'us-box' },
      h('div', { class: 'us-head' }, h('h2', { id: 'us-title', text: 'Usage' }), h('div', { class: 'us-ctl' }, seg, daysSel, closeBtn)),
      msg, body, tip));
  document.body.append(dlg);
  dlg.addEventListener('close', () => { tip.hidden = true; });
  new ResizeObserver(() => { if (dlg.open && data) render(); }).observe(body);

  async function load() {
    const my = ++seq; msg.textContent = data ? '' : 'Loading…';
    try {
      const r = await fetch('/api/usage?days=' + days, { cache: 'no-store' });
      if (!r.ok) throw new Error('request failed (' + r.status + ')');
      const j = await r.json(); if (my !== seq) return;
      data = j; msg.textContent = j.loading ? 'Still reading older transcripts; numbers may grow.' : '';
      render();
      if (j.loading && retry++ < 10 && dlg.open) setTimeout(() => { if (my === seq && dlg.open) load(); }, 1500);
    } catch (e) { if (my === seq) msg.textContent = 'Could not load usage: ' + e.message; }
  }
  function open() { retry = 0; dlg.showModal(); load(); }

  // ───────── model colors: same family hue as the board
  const colorOf = label => { const m = (data.models || {})[label] || {}; return DS.ensureModel('usage:' + label, { family: m.family || 'other', version: m.version, label }).color; };
  // Two versions of one family share a hue, and no shade of it passes the color check next to the other,
  // so every version but the newest in its family also gets diagonal stripes (fills, legend and tooltip swatches).
  let striped = new Map(); // label -> pattern id
  function stripeKeys(keys) {
    const best = {}; for (const k of keys) { const m = (data.models || {})[k] || {}, f = m.family || 'other', v = parseFloat(m.version) || 0; if (f !== 'other' && !(best[f] >= v)) best[f] = v; }
    striped = new Map(keys.filter(k => { const m = (data.models || {})[k] || {}, f = m.family || 'other'; return f !== 'other' && (parseFloat(m.version) || 0) < best[f]; }).map((k, i) => [k, 'us-pat-' + i]));
  }
  const fillOf = k => striped.has(k) ? `url(#${striped.get(k)})` : colorOf(k);
  const swStyle = k => '--c:' + colorOf(k) + (striped.has(k) ? ';background:repeating-linear-gradient(135deg,var(--c) 0 2px,transparent 2px 4px);box-shadow:inset 0 0 0 1px var(--c)' : '');
  function stripeDefs() {
    const svg = s('svg', { width: 0, height: 0, 'aria-hidden': 'true', style: 'position:absolute' }), defs = s('defs');
    for (const [k, id] of striped) {
      const p = s('pattern', { id, width: 4, height: 4, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' });
      p.append(s('rect', { width: 4, height: 4, fill: colorOf(k), 'fill-opacity': 0.45 }), s('rect', { width: 2, height: 4, fill: colorOf(k) }));
      defs.append(p);
    }
    svg.append(defs); return svg;
  }

  // ───────── tooltip
  function showTip(ev, lines) {
    tip.replaceChildren(...lines.map(([c, a, b], i) => h('div', { class: i ? 'us-tr' : 'us-th' }, c ? h('i', { class: 'sw', style: c.startsWith('--c:') ? c : '--c:' + c }) : null, h('span', { text: a }), b != null ? h('b', { text: b }) : null)));
    tip.hidden = false;
    const box = dlg.querySelector('.us-box').getBoundingClientRect(), tw = tip.offsetWidth, th = tip.offsetHeight;
    let x = ev.clientX - box.left + 14, y = ev.clientY - box.top + 14;
    if (x + tw > box.width - 8) x = ev.clientX - box.left - tw - 14;
    if (y + th > box.height - 8) y = ev.clientY - box.top - th - 14;
    const sc = dlg.querySelector('.us-box').scrollTop; // the box scrolls; the tip is positioned inside it
    tip.style.left = Math.max(8, x) + 'px'; tip.style.top = Math.max(8, y) + sc + 'px';
  }
  const hideTip = () => { tip.hidden = true; };

  // ───────── charts
  const M = { l: 48, r: 10, t: 10, b: 24 };
  function niceMax(v) { if (!(v > 0)) return 1; const p = Math.pow(10, Math.floor(Math.log10(v))); for (const k of [1, 2, 2.5, 5, 10]) if (k * p >= v) return k * p; return 10 * p; }
  function axes(svg, W, H, max, fmt) {
    const g = s('g', { class: 'us-ax' });
    for (let i = 0; i <= 4; i++) {
      const v = max * i / 4, y = M.t + (H - M.t - M.b) * (1 - i / 4);
      g.append(s('line', { x1: M.l, x2: W - M.r, y1: y, y2: y, class: i ? 'us-grid' : 'us-base' }));
      const t = s('text', { x: M.l - 6, y: y + 3.5, 'text-anchor': 'end' }); t.textContent = fmt(v); g.append(t);
    }
    svg.append(g);
  }
  const topRound = (x, y, w, hgt, r) => { r = Math.min(r, w / 2, hgt); return `M${x},${y + hgt}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + hgt}Z`; };
  // cols: [{t, label, vals: {model: v}}]; keys: stacking order (largest first, at the base)
  function bars(cols, keys, H, xLabel, tipHead) {
    const W = Math.max(320, body.clientWidth - 2);
    const val = metric === 'cost' ? 2 : 0, fmt = metric === 'cost' ? fmtUsd : fmtTok;
    const tot = c => keys.reduce((n, k) => n + ((c.vals[k] || [])[val] || 0), 0);
    const max = niceMax(Math.max(0, ...cols.map(tot)));
    const svg = s('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}`, class: 'us-svg' });
    axes(svg, W, H, max, fmt);
    const pw = W - M.l - M.r, ph = H - M.t - M.b, cw = pw / cols.length, bw = Math.max(1, Math.min(28, cw - (cw > 6 ? 2 : 0.5)));
    const y = v => ph * v / max;
    cols.forEach((c, i) => {
      const x = M.l + i * cw + (cw - bw) / 2; let base = M.t + ph;
      const segs = keys.map(k => [k, (c.vals[k] || [])[val] || 0]).filter(x => x[1] > 0);
      segs.forEach(([k, v], j) => {
        const hgt = y(v), top = j === segs.length - 1, gap = j ? Math.min(2, hgt / 2) : 0; // 2px surface gap between stacked fills
        const hh = Math.max(0, hgt - gap);
        if (hh > 0) svg.append(top && bw >= 4 ? s('path', { d: topRound(x, base - hgt, bw, hh, 3), fill: fillOf(k) }) : s('rect', { x, y: base - hgt, width: bw, height: hh, fill: fillOf(k) }));
        base -= hgt;
      });
      const xl = xLabel(c, i); if (xl) { const t = s('text', { x: M.l + i * cw + cw / 2, y: H - 7, 'text-anchor': 'middle', class: 'us-xl' }); t.textContent = xl; svg.append(t); }
      const hit = s('rect', { x: M.l + i * cw, y: M.t, width: cw, height: ph, class: 'us-hit' });
      hit.addEventListener('pointermove', ev => {
        const rows = segs.slice().reverse().map(([k, v]) => [swStyle(k), k, fmt(v)]);
        showTip(ev, [[null, tipHead(c), fmt(tot(c))], ...(rows.length ? rows : [[null, 'nothing', null]])]);
      });
      hit.addEventListener('pointerleave', hideTip);
      svg.append(hit);
    });
    return svg;
  }
  function limitLine(hist, since, now, keys) {
    const W = Math.max(320, body.clientWidth - 2), H = 150;
    const svg = s('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}`, class: 'us-svg' });
    axes(svg, W, H, 100, v => Math.round(v) + '%');
    const pw = W - M.l - M.r, ph = H - M.t - M.b;
    const X = t => M.l + pw * (t - since) / (now - since), Y = v => M.t + ph * (1 - v / 100);
    for (let d = nextDay(dayStart(since)); d < now; d = nextDay(d)) { const t = s('text', { x: X(d), y: H - 7, 'text-anchor': 'middle', class: 'us-xl' }); t.textContent = wd(d); svg.append(t); }
    const COL = { seven_day: 'var(--color-signal)', five_hour: 'var(--color-human)' };
    keys.forEach(k => {
      const pts = hist.filter(p => typeof p.w[k] === 'number').map(p => [p.t, p.w[k]]); if (!pts.length) return;
      let d = ''; pts.forEach(([t, v], i) => { d += (i ? `H${X(t).toFixed(1)}V` : `M${X(t).toFixed(1)},`) + Y(v).toFixed(1); }); // step: a % holds until the next reading
      d += `H${X(now).toFixed(1)}`;
      svg.append(s('path', { d, fill: 'none', stroke: COL[k] || 'var(--color-ink-3)', 'stroke-width': 2, 'stroke-linejoin': 'round' }));
      const [lt, lv] = pts[pts.length - 1]; // the latest reading: a dot, so a single reading still shows
      svg.append(s('circle', { cx: X(lt).toFixed(1), cy: Y(lv).toFixed(1), r: 4, fill: COL[k] || 'var(--color-ink-3)', stroke: 'var(--color-page)', 'stroke-width': 2 }));
    });
    const cross = s('line', { y1: M.t, y2: M.t + ph, class: 'us-cross', visibility: 'hidden' }); svg.append(cross);
    const hit = s('rect', { x: M.l, y: M.t, width: pw, height: ph, class: 'us-hit' });
    hit.addEventListener('pointermove', ev => {
      const r = svg.getBoundingClientRect(), t = since + (ev.clientX - r.left - M.l) / pw * (now - since);
      let p = null; for (const q of hist) if (q.t <= t) p = q;
      cross.setAttribute('x1', ev.clientX - r.left); cross.setAttribute('x2', ev.clientX - r.left); cross.setAttribute('visibility', 'visible');
      showTip(ev, [[null, wd(t) + ' ' + dm(t) + ' ' + clock(t), null], ...keys.map(k => [COL[k], winName(k), p && typeof p.w[k] === 'number' ? p.w[k] + '%' : '—'])]);
    });
    hit.addEventListener('pointerleave', () => { cross.setAttribute('visibility', 'hidden'); hideTip(); });
    svg.append(hit);
    return svg;
  }

  // ───────── render
  function section(title, note, ...kids) { return h('section', { class: 'us-sec' }, h('h3', { text: title }), note ? h('p', { class: 'us-note', text: note }) : null, ...kids); }
  function legend(keys) { return h('div', { class: 'us-lg' }, keys.map(k => h('span', null, h('i', { class: 'sw', style: swStyle(k) }), k))); }
  function limitsSection() {
    const L = data.limits, st = data.statusline;
    if (!L) {
      const why = st === 'ours' ? 'Limits appear after the next reply in a Claude Code session that is signed in to a Claude plan. API key sessions have no plan limits.'
        : st === 'foreign' ? 'You already have your own status line, so the dashboard leaves it alone and cannot read your limits. To see them here, remove your statusLine from ~/.claude/settings.json and restart the dashboard.'
          : st === 'off' ? 'The dashboard was started with --no-statusline, so it does not read limits.'
            : st === 'unreadable' ? 'Your ~/.claude/settings.json could not be read, so the dashboard did not add its status line.'
              : 'The status line is not installed yet. Restart the dashboard to add it.';
      return section('Plan limits', null, h('p', { class: 'us-empty', text: why }));
    }
    const ws = Object.entries(L.windows || {}).sort((a, b) => (a[0] === 'five_hour' ? -1 : b[0] === 'five_hour' ? 1 : a[0] < b[0] ? -1 : 1));
    const meters = ws.map(([k, w]) => {
      const pct = Math.max(0, Math.min(100, +w.pct || 0)), lvl = pct >= 90 ? 'crit' : pct >= 75 ? 'warn' : 'ok';
      return h('div', { class: 'us-lim us-' + lvl },
        h('div', { class: 'us-lim-h' }, h('b', { text: winName(k) }), h('span', { class: 'us-pct', text: pct + '% used' })),
        h('div', { class: 'us-meter', role: 'meter', 'aria-label': winName(k) + ' used', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': pct, 'aria-valuetext': pct + '%' }, h('i', { style: 'width:' + pct + '%' })),
        h('div', { class: 'us-lim-f', text: (lvl !== 'ok' ? (lvl === 'crit' ? '⚠ nearly used up · ' : '▲ getting close · ') : '') + (w.resetsAt ? 'resets ' + when(w.resetsAt) : 'reset time unknown') }));
    });
    if (L.spend) meters.push(h('div', { class: 'us-lim' }, h('div', { class: 'us-lim-h' }, h('b', { text: 'Spend limit' + (L.spend.period ? ' · ' + L.spend.period : '') }), h('span', { class: 'us-pct', text: '$' + L.spend.used + ' of $' + L.spend.limit }))));
    const kids = [h('div', { class: 'us-lims' }, meters)];
    const keys = ['seven_day', 'five_hour'].filter(k => data.history.some(p => typeof p.w[k] === 'number'));
    if (data.history.length) {
      kids.push(h('div', { class: 'us-lg' }, keys.map(k => h('span', null, h('i', { class: 'sw', style: '--c:var(' + (k === 'seven_day' ? '--color-signal' : '--color-human') + ')' }), winName(k)))), limitLine(data.history, data.since, data.now, keys));
      if (data.history[0].t > data.since + DAY) kids.push(h('p', { class: 'us-note', text: 'Readings start ' + when(data.history[0].t) + ', when the dashboard first saw the status line. Nothing was recorded before that.' }));
    }
    return section('Plan limits', 'As of ' + when(L.at) + ' · from the Claude Code status line', ...kids);
  }
  function render() {
    hideTip();
    const now = data.now, sinceDay = dayStart(data.since);
    const totals = {}; let all = [0, 0, 0];
    for (const b of data.hours) for (const k in b.m) { const t = totals[k] || (totals[k] = [0, 0, 0]); for (let i = 0; i < 3; i++) { t[i] += b.m[k][i]; all[i] += b.m[k][i]; } }
    const val = metric === 'cost' ? 2 : 0;
    const keys = Object.keys(totals).sort((a, b) => totals[b][val] - totals[a][val] || (a < b ? -1 : 1));
    stripeKeys(keys);
    const add = (vals, m) => { for (const k in m) { const x = vals[k] || (vals[k] = [0, 0, 0]); for (let i = 0; i < 3; i++) x[i] += m[k][i]; } };
    // daily (local days)
    const dayCols = []; for (let d = sinceDay; d <= now; d = nextDay(d)) dayCols.push({ t: d, vals: {} });
    const dayIx = new Map(dayCols.map((c, i) => [c.t, i]));
    for (const b of data.hours) { const i = dayIx.get(dayStart(b.t)); if (i != null) add(dayCols[i].vals, b.m); }
    // hourly, last 7 days at most
    const hSince = Math.max(data.since, now - 7 * DAY), hStart = Math.floor(hSince / HOUR) * HOUR;
    const hourCols = []; for (let t = hStart; t <= now; t += HOUR) hourCols.push({ t, vals: {} });
    const hIx = new Map(hourCols.map((c, i) => [c.t, i]));
    for (const b of data.hours) { const i = hIx.get(b.t); if (i != null) add(hourCols[i].vals, b.m); }
    const every = Math.ceil(dayCols.length / Math.max(1, Math.floor((body.clientWidth - 60) / 46)));
    const fmt = metric === 'cost' ? fmtUsd : fmtTok;
    const kpi = (l, v) => h('div', { class: 'us-kpi' }, h('b', { text: v }), h('span', { text: l }));
    const table = h('details', { class: 'us-tbl' }, h('summary', { text: 'Table view' }),
      h('table', null, h('thead', null, h('tr', null, h('th', { text: 'Day' }), keys.map(k => h('th', { text: k })), h('th', { text: 'Total' }))),
        h('tbody', null, dayCols.slice().reverse().map(c => h('tr', null, h('td', { text: wd(c.t) + ' ' + dm(c.t) }), keys.map(k => h('td', { text: fmt((c.vals[k] || [])[val] || 0) })), h('td', { text: fmt(keys.reduce((n, k) => n + ((c.vals[k] || [])[val] || 0), 0)) }))))));
    const usageKids = keys.length ? [
      h('div', { class: 'us-kpis' }, kpi('tokens', fmtTok(all[0])), kpi('output tokens', fmtTok(all[1])), kpi('API-price cost', fmtUsd(all[2]))),
      legend(keys),
      h('h4', { text: 'Per day' }),
      bars(dayCols, keys, 190, (c, i) => (dayCols.length - 1 - i) % every ? '' : dayCols.length <= 7 ? wd(c.t) : dm(c.t), c => wd(c.t) + ' ' + dm(c.t)),
      h('h4', { text: 'Per hour · last ' + Math.round((now - hStart) / DAY) + ' days' }),
      bars(hourCols, keys, 150, c => new Date(c.t).getHours() === 0 ? wd(c.t) : '', c => wd(c.t) + ' ' + clock(c.t) + '–' + clock(c.t + HOUR)),
      table,
    ] : [h('p', { class: 'us-empty', text: 'No Claude Code replies in this period.' })];
    body.replaceChildren(stripeDefs(), limitsSection(),
      section('Tokens and cost by model', 'From your local Claude Code transcripts. Cost is what the tokens would cost at API prices, not what a plan charges.', ...usageKids));
  }

  // ───────── button
  const btn = h('button', { id: 'usage-open', class: 'chat-new chat-ref', type: 'button', 'aria-haspopup': 'dialog', title: 'Usage and plan limits', onclick: open }, h('span', { 'aria-hidden': 'true' }), h('span', { class: 'lbl', text: 'Usage' }));
  btn.firstChild.innerHTML = '<svg width="11" height="11" viewBox="0 0 12 12" aria-hidden="true"><path d="M1.5 10.5h9M3 8.5v-3M6 8.5v-6M9 8.5v-4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" fill="none"/></svg>';
  const place = () => { const a = document.querySelector('.chat-acts'); if (a) { a.append(btn); return true; } return false; };
  if (!place()) document.addEventListener('DOMContentLoaded', () => { if (!place()) document.body.append(btn); });
})();
