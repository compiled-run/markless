A: Rule 2 comes closest for the modal and the drawer: I predicted Edit name as a centered box and Comments as a bottom sheet. It doesn't fully match for Share. I expected the raw `<dialog open>` to show as an inline box in the page, not a modal overlay, though under Rule 2 it would at least be centered.

B: Rule 3. The name of the component tells me what I get on every platform: "modal" means a centered box and "drawer" means a bottom sheet. If I want the sheet that iOS and Android users expect, I add one word, and the website keeps its centered box. Rule 1 means the same code looks different on phone and laptop unless I know a hidden default. It also means some CSS I wrote for a different reason, like `margin` or `inset`, could silently switch the placement. Rule 2 is predictable, but it makes me write a modal and a drawer separately whenever I want "centered on desktop, sheet on mobile," which is a very common pattern for me. One caveat: `adaptive` is vague. I would have to guess that it means "bottom sheet on phones" and not something like "full screen on small screens."

C:
Rule 1: My Edit name modal would show up as a bottom sheet with a grab handle on iPhone even though I styled it as a rounded card and called it a modal. Worse, adding an unrelated `margin: auto` could flip it back to a centered box without my noticing. I would also be surprised that a plain HTML `<dialog>` gets native sheet behaviour.

Rule 2: Modals on phones would look like web pop-ups, centered boxes that feel out of place next to native sheets. And there is no simple way to get a sheet on phones while keeping a centered box on the website.

Rule 3: Mostly that `adaptive` controls only the bottom-sheet switch and not other phone behaviours, like full screen on small screens or a native alert style. I'd also be surprised if a raw `<dialog open>`, opened without the modal behaviour, honored `adaptive` at all.

Tools used: none
