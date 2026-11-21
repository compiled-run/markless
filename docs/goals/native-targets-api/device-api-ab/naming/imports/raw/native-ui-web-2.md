1: I assume `@markless/ui` is Markless's component library, and `native` is a group of components that wrap things the phone already provides: a bottom sheet, the camera, a PDF viewer, a tab bar and a menu. On the website, I'd guess each one becomes a reasonable web version.

2: I'd expect regular cross-platform UI pieces that aren't under `native`, like buttons, inputs, dialogs, popovers and tabs. Under `native` I'd expect more device features, such as a date picker, share sheet, alerts or toasts, a photo picker, maps and maybe haptics.

3: I'd be surprised to find things that aren't UI, like data fetching, routing, storage or auth helpers. I'd also be surprised if `native.*` gave me a styled, branded design system, or if a "native" component only worked on phones and broke on the website.

4: I'd assume the operating system decides, so it looks like a real iOS sheet on iPhone and a Material bottom sheet on Android. I control what goes inside it, and on the web the framework probably supplies a default that I could restyle with CSS.

Tools used: none
