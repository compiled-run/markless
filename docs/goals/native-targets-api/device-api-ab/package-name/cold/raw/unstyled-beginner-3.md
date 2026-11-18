1: I think it's a set of basic UI components that already handle behavior, like tabs, a modal, and simple things like buttons, labels and separators. It looks like Radix UI or Headless UI: you get parts like `root`, `trigger` and `content` and put them together yourself. I'm fairly sure about this.

2: Going by the name, they come without styles. With no CSS of my own, I'd guess `<tabs.trigger>` looks like a plain browser button with the text "Profile" in it, with no active-tab underline or other tab styling. Clicking it would probably still switch tabs, and it might set something like an `aria-selected` or `data-state` attribute I could style. Pretty confident.

3: I'd guess they work on all three, because the intro says one codebase builds the iPhone app, the Android app and the website, and nothing marks these as web-only. On the phone they're probably drawn by the app itself, like regular web-style elements, not as the phone's own built-in controls. I'm only about 60% sure on that last part.

4: I'd check `@markless/unstyled` first, since date pickers are a common headless component. If it isn't there, I'd look in `@markless/device` under `native`, because phones have their own date pickers and that seems like where a phone-provided one would go. I'm not sure which one actually has it.

5: The `@markless/unstyled` pieces look like the framework's own components that it draws itself and you style. `native.sheet` and `native.camera` sound like they use the phone's real built-in sheet and camera view, and they come from the `device` package next to `camera()`, which gives you `takePhoto()`. So they probably look like the iOS or Android versions, and I'm guessing they might not work, or might act differently, on the website.

6: I'd expect `@markless/ui` to be the styled component library, something like a ready-made design system with themed buttons, tabs and modals you can use without writing CSS. It might be built on top of `@markless/unstyled`. It could also just be a general name for all the components, but styled is my best guess.

7: `base` seems to be a group of the simplest building blocks, like button, label and separator, that are single elements and not multi-part components like `tabs` or `modal`. They're probably wrappers around the normal HTML elements that add accessibility or behavior that works across platforms. I'm moderately sure, maybe 65%.

Confidence: 3/5

Tools used: none
