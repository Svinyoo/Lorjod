#!/bin/bash
set -euo pipefail
MOBILE_DIR="$(cd "$(dirname "$0")/.." && pwd)"
TEST_DIR="$(mktemp -d "${TMPDIR:-/tmp}/parkly-mobile-check.XXXXXX")"
trap 'rm -rf "$TEST_DIR"' EXIT
python3 "$MOBILE_DIR/scripts/check-project.py"
swiftc -module-cache-path "$TEST_DIR/cache" \
  "$MOBILE_DIR/iOS/Shared/ServerPolicy.swift" "$MOBILE_DIR/iOS/Tests/ServerPolicyTests.swift" \
  -o "$TEST_DIR/policy-tests"
"$TEST_DIR/policy-tests"
swiftc -frontend -parse "$MOBILE_DIR/iOS/Shared/ParklyApp.swift" "$MOBILE_DIR/iOS/Shared/BrowserModel.swift"
echo 'Swift UI syntax parsed. Full iOS compilation still requires Xcode and the iOS SDK.'
