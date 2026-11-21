1: I'd guess it's a set of ready-made components that use the device's built-in UI and features: native bottom sheets, the camera, a PDF viewer, a tab bar and menus. On a phone they'd turn into the real iOS or Android controls, and on the website they'd fall back to some web version.

2: I'd expect other device and OS pieces too: alerts and confirm dialogs, a share sheet, date and time pickers, file and photo pickers, toasts or notifications, maybe geolocation, haptics and a map view. In short, the things the phone gives you for free that I'd normally build by hand or pull in a library for.

3: I'd be surprised to find plain layout or styling pieces in it, like buttons, cards, grids or typography. The same goes for app logic like routing, data fetching or state helpers, because "system" sounds like "stuff the OS provides", not general UI.

4: I'd assume the operating system decides, so it looks like a native iOS sheet on iPhone and a Material sheet on Android, and I'd only get limited control over how it looks. On the website, I'd guess Markless ships a default look that I could style, but I wouldn't be sure how much.

Tools used: none
