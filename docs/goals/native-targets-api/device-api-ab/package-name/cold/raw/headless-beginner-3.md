1: I think it's a set of basic UI building blocks like tabs, modals, labels, buttons and separators, a bit like Radix or Headless UI in React. "Headless" makes me think they handle the behavior (open/close, which tab is picked, keyboard and accessibility) but not the visuals. I'm fairly sure about this, maybe 4/5.

2: My guess is they come unstyled, since in the libraries I know "headless" means no styling. With no CSS of my own, `<tabs.trigger>` would probably look like a plain browser button, or even just plain text, with no tab look and maybe a default focus outline. I'm about 70% sure. There could be some small default styles for things like hiding closed content.

3: I'd guess they work on all three, because the page says one codebase builds the iPhone app, the Android app and the website, and these pieces sit right next to the native ones on the same page. I'm not totally sure how they show up on a phone, maybe drawn in a web view or turned into native views. Around 3/5.

4: First I'd look in `@markless/headless` for something like `datePicker.root`. Since a date picker is something phones already have built in, I'd also check `@markless/device` for something like `native.datePicker`. If neither has one, I'd look for a community package or just use `<input type="date">`.

5: The headless pieces seem to be ones the framework builds itself: plain elements with behavior added, which you style however you want, and they look the same everywhere. `native.sheet` and `native.camera` look like the phone's own built-in parts, like the iOS bottom sheet and the real camera view, so they look and act the way the operating system wants and you probably can't style them much. I'm not sure what `native.sheet` does on the website, maybe it falls back to something like a modal.

6: I'd expect `@markless/ui` to be the styled, ready-to-use version: components that already look good, maybe built on top of the headless ones, like shadcn/ui on top of Radix. It might also come with a theme or design tokens. I'm moderately sure, but the name is generic enough that it could just be another name for the headless package.

7: I think `base` is the most basic, single-element parts like button, label and separator. They're simple wrappers around normal HTML elements that maybe add accessibility or make them work on mobile, unlike `tabs` and `modal`, which have several parts that work together. I'm about 3/5 on this, and I'm not sure why I'd use `<base.button>` instead of a normal `<button>`.

Confidence: 3/5
Tools used: none
