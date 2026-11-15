# Chat with terminal and desktop sessions

Sessions you started in the Claude CLI or the Claude desktop app get the same chat panel while they are live: a running process with a messaging pipe. The note under the input reads "Terminal or desktop session. Your messages arrive as from a teammate; approvals stay in the permission cards."

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

A session that runs without permission prompts (bypass mode) does not hand messages from outside to Claude. Claude Code holds them for you to review in that session.

The panel shows each one as **Held by the session, not delivered**, with what to do:

- review it in the session itself, or
- set `"crossSessionInbound": "accept"` in that session's settings.

The dashboard never claims a permission mode to get past this check. It is a Claude Code safety control and stays your decision.

## Read-only

The input locks with a reason when:

- the session closes ("Session closed: read-only"), or
- sending fails, for example when the pipe does not answer ("Sending is not available for this session right now: read-only").

It unlocks when the session's status or process changes.

## How it works

`~/.claude/sessions/<pid>.json` names the session's local pipe (`\\.\pipe\LOCAL\cc-msg-<hex>` on Windows). The matching `<pid>.<hex>.key` file holds the session's peer token. To send, the server connects to the pipe, writes one authentication line and one message line, and closes.

The conversation is read from the session's transcript (`~/.claude/projects/**/<id>.jsonl`), and only while a panel is open.

The peer token is read from the key file for each send and is written only to that session's own pipe. It is never logged, never sent to the browser and never part of any HTTP response.

Only Windows has been tested. The pipe rule for macOS and Linux follows the same pattern but has not been checked.
