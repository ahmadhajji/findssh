# Using FindSSH

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
