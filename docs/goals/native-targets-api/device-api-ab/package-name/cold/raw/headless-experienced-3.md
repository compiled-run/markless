1: It's a headless component library, like Radix Primitives, Ark UI or Headless UI. It gives you the behavior and accessibility (state, keyboard handling, ARIA, focus) of common widgets such as tabs and modals, split into compound parts like `root`, `list`, `trigger` and `content`. I'm fairly sure of this; the name and the part structure match those libraries.

2: They come unstyled, because that's what "headless" means. With no CSS of your own, `<tabs.trigger>` would look like a plain browser `<button>`: default grey button chrome or bare text, with nothing marking the active tab except maybe an attribute like `data-state="active"` or `aria-selected`. The library might ship a few functional defaults such as hiding inactive panels, but I wouldn't expect any visual design.

3: My guess is they work in all three apps, because the same page mixes them with `native.*` and the codebase targets iPhone, Android and the web. In the apps, though, I'd expect them to render as web-style elements inside a webview, not as real platform controls. I'm about 3/5 on this, since "headless" says nothing about platform.

4: I'd look in `@markless/headless` first for something like `datepicker.root`, and if it isn't there I'd check `@markless/device` / `native` in case there's a platform date picker (iOS and Android both have one). If neither has it, I'd use a plain `<input type="date">`, or build one from headless pieces or a third-party library.

5: The `headless` pieces are framework-drawn, cross-platform behavior that you style yourself. `native.sheet` and `native.camera` come from `@markless/device`, so I read them as the real operating-system UI and hardware: a system bottom sheet and a live camera view whose look is set by iOS or Android, not by your CSS. They probably behave differently on the website, either falling back to something or not working at all.

6: I'd expect `@markless/ui` to be the styled component library built on top of `headless`, something like shadcn/ui or Chakra, with themed, ready-made buttons, tabs and dialogs. A less likely reading is that it's an umbrella package that re-exports `headless` and maybe `native` together. I'm about 3/5 on this.

7: `base` looks like the collection of simple, single-element primitives (button, label, separator) that don't need a compound root/trigger/content structure. They're thin accessible wrappers around native HTML elements, like Radix's Label and Separator or Base UI's simple parts. I'm moderately sure of this; it could also be the base building blocks the other components are made from.

Confidence: 3/5
Tools used: none
