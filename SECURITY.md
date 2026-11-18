# Security policy

## Supported versions

Only the latest release, and the latest commit on `main`, receive security fixes. Update before you report a problem.

## Status of this project

McFactory is free software under the MIT licence. It is non-commercial open source software under the EU Cyber Resilience Act (CRA). It is not sold. If that ever changes, this page changes with it.

## Scope

McFactory is a local tool: the server listens on `127.0.0.1` only. [Security and privacy](documentation/security-and-privacy.md) describes what it accepts, what it shows and what it writes.

In scope:

-   **Reaching the server from elsewhere.** Another computer, another website in your browser, or DNS rebinding that gets a response from the server.
-   **The page token.** Starting, steering or answering a session, listing folders or refreshing without the token of the current run.
-   **Message and command injection.** Text from the dashboard that ends up on Claude's command line, in a shell, or in a session other than the one it was sent to.
-   **Data leaving its place.** Message text, tool input or output, or file contents of sessions the dashboard did not start appearing in `/api/state`, `/api/usage` or a log; the peer token of a terminal or desktop session appearing anywhere but that session's own pipe.
-   **Files written** outside the ones listed in [What is written to your disk](documentation/security-and-privacy.md#what-is-written-to-your-disk).
-   **The desktop app** and its installer from the releases page.

Out of scope:

-   Other programs running as your own user on the same computer. They can read your Claude Code files directly. The global hook endpoints have no secret for this reason; see [The global hook](documentation/security-and-privacy.md#the-global-hook).
-   Sessions you started with **Skip permission prompts**. Claude runs every tool without asking there, as the dialog warns.
-   Faults in Claude Code itself.

## Reporting a vulnerability

Please do not open a public issue for a security problem.

Report it privately through GitHub: open the **Security** tab of this repository and choose **Report a vulnerability** (private vulnerability reporting). Include the commit or app version, your OS and Node version, and steps to reproduce.

We handle reports on a best-effort basis. We aim to reply within 7 days. Confirmed issues are fixed in a new release, and the advisory is published once a fix is available. The report is credited unless you prefer otherwise.

## If a release is compromised

Release tags are protected, and releases are built by the release workflow with build provenance attestations. If we find out that a published release has been tampered with, or that it contains a vulnerability that is being exploited, we do the following.

Within 24 hours of confirming it:

-   We publish a security advisory in this repository.
-   We add a note to the release notes of the affected release.
-   We put a banner at the top of the README that names the affected versions and what to do.

Within 72 hours of confirming it, we send a voluntary report to the Dutch national CSIRT (the NCSC-NL), or through the single reporting platform that the EU sets up under the CRA once it is open. The report is voluntary because this project is non-commercial open source software and has no reporting duty under the CRA.

To check that a downloaded installer is a genuine release, run:

```sh
gh attestation verify <installer>.exe --repo therealmcsparrow/McFactory
```

and compare its SHA-256 with `SHA256SUMS.txt` on the release page.

These times start when we have confirmed the problem. This project is run by one maintainer, so they are targets, not guarantees.
