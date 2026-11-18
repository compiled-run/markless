1:
Share: Probably a white box sitting in the page near the Share button, with no dimmed background and nothing sliding in. This is a guess. It is a plain HTML `<dialog open>` shown by an `@if`, not a `@markless/ui` component, so nothing in the code asks for native phone behaviour. On the web, `open` (as opposed to `showModal()`) makes a non-modal dialog. By default it is centred left to right where it sits in the page, not centred on the screen. I am assuming the iPhone build draws plain HTML elements as ordinary views styled by the CSS. It might instead show nothing special, or the framework might turn it into a native alert, but nothing in the code says so.
Edit name: A centred box, most likely: a white rounded panel over the `.dim` 40% black overlay. The name `modal` and the backdrop/content structure suggest a centred dialog, and the CSS gives `.edit` all four corners rounded. One caveat, which is a guess: on iPhone a native "modal" is often a card that slides up and nearly fills the screen. If the framework maps `modal` to that, you would get that card instead.
Comments: A bottom sheet. "Drawer" on mobile usually means a panel that slides up from the bottom edge. The CSS backs this up: `.comments` rounds only the top corners (`12px 12px 0 0`), which is the shape of a sheet attached to the bottom. It would sit over the dimmed backdrop. On iPhone it might use the native sheet with a grabber and swipe-down to close, but that is a guess.

2:
Share: A non-modal white dialog with padding, rounded corners and no border, centred left to right at its spot in the page flow. The page is not dimmed and you can still use the rest of the page.
Edit name: A centred white box over a 40%-black overlay. It holds the "Edit name" title, the text input and a Save button that closes it.
Comments: Probably a panel attached to the bottom of the window with rounded top corners, over the dim overlay. A drawer on desktop could also slide in from the side, but the top-only corner rounding points to the bottom edge. This is a guess.

3: 2. The Comments answer is the strongest because it rests on the name "drawer" and the corner rounding. I am unsure whether the plain `<dialog>` gets any native treatment on iPhone, and whether `modal` becomes a centred box or the iOS slide-up card.

Tools used: none
