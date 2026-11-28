1: It looks like a set of ready-made UI components, like tabs, modals, and basic stuff such as buttons, labels, and separators, all split into small pieces (root, trigger, content, and so on). It reminds me of Radix or shadcn, where each component is built from several parts you put together. I'm fairly sure about this.

2: I'd guess they come unstyled or close to it, since the name "parts" and the root/trigger/content setup feel like headless libraries such as Radix. With no CSS of my own, I'd expect `<tabs.trigger>` to look like a plain browser button with the text "Profile", maybe with some attributes for the selected state. I'm about 60% sure, because "parts" could also mean a styled kit.

3: I'd guess they work everywhere, because the app is one codebase for iPhone, Android, and web, and they're mixed right next to the native stuff on the same page. They're probably drawn by the framework itself, like web-style elements, so they'd look the same on all three. About 65% sure.

4: First I'd check `@markless/parts` for something like `datepicker.root`, since it's the general component library. If it's not there, I'd check `@markless/device` under `native`, because phones have their own built-in date pickers. Then I'd search npm or the docs.

5: The `parts` pieces seem to be components the framework builds and draws itself, so they're the same on every platform and you style them. `native.sheet` and `native.camera` look like they use the phone's real built-in system UI, like the iOS bottom sheet and the camera view, so they'd look and act like the operating system's own versions. I'd guess on the website they fall back to something else, or might not work at all. Medium confidence.

6: I'd expect `@markless/ui` to be the styled, designed component library, like a shadcn-style or Material-style kit built on top of `parts`, with things that look nice out of the box. It could also just be an older or alternate name for the same thing, which would confuse me. About 50% sure.

7: I think `base` holds the basic, low-level building blocks: simple elements like button, label, and separator that aren't full multi-part components like tabs or modal. They're probably small wrappers around the normal HTML elements that add accessibility or cross-platform behavior. About 60% sure.

Confidence: 3/5
Tools used: none
