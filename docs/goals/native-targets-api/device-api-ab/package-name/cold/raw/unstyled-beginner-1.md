1: It looks like a set of basic UI building blocks: tabs, a modal and simple pieces like buttons, labels and separators. I'd guess it's a component library like Radix or Headless UI, where you get the behavior and accessibility and do the design yourself. I'm fairly sure about that, mostly because of the name and the `root`/`trigger`/`content` pattern.

2: I'd expect them to come unstyled, because the package is literally called "unstyled". With no CSS of my own, I'd expect `<tabs.trigger>` to look like a plain browser button, or maybe just plain text, with no tab look. It probably still sets things like an active state or ARIA attributes that I could hook my styles onto.

3: Since one codebase builds the iPhone app, the Android app and the website, I'd guess these work on all three. They'd probably render inside a web view on the phones rather than as real native controls. I'm only moderately sure, because nothing in the code says it.

4: First I'd check `@markless/unstyled` for something like `datePicker` or `calendar`. If it's not there, I'd check `@markless/device` under `native`, since phones have their own date pickers. After that I'd look on npm. I'm not sure which one is the "right" place.

5: The `unstyled` pieces seem to be regular HTML-style components that I build and style myself, and they look the same everywhere. `native.sheet` and `native.camera` seem to use the phone's real built-in sheet and camera, so they look and act like the operating system's own UI. I'm guessing they behave differently on the website, or maybe don't work there at all.

6: I'd expect `@markless/ui` to be the styled version: ready-made components that already look good, like a design system or something like shadcn. It might even be built on top of `@markless/unstyled`. I'm moderately sure.

7: I think `base` is the group of simple, standalone pieces (button, label, separator) that aren't part of a bigger component like tabs or modal. It's probably a thin wrapper around the plain HTML elements that adds accessibility or cross-platform behavior. I'm not very sure why I'd use `<base.button>` instead of a normal `<button>`.

Confidence: 3/5
Tools used: none
