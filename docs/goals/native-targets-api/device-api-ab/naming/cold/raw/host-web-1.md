1: `host` looks like a set of components that hand the job to whatever is running the app. On a phone that means the real built-in iOS or Android control, like the system camera view, the native PDF viewer or the native bottom sheet. On the web it means the browser's version. I'd guess "host" means the platform the app runs on, not something Markless draws itself. Fairly sure, about 3.5/5.

2: It's imported from the `@markless/host` package, which is separate from `@markless/ui` (the framework's own drawn components) and `@markless/device` (hardware APIs like `camera()`). I'd expect that package to map each component to the native view on iOS and Android and to a web fallback when built as a website. The import line makes the package certain; how it works inside is my guess.

3: I'd expect the operating system to decide: Apple's sheet style on iPhone, with its detents, swipe-down to dismiss and rounded corners, and Google's Material bottom sheet on Android. The app's code only says whether the sheet is open and what goes inside it. The look and motion come from the platform, not from my CSS. Moderately sure.

4: For `host.sheet` I'd guess a web version, probably a `<dialog>` or a bottom panel that slides up and that the framework provides. For `host.camera`, a `<video>` element fed by `getUserMedia`, with the browser asking the visitor for camera permission, so that `cam.takePhoto()` grabs a frame. For `host.pdf`, the browser's built-in PDF viewer in an iframe or `<embed>`, or maybe just a link. I'm least sure about the sheet and the PDF and could see either one falling back to something plain. About 3/5.

5: `drawer` comes from `@markless/ui`, so it's a headless component the framework builds out of plain DOM. I put it together from parts (trigger, backdrop, content, title, close), style it myself, and it looks and behaves the same on every platform. `host.sheet` is one tag with only `open`/`onChange`, and the platform draws it natively. So the drawer is mine to design and the sheet belongs to the OS. Fairly confident.

6: Probably not. A button is easy to build and style in normal markup, and the page already uses plain `<button>` everywhere. `host` seems to be for things that are hard to fake or that users expect to feel native, like a camera preview, a PDF viewer or a system sheet. If it did exist, it would mean "the system's own button style", which seems unlikely to be worth it. About 3/5.

Confidence: 3/5

Tools used: none
