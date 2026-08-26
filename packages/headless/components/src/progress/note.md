# progress — implementation notes

## The value label's text is what the bar reports

`progress.valuelabel` seeds `ownText` from its own `children`, and the bar's
`valueText` returns that text whenever it is a non-empty string, falling back to
the percentage otherwise; an indeterminate bar still reports no value at all. The
bar paints during the projection that holds the value label, so only the seed pass
can put the label's text on it — that is what makes plain text written between the
tags work on both the client and the server path, the same mechanism the
`seed-projected-children` witness in `@markless/vitest-browser` pins. Children that
carry markup (`<progress.valuelabel><b>4</b> of 5</progress.valuelabel>`) have no
value that early: the compiler refuses such a placement with
`MARKLESS_SEED_CHILDREN_UNAVAILABLE` only where the part is compiled in the same
module, and every consumer of this family imports the part, so that placement is
not refused here — it silently leaves the bar on its percentage, which is why there
is no scenario for it and why the guard in `valueText` checks for a string. A
measurement passed as a `children` prop stays live: `scenarios/measurement.tsrx`
changes it from a click and the bar follows even when the value label is the only
reader. What does not follow is the value label's own projection of those children
when it sits inside an `@if` arm: the arm-update symbol reads the part-local prop
id and composition routes only the record's reads, so the page keeps showing the
first wording while the bar already reports the new one, pinned as an expected red
in `progress.browser.ts` and witnessed in `browser/seeded-write`.
