1: It looks like a set of building-block UI components that you put together yourself, like Radix or Headless UI. There are compound components such as `tabs` and `modal` with root, trigger, content and close pieces, plus a `base` group of single elements like buttons, labels and separators. I'm fairly sure of this, because the root/list/trigger/content naming is the standard headless-primitive pattern.

2: I'd guess they come unstyled or nearly unstyled. They handle behavior and accessibility, and you supply the visual design. With no CSS of my own, I'd expect `<tabs.trigger>` to look like a plain browser button, or maybe plain text, with an ARIA attribute such as aria-selected on the active one. I'm moderately sure, about 3/5: the name "parts" points toward raw pieces, but it doesn't rule out a default theme.

3: I'd expect them to work on all three targets, because the page uses them freely next to `native.*` and nothing marks them as web-only. My guess is they render as web-style DOM on every platform, probably inside a webview on the phones, and don't become real iOS or Android controls. I'm moderately confident they run everywhere and less sure how they get drawn on phones.

4: First I'd look in `@markless/parts` for something like `datepicker.root` or `calendar`. If I wanted the phone's own date wheel or calendar, I'd check `@markless/device` under `native`, something like `native.datePicker`. I'd pick between them based on whether I want a custom look that matches across platforms or the familiar system control.

5: The `parts` pieces seem to be the framework's own components: built from HTML, styleable, and the same on every platform. `native.sheet` and `native.camera` look like the operating system's own UI and hardware, so a real iOS or Android bottom sheet and a live camera view, which probably fall back to something on the web. You get the native look and feel but less control over styling.

6: I'd expect `@markless/ui` to be the styled, ready-to-use component library built on top of `parts`, like shadcn/ui or a design-system layer over Radix. It could also be read as an umbrella package that re-exports everything. Having both side by side would confuse me, and I'd need the docs to tell me which one to import. I'm not very sure here, about 2/5.

7: `base` looks like a namespace of simple, single-element primitives such as button, label and separator. They're the plain building blocks that aren't part of a bigger compound widget like tabs or modal. They probably add consistent behavior and accessibility, such as focus handling, disabled state and press handling across touch and mouse, on top of the plain HTML element. The name could also mean "base styles", but I read it as "basic pieces".

Confidence: 3/5
Tools used: none
