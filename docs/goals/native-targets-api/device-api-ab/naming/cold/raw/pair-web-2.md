1: `ios` and `android` look like namespaces of components, each one rendering a real phone screen element instead of HTML. So `ios.sheet` is an iPhone-style bottom sheet and `android.sheet` is the Android version of that panel. The same goes for camera and PDF. They work like `tabs.*` or `drawer.*`, but each one is tied to a single phone platform. Fairly sure (4/5).

2: They come from the `@markless/ios` and `@markless/android` packages, which are imported at the top of the file. I'd guess they're official Markless packages that wrap the phone's own building blocks, the ones Swift or Kotlin developers would normally use. Sure about where they're imported from, less sure about what's inside them (3/5).

3: My guess is the phone's operating system decides, not my CSS. On iPhone it would look and slide like an Apple sheet, and on Android like a Google bottom sheet, with each one's own animation and drag-to-dismiss. I only control the content (`<Filters />`) and whether it's open. Moderately sure (3/5).

4: My best guess is that a website visitor gets nothing from any of them. `ios.*` only renders in the iPhone app and `android.*` only in the Android app, which is why the page lists both side by side. So on the website the filter sheet never appears, there's no camera preview (the "Scan receipt" button probably does nothing or falls back to something like a file input), and no PDF viewer shows up. It's also possible the website gets some generic stand-in, but nothing on the page suggests one, so I'm unsure (2/5).

5: `drawer` comes from `@markless/ui`, so I'd read it as a normal web-style component made of HTML parts I can style. It runs on all three builds (website, iPhone and Android) and looks the same everywhere. The sheet is the phone's own component, so it only appears in the phone apps and looks however each platform makes it look. The drawer gives me control and works everywhere, and the sheet gives me the real phone feel. Fairly sure (3/5).

6: Probably not, or at least it wouldn't be needed. The page uses a plain `<button>`, which presumably works on every platform already. These namespaces seem to exist only for things HTML can't do well or that need the phone's own version: the camera, a PDF viewer and a sheet with the phone's own animation. A plain button doesn't need a phone-only version, though I could see one existing if you wanted a phone-styled button. Moderately sure (3/5).

Confidence: 3/5
Tools used: none
