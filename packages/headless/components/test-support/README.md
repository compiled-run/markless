# Screen reader test support

The family-agnostic half of the screen-reader lanes: the reader seam, the three
drivers that fill it, the two runner configs, and the rules a family's suite is
written under. No test lives here. Each family's suites are colocated beside the
component, the same way `<family>.browser.ts` is:

| file                                   | what it proves                                  |
| -------------------------------------- | ----------------------------------------------- |
| `src/<family>/<family>.browser.ts`      | the DOM contract, in Chromium                    |
| `src/<family>/<family>.sr.ts`           | the announcement, read by a JavaScript reader    |
| `src/<family>/<family>.nvda.ts`         | the announcement, read by real NVDA              |
| `src/<family>/<family>.voiceover.ts`    | the announcement, read by real VoiceOver         |

A browser suite proves the trigger carries `role="checkbox"` and
`aria-checked="mixed"`. That is necessary and not sufficient: correct attributes
can still add up to an announcement a blind user cannot act on. The `.sr.ts`,
`.nvda.ts` and `.voiceover.ts` suites assert the announcement.

## Running them

The virtual lane needs nothing installed and runs anywhere:

```sh
pnpm test:sr                                          # every family
pnpm test:sr -- src/checkbox/checkbox.sr.ts           # one family
pnpm typecheck:sr                                     # types for the virtual lane
```

It is driven by [`@guidepup/virtual-screen-reader`][vsr], a screen reader
written in JavaScript. It speaks into a variable instead of a sound card, so
there is no assistive technology to install and no audio to listen to.

It runs in a **browser project**, not in jsdom, because the parts under test
are compiled `.tsrx`: their attributes, focus behaviour and event dispatch are
only real in a real browser, and the reader reads the same DOM Chromium hands
NVDA. Chromium comes from the Playwright install the other browser suites
already use.

The real-reader lanes need the reader installed, and read a served page:

```sh
node apps/sr-gallery/scripts/boot-check.ts   # serve it and check every family rendered
pnpm test:sr-real -- --project=nvda          # Windows, NVDA installed
pnpm test:sr-real -- --project=voiceover     # macOS, automation permission granted
pnpm typecheck:sr-real                       # types for the real-reader lane
```

To hear a real screen reader locally, macOS needs a one-time permission grant
before VoiceOver can be driven from a script:

```sh
npx @guidepup/setup
```

That writes the macOS automation permission. It is one-time per machine, and it
is the same step CI performs through `guidepup/setup-action`.

## The style: transcript expectations, not wording

A suite never spells a product's wording. It says which **facts** an
announcement has to convey — role, accessible name, state — which is how the
[w3c/aria-at][aria-at] test plans are written, and the reason the same file can
run against three different readers that phrase everything differently:

| fact           | virtual              | NVDA               | VoiceOver     |
| -------------- | -------------------- | ------------------ | ------------- |
| role           | `checkbox`           | `check box`        | `checkbox`    |
| unchecked      | `not checked`        | `not checked`      | `unchecked`   |
| indeterminate  | `partially checked`  | `half checked`     | `mixed`       |

`driver.ts` holds that seam. A driver supplies the commands (`next`, `press`,
`reannounce`) **and** that reader's vocabulary for every fact; the suite names
facts, never words. A fact no reader has an honest word for does not get one
invented: it is asserted as an **absence** instead — `missingFacts(…, { state:
['selected'] })` is expected *not* to be empty — which is how "this tab is not
the one showing" and "this field is not invalid" are proven. `virtual-driver.ts` fills it with the JavaScript
reader; `page-driver.ts` fills it with NVDA or VoiceOver driven over a served
page through Playwright, and `vocabularies.ts` supplies each of those two
readers' word for each fact. A W3C AT Driver connection fills the same shape
later — `@guidepup/guidepup` already exposes `nvda` and `voiceOver` with the
same command surface the interface was cut from.

Expectations are ordered: `readUntil` walks the reading cursor forward until an
announcement conveys what was asked for, and throws with the whole transcript
when it never does — a walk that never arrives is the same defect as a wrong
phrase.

**After a gesture that reshapes the page, walk forward — do not re-read in
place.** `reannounce()` steps off the item and back onto it, which re-reads from
the live DOM and is right when the gesture only changed an attribute (a checkbox
ticking, a switch flipping). When the gesture reveals or hides content —
`collapsible` opening its panel, `tabs` swapping which panel is showing — the
tree grows or shrinks under the cursor and stepping back lands somewhere else
entirely. Those suites poll `next()` instead, which wraps around a tree this
small and reaches the item either way. A suite that gets this wrong is not
wrong every run, which is worse: it is flaky.

**When the gesture moves a roving focus, take the announcement the reader made
by itself — `settleOnFocus()`, not `reannounce()`.** A focus move makes this
reader speak from a `focusin` listener that opens with one task-queue hop, so
the announcement is often still queued when `press()` returns, and a re-read
started in that window races it. Worse, the re-read's round trip — step off the
item, step back on — is a *fixpoint* at a list's "end of" boundary: previous
lands on the last item, next lands back on the boundary. A cursor knocked onto
that boundary by the in-flight announcement is stuck there, so every later
re-read returns the same phrase and polling can never recover. Measured on
`select`'s arrow row, which passed alone and failed in-lane once `carousel`'s
timer made the lane slow enough for the two to overlap. `settleOnFocus()` waits
for the reader's cursor to reach what the page focused and answers with what it
said there, which is both the announcement a person would hear and the only one
the assertion can name.

## What the real lanes share, and what they decide

| shared with the virtual lane                                 | decided per reader              |
| ------------------------------------------------------------ | ------------------------------- |
| `ScreenReaderDriver`, `Conveys`, `missingFacts`, `readUntil` | each reader's words for a fact  |
| the facts each announcement has to convey                     | how a phrase splits into facts  |

Nothing spells an expected phrase. `src/checkbox/checkbox-transcript.ts` names
facts as `Conveys` values from `driver.ts`, and `vocabularies.ts` supplies each
reader's word for each fact. That is why one transcript function runs against
both readers, and why a third reader is a driver plus two lines rather than a
copied suite.

## The page the real readers read

`apps/sr-gallery` — every shipped family's Basic scenario, one section each, on
anchors a reader can be sent to (`/#checkbox`, `/#toggle`, …). It is consumer
code: it imports through the `@markless/ui` barrel and carries no test hooks.
The one affordance for a driver is `data-gallery-ready` on `<html>`, set after
the mount resolves, so a reader waits on the DOM rather than on a timer.

## Which families the virtual lane reads

Eight, one `src/<family>/<family>.sr.ts` each: `checkbox`, `checklist`,
`collapsible`, `progress`, `radio-group`, `tabs`, `textbox`, `toggle`. The
runner config takes `src/**/*.sr.ts`, so a new file joins the lane by existing;
the workflow matrix is the only list that has to be edited by hand.

Four of the eight are seeded from a w3c/aria-at test plan, and the other four say
so in their own header comment rather than implying a plan exists:

| family                | plan it is seeded from                                              |
| --------------------- | ------------------------------------------------------------------- |
| `checkbox`            | `tests/apg/checkbox` and `tests/apg/checkbox-tri-state`               |
| `checklist`           | the same two plans, read as a group                                   |
| `radio-group`         | `tests/apg/radiogroup-roving-tabindex`                                |
| `tabs`                | `tests/apg/tabs-automatic-activation` and `…-manual-activation`       |
| `collapsible`         | the disclosure plan — disclosure is the specification's name for it   |
| `toggle`              | **no aria-at plan for `role="switch"`;** the APG switch pattern       |
| `progress`            | **no aria-at plan for `role="progressbar"`;** the ARIA specification  |
| `textbox`             | **no aria-at plan for a plain text input;** the ARIA specification    |

An absence is written down, never papered over. Where a family's own rows go
past what its plan covers — a disabled option, a whole disabled group, a vertical
tab list — the suite says the row is ours rather than the plan's.

## Some expectations are recorded red

Several suites end in `test.fails` cases. They are expectations something does
not meet yet, written the correct way round so the suite turns **red the day the
gap is closed** and whoever closes it deletes the `.fails`. Two of them are about
this lane rather than about a family, which is the distinction to keep:

Gaps in a family:

- **the help text is conveyed with the control** (`checkbox`, `toggle`,
  `textbox`). The description part renders a plain `div` and wires no
  `aria-describedby`, so a reader announces it as a separate item further down
  the page instead of as part of the control. In `textbox` the same gap has a
  worse form, recorded separately: a field conveyed as invalid whose error text
  is unreachable, so a person is told the field is wrong and never told why.
- **Enter leaves a checkbox alone.** The authoring practices give a checkbox one
  activation key, Space. The trigger calls `preventDefault()` on Enter, but the
  component source already records that the request lands after dispatch
  returns, so Enter still toggles.
- **the panel carries the name of the tab that shows it** (`tabs`). aria-at gives
  that name priority 1; `tabs.content` wires no `aria-labelledby`, so a reader
  reaches an unnamed region.
- **the bar carries the name its visible label gives it** (`progress`), and **an
  indeterminate bar reports no current value**. `progress.root` writes a
  hard-coded `aria-label="progress"` and an `aria-valuetext` computed from `min`,
  so every bar is named "progress" and a bar whose progress is unknown announces
  "0%".

A gap in this lane, not in a family:

- **an arrow announces the radio it chose** (`radio-group`). Measured: after the
  arrow the option's `input.checked` is `true` and its indicator reads "Chosen",
  while the `checked` *content attribute* stays `null` — the platform makes that
  attribute the default state and the property the current one, and the family
  sets the property. `@guidepup/virtual-screen-reader` reads the attribute, so it
  announces "not checked" about a radio the browser considers checked. This is
  exactly the assertion the real-reader lanes exist to carry: NVDA and VoiceOver
  read the platform accessibility tree, which is built from the property.

## Known blocker: the gallery does not render yet

**The real-reader suites cannot pass today**, and the reason is not in this
folder.

An app that uses member tags — `<checkbox.root>`, the entire authoring surface
of `@markless/ui` — loses exports through the compiler's public-render pass:

- **Serving** (`pnpm --dir apps/sr-gallery dev`) answers 200, then the browser
  reports
  `SyntaxError: The requested module '…/packages/headless/components/src/checkbox/checkbox.tsrx?import' does not provide an export named 'CheckboxDescription'`,
  and nothing mounts.
- **Building** (`pnpm --dir apps/sr-gallery build`) fails in the client
  environment with `MISSING_EXPORT`, including for the app's own component:
  `"Gallery" is not exported by "src/Gallery.tsrx"`.

It is not about crossing a package boundary. A component in the app's own
`src/` that uses a member tag over a namespace imported from a sibling `.tsrx`
in the same folder drops its own export the same way, so the trigger is the
member tag, not `@markless/ui`.

Until that is fixed the two real-reader jobs fall back to
`scripts/ci/screen-reader-smoke.mjs`, which proves the runner can drive the
reader — the expensive, fragile half that no developer machine can reproduce.
The workflow decides between them from the boot check's outcome, so the day the
compiler renders member tags the lanes start reading the real page with no
workflow edit.

## Two vocabularies are part-verified

The reader table above records three words per reader, taken from the w3c/aria-at
plans: the role, "not checked", and the indeterminate state. The other four
slots in `Vocabulary` are each reader's documented wording and have **never been
observed against our markup**, because neither reader can be driven on a
developer machine without an install and, on macOS, a permission grant.

So `src/checkbox/checkbox-transcript.ts` asserts only on the sourced words, and
covers two steps of the aria-at checkbox plan: reading an unchecked box, and
reading it after Space. When a lane fails, `readUntil` throws with the whole
transcript — that transcript is the evidence for correcting `vocabularies.ts`
and widening the suite to the indeterminate, disabled and invalid states the
virtual lane already covers.

Never bend an assertion to fit a phrase. Where aria-at and a real reader
disagree, that disagreement is the finding.

## Adding a family

1. Write `src/<family>/<family>.sr.ts` against `virtualDriver`, seeded from that
   family's aria-at test plan where one exists.
2. Add any fact the family needs to `Vocabulary` in `driver.ts`, and give every
   driver its word for it. A fact only some readers speak — "not selected", "not
   invalid" — gets no slot; assert its absence instead.
3. Add the family name to the `virtual` job's `matrix.family` list in
   `.github/workflows/screen-reader.yml`, and to the `nvda` and `voiceover` lists
   only once that family has a `.nvda.ts` / `.voiceover.ts` spec — a name with no
   spec file makes the run find no tests. Nothing else in the workflow changes.

Never invent an expected phrase. Every phrase traces to an aria-at assertion or
to what the reader actually says about our rendered DOM. Where those two
disagree, that disagreement is the finding — record it in a comment rather than
bending the assertion to fit.

## CI

`.github/workflows/screen-reader.yml`, path-filtered to `packages/headless/**`:

- **virtual** on `ubuntu-latest` — the `.sr.ts` suites. Required green, runs on
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
next step, and needs the gallery to render.

[vsr]: https://github.com/guidepup/virtual-screen-reader
[aria-at]: https://github.com/w3c/aria-at


> Staleness note (2026-08-23): four gaps listed above closed at fc66d3f9 — toggle/textbox help text is conveyed with the control (checkbox's remains pinned), the progress bar is named by its visible label, and an indeterminate bar reports no value.
