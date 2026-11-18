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

That session runs without permission prompts, and Claude Code holds messages from outside for it until you approve them in the terminal. Approve it there, type on claude.ai through Remote Control instead, or set `"crossSessionInbound": "accept"` in your user settings (`~/.claude/settings.json`). A project's `.claude/settings.local.json` cannot turn the check off: a repository may only make it stricter. See [crossSessionInbound](peer-chat.md#crosssessioninbound).

## Sending to a terminal session is read-only

The session has closed, or its pipe did not answer. The input unlocks when the session's status changes. If it stays locked, send from the terminal itself.

## The Usage view says it cannot read limits

- You have a status line of your own. The server never replaces it, so limits are not available.
- The server was started with `--no-statusline`.
- No session has replied since the status line was added, or your sessions use an API key (API key sessions have no plan limits).

## Permission cards do not show for terminal sessions

Install the hook with `node server.js --install-hook`, and check that the server runs on the same port as the hook URL.

Claude Code reads its hooks when a session starts. A session that was already running when the hook was installed does not use it: restart it (`/exit`, then `claude --resume <session id>`, and `/rc` again if you used Remote Control).

## A question does not show as a form

- The session started before the question hook was installed: restart it (see above).
- No dashboard page was open when Claude asked. Then the terminal asks at once.
- The question went back to the terminal after 5 minutes: your hook still has the old timeout of 300 seconds. Run `node server.js --install-hook` again (it writes 86400 seconds for the question hook) and restart the session.
- The terminal shows nothing and Claude waits: a question is waiting in the dashboard. Look for the blue **Question for you** alert, or press Esc in the terminal.
- Something else listens on port 4545, for example an older `node server.js` you started yourself. The desktop app then shows that server. Stop it and reopen the app.
