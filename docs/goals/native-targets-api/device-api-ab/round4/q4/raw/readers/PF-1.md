1: The tag that shows the camera, `<platform.camera>`, comes from `@markless/device`. `platform` is imported from there, and `camera()` creates the handle passed in through `el`. The Filters sheet tag, `<platform.sheet>`, also comes from `@markless/device` through the same `platform` namespace. The `drawer.*` tags (`root`, `trigger`, `backdrop`, `content`, `title`, `close`) come from `@markless/ui`. `base.button` comes from `@markless/ui` too; it looks like a toggle button because of `pressed` and `onChange`. `button` and `img` are plain HTML. No tag here comes from Markless itself (`@markless/core`), which only supplies `state`.

2: I am guessing here. Both tags are used without any `@if` guard, so I assume they exist in the website build and fall back to web versions. For the camera, I'd expect a browser camera preview, probably a `<video>` element using the browser's camera access, which asks for permission; `cam.ready` stays false until the camera is available. For the sheet, I'd expect a web modal, probably a `<dialog>` or bottom sheet that opens and closes from the same `open` and `onChange`. Another reading is possible: the website might get nothing, or a placeholder, for the camera.

3: The camera preview is mostly the system's: it looks like the native camera view, and the author only sizes and places it through `class="preview"`. The Filters sheet is the system's: the `platform.` prefix and the lack of styling suggest a native iOS or Android sheet whose look the OS owns, while the author supplies only the contents. The Comments drawer is the author's: it is a headless `@markless/ui` component made of parts, styled through `class="comments"` and the author's CSS.

4: The Filters sheet is a native, platform-provided modal. The page controls it directly: the `choosing` state drives `open`, the page must close it itself after a pick, and `onChange` reports when the user dismisses it with a swipe or similar. The Comments drawer is a cross-platform UI component that the author assembles from parts and styles. It manages its own open and closed state: `drawer.trigger` opens it, `drawer.close` closes it, and it has an explicit backdrop and title, with no page state involved.

5: One place: the text inside `<h2>Choose a filter</h2>` within `<platform.sheet>`. I'm assuming the native sheet takes no separate title prop and the `h2` is not also copied somewhere else; nothing in this file suggests otherwise.

6: `platform` is used in four ways:
- In the import, it is a namespace exported by `@markless/device`.
- In `platform.camera`, it means the native or system camera preview element.
- In `platform.sheet`, it means the native or system sheet.
- In `platform.ios`, it is a boolean that is true when running on iOS.

The note appears only under `platform.ios`. My guess is that only someone in the iPhone app sees it, because "save to your library" is a native-app ability and `@markless/device` describes the app build. That is a guess: if `platform.ios` means "the operating system is iOS", a visitor using Safari on an iPhone would see it too.

7: Question 2: 2/5, because I'm inferring a web fallback only from the lack of a guard. Question 6: 3/5, because "iOS" could mean the native app build or the operating system, which changes who sees the note. To be sure, I would need the documentation for `@markless/device`: what `platform.camera` and `platform.sheet` render in the website build, and whether `platform.ios` is true for the iPhone app only or also for iOS browsers.

Tools used: none
