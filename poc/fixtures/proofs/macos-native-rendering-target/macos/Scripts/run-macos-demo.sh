#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MACOS_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
VERIFY_LAUNCH=0

if [[ "${1:-}" == "--verify-launch" ]]; then
	VERIFY_LAUNCH=1
fi

APP_NAME="MarklessDesktopProofDemo"
BUILD_DIR="$MACOS_DIR/.build/interactive-demo"
APP_BUNDLE="$BUILD_DIR/$APP_NAME.app"
CONTENTS_DIR="$APP_BUNDLE/Contents"
MACOS_BUNDLE_DIR="$CONTENTS_DIR/MacOS"
RESOURCES_DIR="$CONTENTS_DIR/Resources"

export DEVELOPER_DIR="${DEVELOPER_DIR:-/Applications/Xcode.app/Contents/Developer}"

SDK_PATH="$(xcrun --sdk macosx --show-sdk-path)"

rm -rf "$APP_BUNDLE"
mkdir -p "$MACOS_BUNDLE_DIR" "$RESOURCES_DIR"
cp "$MACOS_DIR/DemoApp/Info.plist" "$CONTENTS_DIR/Info.plist"
cp "$MACOS_DIR/Sources/MarklessDesktopProof/Resources/artifact.json" "$RESOURCES_DIR/artifact.json"

xcrun --sdk macosx swiftc \
	-sdk "$SDK_PATH" \
	-emit-executable \
	-o "$MACOS_BUNDLE_DIR/$APP_NAME" \
	"$MACOS_DIR/Sources/MarklessDesktopProof/MarklessArtifact.swift" \
	"$MACOS_DIR/Sources/MarklessDesktopProof/MarklessDesktopRuntime.swift" \
	"$MACOS_DIR/DemoApp/DemoApp.swift" \
	-framework AppKit \
	-framework Foundation \
	-framework JavaScriptCore

/usr/bin/codesign --force --sign - "$APP_BUNDLE" >/dev/null

if [[ "$VERIFY_LAUNCH" == "1" ]]; then
	"$MACOS_BUNDLE_DIR/$APP_NAME" --verify-launch
	exit 0
fi

open "$APP_BUNDLE"

echo "Launched $APP_NAME. Click the native Count button in the desktop app."
