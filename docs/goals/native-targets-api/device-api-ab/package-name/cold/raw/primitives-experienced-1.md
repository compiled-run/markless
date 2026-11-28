1: It looks like a set of unstyled building blocks for UI components: compound pieces like tabs (root/list/trigger/content) and a modal (root/backdrop/content/title/close), plus a `base` group of simple elements like label, separator and button. The names match headless libraries like Radix Primitives, Ark UI or Reach UI, so I'd guess it covers the usual set: dialogs, tabs, menus, popovers and so on. I'm fairly sure of this.

2: I'd expect them to be unstyled. "Primitives" usually means behavior and accessibility only: ARIA roles, keyboard handling, focus management and state. With no CSS of my own, `<tabs.trigger>` would probably render as a plain browser `<button>` (gray default look, maybe with `role="tab"` and `aria-selected`), and the list would just be buttons in a row with no active-tab styling. Fairly sure, though some primitives libraries ship a few layout defaults.

3: Since one codebase builds for iPhone, Android and the web, I'd assume they work on all three. On the phones they would probably render inside a web view, or be mapped to something drawn the same way, not swapped for the platform's own controls. My guess is they look and behave the same everywhere, unlike the `native.*` pieces. Moderately sure.

4: I'd check `@markless/primitives` first for something like `datePicker.root`, but date pickers are often missing from primitives sets because they're large. Next I'd look at `@markless/device` / `native`, because phones have a built-in date picker and a `native.datePicker` would fit next to `native.sheet`. If neither has one, I'd look for a styled `@markless/ui` package or a third-party library. Not very sure where it actually lives.

5: The primitives are cross-platform pieces that the framework renders itself and that you style yourself. `native.sheet` and `native.camera` hand the job to the operating system: the real iOS/Android bottom sheet and camera view, with the platform's own look and behavior. They're also tied to device features like `camera()` and `takePhoto()`, which is why they come from `@markless/device`. They might fall back to something on the website, or might not work there at all. Moderately sure.

6: I'd expect `@markless/ui` to be a styled, ready-to-use component library built on top of the primitives, something like shadcn/ui or MUI next to Radix. It would have themed buttons, tabs, dialogs and probably extra things like date pickers and toasts. The other possibility is that it just re-exports primitives plus device pieces, but styled components is my main guess. Moderately sure.

7: `base` seems to be a group for single-element primitives: simple wrappers around one HTML element (button, label, separator) with consistent behavior and accessibility, as opposed to multi-part components like tabs or modal. Its pieces probably handle things like `onClick` across platforms, a `for` link that works on phones, or the separator's ARIA role. The name is vague, though. It could also mean "base styles", and I only read it as "simple elements" from the context. Somewhat sure.

Confidence: 3/5
Tools used: none
