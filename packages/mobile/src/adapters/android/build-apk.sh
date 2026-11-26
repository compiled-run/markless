#!/bin/sh
# Builds the throwaway proof APK from the SDK tools alone (aapt2, javac, kotlinc, d8, zipalign, apksigner; no Gradle), with the libraries in libraries.lock.json.
# Usage: build-apk.sh <payload.json> <out.apk> [style-export.json [font.ttf...]]
set -eu
here=$(cd "$(dirname "$0")" && pwd)
[ $# -ge 2 ] || { echo "usage: build-apk.sh <payload.json> <out.apk> [style-export.json [font.ttf...]]" >&2; exit 2; }
payload=$1; apk=$2; shift 2
sdk=${ANDROID_HOME:-$HOME/Library/Android/sdk}
bt=$sdk/build-tools/36.0.0
jar=$sdk/platforms/android-36/android.jar
kotlin_home=$(dirname "$(dirname "$(realpath "$(command -v kotlinc)")")")
stdlib=$kotlin_home/lib/kotlin-stdlib.jar
[ -f "$stdlib" ] || stdlib=$kotlin_home/libexec/lib/kotlin-stdlib.jar
w=${MARKLESS_ANDROID_OUT:-$here/.build}/apk
rm -rf "$w"; mkdir -p "$w/assets/markless" "$w/assets/markless-fonts" "$w/dex"
cp "$payload" "$w/assets/markless/payload.json"
if [ $# -ge 1 ]; then cp "$1" "$w/assets/markless/style.json"; shift; fi
if [ -n "${MARKLESS_CONFORMANCE_DIR:-}" ]; then mkdir -p "$w/assets/markless/conformance"; cp "$MARKLESS_CONFORMANCE_DIR"/*.json "$w/assets/markless/conformance/"; if [ -d "$MARKLESS_CONFORMANCE_DIR/engine" ]; then mkdir -p "$w/assets/markless/conformance/engine"; cp "$MARKLESS_CONFORMANCE_DIR"/engine/*.js "$w/assets/markless/conformance/engine/"; fi; fi
for font in "$@"; do cp "$font" "$w/assets/markless-fonts/$(shasum -a 256 "$font" | cut -d' ' -f1).ttf"; done
node "$here/../../harness/android-libraries.ts" "$w/libraries"
set --
while IFS= read -r archive; do [ -n "$archive" ] && set -- "$@" -R "$archive"; done < "$w/libraries/resources.txt"
"$bt/aapt2" link --manifest "$here/shell/AndroidManifest.xml" -I "$jar" -A "$w/assets" --min-sdk-version 31 --target-sdk-version 36 --auto-add-overlay "$@" --extra-packages "$(cat "$w/libraries/packages.txt")" --java "$w/r-java" -o "$w/base.apk"
javac --release 11 -nowarn -d "$w/r-classes" $(find "$w/r-java" -name '*.java')
libs=$(tr '\n' ':' < "$w/libraries/classpath.txt")
kotlinc -cp "$jar:$w/r-classes:$libs" -jvm-target 1.8 -nowarn -d "$w/classes.jar" $(find "$here/src" "$here/shell" -name '*.kt' -not -path '*/src/dev/dragon/*')
"$bt/d8" --release --min-api 31 --lib "$jar" --output "$w/dex" "$w/classes.jar" "$stdlib" $(find "$w/r-classes" -name '*.class') $(cat "$w/libraries/classpath.txt") 2>"$w/d8.log" || { cat "$w/d8.log" >&2; exit 1; }
(cd "$w/dex" && LC_ALL=C zip -q -j ../base.apk classes*.dex)
"$bt/zipalign" -p -f 4 "$w/base.apk" "$w/aligned.apk"
ks=${MARKLESS_ANDROID_KEYSTORE:-$here/.build/debug.keystore}
[ -f "$ks" ] || keytool -genkeypair -keystore "$ks" -storepass android -keypass android -alias markless -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=Markless Debug" >/dev/null 2>&1
"$bt/apksigner" sign --ks "$ks" --ks-pass pass:android --key-pass pass:android --ks-key-alias markless --out "$apk" "$w/aligned.apk"
echo "built $apk"
