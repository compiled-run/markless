# Requests from native-ladder

Each item: the change I need in the contract or in a folder I do not own, and the reading I use until it lands.

## 1. Proof folder conventions (for the contract, section 2, and for native-proof-harness)

What each `packages/mobile/proofs/<nn>-<name>/` holds, as built tonight:

- `App.tsrx`: the component, `export default function App()`. It is the page: the web check copies it to `pages/index.tsrx`
  of a fresh router app, or to `pages/<route>.tsrx` when `expected.json` names a `route` (rung 10: `[fruit]`). A native
  build should take the default export as its root component.
- `expected.json`: `{ rung, name, route?, start?, steps }`. Each step is an optional action `do` (`{ tap: text }`,
  `{ type: { field, text } }` which clears the field then types, `{ relaunch: true }`, `{ wait: ms }`) and what the screen
  then shows: `visible`, `absent`, `disabled`, `order` (top to bottom) and `fields` (field accessible name to value). Every
  target is a visible text or an accessible name. The shape is `LadderRung` in `packages/mobile/proofs/ladder.ts`.
- `flow.yaml`: written from `expected.json` by `node packages/mobile/proofs/write-flows.ts`; `packages/mobile/test/ladder-flows.test.ts`
  fails when the two drift. Conventions in it: `appId: ${APP_ID}` (pass `-e APP_ID=<bundle id or package>`), the first
  command is `launchApp: { clearState: true }`, with `arguments: { route: <start> }` when the rung has a `start`; a
  relaunch is `stopApp` then `launchApp` (state kept); a wait is `extendedWaitUntil` on the step's first visible text with a
  timeout of the wait plus 10 s; selectors are escaped because Maestro reads them as regular expressions over the whole
  label. After each action, the assertions the previous screen contradicts come first, so a look taken before the action
  lands cannot pass.
- Change I need from native-proof-harness: if any of these does not run on a device, change `renderFlow` in `ladder.ts`
  (or ask me) rather than hand-editing a `flow.yaml`; the drift test will fail otherwise.

## 2. `handlerWriteStatements` should look through a parenthesized arrow body (lead, compiler)

`() => (liked = !liked)` gets no `handlerWriteStatements`, while `() => { liked = !liked; }` gets `1` (probe in
`ladder-needs.md`). The parenthesized form is the docs' style and is used by rungs 4, 5, 6, 8, 9 and 11. Until it lands I
keep the proofs as an author would write them, not rewritten to suit the fact.

## 3. Type-check the proofs (lead, root `tsconfig.json`)

`tsconfig.json` includes only `packages/*/src/**`, so `packages/mobile/proofs/**/*.tsrx` and `ladder.ts` are not
type-checked by `pnpm run typecheck`. The web check compiles every App.tsrx with the real build, which catches Markless
errors but not TypeScript ones. Request: add `packages/mobile/proofs/**/*.ts` and `packages/mobile/proofs/**/*.tsrx` to
`include`. Until then the build is the only check on them.

## 4. Where the web check lives

The check is `packages/mobile/test/ladder-web.test.ts` (in the node test project, listed in `scripts/ci/heavy-tests.json`
because it builds apps and launches Chromium). It imports `buildFixture` from `packages/router/test/support` and the
browser and server helpers from `scripts/test-utils`. The tests use `node:path` and root dev dependencies, so
`packages/mobile/package.json` needs no new dependencies for them. A second check,
`packages/mobile/test/ladder-native-reference.test.ts` (unit lane, no build), runs every rung through
`compileNativeComponent` and `createNativeRuntime` against the same `expected.json`: a rung that compiles must show what
the web build shows, and a rung that does not must be refused only with `MARKLESS_NATIVE_UNSUPPORTED`. When the native
pass learns a new construct, that rung's proof starts being checked with no change on my side.

## 5. Rung 2's web column

The contract's table marks rung 2's web column `n/a`. The web check still runs `proofs/02-styles` and checks its texts
and its counter, so the same component is proven to build and work on web; the style check itself stays Dragon's Chrome
comparison.
