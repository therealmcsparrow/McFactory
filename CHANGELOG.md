# Changelog

All notable changes to this project are listed here.

## Unreleased

### Fixed

-   A new robot arm no longer appears inside another arm: it waits until its spot on the line is empty.

## 0.1.1 - 2026-11-15

### Fixed

-   The installer's name in a release has no spaces, so `sha256sum -c SHA256SUMS.txt` finds the downloaded file.

## 0.1.0 - 2026-11-15

### Added

-   The live factory view, chat with dashboard sessions, the global permission hook and the desktop app.
-   Chat with terminal and desktop sessions: messages arrive as from a teammate, held messages of bypass-mode sessions are shown as held.
-   **Refresh** button that rescans and reconnects without reloading the page.
-   **New session** dialog: folder field that follows the project, a folder browser, and opt-in **Skip permission prompts**.
-   Slash command list in the chat panel of dashboard sessions.
-   **Usage** view with plan limits (5-hour and weekly) and tokens and cost per day and hour, per model.
-   Right-click a transport robot and choose **Drive** to clear a jam.
-   Documentation folder, demo data generator (`dev/demo/make-demo.js`), GitHub workflows and project policies.

### Changed

-   Hall names are on a fixed sign on poles along the front of the roof (no closed-session count; a floating tag only shows "needs you"), the siren sits in the middle of the roof, and the chimney smoke is lighter so it shows on the dark floor.
-   Transport robots are easier to right-click: a bigger hit area, and the cursor changes over a robot.

### Fixed

-   The folder browser no longer shows when the New session dialog opens.
-   The close button of the Usage view is centred.
