1: Probably a set of headless, low-level UI building blocks: compound components (root/list/trigger/content) for common patterns like tabs and modals, plus a `base` group of single elements like button, label and separator. The name "primitives" makes me think of Radix Primitives. They handle behaviour and accessibility (focus, keyboard, ARIA, open/close state) but not the visual design. I'm fairly sure of this.

2: I'd expect them to come unstyled, or at most with bare functional defaults such as hiding closed content. With no CSS of my own, `<tabs.trigger>` would most likely look like a plain browser button, or even plain text, sitting next to the other trigger. It would be clickable and keyboard-accessible, but it wouldn't look like a tab. I'm moderately to fairly sure.

3: Since one codebase builds the iPhone app, the Android app and the website, I'd expect them to work on all three. They would render as web-style elements, probably inside a webview or drawn the same way on every platform, not as platform controls. The separate `native` import tells me primitives are the cross-platform, "our own drawing" layer. I'm moderately sure.

4: First I'd check `@markless/primitives` for something like `datePicker.root`. If it isn't there, I'd check `@markless/device`/`native`, because a phone's built-in date wheel or calendar is exactly the kind of thing a native namespace would offer. If both fail, I'd look for a `@markless/ui` package or a third-party library. I'm not very sure which one actually owns it.

5: The primitives look like they're built by the framework from web-style elements and behave the same everywhere, with styling left to you. `native.sheet` and `native.camera` look like wrappers around the operating system's own components: the real iOS/Android bottom sheet and camera view, which look and feel like the platform and use device hardware. On the website they probably fall back to something like a dialog plus `getUserMedia`, or may not work at all. I'm fairly sure about the split, less sure about the web behaviour.

6: I'd expect `@markless/ui` to be a styled component library, like shadcn/ui or Material UI, built on top of these primitives with ready-made visuals and a theme. It could also just be a convenience package that re-exports primitives and native together. I lean toward the first reading, with moderate confidence.

7: `base` looks like the group of simplest, single-element primitives (button, label, separator) that aren't part of a multi-part pattern like tabs or modal. They're probably thin, accessible wrappers around the matching HTML elements, maybe with cross-platform handling such as press events on mobile. The name "base" is a little vague, and it could also be read as Base UI or "base styles", but in context I read it as "basic elements". I'm moderately sure.

Confidence: 3/5

Tools used: none
