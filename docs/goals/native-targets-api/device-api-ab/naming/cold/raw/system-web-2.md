1: `system` looks like a set of components that put the phone's own built-in screens and controls on the page: the operating system's sheet, camera viewfinder and PDF viewer, rather than ones Markless draws itself. You use it like a component library (`system.camera`, `system.pdf`, `system.sheet`), but each part probably wraps something the platform already provides. I'm fairly sure of this, mostly because of the name and the package it comes from.

2: It's imported from the `@markless/system` package, which sits apart from `@markless/ui` (the framework's own components) and `@markless/device` (hardware access such as the `camera()` handle). My guess is it's the bridge layer that hands each part to the platform the app is running on. The import itself is certain; what the package does inside is my reading.

3: I'd say the operating system decides: iOS on the iPhone and Android on the Android phone. So the sheet would slide up and snap the way a native sheet does on each phone, and I'd only control what goes inside it (`<Filters />`) and whether it's open. I'm moderately sure, since that seems to be the whole point of calling it "system" instead of putting it in `ui`.

4: My best guess is that the website gets the closest browser equivalent of each. The sheet probably becomes a `<dialog>` or a panel that slides up, the camera probably becomes a live video preview using `getUserMedia` (the browser's camera API) that asks for permission, and the PDF probably shows in the browser's built-in PDF viewer, an iframe or embed. I'm less sure here: the sheet might just be a styled modal, and the camera could fall back to a file picker.

5: The `drawer` comes from `@markless/ui`, so Markless renders it the same way on every platform. I build it from its parts (trigger, backdrop, content, title, close), and I or the framework's default CSS control how it looks and moves. `system.sheet` is a single component whose look and motion come from the operating system. It also has no trigger part, so I open it from my own button by setting `filtersOpen`. I'm fairly sure of this split.

6: Probably not, though I'm unsure. A plain `<button>` already works everywhere, and the page uses ordinary `<button>` elements, so `system` seems kept for things the platform does in a special way: sheets, the camera, document viewers. Then again, if `system` means "the platform's native control", a native button could exist for apps that want buttons that look exactly like iOS or Android ones, so I'm only about 50/50.

Confidence: 3/5

Tools used: none
