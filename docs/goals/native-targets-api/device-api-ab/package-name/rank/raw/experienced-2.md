1. `ui`: My first guess for unstyled, cross-platform building blocks like a tab bar and a dialog is a `ui` package, the way Radix, Ark UI and Headless UI work.
2. `components`: Some libraries use this plain name for their component set, so I'd try it if `ui` didn't exist.
3. `headless`: The tab bar and dialog need to come with no styles so I can add my own, and "headless" is the usual word for that.
Tools used: none
