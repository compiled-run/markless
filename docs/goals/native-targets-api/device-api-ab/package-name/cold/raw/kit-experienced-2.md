1: My guess is that `@markless/kit` is Markless's own component library, made of compound components like `tabs` and `modal` (each with root, trigger, content and similar parts), plus a `base` group of small single pieces like a button, a label and a separator. It looks a lot like Radix or Ark UI: a set of building blocks for common interface patterns. I'm fairly sure of this.

2: I'd guess they come unstyled, or very close to it, because the root/list/trigger/content anatomy is the signature of headless libraries. With no CSS of my own, I'd expect `<tabs.trigger>` to look like a plain browser `<button>` with the right ARIA roles and keyboard handling. The name "kit" does make me wonder whether there is some default look, so I'm only about 3/5 sure.

3: I'd expect them to work on all three targets, since the app is one codebase and nothing on the page marks `kit` as web-only. On the phones, though, I'd guess they render as web-style elements drawn by Markless, not as the phone's own controls. I'm moderately sure.

4: I'd look in `@markless/kit` first, since it seems to hold the general interface components. If I wanted the phone's own date wheel or calendar, I'd check `@markless/device` under `native` next. I'm not sure which one has it, so I'd look in both.

5: The `kit` pieces look like Markless's own components, built the same way on every platform and laid out with HTML-like markup. `native.sheet` and `native.camera` look like the operating system's own controls: a real iOS or Android bottom sheet and a live camera view, controlled through `device` APIs like `cam.takePhoto()`. I'm less sure what `native.*` does on the website, maybe a web fallback, maybe nothing.

6: I'd expect `@markless/ui` to be a styled design system built on top of `kit`, with ready-made themed components, similar to shadcn compared with Radix. Or it could be the older or more general name for the same thing, which would confuse me. Having both side by side is ambiguous, so I'm about 2/5 sure.

7: `base` looks like a namespace of basic, low-level pieces that aren't part of a larger pattern: button, label, separator. These are probably thin, accessible wrappers around the matching HTML elements, so they behave the same everywhere and hook into the kit's styling. "Base" could also mean "unstyled base layer", but I lean toward "primitives".

Confidence: 3/5

Tools used: none
