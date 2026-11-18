1:
Share: Probably a plain box that shows up in the page where the code puts it, under the Share button. It is not centered over a dimmed screen and it is not a sheet. This is a raw HTML `<dialog open>` shown with my own `@if`, not a `@markless/ui` component. The `open` attribute makes it a non-modal dialog: there is no backdrop and the rest of the page still takes taps. I'm guessing at how a plain `<dialog>` becomes an iPhone view. It may become an ordinary box in the layout, or the iPhone app may not support it well at all.
Edit name: Most likely a native iOS modal sheet, the card that slides up and leaves the page peeking behind it at the top. My second guess is a centered box over the dim backdrop. `modal` is the cross-platform component, so I'd expect the iPhone version to follow iOS conventions, and iOS presents modals as sheets. The `.edit` styles (rounded on all four corners, no position set) look like a centered card, though, which is what the web version would show. This is a guess.
Comments: A bottom sheet, a panel that slides up from the bottom edge with the page dimmed behind it. "Drawer" usually means a panel that slides in from an edge. The `.comments` class rounds only the top corners (`12px 12px 0 0`), which only makes sense for a panel attached to the bottom edge. On iPhone I'd expect a native-feeling sheet, possibly with a drag handle.

2:
Share: An inline box in the normal page flow just below the Share button, centered side to side. The browser's default styling for a non-modal `<dialog open>` does that. There is no backdrop and the page can still be clicked. It is not centered vertically and it does not float over the page.
Edit name: A centered box over a semi-transparent dark backdrop (`.dim`), like a classic web modal dialog. I'd expect focus to stay inside the dialog and Escape to close it, but I'm guessing at that.
Comments: A bottom sheet that slides up from the bottom of the browser window over the dimmed backdrop, probably full width or a wide panel. It's possible that on desktop it slides in from the side instead, but the top-only rounded corners point to bottom.

3: 2. I'm fairly sure about Comments being a bottom sheet. I'm unsure whether Edit name becomes a native sheet or a centered box on iPhone, and how a raw `<dialog>` shows up on iPhone at all.

Tools used: none
