# Troubleshooting

## The page is empty

The dashboard shows sessions inside the chosen time window. Pick a longer window (24 h or 7 days), or use Claude Code once. Check that your transcripts are in `~/.claude/projects`; if they are somewhere else, start the server with `--root <folder>`.

## "forbidden" in the browser

Open the page as `http://127.0.0.1:<port>` or `http://localhost:<port>`. Other host names, and requests from other websites, are refused on purpose.

## Port 4545 is already in use

Another copy of the server (or the desktop app) is running. Use that one, or start this one with `--port <n>`. The global hook only reaches the port it was installed with.

## New session does not start

- Check that `claude` runs in a terminal. If it is not on your `PATH`, set `CLAUDE_BIN` to its full path.
- The folder must be an existing absolute path.
- At most 8 dashboard sessions can be live at once.

## My message to a terminal session says "Held by the session"

That session runs without permission prompts, and Claude Code holds messages from outside for it. Review the message in that session, or set `"crossSessionInbound": "accept"` in its settings. See [Held messages](peer-chat.md#held-messages).

## Sending to a terminal session is read-only

The session has closed, or its pipe did not answer. The input unlocks when the session's status changes. If it stays locked, send from the terminal itself.

## The Usage view says it cannot read limits

- You have a status line of your own. The server never replaces it, so limits are not available.
- The server was started with `--no-statusline`.
- No session has replied since the status line was added, or your sessions use an API key (API key sessions have no plan limits).

## Permission cards do not show for terminal sessions

Install the hook with `node server.js --install-hook`, and check that the server runs on the same port as the hook URL. Sessions started before the change may need a restart.
