1: The `tabs.*` tags (`tabs.root`, `tabs.list`, `tabs.trigger`, `tabs.content`) come from the `@markless/ui` package, through the `tabs` import. `base.button` also comes from `@markless/ui`, through `base`. `button`, `img`, `div` and `p` are plain HTML. That much is certain from the imports. The camera tag `<camera el={cam}>` is a guess. It is lowercase and HTML has no `<camera>` element. The only `camera` in scope is the function imported from `@markless/device`. So it is either a built-in Markless tag that you hand a device controller through `el={cam}`, or a tag that `@markless/device` provides and that is found by its name. I lean towards a Markless built-in that is linked to the device package. The PDF tag `<pdf>` is not imported and HTML has no `<pdf>`, so it is almost certainly a built-in Markless tag (a guess, but a strong one).

2: The author styles the `camera` tag (`class="preview"`), the `pdf` tag (`class="document"`) and `img` (`class="photo"`). The `@markless/ui` parts and the plain `button`s are left with default or package styling here, but nothing stops the author styling them. The inside of `camera` and `pdf` probably cannot be styled. On iPhone and Android these are most likely native views: the system camera preview and a native PDF renderer. On the web they are probably a video surface and an embedded viewer. The author can size and place the outer box, but cannot reach the pixels or controls inside with CSS. That is a guess based on these being device features with no child markup.

3: Tags with behaviour of their own:
- `tabs.root` holds which tab is selected (`value`).
- `tabs.list` most likely handles arrow-key movement between triggers.
- `tabs.trigger` selects its tab on click or key press.
- `tabs.content` shows or hides itself depending on the selected tab.
- `base.button` is a toggle that tracks `pressed`, fires `onChange` and handles keyboard.
- `camera` runs the live stream. Its state (`ready`, `facing`) lives on the `cam` controller, not on the tag.
- `pdf` loads the file, draws the current `page` and fires `onLoad`.
- `button` has the browser's normal click and keyboard handling but keeps no state.

Boxes with no behaviour: `div` and `p`. `img` only loads and shows an image.

4: This is a guess. For the camera tag, a visitor most likely sees a live webcam preview, after the browser asks for camera permission. If permission is refused or there is no camera, they likely see an empty box, because the Take photo button stays disabled while `cam.ready` is false. Facing may not be supported on a desktop with one webcam. For the PDF tag, they most likely see `/guide.pdf` drawn one page at a time inside the box, either by an embedded viewer or by drawing it in the page. The code can't tell me whether the web version is full-featured or a simpler fallback.

5: Can't tell, but probably not. HTML has no `<camera>` element. On iPhone and Android it is almost certainly a native view and not an HTML element. On the website it might end up as a real element such as `<video>` with a wrapper around it. The tag itself is a Markless or device abstraction, and the code doesn't show what it becomes in the page.

6: For the `tabs`, `base.button`, `button` and `img` parts of question 1, I'm sure: 5. For `camera` and `pdf` in question 1 I'm at 3, and for question 5 I'm at 2. To be sure, I'd need to know how Markless resolves lowercase tags that are not HTML. Specifically: does `<camera>` refer to the imported `camera` binding, or is it a built-in? What is the full set of built-in tags? And what does each target (web, iPhone, Android) turn `camera` and `pdf` into, which also settles what can be styled inside them?

Tools used: none
