# Getting started

## Requirements

- **Node.js 22 or later.** The server uses only Node's built-in modules. The page is written in TypeScript, so building it once needs `npm ci`, which installs two pinned dev tools (TypeScript and the three.js types).
- **Claude Code** installed and used on this computer. The dashboard reads `~/.claude/projects`, the folder where Claude Code keeps its session transcripts.
- To start sessions from the dashboard, the `claude` command must be on your `PATH` (or set `CLAUDE_BIN`, see below).
- For the desktop app only: Rust and Node.js 25.5 or later. See [Desktop app](desktop-app.md).

## Start the server

```sh
npm ci
npm start
```

`npm start` builds the page into `dist/` (`npm run build`) and then runs `node server.js`. After a build you can also run `node server.js` with any of the options below. If `dist/` is missing, the server still starts and the page tells you to run `npm run build`.

Then open http://127.0.0.1:4545 in your browser. The server listens on `127.0.0.1` only, so other computers cannot reach it.

On first start the server adds a status line to `~/.claude/settings.json` if you have none, so it can read your plan limits. A status line of your own is never changed. See [Usage and plan limits](usage.md); use `--no-statusline` to skip this.

Stop the server with Ctrl+C. Sessions started from the dashboard are stopped cleanly at the same time.

## Command-line options

| Option | What it does |
|--------|--------------|
| `--port <n>` | Port to listen on. Default `4545`. The global hook only reaches the port it was installed with. |
| `--hours <n>` | Default time window of the page in hours. Default `24`. The page can switch between 1 h, 6 h, 24 h and 7 days. |
| `--root <dir>` | Folder with the session transcripts. Default `~/.claude/projects`. Settings and limit files are read from its parent folder. |
| `--static <dir>` | Folder with the built page files (`index.html`, `app/main.js` and the rest). Default: `dist/` next to `server.js`, written by `npm run build`. The desktop app uses this. |
| `--settings <file>` | Claude Code settings file to change for the hook and the status line. Default `~/.claude/settings.json`. |
| `--no-hook` | Turns the global hook endpoints off: every hook call gets an empty answer at once. |
| `--no-ask-hook` | Turns the AskUserQuestion hook endpoint off, so questions are answered only in the terminal (on by default, see [Answer prompts from the dashboard](permission-hook.md)). |
| `--no-statusline` | Does not install the status line, so plan limits are not shown. |

One-off commands, which change the settings file and exit:

| Command | What it does |
|---------|--------------|
| `node server.js --install-hook [--no-ask] [--port n]` | Adds the global permission hook and the AskUserQuestion hook (left out with `--no-ask`) to the settings file. |
| `node server.js --uninstall-hook` | Removes only the hook entries this server added. |
| `node server.js --uninstall-statusline` | Removes the status line, only when it is the one this server added. |

## Environment variables

| Variable | What it does |
|----------|--------------|
| `CLAUDE_BIN` | Full path of the `claude` program used for dashboard sessions. Without it the server looks for `claude` on `PATH`, then in `~/.local/bin`. |
| `AICO_DASH_ASK=0` | Same as `--no-ask-hook`. |
| `AICO_DASH_UNWATCH_MS` | How long a held question waits after its dashboard panel closes before it goes back to the terminal (milliseconds). Default 3000. For tests. |
| `AICO_DASH_HOLD_MS` | How long a hook prompt is held before the terminal decides (milliseconds). Default 280000. For tests. |
| `AICO_DASH_NO_SWEEP=1` | Turns off the background release checks of held hook prompts. Tests only. |

## Run the tests

```sh
npm test
```

`npm test` builds `dist/` first. The tests start the server against a temporary folder, so they never touch your real `~/.claude`. `npm run typecheck` runs the TypeScript checker without writing files.

## Front-end files

The page source is TypeScript in `src/`, and `npm run build` compiles it to plain ES modules in `dist/` (the server never reads `src/`). The main folders:

| Folder | What is in it |
|--------|---------------|
| `src/index.html`, `src/*.css` | The page and its styles, copied to `dist/` as they are. |
| `src/live-data.ts`, `chat.ts`, `usage.ts`, `settings.ts` | The data stream, chat panel, usage panel and settings dialog (classic scripts). |
| `src/app/` | Start-up: renderer, camera, controls, HUD, and the switch between the two scenes (`main.ts`). |
| `src/common/` | Code both scenes use: shared data types, DOM, text and maths helpers. |
| `src/types/` | Type declarations for the `window` hooks (`__fac`, `__office` and the rest). |
| `src/factory/` | The factory view: halls, lines, robot arms, crates, and one file per vehicle in `vehicles/` (AGV, tow truck). |
| `src/office/` | The office view: buildings (offices, bank, police station), roads, people, and one file per vehicle in `vehicles/` (sports car, armoured car, patrol car, SWAT van, bandit van). |

three.js 0.160.0 is loaded from a CDN through the import map in `index.html`. The desktop app bundles the files of `dist/` (see `bundle.resources` in `desktop/src-tauri/tauri.conf.json`; a test checks that the list matches the build).
