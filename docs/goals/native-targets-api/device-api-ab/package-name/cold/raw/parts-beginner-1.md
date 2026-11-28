1: It looks like a set of ready-made UI components, the usual building blocks like tabs, modals and simple elements such as buttons, labels and separators. Each component is split into smaller pieces you put together yourself, like `tabs.root`, `tabs.list` and `tabs.trigger`, the way Radix or shadcn components work. I'm fairly sure about this.

2: I'd guess they come unstyled, or close to it, because the split into small pieces looks like headless libraries such as Radix. So with no CSS of my own, `<tabs.trigger>` would probably look like a plain browser button with the text "Profile", maybe with a selected attribute I could style. I'm only moderately sure, since nothing in the code shows styling either way.

3: I think they work everywhere, iPhone, Android and website, because the framework says one codebase builds all three and nothing marks these as web-only. My guess is they render the same way on every platform, like a webview, while the `native` stuff is what's platform-specific. I'm moderately sure.

4: I'd look in `@markless/parts` first and check for something like `datepicker.root`. If it's not there, I'd check `@markless/device` under `native`, since phones have their own built-in date pickers. If neither has one, I'd fall back to a plain `<input type="date">`.

5: The `native` ones look like the phone's real built-in UI, such as the real iOS/Android bottom sheet and the actual camera view, so they probably look different on each platform. They're also hardware-related, for example `camera()` gives you an object with `takePhoto()`. The `parts` pieces seem to be the framework's own components, drawn by Markless itself and the same everywhere. I'm moderately sure.

6: I'd expect `@markless/ui` to be the styled, ready-to-use version, like a full component library with a theme, maybe built on top of `parts`. Or maybe it's just the older or umbrella name for the same thing, which would confuse me. I'm not very sure, because "ui" and "parts" sound like they overlap a lot.

7: `base` looks like the group of simple, single-element components, like button, label and separator, that aren't part of a bigger component like tabs or modal. It's probably a thin wrapper over the normal HTML element with maybe some accessibility or cross-platform handling added. I'm not sure why I'd use `<base.button>` instead of a plain `<button>`, so this is about 50/50.

Confidence: 3/5
Tools used: none
