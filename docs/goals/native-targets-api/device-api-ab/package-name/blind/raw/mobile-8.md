A1. `ui`: It's what I'd call it in Swift or Kotlin: the UI kit you build screens from. It's short, `<tabs.root>` reads naturally next to it, and it doesn't suggest the phone's own system controls.
A2. `components`: Plain and obvious to any React Native developer: the package of components you import. It's longer, but you can't misread it.
A3. `headless`: The precise term for "behaviour and accessibility, no styling". iOS and Android developers know it less well, but React Native developers who've used headless libraries get it at once.
B1. `ui`: `<ui.button>` and `<ui.label>` read like a design-system namespace. It's short, and it's clearly not `native.*`, so you know you're drawing it yourself.
B2. `base`: These are the base building blocks under the families, and `<base.separator>` makes it clear they're the simple, standalone pieces.
B3. `core`: "The core controls" is how I'd talk about button, label and separator. It does clash in your head with the `@markless/core` package, though.
Tools used: none (apart from the one Read call that opened this prompt file)
