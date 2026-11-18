1: `ios` and `android` look like sets of components for each platform that wrap the phone's own built-in UI pieces: the real iOS sheet, camera view and PDF viewer, and the Android versions of them. Each one seems to show up only on its own platform, which is why the page lists both side by side. I'm fairly sure of this, about 4/5.

2: They come from `@markless/ios` and `@markless/android`, two packages separate from `@markless/ui` and `@markless/device`. My guess is the Markless team publishes them as platform add-ons, and each one wraps the iOS or Android system components.

3: I'd guess the phone's operating system decides, not me and not Markless. On iPhone it would look and move like a standard Apple bottom sheet, and on Android like a Material bottom sheet. My only controls seem to be `open` and `onChange`. Moderately sure, about 3/5.

4: My best guess is that a website visitor gets nothing from any of the six tags, because each one only renders in its own native app. That means no filter sheet, no camera preview and no PDF viewer on the web. If so, the Filter button and the camera button would do nothing on the website unless something else fills the gap. They might instead fall back to plain web versions, like a dialog, a `getUserMedia` video and an iframe, but nothing on the page says so. Low confidence, about 2/5.

5: `drawer` comes from `@markless/ui`, so it looks like a normal cross-platform web component that I build and style myself, with its own trigger, backdrop, title and close parts. It would work the same on the web and in both apps. The `ios`/`android` sheet is the phone's own system sheet with built-in look and gestures, so I can't change much about it and it doesn't exist on the web. Fairly sure, about 4/5.

6: Probably not, or at least it isn't needed. The page uses a plain `<button>` everywhere, which tells me ordinary HTML elements already work on all three platforms. The platform packages seem to cover only things HTML can't do natively, like a system sheet, a live camera view or a native PDF viewer. I could see one existing for a special system button style, but I wouldn't expect it. About 3/5.

Confidence: 3/5

Tools used: none
