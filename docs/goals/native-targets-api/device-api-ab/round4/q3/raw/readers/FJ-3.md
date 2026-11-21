1: The `tabs.root`, `tabs.list`, `tabs.trigger` and `tabs.content` tags come from `@markless/ui`, imported as the `tabs` namespace. `base.button` also comes from `@markless/ui`, from its `base` namespace. The camera tag, `native.camera`, comes from `@markless/ui`'s `native` namespace, but it is driven by `camera()` from `@markless/device`: the camera object is handed to it through `el={cam}`. The PDF tag, `native.pdf`, is also in `@markless/ui`'s `native` namespace; nothing from `@markless/device` is attached to it. `button` and `img` are plain HTML, as are `div` and `p`. None of the tags are built into Markless itself; Markless supplies `state` and the `@if`/`@for` blocks, not tags.

2: The author styles three tags through `class`: `native.camera` ("preview"), `native.pdf` ("document") and `img` ("photo"). The tabs and buttons carry no author styling here. My guess is that the author cannot style the inside of `native.camera` or `native.pdf`. The `native.` prefix suggests the app shows a platform view there: the phone's camera preview or PDF renderer, or on the web perhaps a video element or an embedded PDF viewer. In that case the author's CSS reaches only the outer box (size, position, border), not the content drawn inside. The `tabs.*` tags and `base.button` look like headless parts that render ordinary elements, so they should be fully styleable.

3: These tags have behaviour of their own:
- `tabs.root` keeps track of which tab is selected, starting at "camera" because `value` is set but nothing writes it back.
- `tabs.list` probably handles arrow keys to move between tabs (a guess based on the usual tabs pattern).
- `tabs.trigger` selects its tab on click or key press and probably sets the accessibility attributes (ARIA).
- `tabs.content` shows or hides its panel depending on the selected tab.
- `base.button` is a toggle button. It shows a `pressed` state, handles clicks and keyboard, and reports through `onChange`.
- `native.camera` shows a live preview. Its state (ready, facing, takePhoto) lives on the `cam` object, not on the tag.
- `native.pdf` loads and draws the document, probably handles scrolling and zoom, follows the `page` prop and fires `onLoad`.

These are just boxes: `div`, `p` and `img`. `button` only has the browser's built-in click and focus handling; all of its state comes from the author's code.

4: This is a guess. For the camera tag, the visitor probably sees a live webcam preview after the browser asks for camera permission, likely a `<video>` fed by the browser's camera API (`getUserMedia`). If permission is refused or there is no camera, they may see a fallback or an empty box, with `cam.ready` staying false so "Take photo" stays disabled. For the PDF tag, they probably see `/guide.pdf` in the browser's built-in PDF viewer (an iframe or embed) or drawn by a JavaScript PDF library, fixed to the current page. The code does not say which.

5: Can't tell. In the source, `native.camera` is a package component, not an HTML element: the dotted namespace name and the `el={cam}` binding show that. What it puts on the page depends on the platform. On iPhone and Android it is probably a native camera view with no HTML element at all. On the website it may render an HTML element such as `<video>`. Nothing in the code shows which.

6: For question 1, my confidence is 4 out of 5: the imports make where each tag comes from clear. The one open point is whether `native.camera` belongs to `@markless/ui` or is supplied by `@markless/device` through `el={cam}`. For question 5, my confidence is 2 out of 5. To be sure of both, I would need the docs or type definitions for `native.*` and `camera()`. Those would show what each tag renders on each platform (native view, HTML element or fallback), whether the inside can be styled, and what `el={cam}` actually links.

Tools used: none
