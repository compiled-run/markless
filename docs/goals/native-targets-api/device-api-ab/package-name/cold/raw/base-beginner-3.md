1: It looks like the basic UI building blocks for the app: simple pieces like button, label and separator under `base`, plus bigger components like `tabs` and `modal` that are made of several parts (root, list, trigger, content, and so on). It reminds me of Radix or shadcn, a kit of common components you put together. Fairly sure, about 4/5.

2: My guess is they're mostly unstyled or only lightly styled, because the parts are split up so finely (root/list/trigger/content), which is how headless libraries like Radix work. With no CSS of my own, I'd expect `<tabs.trigger>` to look like a plain browser button with the text "Profile", or even just plain text, and maybe a bit of default focus or active styling. I'm only about 3/5 on this, since "base" could also mean a default theme.

3: I'd guess they work on all three, because the page says one codebase builds the iPhone app, the Android app and the website, and these components sit right next to the native ones. They're probably drawn by Markless itself (like web-style UI) on every platform rather than using the phone's built-in controls. About 3/5.

4: I'd look in `@markless/base` first, since it has the general components like tabs and modal. If the phone's own date picker is what I want, I'd check `native` in `@markless/device`, because a date wheel feels like something the phone already has. Not very sure which one it's in, maybe 3/5.

5: The `base` pieces seem to be Markless's own components that look and behave the same everywhere. `native.sheet` and `native.camera` look like they use the phone's real built-in features: the system bottom sheet and the actual camera view, which you control through the `camera()` handle. On the website, I'm not sure what `native.camera` turns into, maybe some fallback. About 4/5.

6: I'd expect `@markless/ui` to be the styled, ready-to-use component library, maybe built on top of `base`, like how shadcn sits on top of Radix. It could also just be another name for the same thing, which would confuse me about which one to import. About 2/5.

7: It's a namespace object exported from `@markless/base`, and it holds the simple single-element components like `button`, `label` and `separator`. I think `<base.button>` is probably a wrapper around a normal `<button>` that adds accessibility or works the same on all platforms. It's a little confusing that the package and the object are both called "base". About 4/5.

Confidence: 3/5
Tools used: none
