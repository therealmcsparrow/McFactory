# HTTP API

Everything the page does goes through these endpoints on `http://127.0.0.1:<port>`. They are meant for the page itself; there is no stability promise for other clients.

## Rules for every request

- The `Host` header must be `127.0.0.1:<port>` or `localhost:<port>`, and an `Origin` header, when sent, must match. Otherwise: 403.
- Endpoints marked **token** need this run's page token: in the `x-chat-token` header for requests, or `?token=` for event streams. The token is random per server start and is embedded in `index.html` as `<meta name="chat-token">`. Wrong or missing: 403.
- POST bodies must be `application/json`, at most 256 KB.
- Errors come back as `{ "error": "<text>" }`.

## Snapshot and live updates

| Method and path | Token | Answer |
|-----------------|-------|--------|
| `GET /api/state?hours=N` | no | JSON snapshot of projects, sessions and agents in the window. Numbers, model IDs, tool names and titles only (see [Security and privacy](security-and-privacy.md)). |
| `GET /api/stream?hours=N` | no | Event stream that pushes a new snapshot when something changes. |
| `POST /api/refresh` | yes | Rescans the folders at once and pushes a new snapshot to every stream. `{ok: true}` |
| `GET /api/usage?days=N` | no | Usage view data, `days` 1 to 31 (default 14): `{now, days, since, bucketMs, loading, hours: [{t, m: {<model label>: [tokens, outputTokens, apiCost]}}], models: {<label>: {family, version}}, limits, history, statusline}`. `statusline` is `ours`, `foreign`, `off`, `none` or `unreadable`. |
| `GET /api/fs/dirs?path=<absolute>` | yes | Folder names inside `path` (never file names). Without `path`: the starting points (home folder and drives). |

A task in the snapshot carries flags only, never text: `owned`, `chat: {alive, busy, pending}` for dashboard sessions, `peer: {live, canSend}` for terminal and desktop sessions, `ext: {pending}` for a hook prompt, and `mode` (see [Session mode](#session-mode)).

### Subagents of subagents

Every agent has `parentId` and `depth`. A main agent has `parentId: null` and `depth: 0`. A subagent's `parentId` is the agent that sent it out: the main agent (`s-<session id>`) for `depth: 1`, or, for a subagent sent out by another subagent (`depth: 2` or more), that subagent (`a-<agent id>`), taken from the `parentAgentId` in its `.meta.json`. When that parent is not in the snapshot, `parentId` is the main agent. Nested subagents are listed in the same task as all others and drawn the same way, as workers in the office view and arms in the factory view.

A subagent that was finished and is resumed (its transcript grows after its `.meta.json` said it was finished) counts as running again.

### Pending subagents

When a main agent calls the `Agent` or `Task` tool, the snapshot shows the subagent at once, before its own transcript exists. Such an agent has `id: "p-<tool_use id>"`, `pending: true`, `status: "running"` and zero tokens and cost. Its `role` and `label` come from the subagent type and the short description of the call. The prompt of the call is never in the snapshot.

A pending agent goes away when the real subagent appears, when the call returns, when the session closes, or after 90 seconds. The real subagent carries `dispatch: "<tool_use id>"` when Claude Code records the link. A `p-` ID has no screen: `GET /api/agent/p-…/stream` answers 404.

A change in a transcript reaches an open page within about 0.2 seconds.

## Dashboard sessions

| Method and path | Token | Body and answer |
|-----------------|-------|-----------------|
| `POST /api/chat/start` | yes | `{cwd, model, effort, prompt, skipPermissions?}` → `{id}` (the session ID). `skipPermissions` must be `true` or `false` when sent; anything else is 400. `cwd` must be an absolute path to an existing local folder. With `{resume: <session id>, prompt, model?, effort?}` instead of `cwd` it continues an existing session here (`claude --resume`), in the folder from its transcript, and the log starts with the conversation so far. 409 while that session is still open in a terminal or the desktop app, or already runs here; 404 no transcript. |
| `POST /api/chat/:id/send` | yes | `{text}` |
| `POST /api/chat/:id/answer` | yes | `{request_id, behavior: "allow"\|"deny", answers?, message?}`. `answers` is `{questionText: label}`; multi-select labels are joined by `", "`. |
| `POST /api/chat/:id/stop` | yes | Stops the session. |
| `GET /api/chat/:id/stream?token=` | yes | Event stream: `init {meta, log}`, then `entry` and `meta` events. |

## Terminal and desktop sessions

| Method and path | Token | Body and answer |
|-----------------|-------|-----------------|
| `POST /api/peer/:id/send` | yes | `{text, priority?: "next"\|"now"}` → `{ok: true}`. 400 bad input, 403 token, 404 not a live session, 429 too fast, 502 pipe or key problem. |
| `GET /api/peer/:id/stream?token=` | yes | Event stream: `init {meta, log}`, then `entry` and `meta {live, canSend, status, entrypoint}` events. |

## Subagent screens

| Method and path | Token | Body and answer |
|-----------------|-------|-----------------|
| `GET /api/agent/:id/stream?token=` | yes | Read-only event stream for the office view: `init {meta, log}`, then `entry` and `meta {role, label, status, sessionId}` events. `:id` is a subagent ID (`a-...`). 403 bad token, 404 no such subagent, 405 not GET. |

The stream carries the subagent's own assistant text and its tool names with a short summary. It never carries the brief (the user-role lines), thinking, tool input beyond the summary, or tool output. The file is read only while a screen is open.

### Session mode

Each task in `/api/state` has `mode`: `brainstorm`, `cooler` or `null`. It is set from the name of the command or skill that started the session (`aico:brainstorm`, `aico:cooler`) and from nothing else. The office view uses it to pick the meeting room or the kitchen.

## Global hook

| Method and path | Token | Body and answer |
|-----------------|-------|-----------------|
| `POST /hook/permission` | no (loopback only) | Called by Claude Code's PermissionRequest hook. Held until answered; see [Answer prompts from the dashboard](permission-hook.md). |
| `POST /hook/pretool` | no (loopback only) | Called by the PreToolUse hook for AskUserQuestion. Held only while a chat panel or prompt card of that session is open, otherwise answered empty at once. Off with `--no-ask-hook`. |
| `GET /api/ext/:sid/stream?token=` | yes | Event stream of hook prompts for a session. |
| `POST /api/ext/:sid/answer` | yes | `{id, behavior: "allow"\|"deny", answers?, message?}`. `answers` as for dashboard sessions, for a question. |

## Page files

The built front end in `dist/` (or the `--static` folder): `/` (index.html) and every `.html`, `.js`, `.css` and `.map` file below that folder, such as `/app/main.js` and `/office/index.js`. The list is made once at start-up by walking the folder (symlinks are skipped), and a request is served only when its path is an exact entry. Nothing else is served. If the folder has no `index.html`, `/` answers 503 with a note to run `npm run build`.
