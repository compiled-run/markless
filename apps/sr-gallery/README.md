# sr-gallery

The page a real screen reader reads.

Every shipped `@markless/ui` family's Basic scenario — the starter a consumer
copies — one section each, on an anchor a driver can be sent to:

| section      | anchor           |
| ------------ | ---------------- |
| checkbox     | `/#checkbox`     |
| toggle       | `/#toggle`       |
| textbox      | `/#textbox`      |
| progress     | `/#progress`     |
| checklist    | `/#checklist`    |
| select       | `/#select`       |
| modal        | `/#modal`        |
| radio-group  | `/#radio-group`  |
| tabs         | `/#tabs`         |
| popover      | `/#popover`      |
| slider       | `/#slider`       |
| slider-range | `/#slider-range` |
| tooltip      | `/#tooltip`      |
| datebox      | `/#datebox`      |
| fileupload   | `/#fileupload`   |
| hovercard    | `/#hovercard`    |
| menu         | `/#menu`         |
| colorpicker  | `/#colorpicker`  |

The slider appears twice: the one-thumb starter, and the two-thumb range shape,
which a reader announces differently and so gets a section of its own.

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

## It does not render yet

`pnpm --dir apps/sr-gallery build` fails and `dev` serves a page that never
mounts. The cause is in the compiler, not here: a component that uses a member
tag (`<checkbox.root>`) loses its own export through the public-render pass.
`packages/headless/components/test-support/README.md` has the exact errors and the
narrowing that shows it is the member tag rather than the package boundary.

The screen-reader workflow already runs the boot check as its gate, so these
lanes start reading this page the day that is fixed, with no workflow edit.
