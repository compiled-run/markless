1: The `tabs.root`, `tabs.list`, `tabs.trigger` and `tabs.content` tags come from the `@markless/ui` package, through its `tabs` namespace. `base.button` also comes from `@markless/ui`, through its `base` namespace. The tag that shows the camera is `native.camera`, from `@markless/ui` through its `native` namespace. It gets its data from the `camera()` handle in `@markless/device`, passed in through `el={cam}`. The tag that shows the PDF is `native.pdf`, also from `@markless/ui`'s `native` namespace. Plain `button` and `img` are HTML, as are `div` and `p`. None of these tags comes from Markless itself (`@markless/core`); the only thing imported from there is `state`.

2: The author styles `native.camera` (`class="preview"`), `native.pdf` (`class="document"`) and `img` (`class="photo"`). The tabs, `base.button`, the plain buttons, `div` and `p` get no author styling here. I guess the author cannot style the inside of `native.camera` and `native.pdf`. The `native` prefix suggests that on the phone apps the operating system draws the camera feed and the PDF view, so `class` only sizes and positions the outer box. The pixels inside (the camera frames, the rendered PDF page) are not author-made elements a stylesheet can reach. On the website the same may hold if they render inside a `<video>`, a canvas or a browser PDF viewer. This is inferred from the name, not shown in the code.

3: Tags with behaviour of their own:
- The `tabs` tags: `tabs.root` holds which tab is selected (`value`), `tabs.trigger` switches tabs on click and very likely handles arrow keys and accessibility attributes, and `tabs.content` shows or hides its panel.
- `base.button`: a toggle that tracks its `pressed` state and fires `onChange` itself, handling click and keyboard.
- `native.camera`: runs a live preview tied to the `cam` handle, whose `ready`, `facing`, `flip()` and `takePhoto()` show that state lives in the device feature.
- `native.pdf`: loads the file, renders the page given by `page`, and fires `onLoad` with `info.pages`. It probably also handles its own scrolling and zooming (a guess).

The plain `button` has only the browser's built-in click and keyboard activation; its state lives in the page code. `img`, `div` and `p` are boxes with no behaviour of their own.

4: This is a guess, because the code says nothing about the web build. For the camera tag, I expect the website to ask for camera permission and then show the webcam feed, probably in a `<video>` element. If there is no camera or permission is denied, it would show nothing or a fallback, and "Take photo" stays disabled while `cam.ready` is false. For the PDF tag, I expect `/guide.pdf` to appear in the browser, either through its built-in PDF viewer (an iframe or embed) or as a page drawn by a script, starting at page 1. "Page 1 of N" would show once `onLoad` reports the page count.

5: Can't tell. `native.camera` is a component from `@markless/ui`, not an HTML tag name; there is no `<camera>` element in HTML. On the website it probably renders down to some HTML element such as `<video>` or a wrapper `<div>`. On iPhone and Android, the name `native` suggests a platform camera view rather than an HTML element. The code shows neither.

6: For question 1 I'd say 4 out of 5. The imports make the sources clear; the one doubt is whether `native.*` is truly part of `@markless/ui` or just re-exported there from Markless or `@markless/device`. For question 5 I'd say 2 out of 5. To be sure I would need the `@markless/ui` documentation for the `native` namespace: what `native.camera` and `native.pdf` render on each platform (web, iOS, Android), what `class` applies to, and what the web fallback is.

Tools used: none
