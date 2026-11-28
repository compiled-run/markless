1: Going by the names (tabs, modal, base.button, base.label, base.separator), `@markless/ui` looks like a library of web UI components: compound pieces for things like tabs and dialogs, plus a `base` set of small building blocks. It reads like Radix or Ark, where each widget is split into parts (root, list, trigger, content). Fairly sure.

2: I'd guess they come unstyled, or close to it, because the root/trigger/content split and the `ui` name feel like a headless library. With none of my own CSS, I'd expect `<tabs.trigger>` to look like a plain browser button with the text "Profile", maybe with ARIA attributes and a selected-state attribute but no real visual design. About 3/5 sure, since nothing on the page shows any styles.

3: Since the app ships as an iPhone app, an Android app and a website from one codebase, I'd assume these pieces work on all three. But putting them next to `native.*` suggests they're drawn the same way everywhere (probably web views or the framework's own rendering), not with the phone's built-in controls. Moderately sure they run on the phones too.

4: I'd look in `@markless/ui` first, maybe as `datepicker.root` or something similar, because that's where the general widgets seem to live. If I wanted the phone's own date wheel or calendar, I'd check `native` in `@markless/device` next. Not sure either one actually has it.

5: `@markless/ui` pieces look like the framework's own cross-platform components, built and drawn by Markless the same way on every platform. `native.sheet` and `native.camera` look like the operating system's real built-in screens and controls (an iOS or Android bottom sheet, a live camera view), so they look and behave like the platform does. I'd guess they only fully work in the phone apps and fall back to something simpler, or don't work, on the website. Fairly sure about the difference, less sure about the website behavior.

6: I'd expect `@markless/components` to be a styled, ready-to-use component set built on top of `@markless/ui`, like shadcn on top of Radix. Or I'd worry that it's an older or overlapping package doing the same thing, which would confuse me about which one to use. Low confidence; having both names side by side seems ambiguous.

7: `base` looks like a group of basic single-element pieces (button, label, separator) that don't need the multi-part root/content structure, basically thin accessible wrappers around plain HTML elements. It could also mean "the unstyled base layer," but given the other names I'd read it as "basic primitives." Moderately sure.

Confidence: 3/5

Tools used: none
