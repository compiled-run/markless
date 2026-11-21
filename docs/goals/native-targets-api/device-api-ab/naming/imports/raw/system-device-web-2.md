1: I'd guess it's a set of components that wrap the phone's or browser's built-in features and UI pieces: bottom sheets, camera access, a PDF viewer, a tab bar, menus. Each one renders as the platform's real control in the iPhone and Android apps and falls back to some web version on the website.

2: I'd expect other built-in pickers and hardware access: date/time pickers, an alert or confirm dialog, a share sheet, a file or photo picker, location, notifications, vibration, a clipboard helper, and maybe toasts or a navigation/header bar.

3: I'd be surprised to find generic styled components like cards, buttons or grids, or anything to do with app logic like data fetching, routing or state helpers. Anything the OS doesn't provide would feel out of place under the name `system`.

4: I'd assume the operating system does: on iPhone it looks like an iOS sheet, on Android like a Material bottom sheet, and you probably get only a few knobs like the size. On the website I'm not sure, probably a default style from Markless that I might be able to override with CSS.

Tools used: none
