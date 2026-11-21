1: I'd guess `@markless/ui` is the framework's component library, and `native` is a group inside it of wrappers around real platform UI. On iPhone and Android those wrappers would show the OS's own controls: a bottom sheet, the camera view, a PDF viewer, a tab bar, a menu. On the website they would show a web version of each.

2: I'd expect more native wrappers like alerts and action sheets, date and time pickers, a share sheet, a map, a video player, a toast or snackbar, switches and pickers, and a navigation bar or stack. I'd also expect plain cross-platform building blocks outside `native`, like buttons, dialogs, popovers and lists.

3: I'd be surprised to find device APIs with no screen of their own, like push notifications, haptics, geolocation, storage or biometrics. Camera borders on that, but here it renders a preview view. I'd also be surprised by app-wide styling or theming tools, or anything to do with data fetching or routing.

4: The operating system decides: iOS draws its own sheet with the system detents and grabber, Android draws a Material bottom sheet, and I'd expect only limited options like height or a drag handle. On the website, Markless or the package's default styles would decide, probably with some way for me to override them.

Tools used: none
