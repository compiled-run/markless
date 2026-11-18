A1. `ui`: Short and obvious, it says this is the interface components, and the "no styling" part is a detail to put in the docs, not the name.
A2. `headless`: The word developers already use for components that have behaviour and accessibility but no styles, like Headless UI and Radix.
A3. `primitives`: Radix made this word mean unstyled, accessible building blocks you compose and style yourself.
B1. `ui`: `<ui.button>` reads naturally, and it matches the package if the package is `@markless/ui`.
B2. `base`: These are the basic single elements that families are built from, so `<base.button>` and `<base.label>` read clearly.
B3. `el`: Short for element. Each one is one styled-by-you element, and `<el.separator>` is quick to type.
Tools used: none
