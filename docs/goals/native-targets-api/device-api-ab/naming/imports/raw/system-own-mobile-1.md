1: I'd assume it holds the platform's native UI pieces and device features. That means things like bottom sheets, the camera, a PDF viewer, the tab bar and menus, each one rendered as the real iOS or Android control instead of something drawn in HTML.

2: I'd expect the other system pieces: alerts and action sheets, share sheet, date and time pickers, photo/media picker, file picker, maps, toasts or snackbars, a navigation bar, maybe haptics, notifications, the keyboard and safe areas. On the web I'd expect each one to fall back to a browser equivalent.

3: I'd be surprised to find ordinary app-styled components like buttons, cards, list rows or layout helpers in it. Same for non-UI things like data fetching, storage or routing.

4: The operating system decides. iOS draws it as a UISheetPresentationController-style sheet and Android as a Material bottom sheet, and on the web I'd guess Markless supplies a default. I'd expect to control only its content and maybe a few options, like detents or a drag handle, not its look.

Tools used: none
