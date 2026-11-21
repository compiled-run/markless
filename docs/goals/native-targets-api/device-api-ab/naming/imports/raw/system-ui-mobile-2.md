1: It's a UI component library, and the `system` namespace looks like wrappers around each platform's built-in native pieces: the iOS/Android bottom sheet, the camera view, the PDF viewer, the native tab bar and the native menu. On the web each one probably falls back to an HTML version.

2: I'd expect other native controls and screens under `system`, like date/time pickers, alerts or action sheets, share sheets, toasts or snackbars, navigation bars, photo pickers, maps and a web view. Outside `system`, I'd expect the framework's own cross-platform components: buttons, inputs, lists, dialogs and tabs.

3: I'd be surprised to find device APIs with no UI in it, like geolocation, push notifications, storage, haptics or Bluetooth, or business components like a data grid. I'd also be surprised by anything under `system` that is drawn by Markless itself instead of by the OS.

4: The operating system decides: on iPhone it looks like a UIKit/SwiftUI sheet and on Android like a Material bottom sheet, so I'd expect only light control over things like detents or corner styling. On the website, I'd guess Markless or the browser provides a default look that I could restyle with CSS.

Tools used: none
