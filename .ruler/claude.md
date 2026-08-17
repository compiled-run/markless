# Claude Notes

Use the `markless-implementation` skill for implementation work and `markless-spec-maintenance` for spec work; their folders carry the full workflow doctrine.
Command policy is enforced mechanically in `.claude/settings.json`.

<!-- guessless-integration:begin -->
## Structural claims about JavaScript/TypeScript

Do not assert that you have found *all* call sites, *every* reference, or that a symbol is safe to
delete, unless you can show a guessless receipt for that exact claim. `grep` cannot see re-exports,
aliased imports, `export * from`, or property access through a namespace object, so "all" derived
from a text search is a guess.

To price a completeness claim:

    npx guessless query envelope.json

where `envelope.json` is `{"inputs": [{"path": "...", "source": "..."}], "request": {...}}`. The
answer is a receipt whose `state` is one of:

- `complete` — the result set is exhaustive. This is the only state that licenses the word "all".
- `partial` — plus a named `unresolved` site for every place the engine could not classify. Say the
  answer is partial and name the gaps.
- `refused` — the question was not answered. It supports no claim at all.

If you have no receipt, say which sites you checked instead of saying "all". A qualified answer is
always acceptable; an unpriced "all" is not.
<!-- guessless-integration:end -->
