/* chat.js: chat + "New session" for sessions THIS dashboard started (server.js /api/chat/*).
 * Plain script, loaded after live-data.js. Hooks into index.html through two things only:
 *   window 'factory:detail' event ({kind,id} | null) fired by the detail card, and window.__focus(kind,id).
 * All text goes in via textContent; nothing from a session is ever set as HTML. */
(() => {
  'use strict';
  const DS = window.DashSim; if (!DS) return;
  const TOKEN = (document.querySelector('meta[name="chat-token"]') || {}).content || '';
  const $ = s => document.querySelector(s);
  const PROPS = new Set(['value', 'checked', 'disabled', 'hidden', 'type', 'rows', 'id', 'name', 'title', 'placeholder', 'spellcheck', 'autocomplete']);
  function h(tag, a, ...kids) {
    const e = document.createElement(tag);
    if (a) for (const k in a) {
      const v = a[k]; if (v == null || v === false) continue;
      if (k === 'class') e.className = v; else if (k === 'text') e.textContent = v;
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
      else if (PROPS.has(k)) e[k] = v; else e.setAttribute(k, v === true ? '' : v);
    }
    for (const c of kids.flat()) if (c != null && c !== false) e.append(c.nodeType ? c : document.createTextNode(String(c)));
    return e;
  }
  async function post(path, body) {
    const r = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json', 'x-chat-token': TOKEN }, body: JSON.stringify(body || {}) });
    let j = {}; try { j = await r.json(); } catch { }
    if (!r.ok) { const e = new Error(j.error || 'request failed (' + r.status + ')'); e.status = r.status; throw e; }
    return j;
  }
  const money = c => '$' + (+c || 0).toFixed(4);

  // ───────── owned sessions seen in the snapshot (flags only; text comes from the chat stream)
  let owned = new Map();   // taskId -> {task, project}
  let needy = [];          // owned tasks with a pending request
  let wantFocus = null;    // session id we should open once it shows up on the floor
  let wantFocusAt = 0;
  const taskOfDetail = d => {
    if (!d) return null;
    if (d.kind === 'task') return d.id;
    if (d.kind === 'agent') { const a = DS.agents().find(x => x.id === d.id); return a ? a.taskId : null; }
    return null;
  };

  // ───────── needs-you alert + KPI tile
  const alertBtn = h('button', { id: 'chat-alert', class: 'chat-alert', type: 'button', hidden: true });
  document.body.append(alertBtn);
  alertBtn.addEventListener('click', () => { if (alertBtn.dataset.id) openSession(alertBtn.dataset.id); });
  const kpi = () => $('#kpi-human');
  function updateAlert() {
    const shown = needy.filter(t => !(cur && cur.id === t.id && !panel.hidden));
    if (shown.length) {
      const t = shown[0], more = shown.length > 1 ? ` (+${shown.length - 1} more)` : '';
      alertBtn.replaceChildren(h('b', { text: 'Chat needs you' }), h('span', { text: (t.title || 'session') + more }));
      alertBtn.setAttribute('aria-label', `A dashboard chat session needs you: ${t.title || 'session'}${more}. Open the chat.`);
      alertBtn.hidden = false; alertBtn.dataset.id = t.id;
    } else alertBtn.hidden = true;
    const k = kpi(); if (k) {
      if (needy.length) { k.setAttribute('role', 'button'); k.tabIndex = 0; k.setAttribute('aria-label', 'Needs you: open the chat that is waiting'); }
      else { k.removeAttribute('role'); k.removeAttribute('tabindex'); k.removeAttribute('aria-label'); }
    }
  }
  kpi()?.addEventListener('click', () => { if (needy[0]) openSession(needy[0].id); });
  kpi()?.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && needy[0]) { e.preventDefault(); openSession(needy[0].id); } });

  function openSession(id) { wantFocus = id; wantFocusAt = Date.now(); tryWanted(true); }
  function tryWanted(force) {
    if (!wantFocus) return;
    if (Date.now() - wantFocusAt > 60e3) { wantFocus = null; return; }
    if (!owned.has(wantFocus)) return;
    const id = wantFocus;
    if (typeof window.__focus === 'function' && (!cur || cur.id !== id || force)) window.__focus('task', id);
    focusOnReady = true; wantFocus = null; if (cur && cur.id === id) maybeFocus();
  }

  // ───────── chat panel (a sibling of #detail-body, so detail re-renders never wipe the input)
  const detailEl = $('#detail');
  const headDot = h('i', { class: 'dot' }), headTxt = h('span', { class: 'grow2' }), headCost = h('span');
  const stopBtn = h('button', { class: 'cb-btn bad', type: 'button', text: 'Stop', 'aria-label': 'Stop this session', onclick: () => stop() });
  const head = h('div', { class: 'chat-head', 'data-s': 'idle' }, headDot, headTxt, headCost, stopBtn);
  const logEl = h('div', { class: 'chat-log', role: 'log', 'aria-live': 'polite', 'aria-relevant': 'additions', 'aria-label': 'Chat log', tabindex: '0' });
  const pendEl = h('div', { class: 'chat-pend', 'aria-label': 'Requests waiting for you' });
  const errEl = h('div', { class: 'chat-err', role: 'alert' });
  const input = h('textarea', { rows: 1, 'aria-label': 'Message to the session', placeholder: 'Message, Enter to send, Shift+Enter for a new line', spellcheck: 'false' });
  const sendBtn = h('button', { class: 'cb-btn pri', type: 'button', text: 'Send', onclick: () => send() });
  const form = h('div', { class: 'chat-in' }, input, sendBtn);
  const nowCb = h('input', { type: 'checkbox', id: 'chat-now' });
  const nowWrap = h('label', { class: 'chat-now', hidden: true }, nowCb, 'Send now (interrupts)');
  const NOTE = { owned: 'Dashboard-started session. Messages stay on this machine.', peer: 'Terminal or desktop session. Your messages arrive as from a teammate; approvals stay in the permission cards.' };
  const noteEl = h('div', { class: 'chat-note', text: NOTE.owned });
  const panel = h('section', { id: 'chat', class: 'chat', 'aria-label': 'Session chat', hidden: true }, head, logEl, pendEl, errEl, form, nowWrap, noteEl);
  detailEl?.append(panel);
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(); }
    e.stopPropagation(); // keep page shortcuts (Esc to overview etc.) from eating typing; Esc still blurs below
    if (e.key === 'Escape') { e.preventDefault(); input.blur(); }
  });
  input.addEventListener('input', () => { input.style.height = 'auto'; input.style.height = Math.min(120, input.scrollHeight) + 'px'; });

  let cur = null;           // {id, mode: 'owned'|'peer', es, meta, pendKey, last, ro}
  let focusOnReady = false;
  function closeStream() { if (cur && cur.es) cur.es.close(); cur = null; }
  function showFor(id, mode = 'owned') {
    if (!id) { panel.hidden = true; detailEl?.classList.remove('has-chat'); closeStream(); return; }
    panel.hidden = false; detailEl?.classList.add('has-chat');
    if (cur && cur.id === id && cur.mode === mode) { maybeFocus(); return; }
    closeStream(); logEl.replaceChildren(); pendEl.replaceChildren(); errEl.textContent = '';
    const peer = mode === 'peer';
    stopBtn.hidden = peer; nowWrap.hidden = !peer; nowCb.checked = false; noteEl.textContent = NOTE[mode]; headCost.textContent = '';
    input.disabled = sendBtn.disabled = true; input.placeholder = 'Message, Enter to send, Shift+Enter for a new line';
    const c = cur = { id, mode, es: null, meta: null, pendKey: '', last: 0 };
    const es = c.es = new EventSource(`/api/${peer ? 'peer' : 'chat'}/${encodeURIComponent(id)}/stream?token=${encodeURIComponent(TOKEN)}`);
    es.addEventListener('init', e => { if (cur !== c) return; const d = JSON.parse(e.data); logEl.replaceChildren(); c.last = 0; for (const x of d.log) addLog(x); c.meta = d.meta; c.pendKey = ''; paint(); scrollDown(true); maybeFocus(); });
    es.addEventListener('entry', e => { if (cur !== c) return; addLog(JSON.parse(e.data)); });
    es.addEventListener('meta', e => {
      if (cur !== c) return; const m = JSON.parse(e.data);
      c.meta = m; paint(); maybeFocus();
    });
    es.onerror = () => { if (cur === c && es.readyState === 2) { errEl.textContent = peer ? 'Chat stream closed.' : 'Chat stream closed. This session is no longer tracked by the dashboard.'; } };
  }
  const reopen = () => { if (cur) { const { id, mode } = cur; closeStream(); showFor(id, mode); } };
  function maybeFocus() {
    if (!focusOnReady || panel.hidden || !cur || !cur.meta) return;
    focusOnReady = false;
    const b = pendEl.querySelector('input,button'); (b || input).focus({ preventScroll: false });
  }
  function nearBottom() { return logEl.scrollHeight - logEl.scrollTop - logEl.clientHeight < 40; }
  function scrollDown(force) { if (force || nearBottom()) logEl.scrollTop = logEl.scrollHeight; }
  function addLog(x) {
    if (x.i <= (cur ? cur.last : 0)) return; if (cur) cur.last = x.i;
    const stick = nearBottom(); let el;
    const peer = cur && cur.mode === 'peer';
    if (x.kind === 'user') el = h('div', { class: 'cm user' }, h('small', { text: peer ? 'You (in session)' : 'You' }), x.text);
    else if (x.kind === 'peer') el = h('div', { class: 'cm user peer' + (x.via === 'dashboard' ? '' : ' other') }, h('small', { text: x.via === 'dashboard' ? 'You (dashboard)' : 'Another session' }), x.text);
    else if (x.kind === 'held') el = h('div', { class: 'cm user peer held' }, h('small', { text: 'Held by the session, not delivered' }), x.text,
      h('em', { text: 'This session runs without permission prompts, so Claude Code holds messages from outside. Review it in that session, or set "crossSessionInbound" to "accept" in its settings.' }));
    else if (x.kind === 'assistant') el = h('div', { class: 'cm assistant' }, h('small', { text: 'Claude' }), x.text);
    else if (x.kind === 'tool') el = h('div', { class: 'cl tool' }, h('b', { text: '▸ ' + x.name }), x.text);
    else if (x.kind === 'request') el = h('div', { class: 'cl request' }, h('b', { text: '? ' + x.name }), x.text);
    else if (x.kind === 'answer') el = h('div', { class: 'cl answer' }, h('b', { text: '✓ ' + x.name }), x.text);
    else if (x.kind === 'result') el = h('div', { class: 'cl result' + (x.error ? ' err' : '') }, h('b', { text: x.error ? '✕ error' : '— turn done' }), [x.text, money(x.cost) + ' total', x.ms ? (x.ms / 1000).toFixed(1) + 's' : ''].filter(Boolean).join(' · '));
    else el = h('div', { class: 'cl system' }, h('b', { text: '·' }), x.text);
    logEl.querySelector('.chat-empty')?.remove();
    logEl.append(el); if (stick) logEl.scrollTop = logEl.scrollHeight;
  }
  function paint() {
    const m = cur && cur.meta; if (!m) return;
    if (cur.mode === 'peer') {
      const ro = m.live === false ? 'Session closed: read-only' : m.canSend === false ? 'Sending is not available for this session right now: read-only' : ''; // the server's meta is the only lock
      head.dataset.s = m.live === false ? 'ended' : m.status === 'busy' ? 'busy' : m.status === 'waiting' ? 'ask' : 'idle';
      headTxt.textContent = m.live === false ? 'Closed' : m.status === 'busy' ? 'Working…' : m.status === 'waiting' ? 'Needs you' : 'Idle';
      input.disabled = sendBtn.disabled = nowCb.disabled = !!ro;
      input.placeholder = ro || 'Message, Enter to send, Shift+Enter for a new line';
      return;
    }
    const asking = m.pending.length > 0;
    head.dataset.s = !m.alive ? 'ended' : asking ? 'ask' : m.busy ? 'busy' : 'idle';
    headTxt.textContent = !m.alive ? 'Ended' : asking ? 'Needs you' : m.busy ? 'Working…' : 'Your turn';
    headCost.textContent = m.cost ? money(m.cost) : '';
    stopBtn.disabled = !m.alive; input.disabled = !m.alive; sendBtn.disabled = !m.alive;
    if (!m.alive) input.placeholder = 'Session ended';
    const key = m.pending.map(r => r.request_id).join(',');
    if (key !== cur.pendKey) { cur.pendKey = key; pendEl.replaceChildren(...m.pending.map(renderPending)); }
  }
  async function send() {
    const text = input.value.trim(); if (!text || !cur || sendBtn.disabled) return;
    errEl.textContent = ''; sendBtn.disabled = true;
    const c = cur, peer = c.mode === 'peer';
    try {
      if (peer) await post(`/api/peer/${encodeURIComponent(c.id)}/send`, { text, priority: nowCb.checked ? 'now' : 'next' });
      else await post(`/api/chat/${encodeURIComponent(c.id)}/send`, { text });
      input.value = ''; input.style.height = ''; nowCb.checked = false;
    } catch (e) { errEl.textContent = e.message; } // a 502 locks via the server's meta push; a 404 only shows the error
    finally {
      if (cur === c && peer) paint();
      else if (cur && cur.meta && cur.meta.alive) sendBtn.disabled = false;
      if (!input.disabled) input.focus();
    }
  }
  async function stop() {
    if (!cur) return; errEl.textContent = ''; stopBtn.disabled = true;
    try { await post(`/api/chat/${encodeURIComponent(cur.id)}/stop`); } catch (e) { errEl.textContent = e.message; stopBtn.disabled = false; }
  }
  async function answer(r, body, btns) {
    errEl.textContent = ''; btns.forEach(b => { b.disabled = true; });
    try { await post(`/api/chat/${encodeURIComponent(cur.id)}/answer`, Object.assign({ request_id: r.request_id }, body)); input.focus(); }
    catch (e) { errEl.textContent = e.message; btns.forEach(b => { b.disabled = false; }); }
  }

  function renderPending(r) {
    return r.tool_name === 'AskUserQuestion' && Array.isArray(r.questions) && r.questions.length ? renderAsk(r) : renderPerm(r);
  }
  function renderPerm(r, doAnswer = answer, withMsg = false) {
    const allow = h('button', { class: 'cb-btn allow', type: 'button', text: 'Allow', 'aria-label': `Allow ${r.display_name}` });
    const deny = h('button', { class: 'cb-btn bad', type: 'button', text: 'Deny', 'aria-label': `Deny ${r.display_name}` });
    const btns = [allow, deny];
    const msg = withMsg ? h('input', { type: 'text', 'aria-label': 'Optional message to Claude when denying', placeholder: 'Optional: tell Claude why (used on Deny)', autocomplete: 'off', spellcheck: 'false' }) : null;
    allow.addEventListener('click', () => doAnswer(r, { behavior: 'allow' }, btns));
    deny.addEventListener('click', () => doAnswer(r, msg && msg.value.trim() ? { behavior: 'deny', message: msg.value.trim() } : { behavior: 'deny' }, btns));
    return h('div', { class: 'cq', role: 'group', 'aria-label': `Permission request: ${r.display_name}` },
      h('h4', null, 'Permission', h('span', { class: 'tn', text: r.display_name })),
      r.description ? h('p', { text: r.description }) : null,
      r.summary ? h('div', { class: 'sum', text: r.summary }) : null,
      r.preview ? h('details', null, h('summary', { text: 'Tool input' }), h('pre', { text: r.preview })) : null,
      msg ? h('div', { class: 'cq-msg' }, msg) : null,
      h('div', { class: 'cq-act' }, allow, deny));
  }
  function renderAsk(r, doAnswer = answer) {
    const groups = r.questions.map((q, qi) => {
      const multi = !!q.multiSelect, name = `${r.request_id}-${qi}`, type = multi ? 'checkbox' : 'radio';
      const opts = (q.options || []).map(o => h('label', { class: 'cq-opt' }, h('input', { type, name, value: o.label }), h('span', { class: 'l', text: o.label }), o.description ? h('span', { class: 'd', text: o.description }) : null));
      const otherIn = h('input', { type: 'text', 'aria-label': `Other answer for: ${q.question}`, placeholder: 'Type your own answer', autocomplete: 'off' });
      const otherCb = h('input', { type, name, value: '__other' });
      otherIn.addEventListener('input', () => { if (otherIn.value && !otherCb.checked) otherCb.checked = true; });
      const other = h('label', { class: 'cq-opt' }, otherCb, h('span', { class: 'l', text: 'Other' }), otherIn);
      const bad = h('div', { class: 'cq-bad', role: 'alert' });
      const fs = h('fieldset', null, h('legend', null, q.header ? h('span', { class: 'hd', text: q.header }) : null, q.question, multi ? h('span', { class: 'mu', text: 'pick any' }) : null), opts, other, bad);
      return { q, fs, otherCb, otherIn, bad, multi, name };
    });
    const submit = h('button', { class: 'cb-btn allow', type: 'button', text: 'Send answer' });
    const skip = h('button', { class: 'cb-btn bad', type: 'button', text: 'Skip', 'aria-label': 'Decline to answer' });
    const btns = [submit, skip];
    submit.addEventListener('click', () => {
      const answers = {}; let firstBad = null;
      for (const g of groups) {
        const vals = [...g.fs.querySelectorAll('input[type=radio],input[type=checkbox]')].filter(i => i.checked).map(i => i.value === '__other' ? g.otherIn.value.trim() : i.value).filter(Boolean);
        g.bad.textContent = '';
        if (!vals.length) { g.bad.textContent = 'Pick an option or type an answer.'; firstBad = firstBad || g.fs.querySelector('input'); continue; }
        answers[g.q.question] = g.multi ? vals.join(', ') : vals[0];
      }
      if (firstBad) { firstBad.focus(); return; }
      doAnswer(r, { behavior: 'allow', answers }, btns);
    });
    skip.addEventListener('click', () => doAnswer(r, { behavior: 'deny', message: 'The user declined to answer.' }, btns));
    return h('div', { class: 'cq', role: 'group', 'aria-label': 'Question from Claude' },
      h('h4', null, 'Question'), groups.map(g => g.fs), h('div', { class: 'cq-act' }, submit, skip));
  }

  // ───────── terminal/desktop sessions with a prompt the dashboard can answer through the global hook (server.js /api/ext/*)
  // The terminal shows the same prompt: first answer wins. Only tool name + a short summary come from the server.
  let extTasks = new Map(); // taskId -> task with t.ext.pending > 0 (never owned sessions)
  let peerTasks = new Set(); // taskIds of live terminal/desktop sessions the dashboard can message (server.js /api/peer/*)
  const extErr = h('div', { class: 'chat-err', role: 'alert' });
  const extPend = h('div', { class: 'chat-pend', 'aria-label': 'Prompts waiting for you' });
  const extPanel = h('section', { id: 'ext-prompt', class: 'chat ext', 'aria-label': 'Prompt waiting for you', hidden: true },
    h('div', { class: 'chat-head', 'data-s': 'ask' }, h('i', { class: 'dot' }), h('span', { class: 'grow2', text: 'Needs you' })),
    extPend, extErr,
    h('div', { class: 'chat-note', text: 'Terminal or desktop session. You can also answer there: the first answer wins, this card clears when the session moves on.' }));
  detailEl?.append(extPanel);
  let ecur = null; // {id, es, key}
  function closeExt() { if (ecur && ecur.es) ecur.es.close(); ecur = null; }
  function showExt(id) {
    if (!id) { extPanel.hidden = true; if (!cur) detailEl?.classList.remove('has-chat'); closeExt(); return; }
    extPanel.hidden = false; detailEl?.classList.add('has-chat');
    if (ecur && ecur.id === id) return;
    closeExt(); extPend.replaceChildren(); extErr.textContent = '';
    const c = ecur = { id, es: null, key: '' };
    const es = c.es = new EventSource(`/api/ext/${encodeURIComponent(id)}/stream?token=${encodeURIComponent(TOKEN)}`);
    es.addEventListener('meta', e => {
      if (ecur !== c) return; const d = JSON.parse(e.data), key = d.pending.map(r => r.id).join(',');
      if (key === c.key) return; c.key = key;
      extPend.replaceChildren(...d.pending.map(p => { const r = { request_id: p.id, tool_name: p.tool_name, display_name: p.tool_name, description: '', summary: p.summary, preview: '', questions: p.questions };
        return p.kind === 'ask' ? renderAsk(r, answerExt) : renderPerm(r, answerExt, true); }));
      if (!d.pending.length) extPanel.hidden = true; else { extPanel.hidden = false; detailEl?.classList.add('has-chat'); }
    });
    es.onerror = () => { if (ecur === c && es.readyState === 2) extErr.textContent = 'Prompt stream closed.'; };
  }
  async function answerExt(r, body, btns) {
    extErr.textContent = ''; btns.forEach(b => { b.disabled = true; });
    try { await post(`/api/ext/${encodeURIComponent(ecur.id)}/answer`, Object.assign({ id: r.request_id }, body)); }
    catch (e) { extErr.textContent = e.message; btns.forEach(b => { b.disabled = false; }); }
  }

  // ───────── detail card hook
  let lastDetail = null;
  window.addEventListener('factory:detail', e => { lastDetail = e.detail || null; refreshDetail(); });
  function refreshDetail() {
    const id = taskOfDetail(lastDetail), isOwned = !!(id && owned.has(id));
    const isPeer = !isOwned && !!id && (peerTasks.has(id) || (cur && cur.mode === 'peer' && cur.id === id));
    showFor(isOwned || isPeer ? id : null, isPeer ? 'peer' : 'owned');
    showExt(!isOwned && id && extTasks.has(id) ? id : null); updateAlert();
  }

  // ───────── New session dialog
  const LS = { get: k => { try { return localStorage.getItem(k) || ''; } catch { return ''; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch { } } };
  const projSel = h('select', { id: 'cn-proj', 'aria-label': 'Project' });
  const otherIn = h('input', { id: 'cn-other', type: 'text', placeholder: 'C:\\path\\to\\folder', 'aria-label': 'Folder path', autocomplete: 'off', spellcheck: 'false' });
  const otherWrap = h('label', { hidden: true }, 'Folder path (absolute, must exist)', otherIn);
  const modelSel = h('select', { id: 'cn-model', 'aria-label': 'Model' }, [['', 'Default'], ['haiku', 'Haiku'], ['sonnet', 'Sonnet'], ['opus', 'Opus']].map(([v, l]) => h('option', { value: v, text: l })));
  const effortSel = h('select', { id: 'cn-effort', 'aria-label': 'Effort' }, [['', 'Default'], ['low', 'Low'], ['medium', 'Medium'], ['high', 'High'], ['xhigh', 'X-high'], ['max', 'Max']].map(([v, l]) => h('option', { value: v, text: l })));
  const promptIn = h('textarea', { id: 'cn-prompt', rows: 4, 'aria-label': 'First message', placeholder: 'What should Claude do?', spellcheck: 'false' });
  const cnErr = h('div', { class: 'cn-err', role: 'alert' });
  const goBtn = h('button', { class: 'cb-btn pri', type: 'submit', text: 'Start session' });
  const cancelBtn = h('button', { class: 'cb-btn', type: 'button', text: 'Cancel' });
  const lab = (t, el) => h('label', { text: undefined }, t, el);
  const formEl = h('form', { class: 'cn-f', method: 'dialog', novalidate: true },
    lab('Project', projSel), otherWrap,
    h('div', { class: 'cn-row' }, lab('Model', modelSel), lab('Effort', effortSel)),
    lab('First message', promptIn),
    h('div', { class: 'cn-hint', text: 'Claude runs in that folder with the dashboard answering permission prompts. Ctrl+Enter starts it.' }),
    cnErr, h('div', { class: 'cn-act' }, cancelBtn, goBtn));
  const dlg = h('dialog', { class: 'cn', 'aria-labelledby': 'cn-title' }, h('div', { class: 'cn-box' }, h('h2', { id: 'cn-title', text: 'New session' }), h('p', { text: 'Starts a Claude Code session you can chat with from here.' }), formEl));
  document.body.append(dlg);
  cancelBtn.addEventListener('click', () => dlg.close());
  dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });
  projSel.addEventListener('change', syncOther);
  function syncOther() { otherWrap.hidden = projSel.value !== '__other'; }
  promptIn.addEventListener('keydown', e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); formEl.requestSubmit(); } });
  function fillProjects() {
    const seen = new Set(), opts = [];
    for (const p of DS.state.projects) if (p.cwd && !seen.has(p.cwd)) { seen.add(p.cwd); opts.push(h('option', { value: p.cwd, text: `${p.name}  ·  ${p.cwd}` })); }
    opts.push(h('option', { value: '__other', text: 'Other path…' }));
    projSel.replaceChildren(...opts);
    const want = (lastDetail && (() => { const t = taskOfDetail(lastDetail); for (const p of DS.state.projects) if (p.tasks.some(x => x.id === t)) return p.cwd; if (lastDetail.kind === 'project') return (DS.state.projects.find(p => p.id === lastDetail.id) || {}).cwd; })()) || LS.get('chat.cwd');
    projSel.value = want && seen.has(want) ? want : opts.length > 1 ? opts[0].value : '__other';
    syncOther();
  }
  function openDialog() {
    fillProjects(); modelSel.value = LS.get('chat.model'); effortSel.value = LS.get('chat.effort');
    cnErr.textContent = ''; goBtn.disabled = false; goBtn.textContent = 'Start session';
    dlg.showModal(); promptIn.focus();
  }
  formEl.addEventListener('submit', async e => {
    e.preventDefault();
    const cwd = projSel.value === '__other' ? otherIn.value.trim() : projSel.value, prompt = promptIn.value.trim();
    if (!cwd) { cnErr.textContent = 'Choose a project or type a folder path.'; (projSel.value === '__other' ? otherIn : projSel).focus(); return; }
    if (!prompt) { cnErr.textContent = 'Write a first message.'; promptIn.focus(); return; }
    cnErr.textContent = ''; goBtn.disabled = true; goBtn.textContent = 'Starting…';
    try {
      const r = await post('/api/chat/start', { cwd, model: modelSel.value, effort: effortSel.value, prompt });
      LS.set('chat.cwd', projSel.value === '__other' ? '' : cwd); LS.set('chat.model', modelSel.value); LS.set('chat.effort', effortSel.value);
      promptIn.value = ''; dlg.close(); openSession(r.id);
    } catch (err) { cnErr.textContent = err.message; goBtn.disabled = false; goBtn.textContent = 'Start session'; }
  });
  const newBtn = h('button', { id: 'chat-new', class: 'chat-new', type: 'button', 'aria-haspopup': 'dialog', onclick: openDialog }, h('span', { 'aria-hidden': 'true' }), 'New session');
  newBtn.firstChild.innerHTML = '<svg width="11" height="11" viewBox="0 0 12 12" aria-hidden="true"><path d="M6 1v10M1 6h10" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" fill="none"/></svg>';
  // Refresh: hard refresh of the data and connections, not the page (server rescans now; every open stream reopens)
  const refBtn = h('button', { id: 'chat-refresh', class: 'chat-new chat-ref', type: 'button', title: 'Rescan sessions and reconnect (keeps the page)', 'aria-label': 'Refresh data and connections' }, h('span', { 'aria-hidden': 'true' }), h('span', { class: 'lbl', text: 'Refresh' }));
  refBtn.firstChild.innerHTML = '<svg width="11" height="11" viewBox="0 0 12 12" aria-hidden="true"><path d="M10.2 4.2A4.5 4.5 0 1 0 10.5 7.5M10.5 1.5v3h-3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>';
  refBtn.addEventListener('click', async () => {
    if (refBtn.disabled) return;
    const lbl = refBtn.querySelector('.lbl'); refBtn.disabled = true; lbl.textContent = 'Refreshing…'; refBtn.removeAttribute('data-err');
    try {
      await post('/api/refresh');
      DS.reconnect();
      reopen();
      if (ecur) { const id = ecur.id; closeExt(); showExt(id); }
      lbl.textContent = 'Refreshed';
    } catch (e) { lbl.textContent = 'Refresh failed'; refBtn.dataset.err = ''; refBtn.title = e.message; }
    setTimeout(() => { lbl.textContent = 'Refresh'; refBtn.disabled = false; }, 1200);
  });
  const acts = h('div', { class: 'chat-acts' }, newBtn, refBtn);
  (() => { const w = $('#win'); if (w) w.insertAdjacentElement('afterend', acts); else document.body.append(acts); })();
  DS.subscribe(state => {
    const m = new Map(); const n = [];
    for (const p of state.projects) for (const t of p.tasks) if (t.owned) { m.set(t.id, { task: t, project: p }); if (t.chat && t.chat.pending > 0) n.push(t); }
    const x = new Map(); for (const p of state.projects) for (const t of p.tasks) if (!t.owned && t.ext && t.ext.pending > 0) x.set(t.id, t);
    extTasks = x;
    const pt = new Set(); for (const p of state.projects) for (const t of p.tasks) if (!t.owned && t.peer && t.peer.live) pt.add(t.id);
    peerTasks = pt;
    owned = m; needy = n; updateAlert(); tryWanted(); refreshDetail();
  });
})();
