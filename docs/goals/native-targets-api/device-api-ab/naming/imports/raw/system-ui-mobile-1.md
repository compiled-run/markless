1: I'd assume `@markless/ui` holds the UI component library, and that `system` is a group of components that wrap the phone's built-in native controls: a bottom sheet, the camera view, a PDF viewer, a tab bar and a menu. Each one maps to UIKit/SwiftUI on iPhone, to the Android equivalent, and to some web fallback on the website.

2: I'd expect more native pieces under `system`, such as alerts or dialogs, an action sheet, a date/time picker, a share sheet, toasts or snackbars, a navigation bar or header, and maybe a map or web view. I'd also expect ordinary cross-platform building blocks outside `system`, like buttons, lists, inputs and layout primitives.

3: I'd be surprised to find device APIs with no UI, like storage, location, push notifications or biometrics, under a `ui` package. I'd also be surprised by heavily branded, custom-styled widgets inside `system`, since the name suggests the OS's own look.

4: The operating system does: the sheet should look like a native iOS sheet on iPhone and a Material bottom sheet on Android, and I'd only pass in content and a few options. On the web I'd guess Markless supplies its own default look, probably one I can style.

Tools used: none
