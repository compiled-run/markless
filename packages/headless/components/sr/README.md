# Screen reader suites

What a screen reader actually says about a `@markless/ui` family, asserted as
ordered spoken phrases.

These suites live outside `src/` on purpose. `src/<family>/<family>.browser.ts`
proves the DOM contract — that the trigger carries `role="checkbox"` and
`aria-checked="mixed"`. That is necessary and not sufficient: correct attributes
can still add up to an announcement a blind user cannot act on. These suites
assert the announcement.

## Running them

The virtual lane needs nothing installed and runs anywhere:

```sh
pnpm test:sr                              # every family
pnpm test:sr -- sr/checkbox.sr.test.ts    # one family
pnpm typecheck:sr                         # types for this folder
```

It is driven by [`@guidepup/virtual-screen-reader`][vsr], a screen reader
written in JavaScript. It speaks into a variable instead of a sound card, so
there is no assistive technology to install and no audio to listen to.

It runs in the **browser project**, not in jsdom, because the parts under test
are compiled `.tsrx`: their attributes, focus behaviour and event dispatch are
only real in a real browser, and the reader reads the same DOM Chromium hands
NVDA. Chromium comes from the Playwright install the other browser suites
already use.

To hear a real screen reader locally, macOS needs a one-time permission grant
before VoiceOver can be driven from a script:

```sh
npx @guidepup/setup
```

That writes the macOS automation permission. It is one-time per machine, and it
is the same step CI performs through `guidepup/setup-action`.

## The style: transcript expectations, not wording

A suite here never spells a product's wording. It says which **facts** an
announcement has to convey — role, accessible name, state — which is how the
[w3c/aria-at][aria-at] test plans are written, and the reason the same file can
run against three different readers that phrase everything differently:

| fact           | virtual              | NVDA               | VoiceOver     |
| -------------- | -------------------- | ------------------ | ------------- |
| role           | `checkbox`           | `check box`        | `checkbox`    |
| unchecked      | `not checked`        | `not checked`      | `unchecked`   |
| indeterminate  | `partially checked`  | `half checked`     | `mixed`       |

`driver.ts` holds that seam. A driver supplies the commands (`next`, `press`,
`reannounce`) **and** that reader's vocabulary for the six facts; the suite
names facts, never words. `virtual-driver.ts` is the only implementation today.
NVDA and VoiceOver drivers fill the same shape, and so does a W3C AT Driver
connection later — `@guidepup/guidepup` already exposes `nvda` and `voiceOver`
with the same command surface the interface was cut from.

Expectations are ordered: `readUntil` walks the reading cursor forward until an
announcement conveys what was asked for, and throws with the whole transcript
when it never does — a walk that never arrives is the same defect as a wrong
phrase.

## Two expectations are recorded red

`checkbox.sr.test.ts` ends with two `test.fails` cases. They are aria-at
expectations the family does not meet yet, written the correct way round so the
suite turns **red the day the gap is closed** and whoever closes it deletes the
`.fails`:

- **the help text is conveyed with the box.** `<checkbox.description>` renders a
  plain `div` and wires no `aria-describedby`, so a reader announces it as a
  separate item further down the page instead of as part of the box.
- **Enter leaves a checkbox alone.** The authoring practices give a checkbox one
  activation key, Space. The trigger calls `preventDefault()` on Enter, but the
  component source already records that the request lands after dispatch
  returns, so Enter still toggles.

## Adding a family

1. Write `sr/<family>.sr.test.ts` against `virtualDriver`, seeded from that
   family's aria-at test plan where one exists.
2. Add any fact the family needs to `Vocabulary` in `driver.ts`, and give every
   driver its word for it.
3. Add the family name to each `matrix.family` list in
   `.github/workflows/screen-reader.yml`. Nothing else in the workflow changes.

Never invent an expected phrase. Every phrase traces to an aria-at assertion or
to what the reader actually says about our rendered DOM. Where those two
disagree, that disagreement is the finding — record it in a comment rather than
bending the assertion to fit.

## CI

`.github/workflows/screen-reader.yml`, path-filtered to `packages/headless/**`:

- **virtual** on `ubuntu-latest` — the suites above. Required green, runs on
  every touched pull request.
- **nvda** on `windows-latest` — real NVDA. Required green.
- **voiceover** on `macos-latest` — real VoiceOver, `continue-on-error: true`.
  The reason is in the workflow: `guidepup/setup-action` grants VoiceOver
  automation by writing the runner's permission database directly, and a macOS
  runner image update can break that write. Advisory is not "ignorable", and
  deleting the job is not a fix.

The two real-reader jobs today run `scripts/ci/screen-reader-smoke.mjs`, which
starts the reader, reads one item, and stops. That proves the expensive and
fragile half — that the runner can drive the reader at all — which is the half
no developer machine can reproduce. Pointing them at the family suites is the
next step, and needs the NVDA and VoiceOver drivers plus a served page for
Playwright to navigate.

[vsr]: https://github.com/guidepup/virtual-screen-reader
[aria-at]: https://github.com/w3c/aria-at
