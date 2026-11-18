1: I assume `@markless/ui` holds the app's UI components, and that the `system` part wraps the phone's own native controls and screens, like the iOS/Android bottom sheet, the camera view, the PDF viewer, the tab bar and the pop-up menu. You write each one once and get the real native version on iPhone and Android, plus some fallback on the web.

2: I'd expect more of the same native pieces: date and time pickers, alerts and action sheets, the share sheet, a photo or file picker, a map view, a web view, toasts or snackbars, a navigation bar or toolbar, and maybe a video player. Next to `system`, I'd also expect your own non-native components like buttons, lists and dialogs.

3: I'd be surprised to find device APIs that have nothing visual, like geolocation, push notifications, the keychain, storage or Bluetooth, in a UI package. I'd be just as surprised by a full set of custom-styled widgets that look the same on every platform, or by state management and routing.

4: The operating system decides. On iPhone it should look and behave like a UIKit/SwiftUI sheet, with a grabber and detents (the heights it can snap to). On Android it should look like a Material bottom sheet, and on the web like whatever fallback Markless ships. I'd expect to change only a few options, such as its heights, not to restyle it freely.

Tools used: none
