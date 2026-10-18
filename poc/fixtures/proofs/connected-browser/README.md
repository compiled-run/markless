# Connected Browser Proof

This fixture is the browser-facing harness for the connected-browser POC. It is
not a production app shell or SSR implementation.

## Source

- [`index.html`](./index.html)
- [`src/main.ts`](./src/main.ts)

## What This Proves

The page consumes the existing `bundler-pipeline` fixture source through Vite's
raw module loading, runs the POC bundler transform, creates a connected browser
runtime page, and wires one delegated click and one delegated keydown path.

Focused tests and browser receipts use this page to prove:

- one page can load from bundler-pipeline output;
- serialized graph state is read on resume;
- component bodies do not rerun during resume;
- click and keydown dispatch through delegated runtime wiring;
- keydown applies sync policy before lazy symbol behavior;
- lazy symbols write graph state;
- DOM journal entries apply concrete DOM mutations;
- no component re-execution or VDOM substitute is used.

## Non-Goals

- No production SSR.
- No full browser resume.
- No component re-execution in the browser.
- No VDOM.
