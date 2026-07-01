# Markless Router Specs

Status: Draft

Markless Router is the routing layer migrated into Markless. The source proof used a
standalone router TypeScript plugin package. Markless Router keeps the
file-routing and typed-route ideas, but its authoring contract is Markless-first:

- UI route modules are `.tsrx` or `.mdx`.
- `.tsx` and `.jsx` route modules are not supported.
- Public imports use Markless names: `@markless/router` or curated `@markless/core/router`
  re-exports.
- The router TypeScript plugin lives inside `packages/router`.
- Top-level `api/`, `middleware/`, `pages/`, `document.tsrx`, and `public/`
  remain the app shape.
- MDX is supported as a route file type. MDX routes may default-import `.tsrx`
  component artifacts and render them as MDX JSX elements. Router MDX lowers
  component props from Satteri MDX/ESTree data for string attributes, boolean
  shorthand attributes, and literal-safe expression attributes. Nested static
  MDX children are passed through the TSRX `children` prop as escaped rendered
  HTML.
- Markless Router MDX does not execute arbitrary MDX JavaScript during browser
  resume. Spread attributes, non-literal expression attributes, non-literal
  inline MDX expressions, and non-`.tsrx` component imports are unsupported
  until the router has an explicit MDX scope/payload contract for preserving
  those semantics without hydration or VDOM behavior.

Read order:

1. [`routing.md`](./routing.md)
2. [`cli.md`](./cli.md)
3. [`typed-routing.md`](./typed-routing.md)

The first migration slice intentionally ports the route manifest, route type
generation, request-file parsing, CLI starter surface, and router package
boundaries. Renderer adapter code from the source proof is not copied as Markless
behavior because Markless SSR/resume must stay artifact-first and TSRX-only.
