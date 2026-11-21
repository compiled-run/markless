1: `ios` and `android` look like namespaces of native UI components for each platform. `ios.sheet` would be a real UIKit/SwiftUI sheet (a UISheetPresentationController-style modal), and `android.sheet` would be a Material bottom sheet. The same goes for camera and PDF views. Each one probably renders only in its own platform's build. I'm fairly sure about this.

2: They come from the platform packages `@markless/ios` and `@markless/android`. These are separate from the cross-platform `@markless/ui` (headless components like `drawer` and `tabs`) and `@markless/device` (device capabilities like `camera()`). My guess is each package wraps the OS's own native views. I'm fairly sure.

3: Mostly the operating system. On iPhone it would be Apple's native sheet with its detents, drag-to-dismiss and system animation. On Android it would be Google's Material bottom sheet with its own behavior. The app author passes only `open`/`onChange` and the content, so I'd expect little styling control, maybe a few platform options. I'm moderately sure.

4: My best guess is that a website visitor gets nothing from any of these pairs. Each tag seems to render only on its own platform, and none of them is a web fallback, so the filter sheet, camera preview and PDF viewer would be missing on the web. That would be a bug in this page unless the framework quietly provides a web fallback. The website would still get the tabs, the drawer and the buttons, and `cam.takePhoto()` might fall back to a file picker or the browser camera. I'm only about 50% sure, because the framework might map these to web equivalents (a dialog, getUserMedia, an iframe or the browser's PDF viewer).

5: The `drawer` comes from `@markless/ui`, which is headless and cross-platform. It's the same component everywhere: the app styles it and the framework handles behavior and accessibility, with explicit trigger, backdrop, content, title and close parts. `ios.sheet`/`android.sheet` hand presentation to the OS's native sheet, with no parts to compose, so the look and gestures are the system's. The drawer works on the web too, and the native sheets probably don't. I'm fairly sure.

6: I'd guess probably not, or only if a native button differs in a way that matters. A plain `<button>` already works everywhere, and the page itself uses ordinary buttons. These namespaces seem to cover only things the web can't do well or the OS does better: native sheets, camera views, PDF rendering. I'm moderately sure.

Confidence: 3/5

Tools used: none
