#!/bin/bash
set -euo pipefail

if [[ $# -ne 1 || ! -d "$1" || "$1" != *.app ]]; then
  echo "Usage: bash scripts/verify-mac-signature.sh /path/to/FindSSH.app" >&2
  exit 1
fi

codesign --verify --deep --strict --verbose=2 "$1"
signature_details=$(codesign --display --verbose=4 "$1" 2>&1)
echo "$signature_details"
if ! grep -qx 'Signature=adhoc' <<< "$signature_details"; then
  echo "Expected an explicit ad hoc signature for this release policy." >&2
  exit 1
fi
