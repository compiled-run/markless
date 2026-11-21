A1. `ui`: it's what I'd guess first, short, and it says "interface components" with no styling implied, much like a React Native or Compose headless kit would be named.
A2. `components`: this is the plain word mobile devs use for reusable UI pieces, and it can't be mixed up with `device` or `native`.
A3. `primitives`: it says unstyled building blocks you bring your own look to, the way Radix-style primitives work.
B1. `ui`: `<ui.button>`, `<ui.label>` reads naturally as "a plain UI piece" and pairs with family names like `tabs` and `modal`.
B2. `base`: it marks these as the basic standalone pieces under the families, and it's short to type in markup.
B3. `core`: it's what I'd reach for to mean "the basic built-in elements", though it clashes in meaning with the existing `@markless/core` package.
Tools used: none
