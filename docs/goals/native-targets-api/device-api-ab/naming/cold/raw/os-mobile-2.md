1: `os` looks like a set of components that show the phone's own built-in screens and controls instead of ones Markless draws itself. `os.sheet`, `os.camera` and `os.pdf` would be the real iOS/Android bottom sheet, camera preview and PDF viewer. I'm fairly sure of this.

2: It's imported from the `@markless/os` package. That's a separate package from `@markless/ui` (Markless's own drawn components) and from `@markless/device` (hardware access like `camera()`, which returns the handle passed to `el={cam}`).

3: Mostly Apple and Google. On iPhone it should be a UIKit/SwiftUI sheet with the system detents, grabber and spring animation, and on Android a Material bottom sheet with Android's own motion. The app only controls whether it's open and what goes inside it. I'm moderately sure, and I'd guess there are a few options like detent heights.

4: The website can't use native screens, so I'd expect web versions. `os.sheet` would probably be an HTML dialog or a bottom sheet drawn in CSS, `os.camera` a `getUserMedia` video preview (after the browser asks for permission), and `os.pdf` the browser's built-in PDF viewer in an iframe/embed. I'm less sure here: some of these could also show nothing, or a "not supported" fallback.

5: `drawer` comes from `@markless/ui`, so Markless draws and animates it the same way on every platform, and you build it from parts like trigger, backdrop, content, title and close. `os.sheet` is one native element where the OS supplies the backdrop, drag handle and dismiss gestures. The drawer looks consistent everywhere and you can style it fully, while the sheet feels native but you control less of it.

6: Probably not, or at least it wouldn't be needed. A plain `<button>` already maps to a normal tappable control, and the `os` items seem limited to whole system screens or views you can't reasonably build yourself (sheets, camera, PDF, maybe maps, share sheet, date picker). I'm about 60% sure, since some native frameworks do expose a native button.

Confidence: 3/5

Tools used: none
