1: The `tabs.root`, `tabs.list`, `tabs.trigger` and `tabs.content` tags come from `@markless/ui`, because `tabs` is imported from there. `base.button` also comes from `@markless/ui`. The tag that shows the camera is `<camera el={cam}>`, and the tag that shows the PDF is `<pdf>`. Neither is imported as a component, and neither is a real HTML element. I guess both are built-in Markless tags, meaning tags the compiler knows and turns into a native view on iPhone and Android. The camera tag is linked to `@markless/device` through `el={cam}`, because `cam` comes from `camera()` in that package. Its name matches the imported `camera` function, but in JSX-style code a lowercase tag is normally intrinsic (built into the framework), not a variable. That last part is a guess. `<pdf>` has no import at all, so it must be a Markless built-in. `button` and `img` are plain HTML, and so are `div` and `p`.

2: The author styles three tags: `<camera class="preview">`, `<pdf class="document">` and `<img class="photo">`. The `tabs` tags, `base.button` and `button` get no classes here, though they could be styled. The author cannot style the inside of the camera tag or the PDF tag, only their outer box (size, position, border, rounding). The camera's inside is a live video feed. The PDF's inside is a page drawn by a viewer, either the system's native viewer on the phones or the browser's viewer or a canvas on the web. Neither inside is made of the author's own elements, so CSS cannot reach it. I'm inferring this from what each tag must contain.

3: These tags carry behaviour of their own:
- `tabs.root` holds which tab is selected, starting from `value`.
- `tabs.list` probably handles arrow keys to move between tabs (a guess based on the usual tabs pattern).
- `tabs.trigger` selects its tab on click or keyboard and sets the selected/ARIA state.
- `tabs.content` shows or hides itself depending on the selected tab.
- `base.button` is a toggle button: it has a `pressed` state, presumably shows it via `aria-pressed`, and fires `onChange`.
- The camera tag runs the live preview and exposes `ready`, `facing`, `flip()` and `takePhoto()` through `cam`.
- The PDF tag loads the file, renders the current `page` and fires `onLoad` with `info.pages`.
- The HTML `button` only has the browser's built-in click, keyboard and `disabled` behaviour.

These are boxes with no behaviour: `div`, `p` and `img` (`img` just shows the image at `src`).

4: This is a guess. For the camera tag, the visitor most likely gets the browser's camera permission prompt and then a live preview, probably a `<video>` fed by `getUserMedia`. If the camera is denied or missing, they would see an empty or fallback box and "Take photo" stays disabled because `cam.ready` is false. For the PDF tag, they most likely see `/guide.pdf` rendered one page at a time, through an `<iframe>`/`<embed>` or a canvas renderer like pdf.js. Below it is "Page 1 of N" with working Previous and Next buttons. Until the file loads, it reads "Page 1 of 0" and Next is disabled.

5: No. HTML has no `<camera>` element. It is a Markless or device tag that gets rendered into something else. On the web that is probably a `<video>` plus a stream, and on the phones a native camera view. On the website, though, it may end up as an HTML element (like `<video>`) in the page, so "no" applies to the tag as written, not to what it renders.

6: For question 1, I'd rate my confidence 3 out of 5. I'm sure about the `tabs` tags, `base.button`, `button` and `img`, but unsure where `camera` and `pdf` come from. For question 5, I'd rate my confidence 4 out of 5, since there is no `<camera>` element in HTML. To be sure, I'd need three things:
- whether lowercase tags like `camera` and `pdf` are a fixed list of Markless built-in tags, or are resolved from imports with the same name (`camera` from `@markless/device`), and why `pdf` needs no import;
- what `el={cam}` means;
- what each tag renders to on the web compared with iPhone and Android.

Tools used: none
