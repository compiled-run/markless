1. `native`: Swift and Kotlin developers already say "native" for the platform's real UIKit/SwiftUI or Compose control rather than a custom-drawn one, so `native.sheet` reads as "the real system sheet".
2. `system`: Apple and Google both describe built-in UI as "system" UI (system sheet, system menu, system camera), so this name says the OS supplies the component.
3. `os`: It is short and tells you the operating system draws it, as in `os.tabbar` or `os.menu`, which separates it from the headless families you draw yourself.
Tools used: none
