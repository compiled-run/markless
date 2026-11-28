1. **Which would work.** I'd expect X to work and Y probably not to. In JSX, a dotted tag like `<device.camera>` refers to a value in scope, so `device.camera` resolves to something the package exports, presumably a component. A bare lowercase tag like `<camera>` is normally a built-in element name, so the compiler would emit a literal unknown `<camera>` DOM element and never touch the imported `camera` function. The guidance never says that Markless resolves lowercase tags to bindings in scope, so I can't count on that. I'm also unsure about X: it calls `device.camera` as a function (`device.camera()`) and then uses the same name as a tag. That only works if the export is both a factory and a component, and the guidance doesn't describe anything like that.

2. **Where the `camera` tag comes from.** My best guess is that Y wants the tag bound to the imported `camera`, as though Markless's compiler resolves lowercase tags to bindings in scope. Under standard JSX rules it would come from nowhere: it would just be an HTML-like intrinsic element called "camera", unrelated to the import.

3. **What confused me.**
   - In both spellings, the same name is used twice: `const cam = camera();` (or `device.camera()`) and then `<camera el={cam} />`. Is it a function that creates a camera handle, a component, or both?
   - The `el={cam}` prop also confused me. `el` suggests an element handle, like `element` from `@markless/core`. But here `cam` comes from the camera call, so I can't tell whether `cam` is the camera stream/controller or a DOM handle the tag fills in.
   - In Y specifically, `<camera el={cam} />` reads like a built-in HTML element.

4. **Which I'd rather use.** X. `device.camera` makes it obvious that the tag comes from the import, it can't be mistaken for a built-in HTML element, and grouping features under `device.` scales to other features like `device.geolocation`. I'd still rather the tag and the factory had different names, for example a capitalised `<device.Camera>` for the tag, so it's clear which one is the component.

Tools used: none