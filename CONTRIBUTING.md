# Contributing to FindSSH

Check [open issues](https://github.com/ahmadhajji/findssh/issues) before starting. For a substantial feature, open an issue describing the user workflow and proposed scope first. Small fixes can go straight to a pull request.

Follow the [development guide](docs/DEVELOPMENT.md) to run the app and its tests. Use pnpm and strict TypeScript. Keep changes focused, preserve the existing main/renderer security boundary, and add tests for behavior changes. Use temporary SFTP fixtures rather than real servers or credentials in tests.

Before opening a PR, run:

```sh
pnpm check
pnpm format:check
pnpm test:e2e
```

On Linux, prefix the last command with `xvfb-run -a`. Include what changed, how you verified it, and screenshots for visible UI changes. Link the related issue with `Fixes #number` when appropriate. macOS CI checks both architectures and the packaged app.

Never include credentials, private hostnames, real server listings, or personal connection files in issues, screenshots, fixtures, or commits. Report security vulnerabilities through the [private reporting process](SECURITY.md).

Contributions are provided under the repository's [MIT license](LICENSE).
