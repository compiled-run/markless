---
name: guessless
description: Prove structural claims about JavaScript/TypeScript with a guessless receipt. Use when about to say "all call sites", "every reference", "nothing else imports this", or "safe to delete"; when renaming or deleting an exported symbol; when a claim gate has blocked a turn asking for a receipt; or when auditing whether a change is complete. Do not use for non-JS/TS languages.
---

# Proving a structural claim with guessless

Guessless answers reference/definition/reachability questions about JavaScript and TypeScript and
returns a signed receipt that is either exhaustive or explicitly incomplete. It never returns a bare
list, so every answer is either usable as proof or self-labelled as a gap.

## 1. Build the query envelope

Guessless is hermetic: it reads sources out of the envelope, not off disk. That is what makes a
receipt reproducible later.

```json
{
  "inputs": [{ "path": "src/storage.ts", "source": "<file contents>" }],
  "request": { "kind": "exportedNames", "file": "src/storage.ts" }
}
```

Include every file that could plausibly reference the symbol. A file you leave out is not a file
guessless says is clean — it is a file guessless never saw.

Request kinds:

| Kind | Fields | Answers |
| --- | --- | --- |
| `referencesOf` | `target` (symbol anchor) | Every reference to a symbol |
| `definitionOf` | `target` | Where a symbol is defined |
| `readsOf` / `writesOf` | `target` | Reads or writes of a binding |
| `capturesOf` | `target` | Closures capturing a binding |
| `reachableFrom` / `reaches` | `target` | Call-graph reachability |
| `exportedNames` | `file` | The module's export surface |
| `resolveBinding` | `file`, `name`, `space`, optional `scope` | What a name resolves to |

Get a symbol anchor from an `exportedNames` or `definitionOf` receipt and pass it back verbatim —
anchors are fingerprinted, so hand-editing one invalidates it.

## 2. Run it

```bash
node /Users/jacksm5pro/dev/open-source/guessless/packages/cli/dist/cli.js query envelope.json > answer.receipt.json
```

## 3. Read the receipt honestly

- `"state": "complete"` — say "all", and paste or cite the receipt.
- `"state": "partial"` — every place the engine could not classify is named in `unresolved`. Say the
  answer is partial, give the count, and name the gaps. Do not round a partial up to "all".
- `"state": "refused"` — `reason` and `detail` say why. Do not claim anything; fix the cause (often a
  non-JS/TS file) and re-query.

## 4. Make it checkable

Write the receipt beside a reproduction bundle so CI can re-run it:

```
answer.receipt.json         the receipt
answer.reproduction.json    {"inputs": [...same inputs...], "receipt": {...that receipt...}}
```

Then `node /Users/jacksm5pro/dev/open-source/guessless/scripts/reproduce-check.mjs <dir>` re-runs it and fails if a single byte of
the receipt was altered.

## Boundaries

JavaScript, TypeScript, JSX and TSX only. Guessless has no opinion about other languages, about
runtime behaviour, or about whether a change is *correct* — only about whether a structural answer
is complete.

## Markless-specific boundary

`.tsrx` sources are refused by design (`unsupported-language`); this skill applies to the `.ts` toolchain code — compiler, serializer, router, typescript-plugin, and web packages. For `.tsrx` questions, structural receipts are unavailable; say so rather than guessing.
