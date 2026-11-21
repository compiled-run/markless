1: `host` looks like a set of components that stand for the platform's own built-in UI. On the phone, the app hands these pieces to iOS or Android and lets the system draw them. Here that means the camera preview, a PDF viewer and a bottom sheet. I'm fairly sure of this reading, about 4 in 5.

2: It comes from the `@markless/host` package, which is separate from `@markless/ui` and `@markless/device`. I'd guess it's the layer that bridges to whatever environment the app runs in: the iOS app shell, the Android app shell, or the browser. The "host" is that environment.

3: My reading is that the operating system decides. iOS would show its standard bottom sheet with its own animation, drag handle and snap points, and Android would show its Material bottom sheet. The developer only controls the content (`<Filters />`) and whether the sheet is open. I'm moderately sure of this, maybe 3.5 out of 5.

4: I'd expect web fallbacks. `host.sheet` would probably become a dialog or bottom panel drawn in HTML and CSS. `host.camera` would likely become a `<video>` feed from `getUserMedia` after the browser asks for permission, or possibly a file input. `host.pdf` would probably show the browser's built-in PDF viewer in an iframe or embed, or a download link. I'm less sure exactly what each fallback looks like, maybe 3 out of 5.

5: `drawer` comes from `@markless/ui`, so it is the framework's own component. The developer builds its parts (trigger, backdrop, title, close button), and it looks and behaves the same on every platform. `host.sheet` is a single component with no parts, handed to the platform, so each OS draws it in its own native style. You'd use `drawer` when you want full control and the same look everywhere, and `host.sheet` when you want the panel to feel native on each phone.

6: Probably not. A plain `<button>` already works everywhere, and the page uses normal buttons throughout. `host` seems reserved for things the web can't do well on its own or that the phone does much better natively, such as the camera, PDF viewing and system sheets. I'm not certain, though, because some frameworks do offer a native button for platform styling, so I'd say 3 out of 5.

Confidence: 3/5
Tools used: none
