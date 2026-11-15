# Contributing to Crate Works Live

Thank you for helping. This page covers how to report a problem, suggest an idea, set up the project and send a change. The community rules are in the [Code of Conduct](CODE_OF_CONDUCT.md).

## Report a bug

Open a [new issue](https://github.com/therealmcsparrow/McFactory/issues/new/choose) and choose **Bug report**. Use it only for a problem you can reproduce on the latest version.

## Suggest an idea

For a question or a rough idea, start a [discussion](https://github.com/therealmcsparrow/McFactory/discussions). If you know exactly what should change, open a **Feature request** issue instead.

## Report a security problem

Do not open a public issue or discussion for a security problem. Report it privately: open the **Security** tab and choose **Report a vulnerability**. [SECURITY.md](SECURITY.md) lists what to include and when to expect a reply.

## Set up the project

You need Node.js 22 or later. The server uses Node's built-in modules only, so there is nothing to install.

1.  Clone the repository.
2.  Run `node server.js` and open http://127.0.0.1:4545.
3.  Run `npm test` before you open a pull request.

To work on the page without your own sessions showing, use demo data:

```sh
node dev/demo/make-demo.js
node server.js --root dev/demo/out/.claude/projects --no-hook --no-statusline --port 4600
```

The desktop app needs Rust and Node.js 25.5 or later. See [Desktop app](documentation/desktop-app.md).

## Rules for changes

-   **No dependencies in the server.** `server.js` and the page files use Node and browser built-ins only (the page loads three.js from jsDelivr at a fixed version, and its fonts from Google Fonts; add no other outside requests).
-   **Privacy first.** For sessions the dashboard did not start, only numbers, model names, tool names, titles and subagent descriptions may reach the browser. Read [Security and privacy](documentation/security-and-privacy.md) before you change what the server sends.
-   **Secrets stay put.** The page token and the peer tokens of sessions are never logged, never put in a response that does not need them, and never sent anywhere else.

## Checks on GitHub

The Validate workflow runs a syntax check and `npm test` on Ubuntu and Windows with Node 22 and 26, and `npm audit` for the desktop app. A pull request can only be merged when these checks are green.

## Tests and documentation

Add or update tests for every change in behaviour. In the same pull request, update the pages in [documentation](documentation/README.md) that the change affects, and add a line to the [CHANGELOG](CHANGELOG.md).

## Screenshots

Anything you attach to an issue or pull request is public. Take screenshots with the demo data above, never with your own sessions: their titles, folder names and branch names would show.

## Pull requests

Open pull requests against `main`. Keep each pull request to one change where you can.

## Licence

Crate Works Live is released under the MIT Licence (see [LICENSE](LICENSE)). By sending a contribution, you agree that it is released under the same licence.
