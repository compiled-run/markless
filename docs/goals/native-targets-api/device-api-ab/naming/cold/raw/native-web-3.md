1: `native` looks like a namespace object holding components that wrap the phone's own built-in UI pieces: a camera view, a PDF viewer, a bottom sheet. You use it the way you'd use `tabs.*` or `drawer.*`, as `<native.something>`. I'm fairly sure of this, maybe 4/5.

2: It comes from the `@markless/native` package, imported at the top of the file as `import { native } from '@markless/native'`. That looks like Markless's own first-party package for platform-native components, not something defined in this app.

3: My guess is the operating system decides, meaning iOS on iPhone and Android on Android. The app hands over the content and the open/closed state, and the platform draws its standard sheet with its usual slide-up animation, drag handle and swipe-to-dismiss. So it would look and behave differently on each phone, and the app's CSS probably has little control over it. I'm about 3.5/5 on this.

4: On the website I'd expect some fallback for each one. `native.sheet` probably becomes an HTML `<dialog>` or a bottom-sheet overlay. `native.camera` probably becomes a `<video>` preview using `getUserMedia` (the browser asks for camera permission), with `takePhoto()` grabbing a frame. `native.pdf` probably shows the PDF in the browser's built-in viewer, through an `<iframe>`/`<embed>` or a link. This is the part I'm least sure of (about 2.5/5): any of them could also render nothing, or show a "not available on web" message.

5: The `drawer` comes from `@markless/ui`, a headless component library, so the app builds it from its own parts (trigger, backdrop, content, title, close). It's rendered as ordinary HTML and styled with the app's CSS, so it looks the same on every platform. `native.sheet` is one tag that hands the job to the OS's own sheet, so it looks and feels like the platform but you control much less. The drawer also has its own trigger built in, while the sheet is opened only from state (`filtersOpen`).

6: Probably not, though it might exist. A plain `<button>` already works everywhere, and the page uses one even inside the native tab. `native` seems to be for things HTML can't do well or that need the OS's own look and behaviour (camera, PDF, system sheet). If `native.button` did exist, I'd read it as "the OS's own system button style", but I'd guess it isn't there.

Confidence: 3/5

Tools used: none
