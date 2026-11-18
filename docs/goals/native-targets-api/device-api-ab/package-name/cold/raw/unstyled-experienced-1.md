1: It looks like a headless component library, in the style of Radix or Ark UI. It has compound components like `tabs` and `modal` that handle behaviour and accessibility (focus, keyboard, ARIA, open and close state) without any visual design, plus a `base` group of single-element basics. I'm fairly sure of this, because "unstyled" plus the `root`/`trigger`/`content` naming is the usual headless pattern.

2: Not styled, going by the name. With no CSS of my own, a `<tabs.trigger>` would probably be a plain browser `<button>` with default button styling, or bare text if it renders some other element. It would have the right ARIA role and selected state but no active-tab underline. There might be a tiny bit of functional CSS, such as hiding inactive panels, but nothing visual.

3: I'd expect them to work in all three, since the prompt says one codebase becomes the iPhone app, the Android app and the website, and these sit right next to `native.*` in the same page. My guess is they render web-style elements everywhere, probably inside a web view in the apps, rather than real platform controls. I'm about 3/5 sure they behave the same in the apps as on the website.

4: First I'd check `@markless/unstyled` for something like `datepicker.root`. If it's not there, I'd look in `@markless/device` under `native`, because phones have built-in date pickers and the system one would feel right in the apps. I'd also check whether a `@markless/ui` package exists. Without documentation I'm guessing which of these has it.

5: The `unstyled` pieces are framework components built from regular elements that you style yourself, and they presumably look the same on every platform. `native.sheet` and `native.camera` seem to hand off to the platform's own built-in UI and hardware, such as the iOS bottom sheet or a live camera view. They look like the operating system and you can't style them much. On the website I'd expect them to fall back to something web-based or to need permissions, but I'm unsure how.

6: I'd expect `@markless/ui` to be the styled component library, ready-made themed buttons, tabs and dialogs, possibly built on top of `@markless/unstyled`, like shadcn/ui on top of Radix. Another possibility is that it's the umbrella package that re-exports everything. My lean is the styled version, at about 3/5.

7: `base` looks like a set of simple single-element building blocks (button, label, separator) that are thin wrappers around the HTML elements. They add consistent behaviour and accessibility, like press handling or a separator's ARIA role, and leave styling to you. They are the basic pieces as opposed to the multi-part compound components. The name could also mean they're the layer other components are built from, but either way they're basic, unstyled pieces.

Confidence: 3/5

Tools used: none
