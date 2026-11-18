1: I'd guess it's a set of components that use the phone's or browser's own built-in UI and hardware: things like the bottom sheet, camera, PDF viewer, tab bar and dropdown menu, so on iPhone and Android you get the real native versions instead of HTML copies.

2: I'd expect more of the same kind: a date/time picker, share sheet, alerts and confirm dialogs, toasts or notifications, file and photo picker, maybe geolocation, vibration and clipboard helpers. Possibly a select/picker and a native-style navigation bar or back button too.

3: I'd be surprised to find ordinary layout or styled components like cards, grids or buttons with my own styling, or anything unrelated to the device such as data fetching, routing or state helpers. A theming or CSS system would also seem out of place.

4: I'd assume the operating system decides: on iPhone it looks like an iOS sheet, on Android like a Material sheet, and on the website the browser or a default Markless fallback decides, with me only controlling what goes inside it. I wouldn't expect to be able to style it much beyond maybe a few options.

Tools used: none
