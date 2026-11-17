#!/usr/bin/env bash
# Throwaway simulator shell: builds MarklessShell.app from a .tsrx (or payload JSON), an optional Dragon style export and its fonts.
# usage: build.sh <component.tsrx|payload.json> [style.json fonts-dir]
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
package="$(dirname "$here")"
input="$1"; style="${2:-}"; fonts="${3:-}"
out="$here/build"
app="$out/MarklessShell.app"
sdk="$(xcrun --sdk iphonesimulator --show-sdk-path)"
target="arm64-apple-ios18.0-simulator"
rm -rf "$out" && mkdir -p "$app/fonts"
common=(-target "$target" -sdk "$sdk" -swift-version 6 -O -I "$out" -L "$out")
xcrun --sdk iphonesimulator swiftc "${common[@]}" -parse-as-library -static -emit-library -emit-module -module-name MarklessCore \
	-emit-module-path "$out/MarklessCore.swiftmodule" -o "$out/libMarklessCore.a" "$package"/Sources/MarklessCore/*.swift
xcrun --sdk iphonesimulator swiftc "${common[@]}" -parse-as-library -static -emit-library -emit-module -module-name MarklessMobile \
	-emit-module-path "$out/MarklessMobile.swiftmodule" -o "$out/libMarklessMobile.a" "$package"/Sources/MarklessMobile/*.swift
xcrun --sdk iphonesimulator swiftc "${common[@]}" -parse-as-library -module-name MarklessShell -lMarklessCore -lMarklessMobile \
	-o "$app/MarklessShell" "$here/App.swift"
case "$input" in
	*.tsrx) node "$here/payload.ts" "$input" > "$app/payload.json" ;;
	*) cp "$input" "$app/payload.json" ;;
esac
if [ -n "$style" ]; then
	cp "$style" "$app/style.json"
	for font in "$fonts"/*.ttf "$fonts"/*.otf; do [ -e "$font" ] || continue; cp "$font" "$app/fonts/$(shasum -a 256 "$font" | cut -d' ' -f1).${font##*.}"; done
fi
cp "$here/Info.plist" "$app/Info.plist"
codesign --force --sign - "$app" >/dev/null
echo "$app"
