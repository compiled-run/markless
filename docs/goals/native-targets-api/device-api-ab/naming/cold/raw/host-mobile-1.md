1: `host` looks like a set of native components that the platform itself provides: a camera preview, a bottom sheet and a PDF viewer that the OS renders, not ones drawn by the framework. On iPhone they would be UIKit/SwiftUI views and on Android the Material/Jetpack ones, wrapped so you can drop them into `.tsrx`. I'm fairly sure of this, because `host.camera` takes an `el` handle from `camera()`, which looks like a native view bridged to a device API.

2: It comes from the `@markless/host` package, which is separate from `@markless/ui` (the framework's own components) and `@markless/device` (APIs like the camera). My guess is that the "host" is whatever is running the app (the iOS app, the Android app or the browser), and this package exposes that host's built-in UI. I'm moderately sure about that.

3: The operating system decides. On iPhone you'd get the system sheet with its detents, grabber and swipe-to-dismiss spring, and on Android you'd get the Material bottom sheet with its own drag and scrim behavior. Markless only passes `open` in and gets `onChange` back. I'm fairly confident, because that is the point of separating it from `drawer`.

4: I'd expect each to fall back to the closest web equivalent. `host.sheet` probably becomes something like a `<dialog>` or a bottom-sheet-style modal. `host.camera` probably becomes a `getUserMedia` video preview, or a file input with `capture`. `host.pdf` probably becomes the browser's built-in PDF viewer (an iframe/embed) or a plain link. I'm less sure here, maybe 3/5: it might also render nothing or ask you to supply a web fallback.

5: `host.sheet` is the platform's own sheet, and you get only a content slot plus open/close. `drawer` is the framework's headless component, made of parts (trigger, backdrop, content, title, close) that you style and lay out yourself, so it looks and behaves the same on every platform. Also, the drawer brings its own trigger button, while the sheet is opened from your own code (the Filter button).

6: Probably not, or at least it isn't the point of the package. A regular `<button>` already becomes a normal tappable control everywhere and needs no native bridge. `host` seems reserved for things the web layer can't fake well: system sheets, camera previews and document viewers. If it existed, I'd expect it only for some special system button, like Apple Pay or a share button, rather than a generic `host.button`.

Confidence: 3/5

Tools used: none
