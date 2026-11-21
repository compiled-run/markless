1:
Share: Probably a plain box inside the page, with no dimmed background, and not a real overlay. The code uses a raw HTML `<dialog open>` element, not an `@markless/ui` component, and it is opened with the `open` attribute rather than as a modal. On the web, that kind of dialog shows up as an inline box near where it sits in the page, roughly centered horizontally. There is nothing here that tells me how a raw `<dialog>` is turned into a native iOS view. My guess is a white rounded box among the page content, or possibly a native view without overlay behaviour. This is the one I am least sure of.
Edit name: Most likely a centered box over a dimmed background. `modal.*` is the cross-platform component, and on iOS I would expect it to map to a native modal presentation. The open question is whether that becomes a centered card or iOS's usual page sheet, a card that slides up and covers most of the screen. Two things suggest the code asks for a centered card: the content has `border-radius: 12px` on all four corners, and there is a separate `.dim` backdrop. I would guess a centered card, but an iOS page sheet would not surprise me.
Comments: A bottom sheet that slides up from the bottom edge, over a dimmed backdrop. On mobile, "drawer" conventionally means a bottom sheet. The styling backs this up: only the top corners are rounded (`12px 12px 0 0`), which is how a panel attached to the bottom edge is drawn.

2:
Share: A non-modal box shown inline in the page, roughly horizontally centered, with no dimming. The rest of the page stays clickable, and "Done" removes the box. That is standard behaviour for `<dialog open>`.
Edit name: A centered modal box over a dimmed page, with focus moved into it. The page behind cannot be used until you press Save.
Comments: A panel that slides up from the bottom over a dimmed page, with rounded top corners. I am guessing it comes from the bottom rather than the side, based on the corner radius. I can't rule out a side drawer on a wide screen.

3: 2

Tools used: none
