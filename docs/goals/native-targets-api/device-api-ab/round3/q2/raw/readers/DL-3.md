1: The "Get the app" link shows only on the website, because the check is `platform === 'web'`. The "Press ⌘K to search" hint shows only when `platform === 'macos'`. Every other case sees "Press Ctrl+K to search": Windows, iPhone, Android and the website. "Add to Apple Wallet" shows only when `platform === 'ios'`, and "Swipe back to close" only when `platform === 'android'`. On iPhone and Android this hint about a keyboard shortcut is still rendered, which looks like a bug in the code. The other values are presumably 'windows', and the code never tests for that.

2: (b) They see "Press Ctrl+K to search". `platform` is a single value, and 'web' is one of its options next to 'macos' and 'ios'. That suggests it names which build is running, not which operating system the user has. In the website build it would be 'web', so the `'macos'` test is false even for a Mac user, and they get the wrong shortcut hint. This is my reading of the code, not something it states: no documentation confirms that `platform` cannot report the browser's operating system.

3: No. The website build has `platform === 'web'`, so the `'ios'` check fails. They see the "Get the app" link and the Ctrl+K hint instead. This rests on the same guess as question 2: `platform` names the build target.

4: 4

Tools used: none
