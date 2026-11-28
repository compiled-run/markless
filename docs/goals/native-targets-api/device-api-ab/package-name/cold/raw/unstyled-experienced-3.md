1: It looks like a headless component library, along the lines of Radix or Headless UI. It gives you compound components for common widgets (tabs, modal/dialog) plus some basic primitives under `base`. Each one handles behavior, state and accessibility, and you supply the look. I'm fairly sure of this.

2: Not styled, which is what the name "unstyled" promises. With no CSS of my own, `<tabs.trigger>` would probably render as a plain browser `<button>` with default browser styling, or something close to bare text. It would still have the right ARIA roles and keyboard handling. There might be a minimal functional default, such as hiding inactive panels, but no visual design.

3: My best guess is they work on all three, because the app is described as one codebase for iPhone, Android and web, and these sit next to native pieces on the same page. I'd assume they render as web-style elements everywhere, maybe in a webview or mapped to plain native views on the phones, not as platform-native controls. I'm only moderately sure, around 3/5.

4: I'd look in `@markless/unstyled` first for something like `datePicker.root`, since that's where the widget families live. If I wanted the phone's own date wheel or calendar, I'd check `@markless/device` under `native` (e.g. `native.datePicker`). For a styled, ready-made one, I'd look for a separate styled package.

5: The `unstyled` pieces are cross-platform components that the framework draws, and you style them yourself, so they look the same everywhere you put them. `native.sheet` and `native.camera` hand off to the operating system's own UI and hardware: a real iOS/Android bottom sheet and camera view, which look and behave the way that platform does. They probably have limited styling and may fall back or be unavailable on the website.

6: I'd expect a styled component library built on top of the unstyled one, ready to use with a default theme, like shadcn/ui or Chakra sitting on Radix. It could also be an umbrella package that re-exports everything. My guess is a styled layer, about 3/5 sure.

7: `base` looks like a namespace of single-element primitives (button, label, separator) that aren't part of a bigger widget family. They're probably thin wrappers over the HTML elements that add accessibility and cross-platform behavior, like Radix's Label/Separator or Base UI. Fairly sure, around 4/5.

Confidence: 3/5

Tools used: none
