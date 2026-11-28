1: `@markless/base` looks like the framework's main component kit. It has compound components such as `tabs` and `modal`, each with parts like root, list, trigger, content, backdrop, title and close. It also has a `ui` namespace of simple standalone pieces: button, label and separator. I'd guess it covers the usual set of headless-style components like accordion, menu, popover and select, and I'm fairly sure of that.

2: "Base" plus the Radix-style part names (`root`, `trigger`, `content`) suggests unstyled, behavior-only pieces, like Radix Primitives or Base UI. With no CSS of my own, I'd expect `<tabs.trigger>` to render as a plain browser `<button>` with the default gray look, plus ARIA attributes such as `role="tab"` and `aria-selected`. The name "base" could also mean a default theme, though, so I'm about 3 out of 5 sure.

3: Since the framework says one codebase builds all three targets and nothing in the page treats base differently per platform, I'd expect base pieces to work on iPhone, Android and the web. My guess is they render as web-style elements everywhere, probably inside a webview on the phones, rather than as the phone's own controls. `native.*` seems to be the separate route to real platform controls. I'm moderately sure, about 3 out of 5.

4: I'd look in `@markless/base` first, as something like `datepicker.root` or `ui.datepicker`, because that's where the general components seem to live. If I wanted the phone's own date wheel or calendar, I'd check `@markless/device` under `native` next, since `native.sheet` suggests the platform's built-in UI lives there. Failing both, I'd use a plain `<input type="date">`.

5: Base pieces seem to be the framework's own components: built from regular elements, the same on every platform, and styled by you. `native.sheet` and `native.camera` look like wrappers around the real operating system features, the iOS or Android bottom sheet and the live camera view. Those probably look and behave the way the platform decides, and may need permissions or have limited fallbacks on the website. That's why they come from `@markless/device` and not from base.

6: I'd expect `@markless/ui` to be a styled design system built on top of base, ready-made good-looking components in the way shadcn/ui sits on Radix. Having both `base` and `ui` side by side would make me read base as the unstyled layer and ui as the themed layer. If ui turned out to be the unstyled one, I'd be confused about why both packages exist.

7: `ui` looks like a namespace object that groups the small single-element components (button, label, separator) that don't need a root/trigger/content structure. So `<ui.button>` is base's button component, probably a `<button>` with focus and disabled handling and no styling. It's oddly generic as a name, because tabs and modal are UI too, so it reads like a "misc primitives" bucket. I'm fairly sure, about 4 out of 5.

Confidence: 3/5

Tools used: none
