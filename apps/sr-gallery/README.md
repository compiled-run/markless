# sr-gallery

The page a real screen reader reads.

Every shipped `@markless/ui` family's Basic scenario — the starter a consumer
copies — one section each, on an anchor a driver can be sent to:

<!-- anchors:start -->

| section                | anchor                     |
| ---------------------- | -------------------------- |
| checkbox               | `/#checkbox`               |
| toggle                 | `/#toggle`                 |
| textbox                | `/#textbox`                |
| progress               | `/#progress`               |
| checklist              | `/#checklist`              |
| select                 | `/#select`                 |
| modal                  | `/#modal`                  |
| radio-group            | `/#radio-group`            |
| rating                 | `/#rating`                 |
| tabs                   | `/#tabs`                   |
| popover                | `/#popover`                |
| slider                 | `/#slider`                 |
| tooltip                | `/#tooltip`                |
| slider-range           | `/#slider-range`           |
| datebox                | `/#datebox`                |
| fileupload             | `/#fileupload`             |
| hovercard              | `/#hovercard`              |
| calendar               | `/#calendar`               |
| ink                    | `/#ink`                    |
| pad                    | `/#pad`                    |
| crop                   | `/#crop`                   |
| crop-image             | `/#crop-image`             |
| menu                   | `/#menu`                   |
| menubar                | `/#menubar`                |
| colorpicker            | `/#colorpicker`            |
| buttongroup            | `/#buttongroup`            |
| editable               | `/#editable`               |
| taglist                | `/#taglist`                |
| numberbox              | `/#numberbox`              |
| numberbox-min-max-step | `/#numberbox-min-max-step` |
| numberbox-currency     | `/#numberbox-currency`     |
| tour                   | `/#tour`                   |
| toolbar                | `/#toolbar`                |
| drawer                 | `/#drawer`                 |
| resizable              | `/#resizable`              |
| timebox                | `/#timebox`                |
| timebox-twelve-hour    | `/#timebox-twelve-hour`    |
| gridlist               | `/#gridlist`               |

<!-- anchors:end -->

That table is generated from `FAMILY_ANCHORS` in `preview-server.ts` by
`scripts/anchor-table.ts`, in the order that constant declares — not the order
the page serves. Run the script after adding a family; the boot check runs it
with `--check` and fails when the table is stale.

A family gets a second section when a reader announces one of its shapes
differently: the slider's two-thumb range, and the number box's bounded and
currency shapes, each read differently enough to be worth their own anchor.

It is deliberately ordinary consumer code: imports come through the
`@markless/ui` barrel, the markup is each family's real starter, and there are
no test hooks on it. The single affordance for a driver is `data-gallery-ready`
on `<html>`, set once the mount resolves, so a reader waits on the DOM instead
of a timer.

```sh
pnpm --dir apps/sr-gallery dev        # serve it at http://127.0.0.1:4319
node apps/sr-gallery/scripts/boot-check.ts   # serve it and check every family rendered
```

`preview-server.ts` owns the port and the anchors. The boot check and
`packages/headless/components/test-support/playwright.config.ts` import them from
there rather than spelling their own.

Set `SR_GALLERY_PORT` to serve somewhere other than 4319 — it moves the vite
config's binding, the boot check and the reader lanes together, so two worktrees
can run the check at once:

```sh
SR_GALLERY_PORT=4325 node apps/sr-gallery/scripts/boot-check.ts
```

A fresh dev server spends minutes compiling this page's entry graph on its first
request, and milliseconds on every request after. So the boot check fetches that
graph itself — `/`, the module script the HTML names, and the modules that script
imports — before it launches Chromium, under a single ten-minute budget that
reports what it was still waiting on if it runs out. The browser then meets a
warm server and keeps its 30-second budget, which is what makes a red boot check
mean "a family did not render" rather than "the compiler was slow".

## How far into the page a family sits

A real reader lands here, is sent to the top of web content, and walks forward,
so the cost of reaching a family is the whole document ahead of it. Every
transcript shares one limit on that walk,
`packages/headless/components/test-support/gallery-walk.ts`, and the number in it
is measured rather than guessed:

```sh
node apps/sr-gallery/scripts/measure-walk.ts
```

That serves the page, runs @guidepup/virtual-screen-reader over it, and prints
the step each section is reached at. Re-run it when the gallery grows, and raise
the shared limit if a family has moved past it.
