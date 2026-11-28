1: I'd assume it's a set of components that wrap the phone's own built-in UI and hardware: the native bottom sheet, a camera view, a PDF viewer, the tab bar and menus. On iPhone and Android they would render as real native views, with some web fallback for the website build.

2: I'd expect more native pieces like alerts and action sheets, date and time pickers, a share sheet, toasts or snackbars, a navigation bar or toolbar, and a map view. I'd also expect device features like haptics, location, biometrics such as Face ID or fingerprint, notifications, the clipboard, and status bar or safe-area info.

3: I'd be surprised to find custom-styled design-system pieces like branded buttons, cards or layout grids. I'd also be surprised by anything that has no native equivalent, or by app-level things like routing, state management, data fetching or server code.

4: The operating system decides: iOS draws its own sheet with the grabber and detents, and Android draws its Material bottom sheet. My app only supplies the content and the open/closed state, and on the website I'd expect the framework's fallback to decide how it looks.

Tools used: none
