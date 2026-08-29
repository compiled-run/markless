# U745 — why the taglist cap row was nondeterministic

## The measurement

Probes in `taglist.tsrx` (`onInput`) and in the row (a capture-phase `input`
listener on the field), both stamped with `performance.now()`, on the pilot tip.
One failing CSR run, second gesture (`typeInto(Input, 'five;')`):

```
8496 capture value="f"        8496 handler next="f"  cellinput ""
8497 capture value="fi"
8497 capture value="fiv"
8498 capture value="five"
8499 capture value="five;"
     (after the gesture the field reads "five;")
8515 handler next="f"  cellinput "f"      <- and 13 more, all reading "f"
```

Every event is `isTrusted: true`: nothing is replayed, these are the real
keystrokes. The handler for `f` ran promptly, wrote `taglist.input = 'f'`, and
the commit that followed wrote that back onto the bound `value` — rewinding the
field from `five;` to `f` and destroying `ive;`. The four events queued behind it
then read the rewound text, so `;` never reached a handler, `take` was never
called a second time, and `spoken` stayed at `2 tags added`.

The row passed whenever the dispatch queue happened to be far enough behind that
the first of the five events ran only after all five keystrokes had landed —
then it read `five;`, took, and was refused. That is the whole coin flip.

Candidates (a)–(d) from the packet were all measured and are all wrong: the
refused path's lone `spoken` write commits fine (the probe read it back, and the
live region showed it whenever `take` ran); the events are real, not replays; the
SSR row fails by the same mechanism as CSR rather than through a demand load; and
U742's seed ledger only changed how far behind the queue runs.

## The cause and the fix

A dispatch is asynchronous. A person typing fast lands more keystrokes between
the handler reading the field and the graph flush writing a bound `value` back
onto it. Writing the handler's answer over them is a runtime defect: it rewinds
the control to text from several keystrokes ago and swallows the rest of the run.

`packages/web/src/control-edit-hold.ts` notes what an editable control
(`input`/`textarea`/`select`/contenteditable) read like at the start of the
dispatch — `value` and `checked` — and the three property-write sites
(`dom-journal.ts`, `render-csr.ts`, `event-resume.ts`) hold the write when the
control has moved since. The dispatch for the keystroke that moved it writes the
settled answer instead. The note is per dispatch and its release restores any
outer dispatch's note, so overlapping chains do not drop each other's.

The rule only ever skips a write that would discard user input the handler never
saw, so nothing else changes: a control that did not move is written exactly as
before.

## Witness

`packages/vitest-browser/browser/typed-past-commit/` — a page with a controlled
field whose handler waits 60 ms before writing the cell (a dispatch really does
load its symbol and settle write observers before it commits; here the wait is
long enough to type through on purpose). CSR and SSR both:

- before the fix: `expected 'ab' to be 'abcdefgh'` — the commit for `b` rewound
  the field and the rest of the run was swallowed
- after the fix: green

## Results

- `pnpm typecheck` clean
- `pnpm exec vitest run --project node packages/web` — 653 passed
- `pnpm exec vitest run --project ui taglist` — 95 passed
- cap row, five consecutive runs — 2 passed, five times

## One thing to hand on

The `--project ui taglist` run reports 11 unhandled `RuntimeResumeError: Resume
locator c6:h3 expected <input> ... but found <div>` rejections (baseline is 1).
They do not fail the file. Measured cause: the cap row now finishes about four
seconds earlier than it did while it was timing out, so dispatches still queued
behind it land after `cleanup()` has replaced the container. Adding a four-second
settle to the end of the row takes the count to zero. That is a teardown race in
the browser harness, not the guard — worth its own unit.
