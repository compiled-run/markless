1: I'd assume it's a set of components that render the platform's own built-in UI and device features, like a bottom sheet, the camera, a PDF viewer, a tab bar and menus. On iPhone and Android you get the real system controls rather than web look-alikes, and the website probably falls back to an HTML version.

2: I'd expect other system pieces too: alerts and action sheets, date and time pickers, share sheets, toasts or snackbars, maps, a web view, and photo and file pickers. I'd also expect device APIs like haptics, geolocation, biometrics (Face ID or fingerprint), notifications, the clipboard, and maybe secure storage and permission prompts.

3: I'd be surprised by plain styled layout or design-system components like cards, buttons drawn by the framework, or grids. I'd also be surprised by non-device things such as routing, data fetching, state management, or analytics, because "device" and `native.` suggest OS-provided pieces only.

4: Mostly the operating system. On iPhone it would look like a UIKit/SwiftUI sheet with detents and a grabber, on Android like a Material bottom sheet, and on the web like whatever fallback Markless ships. I'd expect to control only the content and a few options such as height or whether it can be dismissed, not the sheet's look itself.

Tools used: none
