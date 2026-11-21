1: It looks like a library of ready-made UI components, like tabs, modals, and small basic pieces like buttons, labels and separators. Each one is split into parts you put together, like `tabs.root`, `tabs.list`, `tabs.trigger`, a bit like Radix. I'm fairly sure about this.

2: I'd guess they come unstyled, or close to it, like Radix or Headless UI, because of the root/trigger/content split and the plain names. With no CSS of my own, I'd expect `<tabs.trigger>` to look like a plain browser button with the text "Profile", maybe with some attribute showing whether it's selected. I'm only moderately sure. It could also come with a basic default theme.

3: Since one codebase builds the iPhone app, the Android app and the website, I'd assume they work on all three. They'd probably be drawn by the framework itself, so they look the same everywhere instead of using the phone's built-in controls. I'm moderately sure.

4: I'd look in `@markless/ui` first, probably for something like `datepicker.root`. If I wanted the phone's own date picker, I'd check `native` in `@markless/device`, like `native.datePicker`. I'm not sure which one has it.

5: The `@markless/ui` pieces seem to be the framework's own components, built from regular elements and the same on every platform. `native.sheet` and `native.camera` seem to use the phone's real built-in sheet and camera view, so they look and act like iOS or Android. I'm not sure what they do on the website, maybe a fallback. I'm moderately sure about this split.

6: I'd be confused, because "ui" and "components" sound like the same thing to me. My best guess is that `@markless/components` would be the styled, ready-to-use versions built on top of the unstyled `@markless/ui` pieces, like a design system on top of headless parts. Or maybe it's just the older name. I'm not sure at all.

7: `base` seems to be a group of the simplest building blocks, like button, label and separator, that are single elements and not multi-part widgets like tabs or modal. Probably they're wrapped versions of the HTML elements with accessibility or cross-platform handling built in. I'm fairly sure.

Confidence: 3/5

Tools used: none
