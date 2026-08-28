# radio-group's arrow row: the re-read that walked off the option

`radio-group.sr.ts` "arrowing to the next option moves the reader onto that
option" timed out intermittently, always with the same one missing fact —
`role "radio"`. The name `Annual` was there. The reader was announcing the
option's **label text**, not the option.

## The measurement

A throwaway suite in the family folder pressed ArrowDown twelve times, each in
its own freshly rendered scenario, and logged after every step: what the page
had focused, which node the reader's cursor was on, and what it had just said.

Eleven of the twelve runs looked like this — the focus move had already
happened by the time `press()` returned, and the re-read converged at once:

```
after press cursor=<input annual-field> focus=<input annual-field> said="radio, Annual, not checked"
attempt 0: prev->Text "Monthly"  next-><input annual-field> "radio, Annual, not checked"
```

Run 0 — the first arrow of the browser session — did not:

```
after press cursor=<input monthly-field> focus=<input monthly-field> said="radio, Monthly, not checked"
attempt 0: prev->Text "Billing Period"  next-><input monthly-field> "radio, Monthly, not checked"  focus=<input monthly-field>
attempt 1: prev->Text "Billing Period"  next-><input monthly-field> "radio, Monthly, not checked"  focus=<input monthly-field>
attempt 2: prev->Text "radio, Annual, not checked"  next->Text "Annual"  focus=<input annual-field>
attempt 3: prev-><input annual-field> "radio, Annual, not checked"  next->Text "Annual"
attempt 4: prev-><input annual-field> "radio, Annual, not checked"  next->Text "Annual"
attempt 5: prev-><input annual-field> "radio, Annual, not checked"  next->Text "Annual"
```

Attempts 3 through 5 are the stuck state, and it is stable: the row polls
forever and then times out.

## What is actually happening

Three facts combine.

`press()` returned before the family's keydown handler had moved focus. The
handler is a lazily loaded symbol that runs after the native dispatch, and on
the session's first arrow it is still being fetched, so `document.activeElement`
was still the Monthly field when the reader's own `press()` finished.

The virtual reader moves its cursor from a `focusin` listener that opens with
one task-queue hop. So the move to the Annual field was still queued.

`reannounce()` fakes "read the current item again" — no reader has such a
command — by stepping the cursor off the item and back on: `previous()` then
`next()`. Each of those opens with its own task-queue hop. At attempt 2 the
reader's focus-follow landed **between** the two: `previous()` walked back from
Monthly, the focus-follow then moved the cursor onto the Annual field, and
`next()` stepped forward from *there* — one past the option, onto the `Annual`
label text.

From that point the pair is a fixpoint. `previous()` from the label lands on the
Annual field; `next()` lands back on the label; the phrase read is always the
label's. The cursor can never recover, so no amount of polling helps and the
assertion is missing exactly one fact: the role.

## The fix

Not a timeout, not a retry. The row was observing a **roving-focus move** with
the tool for an **attribute change in place**. The reader speaks a focus move by
itself; nothing needs to ask it again. `settleOnFocus()` waits for the reader's
cursor to reach what the page focused and answers with what it said there, and
it never moves the cursor, so there is nothing for the focus-follow to race.

Both arrow rows now go through one helper:

```ts
async function expectAnnouncesFocused(conveys: Conveys) {
	await expect.poll(async () => missingFacts(sr, await sr.settleOnFocus(), conveys)).toEqual([]);
}
```

Polling still matters, because the focus itself may not have moved yet when the
first call happens — during that window `settleOnFocus()` honestly answers with
the Monthly announcement and the poll simply asks again.

`test-support/README.md` already carried this rule, measured on `select`'s arrow
row: *"When the gesture moves a roving focus, take the announcement the reader
made by itself — `settleOnFocus()`, not `reannounce()`."* This row predated it.
`driver.ts`'s doc comment on `reannounce()` said only "say the item under the
cursor again, without moving on", which hid the round trip; it now states the
mechanism and points at `settleOnFocus()` for focus moves, so the next author
reads the constraint at the call site rather than in the README.

## What was deliberately not changed

`reannounce()` itself keeps its behaviour. A guard that threw when the cursor
failed to return would fire spuriously wherever a family re-renders the element
under the cursor — the node identity changes for an innocent reason — and around
twenty suites outside this unit's file contract call it.

The family is not at fault and was not touched. The lazily loaded handler
running after the native dispatch is a separate, known runtime concern; here it
only widened the window, and the announcement itself is correct once it lands.

## Verification

`pnpm typecheck`; `pnpm test:sr` five times, all 36 files green; and
`pnpm exec vitest run --project ui packages/headless/components/src/radio-group`.
The `test.fails` row below the fixed one stays red for its documented reason —
this reader reads the `checked` content attribute, which the family never sets.
