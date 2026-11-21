1. **Which would work:** I'd expect only X to work. In JSX-style markup, a dotted tag like `<device.camera>` is read as a JavaScript expression, so it points at the imported `device` object. A bare lowercase tag like `<camera>` is normally treated as a built-in element name, the way `<div>` is. It would not look up the imported `camera` function. HTML has no `<camera>` element, so Y would most likely render an empty, unknown element. Y would only work if Markless's compiler checked whether a lowercase tag names something in scope before treating it as HTML. The guidance doesn't say it does that.

2. **Where `<camera>` comes from:** By normal JSX rules it comes from nowhere: it's just the string "camera", an intrinsic tag. The writer clearly means the `camera` imported from `@markless/device`. That only works if Markless resolves in-scope names ahead of HTML tag names, and I have no evidence that it does.

3. **What confused me:**
   - `<camera el={cam} />` — I can't tell whether this tag is the import or an HTML element.
   - `const cam = camera();` next to `<camera ...>` — one name is both a function that returns a handle and a tag. In X, `device.camera` plays the same double role, which is odd but less ambiguous.
   - `el={cam}` — it's unclear what `el` means. My guess is that `camera()` returns an element handle, like `element()` from `@markless/core`, and the tag attaches the camera to it. Nothing here says so, and it's unclear why the markup needs the handle passed back in.

4. **Which I'd rather use:** X. With `device.` in front, it's obvious where the tag comes from, it follows JSX rules I already know, and a reader can't mistake it for HTML. Y is shorter, but it reads like a native element that doesn't exist, and it would clash with any real or custom element called `camera`.

Tools used: none