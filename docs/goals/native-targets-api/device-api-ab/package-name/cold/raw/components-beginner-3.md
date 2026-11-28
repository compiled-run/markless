1: Looks like the framework's own library of UI components: tabs, modals, buttons, labels, separators. It's like a component kit you'd install in React, such as Radix or MUI. Each piece seems to be a group of parts (`tabs.root`, `tabs.list`, `tabs.trigger`) that you nest together. Pretty sure about this one.

2: My guess is they come unstyled or only barely styled, like Radix or Headless UI, because of the root/trigger/content naming and the fact that nothing in the code passes a theme or variant. With no CSS of my own, I'd expect `<tabs.trigger>` to look like a plain browser button with the text "Profile", maybe with an attribute showing which tab is active. I'm about 3/5 on this, since "components" doesn't tell me either way.

3: I'd guess they work on all three, since the framework says one codebase builds the iPhone app, the Android app and the website. But they're probably web-style elements drawn the same way everywhere, not the phone's real built-in controls. That's my reading of why the sheet and camera come from a separate `native` import. About 3/5.

4: First I'd check `@markless/components` for something like `datePicker.root`. If it isn't there, I'd look in `@markless/device` under `native`, since phones have their own built-in date pickers. After that I'd search the docs or npm. I'm honestly not sure which package it lives in.

5: The `@markless/components` pieces seem to be the framework's own components, built from regular elements and drawn the same on every platform. `native.sheet` and `native.camera` come from `@markless/device`, so I read them as the phone's real built-in sheet and camera, which look and act like iOS or Android. I'm not sure what `native.sheet` turns into on the website, maybe a fallback version. About 3/5.

6: I'd honestly expect it to be pretty much the same thing as `@markless/components`, which would confuse me. Or maybe it's the styled, ready-to-use version with a design system on top, built from these pieces. If both existed side by side, I wouldn't know which one to import without reading the docs. Low confidence, 2/5.

7: Probably the basic, simple pieces that don't need multiple parts: button, label, separator. It's like a "primitives" group, as opposed to compound components like tabs and modal. It might just be thin wrappers around normal HTML elements, maybe with accessibility built in. About 3/5.

Confidence: 3/5
Tools used: none
