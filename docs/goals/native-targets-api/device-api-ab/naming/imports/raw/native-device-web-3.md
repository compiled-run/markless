1: I'd assume it's a set of components that hand off to the phone's own built-in UI and hardware: a bottom sheet that slides up, camera access, a PDF viewer, a bottom tab bar and a dropdown or action menu, each rendered by iOS or Android instead of being built in HTML.

2: I'd expect other phone features and pickers: date/time pickers, a share button, alerts or confirm dialogs, toasts, haptics/vibration, geolocation, file or photo picker, notifications, the clipboard, and maybe a QR or barcode scanner, along with some way to check which platform you're running on.

3: I'd be surprised to find ordinary layout or styling pieces like buttons, cards, grids or text inputs that look the same everywhere, or anything server-side like data fetching or routing. I'd also be surprised by anything that only works on the website and has no phone version.

4: My guess is that the operating system decides, so the sheet looks like a standard iOS sheet on iPhone and a Material bottom sheet on Android, and I'd only control what goes inside it. On the website I'm not sure who decides; probably Markless ships a default look, and I'd expect only limited styling options.

Tools used: none
