1: `builtin` looks like a set of components that wrap whatever the platform already provides, instead of things Markless draws itself. `builtin.camera`, `builtin.pdf` and `builtin.sheet` seem to hand off to the real camera view, the system PDF viewer and the system bottom sheet on each platform. I'm fairly sure of this, about 4/5.

2: It's imported from `@markless/builtin`, a separate package from `@markless/ui` and `@markless/device`. My guess is it's a first-party Markless package that maps each tag to a native view on iOS and Android and to some HTML version on the web. I'm not sure whether the native parts ship inside that package or come from the app shell.

3: My best guess is the operating system: Apple's UIKit/SwiftUI sheet on the iPhone and Google's Material bottom sheet on Android. So the platform decides the slide-up animation, the drag handle, the swipe-to-dismiss and the rounded corners, not me and not Markless. I'd expect I can only control what goes inside it (`<Filters />`) and the open/closed state, maybe with a few options like how tall it gets. About 3.5/5 on this.

4: On the web, `builtin.sheet` probably becomes a `<dialog>`-based modal or bottom panel styled to look like a sheet. `builtin.camera` probably becomes a `<video>` preview fed by `getUserMedia`, with `takePhoto()` grabbing a frame, or maybe a file input with `capture`. `builtin.pdf` probably becomes an `<iframe>`/`<embed>` so the browser's own PDF viewer shows the file. These are educated guesses, about 3/5, especially for what the sheet looks like on the web.

5: `drawer` comes from `@markless/ui` and looks like a headless, Radix-style component made of parts (trigger, backdrop, content, title, close). It's built by the framework in normal markup, so I'd expect it to look and behave the same everywhere and I style it myself. `builtin.sheet` is one tag with no parts, and I think it hands off to the platform's own sheet, so it looks native on each OS and I get less control. In short, `drawer` is my component that I style, and `sheet` is the operating system's component.

6: Probably not, or at least it wouldn't be needed. A plain `<button>` already works everywhere, and the page uses plain `<button>` elements, which suggests ordinary HTML elements are already turned into native controls or are good enough. `builtin` seems to be for things HTML doesn't cover well, like the camera, PDF viewing and system sheets. If it did exist, I'd guess it would force the platform's own button style, but I'm only about 3/5 on this.

Confidence: 3/5
Tools used: none
