1: `ios` and `android` look like sets of components that each show a real native screen piece from one platform. `ios.sheet` would be a real iOS sheet, `ios.camera` a native camera preview and `ios.pdf` a native PDF viewer, and the `android.*` versions are the Android equivalents. Each one probably only renders when the app is running on its own platform, which is why the page lists both side by side. I'm fairly sure of this, about 4/5.

2: They come from separate packages, `@markless/ios` and `@markless/android`. I'd guess those wrap UIKit/SwiftUI on iPhone and Android Views/Jetpack Compose on Android, exposed as `.tsrx` components. They are separate from `@markless/ui`, which looks like cross-platform headless components, and from `@markless/device`, which gives you hardware access like `camera()`.

3: Mostly the operating system. On iPhone, `ios.sheet` should look and move like a standard iOS sheet: the grabber, detents, swipe to dismiss and the spring animation. On Android, `android.sheet` should be a Material bottom sheet with Android's own motion and scrim. I'd expect the app to control only what goes inside it (`<Filters />`) and whether it is open, plus maybe a few native options, not the styling of the sheet itself. About 3.5/5.

4: My best guess is that the website renders nothing for any of these six components, because they are tied to a platform and there is no native view in a browser. That would mean no filter sheet, no camera preview and no PDF viewer on the web unless the page adds its own web fallback. The "Filter" button would change `filtersOpen` but show nothing. Another possibility is that Markless supplies a web stand-in, such as a dialog, `getUserMedia` or an iframe/embed. Nothing on this page shows that, though, so I lean towards "nothing". About 2.5/5.

5: `drawer` comes from `@markless/ui`. It looks like a headless, cross-platform component made of web-style parts (root, trigger, backdrop, content, title, close), so it would look and behave the same on iPhone, Android and the website. The app styles it itself, and its motion comes from the app's CSS rather than the OS. `ios.sheet` and `android.sheet` are the real OS sheets, which feel native but exist only on their own platform. About 4/5.

6: Probably not. A plain `<button>` already works everywhere, and the pattern here seems to be using `ios.*` and `android.*` only for things the web can't do well or that need real native behaviour: sheets, camera and PDF. A simple tap target doesn't need a native wrapper. I wouldn't be shocked if one existed for native button styles, but I'd guess no, about 3/5.

Confidence: 3/5
Tools used: none
