#!/bin/sh
# Builds the Hermes engine folder (<out>/classes.jar, <out>/jni/<abi>/*.so) from the artifacts pinned in hermes.lock.json and the NDK it names.
# Usage: build-hermes.sh <out> [abi...]   (default abi: arm64-v8a)
set -eu
here=$(cd "$(dirname "$0")" && pwd)
[ $# -ge 1 ] || { echo "usage: build-hermes.sh <out> [abi...]" >&2; exit 2; }
[ ! -e "$1" ] || [ -f "$1/classes.jar" ] || { echo "$1 exists and is not an engine folder; not replacing it" >&2; exit 2; }
rm -rf "$1"; mkdir -p "$1"; out=$(cd "$1" && pwd); shift
[ $# -ge 1 ] || set -- arm64-v8a
lock=$here/hermes.lock.json
sdk=${ANDROID_HOME:-$HOME/Library/Android/sdk}
cache=${MARKLESS_PROOF_CACHE:-$HOME/.cache/markless-proof}
field() { node -e 'const l=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));if(l.version!=="markless.android-engine/0")throw new Error(`${process.argv[1]} is ${l.version}`);console.log(l[process.argv[2]])' "$lock" "$1"; }
ndk_version=$(field ndk)
ndk=$sdk/ndk/$ndk_version
if [ ! -d "$ndk" ]; then
	sdkmanager=$sdk/cmdline-tools/latest/bin/sdkmanager
	[ -x "$sdkmanager" ] || sdkmanager=$(command -v sdkmanager)
	"$sdkmanager" --install "ndk;$ndk_version"
fi
toolchain=$(echo "$ndk"/toolchains/llvm/prebuilt/*)
w=$out.work
rm -rf "$w"; mkdir -p "$w/aar" "$w/classes" "$cache/maven"

# One line per artifact: sha256, url, classes (true/false), include dir or "-", libraries (comma separated).
node -e 'for(const a of JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).artifacts)console.log([a.sha256,a.url,a.classes,a.include??"-",a.libraries.join(",")].join("\t"))' "$lock" > "$w/artifacts.tsv"
includes=
while IFS="$(printf '\t')" read -r sha url classes include libraries; do
	file=$cache/maven/$sha.${url##*.}
	if [ ! -f "$file" ] || [ "$(shasum -a 256 "$file" | cut -d' ' -f1)" != "$sha" ]; then
		curl -fsSL -o "$file.part" "$url"
		got=$(shasum -a 256 "$file.part" | cut -d' ' -f1)
		[ "$got" = "$sha" ] || { echo "$url is sha256 $got, not the lock's $sha" >&2; rm -f "$file.part"; exit 1; }
		mv "$file.part" "$file"
	fi
	if [ "${url##*.}" = jar ]; then (cd "$w/classes" && unzip -q -o "$file" -x 'META-INF/*'); continue; fi
	dir=$w/aar/$sha
	patterns=
	[ "$classes" = true ] && patterns="classes.jar"
	[ "$include" != - ] && patterns="$patterns $include/*"
	for abi; do for library in $(echo "$libraries" | tr ',' ' '); do patterns="$patterns jni/$abi/$library"; done; done
	unzip -q -o "$file" $patterns -d "$dir"
	[ "$classes" = true ] && (cd "$w/classes" && unzip -q -o "$dir/classes.jar")
	[ "$include" != - ] && includes="$includes -I$dir/$include"
	for abi; do mkdir -p "$out/jni/$abi"; for library in $(echo "$libraries" | tr ',' ' '); do cp "$dir/jni/$abi/$library" "$out/jni/$abi/"; done; done
done < "$w/artifacts.tsv"

for abi; do
	case $abi in
		arm64-v8a) triple=aarch64-linux-android ;;
		armeabi-v7a) triple=armv7a-linux-androideabi; libdir=arm-linux-androideabi ;;
		x86_64) triple=x86_64-linux-android ;;
		x86) triple=i686-linux-android ;;
		*) echo "unknown abi $abi" >&2; exit 2 ;;
	esac
	[ "$abi" = armeabi-v7a ] || libdir=$triple
	cp "$toolchain/sysroot/usr/lib/$libdir/libc++_shared.so" "$out/jni/$abi/"
	"$toolchain/bin/clang++" --target="${triple}24" -std=c++20 -O2 -fPIC -fexceptions -frtti -shared \
		$includes "$here/hermes/glue.cpp" -L"$out/jni/$abi" -lhermesvm -ljsi -nostdlib++ -lc++_shared \
		-Wl,-soname,libmarkless_hermes.so -Wl,--build-id=none -Wl,-z,max-page-size=16384 \
		-o "$out/jni/$abi/libmarkless_hermes.so"
	"$toolchain/bin/llvm-strip" --strip-unneeded "$out/jni/$abi/libc++_shared.so" "$out/jni/$abi/libmarkless_hermes.so"
done

kotlinc -cp "$w/classes" -jvm-target 1.8 -nowarn -d "$w/classes" "$here/hermes/HermesEngine.kt"
find "$w/classes" -exec touch -t 198001010000 {} +
(cd "$w/classes" && find . -type f | LC_ALL=C sort | TZ=UTC zip -q -X -D "$out/classes.jar" -@)
rm -rf "$w"
ls -l "$out/classes.jar" "$out"/jni/*/*.so
