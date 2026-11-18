1: `system` looks like a namespace object of components that render the platform's own built-in UI: a real native sheet, the system camera view, the OS PDF viewer. Markless draws none of it itself. These are the screens and controls iOS and Android already ship, wrapped as tags. I'm fairly sure of this, about 4/5.

2: It comes from the `@markless/system` package, which is separate from `@markless/ui` and `@markless/device`. My guess is the package maps each tag to UIKit/SwiftUI on iPhone, to Android's own views or Compose on Android, and to some web fallback in the browser.

3: The operating system decides. On iPhone you'd get the standard UISheetPresentationController-style sheet with its own detents, grabber, spring animation and swipe-to-dismiss. On Android you'd get a Material bottom sheet with Android's own motion. The app only controls the content (`<Filters />`) and whether the sheet is open, not the chrome or the animation.

4: My guess is the website gets the closest thing the web has. `system.sheet` probably becomes a `<dialog>` or bottom-sheet fallback, `system.camera` a `getUserMedia` video preview (or a file input with `capture`), and `system.pdf` the browser's built-in PDF viewer in an iframe or embed. I'm less sure here, about 3/5, because the page gives no hint about the web behaviour.

5: `system.sheet` hands the whole sheet to the OS, so it looks and behaves differently on iPhone and Android and you get native gestures for free. `drawer` from `@markless/ui` is a headless component the app builds from parts (trigger, backdrop, content, title, close). It renders as normal Markless elements, looks the same everywhere and is styled by you. The drawer also brings its own trigger and close button, while the sheet is driven purely by the `open` state.

6: I'd half expect it. iOS and Android both have native buttons, so a `system.button` fits the pattern. But this page uses a plain `<button>` even inside the system tabs, which suggests `system` only covers things that are hard to build yourself: full system screens, sheets and hardware views. Small controls stay ordinary elements. I lean toward "no, it probably doesn't exist", about 3/5.

Confidence: 4/5
Tools used: none
