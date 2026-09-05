# Security

## Report a vulnerability

Use [GitHub's private vulnerability reporting](https://github.com/ahmadhajji/findssh/security/advisories/new). Please do not open a public issue with exploit details or credentials. Include the affected release, reproduction steps using disposable data, and the potential impact. Only the latest release receives fixes; there is no guaranteed response time.

## Connection and data handling

FindSSH connects directly to the SSH/SFTP server. It does not send connection data through a cloud service or collect telemetry. Passwords and private-key passphrases are used in memory and are not saved by the app.

The first connection asks you to compare the server's SHA-256 fingerprint with a trusted source. Accepted fingerprints are remembered; changed keys are refused. This trust store is separate from OpenSSH's `known_hosts`.

Recent connection settings and trusted fingerprints are stored in `~/Library/Application Support/FindSSH/connections.json`. These settings can contain hostnames, usernames, and private-key paths. Do not attach that file to a public issue. To intentionally replace a server key, quit the app, back up the file, remove only that server's entry from `hosts`, then reconnect and verify the new fingerprint.

The Electron renderer is sandboxed and has no Node access. SSH and filesystem operations run in the main process behind validated IPC. Remote operations use the connected account's permissions; there is no privilege elevation. See the [usage guide](docs/USAGE.md) for deletion, transfer, and editor limitations.

## Distribution

Release apps have an ad hoc code signature. They have no Apple-issued developer identity and are not notarized by Apple. A valid ad hoc signature checks bundle integrity but does not authenticate the publisher. Download from this repository's [Releases](https://github.com/ahmadhajji/findssh/releases) and compare the published SHA-256 digest. See [installation and signing](README.md#first-launch-and-signing) for first-launch approval.
