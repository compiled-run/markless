1:
Share: My guess is a white box drawn as part of the page, without a dimmed background behind it, and not a real popup. The code uses a plain HTML `<dialog open>` that only appears when `sharing` is true, and it doesn't use any `@markless/ui` part. On the web, `open` without `showModal()` makes a dialog that doesn't block the rest of the page. Nothing in the code tells me how a raw `<dialog>` turns into a native iPhone view. It may just show up as a box after the Share button, or the native build may not handle it well at all.

Edit name: A centered box over a dimmed background. The name `modal` and its parts (`trigger`, `backdrop` with `.dim`, `content`, `title`, `close`) look like a standard modal dialog, and the CSS rounds all four corners of `.edit`, which fits a floating card. I'm guessing that on iPhone this may become a native popup or sheet rather than a web-style box. Nothing in the code says which.

Comments: A bottom sheet that slides up from the bottom edge, over the dimmed background. "Drawer" usually means a panel that slides in from an edge, and `.comments` rounds only the top corners (`12px 12px 0 0`), which matches a panel sitting on the bottom edge. On iPhone it may be the native sheet, the kind you can swipe down to close. That part is a guess.

2:
Share: A white box with no border, centered left to right near where it sits in the page. That is the browser's default for a non-modal `<dialog open>`. The page is not dimmed, and you can still click everything else on the page.

Edit name: A centered dialog box over a 40% black overlay. It is probably a real modal that traps keyboard focus inside it and closes with Escape. I'm guessing that it uses `showModal()` or something similar.

Comments: A panel that slides up from the bottom with rounded top corners, over the same dim overlay. The code doesn't say which side it comes from. I'm assuming the bottom because of the corner radius, but on a wide screen it could be a side panel instead.

3: 2. I'm fairly sure that Edit name is a centered box and Comments is a bottom sheet. I'm unsure how the raw `<dialog>` for Share appears on iPhone. I'm also unsure whether the iPhone build turns the modal and the drawer into native views.

Tools used: none
