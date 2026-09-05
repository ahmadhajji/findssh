# Mac installation verification

## Verify a download

Download the DMG or ZIP matching your Mac and its `SHA256SUMS-*.txt` from the same [release](https://github.com/ahmadhajji/findssh/releases). In Terminal, run `shasum -a 256` on the downloaded file and compare the digest with its entry in the manifest. The manifest includes a `release/` prefix from CI; it does not need to match your local folder name.

After copying FindSSH to Applications, check the app bundle:

```sh
codesign --verify --deep --strict --verbose=2 /Applications/FindSSH.app
codesign --display --verbose=4 /Applications/FindSSH.app
```

Expect a valid signature and `Signature=adhoc`. An absent TeamIdentifier is normal for ad hoc signing. This verifies bundle integrity; it does not prove developer identity or Apple notarization. Gatekeeper may reject the app until you approve it. Follow the [first-launch instructions](../README.md#first-launch-and-signing).

The manually dispatched **Verify release** GitHub Actions workflow downloads the selected release on both native architectures, checks the DMG and ZIP hashes, and verifies the app signature inside each. Leave the tag blank to check the latest release. It never changes the published assets.

## Installation checklist

Use a disposable directory on a server you control. Keep valuable files outside the test directory.

- Install the DMG into Applications and launch the installed app. Record the app version, Mac architecture, macOS version, and any first-launch approval required.
- Connect by IP or DNS/Tailscale name. Verify the fingerprint and password/key prompts.
- Browse home and root, switch list/icon views, sort, select multiple items, and show hidden files.
- Upload and download files and folders. Check their contents. Test drag-in upload and native destination pickers.
- Create a folder, rename, copy/move remote files, edit a text file, and delete test files with confirmation.
- Check native menus, keyboard shortcuts, light/dark appearance, focus, and window controls.
- Edit a file and cancel Quit. Confirm the editor still works. Disconnect the server and confirm the draft remains available.
- Confirm inaccessible paths and rejected operations show useful errors.

Record failures in a GitHub issue with sanitized reproduction steps. Automated tests on hosted macOS runners cover development and packaged builds, but do not replace this downloaded-app installation check.
