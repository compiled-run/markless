1: `native` is a namespace object that holds components which render real platform views instead of HTML. These are things like the system camera preview, the system PDF viewer and the OS modal sheet (UISheetPresentationController on iPhone, a Material bottom sheet on Android). I'm reading it as "embed the real native control here," the way you would drop a platform view into a cross-platform app.

2: It is imported from the `@markless/native` package, which is separate from `@markless/ui` (the headless, framework-drawn widgets) and `@markless/device` (hardware APIs like `camera()`). My guess is it's a first-party Markless package that bridges to the iOS and Android SDKs. I'm fairly sure of the import, less sure of how it's built inside.

3: Mostly the operating system decides. On iPhone you would get the standard iOS sheet with its detents, grabber, swipe-to-dismiss and system animation, and on Android you would get the Material bottom sheet's look and drag behaviour. The app supplies the content (`<Filters />`) and the open state, and maybe a few options, but not the chrome or the motion. Moderately sure.

4: My best guess is that the web gets a fallback for each one. `native.sheet` likely becomes an HTML dialog or a bottom-sheet-style overlay. `native.camera` likely becomes a `getUserMedia` video preview, which needs camera permission in the browser. `native.pdf` likely becomes the browser's built-in PDF viewer in an iframe or embed. It's also possible some of these render nothing or a placeholder on the web, so I'm only about 50% sure here.

5: `native.sheet` hands the whole presentation to the OS, so it looks and behaves differently on iPhone and Android and you don't style its parts. `drawer` comes from `@markless/ui`. It's a headless component the framework draws itself in the web view, built from parts you compose and style (trigger, backdrop, content, title, close), so it looks the same on every platform and you control it fully. Also, the sheet is opened from code here, while the drawer comes with its own trigger button.

6: I'd guess no, or at least that it isn't the point of the package. A plain `<button>` already works everywhere, and `native` seems to hold only the things HTML can't do well or that need the platform's own UI, like camera, PDF and system sheets. If it did exist, it would mean a real UIButton or Material button, which is rarely worth it. About 65% sure.

Confidence: 3/5
Tools used: none
