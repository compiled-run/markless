1: I assume it holds the platform's own UI widgets and hardware features, wrapped as components. That means the real iOS/Android bottom sheet, tab bar, context menu and PDF viewer, plus device hardware like the camera, all used through one `native` namespace.

2: I'd expect more native pieces and device capabilities: alerts and action sheets, date and time pickers, a share sheet, toasts or snackbars, haptics, a file or photo picker, maybe biometrics, geolocation, notifications, a map view and a WebView. I'd also expect the package to handle permission prompts for things like the camera.

3: I'd be surprised by plain styled components that have nothing native about them, like a custom-drawn button, card or layout grid. I'd also be surprised by non-device things such as routing, data fetching or state helpers. Pure JS reimplementations that don't use the platform's own controls would surprise me too.

4: I'd assume the operating system decides: it looks like a UISheetPresentationController on iPhone and a Material bottom sheet on Android. I'd guess I control only the content inside it and maybe things like snap heights, and on the website it falls back to a browser version, probably a dialog.

Tools used: none
