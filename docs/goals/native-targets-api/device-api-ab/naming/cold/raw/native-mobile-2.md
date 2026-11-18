1: `native` looks like a namespace of components that draw the phone's own built-in UI, such as the real iOS/Android camera view, the system bottom sheet and the system PDF viewer, instead of web-style elements. It's used like `tabs` and `drawer` (`native.sheet`, `native.camera`), so I read it as a set of components that wrap platform views. I'm fairly sure of this.

2: It's imported from the `@markless/native` package, which is separate from `@markless/ui` and `@markless/device`. My guess is that this package holds the bridge to each platform's UI toolkit: UIKit/SwiftUI on iPhone and Android Views/Compose on Android.

3: Mostly the operating system decides. On iPhone you'd get the iOS sheet with its detents, grabber and swipe-to-dismiss, and on Android you'd get the Material bottom sheet with its own drag and animation. The app author controls only what goes inside it (`<Filters />`) and the open/closed state. I'm moderately sure, since there may be some styling props this page doesn't use.

4: I'd expect a web fallback for each one. `native.sheet` would probably become an HTML bottom sheet or dialog, `native.camera` would probably use the browser's camera through getUserMedia (after asking permission) or a file input, and `native.pdf` would probably open the browser's built-in PDF viewer, likely an embed or iframe. I'm only somewhat sure: the page has no `@if` platform check, which suggests the framework handles the website for you, but some of these could also render nothing or something more basic.

5: `drawer` comes from `@markless/ui`, so it's the framework's own headless component made of parts (trigger, backdrop, content, title, close). It looks and behaves the same on every platform, and you style it yourself. `native.sheet` hands the job to the operating system's real sheet, so it feels native on each phone but you control much less of it. Roughly, it's the difference between your own custom bottom sheet and the system one.

6: Probably not, or at least it wouldn't be needed. A plain `<button>` already works everywhere and the page uses it, so `native` seems to cover only things the web can't do well or that should feel like the platform (system sheets, camera, PDF). If it did exist, it would mean a real UIButton or Material button, but I'd guess it isn't included.

Confidence: 3/5

Tools used: none
