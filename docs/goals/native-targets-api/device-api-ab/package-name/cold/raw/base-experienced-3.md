1: It looks like the framework's main set of cross-platform UI building blocks. It has compound components like tabs and modal, plus basic pieces under `base` such as button, label and separator. My guess is it's a headless component library similar to Radix or Ark UI, and I'm fairly sure of that.

2: I'd guess they come unstyled, or with only the bare minimum. A name like "base" and the root/list/trigger/content structure both suggest a headless library. With no CSS of my own, I'd expect `<tabs.trigger>` to look like a plain browser button with the text "Profile", with ARIA attributes and keyboard handling but no tab-bar styling. I'm moderately sure.

3: Since the same codebase ships to iPhone, Android and the web, and this page uses them with no platform check, I'd assume they work on all three. They're probably drawn by the framework itself rather than by the operating system. On a phone they'd look like web-style controls, not native iOS or Android ones. Fairly sure they work everywhere, less sure how they look.

4: I'd look in `@markless/base` first, as something like `datepicker.root`. If it wasn't there, I'd check `@markless/device` under `native`, because a phone OS has its own date picker. I'd want the native one in the apps, but I'm not sure which package has it.

5: The `base` pieces seem to be web-style components the framework renders in the same way on every platform. `native.sheet` and `native.camera` seem to hand off to the real operating-system feature: an iOS or Android bottom sheet and the camera. On the website they presumably fall back to something else, or may not work at all. I'm fairly sure about that split.

6: I'd expect `@markless/ui` to be the styled, ready-to-use component kit built on top of `@markless/base`, roughly what shadcn is to Radix. Or it could be the umbrella package that re-exports base and maybe native together. Having both is confusing, and I'm only somewhat sure which it would be.

7: `base` looks like a namespace for the simple, single-element building blocks (button, label, separator), as opposed to multi-part components like tabs and modal. The package and the namespace share the name "base", which reads a bit oddly: I'd wonder whether `base` holds everything or just the basic pieces. Moderately sure.

Confidence: 3/5

Tools used: none
