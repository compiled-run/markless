1:
Share: My best guess is a centered box with no dimmed background behind it, which may not act like a true popup. This is a plain HTML `<dialog open>` controlled by my own `state()` flag. It is not a `@markless/ui` component, so I don't think Markless turns it into a native iOS presentation. The `open` attribute shows it in place, the way a browser does without `showModal()`. It probably sits near where it appears in the page, possibly over the content, and gets the white rounded `.share` styling. I'm guessing at how a raw `<dialog>` renders on the iPhone target at all. It might show up only as a plain inline view.

Edit name: A centered box over a dimmed background. `modal` with a `backdrop` styled `.dim`, and `content` rounded on all four corners, reads as a classic centered alert or card. I'm unsure here, though. On iOS, "modal" usually means a native sheet, a card that slides up and leaves the page behind it visible at the top (`.sheet` or pageSheet). If Markless maps `modal` to the native iOS presentation, the user would see that sheet, and the `.dim` backdrop might be ignored.

Comments: A bottom sheet that slides up from the bottom edge, with a dimmed background behind it. "Drawer" plus `.comments` being rounded only on the top corners (`12px 12px 0 0`) both point to a panel attached to the bottom. On iPhone this may be a native sheet with a drag handle, which is a guess.

2:
Share: A non-modal white box, centered horizontally near its place in the page. There is no backdrop, and the page behind it can still be clicked, because `<dialog open>` without `showModal()` is not modal. Escape probably won't close it.

Edit name: A centered box over a dark translucent backdrop. It's modal: focus stays inside, and Escape or Save closes it.

Comments: A drawer over a dimmed backdrop. On a laptop it most likely slides up from the bottom, matching the top-only rounded corners. It could instead be a side panel, which is a guess. It closes with Close, probably also with Escape or a backdrop click.

3: 2. Share is the plain HTML element, and I can't tell how it maps to iPhone. Edit name could be either a centered box or a native iOS sheet. Comments as a bottom sheet is the answer I'm most confident in.

Tools used: none
