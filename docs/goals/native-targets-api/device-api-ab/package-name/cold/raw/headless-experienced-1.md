1: It looks like a headless component library, in the spirit of Radix, Ark UI, Headless UI or Base UI. It gives you component primitives that handle behaviour and accessibility, like tabs, a modal or dialog, and basic building blocks such as button, label and separator, and they are built from compound parts (`root`, `list`, `trigger`, `content`). I'm fairly sure of this, because "headless" is a well-known term.

2: Not styled. "Headless" means they bring behaviour, ARIA roles, focus handling and keyboard support, but no visual design. With no CSS of my own, I'd expect `<tabs.trigger>` to render as a plain browser `<button>`, probably with `role="tab"` and `aria-selected`, plus some state attributes I could style against. It would sit inline next to the other trigger with the default button look, and there would be no underline or highlight for the active tab.

3: The name doesn't say. Since the framework builds one codebase for iPhone, Android and the web, my best guess is that these parts work on all three. On the phones they would probably be drawn as web-style elements rather than the phone's own controls. The fact that `native` is imported separately suggests that `headless` is the cross-platform layer you render yourself. I'm only moderately sure.

4: I'd look in `@markless/headless` first, hoping for something like `datePicker.root`, because that's where the composable widgets seem to live. If it isn't there, I'd check `@markless/device`'s `native` namespace for the phone's own date picker, since iOS and Android both have one. If neither has it, I'd guess at `@markless/ui`. I'm unsure which of those the framework intends.

5: The `headless` pieces are unstyled components that the framework renders itself and that I style. They're probably the same everywhere, including on the website. `native.sheet` and `native.camera` look like wrappers around the platform's real built-in UI and hardware: the actual iOS or Android bottom sheet and the live camera view. So their look comes from the operating system, and they might not exist or might fall back on the web. Reading `native` as "the real OS component" is fairly confident; how they behave on the website I'm unsure about.

6: I'd expect `@markless/ui` to be the styled component library, the ready-made kit you use when you don't want to style everything yourself. Think shadcn/ui or MUI on top of the headless layer. It would probably be built from `@markless/headless`, with a theme and default looks. That's a fairly confident reading, though "ui" is vague enough that it could also just be a bundle that re-exports everything.

7: `base` looks like the namespace for simple, single-element primitives that don't need a compound `root`/`content` structure, such as button, label and separator. These would be accessible, unstyled versions of the basic HTML elements, with consistent press and focus handling and maybe working the same across platforms. It could also hint at "Base UI", but I read it as "the basic building blocks". I'm moderately sure.

Confidence: 3/5

Tools used: none
