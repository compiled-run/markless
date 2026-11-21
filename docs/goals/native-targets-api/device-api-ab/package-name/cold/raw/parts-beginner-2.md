1: My guess is it's a set of reusable UI building blocks, like tabs, a modal and basic stuff like buttons, labels and separators, that you put together from smaller pieces (`root`, `list`, `trigger`, `content`). It feels a lot like Radix or shadcn's primitives. I'm fairly sure about this.

2: I'd guess they come unstyled, or close to it, because the "root/trigger/content" split is the headless-component pattern I've seen in Radix and Headless UI. With no CSS of my own, I'd expect `<tabs.trigger>` to look like a plain browser button with just the text "Profile", maybe with some ARIA attributes and a selected state. I'm only medium sure, since the name "parts" doesn't actually say "unstyled".

3: My guess is they work on all three, since the prompt says one codebase becomes an iPhone app, an Android app and a website, and nothing here is marked as web-only. They're probably drawn the same way everywhere, like web elements, not the phone's own controls. I'm moderately sure.

4: I'd look in `@markless/parts` first, hoping for something like `datePicker.root`. If I wanted the phone's own date wheel, I'd check `@markless/device` for something like `native.datePicker`. I'm not sure which one has it, so I'd probably end up searching both.

5: The `parts` pieces seem to be Markless's own components that look and behave the same on every platform. `native.sheet` and `native.camera` look like they use the phone's real built-in sheet and camera, which is why they come from `@markless/device` next to `camera()`. I'm not sure what `native.sheet` does on the website, maybe it falls back to something like a modal.

6: I'd expect `@markless/ui` to be the styled, ready-to-use component library, like a design system with themes built on top of `parts`. Having both would honestly confuse me a bit, because "ui" and "parts" sound like they could be the same thing. I'm not very sure.

7: I think `base` is the group of simple, single-element building blocks (button, label, separator) that aren't a whole multi-piece widget like tabs or modal. It's probably a thin wrapper around the normal HTML element that adds consistent behavior or accessibility. I'm fairly sure about the idea, less sure what it adds over a plain `<button>`.

Confidence: 3/5
Tools used: none
