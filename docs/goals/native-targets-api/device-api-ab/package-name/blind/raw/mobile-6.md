A1. `ui`: It's the short, obvious name for a cross-platform component kit that comes with no styling, the same way you'd say "the UI layer" in SwiftUI or Compose talk.
A2. `components`: It says exactly what's inside, and there's no clash with `device`, where the real system-drawn pieces live.
A3. `primitives`: Mobile and React Native developers already use "primitives" for unstyled building blocks you style yourself.
B1. `ui`: `<ui.button>` and `<ui.label>` read naturally and match a package called `ui`, so single pieces sit beside families like `tabs` without a second name to learn.
B2. `base`: These are the basic pieces that everything else is built from, and `<base.button>` is clearly not the phone's own system button.
B3. `core`: In Kotlin and Swift modules, "core" usually means the basic building blocks. But `@markless/core` is already a package name, so `<core.button>` could confuse people.
Tools used: none (apart from the one Read call that opened this prompt file, as instructed)
