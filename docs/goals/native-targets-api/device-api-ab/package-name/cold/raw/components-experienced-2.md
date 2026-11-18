1: It looks like the framework's general UI component library: compound components such as `tabs` and `modal`, plus a `base` group of small basic pieces like button, label and separator. These are the everyday building blocks you'd use to put together screens in any Markless app. I'm fairly sure of this.

2: My guess is they come unstyled, or close to it, like Radix or Headless UI. They give you the behaviour, accessibility and structure, and you supply the look. With no CSS of your own, I'd expect `<tabs.trigger>` to render as a plain button-like element with the browser's default styling and maybe some ARIA or data attributes for the selected state. I'm about 3/5 sure, since nothing in the name says "headless".

3: Because one codebase builds the iPhone app, the Android app and the website, I'd assume these components work on all three targets. They'd probably be drawn by the framework itself on every platform, not mapped to each phone's built-in controls. I'm moderately sure.

4: I'd look in `@markless/components` first, maybe as `datepicker.*` or `calendar.*`. If I wanted the phone's own date wheel or calendar, I'd also check `@markless/device` under `native`, because that's where platform-provided UI seems to live. I'm not sure which one actually has it.

5: The `@markless/components` pieces seem to be the framework's own cross-platform components, built from regular elements, so they look and behave the same everywhere. `native.sheet` and `native.camera` look like the operating system's own UI and hardware features: a real iOS or Android bottom sheet and a live camera view. On the website they presumably fall back to something else. I'm fairly sure about the split, less sure how they behave on the web.

6: I'd guess `@markless/ui` would be the styled design system built on top of these components: themed, ready-to-use pieces. It could also just be another name for the same thing, which would confuse me. Having both side by side would be ambiguous, and I'd need docs to tell them apart.

7: `base` looks like the group of basic single-element pieces (button, label, separator) that aren't part of a bigger compound component. They're probably thin wrappers over the HTML elements that add consistent behaviour, accessibility and cross-platform rendering. I'm fairly confident about this.

Confidence: 3/5

Tools used: none
