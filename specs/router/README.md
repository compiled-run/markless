# Arcade Router Specs

Status: Draft

Arcade Router is the routing layer migrated into Arcade. The source proof used a
standalone router TypeScript plugin package. Arcade Router keeps the
file-routing and typed-route ideas, but its authoring contract is Arcade-first:

- UI route modules are `.tsrx` or `.mdx`.
- `.tsx` and `.jsx` route modules are not supported.
- Public imports use Arcade names: `@arcade/router` or curated `arcade/router`
  re-exports.
- The router TypeScript plugin lives inside `packages/router`.
- Top-level `api/`, `middleware/`, `pages/`, `document.tsrx`, and `public/`
  remain the app shape.
- MDX is supported as a route file type. Importing and using TSRX components
  inside MDX is explicitly future work.

Read order:

1. [`routing.md`](./routing.md)
2. [`cli.md`](./cli.md)
3. [`typed-routing.md`](./typed-routing.md)

The first migration slice intentionally ports the route manifest, route type
generation, request-file parsing, CLI starter surface, and router package
boundaries. Renderer adapter code from the source proof is not copied as Arcade
behavior because Arcade SSR/resume must stay artifact-first and TSRX-only.
