#!/bin/sh
# The JVM conformance test: the interpreter core (no android.*) against the conformance vectors. Usage: test-jvm.sh [vector dir...]
set -eu
here=$(cd "$(dirname "$0")" && pwd)
out=${MARKLESS_ANDROID_OUT:-$here/.build}
mkdir -p "$out"
[ $# -gt 0 ] || set -- "$here/../../../conformance"
kotlinc -nowarn -include-runtime -d "$out/conformance.jar" "$here"/src/dev/markless/mobile/core/*.kt "$here"/test/dev/markless/mobile/test/*.kt
java -cp "$out/conformance.jar" dev.markless.mobile.test.ConformanceTestKt "$@"
