#!/bin/sh
# Resolves the host's Android libraries (Material and its runtime closure) once and writes libraries.lock.json; builds read only the lock.
set -eu
here=$(cd "$(dirname "$0")" && pwd)
out=${MARKLESS_ANDROID_OUT:-$here/.build}
mkdir -p "$out"
kotlinc -nowarn -include-runtime -d "$out/resolve-libraries.jar" "$here"/src/dev/markless/mobile/core/Json.kt "$here"/tools/dev/markless/mobile/tools/*.kt
java -cp "$out/resolve-libraries.jar" dev.markless.mobile.tools.ResolveLibrariesKt "$here/libraries.lock.json" com.google.android.material:material:1.13.0
