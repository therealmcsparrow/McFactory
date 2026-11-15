# Maintaining Crate Works Live

## Branches and checks

`main` is protected: changes arrive through pull requests, and the Validate checks must pass. Release tags (`v*`) are protected too: only maintainers can create them, and nobody can move or delete them.

## Release steps

1.  Update the version in `desktop/src-tauri/tauri.conf.json` and `desktop/src-tauri/Cargo.toml`. The release workflow refuses a tag that does not match `tauri.conf.json`.
2.  Move the **Unreleased** entries in [CHANGELOG.md](CHANGELOG.md) under the new version and date.
3.  Merge to `main` through a pull request.
4.  Tag the merge commit and push the tag:

    ```sh
    git tag v0.2.0
    git push origin v0.2.0
    ```

    A tag with a hyphen (`v0.2.0-beta.1`) becomes a pre-release.

5.  The release workflow runs the tests, builds the Windows installer, attests its build provenance and publishes the release with `SHA256SUMS.txt`.
6.  Check the release page, and run `gh attestation verify` on the downloaded installer.

## Dependencies

Dependabot opens update pull requests once a month for the desktop app's npm and cargo packages and for the GitHub Actions, after a 7-day cooldown. Actions are pinned to a full commit SHA, with the version in a comment.

## If a release is compromised

Follow [SECURITY.md](SECURITY.md#if-a-release-is-compromised).
