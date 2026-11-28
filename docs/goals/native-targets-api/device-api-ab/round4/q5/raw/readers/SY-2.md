1: All three probably exist in the website build. The page uses them with no platform check, and the only platform-specific part is the iOS note. What a website visitor gets is my guess, because the code does not show it.
- `system.camera`: yes (likely). The visitor sees the browser's live camera feed after the browser asks for camera permission. `takePhoto` grabs a frame from it. `cam.ready` stays false until access is granted, and `flip` switches between the front and back cameras where the device has both.
- `system.sheet`: yes (likely). The visitor gets whatever the browser offers in place of a phone bottom sheet, probably a native `<dialog>` popup. The heading and filter buttons inside it are the author's.
- `system.pdf`: yes (likely). The visitor sees the browser's built-in PDF viewer showing `/guide.pdf`, with its own toolbar and scrolling.

2: (c). `system` stands for things the platform draws itself: the iPhone or Android control in the apps, and the browser's own version on the website. Three things point this way. It is listed next to `base` and `drawer`, which look like the library's own headless parts, and those are what the author styles. It is used for things operating systems ship themselves (camera preview, modal sheet, PDF viewer). And the `platform.ios` check shows the code expects to run on more than one platform. (a) or (b) alone would not fit one codebase that builds both apps and a website.

3: Somewhat. "System" sits right next to "design system", and on its own `system.button` could read as "our design system's button". Here the contrast with `base` and `drawer` in the same `@markless/ui` import, and names like `camera` and `pdf`, push it toward "the platform's own UI". A reader seeing only `<system.sheet>` could still misread it.

4: For the Filters sheet, the system (the operating system or browser) decides the frame: its shape, the slide-in animation, the grabber and the backdrop. The author supplies only what goes inside and controls whether it is open. For the Comments drawer, the page's author decides. It is built from separate `drawer.*` parts with the author's own `class="comments"`, so it looks the way the author styles it. I assume the parts come unstyled.

5: 3. I am fairly confident in (c) for question 2, maybe a 4. I am less sure what each control gives a website visitor in question 1, especially the sheet, so call that a 2–3.

Tools used: none
