1: It looks like a set of basic UI building blocks, things like tabs, modals and simple pieces such as buttons, labels and separators. They're split into parts (root, list, trigger, content and so on), kind of like Radix UI or Headless UI components. I'm fairly sure about that.

2: My guess is they come mostly unstyled, like Radix primitives, so they'd handle behavior and accessibility but leave the look to you. With no CSS of my own, `<tabs.trigger>` would probably look like a plain browser button or just plain text with the default font. I'm only moderately sure, because "elements" doesn't tell me whether there's a default theme.

3: Since the intro says one codebase builds the iPhone app, the Android app and the website, I'd assume they work on all three. My guess is they're drawn by the framework the same way everywhere, like web-style components, instead of using the phone's built-in controls. I'm moderately sure.

4: I'd look in `@markless/elements` first, maybe for something like `datepicker.root`, since that's where the other components are. If it's not there, I'd check `@markless/device` under `native`, because phones have their own built-in date pickers. I'm not sure which one has it.

5: `native.sheet` and `native.camera` seem to be the phone's real system parts, like the actual iOS bottom sheet and the real camera view, so they come from the device itself. The `@markless/elements` pieces seem to be the framework's own components, built the same way on every platform. I'm not sure what `native.sheet` turns into on the website, maybe a fallback modal.

6: I'd expect `@markless/ui` to be a styled component library, more like Material UI or shadcn, with ready-made designed components. It might be built on top of `@markless/elements`. Having both packages side by side would confuse me a bit, though, and I'm only somewhat sure.

7: `base` looks like a group of simple single-piece elements, like button, label and separator, that don't need a root/content structure the way tabs and modals do. They're probably upgraded versions of normal HTML tags with extra behavior or accessibility added. I'm moderately sure, though "base" could also mean "unstyled base version."

Confidence: 3/5
Tools used: none
