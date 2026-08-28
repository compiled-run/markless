# otp keeps its index prop: a derived position is paintable but not readable

The count wall is gone. The position wall moved rather than closed: a box's place
in the roster now derives correctly and keeps deriving correctly, but the value
is `undefined` to every expression that has to USE it after first paint, which in
this family is the one expression that matters — the slice that picks the box's
character out of the code.

Nothing landed. `packages/headless/components/src/otp/` is as it was on the pilot
tip (`718ec812`), and the SPEC sentence is deliberately not written: it would
state a rule with two families in front of it not following it, not one.

## What the family needs, and what each half now costs

`otp` asks the ordinal two questions, the same two U710 named:

1. **How many boxes are there** — `maxlength` on the field, and the length
   `commit()` truncates a paste or an autofill to.
2. **Which character is mine** — `otp.value.slice(at, at + 1)` in every box.

Half 1 is **fully answered on this tip** and half 2 is not.

## Half 1, green: the count works, including in a handler

Authored exactly as the packet ordered:

```tsx
export function OtpField({ onInput, onFocus, ...rest }: OtpFieldProps) @{
	const otp = otpState();
	const boxes = computed(() => otp.itemEls.length);
	// maxlength={boxes} ... onInput -> otp.commit(boxes)
}
```

Measured with the whole family migrated:

- `maxlength` reads `6` on `basic`, `verification-form` and `with-pattern`, `5`
  on `derived-length`, `4` on both roots of `two-widgets`, CSR and SSR. Every
  `expectFieldConfig` row was green.
- The **handler** read is real, not the render placeholder: pasting `12345678`
  into six boxes left the field holding `123456`, so `commit(boxes)` sliced
  against a number. The family still coerces (`const length = Number(boxes)`)
  before the `code.length === length` comparison, because U722's resolver patches
  a count rendered before its parts existed in as a STRING and a strict compare
  against `code.length` would then never fire `onComplete`. Whether the coercion
  was load-bearing in these runs is not proven — the truncation row passes either
  way — but it costs one call and removes the whole class.

So `otp.length` as a seed written from an index can go. It is not what is
blocking.

## Half 2, red: the position paints, then reads back `undefined`

The authored shape compiles and derives right:

```tsx
const mine = element<HTMLDivElement>();
const at = computed(() => otp.itemEls.indexOf(mine as HTMLDivElement));
const char = computed(() => otp.value.slice(at, at + 1));
```

- **First paint is correct in both modes.** `prefilled` painted `1`,`2`,`3`,`4`
  in the first four boxes and left boxes 4 and 5 `ui-empty`, CSR and SSR. 31 of
  48 rows green.
- **The position keeps deriving correctly.** Probed by painting it: with
  `ui-pos={at}` on the item host, the six boxes read `0|1|2|3|4|5` before a
  keystroke and `0|1|2|3|4|5` after one. This is NOT U710's `-1` any more — U719
  closed that.
- **The value is `undefined` to the expression that consumes it.** With
  `char` rewritten to `computed(() => '[' + at + '|' + plain + '/' + otp.value + ']')`,
  where `plain = computed(() => otp.value.length)` is an ordinary computed
  declared in the same component body, box 0 rendered after a paste:

```
before=0|1|2|3|4|5 after=0|1|2|3|4|5 max=6 value=123456 text0=[undefined|6/123456]
```

  `plain` answered `6` in the same string that read `at` as `undefined`. So this
  is not "a computed cannot read a computed" — it is this computed. An inline
  markup expression on the item host (`{'[' + at + '/' + otp.value + ']'}`,
  no second `computed()` at all) reads `undefined` the same way, so the second
  `computed()` is not the trigger either. The trigger is the re-derivation: at
  render the position is in scope and right; the moment anything re-derives after
  paint, the position's cell answers nothing.

`otp.value.slice(undefined, NaN)` is `''`, which is why every post-paint row
empties every box. The 12 red rows are exactly the rows that change `otp.value`
after paint (each keystroke, backspace, every paste, onComplete, and the SSR
resume row), plus the caret row that types.

## The two ways round it, both refused

**Fold the query into the consuming derive** — one computed, no second read:

```tsx
const char = computed(() => {
	const at = otp.itemEls.indexOf(mine as HTMLDivElement);
	return otp.value.slice(at, at + 1);
});
```

```
MARKLESS_ELEMENT_HANDLE_UNBOUND: Cannot read element handle "otp.itemEls" inside
computed "char" in OtpItem: element() handles are DOM-bound and readable only in
event handlers, so "itemEls" is undefined on every derivation.
```

Expected: `collectElementRosterPositions` admits the query only when the derive
body IS the query and nothing else, so a body that slices with it falls straight
back to `elementHandleDeriveReadDiagnostic`.

**Carry the position into a cell of the box's own** — refused at compile:

```tsx
const box = state({ at });
```

```
MARKLESS_SYMBOL_MODULE_UNRESOLVED_GRAPH_REFERENCE: The emitted state-initializer
module for symbol:17 still names "at" directly. It appears in the module for
symbol:17. "at" is a state binding that lives in the component, not in the
handler module, so this module would throw a ReferenceError the first time it
runs.
```

This is U710's Wall 1 in the state-initializer emitter rather than the shared-seed
one: a derived value cannot be the source of an initial value, whether the cell is
shared or component-local.

## What the next card has to deliver

One thing, and it is outside `packages/headless/components`:

**A roster position that is readable, not just paintable.** A derivation that
depends on a roster-position computed must see its number when it re-derives —
today it sees `undefined`, while an ordinary computed beside it in the same
component body reads fine. Whichever half is missing (the position's value never
reaching its graph cell on the client, or the dependent read resolving a
differently qualified id for it), the witness to add is a member of
`packages/vitest-browser/browser/item-collections/` that does not merely PAINT
`ui-pos`: something like `ui-mine={pick(w.code, pos)}` re-derived after a write,
which is what every real family does with a place once it has one.

Until then `otp.item` keeps `index`, alongside `tour.item`, and the SPEC sentence
stays unwritten. The count half is ready to land the moment the position half is
answered — the family reshaped to it cleanly, and the whole reshape is one
commit's worth of work in `otp.tsrx`, `otp-types.ts` and thirteen scenarios.
