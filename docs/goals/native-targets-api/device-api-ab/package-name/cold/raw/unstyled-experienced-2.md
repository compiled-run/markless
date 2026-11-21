1: It looks like a headless component library, the Radix or Headless UI kind of thing. It has compound components for common widgets (`tabs`, `modal`) and a `base` set of primitives like button, label and separator. Each one handles behaviour and accessibility (focus, ARIA, keyboard, open and close state) but leaves the look to you. I'm fairly sure of this, because "unstyled" is the usual word for that kind of library.

2: They come without styles. I'd expect plain semantic HTML with ARIA attributes and maybe some data or state attributes for me to hook CSS onto. With no CSS of my own, `<tabs.trigger>` would probably look like a default browser button, or even plain text, sitting next to the other trigger with no selected-tab underline. It might have a default focus ring. It might also have a few functional defaults like hiding inactive panels, but nothing visual.

3: My guess is they work on all three, because the page says one codebase builds the iPhone app, the Android app and the website, and nothing here is labelled web-only. I'd assume they render the framework's normal elements in a web view or something similar, so they look and behave the same on every platform rather than feeling like the phone's own controls. I'm only moderately sure. The fact that `native` is a separate import suggests `unstyled` is the "same everywhere" layer.

4: First I'd check `@markless/unstyled` for something like `datePicker` or `calendar`. If there's nothing there, I'd check `@markless/device` or `native` for the phone's built-in date picker, since iOS and Android both have one. If neither has it, I'd use a plain `<input type="date">`, or a third-party library or my own build on top of `base`.

5: The `unstyled` pieces look like the same framework-rendered components on every platform, with no styles and full control over the look. `native.sheet` and `native.camera` look like the phone's real built-in controls: the operating system's own bottom sheet and a live camera view. The OS draws them, so I probably can't style them much and they look like the platform. On the website they might fall back to some emulation or simply not work. I'm fairly sure of the general split but unsure how the website handles `native`.

6: I'd expect `@markless/ui` to be the styled version: ready-made, themed components, probably built on top of `@markless/unstyled`, like shadcn/ui or Material sitting on top of headless primitives. A less likely reading is that it's a catch-all UI package and `unstyled` is a subset of it. Seeing both side by side, "ui" reads as "the styled one" to me.

7: `base` looks like the namespace for simple single-element primitives that aren't part of a multi-part widget: button, label, separator, and probably things like input, link or visually-hidden text. They're the building blocks the other components are made from, with accessibility handled (for example, `base.label` linking to its input), wrapped around a native HTML element. I'm fairly sure. The name could also mean "the base layer" the rest is built on, which comes to about the same thing.

Confidence: 3/5

Tools used: none
