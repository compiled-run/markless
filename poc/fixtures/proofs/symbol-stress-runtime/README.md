# Symbol Stress Runtime Proof

This proof measures runtime behavior when one page has many distinct lazy
symbols. It is intentionally POC-scoped and does not depend on the current TSRX
fixture transform path.

The proof exercises two surfaces:

- the production compact resolver emitter from
  `packages/compiler/src/passes/symbol-resolver-module.ts`, proving the generated
  loader is table-based and not a generated `switch`;
- the existing event-only resumer source and fake DOM from
  `poc/fixtures/proofs/resumer-script`, proving startup and delegated event
  dispatch still execute distinct symbol paths when `arcade/view` contains many
  rows.

Run:

```sh
node poc/fixtures/proofs/symbol-stress-runtime/src/measure.mjs
```

The default cardinalities are `10`, `100`, `500`, and `1000` distinct symbols.
Pass custom counts with `--counts=25,250,2500`.

## Measurement Notes

This is a repeatable Node/fake-DOM proof, not a browser engine benchmark. It
measures the runtime algorithm and dynamic import path without depending on a
dev server, browser automation, or the current POC TSRX dependency chain.

The command prints JSON containing:

- compact resolver source size and no-`switch` assertion state;
- resolver module import time;
- first, middle, last, and all-symbol load times;
- resumer startup time with many page rows;
- first, middle, last, and all-button dispatch times;
- import and handler counts proving distinct symbols executed.
