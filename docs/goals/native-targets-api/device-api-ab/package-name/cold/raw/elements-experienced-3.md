1: My guess is it's the component library: multi-part components like tabs and modal (root/list/trigger/content, root/backdrop/content/title/close), plus a `base` set of single-element pieces like button, label and separator. It reads like a Radix-style compound-component kit. Fairly sure.

2: I'd bet they come unstyled, like a headless library. The dotted part names and the separate `backdrop` part point that way, and the file imports no theme or CSS. With no CSS of my own, `<tabs.trigger>` would probably look like a plain browser button, maybe with some ARIA attributes and a selected-state attribute I could style. About 3/5 sure.

3: I'd expect them to work on all three: iPhone app, Android app and website. The framework is said to build one codebase for all three, and only the `native` pieces are split out. My guess is they render with web tech on every target, maybe in a webview on phones, so they'd look the same everywhere rather than like the phone's own controls. Moderately sure.

4: I'd look in `@markless/elements` first, probably as `datepicker.*` or something like `calendar.*`, built from the same kind of parts. If I wanted the phone's built-in wheel or calendar picker, I'd look in `@markless/device` under `native`, something like `native.datePicker`. I'm not sure which one the framework intends.

5: `native.sheet` and `native.camera` look like the phone's own built-in UI: a real iOS or Android bottom sheet and a live camera view, wired to device APIs through `camera()`. The `elements` pieces are the framework's own components, which look and behave the same everywhere. I'd also guess the `native` ones may not work, or may fall back to something else, on the website. Fairly sure about the split, less sure about how the website handles it.

6: I'd expect `@markless/ui` to be the styled, ready-made layer, a design system with themed buttons, cards and dialogs, probably built on top of `@markless/elements`. Next to a package called "elements" it could also just be a duplicate or an older name, and that would confuse me. Low confidence, around 2/5.

7: `base` looks like the basic single-element pieces: one-part components that wrap a plain HTML element (button, label, separator) and add accessibility and consistent behavior across platforms. It's a bit odd that `<input>` is a raw tag while `label` and `button` come from `base`, which makes me think `base` only covers some elements. Moderately sure.

Confidence: 3/5

Tools used: none
