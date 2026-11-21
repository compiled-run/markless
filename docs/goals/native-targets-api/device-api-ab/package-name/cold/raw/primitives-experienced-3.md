1: It looks like a set of headless, low-level building blocks for UI: tabs, a modal or dialog, and a `base` group of single elements like button, label and separator. Each component is split into parts (`root`, `list`, `trigger`, `content`, `backdrop`, `title`, `close`), much like Radix or Ark UI. I'd expect it to also have the usual things such as popover, menu, select and accordion. I'm fairly sure about this.

2: I'd expect them to come unstyled, because "primitives" usually means behavior and accessibility with no visual design. With no CSS of my own, `<tabs.trigger>` would probably render as a plain browser `<button>` with the correct ARIA attributes, such as `role="tab"` and `aria-selected`. It would look like the default gray button, or plain text if they reset it. I'm moderately sure; it might ship some minimal layout CSS, but not a visual theme.

3: My guess is that they work in all three, because the framework builds one codebase for iPhone, Android and the web. They'd probably render as web elements in a web view on mobile, not as true native controls. The fact that `native.*` sits in a separate package suggests primitives are "the same everywhere" and drawn by the framework, not by the OS. I'm only moderately sure about how they actually render on phones.

4: I'd look in `@markless/primitives` first, perhaps under `datePicker` or `calendar`. I'd also check `@markless/device` or `native` for a system date picker, since iOS and Android both have one built in. If neither had it, I'd look for a styled package like `@markless/ui`. I'm unsure which one actually has it.

5: `native.sheet` and `native.camera` look like they hand off to the phone's own UI and hardware: a real iOS or Android bottom sheet, and a live camera view tied to the device API. Primitives are framework-built components that behave and look the same on every platform and are styled by you. I'd also guess the `native` pieces either fall back to something else on the website or don't work there. I'm fairly sure about the split, less sure about the web fallback.

6: I'd expect `@markless/ui` to be the styled, ready-to-use component library built on top of the primitives, something like shadcn or MUI compared with Radix. That means a themed button, tabs, dialog and date picker that look finished out of the box. I'm moderately sure; it could also just be another name for the same thing, which would confuse me.

7: `base` looks like a namespace for simple single-element primitives that have no multi-part structure: button, label, separator. They're probably thin wrappers that add accessibility, focus handling and consistent behavior over the plain HTML elements. The name reads to me as "the basic building blocks," though it's a bit vague; it could also mean "base styles." I'm moderately sure.

Confidence: 3/5

Tools used: none
