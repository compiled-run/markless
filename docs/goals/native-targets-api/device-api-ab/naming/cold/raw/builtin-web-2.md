1: My guess is that `builtin` is a set of components that hand the job to whatever the platform already has, instead of drawing it in HTML and CSS. So `builtin.sheet` would be the phone's own bottom sheet, `builtin.camera` the device camera view, and `builtin.pdf` the system's PDF viewer. The name reads to me as "the thing the platform already gives you." I'm fairly sure of this, about 4/5.

2: It's imported from its own package, `@markless/builtin`, separate from `@markless/ui` and `@markless/device`. Under the hood I'd expect each component to map to whatever each target has: the iOS and Android system components in the apps, and the browser's own elements on the website. I'm moderately sure about the mapping part, since the import line is all I can see.

3: I'd guess the operating system decides, meaning Apple's iOS design on iPhone and Google's Android design on Android, not the app author or Markless. That would be the point of calling it "builtin" and keeping it out of the `ui` package. So it would look and slide differently on each phone, the way each platform's own sheets do. About 3.5/5, because the prop list I can see is only `open` and `onChange`, which fits but doesn't prove it.

4: On the website I'd expect each one to become the nearest thing the browser offers. For `builtin.sheet` that's probably a `<dialog>` or a panel styled to look like a sheet. For `builtin.camera` it's likely a `<video>` fed by `getUserMedia`, which asks the visitor for camera permission, or a file upload input as a fallback. For `builtin.pdf` it's most likely the browser's own PDF viewer in an iframe or embed. I'm least sure about this answer, about 2.5/5, because the page gives no hint of what happens on the web.

5: `drawer` comes from `@markless/ui`, so I'd read it as a headless component that the app draws itself. You put the trigger, backdrop, content, title and close button together, and it looks and behaves the same on every platform. `builtin.sheet` is one tag with no parts, and it hands the look and the motion to the platform. So `drawer` means you style and control it, and `builtin.sheet` means the system does it for you. Fairly sure, about 4/5.

6: Probably not, or at least it wouldn't be needed. A plain HTML `<button>` already works everywhere, and the page uses ordinary `<button>` tags right next to the builtin components. `builtin` seems to be kept for things HTML can't do well or that each platform does its own way: sheets, camera, PDF. That said, a `builtin.button` for the system's own button style isn't impossible, so I'd put this at 3/5.

Confidence: 3/5

Tools used: none
