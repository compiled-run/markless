# Real screen reader suites

What NVDA and VoiceOver actually say about a `@markless/ui` family, read off a
served page.

`../sr/` proves the same expectations against a screen reader written in
JavaScript, which runs anywhere and needs nothing installed. This folder is the
other half: the same expectations, spoken by the readers real users use. It
exists because a reader written in JavaScript agrees with the accessibility tree
by construction, and NVDA and VoiceOver do not — they have their own idea of
what a role is called, when a state is worth mentioning, and what a change is
worth interrupting for.

## What is shared, and what is not

| shared with `../sr/`                                     | decided here                    |
| -------------------------------------------------------- | ------------------------------- |
| `ScreenReaderDriver`, `Conveys`, `missingFacts`, `readUntil` | each reader's words for a fact  |
| the facts each announcement has to convey                  | how a phrase splits into facts  |

Nothing in this folder spells an expected phrase. `checkbox-transcript.ts` names
facts — role, accessible name, state — as `Conveys` values from
`../sr/driver.ts`, and `vocabularies.ts` supplies each reader's word for each
fact. That is why one transcript function runs against both readers, and why a
third reader is a driver plus two lines rather than a copied suite.

## The page they read

`apps/sr-gallery` — every shipped family's Basic scenario, one section each, on
anchors a reader can be sent to (`/#checkbox`, `/#toggle`, …). It is consumer
code: it imports through the `@markless/ui` barrel and carries no test hooks.
The one affordance for a driver is `data-gallery-ready` on `<html>`, set after
the mount resolves, so a reader waits on the DOM rather than on a timer.

```sh
node apps/sr-gallery/scripts/boot-check.ts   # serve it and check every family rendered
pnpm test:sr-real -- --project=nvda          # Windows, NVDA installed
pnpm test:sr-real -- --project=voiceover     # macOS, automation permission granted
pnpm typecheck:sr-real
```

macOS needs a one-time `npx @guidepup/setup` before VoiceOver can be driven from
a script. CI does the same thing through `guidepup/setup-action`.

## Known blocker: the gallery does not render yet

**These suites cannot pass today**, and the reason is not in this folder.

An app that uses member tags — `<checkbox.root>`, the entire authoring surface
of `@markless/ui` — loses exports through the compiler's public-render pass:

- **Serving** (`pnpm --dir apps/sr-gallery dev`) answers 200, then the browser
  reports
  `SyntaxError: The requested module '…/packages/headless/components/src/checkbox/checkbox.tsrx?import' does not provide an export named 'CheckboxDescription'`,
  and nothing mounts.
- **Building** (`pnpm --dir apps/sr-gallery build`) fails in the client
  environment with `MISSING_EXPORT`, including for the app's own component:
  `"Gallery" is not exported by "src/Gallery.tsrx"`.

It is not about crossing a package boundary. A component in the app's own
`src/` that uses a member tag over a namespace imported from a sibling `.tsrx`
in the same folder drops its own export the same way, so the trigger is the
member tag, not `@markless/ui`.

Until that is fixed the two real-reader jobs fall back to
`scripts/ci/screen-reader-smoke.mjs`, which proves the runner can drive the
reader — the expensive, fragile half that no developer machine can reproduce.
The workflow decides between them from the boot check's outcome, so the day the
compiler renders member tags the lanes start reading the real page with no
workflow edit.

## Two vocabularies are part-verified

`../sr/README.md` records three words per reader, taken from the w3c/aria-at
plans: the role, "not checked", and the indeterminate state. The other four
slots in `Vocabulary` are each reader's documented wording and have **never been
observed against our markup**, because neither reader can be driven on a
developer machine without an install and, on macOS, a permission grant.

So `checkbox-transcript.ts` asserts only on the sourced words, and covers two
steps of the aria-at checkbox plan: reading an unchecked box, and reading it
after Space. When a lane fails, `readUntil` throws with the whole transcript —
that transcript is the evidence for correcting `vocabularies.ts` and widening
the suite to the indeterminate, disabled and invalid states the virtual lane
already covers.

Never bend an assertion to fit a phrase. Where aria-at and a real reader
disagree, that disagreement is the finding.
