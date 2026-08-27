# The ink lane leak is a Vite error overlay, and it covers the whole tester page

## Verdict

`src/pad/pad.browser.ts > CSR: a controlled pad moves only once the page writes the
points back` reds after ink's suite runs because ink's last row deliberately provokes a
build refusal, and the dev server paints `<vite-error-overlay>` over the tester page.
The overlay is appended to the **page that hosts the test iframe**, not to the iframe, so
`cleanup()` never sees it and it outlives the file that raised it. Every real gesture in
the rest of the lane lands on the overlay instead of the page under it.

Fixed at the source: the row that provokes the refusal now takes its own overlay down,
and pins that it did.

    packages/headless/components/src/ink/ink.browser.ts
      await expect(import('./scenarios/method.tsrx')).rejects.toThrow();
      await expect.poll(() => clearDevServerErrorOverlay()).toBeGreaterThan(0);

    packages/headless/components/test-support/dev-error-overlay.ts   (new helper)

Not a family defect. Nothing in `ink.tsrx` leaks a listener, a pointer capture or a
style: the leak is a test that trips the dev server and leaves the wreckage on the page.
`pad.tsrx` and every framework package are untouched.

## The measurement that settled it

A probe in the pad row, on the failing lane, listening in capture on both the iframe's
`document` and the **host page's** document across `userEvent.click`:

| Reading | Red run (CSR) | Green run (SSR, same file) |
| --- | --- | --- |
| events seen inside the iframe | none at all | `mousemove,pointerdown,mousedown,pointerup,mouseup,click` on `BUTTON[reset]` at 25,246 |
| events seen on the host page | all six, on `VITE-ERROR-OVERLAY`, at 20,198 | none |
| `document.hasFocus()` after the click | false | true |
| host page `activeElement` after the click | `BODY` | `IFRAME` |

20,198 is 25,246 scaled by 0.8036, which is exactly the iframe's scale (332.68 / 414 wide,
720 / 896 tall). So Playwright's coordinates were right the whole time - the click was
delivered to the correct point of the host page, and the overlay was sitting on it.

Everything earlier in the row still worked because none of it is a real gesture routed by
geometry: `thumb.focus()` is a JS call, and the pad's drag is `dispatchEvent` on the area.
`userEvent.keyboard` also worked, because keys go to the focused frame rather than to a
hit test. Only the one real click in the file was blocked, which is why exactly one row red.

The SSR row in the same file passed because the CSR row's click **dismissed** the overlay -
Vite closes it when it is clicked. One row pays for the whole lane.

Ruled out along the way, each with a reading rather than an argument: no element held
pointer capture for pointerId 1 at click time (`hasPointerCapture(1)` scanned across every
element in the iframe: none); `document.elementFromPoint` at the button's centre returned
the button itself, so nothing inside the page covered it; the iframe carried only the two
expected `<style>` elements and one body child, so no `@layer markless` block leaked in;
and the host page held exactly one iframe, so ink's own frame was long gone.

## Why the earlier readings all fit

- **`-t` filtered green (U648).** The overlay is raised by the dynamic `import()` inside the
  row, so it only appears when ink's test *runs*, not when ink's modules are merely built.
- **Byte-identical bundler output (U647).** Nothing about the emitted artifact changes; the
  difference is a DOM node on the host page.
- **Dev-log resolved 1.3 s before the click (U648).** True and irrelevant - there was no load
  window, there was a cover.
- **`route`/`dispatch` never saw a `click` while `focusin`/`keydown`/`pointerdown` routed
  normally (U648).** The routed ones were all synthetic or focus-driven; the click was the
  only real one.
- **U645's `document.title` probe.** The handler body never ran because the click never
  reached the button - not because a state write was dropped.
- **U645's cross-module symbol-registry theory.** The refusal names `pad` and `paths` for a
  file that binds neither, which is a real oddity in the diagnostic text, but it is not what
  reds the pad row: with the overlay taken down the same refusal still fires, with the same
  text, and the lane is green. Whether the registry is genuinely shared across modules is a
  separate question about the message, not about this row.

`parkPointerClearOfMount` in `test-support/pointer-parking.ts` was also silently failing
under the overlay for the whole affected stretch: its hover is a real gesture, it hit the
overlay, and its `catch` swallowed the failure. That is now moot but worth knowing.

## What was measured after the fix

| Lane | Runs | Result |
| --- | --- | --- |
| `--project ui .../ink .../pad` | 3 | 108 passed each |
| `--project ui .../crop .../ink .../pad` | 3 | 166 passed each |
| `--project ui` (whole project) | 1 | 36 files, 1965 passed, 18 expected fail, 22 skipped |
| `pnpm typecheck` | 1 | clean |
| `pnpm exec vp lint --deny-warnings` | 1 | 0 warnings, 0 errors |

`pnpm test:sr` red once on `src/radio-group/radio-group.sr.ts:74` ("Matcher did not succeed
in time"), then green on two reruns. That lane runs from `test-support/vitest.config.ts`,
which declares no setup file and imports nothing this unit touched, so the change cannot
reach it; recorded as a pre-existing flake, not adjudicated here.

## The other symptom, and it is not this

U645 also saw `src/ink/ink.browser.ts > a drawing served whole is edited from the keyboard
once the page resumes` red once, with two paths where one was expected. **Not the same
cause, on the evidence available.** Ink's overlay is raised by the last row in ink's own
file, so it cannot reach a row above it. To test the general shape anyway, the lane was run
as `toaster ink` with the new teardown disabled - `src/toaster/toaster.browser.ts` has the
identical refusal row and raises an overlay of its own before ink starts - and ink came back
green (77 passed, 1 expected fail). That row also passed in all seven runs above. It is
unreproduced and unexplained; treat it as a separate lead.

## What is still open

`packages/headless/components/src/toaster/toaster.browser.ts:211` has the same row and the
same leak, and it is outside this unit's file contract. Its overlay covers every real
gesture in whatever file the lane runs after `toaster`. Nothing is red today, because the
ink row was the one that happened to sit in front of a real click - but the next family
whose suite lands after toaster and clicks anything will red for this reason and look like
a flake. One line at that row (`clearDevServerErrorOverlay()`, same helper) closes it.

A lane-wide guard is the obvious alternative and was tried and dropped. The natural home is
a `beforeEach` in `test-support/browser-setup.ts`, but that file is not wired into any
project: U538 measured that adding `setupFiles` to
`packages/headless/components/vitest.config.ts` turns the fileupload "SSR cold first click"
witness deterministically red, and reverted the line. A guard there would be dead code
today, so it was written, measured, and then taken back out.
