# Development

## Setup and checks

Use Node.js 22.12 or later in the Node 22 series and pnpm 10.30.3.

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm format:check
pnpm test:e2e
pnpm dev
```

`pnpm check` runs ESLint, strict TypeScript checks, unit/integration tests, and a production build. Desktop tests run the actual Electron app through Playwright. SSH tests start an ephemeral localhost server with generated host keys and temporary fixtures, then use the system's real OpenSSH `sftp-server`. No production server or credentials are needed.

On macOS the subsystem is `/usr/libexec/sftp-server`. On Debian/Ubuntu, install `openssh-sftp-server` and `xvfb`, then use `xvfb-run -a pnpm test:e2e`. The test-only `--no-sandbox` launch flag is not used in normal app launches.

## Repository map

| Path                  | Responsibility                                                        |
| --------------------- | --------------------------------------------------------------------- |
| `src/main/session.ts` | SSH connections, fingerprint trust, authentication, SFTP operations   |
| `src/main/index.ts`   | Native windows, menus, dialogs, application lifecycle, IPC validation |
| `src/main/preload.ts` | Narrow bridge between main and renderer                               |
| `src/renderer/`       | React UI, connection form, file browser, editor, styles               |
| `src/shared/`         | Shared data types and file helpers                                    |
| `tests/`              | Unit tests, real SFTP fixtures, desktop scenarios                     |
| `scripts/`            | Build, icon generation, signature verification                        |
| `assets/`             | Original application icon source and raster asset                     |
| `docs/`               | User, developer, and release documentation                            |

Electron owns SSH, local file access, and native dialogs in the main process. The React renderer uses TanStack Table and communicates through the preload bridge. It runs with context isolation, sandboxing, no Node access, and a restricted Content Security Policy. Main-process IPC validates both sender and arguments. See [SECURITY.md](../SECURITY.md).

## Build installers

On a Mac, run one of:

```sh
pnpm package:mac --arm64
pnpm package:mac --x64
```

DMG and ZIP output goes to `release/`. The package explicitly sets `mac.identity` to `"-"`, which requests [ad hoc signing](https://www.electron.build/v26/docs/features/code-signing/code-signing-mac/). No certificate, Apple account, or notarization credential is needed. Keep `private: true` in package.json: this is a desktop app, not an npm package; the source repository is public.

Verify the resulting app with `bash scripts/verify-mac-signature.sh release/mac-arm64/FindSSH.app`. Intel builds use `release/mac/FindSSH.app`. Set `FINDSSH_EXECUTABLE` to the absolute path of `FindSSH.app/Contents/MacOS/FindSSH` when running `pnpm exec playwright test` to exercise a packaged build.

## CI and releases

Pull requests and main run checks and desktop tests on Linux and macOS. Linux repeats the desktop scenarios three times. Both native Mac architectures package the app, verify its ad hoc signature, and run desktop tests against it.

To publish a version:

1. Update the version in `package.json`, `CHANGELOG.md`, `docs/RELEASE.md`, and README download links in a reviewed PR.
2. Merge after CI passes. Tag that main commit with the matching `vX.Y.Z` version and push the tag.
3. The Release workflow builds and tests both Mac architectures, verifies signatures, and publishes DMG/ZIP installers and SHA-256 manifests only after both jobs succeed.
4. Run the Verify release workflow with the tag to validate the published downloads. Follow the [Mac installation checklist](MAC-VERIFICATION.md) on a real Mac.

Hosted packaged-app checks do not establish Gatekeeper behavior on a downloaded, quarantined app. Developer ID signing and Apple notarization are not configured.
