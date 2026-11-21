1:
Share: Probably a plain box drawn inline in the page, near where the button is, with no dimmed background. It may be centered horizontally, but it is not a real system popup. Why: this is a raw HTML `<dialog open>` controlled by a `sharing` state, not a `@markless/ui` part. The `open` attribute shows a dialog without making it modal, so it has no backdrop and doesn't block the page. I'm guessing at how a raw `<dialog>` gets mapped on iPhone. It might be ignored, or it might show as an ordinary view in the page flow. I wouldn't expect a native alert or sheet.
Edit name: A centered box over a dimmed background. Why: "modal" with a `backdrop` and `content` reads like the usual centered dialog, and the `.edit` style has all four corners rounded, which suits a floating card. My guess is lower here. Since `@markless/ui` "runs on iPhone", it may map to the native iOS modal presentation. That would be a card sliding up from the bottom (the page-sheet style), possibly with the app's own `dim` and corner styles applied or ignored.
Comments: A bottom sheet. Why: "drawer" usually means a panel that slides in from an edge, and the `.comments` style rounds only the top corners (`12px 12px 0 0`). The author clearly expects it to sit against the bottom edge. On iPhone it is probably a native-feeling sheet that can be swiped down.

2:
Share: A white box, horizontally centered, shown in the normal page flow just after the Share button (the browser default for a non-modal `<dialog open>`). There is no dimmed background, the page behind it still works, and Esc does not close it. Only "Done" does.
Edit name: A centered box over a page dimmed by `rgb(0 0 0 / 0.4)`, with focus kept inside it. Save closes it. I expect Esc or clicking the backdrop closes it too, but that's a guess.
Comments: On a laptop, probably still a panel attached to the bottom edge, given the top-only corner radius. It could also slide in from the side, depending on the default direction, which I can't see. It has the same dim backdrop and a Close button.

3: 2. I'm fairly confident about Comments being a bottom sheet. I'm unsure whether Edit name stays a centered box or becomes the native iOS slide-up card, and how a raw `<dialog>` appears on iPhone at all.

Tools used: none
