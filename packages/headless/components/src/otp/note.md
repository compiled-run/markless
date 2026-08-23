# otp — implementation notes

Research: `goals/headless-components/notes/research-otp.md`.

## Shape

One widget family, `otpState`, rooted by `otp.root`. It holds `length`, `value`,
`disabled`, the `element()` handle for the field, the consumer's `onChange` and
`onComplete`, and `commit()`.

The family paints slots over **one real `<input>`**. That is the load-bearing
decision and most of this suite is an assertion about it:

- The input carries the code, so it is the only thing in the accessibility tree.
  Every `otp.item` is `aria-hidden="true"` — an exposed box would put each
  character in the tree twice, which is QDS's bug and not copied here.
- One tab stop, one paste target, one form control. `expectOneFormControl()`
  asserts the property rather than the attributes that implement it.
- `type="text"`, `inputmode="numeric"`, `autocomplete="one-time-code"` and
  `maxlength` are what make the family worth shipping: the platform's own
  one-time-code autofill and numeric keypad, for free.

`length` is a declared prop, replacing QDS's construction-order item count. It is
what `maxlength` truncates typing against, and what `commit()`'s slice enforces
for a paste or an autofill (the platform does not truncate those).

`otp.item` reads `otp.value.slice(index, index + 1)`, not `otp.value[index]`: a
graph read path has to be statically resolvable.

## Deviations from the QDS part list, and why

1. **No per-item hidden input, and no item count from construction order.** The
   single input plus a declared `length` replaces both.
2. **`itemindicator` is a bare `<span>` with no state.** It is a caret slot the
   consumer styles; the item beside it reports `ui-empty` and `ui-disabled`.
3. **The consumer's `onInput` runs after the family has taken the value.** The
   part handler calls the shared method first and the consumer's handler after,
   so a consumer reading its own log sees the family's write already committed.
   `CSR: the consumer's own onInput runs, after the family has taken the value`
   is the witness.
4. **The caret policy is carried, matching QDS's `handleFocus`.** Focus on a
   field that already holds a code lands the caret at offset 0, so the next
   keystroke would prepend. `OtpField`'s `onFocus` does
   `setSelectionRange(code.length, code.length)`. See the pinned row below for
   the one thing this cannot do.

## What the compiler forced — re-measured 2026-08-23 on the pilot tip

Two workarounds were carried from earlier attempts. One is now a free choice and
one still stands.

**`commit()` taking no parameter is no longer forced.** The old comment claimed a
method that took the text would cost the calling handler its own props
(`MARKLESS_CAPTURE_OPAQUE_PROP`). Measured directly on this tip by reshaping the
family to `commit(raw: string)` and calling it from `OtpField`'s `onInput`: the
module compiles with no diagnostic, and the whole suite passes on the
parameterised shape — 36 passed, with only the rows already red for unrelated
reasons still red. The capture TypeScript-parse fix is what unblocked it (a
parameter annotation in a handler-reachable body used to throw the parse).

One condition, and it is the reason the shape was not adopted blindly: the
argument must be read off **`event.target`**, not `event.currentTarget`.
`otp.commit(event.currentTarget.value)` throws `Cannot read properties of null
(reading 'value')` — a handler body is dispatched asynchronously, and by the time
the argument expression is evaluated the event has finished dispatching, so
`currentTarget` is null. The surviving `otp.value = event.currentTarget.value`
assignment works because that one-event-field-into-one-cell shape is lifted out
at dispatch time rather than evaluated in the deferred body. The family keeps the
zero-arg `commit()` — the packet's scope was to measure, not reshape — but it is
now a preference (the write stays in one place), not a wall.

**`otp.value.slice(...)` inside `commit()` was a real defect and is fixed.** It
lowered to a read of the whole callee chain, so the emitted call invoked a
detached `String.prototype.slice` with no receiver. Fixed upstream in
`collect-expressions.ts` (a method call reads its receiver). Eight rows were
skipped on it; all eight are accounted for below.

## Rows: what the re-verification found

Of the three rows still skipped going into 2026-08-23, two are green and
un-skipped:

- **`CSR: a box written by a loop follows the code like any other`** — green. The
  old pin said a component instance inside an `@for` arm never follows the shared
  cell. The arm and row layers on this tip fixed it; a looped `otp.item` now
  follows the code exactly like a flat one.
- **`CSR: typing past the declared length adds nothing`** — green, and the old
  pin was wrong about the cause. It claimed no box ever fills in `WithOnChange`.
  Re-measured key by key on this tip, every box fills, and the walk stops at the
  declared length: typing `1,2,3,4,5` gives `["1","2","3","4"]` with the field at
  `"1234"`, identical to `WithoutOnChange`. The failure was the row's own read
  order. `maxlength` truncates the input's value **in the browser, before any
  handler runs**, so polling the field value returned immediately and the hard
  assertion on the box raced the refresh the keystroke had only just scheduled.
  The row now polls the box — the committed write, which is the idiom the typing
  section already declares — and asserts the field value after it. Nothing was
  weakened: both assertions survive.

## Pinned row

`SSR: the served field and boxes carry the code, and the next keystroke moves
both` stays `test.skip`, on a framework wall.

The family's caret policy is correct and runs — the green CSR row proves it. It
cannot run **in time**. A handler body is a symbol the framework dispatches
asynchronously, so `focus()` followed immediately by a keystroke types before the
caret has moved. Measured on this tip:

- SSR, `focus()` then `keyboard('5')` back to back → `"51234"`
- SSR, `focus()` then a 400ms wait → `selectionStart` 4, then `"12345"`, box 4 `"5"`
- CSR, `focus()` then `keyboard('5')` back to back → `"51234"`, identical

The CSR arm is what pins it: the deferral is framework-wide, not an SSR-resume
delay, so no SSR-side change moves this row. The await-ordering fix on this tip
did not shorten the window either. The row is deliberately left as written rather
than polling the caret first — polling is what the green CSR row already does,
and this row exists to hold the harder claim that the policy lands before the
very next keystroke.

Two framework facts measured while pinning it still hold, and both shape any fix:

- inside a resumed handler `event.currentTarget` is null, so the handler reaches
  the field via `event.target`
- `otp.fieldEl`, an `element()` handle, is `undefined` inside a handler after SSR
  resume; the handle is not rebound to the served node

## Boxes from an arm

The arm-delivered verdict, in two halves. A part is not a widget root, so an
`@if` arm that is **decided once** carries its items fine, in both modes. An arm
that **flips** is refused at compile time: `<otp.item>` inside `@if (someState)`
fails the module with `MARKLESS_BRANCH_ARM_UPDATE_UNSUPPORTED` — "cannot be
rebuilt when ... changes because `<otp.item>` has to run to produce its content".
That is a framework limit, not a family one, so `armed-length.tsrx` decides its
arm from a module constant and this note carries the verdict instead of a red
row.

## Testing notes

A real clipboard paste and SMS autofill are not drivable from browser mode. Both
reach the page as one input event carrying the whole string, which is what
`pasteInto()` writes — the honest substitute, named so the paste rows are not
read as end-to-end coverage.
