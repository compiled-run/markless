1: It looks like a set of basic building blocks for UI: tabs, a modal, and simple things under `base` like a button, a label and a separator. It reminds me of Radix or shadcn, where each component is split into parts like `root`, `list`, `trigger` and `content`. I'm fairly sure about this.

2: I'd guess they come unstyled, because "primitives" makes me think of Radix Primitives, which handle behavior and accessibility but not looks. With no CSS of my own, `<tabs.trigger>` would probably look like a plain browser button with the text "Profile", or maybe just plain text. I'm about 60% sure, since there could be some small default styling.

3: I think they work in all three, because the page says one codebase builds the iPhone app, the Android app and the website, and nothing here is marked web-only. What I don't know is whether they turn into real native iOS/Android controls on phones or stay as web-style elements inside the app. I'm moderately sure they work everywhere, but less sure about how they look on phones.

4: I'd look in `@markless/primitives` first, maybe as something like `datepicker.root`. If it isn't there, I'd check `@markless/device` under `native`, since phones have their own date pickers, or a separate `@markless/ui` package if one exists. If none of those have it, I'd search npm or GitHub for a community one.

5: The `native` pieces look like they use the phone's own built-in features, like the real iOS/Android bottom sheet and the camera hardware, so they'd look and behave like the operating system does. The primitives look like the framework's own components that are drawn the same way everywhere and that you style yourself. I'm guessing `native.sheet` falls back to something on the website, but I'm not sure how. I'm about 65% sure of this.

6: I'd expect `@markless/ui` to be a ready-made, styled component library built on top of the primitives, kind of like shadcn/ui or MUI, so you get nice-looking buttons and modals without writing much CSS. It could also just be another name for the same thing, which would confuse me. I'm about 55% sure.

7: `base` looks like a namespace for the simplest single-part components, like button, label and separator, that don't need a root/trigger/content structure like tabs and modal do. They're probably thin wrappers around normal HTML elements with accessibility or cross-platform behavior added. I'm fairly sure, maybe 70%.

Confidence: 3/5
Tools used: none
