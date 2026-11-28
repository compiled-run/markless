1: It looks like a set of ready-made UI components: tabs, modals, and basic pieces like buttons, labels and separators. The `.root`/`.trigger`/`.content` parts remind me of Radix, so I think it's a component library built from parts you put together. Fairly sure, around 4/5.

2: My guess is they come unstyled, or nearly unstyled, the way Radix or Headless UI do, because the API is split into small parts and nothing mentions a theme. With no CSS of my own I'd expect `<tabs.trigger>` to look like a plain browser button with the text "Profile", maybe with some focus or selected state but no real design. "Kit" could also mean a styled kit, so I'm only about 3/5 on this.

3: I'd expect them to work everywhere: website, iPhone and Android. The intro says one codebase builds all three, and the page uses kit pieces right next to `native.*`. I think they're the framework's own cross-platform components that render the same on each platform, not the phone's built-in controls. About 3.5/5.

4: I'd look in `@markless/kit` first, because it seems to be where the general UI components live. If it wasn't there, I'd check `@markless/device` under `native` in case there's a built-in phone date picker like the iOS wheel. Then I'd look in the docs or npm for a separate package.

5: The kit pieces look like the framework's own components, drawn by Markless the same way on every platform, like web components inside the app. `native.sheet` and `native.camera` sound like they use the phone's real built-in sheet and camera, so they look and behave like iOS or Android. They might also do something different, or not work at all, on the website. I'm fairly sure about the camera and less sure how `native.sheet` behaves on the web.

6: I'd guess it's either another name for the same kind of component library, or a styled design-system layer built on top of the kit. Having both `kit` and `ui` would confuse me, because they sound like the same thing. If I had to pick, I'd say `ui` is the styled, pretty version and `kit` is the building blocks. Low confidence, 2/5.

7: `base` looks like a group of the simplest building blocks (button, label, separator), as opposed to bigger components like tabs or modal. They're probably thin wrappers around the normal HTML elements that add accessibility or cross-platform behavior. They aren't the plain `<button>`, but a kit version of it. Moderately sure.
Confidence: 3/5
Tools used: none
