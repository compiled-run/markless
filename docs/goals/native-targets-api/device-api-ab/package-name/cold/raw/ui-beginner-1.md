1: It looks like a library of ready-made UI components, like tabs, a modal and basic stuff such as buttons, labels and separators. Each component is split into parts you put together yourself, like `tabs.root`, `tabs.list` and `tabs.trigger`, kind of like Radix or shadcn. I'm pretty sure about this one.

2: My guess is they come unstyled, or close to it, because the way they're split into parts feels like a headless library such as Radix. With no CSS of my own, I'd expect `<tabs.trigger>` to look like a plain browser button with the text "Profile" or "Photo", maybe with an attribute that marks which tab is selected. I'm only medium sure, since the name "ui" doesn't tell me either way.

3: I'd guess they work in all three apps, since the framework says one codebase builds the iPhone app, the Android app and the website, and nothing here is marked as web-only. They probably act like normal web elements, rendered the same way everywhere, instead of being the phone's own built-in controls. I'm fairly sure they run everywhere, but less sure how they get drawn on a phone.

4: I'd look in `@markless/ui` first, next to tabs and modal, maybe as something like `datepicker.root`. If it's not there, I'd check whether `@markless/device`'s `native` has one, since phones have their own date pickers, and then I'd just search the docs or npm. I'm not sure it exists in either place.

5: The `native.*` pieces seem to be the phone's real built-in stuff, like an actual iOS or Android bottom sheet and the real camera view, coming from the device package. The `@markless/ui` pieces look like the framework's own components that it draws itself, the same on every platform. I'm not sure what `native.sheet` does on the website, maybe it falls back to something like a modal. Medium sure overall.

6: Honestly, I'd be confused, because "components" and "ui" sound like the same thing to me. My best guess is that it would be the styled, ready-to-use versions built on top of the `ui` parts, or the other way round. I'd have to read the README to know which is which, so I'm not very sure.

7: I think `base` is the group of small, basic building blocks, like button, label and separator, that are too simple to need several parts like tabs or modal do. They're probably thin wrappers around the normal HTML elements with some extra accessibility or behavior added. I'm fairly sure, though it's odd that it's called `base` and not something like `primitives`.

Confidence: 3/5

Tools used: none
