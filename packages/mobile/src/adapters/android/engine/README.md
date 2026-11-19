# Hermes engine for the Android host

An optional JavaScript engine for handlers that cannot be compiled to data. The host builds and runs without it; an app
that needs it packs the engine folder into its APK.

- `hermes/HermesEngine.kt`: `dev.markless.mobile.engine.HermesEngine`, one persistent Hermes runtime. `evaluate(source)`
  runs a script, runs every queued Promise job, and returns `String(completion value)`; a throw in the script or in a job
  becomes a `HermesException` whose message is `String(error)`. Constructing it loads the libraries and starts the runtime;
  loading the class does not. Main thread only.
- `hermes/glue.cpp`: the JNI glue over Hermes's public API (`hermes/hermes.h`, `jsi/jsi.h`), microtask queue on.
- `hermes.lock.json`: the pinned artifacts (Maven URL and sha256) and the NDK version.
- `build-hermes.sh <out> [abi...]`: builds `<out>/classes.jar` and `<out>/jni/<abi>/*.so` (default `arm64-v8a`).
  Installs the pinned NDK with `sdkmanager` when missing; downloads go to `~/.cache/markless-proof/maven/`. The output is
  byte-for-byte reproducible.

Pinned: Hermes from `com.facebook.react:hermes-android:0.82.1` (`libhermesvm.so`, headers, and the Java classes `Intl`
calls), `libjsi.so` and its headers from `com.facebook.react:react-android:0.82.1`, `libfbjni.so` and its Java classes
from `com.facebook.fbjni:fbjni:0.7.0`, `com.facebook.soloader:nativeloader:0.10.5` (fbjni's `HybridData` loads itself
through it), and `libc++_shared.so` from NDK 27.1.12297006 (the NDK Hermes 0.82 is built with). `classes.jar` does not
include the Kotlin stdlib; the host already ships it.

Sizes, arm64-v8a: `libhermesvm.so` 2,139,952 B, `libc++_shared.so` 1,292,904 B, `libjsi.so` 395,856 B, `libfbjni.so`
177,000 B, `libmarkless_hermes.so` 49,336 B, `classes.jar` 149,620 B. A test APK grew by 1,596,892 B compressed
(`zip -9`, before signing) with the folder packed.
