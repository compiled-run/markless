A1. `ui`: it's short and says what's inside, the interface components I build screens from, like SwiftUI or Compose UI.
A2. `components`: it's plain and self-explanatory, and it matches what I'd already call these in React Native.
A3. `primitives`: it tells me these are unstyled building blocks that supply behaviour and accessibility, and I style them myself.
B1. `ui`: `<ui.button>` reads naturally, and it pairs with the package name so the import line is obvious.
B2. `base`: it marks these as the basic standalone controls everything else builds on.
B3. `core`: it says these are the core single controls. The package name `core` is taken, but a namespace inside this package might not clash.
Tools used: none
