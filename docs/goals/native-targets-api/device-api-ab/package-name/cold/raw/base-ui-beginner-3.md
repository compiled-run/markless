1: It looks like the basic building blocks for an app: tabs, a modal, and general pieces like a button, label and separator. My guess is it's something like a component library such as Radix or shadcn, with the common UI stuff you'd use on most pages. I'm fairly sure, maybe 4/5.

2: I'd guess they come unstyled, or close to it, because the parts are split up like Radix (`root`, `list`, `trigger`, `content`), and that's usually the headless style. With no CSS, `<tabs.trigger>` would probably look like a plain browser button with the text "Profile", maybe with some built-in active or selected state but nothing pretty. I'm only about 3/5 on this, since "base" could also mean a default theme.

3: I think they work on all three, because the intro says one codebase builds the iPhone app, the Android app and the website, and nothing in the name says "web only". The separate `native` thing for the sheet and camera makes me think `base` is the part that works the same everywhere. I'm about 3/5, because on phones it might just be rendering web-style elements inside the app.

4: I'd look in `@markless/base` first, since that's where tabs, modal and buttons live, so a date picker would probably be there as `datePicker` or something. If it's not there, I'd check `@markless/device` under `native`, since phones have their own built-in date pickers. Not super sure, maybe 3/5.

5: The `base` pieces look like regular components the framework draws itself, so they'd look and behave the same on every platform. `native.sheet` and `native.camera` seem to be the phone's real built-in features, like the iOS bottom sheet and the actual camera, coming from the device. So `native` means "use the real phone thing", and `base` means "the framework's own version". About 4/5.

6: I'd expect `@markless/ui` to be a styled component library, kind of like a finished design system sitting on top of `base`, where buttons and modals already look nice. Or honestly it might be the same thing as `base` and I'd be confused about why both exist. Around 2/5.

7: `ui` seems to be a catch-all group of small, simple components (button, label, separator) that don't need several parts like tabs or modal do. It's probably just an object you import that holds a bunch of basic elements, used as `ui.button`. Maybe it's the framework's version of plain HTML elements, with extra behavior or accessibility added. About 3/5.

Confidence: 3/5
Tools used: none
