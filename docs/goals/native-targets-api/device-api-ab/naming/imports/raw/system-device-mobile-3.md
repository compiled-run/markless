1: I'd assume it's a set of native, OS-provided UI components and device features: system sheets, the camera, a PDF viewer, the native tab bar and native menus. Each one renders as the real UIKit/SwiftUI or Android (Material/Compose) control on phones and uses some web fallback in the browser.

2: I'd expect other native pickers and system screens like date/time pickers, the photo library picker, the share sheet, alerts and action sheets, and maybe a map view, a web view and the document or file picker. I'd also expect device capabilities like haptics, biometrics (Face ID or fingerprint), location, notifications and the clipboard.

3: I'd be surprised to find custom-styled, framework-drawn components such as buttons, cards or a design-system theme, because "system" suggests these are the OS's own controls. Non-UI things like networking, routing or state management would also surprise me.

4: The operating system decides. iOS draws it as a native bottom sheet with detents and Android as a Material bottom sheet, so I'd expect only limited styling hooks. On the website I'd guess the framework supplies a default look that tries to match.

Tools used: none
