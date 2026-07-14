# Design — B909: Event-Only Resume Tier — Bug Fixes To Parity

Fable design note for goal `crazy-qa-impl` (T109 gate). Date: 2026-07-05.

## Owner ruling (settled 2026-07-05)

Event-only resume stays exactly as designed — inline first-interaction handling before the full
runtime loads is the product. B909 is **bug fixes only**: the inline tier must behave like the
full runtime where their responsibilities overlap. No architectural change, no gating, no removal.

## Evidence base

Audit B8 (T015), all browser-proven: stale-forever sync policies (inline resumer re-evaluates the
STATIC payload per event; `__asyncResumeRuntimeStarted` set only by full resume); version-only
payload validation (structure-tampered payload silently renders NaN — S8.09); no `graph.call` on
the event-only graph (Date-state mutation → raw TypeError on first interaction — S8.11);
unstructured locator/version errors vs full resume's RESUME_LOCATOR_MISMATCH shape (S8.10);
second resumeFromPayloadDocument silently double-wires one container (S8.12). Claimed action
site: packages/web/src/resume.ts:1835 area.

## D1 — Shared semantics, not duplicated code

The root cause is a FORK: the inline tier re-implements runtime semantics and drifted. The fix
direction is sharing, not patching the copy: where feasible, the event-only path calls the same
functions the full runtime uses (decode validation, sync-policy evaluation, graph operations),
bundled into the inline script. Where inlining a shared function is impractical (size budget),
the duplicated logic gets a PARITY TEST asserting both implementations agree on the same inputs —
drift becomes a test failure, not a bug class.

## D2 — The four fixes

1. **Validated decode**: the event-only path runs the same payload structure validation as full
   resume; invalid payload → the structured MARKLESS_PAYLOAD_INVALID error path, never NaN UI.
2. **Live sync-policy evaluation**: policies evaluate against the live event-only graph state
   (which already applies writes), not the static payload snapshot. After the full runtime
   starts, the inline path must not fire at all (see D3).
3. **graph.call**: the event-only graph gains the call operation (same semantics as the full
   graph; the serializer already round-trips the built-ins involved).
4. **Structured errors + resume guard**: locator/version failures produce the same structured
   error shapes as full resume; a second resume against the same container is a guarded no-op
   with MARKLESS_RESUME_ALREADY_RESUMED (warning-tier, per audit S8.12 verdict).

## D3 — Handoff correctness

The already-known handoff flag (`__asyncResumeRuntimeStarted` class) becomes the single
authoritative gate: once the full runtime owns the page, the inline tier stops handling events
entirely. A parity test covers the handoff window (event during load → exactly one tier handles it).

## D4 — Verification

Browser-mode is mandatory for the four fixes (real Chromium, the B8 probe patterns are the
templates). Per the T003 risk note on B923 (async-settle nondeterminism): runtime receipts report
run distributions (N of M), never single runs. Compile-side artifacts unchanged — this is a
packages/web slice; the compiler emits nothing new.

## Out of scope

Sync-computed runtime consumption (separate T200 agenda item — do not entangle); B923's
instability investigation (its own card); any payload format change.
