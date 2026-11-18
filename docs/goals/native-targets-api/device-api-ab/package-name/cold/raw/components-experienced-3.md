1: It looks like a cross-platform component library made of compound parts, like Radix or Ark UI. It has bigger widgets such as `tabs` and `modal`, each split into parts (root, list, trigger, content, backdrop, title, close), plus simple building blocks under `base`. I'm fairly sure of this.

2: Probably unstyled, or close to it. The `root`/`trigger`/`content` naming and the controlled `value`/`onChange` props look like a headless library, where the package handles behaviour and accessibility and you bring the styles. With no CSS of my own, I'd expect `<tabs.trigger>` to look like a plain browser `<button>` with the default look, probably with ARIA attributes such as `role="tab"` and `aria-selected`. I'm moderately sure; some default layout CSS, like hiding inactive panels, wouldn't surprise me.

3: I'd expect them to work in all three, because the app is one codebase built for iPhone, Android and the web, and the page mixes these pieces freely with `native.*`. My guess is that on phones they render as web-style views drawn by the framework, not as the phone's own controls. I'm moderately sure.

4: I'd look in `@markless/components` first, say `datepicker.root` or `calendar`, because that's where the widgets are. If I wanted the phone's own date wheel, I'd also check `@markless/device`'s `native` namespace, for something like `native.datePicker`. I'm not sure which one has it.

5: The `@markless/components` pieces seem to be the framework's own widgets: you style them and they behave the same on every platform. `native.sheet` and `native.camera` look like the operating system's own UI and hardware, the real iOS/Android bottom sheet and camera preview, so you get the platform's look and can't style them much. I'd guess they need a fallback on the website, or might not work there at all. I'm fairly sure of the difference in kind, less sure about how the website handles them.

6: I'd expect `@markless/ui` to be a styled design system built on top of `@markless/components`, with themed, ready-to-use buttons and tabs, the way shadcn/ui sits on top of Radix. Having both names side by side would confuse me, though, since many libraries use "ui" for the headless package. I'm not sure.

7: `base` looks like a namespace for simple single-element primitives: button, label, separator. These are thin wrappers over plain HTML elements, probably adding accessibility and cross-platform behaviour, as opposed to the multi-part widgets like `tabs` and `modal`. It might also be meant as the default way to write elements that need to work on phones as well as the web. I'm moderately sure.

Confidence: 3/5

Tools used: none
