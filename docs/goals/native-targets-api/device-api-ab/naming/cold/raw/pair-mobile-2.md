1: `ios` and `android` look like namespaces of native platform components. `ios.sheet` is a real UIKit/SwiftUI-style sheet and `android.sheet` is a Material bottom sheet, and the same goes for camera and PDF. Each one renders only when the app runs on its own platform, so you write both side by side and each build keeps the one that matches. I'm fairly sure of this (about 4/5).

2: They come from the per-platform packages `@markless/android` and `@markless/ios`. My guess is those packages wrap the native SDK views (UISheetPresentationController, AVFoundation camera, PDFKit on iOS; BottomSheet, CameraX, PdfRenderer on Android) and expose them as `.tsrx` components. They probably ship separately from `@markless/ui`, which is the cross-platform layer.

3: The operating system decides. On iPhone you'd get the standard iOS sheet with its detents, grabber and swipe-down to dismiss. On Android you'd get the Material bottom sheet with its own drag and scrim behavior. The app only controls `open` and whatever content goes inside, not the chrome or the animation. I'm moderately sure (about 3.5/5).

4: My best guess is that the website gets nothing for any of them. Each `ios.*` / `android.*` element renders only on its own native platform, so on the web the filter sheet, the camera preview and the PDF viewer would all be missing, unless the framework quietly falls back to some web version. The "Scan receipt" button would still show, but `cam.takePhoto()` would probably fail or do nothing. I'm unsure here (about 2.5/5), and I'd want docs before shipping, because the page as written looks like it gives web users no filter UI at all.

5: `drawer` comes from `@markless/ui`, so I'd expect it to be one cross-platform component the framework draws itself. That means it looks and behaves the same on iPhone, Android and the web, and you build its parts yourself (trigger, backdrop, title, close). `ios.sheet` / `android.sheet` hand presentation off to the real OS sheet, so it feels native but differs per platform and likely doesn't exist on the web. Pick the drawer when you want the same look everywhere and the sheet when you want the native feel.

6: Probably not, or at least not as a priority. A plain `<button>` already works everywhere, and the framework most likely maps it to a native-feeling control, as this page does. The platform namespaces seem kept for things that really need the native SDK: system sheets, camera hardware and the PDF renderer. I'm moderately sure (about 3/5); a native button style could exist, but nothing on this page needs it.

Confidence: 3/5
Tools used: none
