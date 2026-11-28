1: The tabs tags (`tabs.root`, `tabs.list`, `tabs.trigger`, `tabs.content`) come from the `@markless/ui` package, imported as `tabs`. `base.button` also comes from `@markless/ui`, imported as `base`. The tag that shows the camera is `<video>`, a plain HTML tag. Its `src` is the `camera()` object from `@markless/device`, not a URL. The tag that shows the PDF is `<embed>`, also plain HTML, and its `src` is the `pdf('/guide.pdf')` object from `@markless/device`. `button` and `img` are plain HTML (as are `div` and `p`). Markless itself contributes no tags here, only the `@{}` and `@if` syntax and `state()`. I'm guessing that Markless knows how to turn a device object passed as `src` into something the tag can show.

2: The author styles the camera preview (`class="preview"` on `video`), the PDF (`class="document"` on `embed`) and the photo (`class="photo"` on `img`). The page writes no class on the buttons, the tabs or `base.button`, so those get default or package styling. The insides the author cannot style are the PDF in `embed` and the camera picture in `video`. The author can size and place the outer box, but the PDF pages and their scroll/zoom chrome are drawn by a viewer (the browser's PDF plugin, or a native PDF view in the apps). The camera picture is a stream of pixels from the device. CSS on the page does not reach inside either one. On iPhone and Android I'm guessing both are native views placed over the page, which would make them even more opaque.

3: These have behaviour of their own:

- **Tabs:** `tabs.*` track which tab is selected (starting from `value="camera"`). They switch content on click and almost certainly handle arrow-key moves between triggers, with ARIA roles. The keyboard part is a guess from what tab components usually do.
- **`base.button`:** a toggle with a pressed state and an `onChange` event. I'm guessing it sets `aria-pressed` and handles Space/Enter.
- **`video` with the camera:** it runs a live feed, and its readiness and facing are driven by `cam`.
- **`embed` with the PDF:** a viewer with its own scrolling, and possibly zoom. The page number is held on `doc`, not on the tag.
- **Plain `button`:** only native click and keyboard activation; the page adds the handlers.

`img`, `div` and `p` are boxes with no behaviour.

4: For the camera tag, the visitor most likely gets the browser's camera permission prompt, then a live preview in the `video` (front or back camera, depending on `facing`). Take photo stays disabled until the camera is ready, or forever if permission is refused. Nothing in the code shows what appears on refusal or with no camera, so that is a guess. For the PDF tag, they most likely see the browser's built-in PDF viewer showing `/guide.pdf`, with the page's own "Page X of Y" text and Previous/Next buttons underneath. I'm guessing that changing `doc.page` jumps the viewer to that page, perhaps through a `#page=` fragment. Whether a browser without a PDF viewer gets a fallback can't be told from the code.

5: Yes in the source, and probably on the website. It is written as the lowercase HTML tag `video`, not imported from anywhere. On the website it is likely a real `<video>` element playing the camera stream. On iPhone and Android I can't tell: the same tag may be swapped for a native camera view, and nothing in the code says which.

6: For question 1, 4/5. The imports and the HTML tag names make it clear, but "a device object as `src` on a plain tag" is my reading of an unusual pattern. For question 5, 3/5: I'm sure about the source and the website, but not the apps. To be sure I'd need to know what `camera()` and `pdf()` return. I'd also need to know how Markless handles a non-string `src` on `video` and `embed`, and whether the iPhone and Android builds output real HTML elements (in a web view) or native views for these tags.

7: It only shows the picture. Nothing calls a record or start/stop method, there's no `muted` or `controls`, and the only capture call is `takePhoto()`. Whether `camera()` could record if asked can't be told from this page.

8: It is disabled until `cam.ready`. When pressed, it awaits `cam.takePhoto()`, which takes a still frame from the active camera (front if toggled on, otherwise presumably back). The result goes into `photo`, so `@if (photo)` then shows it in `img` from `photo.url`. Each press replaces the previous photo. The photo comes from the device camera: the browser's camera stream on the website, the phone's camera on the apps. Whether it is also saved to the gallery or uploaded can't be told; nothing here saves it, and `url` is probably a local object/blob URL (a guess).

9: Partly.

- **Camera panel:** a live camera preview, a "Take photo" button, a "Front camera" toggle, and the last photo once one is taken.
- **Document panel:** the PDF `/guide.pdf`, a "Page N of M" line, and Previous/Next buttons that disable at the first and last page.
- **Tabs:** two tabs, "Camera" (selected first) and "Document".

What I can't tell from the markup:

- what the tabs, buttons and PDF viewer look like (the classes are defined elsewhere)
- whether the PDF shows one page at a time or a scrolling document
- whether the browser or native viewer adds its own toolbar
- what shows before the camera is ready or after permission is denied
- whether the camera mirrors the front-facing preview
- whether the panel in the hidden tab stays mounted (keeping the camera on) or is removed

Tools used: none
