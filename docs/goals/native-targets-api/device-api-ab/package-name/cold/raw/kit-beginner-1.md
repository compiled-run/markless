1: It looks like a set of ready-made UI components: tabs, a modal or dialog, and a `base` group with basic stuff like buttons, labels and separators. Each component is split into parts like `root`, `list`, `trigger` and `content`, the way Radix or shadcn components are. I'm fairly sure about this.

2: My guess is they come unstyled or nearly unstyled, because the root/trigger/content naming looks like a headless library such as Radix. With no CSS of my own, I'd expect `<tabs.trigger>` to look like a plain browser button with the text "Profile", maybe with some attribute marking it as selected, but no real tab look. I'm only medium sure, since "kit" could also mean a styled kit.

3: I'd guess they work on all three, because the app is one codebase for iPhone, Android and web, and the page uses them right next to the native stuff. I'd expect them to be the app's own components drawn the same way everywhere, maybe in a web view on the phones, and not the phone's built-in controls. I'm medium sure.

4: I'd look in `@markless/kit` first, since that's where the general components seem to live. If it's not there, I'd check `@markless/device` under `native`, because phones have their own date pickers. On the web I'd probably just use `<input type="date">`.

5: The `native.*` ones look like they use the phone's real built-in UI. `native.sheet` would be the iOS/Android bottom sheet and `native.camera` the real camera view, which is why they come from `@markless/device`. The kit pieces are the framework's own components, which look the same on every platform. I'm not sure what `native.sheet` does on the website, maybe it falls back to a modal.

6: I'd expect `@markless/ui` to be the styled, design-system version, like a component library with a theme, sitting on top of the unstyled kit pieces. Or it could just be the same thing as kit, and then I'd be confused about why there are two. Low-to-medium sure.

7: I think `base` is the set of basic building blocks: simple single-element components like button, label and separator, as opposed to bigger multi-part ones like tabs and modal. They're probably thin wrappers around the normal HTML elements that add accessibility or cross-platform behavior. Medium sure.

Confidence: 3/5

Tools used: none
