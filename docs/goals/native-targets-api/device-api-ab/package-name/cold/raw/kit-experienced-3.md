1: It looks like Markless's general component library, the cross-platform building blocks you'd put an app's UI together from. There are compound components like `tabs` and `modal`, made of parts such as `root`, `list`, `trigger`, `content`, `backdrop`, `title` and `close`, plus a `base` group of simple pieces like button, label and separator. I'd expect other common widgets in there too, such as accordion, menu and popover. Fairly sure.

2: The dot-namespaced parts (`tabs.root`, `tabs.trigger`) look like Radix, Ark or Base UI, so my best guess is they're headless or close to it: behaviour and accessibility built in, appearance up to me. With no CSS of my own I'd expect `<tabs.trigger>` to look like a plain browser `<button>`, probably with ARIA attributes like `role="tab"` and `aria-selected`. Maybe a bit of basic layout CSS, but no theme. The name "kit" does hint at something more finished, though, so I'm only about 3/5 on this.

3: I'd expect them to work in all three, because the page mixes them freely with `native.*` in one file that builds for iPhone, Android and the web. My guess is they're web-style components that run on the phones too, likely inside a web view or a renderer that draws them the same way on every platform. Moderately sure.

4: I'd look in `@markless/kit` first, for something like `datePicker.root` or `calendar`, since that's where the general widgets live. If I wanted the phone's own wheel or calendar picker, I'd check `native` in `@markless/device`, for something like `native.datePicker`. My guess is both could exist.

5: The `kit` pieces look like the framework's own components: drawn the same way everywhere, and you control the styling. `native.sheet` and `native.camera` come from `@markless/device` and look like real OS components, such as the iOS or Android bottom sheet and the live camera view, with the system's look and behaviour. On the website they probably fall back to some browser version, like a dialog or `getUserMedia`. So `modal` is the framework's own dialog, while `native.sheet` is the phone's built-in one. Fairly sure.

6: Beside `kit`, I'd find `@markless/ui` confusing, because both names say "UI components". My best guess is that `ui` would be the styled, design-system layer built on top of headless `kit`, or the other way round with `ui` as the headless primitives and `kit` as the finished set. I honestly couldn't tell which, so about 2/5.

7: `base` looks like the group of simple, single-element building blocks (button, label, separator) that aren't multi-part widgets like tabs or modal. It's probably a thin wrapper over the HTML element that adds consistent behaviour, accessibility and cross-platform handling. The name might also suggest the "Base UI" style of unstyled primitives. Fairly sure on the role, less sure what it adds over a plain `<button>`.

Confidence: 3/5

Tools used: none
