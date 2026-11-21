1: I think it's a set of UI building blocks like tabs, modals, labels and buttons that you put together yourself, kind of like Radix or Headless UI in React. "Headless" makes me think they handle the behavior (open/close, which tab is active, keyboard stuff, accessibility) and leave the look up to you. I'm fairly sure about this, maybe 4/5.

2: Probably unstyled. That's what "headless" usually means in the React world. With no CSS of my own, I'd expect `<tabs.trigger>` to look like a plain browser button, or maybe just plain text, with the label "Profile" or "Photo". It might carry some attributes like `aria-selected` that I could style against. Pretty sure, around 4/5.

3: My guess is they work everywhere, since the page says one codebase builds the iPhone app, the Android app and the website, and nothing here is marked web-only. They're probably rendered by the framework as its own elements on each platform, not as the phone's built-in controls. I'm less sure about this one, maybe 3/5.

4: I'd look in `@markless/headless` first, hoping for something like `datepicker.root`, since a date picker is a common UI piece. If I wanted the phone's own date wheel, I'd check `@markless/device` under `native`, because it looks like that's where the platform's built-in stuff lives. Moderately sure, 3/5.

5: The headless pieces seem to be components the framework draws itself and you style yourself, so they'd look the same on every platform. `native.sheet` and `native.camera` look like the actual iOS/Android system UI and hardware, so the bottom sheet would look and feel like the phone's real one and the camera is the real device camera. I'm not sure what `native.sheet` does on the website, maybe a fallback. About 3/5.

6: I'd expect `@markless/ui` to be a styled component library built on top of the headless one, something like shadcn/ui or MUI, where everything already looks good out of the box. Then again, it could just be a different name for the same headless pieces. My best guess is styled, 3/5.

7: `base` looks like the basic, single-element pieces: button, label, separator. They're simple wrappers around regular HTML elements that probably add accessibility and cross-platform behavior, as opposed to bigger multi-part components like tabs or modal. Fairly sure, 3/5.

Confidence: 3/5
Tools used: none
