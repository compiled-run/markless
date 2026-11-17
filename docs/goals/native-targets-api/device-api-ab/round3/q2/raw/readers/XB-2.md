1: "Get the app" appears only when `platform.os === 'web'`, so only people using the website see it. "Press ⌘K to search" appears only when `platform.os === 'macos'`, which I take to mean the Mac app. Everyone else sees "Press Ctrl+K to search": the website, the iPhone, Android and Windows apps. "Add to Apple Wallet" appears only when `platform.os === 'ios'`, which I take to mean the iPhone app. "Swipe back to close" appears only when `platform.os === 'android'`, the Android app. This is partly a guess. The code puts 'web' in the same list of values as 'macos', 'ios' and 'android', so I read `platform.os` as naming which of the five builds is running, not the visitor's real operating system.

2: (b) They see "Press Ctrl+K to search", and the Mac test is false for them. Because 'web' is one of the values `platform.os` can take, it seems to name the build. The website build reports 'web' even when the browser runs on a Mac, and the "Get the app" check only makes sense if that is true. This is a guess, because the code alone can't prove it. It also means Mac users of the website get a hint that is wrong for their keyboard.

3: No. For the same reason, on the website `platform.os` is 'web', not 'ios', so the Wallet button doesn't render. They do see "Get the app" and the Ctrl+K hint.

4: 3

Tools used: none
