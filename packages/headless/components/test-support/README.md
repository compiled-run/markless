# Screen reader test support

The family-agnostic half of the screen-reader lanes: the reader seam, the three
drivers that fill it, the two runner configs, and the rules a family's suite is
written under. No test lives here. Each family's suites are colocated beside the
component, the same way `<family>.browser.ts` is:

| file                                   | what it proves                                  |
| -------------------------------------- | ----------------------------------------------- |
| `src/<family>/<family>.browser.ts`      | the DOM contract, in Chromium                    |
| `src/<family>/<family>.sr.ts`           | the announcement, read by a JavaScript reader    |
| `src/<family>/<family>-transcript.ts`   | what a real reader must convey, as facts        |
| `src/<family>/<family>.nvda.ts`         | that transcript, read by real NVDA               |
| `src/<family>/<family>.voiceover.ts`    | that transcript, read by real VoiceOver          |

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
node packages/headless/sr-app/scripts/boot-check.ts   # serve it and check every family rendered
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

Nothing spells an expected phrase. Each family's
`src/<family>/<family>-transcript.ts` names facts as `Conveys` values from
`driver.ts`, and `vocabularies.ts` supplies each reader's word for each fact.
That is why one transcript function runs against both readers, and why a third
reader is a driver plus two lines rather than a copied suite.

The transcript file is where a family's expectations live, and `.nvda.ts` /
`.voiceover.ts` are the thin halves: open the gallery anchor, wait for
`data-gallery-ready`, `navigateToWebContent()`, hand the transcript a
`realDriver`. Nothing that decides what an announcement must convey belongs in
either reader file, because two copies of an expectation drift.

## The page the real readers read

`packages/headless/sr-app` — every shipped family's Basic scenario, one section each, on
anchors a reader can be sent to (`/#checkbox`, `/#toggle`, …). It is consumer
code: it imports through the `@markless/ui` barrel and carries no test hooks.
The one affordance for a driver is `data-gallery-ready` on `<html>`, set after
the mount resolves, so a reader waits on the DOM rather than on a timer.

## Which families the virtual lane reads

Nineteen, one `src/<family>/<family>.sr.ts` each: `accordion`, `carousel`,
`checkbox`, `checklist`, `collapsible`, `combobox`, `modal`, `navbar`, `otp`,
`pagination`, `progress`, `qr-code`, `radio-group`, `select`, `tabs`, `textbox`,
`toaster`, `toggle`, `tree`. The runner config takes `src/**/*.sr.ts`, so a new
file joins the lane by existing; the workflow matrix is the only list that has to
be edited by hand.

Some are seeded from a w3c/aria-at test plan, and the rest say so in their own
header comment rather than implying a plan exists. The families whose provenance
is recorded here:

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

## Which families the real readers read

Five, and each is three files rather than two:

| family        | transcript                                    | what it reads                                      |
| ------------- | --------------------------------------------- | -------------------------------------------------- |
| `checkbox`    | `src/checkbox/checkbox-transcript.ts`         | an unchecked box, then the same box after Space      |
| `select`      | `src/select/select-transcript.ts`             | the collapsed combobox, then its options once open   |
| `modal`       | `src/modal/modal-transcript.ts`               | the dialog is reachable only after its trigger opens |
| `radio-group` | `src/radio-group/radio-group-transcript.ts`   | every option, then the one a choice landed on        |
| `tabs`        | `src/tabs/tabs-transcript.ts`                 | the tab list, then the panel a tab change revealed   |

Unlike the virtual lane, joining is not automatic: the `nvda` and `voiceover`
matrices in `.github/workflows/screen-reader.yml` name the five families by hand,
and a name with no `.nvda.ts` / `.voiceover.ts` file makes that run find no tests.

`radio-group` is the family these lanes exist for. The virtual reader records its
arrow row red — the family sets `input.checked` and never the content attribute
that reader reads — and NVDA and VoiceOver read the platform accessibility tree,
which is built from the property.

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

- **Serving** (`pnpm --dir packages/headless/sr-app dev`) answers 200, then the browser
  reports
  `SyntaxError: The requested module '…/packages/headless/components/src/checkbox/checkbox.tsrx?import' does not provide an export named 'CheckboxDescription'`,
  and nothing mounts.
- **Building** (`pnpm --dir packages/headless/sr-app build`) fails in the client
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
plans: the role, "not checked", and the indeterminate state. Every other slot in
`Vocabulary` is either that reader's documented wording or the wording its
aria-at plan uses, and has **never been observed against our markup**, because
neither reader can be driven on a developer machine without an install and, on
macOS, a permission grant. `vocabularies.ts` marks each slot which it is.

So the five transcripts assert on role, accessible name and the states their
plan records, and stay off the words nobody has heard yet. When a lane fails,
`readUntil` throws with the whole transcript — that transcript is the evidence
for correcting `vocabularies.ts` and widening a suite to the states the virtual
lane already covers.

One case is neither sourced nor documented: NVDA and VoiceOver speak **no role
word at all** for a listbox option — they read the choice's name. That is written
as the empty string, and `missingFacts` skips an empty slot rather than failing a
fact against a word that does not exist. It is the encoding for "this reader has
no word", never a placeholder for one nobody has looked up.

Never bend an assertion to fit a phrase. Where aria-at and a real reader
disagree, that disagreement is the finding.

## Adding a family

1. Write `src/<family>/<family>.sr.ts` against `virtualDriver`, seeded from that
   family's aria-at test plan where one exists.
2. Add any fact the family needs to `Vocabulary` in `driver.ts`, and give every
   driver its word for it — `virtual-driver.ts` from that reader's own output,
   `vocabularies.ts` for NVDA and VoiceOver. A fact only some readers speak —
   "not selected", "not invalid" — gets no slot; assert its absence instead. A
   fact one reader has no word for gets the empty string in that reader's table.
3. To join the real-reader matrices, write `src/<family>/<family>-transcript.ts`
   holding every expectation as `Conveys` facts, then two thin files —
   `<family>.nvda.ts` and `<family>.voiceover.ts` — that open the gallery anchor
   and hand that transcript a `realDriver`. Never a second copy of an
   expectation: the transcript is the one place a fact is written down.
4. Add the family name to the `virtual` job's `matrix.family` list in
   `.github/workflows/screen-reader.yml`, and to the `nvda` and `voiceover` lists
   only once step 3 exists — a name with no spec file makes the run find no
   tests. Nothing else in the workflow changes.
5. Give the family a section in `packages/headless/sr-app` on the anchor the reader files
   name: the real lanes read that served page, not a rendered container.

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

Both real-reader jobs are matrixed over the five families above and read the
served gallery. A boot check runs first and is allowed to fail; when it fails the
job falls back to `scripts/ci/screen-reader-smoke.mjs`, which starts the reader,
reads one item, and stops. That fallback is not a pass — it proves only that the
runner can drive the reader at all, which is the expensive, fragile half no
developer machine can reproduce. Nothing in the workflow has to change the day
the gallery renders; the boot check starts succeeding and the family suites run.

**These lanes run in CI only.** Neither reader can be driven on a developer
machine without an install and, on macOS, a permission grant, so `pnpm test:sr`
— the virtual lane — is the whole of what a local run proves.

[vsr]: https://github.com/guidepup/virtual-screen-reader
[aria-at]: https://github.com/w3c/aria-at


> Staleness note (2026-08-23): four gaps listed above closed at fc66d3f9 — toggle/textbox help text is conveyed with the control (checkbox's remains pinned), the progress bar is named by its visible label, and an indeterminate bar reports no value.
