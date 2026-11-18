1: I'd guess `@markless/device` wraps the platform's built-in UI and hardware as components: UIKit/SwiftUI and Android views like the bottom sheet, tab bar and menu, plus device features like the camera and a PDF viewer. On the web, each one probably falls back to an HTML version.

2: I'd expect more native pieces under `native.*`: date and time pickers, alerts and action sheets, the share sheet, toasts or snackbars, a map view, a video player, a photo picker, a barcode scanner, haptics, and a web view. I'd also expect device APIs such as permissions, location, notifications, the clipboard, biometrics (Face ID or fingerprint), and the safe-area insets.

3: I'd be surprised to find custom-styled design-system components that don't map to a native control, like a styled card or button set. I'd also be surprised by non-device utilities such as routing, data fetching or state management.

4: Mostly the platform does. iOS draws it as a UIKit/SwiftUI sheet and Android as a Material bottom sheet, so I'd expect to change only limited things like detents, height, or the drag handle. On the web, I'd assume the framework's fallback styling decides, and maybe my CSS.

Tools used: none
