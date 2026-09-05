FindSSH's first release brings a Finder-style file browser to SSH servers.

- Connect to IP addresses, DNS names and Tailscale hostnames with password, private key, SSH agent or keyboard-interactive authentication.
- Browse your home folder and filesystem root in sortable list or icon views. Navigate with breadcrumbs, history and Go to folder; filter filenames and show hidden files.
- Upload files and folders, including drag-in uploads. Download files and folders to your Mac. Copy or move between remote directories.
- Create folders, rename items, inspect file information and delete with confirmation.
- Read and edit UTF-8 text up to 2 MB, with atomic saves and conflict detection.

## Install

Download `FindSSH-0.1.0-arm64.dmg` for an Apple Silicon Mac, or `FindSSH-0.1.0-x64.dmg` for an Intel Mac. Open it and drag FindSSH into Applications. Requires macOS 13 or later.

This release is ad hoc signed and is not Apple-notarized. After attempting to open FindSSH, use System Settings > Privacy & Security > Open Anyway to approve this app. Do not disable Gatekeeper globally. If macOS cannot offer an override, build locally using the repository instructions.

ZIP builds and SHA-256 checksums are also included.

## Boundaries

FindSSH is an independent Finder-style SFTP app, not a complete replacement for Finder. This release has one server connection per window. It does not mount volumes, implement Finder tags, Quick Look for binary files, column/gallery views, remote Trash/undo, background transfer queues, or OpenSSH configuration directives such as ProxyJump. Server account permissions still apply. Symlinks can be browsed when they point to directories, but recursive transfers do not follow them. Existing destination names are rejected rather than overwritten or merged. Failed directory transfers may leave successfully copied items; individual incomplete files are cleaned up when the connection remains available. The editor's atomic saves require the OpenSSH POSIX rename extension and create a replacement file owned by the connected account.
