1: I'd guess `@markless/ui` is a component library, and `system` is a group of ready-made components that use the device's own built-in features and screens: slide-up panels, the camera, a PDF viewer, a bottom tab bar and dropdown menus. On the phone apps they probably show the real native versions, and on the website they fall back to browser equivalents.

2: I'd expect more device-backed pieces like a date picker, share sheet, alert or confirm dialogs, toasts, a file picker, maps, video players and maybe a navigation bar or page header. Outside `system`, I'd also expect ordinary unstyled building blocks like buttons, inputs, dialogs and popovers.

3: I'd be surprised to find data fetching, routing, state management or styling themes in a package called "ui". I'd also be surprised to see non-visual device features there, like geolocation, storage or push notifications, even though camera is already a bit of a borderline case.

4: I assume the phone's operating system decides how `system.sheet` looks, so it looks like a native iOS or Android sheet, and on the web it's whatever default style the framework ships, probably based on a `<dialog>`. I'd expect to have only limited control over it, maybe things like height or detents, but not full custom styling.

Tools used: none
