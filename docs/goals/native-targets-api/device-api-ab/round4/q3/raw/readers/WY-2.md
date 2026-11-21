1: The `tabs.root`, `tabs.list`, `tabs.trigger` and `tabs.content` tags come from the `@markless/ui` package, through its `tabs` namespace. `base.button` also comes from `@markless/ui`, through its `base` namespace. `cameraview`, which shows the camera, comes from `@markless/device`. `pdfview`, which shows the PDF, also comes from `@markless/device`. Both are lowercase like HTML tags, but they are imported names, so they are package components, not HTML. `button` and `img` are plain HTML, along with `div` and `p`. None of these tags comes from Markless itself; core supplies only `state()` and the `@if`/`@for` blocks. I am guessing that a lowercase imported name used as a tag resolves to that import rather than to an HTML element.

2: The author styles `cameraview` (class "preview"), `pdfview` (class "document") and `img` (class "photo") directly. The `tabs` parts, `base.button` and the plain `button`s get no class here, though I would guess the `tabs` parts and `base.button` accept one. There are two tags whose inside I think the author cannot style. `cameraview` shows a live camera feed; on the iPhone and Android apps that is probably a native view drawn by the operating system, and on the web a video stream. `pdfview` shows a PDF drawn by a PDF renderer: a native viewer in the apps, and in the browser probably the built-in viewer or a canvas. In both, the author can size and place the outer box, but the pixels inside come from the device or the renderer, not from page markup that CSS reaches. This is inferred, not shown in the code.

3: These tags have behaviour of their own:
- **`tabs.*`:** they hold which tab is selected (`value`), switch panels on click, and probably handle arrow keys and ARIA tab roles (guess).
- **`base.button`:** a toggle with a `pressed` state and an `onChange` event, probably with keyboard support and `aria-pressed` (guess).
- **`cameraview`:** it shows the stream of the `cam` controller it is bound to through `el={cam}`, so state like `cam.ready` and `cam.facing` lives in the controller.
- **`pdfview`:** it loads the file, shows the `page` it is given, fires `onLoad` with info such as `pages`, and probably handles scrolling and zoom itself.

Plain HTML `button` has only the browser's native click and keyboard handling; the page wires up its events. `img`, `div` and `p` are boxes with no behaviour.

4: On the website, I would guess `cameraview` asks for camera permission through the browser's camera API and, if allowed, shows a live video preview. If permission is refused or there is no camera, I'd expect an empty or fallback box, with "Take photo" disabled because `cam.ready` is false. `pdfview` probably shows page 1 of `/guide.pdf`, drawn by the browser's built-in PDF viewer or a JavaScript renderer, with "Page 1 of N" below it once `onLoad` has fired. The code does not show any of this; it is all a guess.

5: No. HTML has no `<cameraview>` element; this tag is a name imported from `@markless/device`, so it is a package component that happens to be written in lowercase. What it renders to is a separate question I can't answer: on the web it may well output a `<video>` or a custom element, and in the apps a native view.

6: For question 1, my confidence is 4 out of 5 for `tabs`, `base.button`, `button` and `img`, and 3 out of 5 for `cameraview` and `pdfview`. For question 5, it is 3 out of 5. To be sure I would need three things. First, the rule for how Markless resolves a lowercase tag that matches an imported name: does the import win over HTML? Second, what `@markless/device` actually exports for `cameraview` and `pdfview`: a component, a custom element, or a native view. Third, what each of them renders on each target.

Tools used: none
