1: It looks like Markless's own set of building-block UI components: tabs, modals or dialogs, and basic pieces like buttons, labels and separators. Each component is split into parts (`root`, `list`, `trigger`, `content`, `backdrop`, `title`, `close`), which is the Radix-style compound pattern. I'd read it as the framework's general component library, the "kit" you build your screens from. I'm fairly sure of this.

2: The way it's split into parts makes me think it's headless or very lightly styled, more like Radix or Headless UI than MUI. With no CSS of my own I'd expect `<tabs.trigger>` to show up as a plain browser button with its text, maybe with some ARIA and `data-state`/selected attributes to hook styles onto, but no tab look. That said, "kit" sounds a bit like a styled design system, so I'm only about 60% sure it's unstyled.

3: I'd guess they work in all three apps, because the whole codebase builds to iPhone, Android and web, and they sit right beside `native.*` on the same page. My guess is they render as web-style elements everywhere (in a web view or something similar), not as the phone's own platform controls. I'm moderately sure they run everywhere and less sure how they're drawn on phones.

4: I'd look in `@markless/kit` first, as another namespace like `datepicker.root` or `calendar.*`. If I wanted the phone's own built-in wheel or calendar picker, I'd check `@markless/device` under `native`, something like `native.datePicker`. Without docs I'd have to try both, and that's a bit annoying.

5: The `@markless/kit` pieces look like cross-platform components the framework draws itself, so they look and behave the same everywhere. `native.sheet` and `native.camera` come from `@markless/device`, so I read them as the phone's own platform UI: a real iOS or Android bottom sheet and a live camera view, tied to the device's hardware and features. On the website I'd expect them to fall back to something, or not work at all, but I can't tell which from this page.

6: My first guess would be the styled, ready-to-use component library (themed buttons, dialogs and so on), probably built on top of kit. Or it could be the other way round, with `ui` being the headless parts and kit a bundle on top. Having both names side by side would confuse me, because "ui" and "kit" mean nearly the same thing, so I'm not sure at all here.

7: `base` looks like the group of simple single-element building blocks (button, label, separator, probably input and others), as opposed to multi-part widgets like `tabs` or `modal`. They're probably accessible, lightly enhanced versions of the plain HTML elements. It's an odd name, though: "base" could also mean "base styles" or "unstyled". I'm fairly sure about the "simple building blocks" reading.

Confidence: 3/5

Tools used: none
