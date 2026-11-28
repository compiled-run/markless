1: I'd guess it's a set of components that wrap the phone's own built-in UI and hardware: bottom sheets, the camera, a PDF viewer, a bottom tab bar and dropdown menus. On iOS and Android they'd render the real system controls, and on the website they'd fall back to some HTML version.

2: I'd expect more device features like geolocation, push notifications, the share sheet, haptics/vibration, file pickers, biometrics (Face ID or fingerprint), the clipboard, and alerts/confirm dialogs. Probably also helpers to check which platform the app is running on, plus permission prompts.

3: I'd be surprised to find ordinary layout or styling pieces like buttons, grids, cards or a theme system. Data fetching, routing or state helpers would also be odd here, since `native.*` reads like "the OS's own widgets and hardware" rather than general app building blocks.

4: Mostly the operating system: I'd expect iOS and Android to draw it with their own look, so I'd only control what goes inside it and maybe a few options like height. On the website I'm not sure who decides, either Markless's default styles or my own CSS.

Tools used: none
