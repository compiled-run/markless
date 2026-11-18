1: I'd guess `@markless/ui` is the framework's UI component library, and the `native` namespace holds wrappers around each platform's built-in system controls. On iPhone that would be a UISheetPresentationController, a UITabBar or a UIMenu; on Android it would be a Material bottom sheet, a bottom navigation bar or a popup menu. On the website I'd expect a web fallback.

2: I'd expect more native system pieces, such as `native.alert`, `native.actionSheet`, `native.datePicker`, `native.picker`, `native.toast`/snackbar, `native.share`, `native.navbar`/toolbar and `native.webview`. Beside the `native` namespace I'd also expect ordinary cross-platform building blocks like buttons, lists, inputs and dialogs that I can style myself.

3: I'd be surprised to find things that aren't UI, like storage, networking, push notifications, biometrics or location, because those feel like device APIs rather than components. I'd also be surprised by a heavily styled design-system theme living under `native`, since the point of that name is "use the system's look".

4: I'd assume the operating system decides: iOS draws it as a standard iOS sheet with a grabber and detents, Android draws a Material bottom sheet, and the website gets a browser or framework fallback. I'd style only the content I put inside it, plus maybe a few options the platform exposes, like sheet heights.

Tools used: none
