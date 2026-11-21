1: It looks like the basic UI building blocks of the framework: tabs, modals, and simple things like buttons, labels and separators. I'd guess it's the standard component kit you reach for on any page, a bit like a small Material UI or shadcn set. Fairly sure, maybe 4/5.

2: The name "base" makes me think they come mostly unstyled, or with very plain default styling, so you add your own CSS or theme on top. With no CSS, I'd expect `<tabs.trigger>` to look like a plain browser button or just text in a row, maybe with a little default highlight on the selected tab. I'm only about 50/50 on this, because "base" could also mean "the default styled set".

3: I'd expect them to work on all three: iPhone, Android and the website. They sit next to `native.*` in the same file and nothing says "web only", so I think they're the cross-platform pieces that the framework draws the same way everywhere. Medium-high confidence.

4: I'd look in `@markless/base` first, since that's where the other form-ish components are. If it's not there, I'd check `@markless/device`'s `native` part for a native iOS/Android date picker, since phones have their own built-in ones. After that I'd search npm or the docs for a separate date picker package.

5: The `base` pieces seem to be the framework's own components, rendered as regular elements and laid out the same on every platform. `native.sheet` and `native.camera` look like they use the phone's real built-in UI and hardware (the actual iOS/Android bottom sheet and camera view), so they'd look and act like the OS. I'm not sure what they turn into on the website, maybe a fallback or nothing. Fairly confident about the main difference.

6: I'd guess `@markless/ui` is the bigger, fancier, ready-made styled component library, with things like cards, date pickers and themes built on top of `base`. Or it could just be the old name or an alias for the same thing, which would confuse me. Low-medium confidence, around 2/5.

7: `base` looks like a namespace object imported from `@markless/base` that groups single components, so `base.button` is the framework's Button component. It holds the one-piece components that don't belong to a bigger family like `tabs` or `modal`. Pretty sure.

Confidence: 3/5

Tools used: none
