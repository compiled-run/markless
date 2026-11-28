1: `os` is a namespace of components that show the phone's own built-in UI: a native bottom sheet, the camera preview, a PDF viewer. You write `<os.sheet>`, `<os.camera>` and `<os.pdf>` once, and each one turns into the real system control on iPhone and on Android. I'm fairly sure of this; the name and the fact that it sits beside `@markless/ui` and `@markless/device` point that way.

2: It's imported from the `@markless/os` package, which is a separate package from `@markless/ui` (the framework's own components) and `@markless/device` (hardware APIs like `camera()`). My guess is that `@markless/os` holds the components that hand the drawing off to iOS or Android. The import line settles the package name, but what's inside it is my best reading.

3: The operating system decides, not the app or Markless. On iPhone it would be a UIKit/SwiftUI sheet, with iOS detents, the grabber and swipe-to-dismiss. On Android it would be a Material bottom sheet with Android's own animation and drag behaviour. The app only controls whether it's open and what goes inside it (`<Filters />`). I'm moderately sure of this; that's the point of calling it `os`.

4: The website can't use native controls, so I'd expect each one to fall back to a web version. `os.sheet` would likely be an HTML bottom sheet or dialog, `os.camera` a `getUserMedia` video preview (or a file/capture input), and `os.pdf` the browser's built-in PDF viewer in an iframe/embed, or a link. This is the answer I'm least sure of. The page shows nothing about the web, so a fallback could also look different from what I describe, or not exist for some of them.

5: `os.sheet` is a native system sheet, so the OS draws and animates it and you get only a few props. `drawer` comes from `@markless/ui`, so I'd read it as a headless component made of separate parts (trigger, backdrop, content, title, close). The app renders and styles it in the web view, and it looks and behaves the same on every platform. You trade the native look and feel for full control over the markup.

6: Probably not. A button needs no special native code: a plain `<button>` already works everywhere, and the page uses plain `<button>`s right next to the `os` components. The `os` namespace seems saved for things only the platform can do well, like system sheets, camera and PDF rendering. I'm moderately sure; it might exist if they want truly native buttons, but nothing here hints at that.

Confidence: 3/5

Tools used: none
