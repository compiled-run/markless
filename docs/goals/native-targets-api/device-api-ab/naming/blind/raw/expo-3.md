1. `native`: Expo and React Native developers already say "native" for the platform's own component, as opposed to a JS-drawn one, so `native.sheet` and `native.tabbar` read correctly with no explanation.
2. `system`: Apple and Google both call these "system" UI (system sheet, system menu, system tab bar), and the name also fits the web build, where the browser supplies its own version.
3. `os`: It is short and says the operating system draws it, but it reads less naturally for the website build, where the browser draws it.
Tools used: none
