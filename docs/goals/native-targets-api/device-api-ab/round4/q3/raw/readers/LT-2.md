1: The `tabs.root`, `tabs.list`, `tabs.trigger` and `tabs.content` tags come from `@markless/ui`, through its `tabs` export. `base.button` also comes from `@markless/ui`, through `base`. The tag that shows the camera is `system.camera` and the PDF tag is `system.pdf`; both come from `@markless/ui` through `system`. The imports make this clear. `system.camera` is also tied to `camera()` from `@markless/device` by `el={cam}`, so the camera itself comes from the device package and the UI package only displays it. `button`, `img`, `div` and `p` are plain HTML. Markless itself supplies no tags here, only the `@if` block and `state()` from `@markless/core`.

2: The author styles three tags through `class`: `system.camera` ("preview"), `system.pdf` ("document") and `img` ("photo"). The `tabs` tags, `base.button`, the `button`s, `div` and `p` get no styling on this page, though I assume they could take a class too. I think the author cannot style the inside of `system.camera` or `system.pdf`. The `system.` prefix suggests the operating system or browser draws their content: a live camera preview, or a built-in PDF viewer. The author's class then only sizes and places the outer box. This is a guess from the name; no code here shows it.

3: These carry their own behaviour:
- `tabs.*` tracks which tab is selected, switches panels on a trigger click, and probably handles arrow keys and accessibility roles. The arrow keys and roles are a guess.
- `base.button` is a toggle: it has a `pressed` state and fires `onChange`.
- `system.camera` runs a live preview driven by `cam`, which has `ready`, `facing`, `flip()` and `takePhoto()`.
- `system.pdf` loads the file, shows the page given by `page`, and fires `onLoad` with `info.pages`.
- The HTML `button` handles clicks and keyboard focus natively, though its actions here are the author's code.

`div`, `p` and `img` are boxes with no behaviour of their own.

4: This is a guess. For the camera, I expect a browser camera preview, probably a `<video>` fed by the browser's camera API, after a permission prompt. If permission is denied or there is no camera, `cam.ready` probably stays false, the "Take photo" button stays disabled, and the box is empty or shows a placeholder. For the PDF, I expect the browser's built-in PDF viewer, or a rendered page, showing `/guide.pdf`. The code does not say whether the `page` prop is honoured on the web, or whether there is a fallback.

5: Can't tell. The lowercase dotted name `system.camera` is a component from `@markless/ui`, not an HTML tag name. On the website it probably ends up as an HTML element such as `<video>`. On iPhone and Android, `system.` suggests a native view that is not HTML at all. `el={cam}` hands the tag a device object, not a DOM reference, which hints that it is not tied to the DOM.

6: For question 1 I am 4 out of 5 sure, because the imports settle where each tag comes from. What I am unsure of is whether `system.*` really belongs to the UI package or only re-exports device views. For question 5 I am 2 out of 5 sure. To be sure I would need documentation on what `system.camera` renders on each target (web, iOS, Android), what `el` binds to, and whether a styling boundary like a shadow root or a native view surrounds the `system.*` tags.

Tools used: none (only the Read that loaded this prompt)
