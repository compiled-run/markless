A1. `ui`: it's the shortest, most obvious name. In Swift and Kotlin I already think of this layer as "the UI", like UIKit or Compose UI. It also sits clearly beside `device`, which covers the parts the system draws itself.
A2. `components`: it's the word React Native developers use for reusable building blocks. It says exactly what's inside, with no extra meaning attached.
A3. `kit`: it reads like UIKit or SwiftUI-style toolkits. It suggests a set of unstyled building blocks you put together yourself.
B1. `ui`: `<ui.button>` and `<ui.label>` read like `UIButton` and `UILabel`, so an iOS developer understands them instantly. It also matches the package name.
B2. `control`: "controls" is the iOS and Android word for buttons, switches and labels. `<control.button>` says it's a standalone interactive piece, not a family.
B3. `base`: it marks these as the plain, single building blocks that families are made from, as in "base views" on Android.
Tools used: Read, once, only to open the prompt file I was told to read; no other tools after that.
