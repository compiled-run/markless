1: `native` looks like a set of components that render the phone's own built-in UI instead of HTML elements. For example, `native.sheet` would be the real iOS or Android bottom sheet, `native.camera` the real camera preview, and `native.pdf` the system PDF viewer. I'm fairly sure of this, mostly because of the name and because it sits next to `@markless/ui`, which looks like the web-style component library.

2: It's imported from the `@markless/native` package, probably a first-party Markless package that bridges to iOS and Android platform views. It's separate from `@markless/device`, which seems to give you device capabilities like `camera()` as a controller object you call methods on (`cam.takePhoto()`). `native` seems to give you the visual element that shows on screen.

3: My guess is the operating system decides: Apple's own sheet look and gestures on iPhone, and Google's Material bottom sheet on Android. I wouldn't style it myself beyond what goes inside it (`<Filters />`). Markless probably just maps the component onto the platform's built-in control. Moderately sure, maybe 3.5/5, since the docs might expose some options like sheet heights.

4: I'd guess the website gets a web fallback for each. `native.sheet` would become some kind of dialog or bottom panel built in HTML. `native.camera` would probably use the browser camera (getUserMedia in a `<video>`) after a permission prompt. `native.pdf` would likely be an embedded browser PDF viewer, like an iframe or `<embed>`. I'm unsure whether these fallbacks are built in or whether some of them render nothing on the web, so maybe 2.5/5 on this one.

5: The `drawer` comes from `@markless/ui`, so I read it as a regular headless HTML component. I build and style its parts myself (trigger, backdrop, content, title, close), and it looks the same on all three platforms. `native.sheet` is one tag where the platform supplies the look, the animation and the swipe-to-dismiss, so it feels like a real phone app but I control less. The sheet also has no trigger part; my own button opens it by setting `filtersOpen`.

6: Probably not, or at least it wouldn't be needed. A plain `<button>` already works fine on every platform, as this page shows, and `native` seems reserved for things HTML can't do well, like system sheets, camera views and PDF viewers. If it did exist, I'd expect it to be a platform-styled button, but I'd be mildly surprised to see it.

Confidence: 3/5
Tools used: none
