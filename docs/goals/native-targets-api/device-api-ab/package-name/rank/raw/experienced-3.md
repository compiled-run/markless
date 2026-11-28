1. `ui`: Tab bars and modal dialogs are UI components, and unstyled ones you style yourself usually come in a package called "ui" (or "headless"). A short `@markless/ui` sitting next to `core`, `router` and `web` is the name I'd guess first.
2. `components`: This is the plain name many frameworks use for a set of ready-made building blocks like tabs and dialogs. I'd try it if `ui` didn't exist.
3. `native`: These parts have to run inside the iPhone and Android apps as well as the website, so they might sit in a package named for the native side, the counterpart to `@markless/web`.

Tools used: none
