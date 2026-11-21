1: It looks like the basic set of UI building blocks: tabs, a modal, and general pieces under `ui` such as a button, a label and a separator. "Base" makes me think of a foundation library that the rest of an app builds on, a bit like a component kit. I'm fairly sure about this.

2: My guess is that they come unstyled, or close to it, like Radix or Headless UI, because of the `root`/`list`/`trigger`/`content` naming. With no CSS of my own, I'd expect `<tabs.trigger>` to look like a plain browser button with the text "Profile" or "Photo", maybe with default focus outlines and no tab-style underline. But "base" could also mean a minimal default theme, so I'm only about 60% sure.

3: Since the same codebase builds the iPhone app, the Android app and the website, I'd assume these pieces work on all three. They probably render as web-style elements everywhere, maybe inside a webview on phones, rather than as real native iOS or Android controls. I'm moderately sure they work everywhere but less sure how they look on phones.

4: First I'd look in `@markless/base` to see if it has a `datepicker` or `calendar` next to `tabs` and `modal`. If it's not there, I'd check `@markless/device` under `native`, because phones have their own built-in date pickers and that seems like the kind of thing `native` would wrap. If neither has one, I'd look for a community package or build one myself.

5: `native.sheet` and `native.camera` seem to use the phone's real system features: the iOS or Android bottom sheet and the actual camera view. The `@markless/base` pieces seem to be the framework's own components, which look and behave the same everywhere because Markless draws them itself. I'm not sure what `native.sheet` does on the website, probably some fallback, and I'm only about 50% sure on that.

6: I'd expect `@markless/ui` to be a styled component library, like a design system or theme built on top of `base`, similar to how shadcn/ui sits on top of Radix. Honestly, having both would confuse me, because `ui` is also the name of the object imported from `base`. I'd wonder whether one is the old name or the "pretty" version of the other.

7: `ui` seems to be a grab-bag namespace in `@markless/base` for small single-part components like `button`, `label` and `separator`, which don't need `root`/`content` parts the way `tabs` and `modal` do. So `<ui.button>` is probably just Markless's own button component, maybe a styled or accessible wrapper around a normal `<button>`. I'm fairly confident, around 70%.

Confidence: 3/5
Tools used: none
