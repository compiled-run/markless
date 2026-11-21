1: `system` is a namespace of native building blocks: parts that render the phone's own built-in screens and controls instead of something Markless draws itself. Here that means the OS bottom sheet, the camera viewfinder and the PDF viewer. On a phone each one maps to the real platform widget, such as a UIKit/SwiftUI sheet on iPhone or a Material bottom sheet on Android. I'm fairly sure of this.

2: It comes from the `@markless/system` package, which is separate from `@markless/ui`, the package that provides the framework's own headless components like `drawer` and `tabs`. I'd guess `@markless/system` is a thin bridge from Markless onto the native view layer of each platform, with a web fallback for the website build. The import line makes the package part certain; the bridge part is my inference.

3: The operating system decides, not the app. On iPhone it looks and animates like a native iOS sheet, with detents, a grabber and swipe-down to dismiss. On Android it behaves like a Material bottom sheet. I'd expect only a few knobs, like size or detents, and no control over the sheet's own styling. I'm moderately to fairly sure.

4: My best guess is that each one falls back to the closest thing the browser has. `system.sheet` would become a modal dialog styled as a bottom sheet, possibly a `<dialog>`. `system.camera` would become a `getUserMedia` video preview, or a file input with capture on mobile browsers. `system.pdf` would become the browser's built-in PDF viewer in an iframe or embed, or maybe just a download link. I'm only moderately sure, since the code gives no hint of the web behavior.

5: `system.sheet` hands the whole thing to the OS. You give it open state and children, and the platform draws the chrome and handles the animation and gestures. `drawer` is a headless component Markless draws itself, the same on every platform. You put it together from parts (trigger, backdrop, content, title, close), and you style it and decide its behavior. So the drawer looks identical everywhere and is fully yours, while the sheet feels native and is mostly out of your hands. I'm fairly sure.

6: Probably not. A button is something you can build yourself, and a plain `<button>` already maps fine to every platform, so there's no native screen or hardware feature to wrap. `system` seems to be for things only the OS can provide well: sheets, the camera, document viewers, maybe pickers or share sheets. It's possible a native-styled `system.button` exists for platform-exact look and feel, but I'd lean no.

Confidence: 3/5

Tools used: none
