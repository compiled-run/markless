1: `tabs.root`, `tabs.list`, `tabs.trigger` and `tabs.content` come from the `@markless/ui` package, through the `tabs` namespace import. `base.button` also comes from `@markless/ui`, through the `base` namespace. The camera tag, `CameraView`, and the PDF tag, `PdfView`, come from `@markless/device`; they are capitalized imports, so they are components rather than HTML. `button` and `img` are plain HTML, since they are lowercase and not imported. Nothing here is a Markless-core tag: only `state` comes from `@markless/core`, and the `@if` block is template syntax, not a tag.

2: The author puts a `class` on `CameraView` ("preview"), `PdfView` ("document") and `img` ("photo"). The plain `button`s, `base.button` and the `tabs.*` parts have no class here, but they look styleable like any element. I'm guessing for the `@markless/ui` ones that they render real DOM the author can target. Two tags probably have an inside the author cannot style: `CameraView` and `PdfView`. The `class` likely reaches only the outer box. The live camera feed is drawn by something the page's CSS does not reach: a native camera surface on iPhone and Android, or a video stream on the web. The PDF pages are drawn by a viewer, which could be a native PDF view, an iframe/embed or a canvas, so the author can size and place it but not style the text and page chrome inside. This is inferred from what these tags do, not from the code.

3: These carry behaviour of their own:
- `tabs.root`, `tabs.list`, `tabs.trigger` and `tabs.content` handle the selected tab, arrow-key movement, ARIA roles and showing or hiding panels. `value="camera"` sets the starting tab.
- `base.button` is a toggle button: it has a `pressed` state and fires `onChange`, so it probably handles `aria-pressed`, click and keyboard itself.
- `CameraView` runs the live preview and is tied to the `camera()` handle through `el={cam}`. That handle exposes `ready`, `facing`, `takePhoto()` and `flip()`.
- `PdfView` loads and renders the PDF, shows the page given by `page`, and reports `info.pages` through `onLoad`.

The plain `button` has only the native button behaviour plus the click handlers the author wrote. `img` is a box with no behaviour.

4: This is a guess. For the camera tag, the website most likely asks for camera permission through the browser (getUserMedia) and shows the live video. If permission is refused or there is no camera, it shows a blank or fallback box, and `cam.ready` stays false, so "Take photo" stays disabled. For the PDF tag, the website most likely shows `/guide.pdf` using the browser's PDF viewer or a JavaScript renderer, at page 1, with "Page 1 of N" once it loads. Until `onLoad` fires the text reads "Page 1 of 0" and both buttons are disabled. The code does not say what the web fallback is.

5: Can't tell. It is a component imported from `@markless/device`, not an HTML tag name. It accepts `class` like an element would. On the website it probably renders a wrapper around a `<video>`, but on iPhone and Android it may be a native view placed in or over the page. Nothing in the code shows what it renders to.

6: For question 1, 4 out of 5. The imports make the sources clear; the only doubt is whether lowercase `button` and `img` are mapped to native controls on the phone builds. For question 5, 2 out of 5. To be sure I would need the docs or type definitions for `CameraView` and `PdfView`: what they render on each platform (a DOM element, a native view or a video), whether `class` reaches only an outer box, and what the website shows when the feature is missing or permission is refused.

Tools used: none
