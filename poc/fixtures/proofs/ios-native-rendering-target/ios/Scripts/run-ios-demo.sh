#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
IOS_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
SIMULATOR_NAME="${1:-iPhone 17}"
APP_NAME="MarklessNativeProofDemo"
BUNDLE_ID="dev.markless.nativeproof.demo"
BUILD_DIR="$IOS_DIR/.build/interactive-demo"
APP_BUNDLE="$BUILD_DIR/$APP_NAME.app"

export DEVELOPER_DIR="${DEVELOPER_DIR:-/Applications/Xcode.app/Contents/Developer}"

SDK_PATH="$(xcrun --sdk iphonesimulator --show-sdk-path)"
ARCH="$(uname -m)"
TARGET="$ARCH-apple-ios17.0-simulator"

mkdir -p "$APP_BUNDLE"
cp "$IOS_DIR/DemoApp/Info.plist" "$APP_BUNDLE/Info.plist"
cp "$IOS_DIR/Sources/MarklessNativeProof/Resources/artifact.json" "$APP_BUNDLE/artifact.json"

xcrun --sdk iphonesimulator swiftc \
	-target "$TARGET" \
	-sdk "$SDK_PATH" \
	-emit-executable \
	-o "$APP_BUNDLE/$APP_NAME" \
	"$IOS_DIR/Sources/MarklessNativeProof/MarklessArtifact.swift" \
	"$IOS_DIR/Sources/MarklessNativeProof/MarklessNativeRuntime.swift" \
	"$IOS_DIR/DemoApp/DemoApp.swift" \
	-framework Foundation \
	-framework JavaScriptCore \
	-framework UIKit

/usr/bin/codesign --force --sign - "$APP_BUNDLE" >/dev/null

xcrun simctl boot "$SIMULATOR_NAME" >/dev/null 2>&1 || true
xcrun simctl bootstatus "$SIMULATOR_NAME" -b
xcrun simctl install "$SIMULATOR_NAME" "$APP_BUNDLE"
xcrun simctl launch "$SIMULATOR_NAME" "$BUNDLE_ID"
open -a Simulator

echo "Launched $APP_NAME on $SIMULATOR_NAME. Tap the native Count button in Simulator."
