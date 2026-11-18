1: It looks like the framework's own UI component library. It has multi-part components like `tabs` and `modal`, built from pieces such as root, list, trigger, content, backdrop, title and close, plus a `base` group of simple building blocks like button, label and separator. It reads like a Radix or Ark-style compound component kit. Fairly sure.

2: My guess is they're unstyled or very lightly styled (headless), because of the anatomy-style part names like root, list, trigger and content, and the separate `base.button`. With no CSS of my own, I'd expect `<tabs.trigger>` to look like a plain browser button with the text "Profile", maybe with ARIA attributes like `role="tab"` and `aria-selected`, and no designed tab look. Moderately sure; it could ship minimal default styles.

3: Since one codebase builds the iPhone, Android and web apps, and this page uses them with no platform checks, I'd expect them to work on all three. They probably render as web-style elements everywhere, maybe in a webview on phones, rather than as true native controls. Moderately sure.

4: I'd look in `@markless/ui` first for something like `datePicker.root`. If the phone's own picker is what I want, I'd check `@markless/device`'s `native` namespace, since a date picker is a classic OS-provided control. If neither has one, I'd build it from `base` pieces or use a third-party library.

5: `@markless/ui` pieces look like components the framework draws itself, built from HTML elements, and they look and behave the same on every platform. `native.sheet` and `native.camera` look like the phone's own system UI and hardware, so the operating system renders them: an iOS or Android bottom sheet and a live camera view. On the website they probably fall back to something web-based or have limits. Fairly sure on the split, less sure about web behavior.

6: I'd expect either higher-level, ready-made, styled components (a design-system layer built on the `ui` parts) or an older or duplicate name for the same thing. Having both side by side would confuse me, and I'd have to read the docs to know which one to use. Low to moderate certainty.

7: `base` looks like a namespace for primitive, single-element pieces like button, label and separator. Each is probably a thin wrapper over the matching HTML element that adds accessibility and consistent behavior, as opposed to the multi-part families like tabs and modal. The name "base" could also suggest a base or default theme, but here I'd read it as "primitives". Fairly sure.

Confidence: 3/5
Tools used: none
