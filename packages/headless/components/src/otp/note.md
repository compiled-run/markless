# otp — implementation notes

Research: `goals/headless-components/notes/research-otp.md`.

## Shape

One widget family, `otpState`, rooted by `otp.root`. It holds `length`, `value`,
`disabled`, the `element()` handle for the field, the consumer's `onChange` and
`onComplete`, and `commit()`. Of those, `length` is the only one the root does
not seed: it comes from the boxes.

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

## The length comes from the boxes

There is no `length` prop. `otp.item` registers its own place as it renders —
`otp.length = index + 1` — so writing six boxes gives a six-character code and
adding a seventh next sprint changes nothing else at the call site. That count is
what `maxlength` truncates typing against, and what `commit()`'s slice enforces
for a paste or an autofill (the platform does not truncate those).

Two things this shape has to live with, both measured on the pilot tip:

- **One past the LAST box's index, not the highest.** The registration cannot be
  a max, because the right-hand side of a shared write in a part body must not
  read the shared instance. The SSR emitter copies that expression into the seed
  function verbatim, where the `otpState()` local is out of scope, so
  `otp.length = Math.max(otp.length, index + 1)` fails the render with
  `ReferenceError: otp is not defined`. A guard fails the same way: an
  `if (index >= otp.length) …` wrapper leaks into the SSR body as written while
  the assignment inside it lowers to a seed with the guard silently dropped. So
  boxes must be written in index order — which the `index` prop's own contract
  already says, since it is the character's place in the code.
- **The field is written before the boxes and still gets the count.** `maxlength`
  binds to a shared read, so the registrations that land after the field rendered
  refresh it, in both modes. `expectFieldConfig` asserts this on every scenario.

### Open framework gap: a box inside a construct arm never registers

A shared write in a part's render body reaches the family's shared instance when
the part is written flat under the root (`basic.tsrx`) **and** when it is nested
inside plain elements (`verification-form.tsrx` puts its six boxes inside a
`<div>` and gets `maxlength="6"` in both modes). It is dropped when the part
instance comes out of a construct arm: `items-from-data.tsrx` (`@for`) and
`armed-length.tsrx` (`@if`) both render their boxes and both leave the shared
`length` at its initial `0`, on CSR and on SSR alike. Nothing else differs
between those scenarios and the passing ones — same part, same statement, same
index order — so the hosting construct is the whole cause.

What the suite does with it. The painting an arm does carry stays asserted:
`CSR/SSR: boxes delivered by an @if arm paint like boxes written flat` and
`CSR/SSR: boxes written by a loop render exactly as boxes written flat` are green
and unchanged in what they claim. The count those same boxes fail to register is
held by three pinned rows, so the claim is written down rather than dropped:
`CSR: a box written by a loop follows the code like any other`,
`CSR/SSR: boxes delivered by an @if arm register the length of the code`, and
`CSR: an arm-delivered box follows the code like any other`. Every one of them
fails on the count (`maxlength` reads `0`) and none on the boxes.

The derived count itself is asserted on every non-arm scenario, and
`derived-length.tsrx` is the dedicated witness: five boxes, nothing anywhere
saying five, `onComplete` silent at four characters and firing at the fifth.

This is the same construct-arm area the family already carries a wall in (see
"Boxes from an arm" below) and it is a framework charter, not something the
family can shape around: the only in-family workaround is a written `length`,
which the owner ruling removed.

`otp.item` reads `otp.value.slice(index, index + 1)`, not `otp.value[index]`: a
graph read path has to be statically resolvable.

## Deviations from the QDS part list, and why

1. **No per-item hidden input.** The single input replaces the whole row of
   them. The item count QDS derives from construction order is kept, in the form
   above.
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

- **`CSR: a box written by a loop follows the code like any other`** — went green
  when the length was a prop, and is pinned again now that it is derived. The old
  pin said a component instance inside an `@for` arm never follows the shared
  cell; the arm and row layers fixed the *reading* half, and a looped `otp.item`
  does follow the code. What it cannot do is *write* the shared cell, which is
  what registering a length needs. See the construct-arm gap above.
- **`CSR: typing past the last box adds nothing`** — green, and the old
  pin was wrong about the cause. It claimed no box ever fills in `WithOnChange`.
  Re-measured key by key on this tip, every box fills, and the walk stops at the
  last box: typing `1,2,3,4,5` gives `["1","2","3","4"]` with the field at
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
`@if` arm that is **decided once** carries its items fine, in both modes — it
paints them; what it does not carry is the shared write those items make, which
is the open gap recorded above. An arm
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

## The field is stretched over the boxes

QDS's mechanism, from `otp.css`: the root is the positioned box and the field is
absolutely placed over it, invisible but interactive, so a click or tap anywhere
on the boxes lands on the one real input. Ours now matches, with the declarations
inline rather than in a stylesheet — the family ships no CSS, and the `ui-qds-*`
identity attributes a stylesheet would hook are gone by owner ruling. `style` is
therefore family-owned on both the root and the field, and omitted from both prop
types; a consumer styles the boxes through `class`.

Three details the browser forced, all measured 2026-08-23:

- `opacity: 0`, not `visibility`/`display`: a hidden control takes no typing and
  leaves the accessibility tree. The suite pins this both ways.
- `box-sizing: border-box`: an input's own border and padding are added to a
  `height: 100%` content box, which left the field 6px past the boxes.
- a module-scope constant cannot be read from inside a `computed()` in the
  `shared()` factory — the body is lifted into its own symbol, and the reference
  throws `ReferenceError` at render. The style strings are written out in full.

`shiftPWManagers` (QDS's prop, default on) widens the input 45px past the root
and clips that strip away, which takes a password manager's icon off the boxes.
A clipped strip catches no clicks either, so nothing beside the boxes is caught.
