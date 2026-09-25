#!/bin/sh
set -eu
ANDROID_PROJECT_DIR="$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd)"
TEST_OUTPUT_DIR="$(mktemp -d "${TMPDIR:-/tmp}/parkly-android-check.XXXXXX")"
trap 'rm -rf "$TEST_OUTPUT_DIR"' EXIT
JAVAC=javac
JAVA=java
if [ -n "${JAVA_HOME:-}" ]; then
    JAVAC="$JAVA_HOME/bin/javac"
    JAVA="$JAVA_HOME/bin/java"
fi
"$JAVAC" -encoding UTF-8 -d "$TEST_OUTPUT_DIR" \
    "$ANDROID_PROJECT_DIR/app/src/main/java/com/parkly/mobile/ServerPolicy.java" \
    "$ANDROID_PROJECT_DIR/app/src/test/java/com/parkly/mobile/PolicyChecks.java"
"$JAVA" -cp "$TEST_OUTPUT_DIR" com.parkly.mobile.PolicyChecks
