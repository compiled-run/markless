1: It looks like the framework's own component library: tabs, modal, and a set of basic building blocks under `base` (button, label, separator). It probably has more of the usual items too, like menus, popovers, and selects. Each component is split into parts (`root`, `list`, `trigger`, `content`), which is how headless libraries such as Radix, Ark or Headless UI lay things out. Fairly sure.

2: The compound parts and the plain package name make me think they're mostly or fully unstyled, like Radix primitives. With no CSS of my own, I'd expect `<tabs.trigger>` to be a bare native `<button>` in the browser's default style, maybe with ARIA attributes and a selected-state attribute I can target. I'm moderately sure. It might come with a minimal default theme, and nothing on the page settles that.

3: The framework builds one codebase for iPhone, Android and the web, so I'd expect these to work on all three. Since they sit apart from `native`, my guess is they render as web-style elements everywhere, for example inside a webview on phones, and don't become platform controls. That they work on all three I'm fairly sure of. How they render on phones I'm much less sure of.

4: I'd look in `@markless/ui` first, maybe as `datepicker.*` or `calendar.*`. If I wanted the phone's own date wheel or calendar, I'd check `native` in `@markless/device` for something like `native.datePicker`. If neither had one, I'd use a plain `<input type="date">`.

5: The `@markless/ui` pieces look like the framework's own components, which look and behave the same on every target. `native.sheet` and `native.camera` look like wrappers around the operating system's real controls: an iOS or Android bottom sheet and a live camera view. Those may only work, or only look right, inside the phone apps, and on the website they might fall back to something else. Fairly sure about that split.

6: I'd guess it's a styled, ready-to-use set built on top of `@markless/ui`, like shadcn components on Radix or a design-system layer. It could also be higher-level combined pieces such as forms or cards. Having both names would confuse me, because "ui" and "components" usually mean the same thing. Low to moderate sure.

7: `base` looks like the group of single-element building blocks (button, label, separator) that aren't a multi-part component like tabs or modal. They're probably thin, accessible wrappers around the matching HTML elements. It could also mean the unstyled base version of each element. Moderately sure.

Confidence: 3/5
Tools used: none
