# Releasing telec

## Install model

- Homebrew installs a prebuilt binary from GitHub Releases through [`buftio/homebrew-tap`](https://github.com/buftio/homebrew-tap).
- npm ships a small Node launcher plus bundled release binaries for the supported targets.
- Supported release targets today: `darwin/arm64` and `linux/x64`.

## One-time setup

1. Configure npm trusted publishing for `buftio/telec` and `.github/workflows/release.yml`.
2. Optionally add a repository secret named `HOMEBREW_TAP_TOKEN` in `buftio/telec` if you want the workflow to update `buftio/homebrew-tap` automatically.
3. If you add that token, make it able to push to `buftio/homebrew-tap`.
4. Optionally set the GitHub Actions variable `HOMEBREW_TAP_REPOSITORY` if you want a tap repo other than `buftio/homebrew-tap`.

## Release flow

1. Run `bun run check`.
2. Run `bun run release:prepare`.
3. Run `bun run validate:homebrew`.
4. Commit any release-related changes.
5. Create and push a tag like `v0.1.0`.
6. Wait for `.github/workflows/release.yml` to finish.

## What the workflow does

1. Verifies the tag matches `package.json` and the tagged commit is on `main`.
2. Runs checks and tests.
3. Builds `telec-darwin-arm64` on macOS.
4. Builds `telec-linux-x64` on Linux.
5. Packages tarballs and SHA-256 checksums.
6. Validates the generated Homebrew formula on macOS.
7. Publishes a GitHub Release for the tag.
8. Publishes `telec` to npm with provenance.
9. Updates `Formula/telec.rb` in the configured tap when `HOMEBREW_TAP_TOKEN` is present.
