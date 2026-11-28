1: Two kinds of tag here are plain HTML: `button` and `img` (and also `main`, `p`, `h2`, `ul`, `li`). All the dotted tags come from `@markless/ui`. These are the camera tag `system.camera`, the Filters sheet tag `system.sheet`, all the `drawer.*` tags (`root`, `trigger`, `backdrop`, `content`, `title`, `close`) and `base.button`. Markless itself supplies no tags on this page. It supplies only the template blocks (`@if`, `@for`) and `state`. `@markless/device` supplies no tags either. It supplies the `camera()` handle that is passed to `system.camera` through `el={cam}`, plus `platform` and the `Photo` type.

2: I am guessing here. The name `system.*` suggests "let the platform draw this." On a website the platform is the browser, so my guess is that both tags still exist in the website build. A visitor would get a browser camera preview (a video feed after a permission prompt) and a web-drawn bottom sheet or dialog in place of the native one. `disabled={!cam.ready}` hints that the camera can be unavailable or slow to start, which fits a browser permission prompt. The code does not rule out a different answer. On the web, the camera tag might render nothing, and the sheet might fall back to something like `drawer`.

3: Camera preview: the system draws it. The author only places and sizes it through `class="preview"`. Filters sheet: the system draws the sheet itself (its surface, grabber, animation and dismiss gesture), and the author supplies only the content inside it. Comments drawer: the page's author decides. It is built from headless parts, and its look comes from the author's CSS (`class="comments"`).

4: The Filters sheet is a single native, system-drawn surface. The page controls it through state (`open={choosing}` / `onChange`), and it has no trigger, backdrop, title or close parts. The Comments drawer is a headless component made of parts. It manages its own open state: `drawer.trigger` opens it and `drawer.close` closes it. It has an explicit backdrop and a title part, and it presumably looks and behaves the same on every platform with the author's styling.

5: One place: the text inside `<h2>Choose a filter</h2>` on line 32. The sheet has no separate title prop or title part, so nothing else repeats the heading. My guess is that a native sheet might use that `h2` as its accessible title or header, but that would not add a second place to edit.

6: `platform` is imported once and used once: `@if (platform.ios)` shows a note only when the platform is iOS. My best guess is that it means the iPhone app build, because saving to the photo library is a native-app ability. On that reading, only someone in the iPhone app sees the note, not someone using Safari on an iPhone. But the name `platform.ios` could just as easily mean "the device's operating system is iOS." On that reading, Safari visitors on an iPhone would see it too, so the answer would be both. The code cannot tell these apart.

7: Question 2: 2/5. Question 6: 3/5. To be sure, I would need to know three things:
- What `system.camera` and `system.sheet` render in a web build: a web fallback, nothing, or a build error.
- Whether `platform.ios` describes the build target (the native app) or the operating system the code is running on (which would include mobile Safari).
- Whether there is a separate flag for "native app" as opposed to "web on iOS."

Tools used: none
