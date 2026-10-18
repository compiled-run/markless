# Routing

Status: Draft

Markless Router maps files under top-level `pages/` to URL routes.

Supported page extensions:

```txt
.tsrx
.mdx
```

Unsupported page extensions:

```txt
.tsx
.jsx
```

Required mappings:

```txt
pages/index.tsrx          -> /
pages/index.mdx           -> / if pages/index.tsrx is absent
pages/about.tsrx          -> /about
pages/docs.mdx            -> /docs
pages/blog/[slug].tsrx    -> /blog/:slug
pages/docs/[...slug].mdx  -> /docs/**
pages/404.tsrx or .mdx    -> unmatched page requests, status 404
pages/500.tsrx or .mdx    -> unhandled page rendering errors, status 500
```

Route conflict rules are extension-neutral. `pages/docs.tsrx` and
`pages/docs.mdx` both map to `/docs`, so the router must fail with a direct
conflict error.

`api/` and `middleware/` are top-level request lifecycle folders. `pages/api/`
is not supported.

## Page request and response

A page component receives `PageProps`: `params`, `url`, `status`, and `http`.
`http` is the same `HttpContext` that API routes and middleware receive:

```txt
http.request            the incoming Request
http.url                its URL
http.locals             the object middleware wrote for this request
http.response.status    the page response status (defaults to the route status)
http.response.headers   headers added to the page response
```

Example, `pages/invoices/[id].tsrx`:

```tsrx
import type { PageProps } from '@markless/router';
import { findInvoice } from '../../src/invoices.ts';

export default function Invoice({ params, http }: PageProps<{ id: string }>) @{
	const invoice = findInvoice(params.id);
	if (!invoice) http.response.status = 404;
	const title = invoice ? `Invoice ${invoice.number}` : 'No such invoice';

	<h1>{title}</h1>
}
```

`GET /invoices/missing` answers 404 with the page's own body.

Rules:

- `http` exists only while the page renders on the server. Pages rendered in
  the browser (`mode: 'hash'` routing, client-rendered route changes) receive
  no `http`.
- The status and headers go out with the first byte. Blocking and streaming
  responses both honor writes made before that. Pages re-run their body for
  each render pass, so repeating a write that matches what was sent is
  allowed, and an identical `headers.append` is kept once. A later write that
  changes the status, status text, or headers throws
  `MARKLESS_ROUTER_RESPONSE_COMMITTED`; on a streamed page that error ends the
  stream.
- Page props are serialized into the resumable payload; the router leaves
  `http` out of that payload.
- The compiler refuses browser code that reads `http`: event handlers,
  `attach` behaviors, a `computed()` that re-runs after resume (sync or
  async), markup the browser rebuilds (`@if`, `@for`, `@try` arms), and props
  passed to a child that reads them in browser code. The diagnostic is
  `MARKLESS_SERVER_ONLY_PROP_BROWSER_READ`. To give the browser one value,
  copy it into `state()` in the page body.
- The compiler learns which prop is server-only from the router: the router
  declares `http` on the default export of every `pages/` module through the
  Markless plugin. The rule follows that declaration, not the type annotation,
  so an untyped page is checked the same way.
- The router has no prerender mode of its own. A page prerendered by Nitro's
  `prerender` option renders once at build time against Nitro's build request:
  `http` describes that request, not a visitor, and a static host does not
  replay the headers the page set. Nitro writes no file for a route that
  answers with an error status such as 404, and lists it as a failed route
  (the build stops only with `prerender.failOnError`).

The router package may integrate with an HTTP runtime through an adapter, but
shared route manifesting and request-file parsing must stay runtime-agnostic.
Renderer work must consume Markless compiled `.tsrx` artifacts; it must not
reintroduce TSX, client component re-execution, VDOM, or app-authored client/server entry ceremony.
