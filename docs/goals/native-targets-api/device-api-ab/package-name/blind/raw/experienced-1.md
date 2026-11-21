A1. `ui`: It's short and obvious, so `@markless/ui` reads as "the component library". `native.*` is already a separate package, so there's no confusion.
A2. `headless`: This is the established term for unstyled components that only supply behaviour and accessibility, so experienced devs know what they're getting right away.
A3. `primitives`: Radix made this word common for unstyled, accessible building-block parts, and it fits the root/list/trigger/content family structure.
B1. `ui`: `<ui.button>`, `<ui.label>` and `<ui.separator>` read naturally, and they sit cleanly next to `<tabs.root>` without fighting the family names.
B2. `base`: It suggests these are the basic standalone elements that sit under the families, and `<base.button>` is easy to scan.
B3. `core`: It says "the essential single pieces". The package `core` is taken, but as a namespace inside markup `<core.label>` still reads clearly.
Tools used: none
