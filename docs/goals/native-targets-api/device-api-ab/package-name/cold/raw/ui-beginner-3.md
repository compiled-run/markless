1: It looks like a set of basic UI building blocks, things like tabs, modals, and a `base` group with buttons, labels and separators. Each component seems to be split into parts (`root`, `list`, `trigger`, `content`) that you put together yourself, kind of like Radix. I'm fairly sure about this, maybe 4/5.

2: My guess is they come unstyled or nearly unstyled, because the split into parts is what headless libraries like Radix or Headless UI do. With no CSS of my own, I'd expect `<tabs.trigger>` to look like a plain browser button with the text "Profile", maybe with some ARIA attributes and a selected state I could style. Not totally sure, maybe 3/5. It could ship a default theme.

3: I'd guess they work on all three, since the intro says one codebase builds the iPhone app, the Android app and the website, and nothing in the name says "web only." What I'm less clear on is whether they turn into real native controls on phones or render as web-like views there. Medium sure, around 3/5.

4: I'd look in `@markless/ui` first, since it seems to hold the general components, and check whether it has something like `datepicker` or `calendar`. If I wanted the phone's own date wheel, I'd check `@markless/device` under `native` next. The page can't tell me which one has it, so that part is a guess.

5: The `@markless/ui` pieces seem to be the framework's own components, built the same way on every platform. `native.sheet` and `native.camera` sound like the phone's real built-in UI, like the iOS bottom sheet and the actual camera view, so they'd look and behave like the operating system. They come from `@markless/device`, so I'd guess they only fully work on a phone or need permissions, and might fall back to something else on the website. Fairly sure, 4/5.

6: I'd expect `@markless/components` to be styled, ready-to-use components built on top of `@markless/ui`, like how shadcn sits on top of Radix. Honestly though, the two names mean almost the same thing to me, so I'd be confused about which one to use and would need the docs. Low confidence, 2/5.

7: `base` looks like a group of the simplest primitives: button, label, separator. They seem to be thin wrappers around normal HTML elements, probably adding accessibility or cross-platform behavior. They're "base" because they're not compound components like tabs or modal. Fairly sure, 4/5.

Confidence: 3/5

Tools used: none
