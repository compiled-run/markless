1: I think it's the framework's own set of UI components, the regular website-style building blocks like tabs, modals and basic things like buttons, labels and separators. They seem to be built from normal HTML elements, and you put them together from parts like `.root`, `.list`, `.trigger` and `.content`. I'm fairly sure, maybe 4/5.

2: My guess is they come unstyled or nearly unstyled, like Radix or Headless UI, where you get the behavior and accessibility and write the CSS yourself. With no CSS of your own, `<tabs.trigger>` would probably look like a plain browser button with the text "Profile", maybe with a little default styling to show which tab is selected. I'm about 3/5 on this, because the package name doesn't actually say "headless".

3: Since the same codebase builds the iPhone app, the Android app and the website, I'd expect them to work in all three. I assume the framework renders them inside the app, probably in some kind of web view, so they look the same everywhere instead of looking like the phone's built-in controls. About 3/5.

4: I'd look in `@markless/elements` first, maybe something like `datePicker.root`, since that's where the general UI components are. If I wanted the phone's own date wheel or calendar, I'd check `@markless/device` under `native`. I'd probably end up searching the docs for "date" because I'm not sure which one has it.

5: The `native.*` pieces look like they use the phone's real built-in UI and hardware: an actual iOS or Android bottom sheet and a live camera view. The `@markless/elements` pieces are the framework's own components, which look and behave the same on every platform. I'm not sure what `native.sheet` or `native.camera` do on the website, maybe they fall back to a web version or don't work at all. About 3/5.

6: Honestly I'd be confused, because "ui" and "elements" sound like the same thing to me. I'd guess `@markless/ui` is the styled, ready-made component library, like a design system or shadcn, built on top of the unstyled elements. It could also just be an older name or an alias for the same package. Low confidence, 2/5.

7: I think `base` is the group of simple, single-element primitives, like a button, label or separator, that don't need multiple parts the way tabs or modals do. They're probably basic HTML elements with some framework extras added, like accessibility or consistent behavior across platforms. I'm not sure why I'd use `<base.button>` instead of a plain `<button>`, especially since the page uses a plain `<input>`. About 3/5.

Confidence: 3/5
Tools used: none
