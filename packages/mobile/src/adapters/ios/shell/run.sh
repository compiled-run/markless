#!/usr/bin/env bash
# Builds the shell for one component, installs it on the given simulator and runs one Maestro flow.
# usage: run.sh <udid> <flow.yaml> <component.tsrx|payload.json> [style.json fonts-dir]
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
udid="$1"; flow="$2"; shift 2
app="$("$here/build.sh" "$@" | tail -1)"
xcrun simctl terminate "$udid" dev.markless.shell.ioshost 2>/dev/null || true
xcrun simctl install "$udid" "$app"
maestro --device "$udid" test "$flow"
xcrun simctl launch "$udid" dev.markless.shell.ioshost >/dev/null
sleep 1
xcrun simctl io "$udid" screenshot "$here/build/$(basename "$flow" .yaml).png" >/dev/null
