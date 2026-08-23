# OTP — component research for `@markless/ui`

**Research date:** 2026-08-22
**Method:** `.ruler/skills/markless-component-research/SKILL.md`
**QDS reference read:** `~/dev/open-source/qwik-design-system/libs/components/src/otp/` (READ-ONLY)
**Markless facts read from:** this worktree, cut from `feat/headless-ui-pilot` @ `30c5f92f`. It holds
`base`, `checkbox`, `checklist`, `progress`, `textbox`, `toggle` under
`packages/headless/components/src/`. Framework-limit statements are quoted from
`packages/headless/components/src/checklist/note.md`, which is the most recently measured record of
what this branch can and cannot express.

**Cluster note.** This is one of four documents for the fifth tranche (otp, pagination, scroll-area,
qr-code). The four are unrelated as *patterns*, but three of them (otp, pagination, qr-code) land on
the same framework question from three directions: **a family whose parts are a repeated sequence
needs a per-item index, and this branch has no construction-order counter.** The shared answer, and
what each family costs if it is refused, is consolidated in `research-pagination.md` §8; OTP's
contribution is §8 below.

---

## 1. Name and alternates

Searched under: otp, one-time password, one-time passcode, one-time code, pin input, PIN field,
verification code, confirmation code, MFA code, 2FA code, TOTP input, code input, segmented input,
character input.

The pattern is genuinely three-named and the three names track three different design intents:

- **OTP / OTP Field** — QDS `otp`, Base UI `OTPField`, `input-otp` (`OTPInput`). Named after the
  *use case*: a short one-time code arriving by SMS, email, or an authenticator app.
- **PIN Input** — Ark UI / zag-js `pin-input`, Bits UI `PinInput`, Melt UI "PIN Input". Named after
  the *shape*: N single-character boxes. A PIN is not a one-time code (it is a durable secret), and
  the difference matters for one attribute: `autocomplete="one-time-code"` is correct for an OTP and
  **wrong** for a PIN. Ark UI acknowledges this by making it a prop (`otp`), not a default.
- **Verification code** — the name in most product UI, and the name the wild uses in `id`/`name`
  attributes (§5). Not a library name.

**Alternative-named implementations worth crediting:**

- **`input-otp` (guilhermerodz)** is the de-facto standard implementation of this pattern in the
  React ecosystem, and it is not a "library component" — it is a single-purpose package. shadcn/ui
  wraps it in **all four** of its current registry bases (`apps/v4/examples/aria/`, `base/`,
  `radix/`, and `new-york-v4/ui/input-otp.tsx` — verified via grep, §5). Radix, React Aria and Base
  UI users all reach for the same third-party package. QDS's own `notes.md` cites `input-otp`'s
  Playwright suite as its reference. Its architecture is the one QDS adopted (§3).
- **`REGEXP_ONLY_DIGITS` / `REGEXP_ONLY_DIGITS_AND_CHARS`** — `input-otp` exports named regexes
  rather than a `type: 'numeric' | 'alphanumeric'` enum. shadcn's examples import them directly. It
  is a small API decision worth noting: a regex is more expressive than an enum and no harder to
  read at the call site, and QDS took the same route (`pattern` prop, default `^[0-9]*$`).

**Recommendation: keep the QDS name `otp`.** It is the use case we are actually shipping for, it
matches Base UI, and "pin" would invite the wrong autocomplete.

---

## 2. QDS reference (naming truth)

Folder listing — this *is* the part inventory:

```
otp-root.tsx   otp-field.tsx   otp-item.tsx   otp-item-indicator.tsx
index.ts   metadata.json   notes.md   otp.css   otp.browser.tsx   utils/   __screenshots__/
```

`index.ts`:

```ts
export { OtpField as field }              from "./otp-field";
export { OtpItem as item }                from "./otp-item";
export { OtpItemIndicator as itemindicator } from "./otp-item-indicator";
export { OtpRoot as root }                from "./otp-root";
```

**Four parts: root, field, item, itemindicator.** Note the export name `itemindicator` — one word,
matching the checklist family's `selectallindicator`. The file is named "item-indicator" and the
`ui-*` attribute it writes is `ui-qds-otp-caret`; the *indicator is the caret*. Three names for one
thing in one file is a QDS wart, not a design.

### The architecture, which is the whole story

QDS renders **one real `<input>`** — `otp.field` — and paints the slots as `<div>`s over it. This is
`input-otp`'s design. Read from the code:

| Concern | QDS behaviour |
| --- | --- |
| The input | `otp-field.tsx` renders a single `<input>` with `value={code}`, `maxLength={numItems}`, `inputMode="numeric"`, `autoComplete="one-time-code"`, `pattern={props.pattern ?? "^[0-9]*$"}` |
| The slots | `otp-item.tsx` renders a `<div>` whose text content is `code[index]`, plus `ui-highlighted`, `ui-empty`, `ui-disabled` |
| The caret | `otp-item-indicator.tsx` renders a `<span>` inside an item, marked `ui-qds-otp-caret={index}`. It has no state of its own; the item's `ui-highlighted` is what CSS keys off |
| Item index | `useConstant(() => { const idx = context.numItems; context.numItems++; return idx; })` — a **mutable counter on the context object**, incremented in component construction order (`otp-item.tsx:28-32`) |
| Fake selection | a `document`-level `selectionchange` listener (`useOnDocument("selectionchange", updateSelection)`) reads `input.selectionStart/End` and writes them onto the context; each item derives `isHighlighted` from that range (`otp-item.tsx:46-68`) |
| Auto-field | if the consumer never writes `otp.field`, a `PostRender` component renders one anyway (`otp-root.tsx:133-141`), because the family cannot work without it |
| Change/complete | a task tracking `code` fires `onChange$`, and fires `onComplete$` when `code.length === numItems` — computed in `PostRender` specifically "because numItems is not updated until the items are rendered" |
| Password managers | `shiftPWManagers` (default `true`) writes `ui-shift` on the input; the actual shifting is CSS in `otp.css` |

### Why the single-input design wins, stated plainly

Everything a text field does for free stays free: **paste distributes across the slots with no code
at all** (the browser pastes into one input; `handleInput` slices to `numItems`), SMS/one-time-code
autofill works because there is exactly one field for the platform to fill, undo works, IME works,
password managers work, and there is **one tab stop**. The per-input design (Ark UI, Base UI) has to
hand-write every one of those.

What it costs: the caret and the selection are a lie that has to be maintained. QDS spends
`otp-field.tsx:56-153` — about 100 lines — on keeping a fake selection in sync, including a
`sync$` handler whose only job is to stop `ArrowLeft` skipping over filled slots.

### Five things in QDS worth not copying

1. **`numItems` is a construction-order counter on a plain (non-reactive) context field.** It is the
   exact mechanism our order-independent seed phase does not provide, and it is load-bearing three
   times over: `maxLength`, the completion test, and every item's identity. It also produces the
   comment in `otp-root.tsx:121` admitting that `onComplete$` has to live in a post-render component
   because the count is not known during render. §7 replaces it with a declared index.
2. **The items are not `aria-hidden`.** They are `<div>`s containing the same digits the input's
   value already carries, next to the input in DOM order. A screen reader in browse mode reads the
   code twice. No library that paints slots (`input-otp` included) leaves them exposed. Fix it.
3. **`shiftPWManagers` is a CSS concern wearing a prop.** The prop's only effect is the presence of
   `ui-shift`; the geometry is in `otp.css`. A consumer who wants password-manager badges moved can
   write that CSS themselves against `ui-*` state we already emit.
4. **The auto-rendered field.** `PostRender` silently renders an `otp.field` the consumer did not
   write. It saves a beginner once and then hides a duplicate input the day someone writes one in a
   place the `isField` `useConstant` did not observe. Prefer refusing loudly to rendering silently.
5. **Both `pattern` and a `keypress` guard.** `handleKeyPressSync$` re-tests `input.pattern` against
   each key and calls `preventDefault()`. `keypress` is a deprecated event; the `input` handler
   already truncates. Keep the attribute, drop the second enforcement point.

`otp.browser.tsx` exists (not read line-by-line for this document; its shape is recorded in
`notes.md` as covering initial value, reactivity, programmatic set, `onChange$`, `onComplete$`,
disabled, pasting, and password-manager support).

---

## 3. Headless library survey

Verification column is deliberate: this document only claims what it read this session.

| Library | Has it? | Parts | Architecture | Verified |
| --- | --- | --- | --- | --- |
| **Base UI** | yes, `OTPField` | `Root`, `Input`, `Separator` | **N real inputs**; `Input` takes no `index` — position in render order decides | fetched `base-ui.com/llms.txt` + the OTP Field docs page, 2026-08-22 |
| **Ark UI** (zag `pin-input`) | yes, `PinInput` | `Root`, `Label`, `Control`, `Input`, `HiddenInput` | **N real inputs** plus one hidden input for form submission | fetched `ark-ui.com/llms.txt` + the pin-input docs page, 2026-08-22 |
| **QDS** | yes, `otp` | `root`, `field`, `item`, `itemindicator` | **one real input**, painted slots | source read |
| **`input-otp`** | yes | `OTPInput` + render-prop slots | **one real input**, painted slots | grep only (§5); shadcn wraps it in four registry bases |
| **Radix UI** | no | — | — | Base UI's index is Radix's successor; shadcn's `radix/` OTP example imports `input-otp`, which is the strongest available evidence Radix ships none |
| **React Aria** | no dedicated component | — | — | shadcn's `aria/` OTP example also imports `input-otp` |
| **Bits UI / Melt UI / Kobalte / Ariakit / Corvu / Headless UI / Dice UI** | **not verified this session** | — | — | not fetched; do not cite this document for their behaviour |

### The one real design split

**Architecture A — one input, painted slots** (QDS, `input-otp`).
**Architecture B — N inputs** (Base UI, Ark UI).

| | A: one input | B: N inputs |
| --- | --- | --- |
| Paste of a full code | free | hand-written distribution across inputs (Ark: `sanitizeValue`; Base UI: filter by `validationType`) |
| SMS / `one-time-code` autofill | free, one target | ambiguous; platforms fill the focused input only |
| Tab stops | one | N, or roving focus the library manages |
| Backspace across slots | free (it is one string) | hand-written focus-moves-left |
| Caret / selection | faked, ~100 lines | free |
| Per-slot accessible name | impossible — there is one control | free, and **required**: Base UI's own docs tell you to write `aria-label="Character 2 of 6"` on every input after the first |
| Form submission | the input is the field | Ark UI needs a **separate `HiddenInput`** part just to submit |

Base UI's labelling advice is the honest cost of B, and Ark UI's `HiddenInput` is the second one.
Architecture A needs neither: the input *is* the field, and its label is the field's label.

### Consensus worth carrying

- **`autocomplete="one-time-code"` is universal** and is the single highest-value attribute in the
  family. Ark UI gates it behind an `otp` prop because it also serves PINs; QDS hard-codes it. Since
  our family is named `otp`, hard-coding is right.
- **Completion is a first-class callback everywhere.** QDS `onComplete$`, Base UI `onValueComplete`
  + `autoSubmit`, Ark UI `onValueComplete` + `autoSubmit` + `blurOnComplete`. A code input that does
  not tell you when it is full is unfinished.
- **Masking is offered by both N-input libraries** (`mask` on Base UI and Ark UI) and by neither
  single-input one. With Architecture A, masking is `-webkit-text-security` / rendering `•` in the
  item instead of the digit — CSS, not API.
- **A separator part exists in Base UI (`Separator`) and in shadcn (`InputOTPSeparator`)** and in
  neither QDS nor Ark UI's anatomy. It is a decorative `<div>`; a consumer can write one.

---

## 4. Specifications and expert commentary

### There is no APG pattern, and that is the finding

`w3.org/WAI/ARIA/apg/patterns/` has no one-time-code, PIN, or segmented-input pattern. There is no
role, no state, and no keyboard contract to conform to. **An OTP field is a text input**, and the
whole accessibility question is whether the widget still behaves like one.

### aria-at coverage: none

Read 2026-08-22 via the GitHub API (`api.github.com/repos/w3c/aria-at/contents/tests/apg`). The 40
test-plan folders are: accordion, alert, banner, breadcrumb, checkbox, checkbox-tri-state,
combobox-autocomplete-both-updated, combobox-select-only, command-button, complementary,
contentinfo, disclosure-faq, disclosure-navigation, form, horizontal-slider, link-css, link-img-alt,
link-span-text, main, menu-button-actions, menu-button-actions-active-descendant,
menu-button-navigation, menubar-editor, meter, minimal-data-grid, modal-dialog,
quantity-spin-button, radiogroup-aria-activedescendant, radiogroup-roving-tabindex,
rating-radio-group, rating-slider, seek-slider, slider-multithumb, switch, switch-button,
switch-checkbox, tabs-automatic-activation, tabs-manual-activation, toggle-button,
vertical-temperature-slider.

**There is no OTP, PIN, or text-input plan.** So unlike collapsible, radio-group and tabs, this
family has **no community-vetted assertion set to test against**. §6 derives expectations from the
semantics instead, and says so.

### The platform facts that carry the family

- **`autocomplete="one-time-code"`** is a standard autofill field name in the HTML Living Standard's
  autofill section. It is what makes iOS offer the SMS code above the keyboard and what makes
  password managers offer a TOTP. It is worth more to a real user than every keyboard nicety in this
  document combined.
- **`inputmode="numeric"`** selects the numeric keypad on touch. The wild pairs it with
  `pattern="[0-9]*"` (§5) because older iOS needed the pattern, not the inputmode.
- **`maxlength`** truncates for free; QDS uses it as its length enforcement.
- **`hidden`/`aria-hidden` on the painted slots** is the missing half of Architecture A (§2, item 2).

### Expert commentary

No post by Roselli, O'Hara, Higley, Pickering, Soueidan, Head, Sutton or Romo specifically on OTP or
PIN inputs was located this session. Recording that as an absence rather than filling it with
adjacent material. The one adjacent principle that clearly applies, and is uncontroversial across
all of their writing: **do not replace a native control's semantics with a painted imitation without
keeping the native control in the accessibility tree.** Architecture A satisfies that by keeping the
real input; it fails it the moment the painted slots are *also* exposed, which is QDS's bug.

---

## 5. GitHub patterns (grep MCP)

Searches run: `autoComplete="one-time-code"` (TSX), `from "input-otp"` (TSX). Findings:

- **The overwhelming shape in the wild is not a component at all — it is one plain `<input>`.**
  Every hit on `autoComplete="one-time-code"` was a hand-rolled single field:
  NginxProxyManager `TwoFactorModal.tsx` (`type="text" inputMode="numeric"
  autoComplete="one-time-code" maxLength={6}`), gogs `MFA.tsx`, Stirling-PDF `AccountSection.tsx`
  (`inputMode="numeric" pattern="[0-9]*" maxLength={6} minLength={6}`), auth0/nextjs-auth0's two
  passwordless examples, sealos, kite, DEEIX-Chat, elizaOS, SnowLuma. **Nobody in that sample
  rendered slots.** The segmented look is a design flourish; the semantic is one text field. That is
  the strongest argument available for Architecture A: our family should produce, at the
  accessibility layer, exactly what these files produce by hand.
- **The canonical attribute set is stable**: `type="text"` + `inputMode="numeric"` +
  `autoComplete="one-time-code"` + `maxLength={6}`, with `pattern="[0-9]*"` added by the more
  careful ones. QDS emits all of them except `minLength`.
- **Anti-pattern found in production:** gogs `MFA.tsx` puts `autoComplete="one-time-code"` on the
  **recovery-code** field as well as the passcode field (lines 131 and 155). A recovery code is not
  a one-time code from a device; offering the SMS/TOTP autofill there is wrong and will insert the
  wrong value. Worth one line in our docs: this attribute is a claim about *where the value comes
  from*.
- **Anti-pattern found in production:** auth0's `with-passwordless-db` example labels its field
  (`aria-label="MFA code"`); its sibling `with-passwordless` example does not. Same organisation,
  same week, one labelled control and one unlabelled. A family that owns the input can make the
  label wiring the only path.
- **`input-otp` is the packaged answer, and its reach is the finding**: shadcn/ui ships OTP examples
  for its `aria`, `base`, `radix` and `new-york-v4` bases and **all four import `input-otp`**, along
  with `REGEXP_ONLY_DIGITS` / `REGEXP_ONLY_DIGITS_AND_CHARS`. Downstream copies of the same file
  appear in usesend, awesome-llm-apps and others. When Radix users, React Aria users and Base UI
  users all reach past their own library for the same package, the package's architecture is the
  ecosystem's answer — and it is Architecture A.

---

## 6. Expected screen-reader behaviour

**No aria-at plan exists for this family** (§4), so these are derived from the semantics rather than
quoted from a vetted assertion set, and this document says so rather than inventing citations. They
are still testable — they are assertions about the *accessibility tree*, which the browser suite can
read directly.

Under the recommended shape (one real `<input type="text">`, labelled, with the slots
`aria-hidden`):

**Sequence A — Tab to the field**
1. keypress `Tab`
2. → the field's accessible name ("Verification code")
3. → "edit text" / "text field"
4. → the current value, or "blank"

Exactly a text input, because it is one. No "group", no "6 items", no per-slot announcement.

**Sequence B — Type a digit**
1. keypress `4`
2. → "4" (character echo, reader-dependent and user-configurable)

The painted slot updating must produce **no** second announcement. This is the row that catches the
missing `aria-hidden`: with the slots exposed, the same digit is present twice in the tree and
browse-mode navigation reads the code, then reads it again.

**Sequence C — Paste a full code**
1. `Ctrl/Cmd+V`
2. → the pasted value, announced as a value change

Nothing family-specific. This is the payoff of Architecture A.

**Sequence D — Completion**
Nothing is announced by us. `onComplete` is an author hook, not an announcement. If the consumer
navigates or submits on completion, the *consumer* owns telling the user — and if they show an error
instead, that is `textbox`-shaped error wiring, not ours.

**Where readers differ.** Character echo on typing is the main axis: NVDA and JAWS echo typed
characters by default in most configurations, VoiceOver's typing echo is a user setting. None of
that is ours to control, and none of it should be asserted as a *string* in our suite. What our
suite can and should assert is the tree: one form control, correctly named, with the right value,
and no duplicate text.

**The one genuine risk to name:** a screen-reader user cannot perceive the visual grouping at all,
and does not need to. The slots are decoration. Any design that makes the slots *meaningful* — a
per-slot error, a per-slot label — has left this pattern and needs a different one.

---

## 7. Markless API design

### Parts

`otp.root`, `otp.field`, `otp.item`, `otp.itemindicator` — the QDS folder listing exactly, keeping
QDS's one-word export spelling for the indicator.

Not added: a `separator` part (Base UI has one, QDS does not; it is a decorative `<div>` a consumer
writes), a `label` part (`base.label` already exists in this package and `element()` wires `for`), a
`control` or `hiddeninput` part (Ark UI needs both only because of Architecture B).

### Types (`otp-types.ts`)

```ts
import type { PropsOf, Seeded } from '@markless/core';

export type OtpRootProps = Omit<PropsOf<'div'>, 'onChange'> & {
	/** How many characters the code has. Every item declares its own place in it. */
	readonly length: number;
	/** The code entered so far. Omit it and the field starts empty. */
	readonly value?: string;
	/** Nothing can be typed while this is set. */
	readonly disabled?: boolean;
	/** Called with the whole code every time it changes. */
	readonly onChange?: (value: string) => void;
	/** Called once with the whole code the moment it reaches `length` characters. */
	readonly onComplete?: (value: string) => void;
};

/** The one real text input. Everything a person types goes here. */
export type OtpFieldProps = Omit<PropsOf<'input'>, 'value'>;

export type OtpItemProps = PropsOf<'div'> & {
	/** Which character of the code this box shows, counting from 0. */
	readonly index: number;
};

export type OtpItemIndicatorProps = PropsOf<'span'>;

export type OtpInstanceState = Seeded<OtpRootProps, 'length' | 'value' | 'disabled'> & {
	onChange?: (value: string) => void;
	onComplete?: (value: string) => void;
};
```

Notes on the shape:

- **`index` is required on `otp.item`, and this is the family's central API decision.** QDS derives
  it from construction order; we cannot (§8). Declaring it is the same move `checklist` made when it
  chose Base UI's `values` declaration over QDS's item registration
  (`research-checklist.md` §6b), and it is the move `pagination` needs too. The cost is one number at
  the call site; the benefit is that the family works with no ordering primitive, in `@for`, in
  arms, and across SSR resume, because nothing depends on when a part was constructed.
- **`length` is on the root and is required.** QDS derives it from the item count, which is the same
  counter. Declaring it also removes the `PostRender` workaround: `maxLength` and the completion
  test are both known during render.
- **No `pattern` prop in v1.** `otp.field` is `PropsOf<'input'>`, so a consumer writes
  `pattern="[0-9]*"` or anything else directly onto the input through `{...rest}`. Our default
  belongs on the element, not in a prop that shadows the platform's.
- **No `mask`.** With Architecture A the digits are painted by `otp.item`; a consumer who wants dots
  renders dots. A prop would only decide what text the item shows, which the consumer already owns.
- **No `shiftPWManagers`.** CSS (§2, item 3).
- **No `autoSubmit`, no `blurOnComplete`.** `onComplete` gives the consumer both in one line of
  their own code, and neither belongs to the widget's state.

### Instance and parts

```tsx
export const otpState = shared(
	() => {
		const otp: OtpInstanceState = state({
			length: 0,
			value: '',
			disabled: false,
		});
		const fieldEl = element<HTMLInputElement>();

		return {
			...otp,
			fieldEl,
			onChange: undefined as ((value: string) => void) | undefined,
			onComplete: undefined as ((value: string) => void) | undefined,
			charAt(index: number): string {
				return otp.value[index] ?? '';
			},
			write(next: string) {
				// the input already truncated at maxlength; slice is belt and braces
				const code = next.slice(0, otp.length);
				if (code === otp.value) return;
				otp.value = code;
				otp.onChange?.(code);
				if (code.length === otp.length) otp.onComplete?.(code);
			},
		};
	},
	{ scope: 'widget' },
);

export function OtpRoot({
	length,
	value = '',
	disabled = false,
	onChange,
	onComplete,
	children,
	...rest
}: OtpRootProps) @{
	const otp = otpState();
	otp.onChange = onChange;
	otp.onComplete = onComplete;
	otp.length = length;
	otp.value = value;
	otp.disabled = disabled;

	<div {...rest} ui-disabled={otp.disabled}>{children}</div>
}

export function OtpField({ onInput, ...rest }: OtpFieldProps) @{
	const otp = otpState();

	<input
		{...rest}
		el={otp.fieldEl}
		type="text"
		value={otp.value}
		maxlength={otp.length}
		disabled={otp.disabled}
		inputmode="numeric"
		autocomplete="one-time-code"
		onInput={(event) => {
			otp.write((event.target as HTMLInputElement).value);
			onInput?.(event);
		}}
	/>
}

export function OtpItem({ index, children, ...rest }: OtpItemProps) @{
	const otp = otpState();
	const item = state({ index });

	<div
		{...rest}
		aria-hidden="true"
		ui-empty={otp.charAt(item.index) === ''}
		ui-disabled={otp.disabled}
	>{otp.charAt(item.index)}{children}</div>
}

export function OtpItemIndicator({ children, ...rest }: OtpItemIndicatorProps) @{
	<span {...rest}>{children}</span>
}
```

What this uses, and what it deliberately does not:

- **`aria-hidden="true"` on every item** is the fix for §2 item 2. The input carries the value; the
  items are paint.
- **`item.index` is copied into a `state({ index })` cell**, the way `checklist.tsrx` copies
  `value`. That is the landed idiom for a per-item prop that a read has to route through.
- **`otp.charAt(item.index)`** is a shared method taking the item's own value as an argument. The
  parameterised-method inlining that this needs landed in T075d and survives T075f
  (`checklist/note.md`, "What T075f changed"), and `checklist.value.includes(item.value)` is the
  same shape already shipping.
- **No `document`-level `selectionchange` listener, so no fake caret in v1.** This is the deliberate
  reduction, and §8/§10 own it. Items still show their character and still carry `ui-empty`, so a
  consumer can style "the next empty box" with `ui-empty:first-of-type`-shaped CSS. The blinking
  caret and the highlighted multi-slot selection are the two things v1 does without.

### What is not expressible today

| Wanted | Blocked by |
| --- | --- |
| `ui-highlighted` per item, tracking the input's real caret | needs a `document`-level `selectionchange` listener. No family in this package has one, and no authoring surface for it is documented on this branch. **Owner question (§10), not a proposed API.** |
| `otp.field` deriving `maxlength` from the item count | construction-order counting (§8) |
| A `<label>` naming the field from outside the root | `element()` in an IDREF position works part-to-part (`research-collapsible.md` §7 proves the shape); a label *outside* the root is `base.label` + the field's handle, which is the same shape one level out and is unproven for this family |
| Consumer `onInput`/`onPaste` forwarded through a spread onto a component tag | `checklist/note.md` limit 1: a spread onto a component tag still records no prop binding in the semantic graph, so a spread-forwarded event has no view record. The explicit destructure above avoids it for `onInput`; anything else the consumer spreads onto `otp.field` reaches the element but not the graph |

### Flippable arms

`otp.item` inside an `@if` arm is a real scenario ("show 8 boxes for a backup code, 6 for an SMS
code"), and it is exactly the shape `checklist/note.md` records as still open at the end
("an arm-delivered widget's seeds are not registered: `resume-commit-arm.ts` carries its own record
set"). Since `otp.item` roots no widget of its own — it is a part, not a root — it should be the
*easy* case, and it deserves a named scenario to prove it (§9).

---

## 8. What this family needs from the framework

**One thing, and it is shared with pagination and qr-code: nothing.** That is the finding, and it is
the point of the `index` prop.

The requirement QDS's design would have generated — *a per-item index derived from construction
order* — is refused by design on this branch and has been refused for three tranches running
(`research-checklist.md` §6b names it for checklist, tabs and radio group). Rather than ask for it a
fourth time, this family declares the index, and the declaration costs a consumer one number per
box. The consolidated argument, and what each of the three tranche-5 families pays, is in
`research-pagination.md` §8.

Two smaller things, both recorded as questions rather than requirements:

1. **A document-level event listener** (`selectionchange`) is what the fake caret needs. It is not
   needed for a correct, usable, accessible OTP field — only for the caret animation. **Do not
   charter framework work for it on this family's account.** If a later family (a rich text
   surface, a resizable) needs document-level listeners for a real reason, the caret comes along for
   free.
2. **A spread onto a component tag carries no graph binding** (`checklist/note.md` limit 1). Every
   family in this package pays this; OTP pays it once, on `otp.field`. Not new, not this family's to
   charter.

---

## 9. Test plan

`packages/headless/components/src/otp/otp.browser.ts`, scenarios under `src/otp/scenarios/`, per the
T059 colocation convention. Part-role testids: `root`, `field`, `item`, `itemindicator`, item
testids suffixed by index.

Scenarios, starter first, special cases last:

1. `basic.tsrx` — root with `length={6}`, one field, six items with `index={0..5}`.
2. `verification-form.tsrx` — the realistic one: a `<form>`, a `base.label` naming the field, the
   OTP, a submit button. This is the shape every file in §5 is hand-rolling.
3. `disabled.tsrx` — `disabled`, and a disabled root that starts with a partial value.
4. `prefilled.tsrx` — `value="1234"` on a `length={6}` root: four filled items, two `ui-empty`.
5. `with-onchange.tsrx` / `without-onchange.tsrx` — the callback fires with the whole code; omitting
   it still types (mirrors the checkbox and checklist pairs).
6. `with-oncomplete.tsrx` — fires exactly once, on the keystroke that reaches `length`, and does not
   fire again on a subsequent no-op input.
7. `items-from-data.tsrx` — the six items written with `@for` over an index list, wrapped in a
   `<div>` because a construct cannot open directly inside a component tag's children
   (`checklist/note.md` limit 7).
8. `two-widgets.tsrx` — two OTP fields on one page; typing in one must not touch the other.
9. `armed-length.tsrx` — items delivered from an `@if` arm (6 boxes vs 8), to get a verdict on the
   arm-seed gap `checklist/note.md` leaves open.

Rows that must exist, with why:

| Row | Why |
| --- | --- |
| the field carries `autocomplete="one-time-code"`, `inputmode="numeric"`, `type="text"` | the three attributes that make the family worth shipping (§4); assert the literal strings |
| `maxlength` equals the root's `length` | the declared-length replacement for the counter; regressing it silently breaks truncation |
| every `otp.item` carries `aria-hidden="true"` | the deliberate deviation from QDS (§2 item 2); assert it so nobody removes it |
| the accessibility tree contains exactly one form control under the root | the same deviation, stated as the property that matters rather than as an attribute |
| item *k* shows `value[k]`, and carries `ui-empty` when there is no character there | the paint contract |
| typing one character fires `onChange` with the whole code, not the character | `onChange` carries the value, per convention |
| filling the last slot fires `onComplete` **once** | QDS fires it from a tracked task; ours fires from the write path, and "once" is the row that catches a double-fire |
| a paste of `"123456"` sets the whole value and fires `onComplete` | the payoff of Architecture A; drive it by setting the input's value and dispatching `input`, since a real clipboard paste is not available in the suite |
| a paste of `"12345678"` into a `length={6}` field keeps six characters | `maxlength` plus the slice |
| `{...rest}` cannot overwrite `value`, `maxlength`, or `autocomplete` on the field | our spread-first convention |
| two co-rendered widgets keep separate values | widget-instance isolation, the row T074 exists for |
| SSR + resume: the served HTML has the right `value`, `maxlength` and painted items, and the first keystroke after resume updates both the input and the items | tranche entry gate |
| a consumer `onInput` on the field runs **after** the write | the closure-composition contract |

Mode loop: rows asserting the same thing in CSR and SSR run once per mode with a literal
`render`/`renderSSR` call site each (copy the `MODES` idiom from `checkbox.browser.ts`). Explicit
SSR+resume rows for the served value and the first post-resume keystroke.

**Not tested, and why:** the fake caret and multi-slot selection are not implemented in v1 (§7), so
there is nothing to assert; a real OS clipboard paste and real SMS autofill cannot be driven from
vitest browser mode, and the `input`-event simulation above is the honest substitute — say so in the
parity table rather than implying paste is covered end to end.

---

## 10. Open questions

1. **`index` required on `otp.item`.** Recommended: yes. It is the same declaration-over-discovery
   trade checklist already made, and it is what lets the family ship with no framework work. The
   owner should know it costs `<otp.item index={0}>` at the call site rather than `<otp.item>`.
2. **Dropping the fake caret and selection highlight from v1.** Recommended: drop. It needs a
   `document`-level `selectionchange` listener this branch has no authoring surface for, it is
   ~100 lines of QDS's file, and its absence costs an animation, not a capability. Confirm — it is
   the most visible difference from QDS and from `input-otp`, and it will be the first thing a
   reviewer comparing screenshots notices.
3. **`aria-hidden="true"` on the items.** Recommended: set it, with an assert-it-is-present row.
   This is a knowing parity break from QDS and belongs in the parity table as "changed, with
   reason".
4. **Dropping `shiftPWManagers` and the auto-rendered field.** Recommended: drop both. The first is
   CSS; the second hides a duplicate input. Both are QDS features a consumer will not miss, but
   dropping the auto-field means `otp.root` with no `otp.field` renders a decoration that does
   nothing — worth a compiler-level refusal eventually, which is a separate question, not a v1 ask.
5. **Architecture A over B.** Recommended: A, following QDS and `input-otp`. §3's table and §5's
   evidence make the case. Recording it as a question anyway, because it forecloses per-slot
   `aria-label`s permanently and someone will eventually ask for them.
6. **Whether `pattern` should have a numeric default on `otp.field`.** Recommended: no default in
   v1 — the consumer writes it. QDS defaults to `^[0-9]*$`, which silently rejects alphanumeric
   codes (GitHub's recovery codes, for one). If the owner prefers QDS parity here, it is a
   one-attribute change, not a design change.
