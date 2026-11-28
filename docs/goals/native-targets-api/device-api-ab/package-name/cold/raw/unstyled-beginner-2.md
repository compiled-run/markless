1: It looks like a set of basic UI components with the behavior built in, like tabs, a modal and simple pieces such as a button, label and separator. My guess is it's like Radix or Headless UI: you get the logic and accessibility but not the looks. I'm pretty sure about this, since the name says "unstyled."

2: Going by the name, they don't come styled. I'd expect `<tabs.trigger>` to look like a plain browser button or just plain text with the default font, maybe with some ARIA attributes on it. No colors, no underline for the active tab, nothing fancy. I'm fairly sure, about 4/5.

3: The page says one codebase builds the iPhone app, the Android app and the website, so I'd guess these work on all three. I think they're probably web-style elements that get rendered inside the app too, rather than real phone controls. I'm less sure about how they work on phones, maybe 3/5.

4: I'd look in `@markless/unstyled` first, because it seems to be where the general components live, and then check whether `@markless/device` or `native` has a phone date picker. If neither has one, I'd look for a third-party library or build it myself from an input. This is a guess, about 2/5.

5: The `unstyled` pieces seem to be components the framework draws itself, and you style them. `native.sheet` and `native.camera` look like they use the phone's real built-in sheet and camera, so they probably look like iOS or Android and you can't style them much. I'd also guess `native` might not work, or might fall back to something else, on the website. Moderately sure, 3/5.

6: I'd expect `@markless/ui` to be the styled version: ready-made components that already look good, like a component library such as MUI or shadcn. It might even be built on top of `@markless/unstyled`. About 3/5, because "ui" could also just be the name of the whole component collection.

7: `base` looks like a group of the simplest building blocks, like button, label and separator, that aren't part of a bigger component like tabs or modal. They're probably accessible wrappers around plain HTML elements. Fairly sure, 4/5.

Confidence: 3/5
Tools used: none
