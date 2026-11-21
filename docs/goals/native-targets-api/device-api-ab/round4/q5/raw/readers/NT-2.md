1: native.camera: probably yes. Nothing in the code limits it to the apps, and only the "save to library" note sits behind `@if (platform.ios)`, so the camera seems meant to work everywhere. I'm guessing a website visitor gets a live preview from the browser's camera, the kind of feed a site gets after asking camera permission, and that `cam.takePhoto()` grabs a still from it. native.sheet: probably yes. I'm guessing a visitor gets the browser's own modal dialog, like an HTML `<dialog>`, holding the filter buttons, instead of a phone bottom sheet. native.pdf: probably yes. I'm guessing a visitor sees `/guide.pdf` in the browser's built-in PDF viewer, embedded inline. None of these three is behind a platform check, which is my main evidence that all three exist in the website build. I can't confirm any of the fallbacks from the code.

2: (c) Each platform draws these itself. In the iPhone and Android apps that means the phone's own camera view, sheet and PDF viewer. On the website it means the browser's built-in versions. My reasons: `native.*` sits next to author-built parts (`base.button`, `drawer.*`) and is never guarded by platform, and the page uses `platform.ios` only for behaviour unique to iPhone. If `native` meant phone-only UI, I'd expect platform guards around it.

3: Somewhat. `native` is imported from `@markless/ui` alongside `base` and `drawer`, so it does look like one family in a component library, and someone could read it as a theme or design-system name, like "Material". But the word "native" usually means "provided by the platform", and the three parts are things a platform supplies (camera, sheet, PDF). That pushes against the design-system reading.

4: The system decides how the Filters sheet looks. The author supplies only its content and the open/closed state, and `native.sheet` gets no class. The page's author decides how the Comments drawer looks. It is built from separate parts (trigger, backdrop, content, title, close) and has `class="comments"`, so it is an unstyled component the author styles.

5: Question 1: 3/5. The website fallbacks are inferred, not shown in the code. Question 2: 4/5.

Tools used: none
