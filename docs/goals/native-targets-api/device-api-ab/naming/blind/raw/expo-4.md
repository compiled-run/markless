1. `native`: Expo and React Native developers already say "native" to mean the platform's own component as opposed to one drawn in JS, so `native.sheet` and `native.tabbar` read straight away as "the real iOS/Android one".
2. `system`: It names the operating system's own UI, like the system sheet, system menu or system camera, and it still makes sense for the browser's built-in version on the web.
3. `os`: It is short and clearly means "whatever the operating system provides" (`os.sheet`, `os.camera`), though it reads less naturally for the web build.

Tools used: none
