1. `native`: Expo and React Native developers already say "native" for the real platform component as opposed to one we draw ourselves (native stack, native tabs, native modules), so `native.sheet` and `native.tabbar` read correctly straight away.
2. `system`: It names the operating system's own UI (system sheet, system menu, system tab bar) and still makes sense in the web build, where the browser supplies the equivalent.
3. `os`: It is short and makes clear the OS draws the frame and handles the motion, but it fits less well in the website build and could be confused with an OS-version check.
Tools used: Read (once, only to open the prompt file as instructed; no other tools)
