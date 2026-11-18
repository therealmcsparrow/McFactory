# Chat with terminal and desktop sessions

Sessions you started in the Claude CLI or the Claude desktop app get the same chat panel. While they are live (a running process with a messaging pipe) you can message them; once closed you can continue them with Remote Control. The note under the input reads "Terminal or desktop session. Your messages arrive as from a teammate; approvals stay in the permission cards."

## What you see

- Your own typed messages in that session ("You (in session)").
- Claude's text, and each tool's name with a short summary. Tool output is never shown.
- Messages that came in over the pipe: "You (dashboard)" for the ones you sent from here, "Another session" for the rest.

The last 200 entries load when you open the panel, and new lines follow live. The head shows Working…, Needs you or Idle. There is no Stop button and no cost for these sessions.

## Sending

Enter sends. The message arrives the way one Claude session messages another: as a message from a teammate, at the next turn boundary.

Tick **Send now (interrupts)** to deliver it at once instead.

At most one message per second per session, 50,000 characters each.

Slash commands do not run from here: text sent to these sessions arrives as a plain message. The command list says so.

## Held messages

A session that runs without permission prompts (bypass mode) does not hand messages from outside to Claude. Claude Code holds them, and asks you to approve each one in that terminal. The dashboard does not say which permission mode it runs in, so its messages are held in that case.

The panel shows each one as **Held by the session, not delivered**, with what to do:

- approve it in the session itself, or
- let messages from outside through, with `crossSessionInbound` (below), or
- use Remote Control (below) and type on claude.ai instead. That is your own input, so nothing is held.

The dashboard never claims a permission mode to get past this check. It is a Claude Code safety control and stays your decision.

### crossSessionInbound

This Claude Code setting decides what happens to messages from outside a session: from the dashboard and from other Claude sessions.

| Value | What happens |
|-------|--------------|
| `"accept"` | Delivered to Claude at once, without asking. |
| `"hold"` | Held: you approve each one in the session. |
| `"refuse"` | Not delivered. |

Without the setting, Claude Code holds a message only when the sending side's permission mode does not match the session's, for example a dashboard message to a session in bypass mode.

To deliver dashboard messages without approving them in the terminal, put this in your **user** settings, `~/.claude/settings.json`. It then applies to every session:

```json
{
  "crossSessionInbound": "accept"
}
```

A repository's settings (`.claude/settings.json` or `.claude/settings.local.json` in the project) can only make this stricter, with `"hold"` or `"refuse"`. An `"accept"` there does not turn the check off, and a repository `"hold"` wins over your own `"accept"`. Managed settings from your organization win over both.

Any session on this computer that can reach the session's pipe and key can then message it without asking. That is why the dashboard never sets this for you.

## Questions with choices

When Claude asks a question with choices (AskUserQuestion) while a dashboard is open, the blue **Question for you** alert shows. Click it to open this panel with the question as a form. The question waits here until you answer it, even when you close the panel; the terminal and claude.ai show nothing meanwhile. Press Esc in the terminal to drop it there instead. See [Answer prompts from the dashboard](permission-hook.md#askuserquestion-choices-forms).

## Remote Control

To work with a terminal or desktop session from claude.ai or your phone, use Claude Code's Remote Control. It needs a claude.ai login.

- **Open session with Remote Control on** (you typed `/rc` in it, or started it with `claude --remote-control`): the panel shows **Open in Claude ↗**. It opens the session's claude.ai link in your default browser.
- **Open session without it:** the panel says to type `/rc` in that terminal or the Desktop app. The button shows up once it is on.
- **Closed session:** **Continue with Remote Control** opens a new terminal window that runs `claude --resume <id> --remote-control` in the folder the session ran in. It is a normal interactive session, so approvals and questions work there and on claude.ai. When its link is ready, the dashboard opens it once. Refused while the session is still open somewhere.

The link is read from `bridgeSessionId` in `~/.claude/sessions/<pid>.json`. It only goes to the page on the token-gated peer stream, never in `/api/state`.

## Close and Dismiss

- **Close session** (open terminal or desktop session): asks you to confirm, then ends that Claude Code process (`taskkill /T /F` on Windows, `SIGTERM` elsewhere). Anything typed but not sent in that terminal is lost.
- **Stop** (dashboard session): ends it. The session counts as closed at once.
- **Dismiss** (closed session): hides it from the list and the office. It comes back when it has new activity. Saved in `~/.claude/mcfactory-dismissed.json` (session id and time only, kept 60 days).

Routes, all `POST` with the chat token: `/api/peer/<id>/close`, `/api/peer/<id>/open`, `/api/peer/<id>/rc`, `/api/peer/<id>/dismiss`.

## Read-only

The input locks with a reason when sending fails, for example when the pipe does not answer ("Sending is not available for this session right now: read-only").

It unlocks when the session's status or process changes.

## How it works

`~/.claude/sessions/<pid>.json` names the session's local pipe (`\\.\pipe\LOCAL\cc-msg-<hex>` on Windows). The matching `<pid>.<hex>.key` file holds the session's peer token. To send, the server connects to the pipe, writes one authentication line and one message line, and closes.

The conversation is read from the session's transcript (`~/.claude/projects/**/<id>.jsonl`), and only while a panel is open.

The peer token is read from the key file for each send and is written only to that session's own pipe. It is never logged, never sent to the browser and never part of any HTTP response.

Only Windows has been tested. The pipe rule for macOS and Linux follows the same pattern but has not been checked.
