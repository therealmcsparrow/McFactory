# Security and privacy

Crate Works Live is a local tool. The server listens on `127.0.0.1` only and sends nothing off your computer. The page makes two kinds of outside request: it loads the three.js library (version 0.160.0) from the jsDelivr CDN, and its fonts from Google Fonts. Those services see your IP address and browser, but no session data.

## What the server accepts

- **Local only.** Bound to `127.0.0.1`. Every request needs a `Host` of `127.0.0.1:<port>` or `localhost:<port>`, and a matching `Origin` when one is sent. This blocks other websites in your browser and DNS rebinding.
- **Page token.** A random token is made at each start and embedded in the page. Everything that starts, steers or answers a session, lists folders or refreshes needs it. Wrong or missing: 403.
- **JSON only**, at most 256 KB per request.
- **Folders** for new sessions must be absolute local paths to existing folders.
- **No shell.** Claude is started without a shell, and your text goes to its input, never into its command line. Model and effort are checked against fixed lists.
- **Skip permission prompts** is opt-in per session, off every time the dialog opens, and must be exactly `true` or `false`.

## What reaches the browser

For sessions the dashboard did not start, the page gets only numbers, model IDs, tool names, the session title (the first 60 characters of the first prompt), subagent descriptions and the aico project ID. No message text, tool inputs or tool outputs.

Two exceptions, both only for the page that holds this run's token:

- **Dashboard sessions**: their own chat log.
- **Terminal and desktop sessions**: their message text, and only while that session's chat panel is open. It never appears in `/api/state`.

## Subagent screens

In the [office view](office-view.md), clicking a subagent opens a read-only screen. It follows the same rule as the chat panel of a terminal session:

- It needs this run's page token.
- The file is read only while the screen is open.
- It shows the subagent's own assistant text, and tool names with a short summary.
- It never shows the brief (the user-role lines), thinking, tool input beyond the summary, or tool output.
- Nothing leaves your computer, and none of it appears in `/api/state`.

The room a session sits in (meeting room, kitchen) comes from the command or skill name only. The speech balloons show dots, never text.

## Secrets the server handles

The **peer token** of a terminal or desktop session (from its `.key` file) is read for each send and written only to that session's own pipe. It is never logged, never sent to the browser and never part of an HTTP response or the snapshot.

## What is written to your disk

| File | When | What |
|------|------|------|
| `~/.claude/settings.json` | Only with `--install-hook`, and when you have no status line | The hook entry, or the status line entry. Other keys are kept. |
| `~/.claude/crate-works-limits.json` and `.jsonl` | When the status line runs | Limit percentages and reset times only. |

Chat logs of dashboard sessions are kept in memory only. Claude Code itself still writes its normal transcripts.

## The global hook

The hook endpoints have no secret, because Claude Code's http hooks cannot send one reliably. Any local program could show a fake Allow / Deny card, but answering still needs the page token. See [Answer prompts from the dashboard](permission-hook.md#security).

## Bypass-mode sessions

Claude Code holds messages from outside for sessions that run without permission prompts. The dashboard shows them as held and never fakes a permission mode to get past this. Changing `crossSessionInbound` is your decision.

## Reporting a problem

See [SECURITY.md](../SECURITY.md).
