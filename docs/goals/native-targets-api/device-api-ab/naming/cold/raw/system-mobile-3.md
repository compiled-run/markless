1: `system` is a namespace of components that wrap the platform's own native UI: the real iOS or Android view (UISheetPresentationController, the camera preview, the PDF viewer) instead of something Markless draws in HTML/CSS. You use it the same way as the other components on the page. I'm fairly sure of this (about 4/5) because the name pairs with "system sheet" and "system camera" in iOS and Android terms.

2: It comes from its own package, `@markless/system`, which is separate from `@markless/ui` (the headless, styled-by-you components) and from `@markless/device` (APIs like `camera()` that return a handle). It's probably a first-party Markless package that ships the native bindings for each platform plus a web fallback.

3: The operating system decides. On iPhone it should be a native UIKit/SwiftUI sheet with Apple's detents, grabber, corner radius and spring animation. On Android it should be a Material bottom sheet with Google's drag behavior and motion. Markless and the app author only choose whether it is open and what goes inside it. I'm moderately sure; there may be a few props for detents or sizes that this page doesn't use.

4: My best guess is the closest browser equivalent of each. For `system.sheet`, probably a `<dialog>` or a bottom sheet drawn by Markless, since browsers have no native sheet. For `system.camera`, a `getUserMedia` video preview that asks for camera permission, possibly falling back to a file input with `capture`. For `system.pdf`, the browser's built-in PDF viewer in an iframe/embed, or a download link. I'm only about 3/5 here, because the page doesn't show whether the web versions are real fallbacks or something more minimal.

5: `drawer` comes from `@markless/ui`. It's a headless component built from parts (trigger, backdrop, content, title, close) that Markless renders in the web view, and you style it, so it looks and behaves the same on every platform. `system.sheet` is one element whose look, gestures and animation belong to the OS, so it feels native but you control less of it. Use the drawer for your own branded UI and the sheet when you want the platform's own feel.

6: Probably not, or at least not as something you'd need. A plain `<button>` already works everywhere, and the `system` set looks reserved for things the web layer can't do well on its own, like native sheets, the camera viewfinder and PDF rendering. A native button would mean overlaying a native control on the web view just to get platform styling, which is rarely worth it. I'm about 3/5, since a library like this might still wrap common native controls.

Confidence: 3/5
Tools used: none
