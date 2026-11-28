1: The `tabs.*` tags (`tabs.root`, `tabs.list`, `tabs.trigger`, `tabs.content`) come from `@markless/ui`, because `tabs` is imported from there. `base.button` also comes from `@markless/ui`. `button` and `img` are plain HTML.

The camera tag `<camera>` is lowercase and not HTML. I guess it is tied to `@markless/device`, since its name matches the imported `camera()` and it takes that handle through `el={cam}`. It could also be a Markless built-in tag that renders a device handle, so this is a guess.

The PDF tag `<pdf>` is lowercase but is not imported from anywhere, and HTML has no `<pdf>` element. So my best guess is that it is built into Markless itself, but nothing in the code proves that.

2: The author styles `camera` (`class="preview"`), `pdf` (`class="document"`) and `img` (`class="photo"`). The `button`s and `base.button` take no class here, though they could. The `tabs` tags are unstyled, so presumably they rely on package defaults.

The insides of `camera` and `pdf` are probably the ones the author cannot style. The class most likely sizes and places the outer box only. What is inside is drawn by something else: the live camera picture comes from the native or browser camera, and the PDF pages come from a viewer, which may be a native view or an embedded one like an iframe. Page CSS would not reach either. This is a guess based on what such surfaces usually are.

3: These tags have behaviour of their own:

`tabs.root`/`list`/`trigger`/`content`: they track which tab is selected, probably handle arrow keys between triggers, and show or hide content panels.

`base.button`: a toggle button with a `pressed` state and an `onChange` event.

`camera`: shows a live stream tied to the `cam` handle (`ready`, `facing`, `flip`, `takePhoto`).

`pdf`: loads the file, renders the page given in `page`, and fires `onLoad` with info such as `pages`.

`button`: native click and keyboard activation only. The page's state lives in the author's code, not in the tag.

`img`, `div` and `p` are boxes with no behaviour (`img` just loads its source).

4: For the camera, the visitor most likely sees a live video preview from the browser camera after the browser asks for permission. The Take photo button stays disabled until `cam.ready` is true. If the visitor has no camera or refuses permission, I would expect an empty or fallback box and a disabled button.

For the PDF, they most likely see page 1 of `/guide.pdf` in a web PDF viewer, either built in or embedded, with "Page 1 of N" once it loads. Both answers are guesses; the code does not say what the website gets.

5: No. HTML has no `<camera>` element, and the tag takes `el={cam}`, which is a JavaScript device handle rather than an HTML attribute value. It is a Markless or `@markless/device` tag. On the website it may produce a `<video>` element or a custom element underneath, but the tag itself is not standard HTML.

6: For question 1 I am about 3/5 sure. `tabs`, `base`, `button` and `img` are certain. Where `camera` and `pdf` come from is a guess: `camera` is lowercase but shares its name with an import, and `pdf` is not imported at all. To be sure I would need to know whether a lowercase tag in `.tsrx` can resolve to an imported binding, and what Markless's list of built-in tags is.

For question 5 I am about 4/5 sure. I would need to know whether Markless maps `<camera>` to a registered custom element or a native view, and what DOM it produces on the website.

Tools used: none
