A1. `ui`: it's short and obvious, and as a mobile dev I'd read `@markless/ui` as "the component library" right away, just like SwiftUI or Compose UI.
A2. `components`: it says plainly what's inside, so nobody has to guess, though it's long to type in every import.
A3. `headless`: anyone coming from React Native or the web knows it means "behaviour and accessibility, no styling," which is exactly what this package is.
B1. `ui`: `<ui.button>` reads naturally as "a plain UI piece," and it sits apart from `native.*`, which is the system-drawn stuff.
B2. `base`: these are the basic building blocks that aren't part of any family, and `<base.button>` reads cleanly.
B3. `core`: it says "the fundamental pieces," but the `core` package already exists, so it could get confused with that.
Tools used: none
