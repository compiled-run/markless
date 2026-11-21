1: `@markless/base` looks like the framework's core component library: the cross-platform building blocks like tabs, modals, buttons, labels and separators. The names `tabs.root`/`tabs.list`/`tabs.trigger` and `modal.backdrop`/`modal.content` follow the Radix/Ark compound-component pattern, so I'd guess it is a set of accessible primitives. I'm moderately sure (about 3/5).

2: The name "base" and the root/trigger/content part names make me think they ship unstyled or close to it, like Radix or Base UI. A bare `<tabs.trigger>` would probably be a plain native-looking `<button>` with the browser's default look, plus ARIA and selected-state attributes for me to hook CSS onto. Still, "base" could also mean "base theme", so I'm only about 50/50 on that.

3: Since it sits apart from `@markless/device` and the app ships to iPhone, Android and web, I'd expect these pieces to work on all three. On the phones they'd likely render through the same web view or renderer, not as platform-native controls. I'm fairly sure they aren't web-only, but not certain how they render on the phones.

4: First I'd look in `@markless/base` for something like `datePicker` or `calendar`. If I wanted the phone's own wheel or calendar picker, I'd check `native` in `@markless/device`. If neither had one, I'd use a plain `<input type="date">`, which already gets the native picker on phones.

5: The `base` pieces seem to be the framework's own components, drawn the same way everywhere and controlled by my markup and CSS. `native.sheet` and `native.camera` seem to hand off to what the operating system provides: a real iOS/Android bottom sheet and the device camera view. I'd expect those to look and behave differently on each platform, and on the website to fall back to something emulated or limited. The `cam` handle from `camera()` suggests the camera is a device API with an element attached, not just a styled component.

6: I'd expect `@markless/ui` to be the styled design-system layer built on top of `base`, with themed, ready-to-use components, much like shadcn sitting on Radix. Another reading is that it's the full component library and `base` is the low-level primitives. Having both names side by side would confuse me a bit, and I'd have to check the docs.

7: `ui` looks like a namespace in `@markless/base` for simple single-element components that don't need several parts, such as button, label and separator. `tabs` and `modal` get their own namespaces because they have many parts. So `<ui.button>` is probably the library's button primitive, an accessible `<button>` with framework behavior. I'm fairly sure of this.

Confidence: 3/5

Tools used: none
