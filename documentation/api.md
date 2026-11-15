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

A task in the snapshot carries flags only, never text: `owned`, `chat: {alive, busy, pending}` for dashboard sessions, `peer: {live, canSend}` for terminal and desktop sessions, `ext: {pending}` for a hook prompt.

## Dashboard sessions

| Method and path | Token | Body and answer |
|-----------------|-------|-----------------|
| `POST /api/chat/start` | yes | `{cwd, model, effort, prompt, skipPermissions?}` → `{id}` (the session ID). `skipPermissions` must be `true` or `false` when sent; anything else is 400. `cwd` must be an absolute path to an existing local folder. |
| `POST /api/chat/:id/send` | yes | `{text}` |
| `POST /api/chat/:id/answer` | yes | `{request_id, behavior: "allow"\|"deny", answers?, message?}`. `answers` is `{questionText: label}`; multi-select labels are joined by `", "`. |
| `POST /api/chat/:id/stop` | yes | Stops the session. |
| `GET /api/chat/:id/stream?token=` | yes | Event stream: `init {meta, log}`, then `entry` and `meta` events. |

## Terminal and desktop sessions

| Method and path | Token | Body and answer |
|-----------------|-------|-----------------|
| `POST /api/peer/:id/send` | yes | `{text, priority?: "next"\|"now"}` → `{ok: true}`. 400 bad input, 403 token, 404 not a live session, 429 too fast, 502 pipe or key problem. |
| `GET /api/peer/:id/stream?token=` | yes | Event stream: `init {meta, log}`, then `entry` and `meta {live, canSend, status, entrypoint}` events. |

## Global hook

| Method and path | Token | Body and answer |
|-----------------|-------|-----------------|
| `POST /hook/permission` | no (loopback only) | Called by Claude Code's PermissionRequest hook. Held until answered; see [Answer prompts from the dashboard](permission-hook.md). |
| `POST /hook/pretool` | no (loopback only) | Called by the PreToolUse hook for AskUserQuestion. Off unless `--ask-hook`. |
| `GET /api/ext/:sid/stream?token=` | yes | Event stream of hook prompts for a session. |
| `POST /api/ext/:sid/answer` | yes | `{id, behavior: "allow"\|"deny", message?}` |

## Page files

`/` (index.html), `/live-data.js`, `/chat.js`, `/chat.css` and `/usage.js`. Nothing else is served.
