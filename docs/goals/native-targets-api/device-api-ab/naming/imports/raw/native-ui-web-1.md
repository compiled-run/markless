1: I'd guess `@markless/ui` is the framework's set of ready-made UI components, and `native` is a group of wrappers around the phone's own built-in pieces: bottom sheets, the camera, a PDF viewer, the bottom tab bar and menus. On iPhone and Android each one becomes the real system control. On the website it falls back to an HTML version, like a `<dialog>`, a `<video>` with getUserMedia, or an `<iframe>`/`<embed>` for the PDF.

2: I'd expect more device things under `native`, like alerts or confirm dialogs, toasts, the share sheet, date and time pickers, a select or picker, a switch, a navigation bar with a back button, pull to refresh, maps and file pickers. I'd also expect the plain cross-platform components outside `native`: buttons, inputs, dialogs, tabs, popovers and accordions.

3: I'd be surprised to find things with no on-screen part, like geolocation, push notifications, storage, fetch helpers or the router, because those don't sound like "ui." I'd also be surprised by a styled design system with a theme, colors and spacing, since `native` suggests the operating system does the styling.

4: I assume the operating system decides: on iPhone it looks like an Apple sheet and on Android like a Material bottom sheet, so I'd only control what goes inside it. On the website I'd guess either Markless ships a default style or I style it myself with CSS, and I wouldn't know which without documentation.

Tools used: none
