1. `native`: Expo and React Native developers already say "native tabs", "native sheet" and "native module" to mean the platform's real component rather than one drawn in JS, so `native.sheet` and `native.tabbar` read correctly with no explanation.
2. `system`: Apple and Android both call these "system" UI (the system sheet, the system menu, the system camera), and the word fits the web build too, where the browser supplies its own version.
3. `os`: It is short and says plainly that the operating system draws the component, but it fits the website build less well, because there the browser draws it.
Tools used: none
