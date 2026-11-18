# Forms on iOS and Android: the f-ladder

Branch `cw/native-forms` (base `cw/ui-next-blockers`). Owner rule, 2026-11-17: the web's form behaviour is already decided and is
the reference; the phone conforms and deviates only where keeping the web way is seriously impractical, with evidence. Before
this branch a `<form onSubmit>` never ran on a phone (the hosts raised taps and text edits only), and the families' `field`
parts were refused. Each rung below is one `expected.json` run in four columns: **web** (the rung built as a router app and
driven in Chromium, `ladder-web.test.ts`), **reference** (the payload walked by the reference runtime and a mirror host,
`ladder-native-reference.test.ts`), **iOS** and **Android** (the rung's Maestro flow on a simulator and an emulator).

## Rungs

| Rung    | What it proves                                                                                                                                                      | Web  | Reference | iOS         | Android     |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- | --------- | ----------- | ----------- |
| f1 (51) | two named text fields (one with a `value` attribute) and a submit button; the handler reads them with `new FormData(event.currentTarget)`, `get` and `has`          | pass | pass      | see receipt | see receipt |
| f2 (52) | the return key submits a form with one text field and no button, and in a form with a submit button clicks that button (its `onClick` runs first, as Chromium does) | pass | pass      | see receipt | see receipt |
| f3 (53) | `toggle` and `checkbox` families with `field` parts in a form: checked ones send name and value (`value` or "on"), unchecked ones nothing                           | pass | pass      | see receipt | see receipt |
| f4 (54) | a required text field and a required toggle stop the submit; the first one missing a value is focused and its message shown                                         | pass | pass      | see receipt | see receipt |
| f5 (55) | an `async` submit handler that awaits a timer promise: the form is `aria-busy` and its button `aria-disabled` until it succeeds, then until it fails into `catch`   | pass | pass      | see receipt | see receipt |
| f6 (56) | a disabled submit button sends nothing until enabled; a disabled field (also `required`) is left out of the data and of validation                                  | pass | pass      | see receipt | see receipt |

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
- **Validation.** `required` on a text field (empty text) and on a checkbox (unchecked), skipping disabled fields. The first field
  that fails stops the submit: the host moves focus to it as `focus()` does and shows Chromium's message ("Please fill out this
  field.", "Please check this box if you want to proceed.") on screen until the next action, and announces it to the screen reader.
  The messages are defined once in `@markless/serializer` (`NATIVE_VALUE_MISSING`) and carried in the payload, so hosts restate none.
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
- **A checkbox `<input>` a person ticks** (one without `aria-hidden="true"`): no host draws a checkbox yet. The families' field
  parts (clipped, `aria-hidden`, changed only by the family) work.
- **Reset buttons, `formaction`/`formmethod`/`formenctype`/`formtarget`, `new FormData(form, submitter)`, fields inside an `@if`
  arm or `@for` row of their form, a form inside a `@for` row, a bound `type` or `novalidate`.**

## What differs on a phone, visibly

- The validation message is a line the host draws, not the browser's bubble, in Chromium's English wording whatever the device
  language.
- `aria-busy` has no visible or spoken effect on either platform's screen reader, which matches most desktop screen readers.
