1: The "Get the app" link shows only on the website build (`platform.os === 'web'`). "Press ⌘K to search" shows only when `platform.os === 'macos'`, which I take to be the Mac app. "Press Ctrl+K to search" shows everywhere else: the Windows app, the website, the iPhone app and the Android app. That means even the phone apps get a keyboard hint, which looks like an oversight. "Add to Apple Wallet" shows only in the iPhone app (`'ios'`). "Swipe back to close" shows only in the Android app (`'android'`). I'm assuming the five values are `web`, `macos`, `ios`, `android` and probably `windows`, one per build, and that only one is ever true.

2: (b) They see "Press Ctrl+K to search". Because `'web'` is one of the values `platform.os` can take, the field appears to name the build that is running, not the operating system underneath. In the website build `platform.os` is `'web'`, so `=== 'macos'` is false even though the browser is on a Mac. This is a guess from the code: nothing here rules out a design where `os` reports the real OS inside a browser. But in that case the `'web'` check would never be true, and the "Get the app" link would never show.

3: No. For the same reason, in the website build `platform.os` is `'web'`, not `'ios'`, so the Wallet button is not shown. They do see "Get the app" and the Ctrl+K hint.

4: 4. The fact that `'web'` sits next to the OS names strongly suggests one value per build, but without documentation it is still an inference.

Tools used: none
