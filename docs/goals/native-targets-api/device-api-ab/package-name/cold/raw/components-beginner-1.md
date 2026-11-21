1: It seems to be a library of reusable UI components like tabs, modals, buttons, labels and separators, similar to Radix or shadcn in React. You build each one from parts with dot names (`tabs.root`, `tabs.list`, `modal.title`), which reminds me of Radix's compound components. I'm fairly sure about this.

2: Since the parts are split up like Radix (root, trigger, content, backdrop), I'd guess they come unstyled or nearly unstyled and you add your own CSS. With no CSS, `<tabs.trigger>` would probably look like a plain browser button, or even just plain text, that handles clicking and keyboard focus. I'm only moderately sure; it might ship a small default theme.

3: I'd guess they work in all three, because the prompt says one codebase becomes an iPhone app, an Android app and a website, and nothing in the import suggests "web only." The separate `native` import makes me think `components` are the same everywhere, drawn by Markless and not by the phone. I'm moderately sure.

4: I'd check `@markless/components` first, perhaps as `datepicker.root` or `date.picker`. Because phones have their own date pickers, I'd also look in `@markless/device` under `native` (something like `native.datePicker`). If I couldn't find one there, I'd use a plain `<input type="date">`.

5: The `components` pieces seem to be Markless's own UI, which looks the same on every platform and that you style yourself. `native.sheet` and `native.camera` come from `@markless/device`, so I think they use the phone's real built-in UI, like the iOS bottom sheet and the actual camera feed. That's probably why they need device features such as `camera()` and `cam.takePhoto()`. I'm fairly sure, but I don't know what `native.sheet` does on the website.

6: I'd find it confusing because "ui" and "components" sound like the same thing to me. My guess is that `@markless/ui` would be the styled, ready-to-use version (like shadcn on top of Radix), or a design system/theme built on these components. It could also be where the native-looking UI lives. I'm not sure.

7: `base` looks like a group of basic building blocks (button, label, separator) that aren't full widgets with several parts like tabs or modal. It might be a thin wrapper over normal HTML elements that adds accessibility or makes them work on mobile. It could also mean "unstyled base version." I'm moderately sure about the first reading.

Confidence: 3/5
Tools used: none
