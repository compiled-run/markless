1: The `tabs.root`, `tabs.list`, `tabs.trigger` and `tabs.content` tags come from the `@markless/ui` package. They are parts of the `tabs` component, imported on line 11. `base.button` also comes from `@markless/ui`, which suggests a "base" set of plain building blocks. `cameraview` shows the camera and comes from `@markless/device`, imported on line 12. `pdfview` shows the PDF and also comes from `@markless/device`. `button` and `img` are plain HTML. None of these tags comes from Markless itself (`@markless/core` only supplies `state`). One guess here: `cameraview` and `pdfview` are lowercase like HTML tags, but neither exists in HTML. I am treating them as references to the imported names, not as built-in tags.

2: The author styles the tags that have a `class`: `cameraview` ("preview"), `pdfview` ("document") and `img` ("photo"). The author could also style `button`, `base.button` and the `tabs` parts, but this page doesn't. The inside of `cameraview` and `pdfview` is probably not stylable. On iPhone and Android these most likely draw a native camera view or document view, which the system draws, not HTML. On the web they likely become a `<video>` element and a browser PDF viewer or `<iframe>`, whose inner parts CSS cannot reach. So `class` probably sizes and positions the outer box only. This is a guess: the code only shows that `class` is accepted.

3: These tags have behaviour of their own:

`tabs.*`: they track the selected value, switch which panel is shown, and very likely handle the arrow keys and the ARIA roles that tabs need.

`base.button`: it is a toggle. It takes `pressed` and fires `onChange`, so it presumably handles click, keyboard and `aria-pressed`.

`cameraview`: it shows the live feed from the `camera()` handle passed in `el={cam}`. The camera state itself (`ready`, `facing`, `takePhoto`, `flip`) lives on `cam`, not on the tag.

`pdfview`: it loads the file, shows the page it is given, and reports `onLoad` with `info.pages`. It may also handle scrolling or zooming, but that is a guess.

`button` and `img` are plain HTML. They have only the browser's built-in behaviour, and all of their logic here comes from the author's handlers.

`div` and `p` are boxes with no behaviour.

4: Camera tag: most likely a `<video>` showing the webcam through the browser's camera access, after the browser asks for permission. Until then, or if the visitor refuses or has no camera, they probably see an empty or placeholder box. In that case `cam.ready` stays false, so "Take photo" stays disabled. PDF tag: probably the browser's built-in PDF viewer, or a page drawn by a PDF library, showing page `page` of `/guide.pdf`. Both are guesses, because nothing in the code shows the web fallback.

5: No, as far as I can tell, with some doubt. `cameraview` is a name imported from `@markless/device`, not an HTML tag, and the same code also renders as native iPhone and Android views. On the website it may well output a real HTML element such as `<video>`, but the tag in the source is a package component.

6: I am 4 out of 5 sure on question 1. The imports make it clear where each tag comes from, but it is a guess that lowercase imported names are used as component tags. I am 3 out of 5 sure on question 5. To be sure I would need to know:

How `.tsrx` decides between a lowercase imported name and an HTML tag.

What `cameraview` actually outputs on each platform (native view, `<video>`, or a placeholder).

Whether `class` reaches the inner element or only an outer box.

What the web fallback is for both tags.

Tools used: none
