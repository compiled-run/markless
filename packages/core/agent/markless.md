# Markless agent playbook

Use this file as the guidance for the installed `@markless/core` version in the current project. Markless compiles `.tsrx` authoring into fine-grained DOM work; it does not use a virtual DOM or hydrate by rerunning component bodies in the browser.

## Authoring

- Import the public authoring APIs (`state`, `computed`, `element`, `shared`, and `storage`) from `@markless/core`. Keep reactive component authoring in `.tsrx` files.
- Declare mutable state with `state(...)`, derived values with `computed(...)`, and update state with ordinary assignment. Do not introduce hooks, an effects system, or a client component rerender path.
- Persist reactive state with `storage(fallback)`. It reads and writes like ordinary state — reading the binding returns the value; assigning to it persists to `localStorage` (v1: strings only) and sets a `data-<key>` attribute on `<html>` for no-flash CSS. The compiler seeds the value before the framework wakes, so first paint is correct with no double read. By default the persistence key is **derived from the binding identifier**, namespaced: `let theme = storage('light')` persists under `markless:theme` (attr `data-markless-theme`). The derived key is a stable compile-time literal, so minification never changes it — but **renaming the binding changes the key and orphans existing users' saved data**. For anything you ship to real users, **pin an explicit key**, which is used verbatim and is rename-proof: `let theme = storage('theme', 'light')` persists under `theme`. Use derived keys for local/prototype state; pin explicit keys for durable user data. (A build-time rename-drift guard that warns when a derived key disappears is a planned fast-follow — see the framework's storage-ergonomics notes.)
- Use `element()` handles and `attach` behaviors for element lifetime work. Return cleanup from an attachment when it owns resources.
- Treat event arguments as native events. Inspect `event.target`; a deferred handler must not depend on `event.currentTarget` remaining populated.
- Prefer build diagnostics over guesses. If the compiler rejects an authored shape, change that shape instead of suppressing the gate.
- In tests, wait for an observable DOM result. A graph flush is not necessarily a DOM commit barrier.

## Run the project doctor

Run the app's `doctor` package script first for environment, dependency, and production-build failures. Follow the concrete failing check, then run the consuming application's own checks; framework package tests alone do not prove that an application still works.

## Analyzer and Witness evidence

Use the public exports from `@markless/analyzer` and, for browser collection, `@markless/analyzer/playwright`. Let the application own its route/action policy, budgets, and persisted receipts. Import validators, invariant identifiers, debug-channel sentinels, schemas, and report helpers from the analyzer package rather than copying their values.

Use analyzer results beside existing application assertions until they prove equivalent coverage. Convert Witness outcomes with `createWitnessVerdict`, then combine them through the analyzer's public verdict-report helpers. A missing or incompatible evidence source is a collection failure, not a passing result.

## Inspect the live debug channel

Use a debug-enabled development build and inspect `window.__MARKLESS_DEBUG__` in the running page. For a failed interaction, call its public `explainInteraction(element, eventType)` method on the actual DOM element before inferring a cause from source. Inspect the channel's public container and lifecycle data when the explanation points to ownership or disposal.

Do not copy channel protocol strings or configuration constants into application tooling. Import analyzer-owned facts from `@markless/analyzer`, and use the public debug surface exposed by the installed runtime.

## Diagnose resume failures

1. Reproduce against a production build as well as development.
2. Run the doctor and fix version skew or build failures first.
3. Use the analyzer's public payload-wiring and locator-resolution collectors to compare served payload claims, runtime registrations, and resolved DOM targets.
4. Use the preload-integrity and request-window helpers for code that arrives too late, and the debug-strip evaluator to distinguish debug-enabled evidence from an unflagged production artifact.
5. When testing explicit resume entry points, import the public resume helpers from `@markless/core` or its documented runtime entry points. Do not invent hydration or rerender as a recovery path.
6. Preserve the smallest failing application case and its receipts, then run that application's checks after the fix.
