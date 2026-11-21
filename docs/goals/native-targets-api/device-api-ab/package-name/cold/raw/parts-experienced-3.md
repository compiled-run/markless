1: My guess is that `@markless/parts` is the framework's library of standard UI components, things like tabs, modals and basic elements (buttons, labels, separators). Each component is split into small sub-pieces such as `root`, `list`, `trigger` and `content` that you put together yourself, like Radix or Ark UI. The name "parts" and the compound `x.root` / `x.trigger` pattern make me think headless primitives. I'm fairly sure of this reading.

2: I'd guess they come unstyled, or close to it, and that they mainly handle behaviour, state and accessibility. With no CSS of my own, `<tabs.trigger>` would probably look like a plain browser button, with some ARIA attributes or state attributes like `data-state="active"` that I can style against. I'm moderately sure. "Parts" sounds like building blocks rather than a designed kit, but the package might still ship a small default stylesheet.

3: I'd expect them to work on all three targets, because the same page uses them next to `native.*` without any branching for each platform. My guess is they render with the framework's own web-style views everywhere, inside a webview or something like it on phones, rather than turning into the phone's own built-in controls. I'm moderately sure.

4: I'd look first in `@markless/parts` for something like `datePicker.root` or `calendar`. If I wanted the phone's built-in date wheel or calendar, I'd also check `native` in `@markless/device`, since that's where the phone-provided pieces seem to live. Without docs I'd go through the exports of both. I'm fairly unsure which one actually has it.

5: The `parts` pieces seem to be the framework's own components, drawn by the app and built the same way on every platform. `native.sheet` and `native.camera` look like they hand off to the phone's own built-in UI and hardware: a real iOS/Android bottom sheet and camera preview, controlled through device APIs like `cam.takePhoto()`. They probably behave differently, or fall back to something else, on the website. I'm fairly sure about the intent but not about how the website handles them.

6: I'd expect `@markless/ui` to be the styled, ready-to-use design system, like a shadcn-style kit built on top of `parts`, with themes and polished looks. Another possibility is that it's simply what `parts` is called, or that it bundles `parts` and `native` together. Having both names side by side would honestly confuse me, and I'd have to check which one I'm meant to import. I'm low to moderately sure.

7: `base` looks like a group of the most basic single-piece elements: button, label, separator. They're thin wrappers over HTML elements that add the library's accessibility and behaviour, as opposed to compound components like tabs or modal. So `<base.button>` is probably a `<button>` with focus, disabled and press handling added. I'm moderately sure.

Confidence: 3/5

Tools used: none
