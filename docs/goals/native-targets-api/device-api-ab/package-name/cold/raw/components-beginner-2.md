1: It looks like the framework's own UI component library: tabs, modals and some basic building blocks like buttons, labels and separators. Each component is split into parts like `root`, `list`, `trigger` and `content`, kind of like Radix. I'm fairly sure about this.

2: My guess is they come unstyled, or close to it, because the dot-part setup (`tabs.root`, `tabs.trigger`) looks like a headless library such as Radix or Headless UI. With no CSS of my own, I'd expect `<tabs.trigger>` to look like a plain browser button with the text "Profile", or maybe just plain text. I'm about 60% sure, since the name "components" doesn't say either way.

3: I'd guess they work on all three, since the prompt says one codebase builds the iPhone app, the Android app and the website, and nothing here is marked web-only. They probably render as web-style elements inside the app, like a webview, and not as real iOS/Android controls. I'm moderately sure they run everywhere, but less sure how they look on phones.

4: I'd look in `@markless/components` first, maybe as `datepicker` or `calendar`. If I wanted the phone's own date picker wheel, I'd check `@markless/device` under `native`, because the date picker is a classic built-in phone control. If neither had one, I'd use a regular `<input type="date">` or an npm package.

5: The `@markless/components` pieces seem to be built by the framework itself and look and behave the same everywhere. `native.sheet` and `native.camera` come from `@markless/device`, so I read them as the phone's real built-in UI: an actual iOS/Android bottom sheet and the real camera view. I'm not sure what `native.sheet` turns into on the website, maybe a regular modal.

6: I'd find it confusing. I'd probably assume it's either the styled version of these components (like a design system or shadcn-style themed kit) or just another name for the same thing. If both existed, I wouldn't know which one to import without the docs. I'm not sure about this one.

7: I think `base` is the group of simple, single-element building blocks (button, label, separator) that don't need a root, trigger and content like `tabs` or `modal` do. They're probably the framework's versions of basic HTML elements with accessibility or cross-platform behaviour added. I'm fairly sure, but it might also mean "unstyled base layer".

Confidence: 3/5
Tools used: none
