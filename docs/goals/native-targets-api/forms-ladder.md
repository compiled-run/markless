# Forms on iOS and Android: the f-ladder

Branch `cw/native-forms` (base `cw/ui-next-blockers`). Owner rule, 2026-11-17: the web's form behaviour is already decided and is
the reference; the phone conforms and deviates only where keeping the web way is seriously impractical, with evidence. Before
this branch a `<form onSubmit>` never ran on a phone (the hosts raised taps and text edits only), and the families' `field`
parts were refused. Each rung below is one `expected.json` run in four columns: **web** (the rung built as a router app and
driven in Chromium, `ladder-web.test.ts`), **reference** (the payload walked by the reference runtime and a mirror host,
`ladder-native-reference.test.ts`), **iOS** and **Android** (the rung's Maestro flow on a simulator and an emulator).

## Rungs

| Rung    | What it proves                                                                                                                                                                          | Web  | Reference | iOS  | Android |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- | --------- | ---- | ------- |
| f1 (51) | two named text fields (one with a `value` attribute) and a submit button; the handler reads them with `new FormData(event.currentTarget)`, `get` and `has`                              | pass | pass      | pass | pass    |
| f2 (52) | the return key submits a form with one text field and no button, and in a form with a submit button clicks that button (its `onClick` runs first, as Chromium does)                     | pass | pass      | pass | pass    |
| f3 (53) | `toggle` and `checkbox` families with `field` parts in a form: checked ones send name and value (`value` or "on"), unchecked ones nothing                                               | pass | pass      | pass | pass    |
| f4 (54) | a required text field and a required toggle stop the submit; the first one missing a value is focused and its message shown                                                             | pass | pass      | pass | pass    |
| f5 (55) | an `async` submit handler that awaits a timer promise: the form is `aria-busy` and its button `aria-disabled` until it succeeds, then until it fails into `catch`                       | pass | pass      | pass | pass    |
| f6 (56) | a disabled submit button sends nothing until enabled; a disabled field (also `required`) is left out of the data and of validation                                                      | pass | pass      | pass | pass    |
| f7 (57) | a checkbox and a radio group a person ticks: `onChange` reads `event.currentTarget.checked`, one radio per group, a required checked box unticked stops the submit, and their form data | pass | pass      | pass | pass    |

Receipt: one harness run of the fourteen core rungs, f1 to f7, u1 to u5 and u11 to u14 on simulator `markless-forms` (iPhone 17,
iOS 27.2) and AVD `markless_forms` (API 36, port 5600): 30 of 30 on each, `proof passed on iOS and Android`
(`receipts/2026-11-18-forms-{ios,android}-30-rungs.json`, `receipts/2026-11-18-forms-verdict.txt`); screenshots under
`packages/mobile/proofs/<rung>/screenshots/{ios,android}/`. Nothing in the device columns is a test double.

## What the phone does, and where it comes from on the web

- **Which presses submit.** A `<button>` in a form whose `type` is absent or `submit`. A press runs its own `onClick` ops, then
  submits (the web's activation behaviour). The return key in a single-line field (`<input>` with no `type`, or `text`, `search`,
  `tel`) clicks the form's first submit button unless it is disabled; with no submit button it submits only a form with exactly one
  such field (HTML's implicit submission). Hosts raise the return key as the new `enter` event.
- **The order a submit runs in**, in the runtime as the `submit` op: a disabled submitter does nothing; then validation, unless the
  form has `novalidate` or the submitter `formnovalidate`; then a submission carrying the same entries from the same button as one
  still running is dropped (`@markless/web`'s `submit-hold.ts` guard); then the form's `onSubmit` handler.
- **What the handler receives.** `event.currentTarget` and `event.target` are the form. `new FormData(form)` is the form's entry
  list built as the web builds it, in tree order: a disabled field or one with no `name` is left out, a checkbox only when checked
  (value: its `value` attribute or "on"), a hidden input sends its `value`, a text field its text now. `get`, `getAll` and `has`
  have FormData's meaning. A FormData kept past an `await` keeps the entries it had when built.
- **`preventDefault()`.** Required on every path before the handler's first `await` or return, or the build refuses by name: the
  web would then send the form to its action and load a new page.
- **Ticking.** A checkbox or radio button is pressed as on the web: the press ticks it (a radio button also unchecks the rest of its
  group, the same `name` in the same form or in none), then its `onClick` runs, then, when the tick changed it, its `onInput` and
  `onChange`. `event.currentTarget.checked` and `.value` read it; a `checked` binding sets it when its value changes. iOS draws a
  button with the platform's checkbox and radio symbols, Android its `CheckBox` and `RadioButton`, each showing the runtime's state.
- **Validation.** `required` on a text field (empty text), a checkbox (unchecked) and a radio group (none checked), skipping disabled
  fields. The first field that fails stops the submit: the host moves focus to it as `focus()` does and shows the web's message on
  screen until the next action, and announces it to the screen reader. The message is in the device's language, as a browser on the
  device shows it: `@markless/serializer`'s `NATIVE_VALUE_MISSING_BY_LOCALE` holds Chromium's own text in each of the 55 languages
  Chromium ships, read from Chromium by `packages/mobile/test/write-validation-messages.ts`, and travels in the payload, so hosts
  restate none; `nativeLocale` picks the device's first language Chromium has (exact, then without its script, then by language,
  else English).
- **An async submit** (`await` of a promise the build can see through: `new Promise` whose executor sets a `setTimeout` and calls
  `resolve`/`reject`). The statements after the `await` become an `after` op: the host schedules it from a `timer` journal entry,
  and every value they read that can change is captured when the timer is set, as a closure keeps it on the web. While a run waits,
  the runtime sets `aria-busy="true"` on the form and `aria-disabled="true"` on the button that sent it (not when an author wrote
  `aria-disabled` on a submit button), the marks `@markless/web` sets; both hosts report `aria-disabled` as not enabled to the
  screen reader while a press still reaches the button, as on the web. `try`/`catch`/`finally` around the `await` lower; a
  rejection goes to the `catch`.

## Refused by name, and why keeping the web way was impractical there

- **A form with no `onSubmit`, or whose handler does not cancel on every path.** The web sends it to its `action` and loads the
  answer (or, for a POST to the app's API route, `@markless/web` sends it in place with `fetch`). A phone app has no server and no
  page to load; matching it would mean a server URL the native build does not have.
- **`fetch` in a handler, and a failure no `catch` handles.** The only thing a native handler can await today is a timer. A save
  to the app's API route needs the server above. An uncaught failure shows in the nearest `@catch` on the web, and `@try` has no
  native lowering yet.
- **`await` inside an `if`, a loop, a called function or an expression** (only at the top of the handler or of its `try`), and a
  `return` from a `try` with a `finally`. These are lowering gaps, not differences from the web.
- **Field types and constraints no host checks**: `<input type="email">`, `url`, `number`, `password` (no masking) and the rest,
  and `pattern`, `minlength`, `maxlength`, `min`, `max`, `step`, `multiple`, `readonly`, `form`. The web checks these before a
  submit; a host that ignored them would submit what the web refuses.
- **Reset buttons, `formaction`/`formmethod`/`formenctype`/`formtarget`, `new FormData(form, submitter)`, fields inside an `@if`
  arm or `@for` row of their form, a form inside a `@for` row, a bound `type` or `novalidate`.**

## What differs on a phone, visibly

- The validation message is a line the host draws, not the browser's bubble. Its wording is Chromium's in every language, including
  on an iPhone, whose Safari words some messages differently.
- A checkbox or radio button with `aria-hidden="true"` (the families' field parts, which the web hides with an inline style) draws
  nothing on a phone: the hosts' stacking layout has no CSS, and a drawn one would be a second box a person could tick out of step
  with the family. With Dragon laying out inline styles this can follow the CSS instead.
- Messages add about 8 KB to a payload with a form (55 languages, carried once).
- `aria-busy` has no visible or spoken effect on either platform's screen reader, which matches most desktop screen readers.
