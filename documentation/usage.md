# Usage and plan limits

The **Usage** button (left panel, next to New session) opens a full view of how much you use Claude Code.

## What it shows

- **Plan limits**: the 5-hour and weekly limits, how much of each is used, and when each resets. A spend limit shows too when your plan has one.
- **How the limits moved**: a line per limit over the chosen period.
- **Tokens or cost per day and per hour** (hours for the last 7 days at most), stacked per model. Older versions of a model family are striped, so they stand apart from the newest one.

Choose a period of 7, 14 or 31 days, and switch between **Tokens** and **Cost**. Hover a bar or the limit line for the numbers. **Table view** lists the numbers per day. Esc closes the view.

Cost is what the tokens would cost at API list prices. It is not what a Claude plan charges.

## Where the limits come from

Claude Code hands its rate limits only to a **status line** command. So when the server starts and your settings have **no** status line, it adds its own to `~/.claude/settings.json`:

```json
"statusLine": { "type": "command", "command": "\"<node>\" \"<server.js>\" --statusline" }
```

Other keys stay as they are. A status line of your own is never touched; the Usage view then says it cannot read limits.

The status line prints `<model> · 5h X% · week Y%` in your terminal.

Limits show after the next reply in a session that is signed in to a Claude plan. Sessions that use an API key have no plan limits.

## What is stored

Only the limit percentages and reset times:

- `~/.claude/crate-works-limits.json`: the latest reading;
- `~/.claude/crate-works-limits.jsonl`: one line per change, trimmed at 200 KB.

No session ID, folder, path or model name is stored.

## Turn it off

- `--no-statusline`: the server does not add the status line. The view says limits are off.
- `node server.js --uninstall-statusline`: removes the status line, only when it is the one this server added.

`--settings <file>` applies to both.
