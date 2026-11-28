1: I'd guess it's a set of ready-made components that hook into the device's or browser's built-in features and UI, like bottom sheets, the camera, a PDF viewer, tab bars and menus. It looks like the "native stuff" layer, where each one becomes the real iPhone or Android control in the app and a reasonable web version on the website.

2: I'd expect other device and OS things: a share button or share sheet, alerts and confirm dialogs, toasts or notifications, a date and time picker, a file or photo picker, geolocation or maps, clipboard, vibration, and maybe biometric login or a QR scanner. I'd also look for things like a status bar or safe-area wrapper, a navigation bar or back button, and a pull-to-refresh list.

3: I'd be surprised to find plain layout or styling pieces like a Button, Card, Grid or text input that look the same everywhere, or anything unrelated to the device, like a data-fetching client, router, form validation or state helpers. Business-y components such as a data table or chart would also feel out of place under the name "system".

4: My guess is the operating system decides: on iPhone it looks like an iOS sheet, on Android like an Android one, and on the web probably the browser's dialog or some default Markless styling. I'd assume I can only tweak it a little, if at all, and that its content (`<Filters />`) is the part I fully control.

Tools used: none
