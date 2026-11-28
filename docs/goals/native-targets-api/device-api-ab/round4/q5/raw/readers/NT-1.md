1: All three probably exist in the website build, but that is a guess. The page uses `native.camera`, `native.sheet` and `native.pdf` with no `@if (platform...)` guard around them. The only platform check is the iOS-only line about saving to the photo library. That suggests the author expects all three to render everywhere.
`native.camera`: probably yes. A visitor likely gets the browser's camera preview, a live video feed that asks for camera permission. The `disabled={!cam.ready}` on "Take photo" hints the camera may be slow to start, or unavailable or refused on some devices. I can't tell what happens on a computer with no camera.
`native.sheet`: probably yes. A visitor likely gets the browser's own modal dialog, something like `<dialog>`, rather than an iOS or Android bottom sheet. I'm guessing at the exact look.
`native.pdf`: probably yes, and this is the one I'm most sure of. A visitor likely gets the browser's built-in PDF viewer, as if it were embedded with `<embed>` or `<iframe>`.

2: (c) Whatever the platform the app runs on draws for itself. In the apps that would be the iPhone or Android control, such as the system camera view, the system sheet or the system PDF viewer. On the website it would be the browser's own version. I read it this way because the same unguarded code ships to all three targets, so `native` can't mean only phone controls. It also sits apart from `base` and `drawer`, which look like the library's own author-styled parts.

3: Somewhat. It is imported from `@markless/ui` next to `base` and `drawer`, and used the same way (`native.x`), so on the surface it looks like one more component family or theme. A reader could take it for a design system called "Native". But the word "native" usually means "the platform's own" (as in "native app" or "native controls"). And the things inside it (camera, sheet, pdf) are platform features, not styled widgets. So the meaning "platform-drawn" is the stronger reading, though not a certain one.

4: The system decides how the Filters sheet looks. The author supplies only what goes inside it (the heading and the filter buttons), and the platform draws the sheet itself: its frame, how it slides in and how it is dismissed. The page's author decides how the Comments drawer looks. It is built from separate unstyled parts (`root`, `trigger`, `backdrop`, `content`, `title`, `close`) with author classes like `class="comments"`, so its look comes from the author's CSS.

5: For question 1, 3 out of 5. Existence on the website is inferred from the missing platform guards, and what visitors actually see there is a guess. For question 2, 4 out of 5.

Tools used: none
