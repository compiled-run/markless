A1. `ui`: It's the shortest name and the one I'd guess first. On iOS and Android "UI" already means "the stuff on screen", and `@markless/ui` doesn't suggest it's tied to the phone's system.

A2. `components`: It says exactly what's inside, a library of components I put together, and in React Native that's the word I'd use anyway.

A3. `primitives`: It suggests unstyled building blocks I style myself, which fits "no styling, behaviour and accessibility only". It's a little web-jargony for a Swift or Kotlin dev, though.

B1. `ui`: `<ui.button>`, `<ui.label>` and `<ui.separator>` read naturally. It matches the package name, so I don't have to remember a second word, and it contrasts cleanly with `native.*`.

B2. `controls`: Buttons, labels and separators are what UIKit and Android call controls or views. It's a familiar word for single standalone pieces.

B3. `base`: It suggests the basic single pieces that the families build on, and it's short to type in markup.

Tools used: none. I used the Read tool once, only to open the prompt file itself.
