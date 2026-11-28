A1. `ui`: It's short and obvious, and `@markless/ui` reads like "the components library", the same way people say "shadcn/ui" or "Radix UI".
A2. `headless`: It tells me straight away that it ships no styles and I write my own CSS, which is what "headless UI" means in the React world.
A3. `primitives`: Radix calls its unstyled building blocks "primitives", so I'd guess right away that these are basic parts I style myself.
B1. `ui`: `<ui.button>` and `<ui.label>` read naturally as "a UI button", and it matches the package name, so it's easy to remember.
B2. `base`: These are the basic standalone pieces that aren't part of a family, and `<base.button>` reads clearly.
B3. `core`: It suggests the core building blocks, though I'd worry about mixing it up with the `@markless/core` package.
Tools used: none
