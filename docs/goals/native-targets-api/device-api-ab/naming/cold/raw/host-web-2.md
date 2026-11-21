1: `host` looks like a set of components that hand the job to whatever is running the app, so on a phone the OS's own native controls get used instead of HTML. `host.sheet`, `host.camera` and `host.pdf` seem to be the phone's built-in sheet, camera view and PDF viewer wrapped as components. I'm moderately sure; the name could also mean something about a server.

2: It's imported from `@markless/host`, a separate package from the `@markless/ui` components and the `@markless/device` APIs. My guess is that it's the layer between the framework and whatever runs the app: iOS, Android or the browser. I'm guessing that from the package name alone.

3: Probably the platform, not me. On iPhone it would look and move like a standard iOS bottom sheet, and on Android like a Material bottom sheet. I'd expect to control its content and whether it's open, plus maybe a few options, but not to style or animate it myself. Fairly confident, since that seems to be the whole point of putting it under `host`.

4: I'd expect the website to fall back to browser features. `host.sheet` would be some kind of dialog or bottom-sheet overlay, `host.camera` would be a `getUserMedia` video preview that asks for camera permission, and `host.pdf` would be the browser's built-in PDF viewer in an iframe or embed. I'm unsure whether the framework ships these fallbacks or some of them just don't work on the web; I'd lean toward it shipping them.

5: `drawer` comes from `@markless/ui`, so I'd read it as a regular framework component. It's built from parts (trigger, backdrop, content, title, close) that I put together and style, and it looks the same on every platform. `host.sheet` is one component that gives me the native sheet, with the look, gestures and animation owned by the OS. So the drawer is "my UI that I control" and the sheet is "the system's UI". Fairly confident.

6: Probably not. A plain `<button>` already works everywhere, and nothing about a button needs the native platform the way a camera, PDF viewer or sheet does. Then again, if `host` means "use the native control", a native button isn't absurd, so I'd check the docs. Moderately sure it doesn't exist.

Confidence: 3/5

Tools used: none
