# Handler fallback proofs

Proof only, for `docs/goals/native-targets-api/handler-boundary.md`. Each folder is a harness rung whose `App.tsrx` copies
one kind of handler the native build cannot lower to data, taken from the repo's own code (the file it mirrors is named
in the component). `expected.json` sets `scriptHandlers`, so those handlers run in a JavaScript engine the host starts on
first use. Not part of the ladder: `proofs/ladder.ts` does not list these folders, and nothing in CI runs them.

```sh
pnpm --filter @markless/mobile proof proofs-handlers/h0-mixed proofs-handlers/h1-timer ...
```
