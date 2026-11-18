1: `native` is a namespace object of components that render the platform's own system UI: a real UIKit/SwiftUI view on iPhone and a real Android view (Jetpack Compose or View) on Android. It's not a set of web-drawn components. `native.camera`, `native.pdf` and `native.sheet` each wrap one OS widget, such as the camera preview, the PDF viewer or a bottom sheet. I'm about 4/5 sure on this.

2: It's imported from the `@markless/native` package, which is separate from the `@markless/ui` headless components and from the `@markless/device` APIs like `camera()`. I'd guess that package ships the iOS and Android bindings, plus a fallback for the web build. This part is certain because it's in the import line.

3: Mostly the operating system decides. On iPhone you'd get a UISheetPresentationController-style sheet, with its detents, grabber, swipe-to-dismiss and spring animation. On Android you'd get a Material bottom sheet with its own drag behaviour and scrim. The app supplies the content (`<Filters />`) and the open state, and maybe a few props. It doesn't control the chrome or the motion. I'm fairly sure, about 4/5.

4: I'd expect a web fallback for each one. `native.sheet` probably becomes an HTML `<dialog>` or a bottom-sheet-style modal. `native.camera` probably becomes a `<video>` preview fed by `getUserMedia`, with `takePhoto()` grabbing a frame or falling back to a file input. `native.pdf` probably becomes the browser's built-in PDF viewer, in an iframe or embed. I'm less sure here, about 3/5. It could also render nothing or show a fallback message where the web has no real equivalent.

5: `drawer` comes from `@markless/ui`. It's a headless component I build out of parts (trigger, backdrop, content, title, close), drawn with HTML and CSS, so I own its look and it looks the same on every platform. `native.sheet` is one tag that hands the whole presentation to the OS: I only pass content and the open state, and iOS and Android draw it in their own style. In short, drawer is custom-drawn and the same everywhere, while the sheet is the platform's own system sheet.

6: Probably not. A button is simple, and a plain `<button>` or a `@markless/ui` button already covers it. The `native` namespace seems kept for things the web can't do well or that users expect to look like the OS, like the camera, the PDF viewer and system sheets. It could exist if they wanted pixel-perfect platform buttons, but I'd bet against it, about 3/5.

Confidence: 4/5

Tools used: none
