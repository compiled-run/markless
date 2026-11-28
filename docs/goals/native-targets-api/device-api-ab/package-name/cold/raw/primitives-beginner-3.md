1: It looks like a set of basic, low-level building blocks for UI: things like tabs and modals made of parts (root, list, trigger, content, backdrop, close), plus simple elements under `base` like a button, label and separator. My guess is it's similar to Radix UI or Headless UI, where you put the pieces together yourself. I'm fairly sure about this.

2: Since they're called "primitives," I'd expect them to be unstyled or nearly unstyled. They would handle behavior and accessibility, like keyboard navigation and ARIA attributes. With no CSS of my own, I think `<tabs.trigger>` would look like a plain browser button with the text "Profile," maybe with some attribute that marks it as selected. I'm about 3/5 sure, because "primitives" could also mean a basic styled set.

3: The page says one codebase builds the iPhone app, the Android app and the website, and these pieces sit right next to `native.*` in the same file. So I'd guess they work on all three. My guess is they render as web-style elements everywhere, maybe inside a webview on phones, and don't turn into real iOS or Android controls. I'm moderately sure they run on phones, but less sure how they actually render there.

4: First I'd check `@markless/primitives` for a `datepicker` or `calendar` namespace. If I wanted the phone's built-in date wheel, I'd look in `@markless/device` under `native`, something like `native.datePicker`. Otherwise I'd search npm or the docs for a Markless date picker.

5: The `primitives` pieces seem to be built by the framework itself and look the same on every platform. You style them yourself, like regular web components. `native.sheet` and `native.camera` seem to be the operating system's real controls, like the iOS bottom sheet and the actual camera view, so they look and behave like the phone's own UI. I'm not sure what `native.*` does on the website. It might fall back to a web version or not work at all.

6: I'd expect `@markless/ui` to be a styled component library built on top of the primitives, like how shadcn/ui is built on Radix. It would be ready-made buttons, modals and tabs with a design already applied. I'm not super sure, because "ui" is vague and could also just be another name for the same thing.

7: `base` looks like a group of the simplest single-element pieces, like button, label and separator. They aren't multi-part widgets like tabs or modal. They're probably thin wrappers over the normal HTML elements that add accessibility or cross-platform handling. It confused me a little at first, since `<base>` is also a real HTML tag, but here it seems to just mean "basic stuff."

Confidence: 3/5
Tools used: none
