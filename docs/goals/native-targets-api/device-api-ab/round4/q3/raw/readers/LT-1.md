1: The `tabs.root`, `tabs.list`, `tabs.trigger` and `tabs.content` tags come from the `@markless/ui` package, through its `tabs` export. `base.button` also comes from `@markless/ui`, through its `base` export. The tag that shows the camera, `system.camera`, comes from `@markless/ui` through its `system` export. Its `el={cam}` value is the camera handle from `camera()` in `@markless/device`, so the device feature drives a UI-package tag. The tag that shows the PDF, `system.pdf`, also comes from `@markless/ui` through `system`. `button` and `img` are plain HTML, and so are `div` and `p`. None of the tags come from Markless core itself: core only supplies `state()` and the `@{}`/`@if` syntax.

2: The author styles three tags with `class`: `system.camera` ("preview"), `system.pdf` ("document") and `img` ("photo"). Nothing styles the tabs, `base.button` or the plain buttons on this page, though they could take classes. The tags whose inside the author probably cannot style are `system.camera` and `system.pdf`. I'm guessing this from the name "system": they likely draw something supplied by the operating system or browser, like a native camera preview or the built-in PDF viewer. The class would then reach only the outer box (size, position, border), not the pixels or controls inside. The tabs and `base.button` probably render ordinary elements that can be styled, but that is also a guess.

3: These tags carry behaviour of their own:

- **The `tabs` tags** keep track of which tab is selected (starting at "camera"). They likely handle clicks and arrow keys on the triggers and show only the matching content. The keyboard and accessibility details are a guess based on how tabs usually work.
- **`base.button`** is a toggle button. It has a `pressed` state and fires `onChange` when pressed by click or keyboard.
- **`system.camera`** runs a live camera feed tied to `cam`, which has `ready`, `facing`, `flip()` and `takePhoto()`.
- **`system.pdf`** loads and renders the document, shows the page it is given, fires `onLoad` with the page count, and probably handles its own scrolling and zoom.

The plain `button` has only the browser's built-in click and keyboard handling; all its logic comes from the page's `onClick`. `img`, `div` and `p` are boxes with no behaviour.

4: These are guesses. For the camera tag, the visitor probably sees a live video preview from the browser's camera (using the browser's camera API, `getUserMedia`) after a permission prompt. Without permission or a camera, it probably shows an empty or fallback box, and "Take photo" stays disabled because `cam.ready` stays false. For the PDF tag, they probably see `/guide.pdf` shown at the current page, either in the browser's own PDF viewer or drawn by a JavaScript PDF renderer. The Previous/Next buttons change pages once `onLoad` has reported the page count.

5: No. `system.camera` is a dotted component name imported from `@markless/ui`, not an HTML tag name; HTML has no `<system.camera>`. What it renders can't be told from this code. On the website it is probably an HTML `<video>` or similar element; on iPhone and Android it is probably a native camera view, not an HTML element at all.

6: For question 1, 4 out of 5: the imports make the sources clear, apart from how `@markless/device` and `@markless/ui` split the camera work. For question 5, 3 out of 5: "it is a component, not an HTML tag" is solid, but what it renders on each platform is a guess. To be sure, I would need the `@markless/ui` documentation or source for `system.*`, showing what it renders on each platform, how far styling reaches inside it, and how the `el` handle binds to `camera()`.

Tools used: none
