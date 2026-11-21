1: `builtin` looks like a set of components that wrap the phone's own native UI pieces, such as the system bottom sheet, the camera view and the PDF viewer. You use them like ordinary tags, but each one probably shows the real iOS or Android version instead of something drawn with HTML. I'm about 3.5/5 sure of this, mostly because of the name and because it sits next to `@markless/device`.

2: It comes from the `@markless/builtin` package, which I'd guess is part of Markless itself. That package probably connects each tag to whatever the platform already provides: UIKit/SwiftUI on iPhone, Android's own components on Android, and some browser fallback on the web.

3: My guess is the operating system decides, meaning Apple's design on iPhone and Google's Material design on Android. Markless just asks for "a sheet" and gets the platform's normal slide-up panel, with its usual drag handle, snap points and swipe-to-dismiss. You probably can't style it much beyond what the platform lets you change. I'm moderately sure.

4: On the website I'd expect fallbacks built from browser features. `builtin.sheet` probably becomes a `<dialog>` or a panel that slides up from the bottom. `builtin.camera` probably becomes a `<video>` preview fed by `getUserMedia` (it asks for camera permission, and `takePhoto` grabs a frame). `builtin.pdf` is probably an `<iframe>`/`<embed>` using the browser's own PDF viewer. I'm less sure here, especially about how close the web sheet looks to the phone one.

5: `drawer` comes from `@markless/ui`, which looks like a headless component library like Radix. You build it yourself from parts (trigger, backdrop, content, title, close), and it renders as your own HTML that you style, so it looks the same on every platform. `builtin.sheet` is one tag that hands the job to the native system sheet, so you control less but get the platform's own feel. You'd pick the drawer when you want control and the sheet when you want it to feel native.

6: Probably not, or at least it wouldn't be needed. A plain `<button>` already works everywhere and the page uses it for every button. `builtin` seems reserved for things HTML can't do well or that phones do much better natively (camera, PDF, system sheets). It could still exist if they want real native buttons, but I'd lean no.

Confidence: 3/5
Tools used: none
