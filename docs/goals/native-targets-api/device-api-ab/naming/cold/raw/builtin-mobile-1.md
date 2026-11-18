1: `builtin` is a namespace object whose members are components that map straight to the platform's own native views: a system camera preview, a native bottom sheet and a native PDF viewer. Markless doesn't draw these itself. It hands them to the operating system, roughly like React Native's built-in components or the UIKit/Jetpack Compose views behind them. I'm fairly sure of this, about 4 out of 5.

2: It comes from the `@markless/builtin` package. Judging by the name, that package wraps the native controls each target already ships with: UIKit/SwiftUI on iPhone, Android's Material/Compose views, and the closest browser equivalent on the web. It is separate from `@markless/device`, which handles hardware access such as `camera()`. `builtin.camera` is only the view that shows what that camera sees.

3: Mostly the platform. On iPhone it should be a real UISheetPresentationController, with Apple's detents, drag-to-dismiss and spring animation. On Android it should be a Material bottom sheet that behaves the way Google designed it. The app author supplies the content and the open/closed state, and maybe a few options. The look and motion are Apple's and Google's, not Markless's or mine. Confidence is moderate to high.

4: My best guess is the closest web equivalent of each. `builtin.sheet` would likely become a `<dialog>` or a sheet-styled modal. `builtin.camera` would use `getUserMedia` to show a video preview, which needs permission and maybe HTTPS, or falls back to a file-capture input. `builtin.pdf` would show the browser's built-in PDF viewer in an embed or iframe. I'm less sure here, about 3 out of 5, because the framework could also render something it draws itself, or nothing, where the browser has no real equivalent.

5: `builtin.sheet` is the operating system's own sheet, so its look, gestures and animation come from iOS or Android. `drawer` from `@markless/ui` is a headless component the app builds itself, with explicit parts (trigger, backdrop, content, title, close) that I style and control. The drawer should look and behave the same on every platform. The sheet will look like iOS on an iPhone and like Material on Android. Fairly confident.

6: Probably not, or at least it wouldn't be needed. The page already uses a plain `<button>`, which suggests basic elements are mapped to native controls automatically. `builtin` seems reserved for things that need a real OS view and can't be built from ordinary elements: camera, PDF, system sheet. I'd be unsurprised either way, but my lean is no, at about 3 out of 5.

Confidence: 3/5
Tools used: none
