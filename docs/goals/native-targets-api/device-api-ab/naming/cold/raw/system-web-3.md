1: `system` looks like a set of components that render the phone's own built-in controls instead of something Markless draws itself. You get things like the native bottom sheet, the camera view and the PDF viewer, the same ones other apps on that phone use. I'm fairly sure about this, because the name and the members (sheet, camera, pdf) point that way.

2: It's imported from `@markless/system`, which is a separate package from `@markless/ui`. I'd guess that package hands each component to the operating system: UIKit or SwiftUI on iPhone, Android's own views on Android. On the web it would fall back to some browser version. The import line itself I'm sure of; how it works inside is my guess.

3: The operating system decides, not me. On iPhone it would slide up and look like an iOS sheet with Apple's animation and swipe-to-dismiss, and on Android it would look like a Material bottom sheet. I'd expect very little styling control, maybe only things like height. I'm moderately sure.

4: I'd guess sheet becomes a `<dialog>`-style panel or bottom sheet the framework draws itself, and camera becomes a `<video>` preview using `getUserMedia` (it would ask for camera permission). I'd guess pdf becomes the browser's built-in PDF viewer, in an iframe, embed or object tag. I'm less sure about the sheet: it could be a plain modal with fallback styling.

5: `drawer` comes from `@markless/ui`, so I'd read it as an unstyled component I build and style myself. It looks the same on every platform, and I control its parts (trigger, backdrop, content, title, close). `system.sheet` is the phone's native sheet, drawn and animated by iOS or Android, with only an `open` prop and content. One I design, the other I accept the platform's look. I'm fairly sure.

6: Probably not, or at least it's not something I'd need. A plain `<button>` already works everywhere, and the page uses ordinary `<button>`s. `system` seems kept for things the browser can't do natively or that need the phone's own screens. I'm not certain, though: a framework could offer native buttons too.

Confidence: 3/5

Tools used: none
