1: The built-in native parts of the operating system, wrapped as components. Each one renders the real iOS or Android control, such as the bottom sheet, the camera view, the PDF viewer, the tab bar and the context or pull-down menu, and falls back to a web version on the website.

2: Other native UI and device features: alerts and action sheets, share sheet, date and time pickers, photo/file picker, maps, web view, toasts or snackbars, navigation bar and toolbar, search bar, switches and segmented controls, plus things like haptics, notifications, the keyboard and safe-area insets.

3: Custom styled components with no native counterpart, such as cards, avatars, design-system buttons or app layout grids, or plain non-UI helpers like a router, data fetching or state management. I'd also be surprised by anything that ignores the platform's look and forces one shared design on all three targets.

4: The operating system does, because it's the native iOS sheet (UISheetPresentationController) or Android bottom sheet, so it follows the platform's own look, detents/drag handle and dark mode. I can probably fill it with my own content, but the sheet itself isn't mine to style, and on the web the framework provides its own fallback look.

Tools used: none
