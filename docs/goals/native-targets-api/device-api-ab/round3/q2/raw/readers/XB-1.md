1: "Get the app" link: only people using the website, where `platform.os === 'web'`. "Press ⌘K to search": only the Mac app (`'macos'`). "Press Ctrl+K to search": everyone else, meaning the iPhone, Android and Windows apps and the website. Showing a keyboard hint on phones looks like an oversight, but the code does it. "Add to Apple Wallet": only the iPhone app (`'ios'`). "Swipe back to close": only the Android app (`'android'`).

2: (b) They see "Press Ctrl+K to search". `platform.os` is a single string, and `'web'` is one of its values alongside `'macos'` and `'ios'`. That suggests it names the build the app is running as, not the computer underneath, so on the website it is `'web'` and the Mac test is false. This is an inference from the code; nothing in it states what `os` reports inside a browser. A consequence is that Mac users on the website get the wrong shortcut hint, since in Safari on a Mac the shortcut would be ⌘K.

3: No. By the same reasoning, `platform.os` is `'web'` on the website, so the `'ios'` check is false. Only the iPhone app shows the Wallet button. They would see "Get the app" instead. This is also an inference.

4: 4. The fact that `'web'` sits next to the operating-system values strongly suggests `os` names the build. But `os` usually means operating system, and with no documentation I can't rule out a browser on a Mac reporting `'macos'`.

Tools used: none
