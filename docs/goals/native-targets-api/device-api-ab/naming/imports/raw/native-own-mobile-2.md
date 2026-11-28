1: I'd assume it's a set of components that wrap the platform's own built-in UI and device features, so a bottom sheet, the camera, a PDF viewer, a tab bar and a menu render as the real iOS (UIKit/SwiftUI) or Android (Material/Compose) controls rather than web-drawn imitations.

2: I'd expect other system pieces: alerts and action sheets, date and time pickers, a share sheet, toasts or snackbars, a navigation bar with a back button, switches and segmented controls, a map, web views, haptics, and maybe biometrics, notifications and the photo picker.

3: I'd be surprised to find custom-styled design-system components like a branded button or card, layout primitives such as stacks or grids, or app logic like routing, data fetching or state management. Anything that only exists on the web, with no native counterpart, would also feel out of place.

4: The operating system does: on iPhone it should look and behave like a standard iOS sheet with its drag handle and detents, and on Android like a Material bottom sheet, while I only supply the content and maybe a few options such as height. On the website I'd expect Markless to provide a fallback that imitates it.

Tools used: none
