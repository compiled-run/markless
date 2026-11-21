1: I'd guess it holds wrappers for the phone's or browser's built-in pieces: native UI like the bottom sheet, tab bar and menus, plus hardware like the camera. On each platform you get the real native version, and on the web some fallback.

2: I'd expect other device and OS features, like geolocation, notifications, share sheet, file picker, clipboard, vibration, alerts and confirm dialogs, date pickers, and maybe things like the network status or battery level.

3: I'd be surprised to find ordinary styled components there, like buttons, cards or layout grids, or app logic like routing, data fetching and state. A PDF viewer also seems a little out of place next to the hardware features.

4: The operating system, I'd assume: on iPhone it looks like an iOS sheet, on Android like an Android one, and on the web it's whatever the browser or Markless's fallback gives you. I'd expect very little control over its styling apart from the content I put inside it.

Tools used: none
