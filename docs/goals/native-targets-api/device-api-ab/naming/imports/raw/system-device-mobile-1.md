1: I assume it holds components that render the phone's own built-in UI: a native bottom sheet, the camera view, the system PDF viewer, the native tab bar and the native menu. On the web it would fall back to browser equivalents.

2: I'd expect other native pieces too, like the date/time picker, share sheet, alerts and action sheets, toasts, a photo picker, a file picker, maybe haptics, and probably device APIs such as location, permissions, the clipboard and notifications.

3: I'd be surprised to find plain custom UI that Markless draws itself, like styled buttons, cards or a design-system theme, or app logic such as data fetching, routing or state management.

4: The operating system decides: on iPhone it looks like an iOS sheet with the grabber and detents, and on Android like a Material bottom sheet. My code only controls what goes inside it and whether it's open, plus maybe a few options the platform allows.

Tools used: none
