1: I'd guess it's a set of components that wrap each platform's own built-in UI and device features. On iPhone they'd use the system views (UISheetPresentationController, UITabBarController, PDFKit, AVCapture), on Android the Material or system equivalents, and on the website a fallback.

2: I'd expect other system pieces that every app needs: date and time pickers, alerts or action sheets, a share sheet, toggles, a navigation bar or toolbar, maps, a web view, and a video player. I'd also expect device features like location, haptics, notifications, the photo picker, biometrics and the file picker.

3: I'd be surprised to find custom-drawn or styled components like branded buttons, cards or layout helpers, since those aren't "native." I'd also be surprised by plain logic APIs with no UI or device feature behind them, such as fetch, routing or state helpers.

4: The operating system decides: iOS draws its own sheet with grabber, detents and corner radius, Android draws a Material bottom sheet, and I can probably only tweak a few options like height or whether it can be dragged closed. On the web, I'd assume Markless supplies a default look that tries to match the platform.

Tools used: none
