1: `@markless/elements` looks like a headless component library, similar to Radix or Ark UI. It has compound components such as `tabs` and `modal`, made of parts like `.root`, `.list`, `.trigger`, `.content`, `.backdrop`, `.title` and `.close`, plus a set of basic building blocks under `base`. They are the common interactive widgets you would otherwise build yourself, with the state wiring and accessibility handled for you. I'm fairly sure of this, because the naming matches those libraries closely.

2: I'd guess they come unstyled, or with only the minimum CSS needed to work, because the part-per-element API is typical of headless libraries. With no CSS of my own, I'd expect `<tabs.trigger>` to look like a plain browser `<button>` with the text "Profile". It would probably carry ARIA attributes such as `role="tab"` and `aria-selected`, plus a data attribute for the active state that I could style. I'm only moderately sure, because nothing on the page confirms it either way.

3: Since one codebase is built as an iPhone app, an Android app and a website, I'd assume they work on all three. They would probably render through a web view or a cross-platform layer rather than as each platform's own controls. The separate `native` namespace suggests that `elements` is the cross-platform layer that looks the same everywhere. I'm fairly sure they run on all three targets, but less sure how they are drawn on phones.

4: I'd check `@markless/elements` first, probably as something like `datePicker.root`, because a date picker is a typical headless widget. On the phones I'd also check `@markless/device`, looking for something like `native.datePicker`, since iOS and Android have their own system date pickers. My best guess is `elements` for a picker that looks the same everywhere and `native` for the phone's own picker. I'm moderately sure.

5: The `elements` pieces look like framework components built from regular page elements, which you style yourself and which behave the same on every platform. `native.sheet` and `native.camera` look like the operating system's own UI: a real iOS or Android bottom sheet and a live camera view. They are tied to device features, such as the `camera()` handle with its `takePhoto()` call. On the website they probably fall back to something else, or don't work at all. I'm fairly sure of the split, but unsure what they do in a browser.

6: I'd expect `@markless/ui` to be a styled component kit, the ready-to-use themed layer built on top of `@markless/elements`, much like shadcn/ui relates to Radix. Another possibility is that it is just an umbrella package that re-exports `elements`, or `elements` and `native` together. I'm not very sure, because the two names overlap enough that seeing both would confuse me.

7: `base` looks like the group of single-part primitives that need no compound structure: button, label, separator. They are probably thin wrappers over the HTML elements that add consistent behavior, such as focus handling, disabled state and press events that work on touch screens, so they behave the same on every platform. I'm fairly confident, though it could also mean "unstyled base versions" as opposed to themed ones.

Confidence: 3/5

Tools used: none
