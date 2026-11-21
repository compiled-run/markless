1: I'd assume it's a set of components that wrap the platform's built-in UI and device features, so a bottom sheet, a camera view, a PDF viewer, a tab bar and a menu render as the real UIKit/SwiftUI or Android (Material/Compose) controls instead of web-styled divs. On the website build I'd guess each one falls back to a web version.

2: I'd expect other built-in controls and system screens like alerts/action sheets, date and time pickers, share sheet, toasts/snackbars, navigation bar/stack, switches, maps, a video player, a web view, and file/photo pickers. I'd also expect hooks for haptics, safe-area insets, the status bar, and maybe permissions for the camera and photos.

3: I'd be surprised to find custom-styled or design-system components like cards, buttons with brand themes, or layout helpers, and also non-UI things like HTTP fetching, state management, routing logic or a database. Raw device APIs that have no view, like Bluetooth, the file system or push notification setup, would also feel a bit out of place under a namespace of tags.

4: Mostly the OS: on iPhone it should look like a standard iOS sheet with the grabber and detents, and on Android like a Material bottom sheet, with only the contents inside (`<Filters />`) being mine. I'd expect a few props for things like height or detents, but not full styling control, and on the web the framework would decide what its fallback looks like.

Tools used: none
