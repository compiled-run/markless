1: It looks like a library of standard UI components: tabs, modals, and basic pieces like buttons, labels and separators. Each component is split into parts (root, list, trigger, content, title, close), the way Radix or Ark UI do it. I'm fairly sure of this.

2: I'd guess they come unstyled, or nearly so. The name "parts" and the compound root/trigger/content API make it look like a headless library that handles behaviour and accessibility while I write the CSS. With no CSS of my own, I'd expect `<tabs.trigger>` to look like a plain browser button, maybe with ARIA attributes or a data attribute for the selected state. I'm moderately sure, maybe 3 out of 5.

3: Since one codebase builds the iPhone app, the Android app and the website, I'd expect these pieces to work on all three. They probably render as web-style elements everywhere, for example inside a web view on the phones. The separate `native` import suggests that `parts` is the cross-platform layer that isn't tied to any one platform's own controls. I'm moderately sure.

4: I'd look in `@markless/parts` first for a `datepicker` or `calendar` part. If I wanted the phone's own date wheel, I'd check `@markless/device` for something like `native.datePicker`. If neither had one, I'd build it from `base` pieces or use a third-party package.

5: The `parts` pieces seem to be the framework's own components, drawn the same way on every platform and styled by me. `native.sheet` and `native.camera` look like they hand off to the operating system's real controls: an iOS or Android bottom sheet and the actual camera view. On the website they probably fall back to something else or have limited support. I'm fairly sure of the difference, less sure how they behave on the web.

6: I'd expect `@markless/ui` to be a styled, ready-to-use component kit, a design system built on top of `parts`, the way shadcn sits on top of Radix. It could also be read as an umbrella package that re-exports everything, so having both names side by side would confuse me a bit. I'm not very sure, maybe 2 out of 5.

7: `base` looks like a group of the simplest building blocks, single elements like button, label and separator that aren't part of a bigger multi-part component. They're probably thin wrappers over the plain HTML elements that add consistent behaviour, accessibility or styling hooks. I'm fairly sure, though the name doesn't tell me whether they add any styling.

Confidence: 3/5
Tools used: none
