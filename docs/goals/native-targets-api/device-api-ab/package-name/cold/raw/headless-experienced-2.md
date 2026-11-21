1: It looks like a headless component library: behaviour-only building blocks such as tabs, a modal dialog, and a set of basic primitives (button, label, separator). Each component is split into parts (`root`, `list`, `trigger`, `content`, `close`) that you put together yourself, like Radix, Headless UI or Ark. I'm fairly sure about this, because "headless" is a well-known term.

2: Unstyled. They would handle state, keyboard behaviour and ARIA, but give you no visual design. With no CSS of my own, I'd expect `<tabs.trigger>` to render as a plain browser `<button>` with `role="tab"` and `aria-selected`, maybe with a data attribute for the selected state. It would look like a default gray system button, or plain text if they reset the button styles. I'm fairly confident about this.

3: Since the same codebase ships to iPhone, Android and the web, I'd guess they work on all three. They would probably render as web-style elements inside the app, likely in a webview or a DOM-like layer, not as the phone's own controls. The name doesn't promise this, so I'm only moderately sure. The `native` namespace being separate suggests these pieces are not the phone's own widgets.

4: First I'd check `@markless/headless` for something like `datepicker` or `calendar`, since that's where the composable widgets live. On a phone I'd also check `@markless/device` / `native` for the phone's own date picker, the way `native.sheet` gives you the system sheet. If neither has one, I'd look for a third-party package or build it from headless parts. I'm moderately sure.

5: The headless pieces are cross-platform and unstyled, and they are built by the framework, so I'd expect the same markup and behaviour everywhere. `native.sheet` and `native.camera` look like wrappers around the phone's own components and hardware: a real iOS/Android bottom sheet and a live camera view. So they look and behave the way the platform does, and might fall back or not exist on the web. I'm fairly sure about this, from the word "native" and the `camera()` device handle.

6: I'd expect `@markless/ui` to be the styled component library, ready-made and themed components (probably built on top of `@markless/headless`), like shadcn/ui or MUI next to Radix. Another possibility is an umbrella package that re-exports headless plus styling. With both names side by side, I'd lean towards "styled version". I'm moderately sure.

7: `base` looks like the simplest single-part primitives that don't need a multi-part family: button, label, separator. They're probably thin, accessible wrappers around the matching HTML elements, with consistent props and focus handling. The name could also hint at a "base layer" that the other components are built from. I'm moderately sure.

Confidence: 3/5

Tools used: none
