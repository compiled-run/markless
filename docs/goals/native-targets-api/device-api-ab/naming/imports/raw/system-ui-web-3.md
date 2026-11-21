1: I assume `@markless/ui` is the framework's UI component library. The `system` export looks like a group of ready-made components that use the phone's or browser's own built-in controls, like a bottom sheet, the camera, a PDF viewer, a tab bar and a dropdown menu, rather than ones Markless draws itself.

2: I'd expect other built-in pieces under `system`, such as alerts or confirm dialogs, a share sheet, date and time pickers, file or photo pickers, toasts or notifications, maybe a map or video player. Outside `system`, I'd expect the usual unstyled building blocks: buttons, dialogs, tabs, popovers, inputs and so on.

3: I'd be surprised to find things that aren't UI, like data fetching, routing, storage or auth helpers, under a `ui` package. I'd also be surprised if `system` held non-visual device features with no component to render, like the battery level, GPS readings or vibration, or heavily branded, styled components.

4: I'd assume the operating system or browser decides, so it looks like a normal iOS sheet on iPhone, a Material bottom sheet on Android and some built-in dialog on the web. I'd probably only control what goes inside it, not how the sheet itself looks.

Tools used: none, apart from the one required Read that loaded this prompt.
