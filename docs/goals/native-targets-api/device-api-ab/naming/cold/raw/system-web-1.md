1: `system` looks like a set of components for the phone's own built-in screens and controls. I'd guess `system.sheet` is the phone's real slide-up panel, `system.camera` is the real camera view, and `system.pdf` is the phone's own PDF viewer. So it's not HTML drawn to look like a sheet, it's the actual thing the operating system gives you. Fairly sure, maybe 4/5.

2: It comes from the `@markless/system` package, which is imported at the top of the file. I'd assume that package is Markless's bridge to the operating system: on iOS it calls Apple's built-in pieces, and on Android it calls Google's. That second part is a guess based on the name.

3: Mostly Apple and Google, not me. On iPhone I'd expect the sheet to look and move like any other iOS sheet (rounded top, drag handle, swipe down to close), and on Android like an Android bottom sheet. I'm guessing I can't style it much beyond what gets passed in, like `open` and `onChange`. About 3.5/5 on that.

4: I'd guess the website gets the closest browser version of each one. For `system.sheet` that's probably a dialog or a panel that slides up. For `system.camera` it's likely a live video preview through `getUserMedia`, or maybe a file input with capture. For `system.pdf` it's probably the browser's built-in PDF viewer in an iframe or embed. I'm least sure here (2.5/5), since nothing on the page says what the web fallback is.

5: `drawer` comes from `@markless/ui`, so I'd guess it's a regular component made from HTML and CSS: you build its parts yourself (trigger, backdrop, content, title, close) and style it, and it looks the same everywhere. `system.sheet` is one tag you put content in, and the operating system draws it, so it looks native on each phone. Put simply, the drawer is your own panel and the sheet is the phone's panel.

6: Probably not, or if it does exist I wouldn't expect to need it. A plain `<button>` already works everywhere, and the page uses ordinary `<button>`s even inside the `system` parts. `system` seems to be for things HTML can't do well or that should feel native, like sheets, the camera and PDFs. That said, a native-looking button isn't impossible, so about 3/5.

Confidence: 3/5

Tools used: none
