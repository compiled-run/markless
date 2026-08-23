# modal

Six parts, QDS's `index.ts` exactly: `root`, `trigger`, `content`, `title`, `description`, `close`.

The accessibility approach is Base UI's - `role="dialog"` on an ordinary element, not the native
`<dialog>` and not the top layer - and the mechanism is the overlay primitive in
`@markless/web/fns/overlay`. `modal.content` is the overlaid item: the trigger calls
`openOverlay(surface, { kind: 'modal', ... })` and the close button calls `closeOverlay(surface)`.
The family implements none of the stack, Escape, focus containment, focus restoration, background
inertness, `aria-modal` or the scroll lock; all of that is the primitive's, and duplicating any of it
family-side is the thing the primitive exists to prevent.

## State of the suite

`pnpm exec vp test --project ui packages/headless/components/src/modal/modal.browser.ts`
**12 passed, 12 failed.** Every failure traces to one of the three findings below, none of which is
fixable inside this family's files.

What passes: the trigger opens and the close button closes, in CSR and after an SSR resume; the
background is marked `inert` and `aria-hidden` and unmarked again; `aria-modal` appears only while
the primitive is enforcing modality; the scroll lock takes and releases; focus lands in the surface
on open and returns to the invoker on close, after a resume as well as on a client render; focus
cannot be moved to the page behind; an outside press is refused; the surface is the same node across
open and close; `onChange` fires once with the next value, and each widget reaches only its own
handler.

## Finding 1 - `@markless/ui` cannot resolve `@markless/web`

`packages/headless/components/package.json` lists `@markless/core` and nothing else, so
`import { openOverlay } from '@markless/web/fns/overlay'` does not resolve
(`MODULE_NOT_FOUND`, measured with `createRequire` from this folder). The measurements above were
taken with a hand-made `node_modules/@markless/web` link, which was removed afterwards; the family
does not build without the dependency being declared.

That declaration is also a decision, not only a line: it is the first time the headless component
library would depend on the web runtime package, which makes `@markless/ui` web-only.

## Finding 2 - a naming part nested inside `modal.content` mints an id the reference does not spell

`modal.content` reads `aria-labelledby={modal.titleEl}`; `modal.title` binds the same handle. The
reference renders as

    mx-c0-shared-...-modalState-element-titleEl

and the `<h2>` that binds it renders as

    mx-c0-p2-shared-...-modalState-element-titleEl

The `p2-` segment appears only on the element, never on the reference, so the dialog has no
accessible name. The same mismatch appears on `descriptionEl`. Collapsible does not hit it because
its two parts sit at the same projection depth (`trigger` and `content` are both children of
`root`); modal's naming parts are children of `content`, which is itself a child of `root`, and that
extra level is what the element's spelling picks up and the reference's does not. Rows: `CSR/SSR: the
starter renders a closed dialog wired to its trigger`, `CSR/SSR: a described dialog points at its
description`, `SSR: the served dialog is closed, attached and already named`.

There is no family-side move here. Lifting `title` and `description` out of `content` would leave
QDS's part list and the HTML the APG asks for.

## Finding 3 - the primitive's `onDismiss` cannot be routed from a handler

Escape has to flip `open` back, which means handing `openOverlay` a callback that writes instance
state. Three spellings were measured, all inside `ModalTrigger`'s `onClick`:

- a closure written in the handler - `onDismiss: () => { modal.setOpen(false); }` - refused at
  compile time with `MARKLESS_SYMBOL_MODULE_UNRESOLVED_GRAPH_REFERENCE`;
- a function member read into a local first, exactly as that diagnostic prescribes -
  `const dismissed = modal.dismissed;` - compiles, then throws `ReferenceError: modal is not
  defined` on the first click, so the emitted handler module still names the instance;
- the same read left in place as an object-property value - `onDismiss: modal.dismissed` - same
  `ReferenceError`;
- a factory method returning the closure - `onDismiss: modal.dismissRoute()` - compiles and throws
  nothing, and no handler runs at all: every gesture row goes dead.

So the family ships without `onDismiss`. The primitive still releases the surface on Escape - the
background is unmarked and focus goes back to the trigger - but `open` stays true and the surface
stays showing, which is not a modal. Rows: `CSR/SSR: Escape closes the dialog and hands focus back`,
`CSR: Escape closes only the dialog on top`. Those two rows then leave a surface open in the
primitive's page-wide stack, which is what fails the four rows after them.

## Deviations from QDS, recorded

**`closeOnOutsideClick` is not shipped.** QDS's modal takes it and defaults it to `true`. Our
primitive answers an outside press on a `modal` surface by ignoring it - only a `disclosure` surface
light-dismisses - and it is a document-level decision, so reimplementing the two-phase press guard
family-side would be exactly the duplication the primitive exists to prevent. The pinning row is
`CSR: pressing the page behind an open dialog does not close it`. A modal that dismisses on an
outside press needs the option on the primitive, not a prop on the family.

**`alert` / `role="alertdialog"` is not shipped.** QDS has no such prop, and the standing order is
that QDS is the API.

**`level` is not shipped.** QDS threads it only to gate a scroll-lock release; the primitive counts
its own locks and its background marks, so there is nothing left to gate.

**The naming references are unconditional.** QDS emits `aria-labelledby` only when a title mounted.
`aria-labelledby={titled ? titleEl : undefined}` is refused by the compiler
(`MARKLESS_ELEMENT_HANDLE_IDREF_COMPOSITE`: an IDREF position takes a bare `element()` handle and
nothing else), so the choice is "always" or "never", and "never" would lose the dialog's name
entirely. A reference that resolves to nothing is skipped by the accessible-name computation, so the
cost is untidy markup rather than a wrong announcement. Pinned by `CSR/SSR: a dialog with no naming
parts carries references that resolve to nothing`, which is written to fail the day the condition
becomes expressible.

## The screen-reader lane

`modal.sr.ts` asserts the dialog by name rather than by role: the shared `Vocabulary` in
`test-support/driver.ts` has no word for a dialog, and `Conveys.role` is `keyof Vocabulary`. Adding
the slot touches `driver.ts` and `virtual-driver.ts`, which are outside this family's folder. The
`roleDialog` assertion aria-at makes priority 1 is therefore not covered yet; everything else in
Sequences A-F is written against names and negative proofs.
