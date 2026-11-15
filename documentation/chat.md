# Chat and new sessions

You can start a Claude Code session from the dashboard and chat with it in the page. These sessions are "owned" by the dashboard: the server starts the `claude` process and talks to it directly.

For sessions you started yourself in a terminal or the desktop app, see [Chat with terminal and desktop sessions](peer-chat.md).

## Start a session

Press **New session** in the left panel, under the time window.

1. **Project**: pick a known project, or "Other path". The folder field always shows the real folder of the project you picked.
2. **Folder**: type any existing absolute folder, or press **Browse…** to pick one from a folder list (Up, click a folder to open it, **Use this folder**). With no folder typed, the list starts at your home folder and the drives. The project list follows what you type.
3. **Model** (default, haiku, sonnet or opus) and **effort**.
4. **First message**. Ctrl+Enter starts the session.

The new session flies into view as a normal conveyor line.

## Skip permission prompts

The dialog has a **Skip permission prompts** box. It is off every time the dialog opens and is never remembered.

When you tick it:

- a red warning shows, and the button reads **Start without prompts**;
- the session starts with `--dangerously-skip-permissions`, so Claude runs every tool without asking, and no permission cards appear;
- the chat panel's head shows **⚠ no prompts** for that session.

Use it only for folders you trust.

Claude Code holds messages from other sessions for a session in this mode, unless that session's `crossSessionInbound` setting is `accept`. The dashboard does not change that setting. See [Held messages](peer-chat.md#held-messages).

## The chat panel

The chat panel shows in the detail card of an owned session (or any of its agents). It has:

- a scrolling log: your text, Claude's text, each tool's name with a 100-character summary, and each turn's result with its cost;
- an input: Enter sends, Shift+Enter adds a new line;
- a **Stop** button.

**Permission requests** show as a card with the tool, its description and a preview of its input, and **Allow** / **Deny**.

**Questions** (AskUserQuestion) show as options (radio buttons, or checkboxes for multi-select) plus an "Other" text field, then **Send answer** / **Skip**.

### Slash commands

Type `/` and the session's commands show above the input, filtered as you type. Arrow keys move, Tab or Enter fills one in, Esc closes the list. Before the session has started, the list says "Commands load once the session has started".

## Needs you

An owned session with an open request turns blue (approval or question), like any session that needs you. A blue **Chat needs you** pill at the bottom left, and the KPI tile, open that session's chat and focus the request.

## How a session runs

The server starts:

```
claude -p --input-format stream-json --output-format stream-json --verbose --permission-prompt-tool stdio [--model m] [--effort e] [--dangerously-skip-permissions]
```

in the chosen folder, without a shell. Your text only ever goes to the process's input, never into its command line. The model must be `haiku`, `sonnet`, `opus` or a `claude-*` name; the effort `low`, `medium`, `high`, `xhigh` or `max`.

The program is `CLAUDE_BIN` if set, else `claude` on `PATH`, else `~/.local/bin/claude`.

Up to 8 owned sessions can be live at once. The chat log is kept in memory only (600 entries per session, the last 20 ended sessions) and is lost when the server restarts. The transcript in `~/.claude/projects` stays, as for any Claude Code session.

## Stopping

**Stop** closes the session's input, so Claude exits cleanly. If the process is still there after 4 seconds, the server ends its process tree.

Ctrl+C on the server stops all owned sessions the same way. If the server is killed hard, each session sees its input close and exits by itself.
