# Answer prompts from the dashboard

An optional global Claude Code hook sends each permission prompt of your normal sessions (terminal and desktop app) to this server. The session's detail card then shows **Allow** / **Deny**, with an optional message for a denial.

The terminal still shows its own dialog at the same time. **The first answer wins.**

## Install and remove

```sh
node server.js --install-hook
```

This merges one entry into `~/.claude/settings.json`. Other keys and hooks stay; running it again replaces only this entry. Options:

- `--port <n>`: the port in the hook's URL (default 4545). It must match the port the server runs on.
- `--settings <file>`: change another settings file.
- `--with-ask`: also add the AskUserQuestion hook (see below).

The entry it adds:

```json
{"hooks":{"PermissionRequest":[{"hooks":[{"type":"http","url":"http://127.0.0.1:4545/hook/permission","timeout":300}]}]}}
```

To remove it:

```sh
node server.js --uninstall-hook
```

This removes only entries whose URL is `http://127.0.0.1:<port>/hook/permission` or `/hook/pretool`, and cleans up an empty `hooks` key. You can also delete the `PermissionRequest` entry with that URL by hand.

Hooks apply to Claude Code sessions started after the settings change; running sessions usually pick it up too.

## If the dashboard is not running

The hook fails open: when the server is down, the hook call is a non-blocking error and the terminal works as before. Never set `onFailure: "block"` on this entry.

While the dashboard is up, nothing changes in the terminal either. The hook only adds a second place to answer.

## What happens to a prompt

1. Claude Code posts the prompt to `/hook/permission`. The server keeps the tool name and a 200-character summary (command, file path, pattern or URL), never file content and never the full input.
2. The session turns blue (approval) on the page, and its card shows Allow / Deny.
3. Your answer goes back to Claude Code as the hook's decision.

The server lets the terminal decide (an empty answer) when:

- the session file goes from waiting to something else, because you answered in the terminal;
- the process is gone;
- the transcript gets new lines after the prompt (with 1.5 seconds of grace);
- the hook connection closes;
- 280 seconds pass (the hook's timeout is 300).

Anything doubtful ends this way, so the worst case is answering in the terminal as before.

## Not handled by the hook

- Sessions started from the dashboard: they are answered in their own chat panel, so the hook answers empty at once.
- AskUserQuestion on the permission hook.
- Requests that are not valid JSON.
- More than 8 prompts per session, or 20 in total.

`node server.js --no-hook` turns all of this off: every hook call gets an empty answer at once.

## AskUserQuestion (off by default)

With `--ask-hook` (or `AICO_DASH_ASK=1`) on the server and `--install-hook --with-ask` in the settings, questions from your terminal sessions also show in the dashboard as the question card.

It is off because it is not yet checked whether the terminal shows its question while this hook is waiting. If it only shows after the hook returns, the terminal would wait until you answer in the dashboard or the hook times out.

To check it yourself:

1. In a throwaway folder, add a PreToolUse command hook with matcher `AskUserQuestion` that writes a timestamp to a log, sleeps 20 seconds, writes a second timestamp and exits 0.
2. Start an interactive `claude` there and ask it to use AskUserQuestion.
3. If the question appears at once, the feature is safe to turn on. If it appears only after about 20 seconds, leave it off.

Headless `claude -p` has no AskUserQuestion tool, so this cannot be checked there.

## Known limits

First answer wins is tested with scripts, answering in the dashboard first. That the terminal dialog closes when the dashboard answers first, and that the hook is released when you answer in the terminal, are handled by the rules above but not yet tested by hand in the interactive terminal.

## Security

The hook endpoint has no secret: http hooks can only send headers from environment variables the Claude process has, and the desktop app does not share your shell's environment. The endpoint accepts loopback calls only, with the same Host and Origin checks as the rest of the server, and JSON only.

A caller can at most show a card. Answering it still needs the page token. Any local program could show a fake card; that is the same trust level as the rest of this local-only server.
