# FindSSH

A Finder-style macOS file manager for SSH servers. Connect to a server, browse over SFTP, and transfer files between your Mac and the server. No server-side installation or cloud account is needed.

FindSSH is independent software. It uses original artwork and does not include Apple's Finder code or assets.

## Install

Get the DMG from [Releases](https://github.com/ahmadhajji/findssh/releases).

- Apple Silicon, including M1 and later: choose `arm64`.
- Intel Mac: choose `x64`.

Open the DMG and drag FindSSH into Applications. macOS 13 or later is required. The first release is ad hoc signed and not Apple-notarized. Attempt to open the app, then approve it in System Settings > Privacy & Security > Open Anyway. Do not disable Gatekeeper globally. If macOS does not allow the override, use the local build below.

## Connect

Enter a hostname, IP address or Tailscale DNS name, your server username and SSH port. Tailscale must already be connected on the Mac for private tailnet addresses. FindSSH uses the SSH agent if available, then your default `~/.ssh/id_ed25519`, `id_rsa` and `id_ecdsa` keys. You can choose a private key explicitly. Encrypted keys prompt for a passphrase. Password and keyboard-interactive login are supported.

Compare the first connection's SHA-256 fingerprint with your server before accepting. FindSSH remembers it and refuses changed keys. Trust is stored separately from OpenSSH's `known_hosts`, in `~/Library/Application Support/FindSSH/connections.json`. If you intentionally rotate a server key, quit the app, back up this file and remove only that server's entry from `hosts`, then reconnect and verify the new fingerprint. Passwords and passphrases are never persisted.

The initial folder is the remote account's home. The sidebar also opens `/`. You can browse everything that account is allowed to access; FindSSH does not elevate permissions.

## File operations

Use list or icon view; click column headings to sort. Double-click folders to navigate and text files to edit. Command-click selects multiple items, Shift-click selects a range, and arrow keys change the selection. Right-click for file actions. The toolbar handles uploads, downloads and folder creation. Drag files or folders from Finder into the browser to upload them. Downloads use a native destination-folder picker.

Copy and Cut in the context menu put remote paths on FindSSH's internal clipboard. Navigate to another remote directory and choose Paste here. These operations also use Command-C/X/V while the file browser is focused. Copy streams files through the Mac; it does not execute a shell command on the server.

Existing destinations are rejected. Folder transfers stop at the first error and may leave completed items in the new folder. Individual files transfer through temporary names, which are removed on error when the server remains reachable. Deletion is permanent and always asks for confirmation. It does not use Mac Trash.

The built-in editor accepts UTF-8 text up to 2 MB. Command-S saves to the server. Saves check for external changes and require the OpenSSH POSIX rename extension for atomic replacement. Replacement preserves basic permission bits but not the original owner, ACLs, hard links or extended attributes. Close the editor to discard changes with confirmation. Download binary files to open them in a local app.

## Keyboard shortcuts

| Action                          | Shortcut                     |
| ------------------------------- | ---------------------------- |
| Connect                         | Command-K                    |
| New folder                      | Command-Shift-N              |
| Upload files                    | Command-U                    |
| Download selected               | Command-Shift-D              |
| Rename selected                 | Return                       |
| Open selected text/folder       | Space                        |
| Delete selected                 | Command-Delete               |
| Icon / list view                | Command-1 / Command-2        |
| Show hidden files               | Command-Shift-.              |
| Go to folder                    | Command-Shift-G              |
| Home / parent                   | Command-Shift-H / Command-Up |
| Back / forward                  | Command-[ / Command-]        |
| Refresh                         | Command-R                    |
| Select all / copy / cut / paste | Command-A / C / X / V        |

## Build on a Mac

Install Node.js 22 and pnpm 10.30.3, then run:

```sh
git clone https://github.com/ahmadhajji/findssh.git
cd findssh
pnpm install --frozen-lockfile
pnpm check
pnpm test:e2e
pnpm dev
pnpm package:mac --arm64
```

Use `--x64` for Intel. Output goes to `release/`. A local build can be run directly with `pnpm dev`. No Apple Developer account is needed for local development.

## Development and tests

The app uses Electron, strict TypeScript, React, TanStack Table and ssh2. All SSH, local file access and native dialogs run in the main process. The renderer is sandboxed with context isolation, no Node access, a restricted CSP and a narrow IPC bridge. Main-process IPC validates the sender and arguments. No telemetry or analytics is included.

`pnpm check` runs lint, typecheck, unit/integration tests and a production build. Integration tests start an ephemeral SSH server on localhost and use the system's real OpenSSH `sftp-server`. They use temporary fixture files and generated host keys, without production credentials. On Linux, install `openssh-sftp-server` and `xvfb`. Run `xvfb-run -a pnpm test:e2e` for desktop tests. On macOS, run `pnpm test:e2e` directly. Playwright's `--no-sandbox` launch flag is confined to test code; normal launches retain Electron sandboxing.

Pull requests run Linux checks and desktop tests plus a macOS build and desktop test. Pushing a version tag such as `v0.1.0` runs both Mac architectures, then publishes DMG/ZIP installers and checksums only after both succeed. Release code signing and notarization must be configured with an Apple Developer identity before distributing a signed release.

## Current scope

The app provides the core remote file-manager workflow. It is not an exact Finder clone. Column/gallery view, tabs, Finder tags, binary previews, volume mounting, remote Trash/undo, SSH config aliases/ProxyJump, recursive server search and resumable transfer queues are not implemented. Directory symlinks can be opened; transfers refuse symlinks to avoid unintended traversal. There is one active connection per app instance.

See [Mac verification handoff](docs/MAC-HANDOFF.md) and [release notes](docs/RELEASE.md).
