# U746 — a torn-down container is retired, not re-resumed

## The measurement

`pnpm exec vitest run --project ui taglist`, pilot tip:

- before: 95 passed, **11 unhandled rejections**, all
  `RuntimeResumeError: Resume locator c6:h3 expected <input> at DOM order index 11
  but found <div>.` (one variant `c5:h3 ... index 13`)
- after: 95 passed, **0 unhandled rejections**, two consecutive runs

Every one of the 11 carried the same stack:

```
runtimeResumeError            packages/web/src/inline/resume-errors.ts
mismatchedElementLocatorError packages/web/src/inline/resume-errors.ts
materializeDomLocators        packages/web/src/resume-locators.ts:33
createResumeRuntime           packages/web/src/resume.ts:42
startDecodedResume            packages/web/src/payload-resume.ts:107
marklessFullResumeHandoff     (virtual resume module for capped.tsrx)
marklessResumeContainerEvent  (same)
```

## What was actually happening

Not a dispatch that ran late — a **whole second resume boot** that ran late.

The inline resumer forwards each gesture as
`loaded.then((module) => module.resumeContainerEvent(input))`. The generated
`resumeContainerEvent` for this scenario is the plain variant: it calls
`resumeFromPayloadDocument({ document: root, root, loadSymbol })` and then
`runtime.dispatch(...)`. It holds no runtime of its own — it relies on
`getAlreadyResumedPayload(root)` handing back the runtime the first gesture
booted.

The taglist cap row types five keystrokes and, since U745, finishes its last
assertion about four seconds earlier than it used to. `afterEach` runs
`cleanup()` → `destroyContainer()` → `disposeResumedPayload(root)`, which
deleted the root's registry entry. The keystroke chains still queued behind the
row then called `resumeFromPayloadDocument` again, missed the registry, and
**re-booted resume from the served payload**.

That second boot is guaranteed to refuse. `materializeDomLocators` reads
`root.__marklessCensus`, which the first runtime keeps in step with its own DOM
edits (`spliceCensus`). By teardown the cap had already replaced the field with
a div, so census index 11 held a `<div>` while the served `view.locators` still
described the `<input>` that was there at server-render time — locator mismatch,
thrown out of an event listener's return value, i.e. unhandled. Eleven callers
awaited the one shared `__mStart` promise, so one refusal surfaced eleven times.

Adding a four-second settle to the row also took the count to zero, because with
the settle the queued boots ran while the registry entry was still there. That
was the measurement, not the fix.

## The fix

`packages/web/src/payload-resume-registry.ts` keeps a disposed container's
result in a second WeakMap instead of dropping it, and exposes
`getRetiredResumedPayload(root)`. A root is **retired** when it has been
disposed *and* `root.isConnected === false` — disposed and gone from the
document. A retired root answers a resume with the disposed result and a no-op
`dispatch`, so a gesture that arrives after teardown resolves instead of
re-booting.

The two conditions are both load-bearing:

- disposed alone is the documented dispose-then-resume-again case
  (`MARKLESS_RESUME_ALREADY_RESUMED` suggests exactly that), and still re-boots.
- `isConnected !== false` also leaves the Node-side structural element surface
  (`ResumeDomElement`, no `isConnected`) on the old path untouched.

Checked at the three entries that boot a resume:
`resumeFromPayloadDocumentWith` (`payload-document-common.ts`),
`resumeFromPayloadScriptsImpl` and `resumeFromPrerenderRecordsImpl`
(`payload-resume.ts`). `setResumedPayload` clears the retired entry, so a
re-attached, re-resumed root is live again.

No harness change was needed: `cleanup()` already calls `disposeResumedPayload`,
and that call is now what retires the container. No polling, no settle, no sleep.

## Cost and caveats

- Retention: a disposed container's result is now held weakly by its root rather
  than dropped at dispose. `disposeResumedPayload` has exactly one caller in the
  repo (the vitest-browser harness), and there the root is dropped immediately
  after, so the entry dies with it. A consumer that disposes a container and
  leaves it attached is unaffected (not retired, and it re-boots as before).
- No regression witness was added: `packages/web/test/**` was outside this
  unit's file contract. The evidence is the ui lane's rejection count, twice.

## Results

- `pnpm typecheck` clean
- `pnpm exec vitest run --project node packages/web` — 96 files, 653 passed
- `pnpm exec vitest run --project ui taglist` — 95 passed, 0 unhandled (was 11)
