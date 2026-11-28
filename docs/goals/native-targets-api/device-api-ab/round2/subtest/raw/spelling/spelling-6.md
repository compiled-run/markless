1. **I'd expect X to work and Y not to, though I'm not sure about either.** In JSX-style markup, a tag with a dot in it, like `<device.camera>`, is read as a component, even when it's lowercase. So `<device.camera el={cam} />` should point at the imported `device` object. A bare lowercase tag like `<camera>` usually means a native element, the way `<input>` or `<main>` do. The guidance says nothing about Markless looking up lowercase tags among the names in scope. So I'd expect Y to render an unknown `<camera>` element that does nothing, not the imported `camera`. Y works only if the Markless compiler treats an imported lowercase name as a component, and nothing in my guidance says it does.

2. My first guess is that it's an ordinary HTML-style tag. `<camera>` isn't a real HTML element, so it would be an unknown element. The only other way it could work is if the compiler quietly matches it to the imported `camera` binding. If so, that's hidden magic, and the code gives the reader no sign of it.

3. Yes, in two places:
   - In both spellings, one thing is used two ways: `device.camera()` / `camera()` is called as a function, and `<device.camera …>` / `<camera …>` uses the same name as a tag. I can't tell whether `cam` is a stream, a handle or some kind of controller, or why the tag needs it passed back in through `el={cam}`. The name `el` suggests an element handle, like `element()` from core, but `cam` comes from `camera()`, not `element()`.
   - In Y, `<camera el={cam} />` looks exactly like a native element. Nothing in it tells me it's the imported binding.

4. **I'd rather write X.** The `device.` prefix shows where the tag comes from, and the dotted form is unambiguous as a component. A reader can't mistake `<device.camera>` for a native HTML tag, but they could easily mistake `<camera>` for one. Y is shorter, but it relies on a lookup rule my guidance never mentions.

Tools used: none