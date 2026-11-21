1: It looks like the basic building blocks for UI: tabs, a modal, and small things like buttons, labels and separators. I'd guess it's something like Radix or Headless UI, where you put the parts together yourself (root, list, trigger, content and so on). Fairly sure, maybe 4/5.

2: "Primitives" makes me think they come unstyled, like Radix primitives, where you bring your own CSS or Tailwind. With no CSS, `<tabs.trigger>` would probably look like a plain browser button with the text "Profile", maybe with some ARIA attributes or a data attribute for the selected state. I'm about 3/5 on this, since the name doesn't promise either way.

3: Since the app is one codebase for iPhone, Android and web, I'd assume they work everywhere. On the phones they'd probably render as web-style elements inside the app, not as real iOS or Android controls. Moderately sure, about 3/5, because the separate `native` export makes me think these might be web-only in some way.

4: I'd look in `@markless/primitives` first to see if there's a `datepicker` or `calendar` export. If I wanted the phone's own date wheel, I'd check `@markless/device` under `native`, since it has things like `sheet` and `camera`. If neither had one, I'd search for a Markless UI or components package, or build one from the primitives.

5: `native.sheet` and `native.camera` seem to use the phone's real built-in features: an actual iOS or Android bottom sheet and the real camera view. The primitives look like components the framework draws itself, so they look and act the same on every platform. I'm guessing a bit on what `native.sheet` does on the website, maybe it falls back to a normal modal (about 3/5).

6: I'd expect `@markless/ui` to be a ready-made, styled component library built on top of the primitives, like shadcn/ui or MUI compared to Radix. So it would have finished buttons, dialogs and maybe date pickers that look good without extra work. But honestly the names are close, and I could also see `ui` being the same thing as primitives, which would confuse me.

7: `base` looks like a group for the simplest single elements, such as button, label and separator, that don't need several parts like tabs or modal do. They're probably thin wrappers around the HTML elements that add accessibility or cross-platform behavior. Pretty sure, about 4/5.

Confidence: 3/5
Tools used: none
