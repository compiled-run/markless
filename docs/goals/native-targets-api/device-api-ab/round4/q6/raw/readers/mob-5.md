1:
Share: A plain box shown inline, in the normal page flow just below the Share button. It isn't centered, has no dimmed background and doesn't slide in. The reason is that it's a raw `<dialog open>`, not a `@markless/ui` part. Setting the `open` attribute directly (instead of calling `showModal()`) gives a non-modal dialog. It isn't lifted on top of the page and gets no backdrop. The `.share` class only adds padding, rounded corners and a white background, with no positioning. My biggest guess is what a raw HTML `<dialog>` turns into in the native iPhone build. It might be drawn as a plain view in the page, which is what I'd expect. It might also not render properly at all, because nothing in the code ties it to a native iOS presentation.

Edit name: Most likely a centered box over a dimmed background. `modal.backdrop` gets the `dim` class, a 40% black overlay, and the content gets the `.edit` class with all four corners rounded. That's a floating card, not something attached to an edge. I'm guessing here, though. On iOS, "modal" often means a native presented sheet, the page or form sheet that slides up from the bottom. A cross-platform package could map `modal` to that on iPhone. The all-corners radius makes me lean toward a centered card.

Comments: A bottom sheet that slides up from the bottom edge over the dimmed background. "Drawer" plus `.comments` rounding only the top corners (`12px 12px 0 0`) strongly suggests a panel docked to the bottom. No side or direction is set, so I'm assuming bottom is the default on mobile. It might be a native iOS sheet with a drag-to-dismiss handle, but nothing in the code confirms that.

2:
Share: The same inline, non-modal box in the page flow under the button, with no backdrop and no centering. This is standard browser behavior for `<dialog open>` set as an attribute. Pressing Esc won't close it, and the rest of the page stays clickable.

Edit name: A centered box over a 40% black overlay. This is the usual web modal: focus is probably trapped inside it, and Esc or the Save button closes it.

Comments: Probably a panel sliding up from the bottom edge over the dimmed overlay, given the top-only rounded corners. I'm guessing on this one: some web drawer libraries open from the side by default on wide screens. The CSS was written for a bottom panel, though, so I expect a bottom panel stretched across the laptop width.

3: 2. Share follows from plain HTML rules, but its native-iPhone mapping is unknown. Edit name could be either a centered card or an iOS sheet. Comments as a bottom sheet is my most confident call.

Tools used: none
