# Qualifying an arm-filed element() handle, and dropping the page-wide fallback

The follow-up U656 left open. Two changes that only make sense together:

1. A handle bound inside a flippable `@if` arm is now registered under the
   rendered widget's own key, the same key composition already gives every
   handle outside the arms.
2. `marklessInstanceScopedElementHandle` no longer falls back to the id exactly
   as compiled when the reading handler's instance IS named.

## The arm registration was a live defect, not just a fallback dependency

U656 measured the fallback as reachable by exactly one thing — `handle-in-arm`,
4 rows — and left it in place. What that framing missed is that the fallback was
not *serving* those rows so much as *hiding* a bug that a second instance makes
fatal.

Measured on the tip as it stood (fallback kept, arm registration unqualified),
with a new page rendering two `Widget`s that each open an arm of their own:

    RuntimeResumeError: Element handle …#widgetState/element:panelEl is
    registered by 2 rendered widgets on this page, and the reading handler
    named no instance.

Both widgets filed the compiled id, the reader's qualified key missed both, the
fallback asked the compiled id, and the registry did the right thing and
refused. A one-instance page never sees it; the moment a family with an
arm-bound handle is used twice on a page, every probe throws. That page is now a
permanent row, `two-widgets-page.tsrx`, CSR and SSR.

## Where the instance comes from

`packages/web/src/resume-branches.ts`, `materializeBranchArmRecords`. The branch
record's own id carries the instance path (`c0:branch-site:0` on the witness
page — probed directly, not assumed), which is the same path the reading symbol
is scoped by, so both sides resolve through the widget registry to the same
rendered root. `composedInstancePath` carries it too but only when the branch has
composed graph props; the id always does, so the id is what is read.

## Why the qualification is applied in the roster, not in the branch module

`resume-branches.ts` is one of the entries the closure wall governs, and its
static closure sits 48 bytes under the 20,983 limit after this change. It cannot
statically import `fns/instance-scope.ts` (42,937 bytes before its own imports)
to reach `marklessWidgetHandleId`, and it cannot statically import
`resume-arm-records.ts` either. So the branch module hands the roster two things it already holds — the
branch id and the page graph — and the roster does the qualifying:

- `resume-locators.ts` gains `installElementHandleQualifier`, and `register`
  takes an optional owner record id. Given one, it mints the qualified id and
  files the same three keys it has always filed (qualified, compiled, name), so
  unfiling on `deleteHost` takes the new key with it for free.
- `fns/instance-scope.ts` installs the qualifier inside
  `installMarklessComposedArmRecords`, the pay-per-use call the bundler already
  emits for pages with component edges — the same gate the widget registry
  itself rides. A page that composes nothing has no instance to name and files
  the id exactly as compiled, as before.

The branch module's own cost is one destructure, one comment line and two extra
arguments (+88 bytes of closure); three `input.` prefixes were dropped to pay for
part of it. No new import edge, so closure MEMBERSHIP is unchanged.

## What the fallback removal keeps

`scoped === handleIdOrName` is the whole surviving page-space case, and it is
not a fallback: it is the answer for an id no rendered widget owns. Three kinds
reach it — a bare handle name, a component-local handle id (one element per key
already), and a page-scoped `shared()` graph, which is page space by design.
A part standing outside every instance of the family qualifies to nothing (U656)
and lands here too, which is why the loose-knob row of `enclosing-family-read`
still reads its own family.

What is gone is the case U656 described as safe: a reader whose instance IS
named asking the compiled id after its own key missed. That was the merge path.

## Verification

Every command run in the worktree.

- `pnpm typecheck` — clean.
- browser, the ten pinned witnesses: 15 files, 102 passed. `handle-in-arm` is
  now 10 rows (the 8 that existed plus the two-widget page).
- `pnpm exec vp test packages/web/test` — 93 files, 634 passed. That includes
  `event-only-resume-closure.test.ts`: resume-branches.ts + resume-anchor-census.ts
  = 20,935 of 20,983.
- ui menu/tour/popover/tabs/accordion/togglegroup — 306 passed, 2 expected fail.
- `pnpm exec vp lint --deny-warnings` — 0 warnings, 0 errors.
- `packages/compiler/test/enclosing-registration` — 2 passed (the byte-equality
  guard U656 left).

Served bytes are unchanged: nothing in the compiler, serializer, bundler or the
payload emitters was touched, and no record shape gained a field. The change is
entirely in how browser resume reads the records it already receives.

## Falsification, both directions

- Arm registration reverted, fallback removed: `handle-in-arm` 6 of 10 fail,
  `expected 'unbound' to be 'bound'`.
- Arm registration reverted, fallback restored (the tip as it stood): the 8
  one-instance rows pass and both two-widget rows fail with the ambiguous-handle
  refusal quoted above.
- Fallback restored, arm registration kept: the unit pin
  `unfiling the arm host takes the qualified key with it` fails — the reader
  answers the OTHER instance's element after its own binding is unfiled.

The unit pins live in `packages/web/test/arm-registration-qualified/`.
