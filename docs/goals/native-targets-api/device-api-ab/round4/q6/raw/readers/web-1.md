1:
Share: Most likely a plain white box drawn inside the page, horizontally centered where the `<dialog>` sits in the layout, with no dim layer behind it. This is a guess. It's a raw HTML `<dialog open>` shown by my own `@if`, not a `@markless/ui` component. Setting the `open` attribute gives a non-modal dialog, so on the web it isn't vertically centered and isn't on top of the page. I don't know whether Markless turns a raw `<dialog>` into anything native on iPhone. My best guess is that it stays an inline box rather than becoming a native sheet. It may not render the same way as it does in a browser, or it may not render at all.
Edit name: Probably a centered box over a dimmed page, because it's a `modal` with a backdrop and my CSS gives the content a centered-card look (12px corners on all sides). There's a real chance it shows as iOS's native modal instead: a card that slides up and covers most of the screen. The code doesn't tell me which one the iPhone build uses, so this is a guess.
Comments: A bottom sheet that slides up from the bottom edge over the dimmed page. "Drawer" plus CSS that rounds only the top corners (`12px 12px 0 0`) strongly suggests a panel attached to the bottom. I'm guessing it comes from the bottom rather than a side because the CSS is written for the bottom.

2:
Share: A non-modal `<dialog>` box (no border, rounded, white) placed in the normal page flow under the Share button and centered horizontally. There's no backdrop, and the rest of the page stays usable. Done removes it.
Edit name: A centered box with a title, a text field and a Save button, over a 40% black dim layer. It's probably a real modal, so focus stays inside it until you close it.
Comments: Probably a panel that slides up from the bottom (rounded top corners) over the dim layer, with a Close button. It might also slide in from a side on desktop, but the CSS points to the bottom.

3: 2

Tools used: none
