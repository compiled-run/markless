1: `builtin` looks like a namespace of components that each wrap a native platform control: the system camera view, the system PDF viewer, and the system bottom sheet. The name suggests "the one the OS already provides" rather than something the framework draws itself. I'm fairly sure of this, about 4/5.

2: It comes from the `@markless/builtin` package, which is a separate import from `@markless/ui` (the framework's own components) and from `@markless/device` (hardware access like `camera()`). My guess is that this package maps each tag to UIKit/SwiftUI on iPhone, to Android's native views or Compose on Android, and to some web version in the browser. That's an inference from the name and the split, about 3/5.

3: Mostly the operating system: Apple's sheet on iPhone, with its detents, drag-to-dismiss and spring animation, and Material's bottom sheet on Android. The app only controls `open`/`onChange` and what goes inside it, here `<Filters />`. I'd guess you can't restyle the chrome much, maybe 3.5/5.

4: My best guess is that the website gets a web fallback for each one. `builtin.sheet` probably becomes a dialog or bottom sheet built in HTML. `builtin.camera` probably becomes a `getUserMedia` video preview, which needs browser permission and may fall back to a file picker. `builtin.pdf` probably becomes the browser's own PDF viewer in an iframe or embed. I'm unsure whether any of them is missing on the web or shows a placeholder instead, about 2.5/5.

5: `drawer` comes from `@markless/ui`, so the framework draws it in its own UI layer. It has parts you put together yourself (trigger, backdrop, content, title, close) and it looks and behaves the same on every platform, styled by you. `builtin.sheet` is one tag that hands off to the platform's native modal sheet, so it feels native but you get less control over it. The drawer also manages its own trigger, while the sheet is only driven from outside by `open`. About 4/5.

6: Probably not. Plain `<button>` already works on every platform and is used all over this page, so a `builtin.button` would add nothing. The `builtin` set seems kept for things the web can't do well natively, like camera, PDF and sheets. It could exist if they wanted the real UIButton or Material button, but I'd lean no, about 3/5.

Confidence: 3/5

Tools used: none
