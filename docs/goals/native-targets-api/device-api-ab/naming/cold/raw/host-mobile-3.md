1: `host` looks like a set of components that render the platform's own native UI elements, the "native views" of whatever is running the app. On iPhone that would be UIKit/SwiftUI views and on Android the native views or Compose, rather than HTML drawn by Markless. I'm fairly sure of this, about 4/5.

2: It is imported from the `@markless/host` package. My guess is that this package bridges to the native shell, meaning the iOS or Android container the app runs in, which supplies those widgets. On the website, the "host" would be the browser. The import is certain; the bridging part is my reading of the name.

3: The operating system decides, not the app's own CSS. On iPhone it would probably be a UIKit sheet (UISheetPresentationController), with the grabber, detents and swipe-down to dismiss. On Android it would be a Material bottom sheet with its own animation and drag behaviour. The app supplies only the content (`<Filters />`) and the open state, about 4/5 sure.

4: On the website each one probably falls back to the nearest browser equivalent. `host.sheet` would likely become an HTML `<dialog>` or a sheet-style panel. `host.camera` would likely be a `getUserMedia` video preview, or possibly a file input with capture. `host.pdf` would likely be the browser's built-in PDF viewer in an iframe or embed. I'm least sure here, about 3/5, because the framework could just as easily show nothing or a placeholder.

5: `host.sheet` hands the presentation to the platform, so it is the real native iOS or Android sheet. `drawer` comes from `@markless/ui` and looks like a headless component built from parts (trigger, backdrop, content, title, close). Markless renders it the same way on every platform, and the app styles it itself. So the sheet looks and feels native everywhere, while the drawer looks the same everywhere and is fully under the app's control.

6: Probably not. A plain `<button>` already works on every platform, and `host` seems to be kept for things the web cannot do well or that should feel native, like system sheets, the camera and document viewers. A `host.button` would add little, though a framework might include one for native button styling. I'm moderately sure, about 3/5.

Confidence: 3/5
Tools used: none
