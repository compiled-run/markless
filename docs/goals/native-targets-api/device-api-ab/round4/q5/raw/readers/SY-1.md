1: All three probably exist in the website build, though nothing in the code proves it. None of them sits inside a platform check, while the iPhone-only line is wrapped in `@if (platform.ios)`, so I read them as rendering on every build. That last part is a guess.
- `system.camera`: probably yes. A visitor likely gets a live camera preview from the browser's own camera access, with the usual permission prompt. `cam.ready` and `cam.flip()` suggest it also handles devices with no camera or only one, such as a laptop webcam. I'm guessing at how that works.
- `system.sheet`: probably yes. A visitor likely gets the browser's own modal dialog, something like the native `<dialog>` element, holding the filter buttons. On the phone apps it would be the iPhone or Android bottom sheet. Guess.
- `system.pdf`: probably yes. A visitor most likely gets the browser's built-in PDF viewer embedded in the page. Guess.

2: (c). `system.*` sits next to `base.*` and `drawer.*`, which look like the framework's own unstyled building blocks. The names (camera, sheet, pdf) are all things a platform already draws itself, so I read `system` as "let the platform draw this": the iPhone or Android control in the apps, and the browser's built-in element on the website. (b) would leave the website with nothing, and the page doesn't guard against that, which is why I picked (c).

3: Somewhat. It is imported from `@markless/ui` alongside other component groups, and "system" is a common word in "design system", so a reader could take it for a styled component library. But the members are platform-provided features (a camera, a PDF viewer, a system sheet), not a styled kit like buttons and cards. That points away from the design-system reading.

4: For the Filters sheet, the system decides how it looks: the sheet itself, its presentation, animation and dismiss gesture. The author decides only what goes inside (the heading and buttons). For the Comments drawer, the page's author decides. It is built from separate parts (trigger, backdrop, content, title, close) with the author's own class (`comments`), which reads as an unstyled component the author styles. I'm inferring both from the names.

5: 3 out of 5. The `@if (platform.ios)` guard is decent evidence that unguarded elements run everywhere. What each one actually turns into on the website is a guess.

Tools used: none
