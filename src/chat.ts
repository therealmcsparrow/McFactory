/* chat.js: chat + "New session" for sessions THIS dashboard started (server.js /api/chat/*).
 * Plain script, loaded after live-data.js. Hooks into index.html through two things only:
 *   window 'factory:detail' event ({kind,id} | null) fired by the detail card, and window.__focus(kind,id).
 * All text goes in via textContent; nothing from a session is ever set as HTML. */
(() => {
  'use strict';
  type Task = import('./common/types.js').Task;
  type Project = import('./common/types.js').Project;
  /** The detail card's selection ('factory:detail' event detail). */
  type Detail = import('./common/types.js').Pick | null;
  type Kid = Node | string | number | boolean | null | undefined | readonly Kid[];
  /** One AskUserQuestion question (Claude Code tool input). */
  interface ChatQuestion { question: string; header?: string; multiSelect?: boolean; options?: { label: string; description?: string }[] }
  /** A permission or question request waiting for an answer (server.js metaOf pending; ext prompts are mapped to this shape). */
  interface ChatRequest { request_id: string; tool_name: string; display_name: string; description: string; summary: string; preview: string; questions: ChatQuestion[] | null }
  /** A prompt of a terminal/desktop session (server.js extMeta). */
  interface ExtRequest { id: string; kind: 'ask' | (string & {}); tool_name: string; summary: string; questions: ChatQuestion[] | null }
  /** Stream meta. owned: server.js metaOf; peer: {live, canSend, status}; agent: {role, label, status, sessionId}. */
  interface ChatMeta {
    alive?: boolean; busy?: boolean; cost?: number; skipPermissions?: boolean; commands?: string[] | null; pending?: ChatRequest[];
    live?: boolean; canSend?: boolean; status?: string; role?: string; label?: string; sessionId?: string;
  }
  /** One chat log line from the stream. */
  interface LogEntry { i: number; kind: string; text: string; via?: string; name?: string; error?: boolean; cost?: number; ms?: number }
  type ChatMode = 'owned' | 'peer' | 'agent';
  interface ChatCur { id: string; mode: ChatMode; es: EventSource | null; meta: ChatMeta | null; pendKey: string; last: number }
  interface ExtCur { id: string; es: EventSource | null; key: string }
  interface AnswerBody { behavior: 'allow' | 'deny'; message?: string; answers?: Record<string, string> }
  type AnswerFn = (r: ChatRequest, body: AnswerBody, btns: HTMLButtonElement[]) => void | Promise<void>;
  interface HttpError extends Error { status?: number }
  /** A JSON reply of the chat API (fields depend on the route). */
  interface ApiReply { id?: string; error?: string }
  const DS = window.DashSim; if (!DS) return;
  const TOKEN = (document.querySelector<HTMLMetaElement>('meta[name="chat-token"]') || {} as Partial<HTMLMetaElement>).content || '';
  const $ = (s: string) => document.querySelector<HTMLElement>(s);
  const PROPS = new Set(['value', 'checked', 'disabled', 'hidden', 'type', 'rows', 'id', 'name', 'title', 'placeholder', 'spellcheck', 'autocomplete']);
  function h<K extends keyof HTMLElementTagNameMap>(tag: K, a?: Record<string, unknown> | null, ...kids: Kid[]) {
    const e = document.createElement(tag);
    if (a) for (const k in a) {
      const v = a[k]; if (v == null || v === false) continue;
      if (k === 'class') e.className = v as string; else if (k === 'text') e.textContent = v as string;
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), v as EventListener);
      else if (PROPS.has(k)) (e as unknown as Record<string, unknown>)[k] = v; else e.setAttribute(k, v === true ? '' : v as string);
    }
    for (const c of kids.flat()) if (c != null && c !== false) e.append((c as Node).nodeType ? c as Node : document.createTextNode(String(c)));
    return e;
  }
  async function post(path: string, body?: object) {
    const r = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json', 'x-chat-token': TOKEN }, body: JSON.stringify(body || {}) });
    let j: ApiReply = {}; try { j = await r.json(); } catch { }
    if (!r.ok) { const e: HttpError = new Error(j.error || 'request failed (' + r.status + ')'); e.status = r.status; throw e; }
    return j;
  }
  const money = (c?: number) => '$' + (+c! || 0).toFixed(4);

  // ───────── owned sessions seen in the snapshot (flags only; text comes from the chat stream)
  let owned = new Map<string, { task: Task; project: Project }>();   // taskId -> {task, project}
  let needy: Task[] = [];          // owned tasks with a pending request
  let wantFocus: string | null = null;    // session id we should open once it shows up on the floor
  let wantFocusAt = 0;
  const taskOfDetail = (d: Detail) => {
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

  function openSession(id: string) { wantFocus = id; wantFocusAt = Date.now(); tryWanted(true); }
  function tryWanted(force?: boolean) {
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
  const headSkip = h('span', { class: 'chat-skip', title: 'Started with --dangerously-skip-permissions: Claude runs every tool without asking', hidden: true }, '⚠ no prompts');
  const stopBtn = h('button', { class: 'cb-btn bad', type: 'button', text: 'Stop', 'aria-label': 'Stop this session', onclick: () => stop() });
  const head = h('div', { class: 'chat-head', 'data-s': 'idle' }, headDot, headTxt, headSkip, headCost, stopBtn);
  const logEl = h('div', { class: 'chat-log', role: 'log', 'aria-live': 'polite', 'aria-relevant': 'additions', 'aria-label': 'Chat log', tabindex: '0' });
  const pendEl = h('div', { class: 'chat-pend', 'aria-label': 'Requests waiting for you' });
  const errEl = h('div', { class: 'chat-err', role: 'alert' });
  const input = h('textarea', { rows: 1, 'aria-label': 'Message to the session', placeholder: 'Message, Enter to send, Shift+Enter for a new line', spellcheck: 'false' });
  const sendBtn = h('button', { class: 'cb-btn pri', type: 'button', text: 'Send', onclick: () => send() });
  // slash command list: shown while the message is a lone "/word"; a combobox over the textarea
  const cmdList = h('ul', { id: 'chat-cmds', class: 'chat-cmds', role: 'listbox', 'aria-label': 'Slash commands', hidden: true });
  const cmdNote = h('div', { class: 'chat-cmds-note', hidden: true });
  input.setAttribute('role', 'combobox'); input.setAttribute('aria-autocomplete', 'list'); input.setAttribute('aria-controls', 'chat-cmds'); input.setAttribute('aria-expanded', 'false');
  let cmdSel = -1;
  function cmdItems() { return [...cmdList.children]; }
  function cmdMark(i: number) {
    const it = cmdItems(); if (!it.length) return;
    cmdSel = (i + it.length) % it.length;
    it.forEach((li, k) => li.setAttribute('aria-selected', String(k === cmdSel)));
    input.setAttribute('aria-activedescendant', it[cmdSel].id); it[cmdSel].scrollIntoView({ block: 'nearest' });
  }
  function cmdClose() { cmdList.hidden = true; cmdNote.hidden = true; cmdSel = -1; input.setAttribute('aria-expanded', 'false'); input.removeAttribute('aria-activedescendant'); }
  function cmdPick(name: string) { input.value = '/' + name + ' '; cmdClose(); input.focus(); input.dispatchEvent(new Event('input')); }
  function cmdUpdate() {
    const mt = /^\/([^\s]*)$/.exec(input.value);
    if (!mt || !cur || input.disabled) return cmdClose();
    const note = (t: string) => { cmdList.hidden = true; input.setAttribute('aria-expanded', 'false'); cmdNote.textContent = t; cmdNote.hidden = false; };
    if (cur.mode === 'peer') return note('Slash commands run only inside that session. From here this is sent as a plain message.');
    const all = cur.meta && cur.meta.commands;
    if (!all) return note('Commands load once the session has started.');
    const q = mt[1].toLowerCase();
    const hits = all.filter(n => n.toLowerCase().startsWith(q)).concat(q ? all.filter(n => !n.toLowerCase().startsWith(q) && n.toLowerCase().includes(q)) : []).slice(0, 300);
    if (!hits.length) return note('No command matches /' + mt[1] + '.');
    cmdNote.hidden = true;
    cmdList.replaceChildren(...hits.map((n, k) => h('li', { id: 'chat-cmd-' + k, role: 'option', 'aria-selected': 'false', text: '/' + n, onmousedown: (ev: MouseEvent) => { ev.preventDefault(); cmdPick(n); } })));
    cmdList.hidden = false; input.setAttribute('aria-expanded', 'true'); cmdMark(0);
  }
  input.addEventListener('input', cmdUpdate);
  input.addEventListener('blur', () => setTimeout(() => { if (document.activeElement !== input) cmdClose(); }, 0));
  const form = h('div', { class: 'chat-in' }, cmdList, cmdNote, input, sendBtn);
  const nowCb = h('input', { type: 'checkbox', id: 'chat-now' });
  const nowWrap = h('label', { class: 'chat-now', hidden: true }, nowCb, 'Send now (interrupts)');
  const NOTE: Record<ChatMode, string> = { owned: 'Dashboard-started session. Messages stay on this machine.', peer: 'Terminal or desktop session. Your messages arrive as from a teammate; approvals stay in the permission cards.',
    agent: 'Subagent screen, read-only: its own text and tool names. To message the session, open its main agent.' };
  const RESUME_NOTE = 'Closed in the terminal. Continue here reopens it in the dashboard (claude --resume): messages, approvals and questions then go straight through. Keep it closed in the terminal while it runs here.';
  const resumedAt = new Map<string, number>(); // session id -> when Continue here started it: owned before the next snapshot says so
  const isOffice = () => document.body.classList.contains('v-office'); // office view: a subagent's desk shows its own screen (server.js /api/agent/*); asked late, index.html sets the class after this script loads
  const noteEl = h('div', { class: 'chat-note', text: NOTE.owned });
  const panel = h('section', { id: 'chat', class: 'chat', 'aria-label': 'Session chat', hidden: true }, head, logEl, pendEl, errEl, form, nowWrap, noteEl);
  detailEl?.append(panel);
  input.addEventListener('keydown', e => {
    if (!cmdList.hidden && !e.isComposing) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); e.stopPropagation(); cmdMark(cmdSel + (e.key === 'ArrowDown' ? 1 : -1)); return; }
      if ((e.key === 'Enter' && !e.shiftKey) || e.key === 'Tab') { const li = cmdItems()[cmdSel]; if (li) { e.preventDefault(); e.stopPropagation(); cmdPick(li.textContent!.slice(1)); return; } }
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cmdClose(); return; }
    }
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); cmdClose(); send(); }
    e.stopPropagation(); // keep page shortcuts (Esc to overview etc.) from eating typing; Esc still blurs below
    if (e.key === 'Escape') { e.preventDefault(); input.blur(); }
  });
  input.addEventListener('input', () => { input.style.height = 'auto'; input.style.height = Math.min(120, input.scrollHeight) + 'px'; });

  let cur: ChatCur | null = null;           // {id, mode: 'owned'|'peer'|'agent', es, meta, pendKey, last, ro}; agent: id is the subagent id, read-only
  let focusOnReady = false;
  function closeStream() { if (cur && cur.es) cur.es.close(); cur = null; }
  function showFor(id: string | null, mode: ChatMode = 'owned') {
    if (!id) { panel.hidden = true; detailEl?.classList.remove('has-chat'); closeStream(); return; }
    panel.hidden = false; detailEl?.classList.add('has-chat');
    if (cur && cur.id === id && cur.mode === mode) { maybeFocus(); return; }
    closeStream(); logEl.replaceChildren(); pendEl.replaceChildren(); errEl.textContent = ''; cmdClose();
    const peer = mode === 'peer', agent = mode === 'agent'; // agent: read-only, nothing to send, stop or answer
    stopBtn.hidden = peer || agent; nowWrap.hidden = !peer; form.hidden = agent; nowCb.checked = false; noteEl.textContent = NOTE[mode]; headCost.textContent = ''; headSkip.hidden = true;
    panel.setAttribute('aria-label', agent ? 'Subagent screen (read-only)' : 'Session chat'); logEl.setAttribute('aria-label', agent ? 'Subagent screen log' : 'Chat log');
    input.disabled = sendBtn.disabled = true; sendBtn.textContent = 'Send'; input.placeholder = 'Message, Enter to send, Shift+Enter for a new line';
    const c: ChatCur = cur = { id, mode, es: null, meta: null, pendKey: '', last: 0 };
    const es = c.es = new EventSource(`/api/${agent ? 'agent' : peer ? 'peer' : 'chat'}/${encodeURIComponent(id)}/stream?token=${encodeURIComponent(TOKEN)}`);
    es.addEventListener('init', e => { if (cur !== c) return; const d: { meta: ChatMeta; log: LogEntry[] } = JSON.parse(e.data); logEl.replaceChildren(); c.last = 0; c.meta = d.meta; for (const x of d.log) addLog(x);
      if (agent && !d.log.length) logEl.append(h('div', { class: 'chat-empty', text: 'Nothing on this screen yet.' }));
      c.pendKey = ''; paint(); scrollDown(true); maybeFocus(); });
    es.addEventListener('entry', e => { if (cur !== c) return; addLog(JSON.parse(e.data)); });
    es.addEventListener('meta', e => {
      if (cur !== c) return; const m: ChatMeta = JSON.parse(e.data);
      c.meta = m; paint(); maybeFocus(); if (document.activeElement === input) cmdUpdate();
    });
    es.onerror = () => { if (cur === c && es.readyState === 2) { errEl.textContent = agent ? 'Screen stream closed.' : peer ? 'Chat stream closed.' : 'Chat stream closed. This session is no longer tracked by the dashboard.'; } };
  }
  const reopen = () => { if (cur) { const { id, mode } = cur; closeStream(); showFor(id, mode); } };
  function maybeFocus() {
    if (!focusOnReady || panel.hidden || !cur || !cur.meta) return;
    focusOnReady = false; if (cur.mode === 'agent') return;
    const b = pendEl.querySelector<HTMLElement>('input,button'); (b || input).focus({ preventScroll: false });
  }
  function nearBottom() { return logEl.scrollHeight - logEl.scrollTop - logEl.clientHeight < 40; }
  function scrollDown(force?: boolean) { if (force || nearBottom()) logEl.scrollTop = logEl.scrollHeight; }
  function addLog(x: LogEntry) {
    if (x.i <= (cur ? cur.last : 0)) return; if (cur) cur.last = x.i;
    const stick = nearBottom(); let el: HTMLElement;
    const peer = cur && cur.mode === 'peer';
    if (x.kind === 'user') el = h('div', { class: 'cm user' }, h('small', { text: peer ? 'You (in session)' : 'You' }), x.text);
    else if (x.kind === 'peer') el = h('div', { class: 'cm user peer' + (x.via === 'dashboard' ? '' : ' other') }, h('small', { text: x.via === 'dashboard' ? 'You (dashboard)' : 'Another session' }), x.text);
    else if (x.kind === 'held') el = h('div', { class: 'cm user peer held' }, h('small', { text: 'Held by the session, not delivered' }), x.text,
      h('em', { text: 'This session runs without permission prompts, so Claude Code holds messages from outside. Review it in that session, or set "crossSessionInbound" to "accept" in its settings.' }));
    else if (x.kind === 'assistant') el = h('div', { class: 'cm assistant' }, h('small', { text: cur && cur.mode === 'agent' ? (cur.meta && cur.meta.label) || 'Subagent' : 'Claude' }), x.text);
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
    headSkip.hidden = !(cur!.mode === 'owned' && m.skipPermissions);
    if (cur!.mode === 'agent') { // meta: {role, label, status, sessionId}
      head.dataset.s = m.status === 'running' ? 'busy' : m.status === 'waiting' ? 'idle' : 'ended';
      headTxt.textContent = (m.label || 'Subagent') + ' · ' + ({ running: 'Working…', waiting: 'Waiting', done: 'Finished', failed: 'Failed' }[m.status as 'running' | 'waiting' | 'done' | 'failed'] || m.status || '');
      return;
    }
    if (cur!.mode === 'peer') {
      const closed = m.live === false; // closed in the terminal: the next message continues it here (claude --resume)
      const ro = !closed && m.canSend === false ? 'Sending is not available for this session right now: read-only' : ''; // the server's meta is the only lock
      head.dataset.s = closed ? 'ended' : m.status === 'busy' ? 'busy' : m.status === 'waiting' ? 'ask' : 'idle';
      headTxt.textContent = closed ? 'Closed in the terminal' : m.status === 'busy' ? 'Working…' : m.status === 'waiting' ? 'Needs you' : 'Idle';
      input.disabled = sendBtn.disabled = !!ro; nowCb.disabled = !!ro || closed; nowWrap.hidden = closed;
      sendBtn.textContent = closed ? 'Continue here' : 'Send';
      noteEl.textContent = closed ? RESUME_NOTE : NOTE.peer;
      input.placeholder = ro || (closed ? 'Message to continue this session here' : 'Message, Enter to send, Shift+Enter for a new line');
      return;
    }
    const asking = m.pending!.length > 0;
    head.dataset.s = !m.alive ? 'ended' : asking ? 'ask' : m.busy ? 'busy' : 'idle';
    headTxt.textContent = !m.alive ? 'Ended' : asking ? 'Needs you' : m.busy ? 'Working…' : 'Your turn';
    headCost.textContent = m.cost ? money(m.cost) : '';
    stopBtn.disabled = !m.alive; input.disabled = sendBtn.disabled = false; // ended: the next message continues it (claude --resume)
    sendBtn.textContent = m.alive ? 'Send' : 'Continue here';
    input.placeholder = m.alive ? 'Message, Enter to send, Shift+Enter for a new line' : 'Session ended. A message continues it here';
    const key = m.pending!.map(r => r.request_id).join(',');
    if (key !== cur!.pendKey) { cur!.pendKey = key; pendEl.replaceChildren(...m.pending!.map(renderPending)); }
  }
  async function send() {
    const text = input.value.trim(); if (!text || !cur || sendBtn.disabled) return;
    errEl.textContent = ''; sendBtn.disabled = true;
    const c = cur, peer = c.mode === 'peer';
    const resume = !!c.meta && (peer ? c.meta.live === false : c.meta.alive === false); // closed or ended: reopen it as a dashboard session
    if (resume) sendBtn.textContent = 'Continuing…';
    try {
      if (resume) {
        const r = await post('/api/chat/start', { resume: c.id, prompt: text });
        input.value = ''; input.style.height = '';
        if (r.id) { resumedAt.set(r.id, Date.now()); closeStream(); showFor(r.id, 'owned'); openSession(r.id); } // the snapshot marks it owned within a second
        return;
      }
      if (peer) await post(`/api/peer/${encodeURIComponent(c.id)}/send`, { text, priority: nowCb.checked ? 'now' : 'next' });
      else await post(`/api/chat/${encodeURIComponent(c.id)}/send`, { text });
      input.value = ''; input.style.height = ''; nowCb.checked = false;
    } catch (e) { errEl.textContent = (e as Error).message; } // a 502 locks via the server's meta push; a 404 only shows the error
    finally {
      if (cur === c && (peer || resume)) { if (c.meta) paint(); if (resume) sendBtn.disabled = false; }
      else if (cur && cur.meta && cur.meta.alive) sendBtn.disabled = false;
      if (!input.disabled) input.focus();
    }
  }
  async function stop() {
    if (!cur) return; errEl.textContent = ''; stopBtn.disabled = true;
    try { await post(`/api/chat/${encodeURIComponent(cur.id)}/stop`); } catch (e) { errEl.textContent = (e as Error).message; stopBtn.disabled = false; }
  }
  async function answer(r: ChatRequest, body: AnswerBody, btns: HTMLButtonElement[]) {
    errEl.textContent = ''; btns.forEach(b => { b.disabled = true; });
    try { await post(`/api/chat/${encodeURIComponent(cur!.id)}/answer`, Object.assign({ request_id: r.request_id }, body)); input.focus(); }
    catch (e) { errEl.textContent = (e as Error).message; btns.forEach(b => { b.disabled = false; }); }
  }

  function renderPending(r: ChatRequest) {
    return r.tool_name === 'AskUserQuestion' && Array.isArray(r.questions) && r.questions.length ? renderAsk(r) : renderPerm(r);
  }
  function renderPerm(r: ChatRequest, doAnswer: AnswerFn = answer, withMsg = false) {
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
  function renderAsk(r: ChatRequest, doAnswer: AnswerFn = answer) {
    const groups = r.questions!.map((q, qi) => {
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
      const answers: Record<string, string> = {}; let firstBad: HTMLInputElement | null = null;
      for (const g of groups) {
        const vals = [...g.fs.querySelectorAll<HTMLInputElement>('input[type=radio],input[type=checkbox]')].filter(i => i.checked).map(i => i.value === '__other' ? g.otherIn.value.trim() : i.value).filter(Boolean);
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
  let extTasks = new Map<string, Task>(); // taskId -> task with t.ext.pending > 0 (never owned sessions)
  let peerTasks = new Set<string>(); // taskIds of live terminal/desktop sessions the dashboard can message (server.js /api/peer/*)
  let sessTasks = new Set<string>(); // taskIds of every session the dashboard did not start (open or closed): the panel shows them, closed ones offer Continue here
  const extErr = h('div', { class: 'chat-err', role: 'alert' });
  const extPend = h('div', { class: 'chat-pend', 'aria-label': 'Prompts waiting for you' });
  const extPanel = h('section', { id: 'ext-prompt', class: 'chat ext', 'aria-label': 'Prompt waiting for you', hidden: true },
    h('div', { class: 'chat-head', 'data-s': 'ask' }, h('i', { class: 'dot' }), h('span', { class: 'grow2', text: 'Needs you' })),
    extPend, extErr,
    h('div', { class: 'chat-note', text: 'Terminal or desktop session. You can also answer there: the first answer wins, this card clears when the session moves on.' }));
  detailEl?.append(extPanel);
  let ecur: ExtCur | null = null; // {id, es, key}
  function closeExt() { if (ecur && ecur.es) ecur.es.close(); ecur = null; }
  function showExt(id: string | null) {
    if (!id) { extPanel.hidden = true; if (!cur) detailEl?.classList.remove('has-chat'); closeExt(); return; }
    extPanel.hidden = false; detailEl?.classList.add('has-chat');
    if (ecur && ecur.id === id) return;
    closeExt(); extPend.replaceChildren(); extErr.textContent = '';
    const c: ExtCur = ecur = { id, es: null, key: '' };
    const es = c.es = new EventSource(`/api/ext/${encodeURIComponent(id)}/stream?token=${encodeURIComponent(TOKEN)}`);
    es.addEventListener('meta', e => {
      if (ecur !== c) return; const d: { pending: ExtRequest[] } = JSON.parse(e.data), key = d.pending.map(r => r.id).join(',');
      if (key === c.key) return; c.key = key;
      extPend.replaceChildren(...d.pending.map(p => { const r = { request_id: p.id, tool_name: p.tool_name, display_name: p.tool_name, description: '', summary: p.summary, preview: '', questions: p.questions };
        return p.kind === 'ask' ? renderAsk(r, answerExt) : renderPerm(r, answerExt, true); }));
      if (!d.pending.length) extPanel.hidden = true; else { extPanel.hidden = false; detailEl?.classList.add('has-chat'); }
    });
    es.onerror = () => { if (ecur === c && es.readyState === 2) extErr.textContent = 'Prompt stream closed.'; };
  }
  async function answerExt(r: ChatRequest, body: AnswerBody, btns: HTMLButtonElement[]) {
    extErr.textContent = ''; btns.forEach(b => { b.disabled = true; });
    try { await post(`/api/ext/${encodeURIComponent(ecur!.id)}/answer`, Object.assign({ id: r.request_id }, body)); }
    catch (e) { extErr.textContent = (e as Error).message; btns.forEach(b => { b.disabled = false; }); }
  }

  // ───────── detail card hook
  let lastDetail: Detail = null;
  window.addEventListener('factory:detail', e => { lastDetail = (e as CustomEvent<Detail>).detail || null; refreshDetail(); });
  function refreshDetail() {
    const id = taskOfDetail(lastDetail), isOwned = !!(id && (owned.has(id) || Date.now() - (resumedAt.get(id) || 0) < 15e3));
    const isPeer = !isOwned && !!id && (peerTasks.has(id) || sessTasks.has(id) || (cur && cur.mode === 'peer' && cur.id === id)); // closed ones too: Continue here
    const sub = isOffice() && lastDetail && lastDetail.kind === 'agent' && /^a-/.test(lastDetail.id) ? lastDetail.id : null; // office view: a subagent shows its own screen
    if (sub) showFor(sub, 'agent'); else showFor(isOwned || isPeer ? id : null, isPeer ? 'peer' : 'owned');
    showExt(!isOwned && id && extTasks.has(id) ? id : null); updateAlert();
  }

  // ───────── New session dialog
  const LS = { get: (k: string) => { try { return localStorage.getItem(k) || ''; } catch { return ''; } }, set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { } } };
  const projSel = h('select', { id: 'cn-proj', 'aria-label': 'Project' });
  const pathIn = h('input', { id: 'cn-path', type: 'text', placeholder: 'C:\\path\\to\\folder', autocomplete: 'off', spellcheck: 'false' });
  const browseBtn = h('button', { class: 'cb-btn cn-browse', type: 'button', text: 'Browse…', 'aria-expanded': 'false', 'aria-controls': 'cn-fb' });
  const pathWrap = h('div', { class: 'cn-pathf' }, h('label', { for: 'cn-path', text: 'Folder (absolute, must exist)' }), h('div', { class: 'cn-path' }, pathIn, browseBtn));
  // in-dialog folder browser: GET /api/fs/dirs lists subfolder names only
  const fbCur = h('div', { class: 'cn-fb-cur', 'aria-live': 'polite' });
  const fbUp = h('button', { class: 'cb-btn', type: 'button', text: 'Up' });
  const fbUse = h('button', { class: 'cb-btn pri', type: 'button', text: 'Use this folder' });
  const fbList = h('ul', { class: 'cn-fb-list', 'aria-label': 'Folders' });
  const fbMsg = h('div', { class: 'cn-fb-msg' });
  const fb = h('div', { id: 'cn-fb', class: 'cn-fb', hidden: true }, h('div', { class: 'cn-fb-bar' }, fbUp, fbCur, fbUse), fbList, fbMsg);
  let fbPath = '', fbParent = '', fbSeq = 0;
  async function fbLoad(p: string): Promise<void> {
    const seq = ++fbSeq; fbMsg.textContent = 'Loading…';
    let j: { error?: string; path?: string; parent?: string; dirs: string[]; roots: string[] };
    try {
      const r = await fetch('/api/fs/dirs' + (p ? '?path=' + encodeURIComponent(p) : ''), { headers: { 'x-chat-token': TOKEN } });
      j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'cannot open that folder');
    } catch (e) { if (seq !== fbSeq) return; if (p) return fbLoad(''); fbMsg.textContent = (e as Error).message; return; }
    if (seq !== fbSeq) return;
    fbPath = j.path || ''; fbParent = j.parent || '';
    fbCur.textContent = fbPath || 'Choose a starting point';
    fbUp.disabled = !fbPath; fbUse.disabled = !fbPath;
    const items = fbPath ? j.dirs : j.roots;
    fbList.replaceChildren(...items.map(n => h('li', null, h('button', { type: 'button', text: n, onclick: () => fbLoad(fbPath ? fbPath.replace(/[\\/]+$/, '') + (fbPath.includes('\\') ? '\\' : '/') + n : n) }))));
    fbMsg.textContent = items.length ? '' : 'No subfolders here.';
  }
  function fbToggle(open: boolean) {
    fb.hidden = !open; browseBtn.setAttribute('aria-expanded', String(open));
    if (open) { const v = pathIn.value.trim(); fbLoad(/^([a-zA-Z]:[\\/]|\/)/.test(v) ? v : ''); }
  }
  browseBtn.addEventListener('click', () => fbToggle(fb.hidden as boolean));
  fbUp.addEventListener('click', () => fbLoad(fbParent));
  fbUse.addEventListener('click', () => { if (!fbPath) return; pathIn.value = fbPath; syncSel(); fbToggle(false); pathIn.focus(); });
  const modelSel = h('select', { id: 'cn-model', 'aria-label': 'Model' }, [['', 'Default'], ['haiku', 'Haiku'], ['sonnet', 'Sonnet'], ['opus', 'Opus']].map(([v, l]) => h('option', { value: v, text: l })));
  const effortSel = h('select', { id: 'cn-effort', 'aria-label': 'Effort' }, [['', 'Default'], ['low', 'Low'], ['medium', 'Medium'], ['high', 'High'], ['xhigh', 'X-high'], ['max', 'Max']].map(([v, l]) => h('option', { value: v, text: l })));
  // --dangerously-skip-permissions: off every time the dialog opens, never remembered
  const skipCb = h('input', { type: 'checkbox', id: 'cn-skip', 'aria-describedby': 'cn-skip-warn' });
  const skipWarn = h('p', { id: 'cn-skip-warn', class: 'cn-skip-warn', hidden: true, text: '⚠ Claude will edit files, run commands and use every tool in this folder without asking you first, and you will see no permission cards here. Only use this in a folder you trust, ideally a throwaway copy.' });
  const skipRow = h('div', { class: 'cn-skip' }, h('label', { class: 'cn-skip-l' }, skipCb, ' Skip permission prompts (--dangerously-skip-permissions)'), skipWarn);
  const hintEl = h('div', { class: 'cn-hint' });
  function syncSkip() {
    skipWarn.hidden = !skipCb.checked; skipRow.classList.toggle('on', skipCb.checked);
    hintEl.textContent = skipCb.checked ? 'Claude runs in that folder and asks no permission. Ctrl+Enter starts it.' : 'Claude runs in that folder with the dashboard answering permission prompts. Ctrl+Enter starts it.';
    if (!goBtn.disabled) goBtn.textContent = skipCb.checked ? 'Start without prompts' : 'Start session';
  }
  skipCb.addEventListener('change', syncSkip);
  const promptIn = h('textarea', { id: 'cn-prompt', rows: 4, 'aria-label': 'First message', placeholder: 'What should Claude do?', spellcheck: 'false' });
  const cnErr = h('div', { class: 'cn-err', role: 'alert' });
  const goBtn = h('button', { class: 'cb-btn pri', type: 'submit', text: 'Start session' });
  const cancelBtn = h('button', { class: 'cb-btn', type: 'button', text: 'Cancel' });
  const lab = (t: string, el: Node) => h('label', { text: undefined }, t, el);
  const formEl = h('form', { class: 'cn-f', method: 'dialog', novalidate: true },
    lab('Project', projSel), pathWrap, fb,
    h('div', { class: 'cn-row' }, lab('Model', modelSel), lab('Effort', effortSel)),
    lab('First message', promptIn),
    skipRow, hintEl,
    cnErr, h('div', { class: 'cn-act' }, cancelBtn, goBtn));
  const dlg = h('dialog', { class: 'cn', 'aria-labelledby': 'cn-title' }, h('div', { class: 'cn-box' }, h('h2', { id: 'cn-title', text: 'New session' }), h('p', { text: 'Starts a Claude Code session you can chat with from here.' }), formEl));
  document.body.append(dlg);
  cancelBtn.addEventListener('click', () => dlg.close());
  dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });
  // the project list and the path field stay in step: picking a project fills its real folder; typing a path selects its project or "Other"
  projSel.addEventListener('change', () => { if (projSel.value !== '__other') pathIn.value = projSel.value; else pathIn.focus(); });
  pathIn.addEventListener('input', syncSel);
  function syncSel() {
    const v = pathIn.value.trim().replace(/[\\/]+$/, '').toLowerCase();
    const hit = [...projSel.options].find(o => o.value !== '__other' && o.value.replace(/[\\/]+$/, '').toLowerCase() === v);
    projSel.value = hit ? hit.value : '__other';
  }
  promptIn.addEventListener('keydown', e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); formEl.requestSubmit(); } });
  function fillProjects() {
    const seen = new Set<string>(), opts: HTMLOptionElement[] = [];
    for (const p of DS.state.projects) if (p.cwd && !seen.has(p.cwd)) { seen.add(p.cwd); opts.push(h('option', { value: p.cwd, text: `${p.name}  ·  ${p.cwd}` })); }
    opts.push(h('option', { value: '__other', text: 'Other path…' }));
    projSel.replaceChildren(...opts);
    const want = (lastDetail && (() => { const t = taskOfDetail(lastDetail); for (const p of DS.state.projects) if (p.tasks.some(x => x.id === t)) return p.cwd; if (lastDetail!.kind === 'project') return (DS.state.projects.find(p => p.id === lastDetail!.id) || {} as Partial<Project>).cwd; })()) || LS.get('chat.cwd');
    projSel.value = want && seen.has(want) ? want : opts.length > 1 ? opts[0].value : '__other';
    pathIn.value = projSel.value === '__other' ? LS.get('chat.path') : projSel.value;
    fbToggle(false);
  }
  function openDialog() {
    fillProjects(); modelSel.value = LS.get('chat.model'); effortSel.value = LS.get('chat.effort');
    cnErr.textContent = ''; goBtn.disabled = false; skipCb.checked = false; syncSkip();
    dlg.showModal(); promptIn.focus();
  }
  formEl.addEventListener('submit', async e => {
    e.preventDefault();
    const cwd = pathIn.value.trim(), prompt = promptIn.value.trim();
    if (!cwd) { cnErr.textContent = 'Choose a project, type a folder path, or browse to one.'; pathIn.focus(); return; }
    if (!prompt) { cnErr.textContent = 'Write a first message.'; promptIn.focus(); return; }
    cnErr.textContent = ''; goBtn.disabled = true; goBtn.textContent = 'Starting…';
    try {
      const r = await post('/api/chat/start', { cwd, model: modelSel.value, effort: effortSel.value, prompt, skipPermissions: skipCb.checked });
      LS.set('chat.cwd', projSel.value === '__other' ? '' : cwd); LS.set('chat.path', projSel.value === '__other' ? cwd : ''); LS.set('chat.model', modelSel.value); LS.set('chat.effort', effortSel.value);
      promptIn.value = ''; dlg.close(); openSession(r.id!);
    } catch (err) { cnErr.textContent = (err as Error).message; goBtn.disabled = false; syncSkip(); }
  });
  const newBtn = h('button', { id: 'chat-new', class: 'chat-new', type: 'button', 'aria-haspopup': 'dialog', onclick: openDialog }, h('span', { 'aria-hidden': 'true' }), 'New session');
  (newBtn.firstChild as HTMLElement).innerHTML = '<svg width="11" height="11" viewBox="0 0 12 12" aria-hidden="true"><path d="M6 1v10M1 6h10" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" fill="none"/></svg>';
  // Refresh: hard refresh of the data and connections, not the page (server rescans now; every open stream reopens)
  const refBtn = h('button', { id: 'chat-refresh', class: 'chat-new chat-ref', type: 'button', title: 'Rescan sessions and reconnect (keeps the page)', 'aria-label': 'Refresh data and connections' }, h('span', { 'aria-hidden': 'true' }), h('span', { class: 'lbl', text: 'Refresh' }));
  (refBtn.firstChild as HTMLElement).innerHTML = '<svg width="11" height="11" viewBox="0 0 12 12" aria-hidden="true"><path d="M10.2 4.2A4.5 4.5 0 1 0 10.5 7.5M10.5 1.5v3h-3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>';
  refBtn.addEventListener('click', async () => {
    if (refBtn.disabled) return;
    const lbl = refBtn.querySelector('.lbl')!; refBtn.disabled = true; lbl.textContent = 'Refreshing…'; refBtn.removeAttribute('data-err');
    try {
      await post('/api/refresh');
      DS.reconnect();
      reopen();
      if (ecur) { const id = ecur.id; closeExt(); showExt(id); }
      lbl.textContent = 'Refreshed';
    } catch (e) { lbl.textContent = 'Refresh failed'; refBtn.dataset.err = ''; refBtn.title = (e as Error).message; }
    setTimeout(() => { lbl.textContent = 'Refresh'; refBtn.disabled = false; }, 1200);
  });
  const acts = h('div', { class: 'chat-acts' }, newBtn, refBtn);
  (() => { const w = $('#win'); if (w) w.insertAdjacentElement('afterend', acts); else document.body.append(acts); })();
  DS.subscribe(state => {
    const m = new Map<string, { task: Task; project: Project }>(); const n: Task[] = [];
    for (const p of state.projects) for (const t of p.tasks) if (t.owned) { m.set(t.id, { task: t, project: p }); if (t.chat && t.chat.pending > 0) n.push(t); }
    const x = new Map<string, Task>(); for (const p of state.projects) for (const t of p.tasks) if (!t.owned && t.ext && t.ext.pending > 0) x.set(t.id, t);
    extTasks = x;
    const pt = new Set<string>(); for (const p of state.projects) for (const t of p.tasks) if (!t.owned && t.peer && t.peer.live) pt.add(t.id);
    peerTasks = pt;
    const st = new Set<string>(); for (const p of state.projects) for (const t of p.tasks) if (!t.owned) st.add(t.id);
    sessTasks = st;
    owned = m; needy = n; updateAlert(); tryWanted(); refreshDetail();
  });
})();
