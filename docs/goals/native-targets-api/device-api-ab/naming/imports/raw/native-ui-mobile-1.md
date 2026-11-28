1: I'd assume `@markless/ui` is the framework's component library, and that the `native` namespace holds components backed by the real platform controls. That means a UIKit/SwiftUI sheet, tab bar, menu, camera view and PDF viewer on iPhone, the Material/Android equivalents on Android, and some web fallback on the website.

2: I'd also expect other native controls under `native`, like alerts or action sheets, date and time pickers, toggles, sliders, share sheets, navigation bars, maps and video players. Next to `native` I'd expect the regular cross-platform UI pieces such as buttons, inputs, lists and dialogs.

3: I'd be surprised to find device APIs that render nothing, like haptics, geolocation, push notifications, secure storage or biometrics, in a package called "ui". I'd also be surprised by a full custom-drawn design system that only imitates native look instead of using the OS controls.

4: The operating system decides. On iPhone it looks like an iOS bottom sheet with detents and a grabber, and on Android like a Material bottom sheet, with my code mostly controlling the content and open state. On the website the framework decides, because it has to draw its own version.

Tools used: none
