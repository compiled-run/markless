1: `native` looks like a namespace object of components that wrap the phone's own built-in UI and features: the operating system's real sheet, camera view and PDF viewer. Calling `native.sheet` asks the platform for its sheet; the framework doesn't draw one itself. I'm fairly sure of this; the package name and the contrast with `@markless/ui` point that way.

2: It's imported from the `@markless/native` package, as a single named export `native` that groups the components. It's separate from `@markless/ui`, which holds the framework's own components like `drawer` and `tabs`. It's also separate from `@markless/device`, which seems to hold the device APIs like `camera()` that you call from code.

3: Mostly the operating system decides. On iPhone you'd get Apple's standard sheet, with its slide-up animation, drag handle and swipe-to-dismiss. On Android you'd get Google's standard bottom sheet. The developer controls what goes inside it (here `<Filters />`) and when it opens, but probably not much of its look or motion. Moderately sure.

4: My guess is that each one falls back to the closest web equivalent. `native.sheet` likely becomes a modal or dialog-style panel. `native.camera` likely becomes a camera preview through the browser's camera access (getUserMedia), with a permission prompt. `native.pdf` likely shows the PDF in the browser's built-in viewer, through an iframe or embed. I'm least sure about this answer, because it could also render nothing or a plain link.

5: The `drawer` is the framework's own component, built from HTML, so it looks and behaves the same on every platform. I have to assemble and style its parts myself (trigger, backdrop, content, title, close). `native.sheet` hands the whole thing to the phone's built-in sheet, so I give it only open state and content, with no backdrop or close parts. So the drawer is consistent everywhere and fully mine to style, while the sheet feels like a real iPhone or Android app but I control less of it.

6: Probably not, or at least it wouldn't be essential. A plain `<button>` already works everywhere, and this page uses ordinary `<button>` elements even inside the `native.camera` tab. `native` seems reserved for things HTML can't do well or that only feel right when the platform provides them, like sheets, cameras and PDF viewers. If it did exist, I'd expect it to render the platform's own styled button, but it would be redundant.

Confidence: 3/5

Tools used: none
