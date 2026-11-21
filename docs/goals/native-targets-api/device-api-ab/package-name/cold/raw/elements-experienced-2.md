1: It looks like the framework's own set of cross-platform UI building blocks: compound components like `tabs` and `modal`, plus a `base` group of simple pieces like button, label and separator. Each one is a namespace object, and its parts (root, trigger, content and so on) are used as dot-accessed tags. It reads like a headless primitives library along the lines of Radix or Ark. I'm fairly sure of this.

2: I'd guess they come unstyled, or close to it, because the names and anatomy (root/list/trigger/content, backdrop/content/title/close) match headless libraries, and the word "elements" suggests raw building blocks rather than a design system. With no CSS of my own, `<tabs.trigger>` would probably look like a plain browser button, or even plain text, with the right ARIA role and keyboard handling but no tab styling. I'm about 60% sure; it might ship minimal functional defaults such as hiding inactive panels.

3: I'd expect them to work on all three targets, since the prompt says one codebase builds the iPhone app, the Android app and the website, and the page mixes them freely with `native.*`. On the phones they're probably drawn by the framework itself, in a web view or a cross-platform renderer, rather than mapped to the system's own controls. I'm moderately sure.

4: First I'd check `@markless/elements` for something like `datePicker` or `calendar`. If it isn't there, I'd check `native` in `@markless/device`, because a date picker is a classic system control on iOS and Android. As a last resort I'd use `<input type="date">`. I'm unsure which of the two packages actually has it.

5: The `elements` pieces look like the framework's own components, the same on every platform, built and laid out in its own markup. `native.sheet` and `native.camera` look like wrappers around the operating system's real UI: a real iOS or Android bottom sheet and a live camera view, controlled through a handle (`cam.takePhoto()`). I'd guess the native ones behave differently per platform and might fall back to something else on the website, or not be available there at all. I'm fairly sure about the general split.

6: I'd expect `@markless/ui` to be the styled layer: a ready-made, themed component kit or design system built on top of `@markless/elements`, much like shadcn/ui sits on Radix. Another possibility is that it would be an umbrella package that re-exports both elements and native. Seeing both names side by side would confuse me a little about which one to use.

7: `base` looks like the group of single-part, basic pieces: button, label, separator. These are simple elements that don't need a compound root/trigger/content structure, likely enhanced versions of the HTML tags with accessibility, focus and press handling that works across platforms. The name could also hint that these are the "base" primitives the other components are built from. I'm about 70% sure.

Confidence: 3/5
Tools used: none
