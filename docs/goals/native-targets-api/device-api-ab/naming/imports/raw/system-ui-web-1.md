1: I'd guess `@markless/ui` is Markless's library of ready-made UI components. The `system` group looks like wrappers around the phone's or browser's built-in controls: native bottom sheets, the camera, a PDF viewer, the tab bar and menus.

2: I'd expect the other built-in pickers and dialogs under `system` too, like a date picker, a share sheet, alerts and confirm boxes, toasts, a file picker and maybe a map. Outside `system`, I'd expect the framework's own components that I can style myself, such as buttons, inputs, modals, tabs and dropdowns.

3: I'd be surprised to find device features that don't draw anything, like geolocation, storage, push notifications or haptics, in a package called "ui". I'd also be surprised if `system` meant something about the operating system other than UI, or if these components were fully custom-drawn instead of native.

4: Mostly the platform: iOS draws it like an iOS sheet, Android like an Android bottom sheet, and on the website it probably falls back to a browser `<dialog>` or a default style. I'd expect to control only what's inside it and maybe a few options like height, not its chrome or animation.

Tools used: none
