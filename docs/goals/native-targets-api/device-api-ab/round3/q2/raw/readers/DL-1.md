1: "Get the app" appears only in the website build, where `platform === 'web'`. The search hint "Press ⌘K to search" appears only when `platform === 'macos'`, which I take to be the Mac app. Everyone else sees "Press Ctrl+K to search": the Windows app, the website, the iPhone app and the Android app. Showing a Ctrl+K hint on phones looks odd, but that is what the code does. "Add to Apple Wallet" appears only in the iPhone app (`'ios'`). "Swipe back to close" appears only in the Android app (`'android'`).

2: (b) They see "Press Ctrl+K to search". `platform` holds a single value, and the values it is compared against ('web', 'macos', 'ios', 'android') match the five builds, with 'web' as one of them. So I read it as "which build is running", not "which operating system the visitor has". In the website build `platform` is 'web' for every visitor, so `platform === 'macos'` is false even though the browser runs on a Mac. This is a guess from the naming, since there are no docs. If `platform` instead reported the visitor's operating system, then 'web' would never be a possible value, and the "Get the app" check would make no sense.

3: No. For the same reason, `platform` is 'web' in the website build, not 'ios', so "Add to Apple Wallet" is hidden. They see "Get the app" and the Ctrl+K hint instead.

4: 4

Tools used: none
