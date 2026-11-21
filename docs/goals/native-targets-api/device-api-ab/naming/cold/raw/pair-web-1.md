1: `ios` and `android` look like namespaces of components that each render a real native control from that phone's operating system. So `ios.sheet` would be a real iOS bottom sheet and `android.camera` a real Android camera view, as opposed to HTML made to look like one. I'm fairly sure of this, maybe 4 out of 5.

2: They come from the `@markless/ios` and `@markless/android` packages, which I'd guess are platform packages that ship with Markless. They seem to be thin bridges onto Apple's UIKit/SwiftUI and Google's Android/Material widgets. I'm sure of the package names, and the bridge part is a reasonable guess.

3: I'd expect the operating system to decide, not my CSS. In the iPhone app, Apple's own sheet sets the look, the drag handle, the snap points and the slide-up motion. In the Android app, Google's Material bottom sheet does the same. I'd probably only pass a few options like height or a grabber setting, and I'm moderately sure about this.

4: My best guess is that the website gets nothing for any of them: the `ios.*` and `android.*` elements render nothing in a browser, just as each one renders nothing on the other phone. That's why the page writes both versions side by side. So on the web the filter sheet, the camera preview and the PDF viewer simply aren't there, while the "Scan receipt" button and the tabs still show. I'm only about 3 out of 5 sure, because the framework could instead fall back to a web dialog, an `<input capture>` or an iframe/`<embed>` PDF.

5: `drawer` comes from `@markless/ui`, so I'd read it as a cross-platform, unstyled component built from regular DOM elements, like Radix or a headless UI library. It renders everywhere, including the website, and I style and animate it myself. `ios.sheet` and `android.sheet` hand the job to the real system sheet on each phone, so they feel exactly native but only exist on that platform. Picking which to use is a trade-off between "native feel on phones" and "same thing everywhere, under my control."

6: Probably not, or at least it wouldn't be the normal way to make a button. The page uses a plain `<button>` for "Scan receipt" and "Filter", which suggests ordinary HTML elements already turn into suitable controls on each platform. The `ios`/`android` namespaces seem to exist only for things HTML can't do well, like the system sheet, the camera and the native PDF viewer. I'm moderately confident, because a native button wrapper for special system styles is still possible.

Confidence: 3/5

Tools used: none
