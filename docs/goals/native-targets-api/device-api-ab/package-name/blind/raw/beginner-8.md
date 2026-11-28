A1. `ui`: It's short and obvious. It's the interface components library, so `@markless/ui` just says that, like a lot of React UI kits do.
A2. `headless`: People already say "headless UI" for components that give you behavior and accessibility with no styling, which is exactly what this is.
A3. `primitives`: Radix uses this word for unstyled building blocks you style yourself, so it feels familiar.
B1. `ui`: `<ui.button>` and `<ui.label>` read naturally as "the basic UI pieces", and it matches the package name.
B2. `base`: These are the base pieces that don't belong to a family, so `<base.button>` makes sense.
B3. `core`: It says these are the core standalone parts. It's a bit confusing because `@markless/core` is already a package, but it's still the word I'd reach for.
Tools used: none
