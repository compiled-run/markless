1: My guess is that it's a set of UI building blocks you put pages together from: tabs, modals, and basic stuff like buttons, labels and separators. I've seen "headless" in libraries like Headless UI and Radix, where it means the component handles behavior and accessibility but not looks. I'm fairly sure about this.

2: I'd expect them to come unstyled, because that's what "headless" usually means. With no CSS of my own, `<tabs.trigger>` would probably look like a plain browser button, or even just plain text, sitting next to the other trigger. Clicking it would still switch tabs. I'm about 70% sure it has no visual styling at all.

3: My guess is they work on all three, since the intro says one codebase builds the iPhone app, the Android app and the website. Nothing in the name says "web only." But since they're separate from `native`, they might be drawn by the framework itself, like web-style elements inside the app, not the phone's real controls. I'm moderately sure.

4: I'd look in `@markless/headless` first, since that's where the general UI pieces like tabs and modal live, so maybe there's a `datepicker` or `calendar` in there. If it isn't there, I'd check `native` in `@markless/device`, because phones have their own built-in date pickers. Not very sure which one it would be in.

5: I think `native.sheet` and `native.camera` use the phone's real built-in UI and hardware, like the iOS bottom sheet and the real camera view. The headless pieces seem to be framework-made components that you style yourself and that behave the same everywhere. So `native` would look like the operating system's own UI, and headless would look however your CSS makes it. I'm fairly sure, but I don't know what `native.sheet` does on the website.

6: I'd expect `@markless/ui` to be a ready-made, styled component library, like a component kit that already looks nice, probably built on top of the headless pieces. It would basically be headless plus a design. I'm fairly sure, because that's the usual pairing in the React world.

7: I think `base` is a group of the simplest, most generic pieces, like button, label and separator, that aren't part of a bigger component like tabs or modal. They're probably thin wrappers around normal HTML elements that add accessibility or work across platforms. I'm not sure why you'd use `<base.button>` instead of a plain `<button>`, though. Moderately sure.

Confidence: 3/5

Tools used: none
