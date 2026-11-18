1: I assume `@markless/ui` is the framework's component library, and that `native` is a group of components that wrap each platform's built-in controls. On iPhone and Android those would be the real system bottom sheet, camera, PDF viewer, tab bar and dropdown menu. On the website they would be the closest web equivalent, such as a `<dialog>`, `getUserMedia` video, an embedded PDF viewer and a `<select>`-like menu.

2: I'd expect more `native.*` wrappers for other system features, like a date/time picker, share sheet, alert/confirm dialog, toast, file picker, map, video player, haptics or notifications. Next to those I'd expect ordinary cross-platform building blocks: buttons, inputs, dialogs, popovers, tabs, lists, and probably some layout primitives.

3: I'd be surprised to find things that aren't UI, like routing, data fetching, the `state()` function itself, or device APIs with no visible element (geolocation, storage). I'd also be surprised by a fully styled, opinionated design system with themes that fights the native look the `native.` prefix promises.

4: I'd assume the operating system decides: iOS draws its standard sheet, Android its standard bottom sheet, and the browser or Markless provides a default on the web. I'd control only what goes inside it (`<Filters />`), plus maybe a few options such as size or detents. I wouldn't expect to restyle the sheet frame itself with my own CSS.

Tools used: none
