1: "Get the app" appears only when `platform.web` is true, so only website visitors see it. "Press ⌘K to search" appears wherever `platform.macOS` is true. That is certainly the Mac app, and maybe Mac web visitors too (see question 2). Everyone else sees "Press Ctrl+K to search": Windows, Android, iPhone and website visitors on non-Macs. It is odd that phone users get a keyboard hint, but the code does that. "Add to Apple Wallet" appears only when `platform.iOS` is true, which is certainly the iPhone app. "Swipe back to close" appears only when `platform.android` is true, which is certainly the Android app. I'm guessing that the flag names line up with the five builds.

2: c. The code doesn't let me tell. `platform` is a flat set of flags, and `web` sits next to `macOS`, `iOS` and `android`. That suggests each flag is one of the five builds and only one is true at a time. If so, the answer is (b) and they see "Ctrl+K", which would be wrong for a Mac user. But the flags could also describe the operating system, with `web` meaning "running in a browser". Then `web` and `macOS` would both be true, the answer is (a), and they see "⌘K". Nothing in the code says which it is. I lean slightly towards (b), which would make the "Ctrl+K" a bug.

3: It's the same ambiguity. If `iOS` means the iPhone app build, they don't see the button, because this is the website build. If `iOS` means the operating system, they do see it, next to "Get the app". The code can't settle this. My guess is that they don't see it.

4: 2/5

Tools used: none
