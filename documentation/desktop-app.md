# Desktop app

`desktop/` wraps the same page in a [Tauri 2](https://tauri.app) window for Windows.

## How it works

`server.js` is compiled into one executable (a Node single executable application, about 100 MB because it contains Node). It runs next to the app as a sidecar on `127.0.0.1:4545`, the port the global hook uses. The page files ship with the app, and the sidecar finds them through `--static <dir>`.

- **Start**: the window shows a local "Starting" page, then opens `http://127.0.0.1:4545/` once the port answers. If the server stops or does not answer within 60 seconds, that page shows an error.
- **Already running**: if port 4545 already answers (your own `node server.js`), the app opens that server and starts no sidecar.
- **Watchdog**: while the app runs it checks the port every 2 seconds. When the port stays quiet for 10 seconds (the server it opened was stopped, or its sidecar crashed), the app starts its own sidecar and reloads the page. When another server answers first, it reloads the page too.
- **Stop**: closing the window stops the sidecar. Sessions started from the dashboard see their input close and exit by themselves.
- The dashboard is a page from `127.0.0.1` inside the window and gets no access to the Tauri API. Only the local loading page has Tauri's default core permissions.

## Port and hooks

The app and its sidecar listen on **`127.0.0.1:4545`** (loopback only). Set `MCFACTORY_PORT` to use another port; see [Testing next to a running server](#testing-next-to-a-running-server).

Claude Code reaches the app through these global hooks in `~/.claude/settings.json`. `node server.js --install-hook` adds them (see [Answer prompts from the dashboard](permission-hook.md)):

| Claude Code hook | Matcher | URL | Timeout | What it does |
| --- | --- | --- | --- | --- |
| `PermissionRequest` | none | `http://127.0.0.1:4545/hook/permission` | 300 s | Shows **Allow** / **Deny** for the prompt on the session's detail card. |
| `PreToolUse` | `AskUserQuestion` | `http://127.0.0.1:4545/hook/pretool` | 86400 s | Shows the question as a form in the dashboard. Left out with `--install-hook --no-ask`. |

These are the only hooks the app uses. Both are `http` hooks and fail open: when the app is closed, the terminal works as before.

The one other entry the server writes to the settings file is a status line (not a hook), used to read your plan limits. See [Usage and plan limits](usage.md).

## Build it yourself

You need Rust and Node.js 25.5 or later (for `--build-sea`).

```sh
cd desktop
npm ci
npm run dev     # development window
npm run build   # installer
```

Both commands first build the page (`npm run build` in the repository root, which needs `npm ci` there once). The app bundles the files of `dist/` listed in `bundle.resources` of `src-tauri/tauri.conf.json`; when a build adds or removes a file, update that list (`npm test` fails until it matches).

The installer is written to `desktop/src-tauri/target/release/bundle/nsis/`.

Releases on GitHub include the installer, built by the Release workflow. See [MAINTAINING.md](../MAINTAINING.md).

## Testing next to a running server

`MCFACTORY_PORT=4598` makes the app use another port. The global hook only reaches 4545.
