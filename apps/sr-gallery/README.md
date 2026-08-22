# sr-gallery

The page a real screen reader reads.

Every shipped `@markless/ui` family's Basic scenario — the starter a consumer
copies — one section each, on an anchor a driver can be sent to:

| family    | anchor       |
| --------- | ------------ |
| checkbox  | `/#checkbox`  |
| toggle    | `/#toggle`    |
| textbox   | `/#textbox`   |
| progress  | `/#progress`  |
| checklist | `/#checklist` |

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
`packages/headless/components/sr-real/playwright.config.ts` import them from
there rather than spelling their own.

## It does not render yet

`pnpm --dir apps/sr-gallery build` fails and `dev` serves a page that never
mounts. The cause is in the compiler, not here: a component that uses a member
tag (`<checkbox.root>`) loses its own export through the public-render pass.
`packages/headless/components/sr-real/README.md` has the exact errors and the
narrowing that shows it is the member tag rather than the package boundary.

The screen-reader workflow already runs the boot check as its gate, so these
lanes start reading this page the day that is fixed, with no workflow edit.
