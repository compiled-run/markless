1. `native`: In React Native and Expo, "native" is the word we already use for the platform's real view, as opposed to one drawn in JS. `native.sheet` and `native.tabbar` read straight away as "the real iOS/Android one".
2. `system`: It says the OS supplies it, as in the system sheet, system menu or system camera, and it still makes sense on the web, where the browser's own control fills that role.
3. `os`: It's short and says plainly that the operating system draws it, not my code. It reads a bit oddly for the web build, though, which is why it comes third.
Tools used: none
