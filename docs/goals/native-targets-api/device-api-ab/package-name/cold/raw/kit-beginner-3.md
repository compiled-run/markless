1: It looks like a kit of ready-made UI components, like tabs, modals, buttons, labels and separators. I think it's the generic building blocks you put a screen together from, kind of like a component library such as Radix or shadcn. Fairly sure.

2: I'm honestly not sure. "Kit" makes me think they come with some default styling, like a UI kit, but the `root`/`list`/`trigger`/`content` naming looks like Radix-style headless components. If they're headless, `<tabs.trigger>` with no CSS would probably just look like a plain browser button with the text "Profile". My guess leans headless, maybe 3/5 on that.

3: I'd guess they work in all three, since the intro says one codebase builds the iPhone app, the Android app and the website. They're probably drawn by the framework itself, like web-style elements, and not real native controls, so they'd look the same on every platform. Moderately sure.

4: I'd look in `@markless/kit` first, since that's where tabs and modal are, and maybe it has something like `datePicker`. If I wanted the phone's own date picker, I'd check `@markless/device` under `native`, maybe a `native.datePicker`. Otherwise I'd search the docs or npm.

5: The `native.*` pieces look like the phone's own built-in UI, like a real iOS/Android bottom sheet and the real camera view, coming from the device/OS. The kit pieces are the framework's own components that it renders itself and that work the same everywhere. I'm not sure what `native.sheet` does on the website, maybe it falls back to something like a modal. Medium confidence.

6: I'd expect `@markless/ui` to be the styled, ready-to-use component library, maybe built on top of kit with a design system and themes. Or it could just be another name for the same thing, and having both would confuse me. That's a guess, and if they existed side by side I'd find it confusing.

7: `base` looks like a group of basic, single-element primitives (button, label, separator) that don't need several parts the way tabs or modal do. They're probably thin wrappers around the normal HTML elements, maybe with accessibility or cross-platform behavior added. Fairly sure it means "basic building blocks."

Confidence: 3/5
Tools used: none
