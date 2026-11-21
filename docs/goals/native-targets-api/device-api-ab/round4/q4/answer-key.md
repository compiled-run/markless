# Platform-namespace question: reader answer key (written before any reader ran)

Every reader sees one page, `q4/solutions/<label>.tsrx`, and no documentation. The page has a camera preview, a Filters sheet drawn by the system, a Comments drawer from the `drawer` family, and a note shown only in the iPhone app.

| Label | Camera and sheet tags | Where they come from |
| --- | --- | --- |
| NT | `<native.camera>`, `<native.sheet>` | `@markless/ui`, the `native` namespace |
| PF | `<platform.camera>`, `<platform.sheet>` | `@markless/device`: the same `platform` object whose `platform.ios` is the build check |
| IA | `ios.*` / `android.*` / `web.*`, each in its own `@if (platform.…)` branch | `@markless/ui`, one namespace per build |
| SY | `<system.camera>`, `<system.sheet>` | `@markless/ui`, the `system` namespace (the blind writers' top name) |
| BC | `<base.camera>`, `<base.sheet>` | `@markless/ui`, the `base` family (the control) |
| BT | `<camera>`, `<sheet>` | built into Markless, no import (comparison only) |

These facts are the same in every version, as each writer sheet states them:

- **The camera picture.** The device draws it. The author only sizes and places the box.
- **The sheet.** The system draws the panel, handle, corners and animation, and a swipe down closes it. Only the content inside is the author's.
- **The website.** The camera shows the browser's camera picture. The sheet is the browser's own `<dialog>` at the bottom of the window, with the browser's default look. In IA this is the `web.*` branch.
- **The drawer.** It is a `@markless/ui` family with behaviour (drag to close, focus, open state) and no styles. The author draws all of it.
- **`platform.ios`.** It names the build. It is true only in the iPhone app, so the note shows only in the iPhone app and not on the website in Safari on an iPhone.

## Scoring rule (6 points)

- **1.** The camera and sheet tags come from where the table says. For PF, the reader must say `platform`, from `@markless/device`. For BT, "built into Markless, no import" is right. "HTML", "custom element" or "web component" gets 0. 1 point.
- **2.** Both exist on the website. The camera shows the browser camera, and the sheet is a browser dialog or panel. 1 point. "Not on the website", "nothing" or "can't tell" for either gets 0. For IA, the reader must name the `web.*` branch, or say the website gets the `web.` elements.
- **3.** The reader says the system decides how the sheet looks, at least its panel or frame, and the author decides how the drawer looks. 1 point. Anything said about the camera is recorded but not scored.
- **4.** The reader says the sheet is drawn by the system or OS and the drawer is the author's own markup or styling from a component family. 1 point.
- **5.** IA: 3 places, one per branch. Every other version: 1 place. 1 point.
- **6.** The reader reads `platform.ios` as the iPhone app build, so the note is for the iPhone app only and not for Safari on an iPhone. 1 point. "Both" or "can't tell" gets 0. For PF, also quote what the reader says `platform.camera` or `platform.sheet` is, and whether they tie it to `platform.ios`. This is recorded as `pfConfusion` and not scored.

Also record question 7's confidence number, and quote every remark where a name suggests something it is not. Examples: `native` read as "phone only", `platform.sheet` read as "only on some platforms", `system` read as an OS settings screen.
