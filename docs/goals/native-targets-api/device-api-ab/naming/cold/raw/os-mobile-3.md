1: `os` looks like a namespace of components that the phone's operating system draws itself: a sheet, a camera preview and a PDF viewer. Markless doesn't build these from HTML. It hands them to iOS (UIKit/SwiftUI) or Android (Material/Jetpack) so they look and feel like the real system controls. I'm fairly sure of this, about 4/5.

2: It is imported from the `@markless/os` package, which is a separate package from `@markless/ui` and `@markless/device`. I'd guess the package holds the bindings to each platform's native views, with web versions for the browser. The import itself is certain; what the package contains is a guess.

3: The operating system decides, not the app or Markless. On iPhone it would be a UISheetPresentationController-style sheet with detents, the grabber and the swipe-down-to-dismiss motion. On Android it would be a Material bottom sheet with its own drag handle, scrim and motion. All the app controls is whether it is open and what goes inside it.

4: I'd expect web stand-ins, since a browser has no system sheet. `os.sheet` would probably become a `<dialog>` or a bottom-sheet-style modal, `os.camera` a `getUserMedia` video preview that asks for camera permission, and `os.pdf` the browser's built-in PDF viewer in an iframe/embed, or a link. I'm less sure here (about 3/5). The page doesn't say whether these fallbacks exist or what they look like.

5: `os.sheet` is a native system sheet. Its look, gestures and animation come from iOS or Android, and you only control open/close and the content. `drawer` comes from `@markless/ui`. It is a headless component the app builds from parts (trigger, backdrop, content, title, close), so it is rendered in the app's own views and the app owns its styling and behaviour. It looks the same on every platform and won't feel exactly native.

6: Probably not, or at least not needed. A plain `<button>` already works everywhere, and `os` seems kept for things a web element can't do the way the system does: system sheets, camera, PDF viewing. If `os.button` does exist, it would mean "a button the system draws", like a native-styled iOS or Material button. I'd lean towards it not existing, about 3/5.

Confidence: 3/5

Tools used: none
