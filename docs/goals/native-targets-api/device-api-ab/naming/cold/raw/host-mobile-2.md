1: `host` looks like a set of native UI components that the platform draws itself, not the framework. On iPhone they would be UIKit/SwiftUI views and on Android they would be Android views. Each one is something the OS already provides, like a bottom sheet, a camera preview or a PDF viewer, and you drop it into the page like a normal element. I'm fairly sure of this.

2: It comes from the `@markless/host` package. I read "host" as the platform the app runs on, meaning iOS, Android or the browser, so these components are passed through from that platform. On mobile I'd guess each one is a thin wrapper around a native view.

3: The OS decides. On iPhone it would be UIKit's sheet, with its detents, grabber and swipe-down to dismiss. On Android it would be the Material bottom sheet. Markless only passes in `open` and gets `onChange` back, so the look and the animation follow each platform's own rules, not the app's CSS. I'm fairly confident.

4: On the web I'd expect each one to fall back to the closest browser equivalent. `host.sheet` would probably be a `<dialog>`, or a sheet-style fallback the framework provides. `host.camera` would be a `<video>` fed by `getUserMedia`, with `takePhoto` grabbing a frame. `host.pdf` would be the browser's built-in PDF viewer in an iframe or embed. I'm less sure about the sheet, since it could be a styled fallback rather than a plain dialog.

5: `drawer` comes from `@markless/ui`, so it is a headless component the framework draws in web views. You build its parts yourself (trigger, backdrop, content, title, close) and style them, and it looks the same on every platform. `host.sheet` is the OS's real native sheet, with the platform's own gestures and look, and you only give it the content. In short, `drawer` is the framework's own component and `host.sheet` is the system's.

6: Probably not, or only if a native button has a real advantage. A plain `<button>` already works everywhere, and this page uses ordinary `<button>`s next to the `host.*` parts. The `host` set seems to hold only things a web view can't do well, like system sheets, the camera and PDF rendering. I'm moderately sure; it might exist if the goal is to mirror every native control.

Confidence: 3/5

Tools used: none (apart from the one required Read that delivered this prompt)
