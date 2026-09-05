# Mac build and installation verification

The user authorized creating FindSSH, publishing a GitHub release, and using their MacBook for build and installation testing. The implementation originated on the Linux server. The server session could list the Mac project but had no callable task-creation or handoff tool.

Repository: https://github.com/ahmadhajji/findssh
Mac project seen by Codex: `/Users/ahmadhajji/Documents/ChatGPT/findssh`

1. Inspect the existing Mac checkout and its Git state. Preserve all local work. Fetch `origin/main` or clone to a fresh folder if the checkout belongs to something else.
2. Install dependencies with `pnpm install --frozen-lockfile` using Node 22. Run `pnpm check` and `pnpm test:e2e` on macOS.
3. Download the latest release DMG matching `uname -m`, or build with `pnpm package:mac --arm64` or `--x64`. Compare downloaded hashes with the release checksums.
4. Open the DMG, install into Applications without overwriting an unknown existing app, and launch FindSSH. Verify unsigned-app approval behavior. Do not disable Gatekeeper globally. If an Apple Developer identity is available, report it by name only and configure signing/notarization without exposing credentials.
5. Test with a user-selected disposable folder on the intended server. Connect using its IP or Tailscale hostname. Verify fingerprint acceptance, password/key prompts, home/root navigation, list/icon views, native menus, multi-selection, upload/download, rename, text editing, copy/move and confirmed deletion. Do not delete real user files for a smoke test.
6. Check Mac window controls, keyboard shortcuts, light/dark appearance, focus, drag-in uploads from Finder and native directory pickers. Test the installed app as well as development mode. Confirm operation errors are shown without losing the connection.
7. Fix any failures on a focused branch, review the changes, pass CI and merge. Publish a patch release if an installer fix is needed. Report the actual installed version and tests completed.

The first release is ad hoc signed without an Apple Developer identity. GUI tests on hosted macOS runners do not prove installation or Gatekeeper behavior on the user's MacBook.
