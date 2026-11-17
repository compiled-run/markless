# Q1: what a universal app looks like when a feature does not exist on the web

The app is built from one codebase as an iPhone app, an Android app, a Mac app and a website. Device features exist in
the iPhone and Android builds only (the owner's ruling: absent on a web build and removed at build time).

## Variants and labels

| Label | Variant | What the code says about the web |
| --- | --- | --- |
| HN | Silent | Nothing. Elements show nothing, fields keep starting values, calls do nothing, awaited calls never settle. |
| QT | `supported` per feature | `@if (camera.supported) { … }`; the build rejects an unguarded use whose result is shown or awaited. |
| VR | `platform` checks | `@if (platform.ios || platform.android) { … }`; same build rule. `platform` is the build, fixed at build time. |
| LX | Errors | Making a feature object throws `NotSupportedError`; `@catch` shows the fallback; calls throw or reject. |
| GP | `supported` plus `platform` for UI differences | QT's rule, and `platform.macos` for the ⌘/Ctrl hint. |

Variants HN, QT and LX get the search hint from `modifierKey` ('⌘' on an Apple system, read at run time, so a website
visitor on a Mac gets '⌘'). VR and GP use `platform.macos`, which in a website build is false whatever system the
visitor uses. This difference is part of the design being tested, not a slip: the brief's variant E ("platform only
where the UI differs, for example ⌘ versus Ctrl") only shows ⌘ to a website visitor on a Mac if `platform` describes the
visitor's system, while variant C's guard (`platform.ios || platform.android`) is only sound if `platform` describes the
build. One `platform` cannot mean both.

`<base.camera el={cam} />` comes from `@markless/ui` (the `base` family); the brief names it as settled and does not say
where `base` is imported from.

## Writer task (same words for every variant)

Write one page component, `Post.tsrx`, taking props `title` and `url` (you may split pieces into other components in the
same or other files). The page has:

1. A live camera preview with a "Take photo" button; the last photo taken is shown below it.
2. The person's current location as text, with a "Finding you…" state while waiting and a message when location access
   is refused.
3. A like button that counts presses and gives a light haptic tap on each press.
4. A banner "You are offline" while the device has no connection.
5. A share button that shares the page's title and url.
6. A hint "Press ⌘K to search" for a person on a Mac and "Press Ctrl+K to search" for everyone else.

The page must be right in every build. Decide what website visitors get.
