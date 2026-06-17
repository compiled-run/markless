# Resumer Script Proof

This proof isolates the SSR inline resumer bootstrap. It is intentionally smaller
than the production runtime:

- static SSR emits no resumer;
- event-only SSR emits one container-scoped inline bootstrap;
- event metadata lives in `arcade/view`, not per-node event attributes;
- startup installs a delegated listener and imports no app or symbol module;
- the click symbol imports only after interaction;
- size is measured with Rolldown/OXC minification plus gzip.

This proof does not implement CSR. CSR still runs component bodies through
`render()` to create DOM and a live container; the inline bootstrap exists for
SSR because the DOM already exists and browser startup must not run component
bodies.

Run:

```sh
node poc/fixtures/proofs/resumer-script/src/verify.mjs
node poc/fixtures/proofs/resumer-script/src/size-report.mjs
pnpm exec witness resumer-script --json
```
