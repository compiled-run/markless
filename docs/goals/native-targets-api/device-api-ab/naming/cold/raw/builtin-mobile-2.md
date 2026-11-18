1: `builtin` looks like a namespace of components that each map to a native platform control: a native sheet, a native camera view and a native PDF viewer. Unlike `@markless/ui`, which seems to be the framework's own headless components drawn in the page, `builtin.*` probably hands rendering to the OS. I'm fairly sure of this (about 4/5) because of the name and because camera and PDF are things you would normally embed natively.

2: It is imported from the `@markless/builtin` package, a separate first-party Markless package. Underneath, I would guess it wraps UIKit/SwiftUI controls on iPhone (a UISheetPresentationController-style sheet, an AVFoundation camera preview, PDFKit) and the matching Android controls (a Material bottom sheet, a CameraX preview view, a PDF renderer). On the web it would fall back to browser features. That platform mapping is a guess, about 3.5/5.

3: The operating system decides, not the app author. On iPhone it should look and move like an iOS sheet, with the grabber, detents and swipe-down to dismiss. On Android it should look like a Material bottom sheet with Android's own animations and back-gesture handling. The app only controls `open` and the content inside. I'm about 4/5 on this, since it is the whole point of calling it "builtin".

4: For `builtin.sheet` I'd expect a web fallback such as a `<dialog>` or a bottom-sheet-style modal, so it still opens and closes the same way. For `builtin.camera` I'd expect a `getUserMedia` video preview with `takePhoto()` capturing a frame, after the browser asks for permission. For `builtin.pdf` I'd expect the browser's own PDF viewer in an embed or iframe. I'm less sure here (about 3/5), and some of these might be unsupported or degraded on the web.

5: `drawer` comes from `@markless/ui`, so it is a headless component the app builds and styles itself from parts (trigger, backdrop, content, title, close). It would look and behave the same on every platform, the way you design it. `builtin.sheet` is a single native control where the platform supplies the chrome, gestures and animation, and you only provide the content. Roughly 4/5.

6: Probably not, or at least it wouldn't be needed. A plain `<button>` already works everywhere and is used on this page. `builtin` seems reserved for things that need the platform's native implementation, like the camera, PDF viewing and system sheets. A native-styled button could exist, but I'd lean no, about 3/5.

Confidence: 3/5
Tools used: none
