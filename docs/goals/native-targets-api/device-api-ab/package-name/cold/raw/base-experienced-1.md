1: It looks like the framework's core set of UI components: things like tabs, modals, buttons, labels and separators, with a namespace per component (`tabs`, `modal`) and a `base` catch-all for simple pieces. My guess is it's the "building blocks" library you'd get with something like Radix or Headless UI. I'm fairly sure of that.

2: I'd guess they come unstyled or with only bare-minimum styling. The name "base" plus the compound `root`/`list`/`trigger`/`content` parts read like a headless library to me. With no CSS of my own, I'd expect `<tabs.trigger>` to look like a plain browser button, or maybe just plain text, with the right accessibility attributes but no visual design. I'm moderately sure; "base" could also mean "default theme".

3: Since the same page builds for iPhone, Android and the web, I'd expect the `base` pieces to work everywhere. But the separate `native` namespace makes me think they're web-style elements, drawn the same way on each platform, not the phone's own controls. I'm moderately sure they run on all three.

4: I'd look in `@markless/base` first, since a date picker is a normal UI component like tabs or a modal. If I wanted the phone's own date wheel or calendar, I'd check `@markless/device` under `native`. I'm not sure which one actually has it.

5: The `base` pieces seem to be the framework's own components, rendered as regular elements and looking the same everywhere. `native.sheet` and `native.camera` look like they hand off to the operating system's real bottom sheet and camera view, so they'd look and behave like iOS or Android and might fall back to something else on the website. I'm fairly sure about that difference.

6: I'd expect `@markless/ui` to be a styled, ready-to-use component kit built on top of `@markless/base`, similar to how shadcn sits on Radix. Seeing both side by side would make me assume `base` is the unstyled foundation and `ui` is the themed layer. I'm moderately sure, but the two names overlap enough that I'd have to check the docs.

7: `base` looks like a namespace object for the simple, single-element pieces (button, label, separator) that don't need their own multi-part family the way `tabs` or `modal` do. It's a bit confusing that it has the same name as the package. I'd read `base.button` as "the library's basic button". I'm moderately sure.

Confidence: 3/5

Tools used: none
