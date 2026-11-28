1: I'd assume it's a set of wrappers around the phone's built-in native UI and device features: bottom sheets, the camera, the native PDF viewer, the native tab bar and menus. Each one renders the real iOS or Android control in the apps and some web fallback on the website.

2: I'd expect the other native pieces: alerts and action sheets, the share sheet, date and time pickers, a photo or file picker, toasts or snackbars, a navigation bar, haptics, and maybe a map or web view. I'd also expect device features like location, notifications and the keyboard.

3: I'd be surprised to find custom-styled design-system components like cards, buttons with brand styling or layout grids, or non-UI things like data fetching, routing or state management. Anything that isn't backed by the operating system would feel out of place in something called "system".

4: I'd assume the operating system decides: iOS draws a UISheetPresentationController-style sheet, Android draws a Material bottom sheet, and the browser gets a default look. My app would control the content inside it and maybe a few options like size, but not the sheet's look.

Tools used: none
