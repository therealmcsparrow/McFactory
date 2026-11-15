# Getting started

## Requirements

- **Node.js 22 or later** for the server. It uses only Node's built-in modules, so there is nothing to install.
- **Claude Code** installed and used on this computer. The dashboard reads `~/.claude/projects`, the folder where Claude Code keeps its session transcripts.
- To start sessions from the dashboard, the `claude` command must be on your `PATH` (or set `CLAUDE_BIN`, see below).
- For the desktop app only: Rust and Node.js 25.5 or later. See [Desktop app](desktop-app.md).

## Start the server

```sh
node server.js
```

Then open http://127.0.0.1:4545 in your browser. The server listens on `127.0.0.1` only, so other computers cannot reach it.

On first start the server adds a status line to `~/.claude/settings.json` if you have none, so it can read your plan limits. A status line of your own is never changed. See [Usage and plan limits](usage.md); use `--no-statusline` to skip this.

Stop the server with Ctrl+C. Sessions started from the dashboard are stopped cleanly at the same time.

## Command-line options

| Option | What it does |
|--------|--------------|
| `--port <n>` | Port to listen on. Default `4545`. The global hook only reaches the port it was installed with. |
| `--hours <n>` | Default time window of the page in hours. Default `24`. The page can switch between 1 h, 6 h, 24 h and 7 days. |
| `--root <dir>` | Folder with the session transcripts. Default `~/.claude/projects`. Settings and limit files are read from its parent folder. |
| `--static <dir>` | Folder that holds `index.html`, `chat.js` and the other page files. Default: the folder of `server.js`. The desktop app uses this. |
| `--settings <file>` | Claude Code settings file to change for the hook and the status line. Default `~/.claude/settings.json`. |
| `--no-hook` | Turns the global hook endpoints off: every hook call gets an empty answer at once. |
| `--ask-hook` | Turns on the AskUserQuestion hook endpoint (off by default, see [Answer prompts from the dashboard](permission-hook.md)). |
| `--no-statusline` | Does not install the status line, so plan limits are not shown. |

One-off commands, which change the settings file and exit:

| Command | What it does |
|---------|--------------|
| `node server.js --install-hook [--with-ask] [--port n]` | Adds the global permission hook (and, with `--with-ask`, the AskUserQuestion hook) to the settings file. |
| `node server.js --uninstall-hook` | Removes only the hook entries this server added. |
| `node server.js --uninstall-statusline` | Removes the status line, only when it is the one this server added. |

## Environment variables

| Variable | What it does |
|----------|--------------|
| `CLAUDE_BIN` | Full path of the `claude` program used for dashboard sessions. Without it the server looks for `claude` on `PATH`, then in `~/.local/bin`. |
| `AICO_DASH_ASK=1` | Same as `--ask-hook`. |
| `AICO_DASH_HOLD_MS` | How long a hook prompt is held before the terminal decides (milliseconds). Default 280000. For tests. |
| `AICO_DASH_NO_SWEEP=1` | Turns off the background release checks of held hook prompts. Tests only. |

## Run the tests

```sh
npm test
```

The tests start the server against a temporary folder, so they never touch your real `~/.claude`.
